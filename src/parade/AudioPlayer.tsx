import { useEffect, useRef, useState } from 'react'

// Playlist del desfile. Los archivos viven en public/audio.
const TRACKS = [
  { title: 'Himno Patriótico al 15 de Septiembre', src: '/audio/himno-15-septiembre.mp3' },
  { title: 'Patriótica Costarricense de 1856', src: '/audio/patriotica-1856.mp3' },
  { title: 'Punto Guanacasteco', src: '/audio/punto-guanacasteco.mp3' },
]

const IDLE_MS = 3000 // colapsa a mini 3s despues de que el cursor sale del player

export default function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0) // 0..1
  const [expanded, setExpanded] = useState(true)
  const hoverRef = useRef(false)
  const idleTimer = useRef<number | undefined>(undefined)

  // Colapsa a mini 3s despues de que el cursor sale del player.
  // Solo el hover sobre el player lo expande, no el mouse en la pagina.
  const armCollapse = () => {
    window.clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => {
      if (!hoverRef.current) setExpanded(false)
    }, IDLE_MS)
  }

  useEffect(() => {
    armCollapse() // arranca expandido y colapsa solo si nadie lo toca
    return () => window.clearTimeout(idleTimer.current)
  }, [])

  const play = async () => {
    try {
      await audioRef.current?.play()
    } catch {
      /* autoplay bloqueado hasta que haya un gesto */
    }
  }

  const toggle = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) void play()
    else el.pause()
  }

  const go = (delta: number) => {
    setIndex((i) => (i + delta + TRACKS.length) % TRACKS.length)
    setProgress(0)
    // reproducir el nuevo track en el proximo tick (tras cambiar el src)
    window.setTimeout(() => void play(), 0)
  }

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = audioRef.current
    if (!el || !el.duration) return
    el.currentTime = Number(e.target.value) * el.duration
  }

  const track = TRACKS[index]

  return (
    <div
      className={`player ${expanded ? 'is-full' : 'is-mini'}`}
      onMouseEnter={() => {
        hoverRef.current = true
        window.clearTimeout(idleTimer.current)
        setExpanded(true)
      }}
      onMouseLeave={() => {
        hoverRef.current = false
        armCollapse()
      }}
    >
      <audio
        ref={audioRef}
        src={track.src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => go(1)}
        onTimeUpdate={(e) => {
          const el = e.currentTarget
          if (el.duration) setProgress(el.currentTime / el.duration)
        }}
      />

      <div className="player-body">
        <div className="player-title" title={track.title}>
          {track.title}
        </div>

        <div className="player-controls">
          <button className="pbtn" onClick={() => go(-1)} aria-label="Anterior" title="Anterior">
            <PrevIcon />
          </button>
          <button
            className="pbtn play"
            onClick={toggle}
            aria-label={playing ? 'Pausar' : 'Reproducir'}
            title={playing ? 'Pausar' : 'Reproducir'}
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button className="pbtn" onClick={() => go(1)} aria-label="Siguiente" title="Siguiente">
            <NextIcon />
          </button>
        </div>

        <input
          className="player-seek"
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          onChange={seek}
          aria-label="Posición de la pista"
        />
      </div>
    </div>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M8 5v14l11-7z" fill="currentColor" />
    </svg>
  )
}
function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" />
    </svg>
  )
}
function PrevIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M6 6h2v12H6zM20 6v12l-9-6z" fill="currentColor" />
    </svg>
  )
}
function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M16 6h2v12h-2zM4 6l9 6-9 6z" fill="currentColor" />
    </svg>
  )
}
