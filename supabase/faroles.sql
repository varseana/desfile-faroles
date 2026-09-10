-- ============================================================================
-- Desfile de Faroles :: migracion aditiva sobre el proyecto Supabase de Akira.
-- TODO es aditivo y aislado en el schema `faroles`: NO toca ninguna tabla,
-- policy ni dato de Akira (que vive en `public`). Seguro de correr en prod.
-- Ejecutar en: Supabase Dashboard > SQL Editor (una sola vez).
-- ============================================================================

-- 1. Schema aislado ----------------------------------------------------------
create schema if not exists faroles;

-- 2. Tabla de faroles --------------------------------------------------------
--    storage_path = HD en el bucket; thumb_path = miniatura (sprites).
create table if not exists faroles.lanterns (
  id           uuid primary key default gen_random_uuid(),
  storage_path text        not null,
  thumb_path   text,
  username     text,
  caption      text,
  created_at   timestamptz not null default now()
);
create index if not exists lanterns_created_idx on faroles.lanterns (created_at);

-- 3. Admins de faroles (independientes de los admins de Akira) ---------------
--    Un usuario solo administra faroles si esta en esta tabla.
create table if not exists faroles.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- 4. RLS ----------------------------------------------------------------------
alter table faroles.lanterns enable row level security;
alter table faroles.admins   enable row level security;

-- lectura publica del desfile (anon + authenticated)
drop policy if exists lanterns_public_read on faroles.lanterns;
create policy lanterns_public_read on faroles.lanterns
  for select using (true);

-- escritura (insert/update/delete) solo para admins de faroles
drop policy if exists lanterns_admin_write on faroles.lanterns;
create policy lanterns_admin_write on faroles.lanterns
  for all
  using     (exists (select 1 from faroles.admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from faroles.admins a where a.user_id = auth.uid()));

-- cada usuario solo ve su propia fila de admins (para el chequeo isFarolesAdmin)
drop policy if exists admins_self_read on faroles.admins;
create policy admins_self_read on faroles.admins
  for select using (user_id = auth.uid());

-- 5. Grants (PostgREST necesita USAGE en el schema + permisos de tabla) -------
grant usage on schema faroles to anon, authenticated;
grant select                         on faroles.lanterns to anon, authenticated;
grant insert, update, delete         on faroles.lanterns to authenticated;
grant select                         on faroles.admins   to authenticated;

-- 6. Storage: bucket publico exclusivo de faroles ----------------------------
insert into storage.buckets (id, name, public)
values ('faroles-lanterns', 'faroles-lanterns', true)
on conflict (id) do nothing;

-- lectura publica de los objetos del bucket
drop policy if exists faroles_obj_read on storage.objects;
create policy faroles_obj_read on storage.objects
  for select using (bucket_id = 'faroles-lanterns');

-- subir/editar/borrar objetos solo admins de faroles
drop policy if exists faroles_obj_write on storage.objects;
create policy faroles_obj_write on storage.objects
  for all
  using (
    bucket_id = 'faroles-lanterns'
    and exists (select 1 from faroles.admins a where a.user_id = auth.uid())
  )
  with check (
    bucket_id = 'faroles-lanterns'
    and exists (select 1 from faroles.admins a where a.user_id = auth.uid())
  );

-- ============================================================================
-- DESPUES DE CORRER ESTO:
--   a) Supabase > Project Settings > API > "Exposed schemas": agrega `faroles`.
--   b) Crea el usuario admin (Authentication > Users > Add user, con password),
--      copia su UUID y registralo:
--        insert into faroles.admins (user_id) values ('<UUID-del-usuario>');
-- ============================================================================
