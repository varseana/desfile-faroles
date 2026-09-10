import { isSupabaseConfigured, supabase, BUCKET } from './supabase'
import { makeVariants } from './image'

export type Lantern = {
  id: string
  public_url: string // HD (para el hover grande)
  storage_path: string
  thumb_url?: string | null // miniatura comprimida (para los sprites del desfile)
  thumb_path?: string | null
  username?: string | null
  caption?: string | null
  created_at?: string
}

// Fila cruda de faroles.lanterns
type Row = {
  id: string
  storage_path: string
  thumb_path: string | null
  username: string | null
  caption: string | null
  created_at: string | null
}

// Normaliza a un unico "@handle": recorta, quita @ repetidos al inicio y
// vuelve a anteponer uno solo. Devuelve null si queda vacio.
export function normalizeUsername(raw: string): string | null {
  const t = raw.trim().replace(/^@+/, '').trim()
  return t ? '@' + t : null
}

// URL publica y ESTABLE del bucket (no expira, a diferencia de las presignadas
// de S3): evita el parpadeo entre refrescos del desfile sin cache adicional.
function publicUrl(path: string): string {
  return supabase().storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

// ---------------------------------------------------------------------------
// Fallback local (IndexedDB) para dev sin nube. Guarda dos blobs comprimidos.
// ---------------------------------------------------------------------------
const DB_NAME = 'faroles-demo'
const STORE = 'lanterns'

type LocalRow = {
  id: string
  hd: Blob
  thumb: Blob
  blob?: Blob // compat con registros viejos (pre-thumb)
  username?: string | null
  caption?: string | null
}

// Cache de object URLs por id: URLs estables entre refrescos en modo demo.
const urlCache = new Map<string, { hd: string; thumb: string }>()

function cachedUrls(id: string, hd: Blob, thumb: Blob): { hd: string; thumb: string } {
  let e = urlCache.get(id)
  if (!e) {
    e = { hd: URL.createObjectURL(hd), thumb: URL.createObjectURL(thumb) }
    urlCache.set(id, e)
  }
  return e
}

function invalidateUrls(id: string): void {
  const e = urlCache.get(id)
  if (e) {
    URL.revokeObjectURL(e.hd)
    URL.revokeObjectURL(e.thumb)
    urlCache.delete(id)
  }
}

function openLocalDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function localList(): Promise<Lantern[]> {
  const db = await openLocalDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => {
      const rows = (req.result as LocalRow[]) || []
      resolve(
        rows.map((r) => {
          const hd = r.hd ?? r.blob!
          const thumb = r.thumb ?? hd
          const urls = cachedUrls(r.id, hd, thumb)
          return {
            id: r.id,
            storage_path: r.id,
            public_url: urls.hd,
            thumb_url: urls.thumb,
            username: r.username ?? null,
            caption: r.caption ?? null,
          }
        }),
      )
    }
    req.onerror = () => reject(req.error)
  })
}

async function localAdd(file: File, username: string | null): Promise<void> {
  const { thumb, hd } = await makeVariants(file)
  const db = await openLocalDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({ id: crypto.randomUUID(), hd, thumb, username, caption: file.name })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function localDelete(id: string): Promise<void> {
  const db = await openLocalDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  invalidateUrls(id)
}

async function localPatch(
  id: string,
  patch: { username?: string | null; hd?: Blob; thumb?: Blob },
): Promise<void> {
  const db = await openLocalDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const get = store.get(id)
    get.onsuccess = () => {
      const rec = get.result
      if (rec) {
        Object.assign(rec, patch)
        store.put(rec)
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  if (patch.hd || patch.thumb) invalidateUrls(id)
}

// ---------------------------------------------------------------------------
// Helpers Supabase Storage (sube thumb + hd al bucket y devuelve los paths)
// ---------------------------------------------------------------------------
async function uploadVariants(file: File): Promise<{ hdPath: string; thumbPath: string }> {
  const { thumb, hd } = await makeVariants(file)
  const uuid = crypto.randomUUID()
  const hdPath = `${uuid}.jpg`
  const thumbPath = `${uuid}_t.jpg`
  const sb = supabase()
  const up = async (path: string, body: Blob) => {
    const { error } = await sb.storage.from(BUCKET).upload(path, body, { contentType: 'image/jpeg' })
    if (error) throw new Error(error.message)
  }
  await up(hdPath, hd)
  await up(thumbPath, thumb)
  return { hdPath, thumbPath }
}

async function removeObjects(paths: (string | null | undefined)[]): Promise<void> {
  const clean = paths.filter(Boolean) as string[]
  if (clean.length) await supabase().storage.from(BUCKET).remove(clean)
}

// ---------------------------------------------------------------------------
// API publica (misma firma con Supabase o IndexedDB)
// ---------------------------------------------------------------------------
export async function listLanterns(): Promise<Lantern[]> {
  if (!isSupabaseConfigured) return localList()

  const { data, error } = await supabase()
    .from('lanterns')
    .select('id, storage_path, thumb_path, username, caption, created_at')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)

  return (data as Row[]).map((row) => ({
    id: row.id,
    storage_path: row.storage_path,
    thumb_path: row.thumb_path,
    public_url: publicUrl(row.storage_path),
    thumb_url: publicUrl(row.thumb_path ?? row.storage_path),
    username: row.username,
    caption: row.caption,
    created_at: row.created_at ?? undefined,
  }))
}

export async function uploadLantern(file: File, username?: string | null): Promise<void> {
  const handle = normalizeUsername(username ?? '')
  if (!isSupabaseConfigured) return localAdd(file, handle)

  const { hdPath, thumbPath } = await uploadVariants(file)
  const { error } = await supabase()
    .from('lanterns')
    .insert({ storage_path: hdPath, thumb_path: thumbPath, username: handle, caption: file.name })
  if (error) throw new Error(error.message)
}

export async function deleteLantern(l: Lantern): Promise<void> {
  if (!isSupabaseConfigured) return localDelete(l.id)

  const { error } = await supabase().from('lanterns').delete().eq('id', l.id)
  if (error) throw new Error(error.message)
  await removeObjects([l.storage_path, l.thumb_path]) // best-effort en el bucket
}

// Cambia el @usuario de un farol (null para quitarlo).
export async function updateLanternUsername(l: Lantern, username: string | null): Promise<void> {
  const handle = username ? normalizeUsername(username) : null
  if (!isSupabaseConfigured) return localPatch(l.id, { username: handle })

  const { error } = await supabase().from('lanterns').update({ username: handle }).eq('id', l.id)
  if (error) throw new Error(error.message)
}

// Reemplaza la imagen (thumb + hd) manteniendo el mismo farol. Borra las anteriores.
export async function replaceLanternImage(l: Lantern, file: File): Promise<void> {
  if (!isSupabaseConfigured) {
    const { thumb, hd } = await makeVariants(file)
    return localPatch(l.id, { hd, thumb })
  }

  const oldPaths = [l.storage_path, l.thumb_path]
  const { hdPath, thumbPath } = await uploadVariants(file)
  const { error } = await supabase()
    .from('lanterns')
    .update({ storage_path: hdPath, thumb_path: thumbPath })
    .eq('id', l.id)
  if (error) throw new Error(error.message)
  await removeObjects(oldPaths)
}
