import { useEffect, useRef, useState } from 'react'
import { ParadeScene, type HoverInfo } from '../parade/engine'
import AudioPlayer from '../parade/AudioPlayer'
import { listLanterns } from '../lib/lanterns'
import { isSupabaseConfigured } from '../lib/supabase'

export default function Parade() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<ParadeScene | null>(null)
  const [hover, setHover] = useState<HoverInfo | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const scene = new ParadeScene(canvas)
    sceneRef.current = scene
    scene.onHover = setHover
    scene.start()

    const load = async () => {
      try {
        const items = await listLanterns()
        scene.setLanterns(
          items.map((l) => ({
            id: l.id,
            url: l.thumb_url ?? l.public_url, // sprite: miniatura comprimida
            hdUrl: l.public_url, // hover: HD
            username: l.username,
          })),
        )
      } catch (e) {
        console.error('No se pudieron cargar los faroles', e)
      }
    }
    load()

    // refrescar cada 20s para tomar imagenes nuevas del panel admin
    const poll = window.setInterval(load, 20000)

    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect()
      scene.setPointer(e.clientX - r.left, e.clientY - r.top)
    }
    const onLeave = () => scene.clearPointer()

    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('mouseleave', onLeave)
    window.addEventListener('resize', scene.resize)

    return () => {
      scene.stop()
      window.clearInterval(poll)
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('resize', scene.resize)
    }
  }, [])

  return (
    <div className="parade">
      <div className="stage">
        <canvas ref={canvasRef} />

        <div className="parade-title">
          <span className="eyebrow">15 de Setiembre</span>
          <h1>Desfile de Faroles</h1>
          <span className="sub">Independencia de Costa Rica</span>
          <span className="flag" aria-hidden="true" />
        </div>

        {hover && hover.hdUrl && (
          <div className="hover-preview">
            <img src={hover.hdUrl} alt={hover.username ?? 'farol'} />
            {hover.username && <span className="hover-user">{hover.username}</span>}
          </div>
        )}

        <AudioPlayer />

        {!isSupabaseConfigured && (
          <div className="demo-badge">modo demo local · configurá Supabase para producción</div>
        )}
      </div>
    </div>
  )
}
