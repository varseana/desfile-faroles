// Motor del desfile de faroles.
// Un unico canvas 2D con personajes (faroleros) que caminan de forma fluida
// sosteniendo un farol-burbuja; dentro de cada burbuja va una imagen del admin.
//
// El movimiento usa "steering behaviors" (Reynolds / Nature of Code):
//   posicion + velocidad + aceleracion, con maxSpeed y maxForce,
//   comportamiento "wander" (deambular suave) y "containment" (giro
//   anticipado en los bordes). Asi caminan naturalmente y nunca se salen.

export type LanternInput = {
  id: string
  url: string // miniatura comprimida para el sprite
  hdUrl?: string | null // version HD para el hover grande
  username?: string | null
}

// Info del farol bajo el cursor (para el preview grande al hacer hover).
export type HoverInfo = { id: string; username: string | null; hdUrl: string }

// Banda de "plaza" (fraccion de la altura) donde caminan los pies.
// Corresponde al piso de mosaico de la imagen de fondo.
const BAND_TOP_F = 0.76
const BAND_BOTTOM_F = 0.985

const RIM_COLORS = ['#0b4da2', '#ce1126', '#f4f4f4', '#ffb703']
const HAT_COLORS = ['#0b4da2', '#ce1126', '#243b6b']

// --- Sprites de los faroleros --------------------------------------------
// Cada variante (niño / niña) tiene 3 partes (torso + 2 piernas) que comparten
// un mismo lienzo y estan pre-registradas: se apilan en la misma posicion y
// calzan solas. Los puntos clave van en fraccion (0..1) del lienzo de esa
// variante (medidos sobre el PNG). El niño y la niña usan lienzos distintos.
type SpriteMeta = {
  key: string
  w: number
  h: number
  files: { torso: string; legR: string; legL: string }
  crotch: { x: number; y: number } // entrepierna: pivote de giro de las piernas
  hand: { x: number; y: number } //   agarre del palo en la mano
  poleDir: { x: number; y: number } // direccion unitaria subiendo el palo
  footF: number //                    fraccion de altura donde el pie toca el piso
  poleLen: number //                  largo mano->farol (fraccion de la altura)
  gait: number //                     amplitud del vaiven de cada pierna (rad)
  // Correccion horizontal por pierna (fraccion del ancho del lienzo, marco
  // "mira a la derecha"). Sirve cuando las piernas del PNG estan pintadas en
  // una postura muy abierta y hay que juntarlas bajo el cuerpo. + = a la derecha.
  legDX?: { r: number; l: number }
}

const VARIANTS: SpriteMeta[] = [
  {
    key: 'nino',
    w: 784,
    h: 1168,
    files: {
      torso: '/farolero-cuerpo.png',
      legR: '/farolero-pierna-der.png',
      legL: '/farolero-pierna-izq.png',
    },
    crotch: { x: 0.485, y: 0.581 },
    hand: { x: 0.684, y: 0.492 },
    poleDir: { x: 0.223, y: -0.975 },
    footF: 0.922,
    poleLen: 0.62,
    gait: 0.22,
  },
  {
    key: 'nina',
    w: 1152,
    h: 1712,
    files: {
      torso: '/farolera-cuerpo.png',
      legR: '/farolera-pierna-der.png',
      legL: '/farolera-pierna-izq.png',
    },
    crotch: { x: 0.518, y: 0.568 },
    hand: { x: 0.636, y: 0.804 },
    poleDir: { x: 0.089, y: -0.996 },
    footF: 0.916,
    poleLen: 0.75, // la niña agarra el palo mas abajo; el farol sube mas
    gait: 0.12, //   piernas casi tapadas por la falda: vaiven corto
    // El PNG de la niña trae las piernas en postura muy abierta: el pie derecho
    // cae en x~0.757 (fuera del ruedo, que llega a ~0.71) y el izquierdo en
    // x~0.355. Las juntamos bajo el cuerpo (centro de falda ~0.41) para que
    // asomen parejas bajo la falda en vez de despegadas.
    legDX: { r: -0.292, l: 0 },
  },
]
const FIG_H = 82 // altura en pantalla del lienzo completo, por unidad de escala s

