import { createClient } from '@supabase/supabase-js'

// Faroles vive en el MISMO proyecto Supabase que "Juntos por Akira", pero
// aislado en su propio schema `faroles` (tablas, RLS y policies separadas de
// las de Akira en `public`). Asi las dos apps conviven sin chocar.
//
// Config por env (Vite): pega la URL y la anon key del proyecto de Akira.
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
// Si faltan, la app corre en modo demo LOCAL con IndexedDB (sin nube).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

// Bucket de Storage exclusivo de faroles (separado de cualquier cosa de Akira).
export const BUCKET = 'faroles-lanterns'

// Cliente apuntado al schema `faroles` (no `public`): todas las consultas
// `.from('lanterns')` resuelven a `faroles.lanterns`, nunca tocan tablas de Akira.
// El tipo se infiere de la factory para conservar el schema en los tipos.
function makeClient() {
  return createClient(url!, anonKey!, { db: { schema: 'faroles' } })
}

let _client: ReturnType<typeof makeClient> | null = null

export function supabase(): ReturnType<typeof makeClient> {
  if (!_client) {
    if (!isSupabaseConfigured) throw new Error('Supabase no configurado')
    _client = makeClient()
  }
  return _client
}
