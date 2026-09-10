import { supabase } from './supabase'

// Auth del panel /admin. Comparte el pool de usuarios de Supabase con Akira,
// pero el permiso de administrar faroles es EXPLICITO: el usuario tiene que
// estar en la tabla `faroles.admins`. Un admin de Akira no puede tocar faroles
// salvo que lo agreguen ahi, y viceversa (aislamiento por RLS + esta tabla).

export type SignInResult = { ok: true } | { ok: false; error: string }

// Inicia sesion y verifica que sea admin de faroles. Si no lo es, cierra sesion
// para no dejar una sesion valida sin permisos.
export async function signInAdmin(email: string, password: string): Promise<SignInResult> {
  const sb = supabase()
  const { error } = await sb.auth.signInWithPassword({ email, password })
  if (error) return { ok: false, error: error.message }
  if (!(await isFarolesAdmin())) {
    await sb.auth.signOut()
    return { ok: false, error: 'Esta cuenta no es admin del desfile de faroles.' }
  }
  return { ok: true }
}

export async function signOutAdmin(): Promise<void> {
  await supabase().auth.signOut()
}

// True si hay sesion activa Y el usuario esta en faroles.admins.
export async function isFarolesAdmin(): Promise<boolean> {
  const sb = supabase()
  const { data: userRes } = await sb.auth.getUser()
  if (!userRes.user) return false
  // RLS de faroles.admins solo deja ver la propia fila: si vuelve una fila, es admin.
  const { data, error } = await sb.from('admins').select('user_id').limit(1)
  if (error) return false
  return (data?.length ?? 0) > 0
}