type SpriteSet = {
  torso: HTMLCanvasElement
  legR: HTMLCanvasElement
  legL: HTMLCanvasElement
}

// Bombetas (fuegos artificiales) sobre el cielo. Paleta bandera CR + dorado.
const FIREWORK_COLORS = ['#ffb703', '#ce1126', '#0b4da2', '#ffffff', '#ff6b35', '#4d9fff']

type Rocket = {
  x: number
  y: number
  vy: number
  targetY: number // altura a la que estalla
  color: string
}

type Spark = {
  x: number
  y: number
  vx: number
  vy: number
  life: number // frames restantes
  maxLife: number
  color: string
}

type Walker = {
  id: string
  px: number
  py: number // posicion de los pies
  vx: number
  vy: number
  wanderTheta: number
  maxSpeed: number // px/frame (techo de velocidad de este personaje)
  speedMul: number // fraccion del techo, deriva lento (unos mas lentos, otros mas rapidos)
  maxForce: number
  face: 1 | -1 // hacia donde mira
  cycle: number // acumulador del ciclo de caminado
  phase: number
  hue: number
  variant: number // indice en VARIANTS (0 niño, 1 niña)
  hasHat: boolean
  img: HTMLImageElement | null
  username: string | null
  hdUrl: string | null
  // geometria de la burbuja del ultimo frame dibujado (para hit-test del hover)
  bx: number
  by: number
  br: number
}

function limit(x: number, y: number, max: number): [number, number] {
  const m = Math.hypot(x, y)
  if (m > max && m > 0) return [(x / m) * max, (y / m) * max]
  return [x, y]
}

export class ParadeScene {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private walkers: Walker[] = []
  private imgCache = new Map<string, HTMLImageElement>()
  private raf = 0
  private last = 0
  private w = 1600
  private h = 900
  private dpr = 1
  private running = false
  private bg = new Image()
  private bgReady = false

  // Sprites (por variante) pre-renderizados a tamaño moderado, para no dibujar
  // el PNG full por walker en cada frame. Hasta que cargue, hay fallback vector.
  private spriteSets: (SpriteSet | null)[] = VARIANTS.map(() => null)
  private spriteReady: boolean[] = VARIANTS.map(() => false)

  bubbleScale = 1
  speedScale = 1
  fireworks = true

  // Hover: puntero del mouse, farol resaltado y callback hacia React.
  private pointer: { x: number; y: number } | null = null
  private hoveredId: string | null = null
  onHover: ((info: HoverInfo | null) => void) | null = null

