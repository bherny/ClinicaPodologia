begin;

-- Las cuentas del personal se crean en Supabase Auth. Este trigger genera la
-- fila operativa que la aplicacion necesita, sin exponer auth.users al frontend.
create or replace function public.handle_new_staff_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(new.email));
  v_names text;
  v_last_names text;
begin
  -- El portal de pacientes no depende de cuentas Auth. Las cuentas sin correo
  -- no se convierten accidentalmente en personal.
  if v_email is null or v_email = '' then
    return new;
  end if;

  v_names := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'nombres'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''),
    initcap(replace(split_part(v_email, '@', 1), '.', ' ')),
    'Usuario'
  );
  v_last_names := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'apellidos'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'last_name'), ''),
    'Body Feet'
  );

  insert into public.perfiles (
    auth_user_id,
    nombres,
    apellidos,
    correo,
    rol,
    activo
  )
  values (
    new.id,
    v_names,
    v_last_names,
    v_email,
    'recepcion',
    true
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_staff_profile on auth.users;
create trigger on_auth_user_created_staff_profile
after insert on auth.users
for each row execute function public.handle_new_staff_auth_user();

-- Recupera cuentas que ya fueron creadas en Authentication pero aun no aparecen
-- en Administracion > Usuarios.
insert into public.perfiles (
  auth_user_id,
  nombres,
  apellidos,
  correo,
  rol,
  activo
)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'nombres'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'first_name'), ''),
    initcap(replace(split_part(lower(trim(u.email)), '@', 1), '.', ' ')),
    'Usuario'
  ),
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'apellidos'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'last_name'), ''),
    'Body Feet'
  ),
  lower(trim(u.email)),
  'recepcion',
  true
from auth.users u
where u.email is not null
  and trim(u.email) <> ''
  and not exists (
    select 1
    from public.perfiles p
    where p.auth_user_id = u.id
  )
on conflict do nothing;

revoke all on function public.handle_new_staff_auth_user() from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
