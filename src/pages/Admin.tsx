import { useEffect, useState, useCallback } from 'react'
import {
  listLanterns,
  uploadLantern,
  deleteLantern,
  updateLanternUsername,
  replaceLanternImage,
  normalizeUsername,
  type Lantern,
} from '../lib/lanterns'
import { isSupabaseConfigured } from '../lib/supabase'
import { signInAdmin, signOutAdmin, isFarolesAdmin } from '../lib/auth'

// En modo demo (sin backend) se entra con esta clave simple. Con Amplify, el
// login es contra Cognito (usuario real, no una clave incrustada en el bundle).
const PASSWORD = (import.meta.env.VITE_ADMIN_PASSWORD as string) || 'faroles2026'
const AUTH_KEY = 'faroles-admin-ok'
const USER_KEY = 'faroles-admin-user'

export default function Admin() {
  const [authed, setAuthed] = useState(
    isSupabaseConfigured ? false : sessionStorage.getItem(AUTH_KEY) === '1',
  )
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [items, setItems] = useState<Lantern[]>([])
  const [username, setUsername] = useState(sessionStorage.getItem(USER_KEY) ?? '')
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await listLanterns())
      setError(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authed) refresh()
  }, [authed, refresh])

  // Restaurar sesion de Supabase si ya habia login (y sigue siendo admin).
  useEffect(() => {
    if (!isSupabaseConfigured) return
    isFarolesAdmin()
      .then(setAuthed)
      .catch(() => setAuthed(false))
  }, [])

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!isSupabaseConfigured) {
      // modo demo: clave simple
      if (pass === PASSWORD) {
        sessionStorage.setItem(AUTH_KEY, '1')
        setAuthed(true)
      } else {
        setError('Contraseña incorrecta')
      }
      return
    }
    const res = await signInAdmin(email, pass)
    if (res.ok) setAuthed(true)
    else setError(res.error)
  }

  const logout = async () => {
    if (isSupabaseConfigured) await signOutAdmin()
    else sessionStorage.removeItem(AUTH_KEY)
    setAuthed(false)
    setEmail('')
    setPass('')
  }

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const handle = normalizeUsername(username)
    if (!handle) {
      setError('Poné el @usuario de quien sube antes de cargar imágenes.')
      return
    }
    sessionStorage.setItem(USER_KEY, handle)
    setUsername(handle)
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (list.length === 0) return
    setProgress({ done: 0, total: list.length })
    setError(null)
    for (let i = 0; i < list.length; i++) {
      try {
        await uploadLantern(list[i], handle)
      } catch (e) {
        setError(`Error subiendo ${list[i].name}: ${e}`)
      }
      setProgress({ done: i + 1, total: list.length })
    }
    setProgress(null)
    refresh()
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    onFiles(e.dataTransfer.files)
  }

  const remove = async (l: Lantern) => {
    if (!confirm('¿Borrar este farol?')) return
    try {
      await deleteLantern(l)
      setItems((prev) => prev.filter((x) => x.id !== l.id))
    } catch (e) {
      setError(String(e))
    }
  }

  const startEdit = (l: Lantern) => {
    setEditingId(l.id)
    setDraftName(l.username ?? '')
  }

  // Guarda el nombre editado. Se llama al salir del input (blur), con Enter, o al
  // usar "Quitar nombre". No exige boton Guardar. Update optimista: se refleja al
  // instante y solo escribe si cambio; si la escritura falla, revierte con refresh().
  const commitName = (l: Lantern, raw: string | null) => {
    const handle = raw && raw.trim() ? normalizeUsername(raw) : null
    setEditingId(null)
    if ((l.username ?? null) === handle) return // sin cambios, no escribe
    setItems((prev) => prev.map((x) => (x.id === l.id ? { ...x, username: handle } : x)))
    updateLanternUsername(l, handle).catch((e) => {
      setError(String(e))
      refresh()
    })
  }

  const cancelEdit = () => setEditingId(null)

  const replace = async (l: Lantern, files: FileList | null) => {
    const file = files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    setBusyId(l.id)
    try {
      await replaceLanternImage(l, file)
      await refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusyId(null)
    }
  }

  if (!authed) {
    return (
      <div className="admin-login">
        <form onSubmit={login}>
          <h1>Panel del Desfile</h1>
          <p>
            {isSupabaseConfigured
              ? 'Ingresá con tu usuario para administrar los faroles.'
              : 'Ingresá la contraseña para administrar los faroles.'}
          </p>
          {isSupabaseConfigured && (
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="username"
              autoFocus
            />
          )}
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="Contraseña"
            autoComplete="current-password"
            autoFocus={!isSupabaseConfigured}
          />
          <button type="submit">Entrar</button>
          {error && <p className="err">{error}</p>}
        </form>
      </div>
    )
  }

  return (
    <div className="admin">
      <header className="admin-head">
        <div>
          <h1>Faroles</h1>
          <span className="count">{items.length} imágenes</span>
        </div>
        <div className="head-actions">
          <a className="link" href="/" target="_blank" rel="noreferrer">
            Ver desfile
          </a>
          <button className="link" onClick={logout}>
            Salir
          </button>
          {!isSupabaseConfigured && <span className="demo-tag">modo demo local</span>}
        </div>
      </header>

      <div className="user-field">
        <label htmlFor="uploader">@usuario de quien sube</label>
        <input
          id="uploader"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onBlur={() => setUsername((u) => normalizeUsername(u) ?? '')}
          placeholder="@usuario"
          autoComplete="off"
          spellCheck={false}
          autoFocus
        />
        <p>Aparece siempre bajo los pies del personaje en el desfile.</p>
      </div>

      <label
        className={`dropzone ${dragging ? 'is-dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => onFiles(e.target.files)}
          hidden
        />
        <div>
          <strong>Arrastrá las imágenes acá</strong>
          <p>O hacé clic para elegirlas. Podés soltar tandas de 100 o 200.</p>
        </div>
      </label>

      {progress && (
        <div className="progress">
          Subiendo {progress.done} / {progress.total}
        </div>
      )}
      {error && <div className="err banner">{error}</div>}
      {loading && <div className="progress">Cargando…</div>}

      <div className="grid">
        {items.map((l) => (
          <div className="cell" key={l.id}>
            <img src={l.public_url} alt={l.username ?? l.caption ?? 'farol'} loading="lazy" />

            {busyId === l.id && <div className="cell-busy">Cambiando…</div>}

            <div className="cell-actions">
              <label className="cell-btn" title="Cambiar imagen">
                <ReplaceIcon />
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => replace(l, e.target.files)}
                />
              </label>
              <button className="cell-btn" title="Editar @usuario" onClick={() => startEdit(l)}>
                <EditIcon />
              </button>
              <button className="cell-btn danger" title="Borrar farol" onClick={() => remove(l)}>
                <TrashIcon />
              </button>
            </div>

            {editingId === l.id ? (
              <div className="cell-edit">
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="@usuario"
                  autoFocus
                  onBlur={() => commitName(l, draftName)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      commitName(l, draftName)
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      cancelEdit()
                    }
                  }}
                />
                <button
                  className="mini ghost"
                  // no robar el foco: evita que el blur guarde antes de procesar el clic
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commitName(l, null)}
                >
                  Quitar nombre
                </button>
                <span className="cell-hint">Enter guarda · Esc cancela</span>
              </div>
            ) : (
              <button className="cell-user" onClick={() => startEdit(l)} title="Editar @usuario">
                {l.username ?? 'sin nombre'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ReplaceIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path
        d="M12 6a6 6 0 0 1 5.2 3M18 4v3h-3M12 18a6 6 0 0 1-5.2-3M6 20v-3h3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path
        d="M4 20h4L18 10l-4-4L4 16v4zM14 6l4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path
        d="M5 7h14M10 7V5h4v2M6 7l1 13h10l1-13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
