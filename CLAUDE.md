# Desfile de Faroles

App web para una celebracion del **15 de setiembre** (independencia de Costa Rica), pensada
para global TSE. Simula un **desfile de faroles** nocturno: personajes ("faroleros") caminan
sobre una plaza sosteniendo un farol-burbuja, y dentro de cada burbuja va una **imagen subida
por un admin**. Se esperan entre 100 y 200 imagenes.

- Ruta `/` : vista publica a **pantalla completa**, solo el desfile, sin controles para el usuario.
- Ruta `/admin` : panel protegido por contraseña para subir / borrar imagenes.

## Stack

- Vite + React + TypeScript.
- Canvas 2D para el desfile (un solo `requestAnimationFrame`, pensado para ~200 sprites).
- **AWS Amplify Gen 2** como backend: **Cognito** (auth del admin), **AppSync + DynamoDB**
  (datos, modelo `Lantern`), **S3** (imagenes). Con **fallback a IndexedDB** para correr sin
  nube (modo demo local). Hosting en **Amplify Hosting**.
- `react-router-dom` para las dos rutas.

## Estructura

- `src/parade/engine.ts` : motor del desfile (lo mas importante). Clase `ParadeScene`.
- `src/pages/Parade.tsx` : monta el canvas fullscreen, carga faroles, refresca cada 20s.
  Incluye titulo grande centrado sobre el cielo (eyebrow + h1 + sub + cinta bandera). Hover sobre
  un farol muestra su version HD grande y centrada (`.hover-preview`, pointer-events:none) y resalta
  la burbuja; el motor hace el hit-test (`scene.onHover`, `setPointer`/`clearPointer`).
- `src/parade/AudioPlayer.tsx` : player glassmorphism abajo a la izquierda. Playlist de 3 himnos
  CR (`public/audio/*.mp3`), controles prev / play-pause / next, barra de progreso seekable,
  auto-avanza al terminar. Colapsa a mini player (solo los 3 controles, `.is-mini`) 3s despues de
  que el cursor sale del player; SOLO el hover sobre el player lo expande (`.is-full`), no el mouse
  en la pagina. Nunca desaparece del todo.
  Autoplay bloqueado hasta el primer gesto (los botones sirven de gesto).
- `src/pages/Admin.tsx` : login por contraseña + campo `@usuario` (requerido, se recuerda en
  sessionStorage) + subida por drag & drop o clic + grid. El `@usuario` se guarda con cada imagen.
  Acciones por celda (al hover): cambiar imagen, editar `@usuario` inline, quitar nombre, borrar.
- `src/lib/amplify.ts` : configura Amplify si existe `amplify_outputs.json` (via import.meta.glob,
  asi el build no falla si no existe). Exporta `isAmplifyConfigured` (false -> modo demo IndexedDB).
- `amplify/` : backend Gen 2. `auth/` (Cognito), `data/` (modelo `Lantern`, lectura guest +
  escritura autenticada), `storage/` (bucket S3 `lanterns/*`), `backend.ts` (junta todo).
- `src/lib/image.ts` : compresion en el cliente. `makeVariants(file)` genera **thumb (~320px)**
  para los sprites del desfile y **hd (~1280px)** para el hover. Evita el OOM del renderer
  (cargar 100-200 fotos full-res explotaba el tab y lo auto-recargaba).
- `src/lib/lanterns.ts` : capa de datos (Amplify Data/Storage o IndexedDB), API `listLanterns` /
  `uploadLantern(file, username)` / `deleteLantern` / `updateLanternUsername(l, name|null)` /
  `replaceLanternImage(l, file)` / `normalizeUsername`. Cada `Lantern` lleva `username`
  (`@handle` normalizado) + `thumb_url`/`thumb_path` (miniatura) ademas de `public_url` (HD).
  Sube/borra ambas variantes. El motor usa la miniatura para el sprite y la HD para el hover.
- `public/plaza.jpg` : imagen de fondo (plaza nocturna con casas de colores y piso de mosaico).
- `.env.example` : variables (copiar a `.env`).

## Motor de movimiento (engine.ts)

Usa **steering behaviors** de Reynolds (referencia: Nature of Code, "Autonomous Agents"):

- Cada walker tiene `px,py,vx,vy`, `maxSpeed`, `maxForce`, `wanderTheta`, `face`, `cycle`.
- **wander**: busca un punto sobre un circulo proyectado adelante; `wanderTheta` deriva poco y
  decae hacia 0 (`*= 0.92`) para que mantengan rumbo y crucen a lo ancho (no zig-zag).
- **containment**: giro anticipado en los bordes. La plaza es un **trapecio en perspectiva**
  (`xBounds(py)`): mas angosta al fondo, full ancho adelante, para no pisar las casas.