  private rockets: Rocket[] = []
  private sparks: Spark[] = []
  private nextRocketAt = 0 // timestamp (ms) del proximo lanzamiento

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No 2D context')
    this.ctx = ctx
    this.bg.onload = () => {
      this.bgReady = true
    }
    this.bg.src = '/plaza.jpg'
    this.loadSprites()
    this.resize()
  }

  // Carga cada variante (niño/niña): sus 3 partes se pre-renderizan a un canvas
  // offscreen de altura fija; asi cada walker solo hace drawImage escalado.
  private loadSprites() {
    VARIANTS.forEach((meta, vi) => {
      const parts: Partial<SpriteSet> = {}
      let left = 3
      ;(['torso', 'legR', 'legL'] as const).forEach((k) => {
        const im = new Image()
        im.onload = () => {
          const H0 = 240 // resolucion offscreen (> tamaño max en pantalla)
          const w0 = Math.round((meta.w / meta.h) * H0)
          const c = document.createElement('canvas')
          c.width = w0
          c.height = H0
          const cx = c.getContext('2d')
          if (cx) {
            cx.drawImage(im, 0, 0, w0, H0)
            parts[k] = c
          }
          if (--left === 0 && parts.torso && parts.legR && parts.legL) {
            this.spriteSets[vi] = parts as SpriteSet
            this.spriteReady[vi] = true
          }
        }
        im.src = meta.files[k]
      })
    })
  }

  // Dibuja al farolero: piernas que oscilan desde la entrepierna + torso encima
  // (el torso cubre las caderas). El farol/burbuja se dibuja aparte (mano+palo).
  private drawSpriteFigure(
    set: SpriteSet,
    meta: SpriteMeta,
    x: number,
    feetY: number,
    face: 1 | -1,
    swing: number,
    fullW: number,
    fullH: number,
  ) {
    const { ctx } = this
    const { torso, legR, legL } = set

    // esquina sup-izq del lienzo del sprite en pantalla: alinea la entrepierna
    // con wk.px y apoya el pie en feetY.
    const originX = x - meta.crotch.x * fullW
    const originY = feetY - meta.footF * fullH
    // pivote de las piernas = entrepierna
    const pivotX = x
    const pivotY = feetY + (meta.crotch.y - meta.footF) * fullH
    const gait = swing * meta.gait

    ctx.save()
    if (face < 0) {
      // espejar horizontalmente alrededor de wk.px (el sprite mira a la derecha)
      ctx.translate(x, 0)
      ctx.scale(-1, 1)
      ctx.translate(-x, 0)
    }
    const leg = (img: HTMLCanvasElement, rot: number, dxFrac: number) => {
      ctx.save()
      ctx.translate(pivotX, pivotY)
      ctx.rotate(rot)
      ctx.translate(-pivotX, -pivotY)
      // dxFrac corre la pierna en horizontal (marco mira-a-la-derecha) para
      // juntarla bajo el cuerpo cuando el PNG la trae muy abierta.
      ctx.drawImage(img, originX + dxFrac * fullW, originY, fullW, fullH)
      ctx.restore()
    }
    leg(legR, -gait, meta.legDX?.r ?? 0) // pierna trasera (contrafase)
    leg(legL, gait, meta.legDX?.l ?? 0) // pierna delantera
    ctx.drawImage(torso, originX, originY, fullW, fullH) // torso encima de las caderas
    ctx.restore()
  }

  private get bandTop() {
    return this.h * BAND_TOP_F
  }
  private get bandBottom() {
    return this.h * BAND_BOTTOM_F
  }

  resize = () => {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.w = window.innerWidth
    this.h = window.innerHeight
    this.canvas.width = Math.floor(this.w * this.dpr)
    this.canvas.height = Math.floor(this.h * this.dpr)
    this.canvas.style.width = this.w + 'px'
    this.canvas.style.height = this.h + 'px'
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    // reencuadrar walkers dentro de la nueva banda
    for (const wk of this.walkers) {
      wk.px = Math.max(30, Math.min(this.w - 30, wk.px))
      wk.py = Math.max(this.bandTop, Math.min(this.bandBottom, wk.py))
    }
  }

  private byId = new Map<string, Walker>()
  private urlById = new Map<string, string>()

  private createWalker(it: LanternInput, i: number): Walker {
    const py = this.bandTop + Math.random() * (this.bandBottom - this.bandTop)
    // arrancan caminando casi horizontal, hacia un lado al azar
    const spd = 0.35
    const dir = Math.random() < 0.5 ? -1 : 1
    return {
      id: it.id,
      px: 80 + Math.random() * (this.w - 160),
      py,
      vx: dir * spd,
      vy: (Math.random() - 0.5) * 0.06,
      wanderTheta: (Math.random() - 0.5) * 0.4,
      maxSpeed: 0.3 + Math.random() * 0.22, // px/frame (~18-31 px/s), techo
      speedMul: 0.45 + Math.random() * 0.55, // 0.45..1.0 del techo
      maxForce: 0.008 + Math.random() * 0.008,
      face: (Math.random() < 0.5 ? -1 : 1) as 1 | -1,
      cycle: Math.random() * Math.PI * 2,
      phase: Math.random() * Math.PI * 2,
      hue: i,
      variant: Math.random() < 0.5 ? 0 : 1,
      hasHat: Math.random() < 0.45,
      img: this.imgCache.get(it.id) ?? null,
      username: it.username ?? null,
      hdUrl: it.hdUrl ?? null,
      bx: 0,
      by: 0,
      br: 0,
    }
  }

  // Reconcilia la lista sin resetear a los que ya estan caminando:
  // conserva los existentes (por id), agrega los nuevos, quita los que se fueron.
  // La caché de imagenes tambien va por id porque en modo demo el url cambia.
  setLanterns(items: LanternInput[]) {
    const next = new Map<string, Walker>()
    items.forEach((it, i) => {
      // (re)cargar la imagen si es nueva o si cambio la URL (ej. imagen reemplazada
      // en el admin). En modo demo el blob URL cambia en cada refresco.
      if (!this.imgCache.has(it.id) || this.urlById.get(it.id) !== it.url) {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.src = it.url
        this.imgCache.set(it.id, img)
        this.urlById.set(it.id, it.url)
      }
      const existing = this.byId.get(it.id)
      if (existing) {
        existing.img = this.imgCache.get(it.id) ?? existing.img
        existing.username = it.username ?? existing.username
        existing.hdUrl = it.hdUrl ?? existing.hdUrl
        next.set(it.id, existing)
      } else {
        next.set(it.id, this.createWalker(it, i))
      }
    })
    this.byId = next
    this.walkers = Array.from(next.values())
  }

  start() {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  private frame = (now: number) => {
    if (!this.running) return
    const f = Math.min(Math.max((now - this.last) / 1000, 0.001) * 60, 2) // factor de framerate
    this.last = now
    this.update(f)
    this.updateFireworks(f, now)
    this.draw(now / 1000)
    this.updateHover()
    this.raf = requestAnimationFrame(this.frame)
  }

  // --- Hover ------------------------------------------------------------
  setPointer = (x: number, y: number) => {
    this.pointer = { x, y }
  }

  clearPointer = () => {
    this.pointer = null
  }

  // Detecta el farol bajo el cursor (de adelante hacia atras) y avisa a React
  // solo cuando cambia, para no re-renderizar en cada frame.
  private updateHover() {
    let hit: Walker | null = null
    if (this.pointer) {
      const { x, y } = this.pointer
      // sticky: si el cursor sigue dentro de la burbuja que ya miramos, se
      // mantiene esa aunque otro pase al frente. Solo cambia al salir de ella.
      if (this.hoveredId) {
        const cur = this.byId.get(this.hoveredId)
        if (cur && Math.hypot(x - cur.bx, y - cur.by) <= cur.br) hit = cur
      }
      if (!hit) {
        for (let i = this.walkers.length - 1; i >= 0; i--) {
          const wk = this.walkers[i]
          if (Math.hypot(x - wk.bx, y - wk.by) <= wk.br) {
            hit = wk
            break
          }
        }
      }
    }
    const id = hit ? hit.id : null
    if (id !== this.hoveredId) {
      this.hoveredId = id
      this.onHover?.(hit ? { id: hit.id, username: hit.username, hdUrl: hit.hdUrl ?? '' } : null)
    }
  }

  // --- Steering ---------------------------------------------------------
  // velocidad de crucero de este personaje: techo * su fraccion * escala global
  private cruise(wk: Walker): number {
    return wk.maxSpeed * wk.speedMul * this.speedScale
  }

  private seek(wk: Walker, tx: number, ty: number): [number, number] {
    const maxS = this.cruise(wk)
    let dx = tx - wk.px
    let dy = ty - wk.py
    const m = Math.hypot(dx, dy)
    if (m > 0) {
      dx = (dx / m) * maxS
      dy = (dy / m) * maxS
    }
    return limit(dx - wk.vx, dy - wk.vy, wk.maxForce)
  }

  private wander(wk: Walker): [number, number] {
    const speed = Math.hypot(wk.vx, wk.vy) || 0.001
    const ahead = 55 // mira lejos -> rumbos largos, cruzan a lo ancho
    const r = 10
    const fx = wk.px + (wk.vx / speed) * ahead
    const fy = wk.py + (wk.vy / speed) * ahead
    // deriva pequeña y con retorno a 0: se mantienen casi rectos, solo cabecean
    wk.wanderTheta += (Math.random() - 0.5) * 0.25
    wk.wanderTheta *= 0.92
    const heading = Math.atan2(wk.vy, wk.vx)
    const theta = wk.wanderTheta + heading
    const tx = fx + Math.cos(theta) * r
    const ty = fy + Math.sin(theta) * r * 0.35 // vaiven vertical suave
    return this.seek(wk, tx, ty)
  }

  // Limites horizontales de la plaza segun profundidad (trapecio en perspectiva:
  // mas angosto al fondo, full ancho adelante).
  private xBounds(py: number): [number, number] {
    const depth = (py - this.bandTop) / (this.bandBottom - this.bandTop) // 0 fondo .. 1 frente
    const inset = (0.36 - depth * 0.34) * this.w
    return [inset, this.w - inset]
  }

  private containment(wk: Walker): [number, number] {
    const off = 70
    const maxS = this.cruise(wk)
    const [left, right] = this.xBounds(wk.py)
    let dx = 0
    let dy = 0
    let active = false
    if (wk.px < left + off) {
      dx = maxS
      active = true
    } else if (wk.px > right - off) {
      dx = -maxS
      active = true
    }
    if (wk.py < this.bandTop + 15) {
      dy = maxS
      active = true
    } else if (wk.py > this.bandBottom - 8) {
      dy = -maxS
      active = true
    }
    if (!active) return [0, 0]
    // conservar la componente no activa
    if (dx === 0) dx = wk.vx
    if (dy === 0) dy = wk.vy
    const m = Math.hypot(dx, dy)
    if (m > 0) {
      dx = (dx / m) * maxS
      dy = (dy / m) * maxS
    }
    return limit(dx - wk.vx, dy - wk.vy, wk.maxForce * 2.5)
  }

  private update(f: number) {
    for (const wk of this.walkers) {
      // congelar el personaje mientras se le hace hover (no hay que perseguirlo).
      // Conserva su velocidad, asi retoma el rumbo al soltar el hover.
      if (wk.id === this.hoveredId) continue

      // deriva lenta de la velocidad (unos aceleran, otros aflojan, sin pasar el techo)
      wk.speedMul += (Math.random() - 0.5) * 0.03 * f
      if (wk.speedMul < 0.35) wk.speedMul = 0.35
      else if (wk.speedMul > 1) wk.speedMul = 1

      const [wx, wy] = this.wander(wk)
      const [cx, cy] = this.containment(wk)
      // el containment pesa mas para que giren antes de tocar el borde
      const ax = wx + cx * 1.6
      const ay = wy + cy * 1.6

      wk.vx += ax * f
      wk.vy += ay * f
      ;[wk.vx, wk.vy] = limit(wk.vx, wk.vy, this.cruise(wk))

      wk.px += wk.vx * f
      wk.py += wk.vy * f

      // mantener dentro del trapecio de la plaza por si acaso
      wk.py = Math.max(this.bandTop, Math.min(this.bandBottom, wk.py))
      const [left, right] = this.xBounds(wk.py)
      wk.px = Math.max(left, Math.min(right, wk.px))

      // orientacion suavizada (evita parpadeo cuando vx ~ 0)
      const spd = Math.hypot(wk.vx, wk.vy)
      if (Math.abs(wk.vx) > 0.12 * wk.maxSpeed) wk.face = wk.vx >= 0 ? 1 : -1

      // ciclo de caminado proporcional a la velocidad
      wk.cycle += spd * f * 0.5
    }
    // dibujar de atras (arriba) hacia adelante (abajo)
    this.walkers.sort((a, b) => a.py - b.py)
    // el farol bajo el cursor va al frente para que nadie lo tape
    if (this.hoveredId) {
      const idx = this.walkers.findIndex((w) => w.id === this.hoveredId)
      if (idx >= 0 && idx !== this.walkers.length - 1) {
        const [w] = this.walkers.splice(idx, 1)
        this.walkers.push(w)
      }
    }
  }

  // --- Bombetas (fuegos artificiales) -----------------------------------
  private spawnRocket() {
    const [left, right] = this.xBounds(this.bandTop)
    const color = FIREWORK_COLORS[(Math.random() * FIREWORK_COLORS.length) | 0]
    this.rockets.push({
      x: left + Math.random() * (right - left),
      y: this.bandTop, // sale desde el horizonte de la plaza
      vy: -(9 + Math.random() * 4),
      targetY: this.bandTop * (0.1 + Math.random() * 0.35), // estalla en el cielo alto
      color,
    })
  }

  private explode(x: number, y: number, color: string) {
    const n = 40 + ((Math.random() * 26) | 0)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2
      const sp = 1.6 + Math.random() * 3.4
      const maxLife = 55 + Math.random() * 40
      // mayoria del color del cohete, unas pocas chispas doradas
      const c = Math.random() < 0.2 ? '#ffe08a' : color
      this.sparks.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: maxLife,
        maxLife,
        color: c,
      })
    }
  }

  private updateFireworks(f: number, now: number) {
    if (!this.fireworks) {
      this.rockets.length = 0
      this.sparks.length = 0
      return
    }
    if (now >= this.nextRocketAt) {
      this.spawnRocket()
      if (Math.random() < 0.35) this.spawnRocket() // rafagas ocasionales
      this.nextRocketAt = now + 900 + Math.random() * 1900
    }

    const gRocket = 0.12
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i]
      r.y += r.vy * f
      r.vy += gRocket * f
      if (r.y <= r.targetY || r.vy >= -1) {
        this.explode(r.x, r.y, r.color)
        this.rockets.splice(i, 1)
      }
    }

    const gSpark = 0.05
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]
      s.x += s.vx * f
      s.y += s.vy * f
      s.vy += gSpark * f
      s.vx *= 0.985
      s.vy *= 0.985
      s.life -= f
      if (s.life <= 0) this.sparks.splice(i, 1)
    }
  }

  private drawFireworks() {
    const { ctx } = this
    if (!this.rockets.length && !this.sparks.length) return
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'

    for (const r of this.rockets) {
      ctx.fillStyle = r.color
      ctx.beginPath()
      ctx.arc(r.x, r.y, 2, 0, Math.PI * 2)
      ctx.fill()
      // estela
      ctx.strokeStyle = 'rgba(255,224,138,0.35)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(r.x, r.y)
      ctx.lineTo(r.x, r.y - r.vy * 2.5)
      ctx.stroke()
    }

    for (const s of this.sparks) {
      const a = Math.max(0, s.life / s.maxLife)
      ctx.globalAlpha = a
      ctx.fillStyle = s.color
      ctx.beginPath()
      ctx.arc(s.x, s.y, 2 * a + 0.5, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.globalAlpha = 1
    ctx.restore()
  }

  // --- Render -----------------------------------------------------------
  private draw(t: number) {
    const { ctx, w, h } = this

    // Fondo: imagen de la plaza, escalada para cubrir toda la pantalla (cover)
    if (this.bgReady) {
      const iw = this.bg.naturalWidth
      const ih = this.bg.naturalHeight
      const scale = Math.max(w / iw, h / ih)
      const dw = iw * scale
      const dh = ih * scale
      ctx.drawImage(this.bg, (w - dw) / 2, (h - dh) / 2, dw, dh)
    } else {
      ctx.fillStyle = '#141033'
      ctx.fillRect(0, 0, w, h)
    }

    // bombetas en el cielo, detras de los faroleros
    this.drawFireworks()

    for (const wk of this.walkers) this.drawWalker(t, wk)
  }

  private drawWalker(t: number, wk: Walker) {
    const { ctx } = this
    const depth = (wk.py - this.bandTop) / (this.bandBottom - this.bandTop) // 0 fondo .. 1 frente
    const s = (0.95 + depth * 0.95) * this.bubbleScale
    const x = wk.px
    const feetY = wk.py
    const face = wk.face

    const speed = Math.hypot(wk.vx, wk.vy)
    const swing = Math.sin(wk.cycle) * Math.min(1, speed / (wk.maxSpeed || 1))
    const bob = Math.sin(t * 2 + wk.phase) * 3.5 * s

    const bodyH = 44 * s
    const hipY = feetY - bodyH * 0.5
    const shoulderY = feetY - bodyH
    const headR = 9 * s
    const headY = shoulderY - headR - 1 * s

    // variante (niño/niña) de este walker
    const meta = VARIANTS[wk.variant]
    const set = this.spriteSets[wk.variant]
    const useSprite = this.spriteReady[wk.variant] && set != null

    // dimensiones del sprite en pantalla (lienzo completo de la variante)
    const fullH = FIG_H * s
    const fullW = fullH * (meta.w / meta.h)

    const poleTopX = x + face * 14 * s
    const bubbleR = 30 * s
    let bubbleX: number
    let bubbleY: number
    if (useSprite) {
      // farol en la punta del palo: mano + poleLen en la direccion del palo
      const handX = x + face * (meta.hand.x - meta.crotch.x) * fullW
      const handY = feetY + (meta.hand.y - meta.footF) * fullH
      bubbleX = handX + face * meta.poleDir.x * meta.poleLen * fullH
      bubbleY = handY + meta.poleDir.y * meta.poleLen * fullH + bob
    } else {
      bubbleX = x + face * 30 * s
      bubbleY = headY - bubbleR - 10 * s + bob
    }

    // guardar geometria para el hit-test del hover
    wk.bx = bubbleX
    wk.by = bubbleY
    wk.br = bubbleR
    const hovered = wk.id === this.hoveredId

    // luz calida proyectada en el piso
    const pool = ctx.createRadialGradient(x + face * 12 * s, feetY, 2, x + face * 12 * s, feetY, 60 * s)
    pool.addColorStop(0, 'rgba(255,190,90,0.20)')
    pool.addColorStop(1, 'rgba(255,190,90,0)')
    ctx.fillStyle = pool
    ctx.beginPath()
    ctx.ellipse(x + face * 12 * s, feetY, 60 * s, 16 * s, 0, 0, Math.PI * 2)
    ctx.fill()

    // sombra bajo los pies
    ctx.fillStyle = 'rgba(0,0,0,0.28)'
    ctx.beginPath()
    ctx.ellipse(x, feetY + 2 * s, 15 * s, 4 * s, 0, 0, Math.PI * 2)
    ctx.fill()

    // resplandor del farol
    const glow = ctx.createRadialGradient(bubbleX, bubbleY, bubbleR * 0.2, bubbleX, bubbleY, bubbleR * 2.5)
    glow.addColorStop(0, 'rgba(255,205,120,0.55)')
    glow.addColorStop(0.5, 'rgba(255,175,85,0.16)')
    glow.addColorStop(1, 'rgba(255,175,85,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(bubbleX, bubbleY, bubbleR * 2.5, 0, Math.PI * 2)
    ctx.fill()

    // ---- personaje ----
    if (useSprite) {
      this.drawSpriteFigure(set, meta, x, feetY, face, swing, fullW, fullH)
    } else {
      // fallback vectorial (silueta con poncho) mientras cargan los sprites
      const dark = '#100b22'
      ctx.strokeStyle = dark
      ctx.fillStyle = dark
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      // piernas con ciclo de caminado
    const legSpread = swing * 6 * s
    ctx.lineWidth = 5 * s
    ctx.beginPath()
    ctx.moveTo(x, hipY)
    ctx.lineTo(x + legSpread, feetY)
    ctx.moveTo(x, hipY)
    ctx.lineTo(x - legSpread, feetY)
    ctx.stroke()

    // poncho (trapecio redondeado)
    ctx.beginPath()
    ctx.moveTo(x, shoulderY)
    ctx.quadraticCurveTo(x + 15 * s, shoulderY + bodyH * 0.4, x + 12 * s, hipY + 4 * s)
    ctx.lineTo(x - 12 * s, hipY + 4 * s)
    ctx.quadraticCurveTo(x - 15 * s, shoulderY + bodyH * 0.4, x, shoulderY)
    ctx.closePath()
    ctx.fill()

    // luz calida del farol sobre el poncho (lado del farol)
    const lit = ctx.createLinearGradient(x - 12 * s, 0, x + face * 14 * s, 0)
    lit.addColorStop(0, 'rgba(255,180,90,0)')
    lit.addColorStop(1, 'rgba(255,180,90,0.22)')
    ctx.fillStyle = lit
    ctx.fill()
    ctx.fillStyle = dark

    // cabeza
    ctx.beginPath()
    ctx.arc(x, headY, headR, 0, Math.PI * 2)
    ctx.fill()

    // sombrero opcional
    if (wk.hasHat) {
      ctx.fillStyle = HAT_COLORS[wk.hue % HAT_COLORS.length]
      ctx.beginPath()
      ctx.ellipse(x, headY - headR * 0.5, headR * 1.7, headR * 0.5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(x, headY - headR * 0.9, headR * 0.9, headR * 0.7, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = dark
    }

    // brazo + palo del farol
    ctx.strokeStyle = dark
    ctx.lineWidth = 3.5 * s
    ctx.beginPath()
      ctx.moveTo(x, shoulderY + 4 * s)
      ctx.lineTo(poleTopX, bubbleY + bubbleR * 0.6)
      ctx.stroke()
    }

    // ---- farol-burbuja con la imagen ----
    ctx.save()
    ctx.beginPath()
    ctx.arc(bubbleX, bubbleY, bubbleR, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()

    if (wk.img && wk.img.complete && wk.img.naturalWidth > 0) {
      const img = wk.img
      const d = bubbleR * 2
      const ar = img.naturalWidth / img.naturalHeight
      let dw = d
      let dh = d
      if (ar > 1) dw = d * ar
      else dh = d / ar
      ctx.drawImage(img, bubbleX - dw / 2, bubbleY - dh / 2, dw, dh)
    } else {
      const c = RIM_COLORS[wk.hue % RIM_COLORS.length]
      const g = ctx.createRadialGradient(bubbleX, bubbleY, 2, bubbleX, bubbleY, bubbleR)
      g.addColorStop(0, '#fff4d6')
      g.addColorStop(1, c)
      ctx.fillStyle = g
      ctx.fillRect(bubbleX - bubbleR, bubbleY - bubbleR, bubbleR * 2, bubbleR * 2)
    }
    ctx.restore()

    // brillo tipo burbuja
    const shine = ctx.createRadialGradient(
      bubbleX - bubbleR * 0.35,
      bubbleY - bubbleR * 0.4,
      1,
      bubbleX,
      bubbleY,
      bubbleR,
    )
    shine.addColorStop(0, 'rgba(255,255,255,0.35)')
    shine.addColorStop(0.4, 'rgba(255,255,255,0.05)')
    shine.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = shine
    ctx.beginPath()
    ctx.arc(bubbleX, bubbleY, bubbleR, 0, Math.PI * 2)
    ctx.fill()

    // aro de color (dorado y mas grueso si esta bajo el cursor)
    ctx.lineWidth = (hovered ? 5 : 3) * s
    ctx.strokeStyle = hovered ? '#ffd166' : RIM_COLORS[wk.hue % RIM_COLORS.length]
    ctx.beginPath()
    ctx.arc(bubbleX, bubbleY, bubbleR, 0, Math.PI * 2)
    ctx.stroke()

    // halo extra al hacer hover
    if (hovered) {
      const halo = ctx.createRadialGradient(bubbleX, bubbleY, bubbleR, bubbleX, bubbleY, bubbleR * 1.6)
      halo.addColorStop(0, 'rgba(255,209,102,0.5)')
      halo.addColorStop(1, 'rgba(255,209,102,0)')
      ctx.fillStyle = halo
      ctx.beginPath()
      ctx.arc(bubbleX, bubbleY, bubbleR * 1.6, 0, Math.PI * 2)
      ctx.fill()
    }

    // @usuario que subio la imagen, bajo los pies
    if (wk.username) {
      const fontPx = Math.max(9, 11 * s)
      ctx.font = `600 ${fontPx}px 'Hanken Grotesk Variable', system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      const ty = feetY + 12 * s
      // contorno oscuro para legibilidad sobre cualquier fondo
      ctx.lineWidth = Math.max(2, 3 * s)
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'
      ctx.lineJoin = 'round'
      ctx.strokeText(wk.username, x, ty)
      ctx.fillStyle = '#ffe08a'
      ctx.fillText(wk.username, x, ty)
    }
  }
}
