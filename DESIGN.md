# DESIGN.md :: Desfile de Faroles

Sistema de diseño para la app. Formato pensado para que un agente lo consuma
y mantenga la estetica sin reinventarla. Es un "good to have": guia de calidad,
no un gate que frene la entrega.

## 1. Visual Theme & Atmosphere

Noche de fiesta patria costarricense. Plaza nocturna, faroles calidos, cielo
oscuro con bombetas (fuegos artificiales). Tono: minimalismo amistoso y
futurista, hecho a mano, con personalidad tica. Nada del look generico de
"SaaS moderno".

## 2. Color Palette & Roles

| Token     | Hex       | Rol |
|-----------|-----------|-----|
| `--night` | `#0a1230` | fondo base / UI oscura |
| `--ink`   | `#f4f4f4` | texto principal |
| `--blue`  | `#0b4da2` | acento bandera CR / acciones primarias |
| `--red`   | `#ce1126` | acento bandera CR / destructivo (borrar) |
| `--gold`  | `#ffb703` | acento festivo / eyebrow / audio |

Regla: los acentos van sobre elementos completos y de forma uniforme.
NUNCA una franja de color en el borde izquierdo de tarjetas o paneles.

## 3. Typography Rules

- Fuentes self-hosted via `@fontsource` (no dependen de Google en el evento).
  NUNCA Inter, Geist, Space Grotesk, ni el default generico system-ui/Segoe/Roboto.
- Display (titulos): **Fraunces Variable** (`--font-display`). Serif con alma;
  usar axes `opsz`/`SOFT`/`WONK` para el caracter calido, no solo el peso.
- UI y cuerpo: **Hanken Grotesk Variable** (`--font-sans`), limpia y legible.
- Titulo hero: tamaño fluido `clamp(40px, 8.5vw, 128px)`.
- Eyebrow y subtitulos: Hanken en mayusculas con tracking amplio (`0.28`-`0.42em`),
  compensar el tracking con `padding-left` para centrado optico.

## 4. Component Stylings

- Botones primarios: fondo solido (`--blue`), texto blanco, peso 700, sin sombra dura.
- Botones sutiles (audio): circulo con borde translucido y blur ligero, icono `--gold`.
- Cinta bandera: gradiente centrado azul-blanco-rojo-blanco-azul como remate del titulo.
- Iconos: SVG propios inline (ver `public/icons.svg`), NO libreria de iconos (nada de Lucide).

## 5. Layout Principles

- Vista publica `/`: pantalla completa, sin cromo, solo desfile + titulo + audio.
- Titulo centrado horizontalmente, alto sobre el cielo (`top: 12vh`).
- Admin: contenido centrado, ancho contenido (`min(360px, 90vw)` en login).

## 6. Depth & Elevation

- Sombras suaves y difusas para profundidad (text-shadow del titulo, glow dorado).
- Evitar drop shadows duras y glassmorphism liquido agresivo.
- Profundidad del desfile por posicion `py` (perspectiva), no por sombras UI.

## 7. Do's and Don'ts

Do:
- Movimiento con proposito (steering behaviors, bombetas ritmadas).
- Contenido autentico, paleta CR, decisiones visuales con intencion.

Don't (anti "vibe-coded"):
- Sin emojis. Sin em dashes (`-`, `:`, `::`, `|`).
- Sin gradientes agresivos, colores neon, purpura+negro, arcoiris ni pastel basico.
- Sin bento grids, tres tarjetas en fila, sparkles, dot grids decorativos de relleno.
- Sin franja de color al borde izquierdo. Sin fondo puramente blanco.
- Sin testimonios falsos ni placeholders de relleno.

## 8. Responsive Behavior

- Tamaños fluidos con `clamp()` para que el titulo escale de monitor a laptop.
- Canvas del desfile: `dpr` cap a 2, se re-encuadra al `resize`.

## 9. Agent Prompt Guide

Al generar UI para este proyecto: "Estetica noche de fiesta patria CR, minimal
amistoso/futurista, hecho a mano. Paleta night/ink/blue/red/gold. Acentos
uniformes (nunca franja al borde). Sin emojis, sin em dashes, sin iconos de
libreria, sin look SaaS generico. Titulos grandes con peso 900 y tracking amplio
en eyebrows."