- Banda de piso = `BAND_TOP_F=0.76` a `BAND_BOTTOM_F=0.985` de la altura (calza con el mosaico).
- Profundidad por `py`: define escala del personaje y orden de dibujo (`sort` por `py`).
- Movimiento independiente del framerate (factor `f = dt*60`, cap 2).
- Fondo: `plaza.jpg` dibujada con "cover"; NO se dibuja cielo/piso propio.
- `setLanterns()` **reconcilia por `id`** (no resetea a los que ya caminan); la cache de
  imagenes va por `id` pero se **recarga si cambia la URL** (`urlById`) para reflejar un reemplazo.
  Las object URLs del modo demo se **cachean por `id`** en `lanterns.ts` (`urlCache`) para que
  sean **estables entre refrescos** y el sondeo de 20s no recree imagenes (parpadeo/tiron).
- Props ajustables en runtime: `scene.bubbleScale`, `scene.speedScale`.

### Bombetas (fuegos artificiales)
- `scene.fireworks` (bool, default true). Cohetes salen del horizonte y estallan en el
  cielo alto; chispas con gravedad y fade. Paleta bandera CR + dorado. Se dibujan detras
  de los faroleros (`drawFireworks()` en `draw()`), con `globalCompositeOperation='lighter'`.

### Parametros de tuning actuales
- Velocidad: `maxSpeed = 0.3..0.52` px/frame es el **techo** por personaje. La velocidad real
  es `maxSpeed * speedMul` con `speedMul` 0.35..1.0 que **deriva lento** (unos mas lentos, otros
  mas rapidos). Ver `cruise(wk)`. Al hacer hover el personaje se **congela**.
- Hover **sticky**: mientras el cursor siga dentro de la burbuja ya mirada, no cambia aunque otro
  pase al frente; ademas el farol hovered se dibuja al frente para que no lo tapen.
- `maxForce = 0.008..0.016` (giros suaves).
- Escala personaje: `s = (0.95 + depth*0.95) * bubbleScale`.

## Comandos

```bash
npm install
npm run dev        # http://localhost:3000  (host abierto para el proxy de DevSpaces)
npm run build      # tsc -b && vite build
npx tsc -b         # solo typecheck
```

En AgentSpaces/DevSpaces el preview se abre con el boton Connect (puerto 3000); para el panel
agregar `/admin` a la URL. Contraseña por defecto `faroles2026` (`VITE_ADMIN_PASSWORD`).

## Backend AWS Amplify Gen 2

Definido en `amplify/` (auth Cognito + data AppSync/DynamoDB + storage S3). Autorizacion:
lectura publica (guest/identity pool) para el desfile, escritura/borrado solo autenticado.

**Dev contra tu cuenta AWS** (necesita credenciales AWS configuradas):
```
npx ampx sandbox        # provisiona un backend efimero y genera amplify_outputs.json
```
Con `amplify_outputs.json` presente, `isAmplifyConfigured` es true y la app usa AWS. Sin el,
corre en modo demo (IndexedDB). El archivo esta gitignoreado.

**Crear el usuario admin** (Cognito): en la consola de Cognito, crear un usuario con
contraseña permanente (o `ampx`), sin auto-registro. Ese usuario entra en `/admin`.

## Deploy (Amplify Hosting + subdominio .amplifyapp.com)

1. Push del repo a GitHub, conectar en la consola de **AWS Amplify Hosting**. Detecta Vite y
   provisiona el backend (`amplify/`) en el build; genera `amplify_outputs.json` antes de
   `npm run build`. No hay que setear env vars de backend (todo sale de Amplify).
2. Rewrite de SPA (para que `/admin` no de 404 al recargar): en la consola de Amplify, en
   Rewrites and redirects, agregar `</^[^.]+$|\.(?!(css|js|png|jpg|svg|json|mp3|woff2?)$)([^.]+$)/>`
   -> `/index.html` (200). O la regla equivalente que ofrezca el asistente para SPA.
3. URL: `https://main.<appid>.amplifyapp.com`. Panel en `/admin`.

Seguridad: el login del admin es Cognito (no hay contraseña en el bundle); las escrituras van
con `authMode: 'userPool'` y la lectura publica con `identityPool` (guest). La `VITE_ADMIN_PASSWORD`
solo aplica al modo demo local.

## Pendiente / siguientes bloques

- Controles en `/admin` para `bubbleScale` y `speedScale` (ya existen como props del engine).
- Ajuste fino de la banda de piso segun resolucion real del monitor.

## Convenciones (preferencias del usuario)

- **Nunca** usar em dashes (`—`). Usar `-`, `:`, `::`, `|`.
- **Sin emojis** en UI, codigo ni texto.
- Sin franja de color en el borde izquierdo; colorear elementos de forma uniforme.
- Estetica: pixel/dots, minimalismo amistoso y futurista; evitar el look generico de "SaaS moderno".
- Paleta Costa Rica en acentos (azul `#0b4da2`, rojo `#ce1126`, blanco, dorado `#ffb703`).
