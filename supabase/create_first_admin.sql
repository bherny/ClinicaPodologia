-- 1. Crea primero el usuario desde Supabase Auth.
-- 2. Copia su auth.users.id y reemplaza los valores marcados.
-- 3. Ejecuta este SQL con el editor SQL de Supabase.

insert into public.perfiles (
  auth_user_id,
  nombres,
  apellidos,
  correo,
  telefono,
  rol,
  sede_id,
  activo
)
values (
  'REEMPLAZAR_AUTH_USER_ID'::uuid,
  'Administrador',
  'Body Feet',
  'admin@bodyfeet.pe',
  null,
  'administrador',
  null,
  true
)
on conflict (auth_user_id) do update
set rol = 'administrador',
    activo = true,
    updated_at = now();
