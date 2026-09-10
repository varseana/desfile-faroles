import { createClient } from '@supabase/supabase-js'

// Faroles vive en el MISMO proyecto Supabase que "Juntos por Akira", pero
// aislado en su propio schema `faroles` (tablas, RLS y policies separadas de
// las de Akira en `public`). Asi las dos apps conviven sin chocar.
//
// Config del proyecto Supabase de Akira. Por defecto va horneada aca (la
// publishable key es PUBLICA por diseño: pensada para ir en el bundle del
// cliente; la seguridad la da RLS + la tabla faroles.admins, no el secreto de
// la key). Las env vars VITE_SUPABASE_* tienen prioridad si se definen, para
// poder apuntar a otro proyecto sin tocar codigo.
const DEFAULT_URL = 'https://turbsofuturtlbdsabfu.supabase.co'
const DEFAULT_ANON_KEY = 'sb_publishable_8Aw2RH64oUjhpq6R_gLRSw_HdCzbwfZ'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_URL
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || DEFAULT_ANON_KEY

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
