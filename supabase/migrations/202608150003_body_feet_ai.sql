-- La IA de Body Feet: cuota por usuario y auditoria sin guardar conversaciones.
-- Ejecutar despues de 202608150002_patient_pin_portal.sql.

begin;

create table if not exists public.ia_limites (
  perfil_id uuid primary key references public.perfiles(id) on delete cascade,
  ventana_iniciada_en timestamptz not null default now(),
  solicitudes integer not null default 0 check (solicitudes >= 0),
  updated_at timestamptz not null default now()
);

alter table public.ia_limites enable row level security;
revoke all on table public.ia_limites from public, anon, authenticated;

create or replace function public.consume_body_feet_ai_quota()
returns table (
  permitido boolean,
  restantes integer,
  reintentar_en_segundos integer,
  perfil_id uuid,
  rol text,
  sede_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.perfiles%rowtype;
  v_limit public.ia_limites%rowtype;
  v_now timestamptz := now();
  v_window interval := interval '5 minutes';
  v_max_requests constant integer := 20;
begin
  if auth.uid() is null then
    raise exception 'Autenticacion requerida' using errcode = '42501';
  end if;

  select p.* into v_profile
  from public.perfiles p
  where p.auth_user_id = auth.uid()
    and p.activo = true
  limit 1;

  if v_profile.id is null then
    raise exception 'Perfil activo requerido' using errcode = '42501';
  end if;

  insert into public.ia_limites (perfil_id, ventana_iniciada_en, solicitudes, updated_at)
  values (v_profile.id, v_now, 0, v_now)
  on conflict on constraint ia_limites_pkey do nothing;

  select l.* into v_limit
  from public.ia_limites l
  where l.perfil_id = v_profile.id
  for update;

  if v_now - v_limit.ventana_iniciada_en >= v_window then
    v_limit.ventana_iniciada_en := v_now;
    v_limit.solicitudes := 1;
    permitido := true;
  elsif v_limit.solicitudes < v_max_requests then
    v_limit.solicitudes := v_limit.solicitudes + 1;
    permitido := true;
  else
    permitido := false;
  end if;

  update public.ia_limites l
  set ventana_iniciada_en = v_limit.ventana_iniciada_en,
      solicitudes = v_limit.solicitudes,
      updated_at = v_now
  where l.perfil_id = v_profile.id;

  restantes := greatest(v_max_requests - v_limit.solicitudes, 0);
  reintentar_en_segundos := case
    when permitido then 0
    else greatest(ceil(extract(epoch from (v_limit.ventana_iniciada_en + v_window - v_now)))::integer, 1)
  end;
  perfil_id := v_profile.id;
  rol := v_profile.rol::text;
  sede_id := v_profile.sede_id;
  return next;
end;
$$;

create or replace function public.record_body_feet_ai_usage(
  p_model text,
  p_status text,
  p_input_chars integer default 0,
  p_output_chars integer default 0,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Autenticacion requerida' using errcode = '42501';
  end if;

  select p.id into v_profile_id
  from public.perfiles p
  where p.auth_user_id = auth.uid()
    and p.activo = true
  limit 1;

  if v_profile_id is null then
    raise exception 'Perfil activo requerido' using errcode = '42501';
  end if;

  insert into public.auditoria (
    usuario_id,
    accion,
    tabla_afectada,
    registro_id,
    informacion_nueva
  ) values (
    v_profile_id,
    'consulta_ia_body_feet',
    'ia_body_feet',
    v_profile_id,
    jsonb_build_object(
      'model', left(coalesce(nullif(trim(p_model), ''), 'no_indicado'), 80),
      'status', case when p_status in ('ok', 'error', 'limitado') then p_status else 'error' end,
      'input_chars', least(greatest(coalesce(p_input_chars, 0), 0), 12000),
      'output_chars', least(greatest(coalesce(p_output_chars, 0), 0), 6000),
      'error_code', nullif(left(regexp_replace(coalesce(p_error_code, ''), '[^a-zA-Z0-9_-]', '', 'g'), 60), '')
    )
  );
end;
$$;

revoke all on function public.consume_body_feet_ai_quota() from public;
revoke all on function public.record_body_feet_ai_usage(text, text, integer, integer, text) from public;
grant execute on function public.consume_body_feet_ai_quota() to authenticated;
grant execute on function public.record_body_feet_ai_usage(text, text, integer, integer, text) to authenticated;

notify pgrst, 'reload schema';

commit;

