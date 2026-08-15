-- Caja Musa exclusiva en tiempo real y portal seguro del paciente por telefono verificado.
-- Ejecutar despues de 202608140004_podology_documents_and_branch_theme.sql.

begin;

create table if not exists public.caja_sede_sesiones (
  sede_id uuid primary key references public.sedes(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  auth_session_id text not null,
  perfil_id uuid references public.perfiles(id) on delete set null,
  abierto_en timestamptz not null default now(),
  ultimo_latido timestamptz not null default now(),
  expira_en timestamptz not null,
  updated_at timestamptz not null default now()
);

create unique index if not exists caja_sede_sesiones_auth_session_idx
  on public.caja_sede_sesiones (auth_session_id);
create index if not exists caja_sede_sesiones_expira_idx
  on public.caja_sede_sesiones (expira_en);

alter table public.caja_sede_sesiones enable row level security;
-- Sin politicas directas: los datos de sesion solo se consultan mediante RPC security definer.

-- Las autorizaciones antiguas dejaban abrir la caja desde varios equipos. Se revocan al migrar.
delete from public.caja_sede_autorizaciones
where sede_id = public.musa_cash_branch_id();
delete from public.caja_sede_sesiones
where sede_id = public.musa_cash_branch_id();

create or replace function public.current_auth_session_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(auth.jwt()->>'session_id', '');
$$;

create or replace function public.has_musa_cash_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(exists (
    select 1
    from public.caja_sede_sesiones s
    where s.sede_id = public.musa_cash_branch_id()
      and s.auth_user_id = auth.uid()
      and s.auth_session_id = public.current_auth_session_id()
      and s.expira_en > now()
      and s.ultimo_latido > now() - interval '90 seconds'
  ), false);
$$;

create or replace function public.get_musa_cash_exclusive_status()
returns table (
  sede_id uuid,
  configurado boolean,
  autorizado boolean,
  autorizado_hasta timestamptz,
  bloqueado_hasta timestamptz,
  intentos_restantes integer,
  ocupada_por_otro boolean,
  ocupada_por text,
  ocupada_desde timestamptz,
  ultimo_latido timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sede_id uuid := public.musa_cash_branch_id();
  v_config public.caja_sede_seguridad%rowtype;
  v_attempt public.caja_sede_intentos%rowtype;
  v_session public.caja_sede_sesiones%rowtype;
  v_session_id text := public.current_auth_session_id();
  v_authorized boolean := false;
  v_owner text;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  if v_sede_id is null then
    raise exception 'No se encontro la sede Musa.';
  end if;

  if not public.can_access_sede(v_sede_id) then
    raise exception 'No tienes acceso a la informacion financiera de Musa.';
  end if;

  delete from public.caja_sede_sesiones s
  where s.sede_id = v_sede_id
    and (s.expira_en <= now() or s.ultimo_latido <= now() - interval '90 seconds');

  select * into v_config
  from public.caja_sede_seguridad c
  where c.sede_id = v_sede_id;

  select * into v_attempt
  from public.caja_sede_intentos i
  where i.auth_user_id = auth.uid()
    and i.sede_id = v_sede_id;

  select * into v_session
  from public.caja_sede_sesiones s
  where s.sede_id = v_sede_id;

  v_authorized := v_session.sede_id is not null
    and v_session.auth_user_id = auth.uid()
    and v_session.auth_session_id = v_session_id
    and v_session.expira_en > now()
    and v_session.ultimo_latido > now() - interval '90 seconds';

  if v_session.perfil_id is not null then
    select nullif(trim(concat_ws(' ', p.nombres, p.apellidos)), '')
    into v_owner
    from public.perfiles p
    where p.id = v_session.perfil_id;
  end if;

  return query
  select
    v_sede_id,
    v_config.pin_hash is not null,
    v_authorized,
    case when v_authorized then v_session.expira_en else null end,
    case when v_attempt.bloqueado_hasta > now() then v_attempt.bloqueado_hasta else null end,
    greatest(
      coalesce(v_config.intentos_maximos, 5)::integer
        - case
            when v_attempt.ventana_iniciada_en is null
              or v_attempt.ventana_iniciada_en < now() - make_interval(mins => coalesce(v_config.duracion_bloqueo_minutos, 15))
              then 0
            else coalesce(v_attempt.intentos_fallidos, 0)::integer
          end,
      0
    ),
    v_session.sede_id is not null and not v_authorized,
    case when v_session.sede_id is not null and not v_authorized then coalesce(v_owner, 'otro usuario') else null end,
    case when v_session.sede_id is not null and not v_authorized then v_session.abierto_en else null end,
    case when v_session.sede_id is not null and not v_authorized then v_session.ultimo_latido else null end;
end;
$$;

create or replace function public.verify_musa_cash_pin(p_pin text)
returns table (
  exito boolean,
  mensaje text,
  autorizado_hasta timestamptz,
  bloqueado_hasta timestamptz,
  intentos_restantes integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_sede_id uuid := public.musa_cash_branch_id();
  v_config public.caja_sede_seguridad%rowtype;
  v_attempt public.caja_sede_intentos%rowtype;
  v_session public.caja_sede_sesiones%rowtype;
  v_now timestamptz := now();
  v_expires timestamptz;
  v_failed integer;
  v_blocked_until timestamptz;
  v_matches boolean;
  v_session_id text := public.current_auth_session_id();
  v_owner text;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  if v_session_id is null then
    raise exception 'La sesion no tiene un identificador seguro. Cierra sesion y vuelve a ingresar.';
  end if;

  if v_sede_id is null or not public.can_access_sede(v_sede_id) then
    raise exception 'No tienes acceso a la informacion financiera de Musa.';
  end if;

  select * into v_config
  from public.caja_sede_seguridad c
  where c.sede_id = v_sede_id
  for update;

  if v_config.sede_id is null or v_config.pin_hash is null then
    return query select false, 'El PIN de Caja Musa aun no esta configurado.'::text, null::timestamptz, null::timestamptz, 0;
    return;
  end if;

  delete from public.caja_sede_sesiones s
  where s.sede_id = v_sede_id
    and (s.expira_en <= v_now or s.ultimo_latido <= v_now - interval '90 seconds');

  select * into v_session
  from public.caja_sede_sesiones s
  where s.sede_id = v_sede_id;

  if v_session.sede_id is not null
    and (v_session.auth_user_id <> auth.uid() or v_session.auth_session_id <> v_session_id) then
    select nullif(trim(concat_ws(' ', p.nombres, p.apellidos)), '')
    into v_owner
    from public.perfiles p
    where p.id = v_session.perfil_id;

    return query select
      false,
      format('Caja Musa ya esta abierta por %s. Debe cerrarla o esperar aproximadamente 90 segundos sin actividad.', coalesce(v_owner, 'otro usuario'))::text,
      null::timestamptz,
      null::timestamptz,
      coalesce(v_config.intentos_maximos, 5)::integer;
    return;
  end if;

  if v_session.sede_id is not null then
    v_expires := v_now + interval '90 seconds';
    update public.caja_sede_sesiones
    set ultimo_latido = v_now,
        expira_en = v_expires,
        updated_at = v_now
    where sede_id = v_sede_id;

    return query select true, 'La sesion exclusiva de Caja Musa fue renovada.'::text, v_expires, null::timestamptz, v_config.intentos_maximos::integer;
    return;
  end if;

  insert into public.caja_sede_intentos (auth_user_id, sede_id)
  values (auth.uid(), v_sede_id)
  on conflict (auth_user_id, sede_id) do nothing;

  select * into v_attempt
  from public.caja_sede_intentos i
  where i.auth_user_id = auth.uid() and i.sede_id = v_sede_id
  for update;

  if v_attempt.bloqueado_hasta is not null and v_attempt.bloqueado_hasta > v_now then
    return query select false, 'Acceso bloqueado temporalmente por demasiados intentos.'::text, null::timestamptz, v_attempt.bloqueado_hasta, 0;
    return;
  end if;

  if v_attempt.bloqueado_hasta is not null
    or v_attempt.ventana_iniciada_en < v_now - make_interval(mins => v_config.duracion_bloqueo_minutos) then
    update public.caja_sede_intentos
    set intentos_fallidos = 0,
        ventana_iniciada_en = v_now,
        bloqueado_hasta = null,
        updated_at = v_now
    where auth_user_id = auth.uid() and sede_id = v_sede_id;
    v_attempt.intentos_fallidos := 0;
  end if;

  v_matches := coalesce(
    p_pin ~ '^[0-9]{4,8}$'
      and extensions.crypt(coalesce(p_pin, ''), v_config.pin_hash) = v_config.pin_hash,
    false
  );

  if not v_matches then
    v_failed := v_attempt.intentos_fallidos + 1;
    v_blocked_until := case
      when v_failed >= v_config.intentos_maximos
        then v_now + make_interval(mins => v_config.duracion_bloqueo_minutos)
      else null
    end;

    update public.caja_sede_intentos
    set intentos_fallidos = v_failed,
        bloqueado_hasta = v_blocked_until,
        updated_at = v_now
    where auth_user_id = auth.uid() and sede_id = v_sede_id;

    insert into public.auditoria (usuario_id, accion, tabla_afectada, registro_id, informacion_nueva)
    values (
      public.current_profile_id(),
      'pin_caja_musa_incorrecto',
      'caja_sede_seguridad',
      v_sede_id,
      jsonb_build_object('bloqueado', v_blocked_until is not null, 'intentos_restantes', greatest(v_config.intentos_maximos - v_failed, 0))
    );

    return query select
      false,
      case when v_blocked_until is null then 'PIN incorrecto. Intentalo nuevamente.' else 'Acceso bloqueado temporalmente por demasiados intentos.' end::text,
      null::timestamptz,
      v_blocked_until,
      greatest(v_config.intentos_maximos - v_failed, 0)::integer;
    return;
  end if;

  v_expires := v_now + interval '90 seconds';

  insert into public.caja_sede_sesiones (
    sede_id, auth_user_id, auth_session_id, perfil_id, abierto_en, ultimo_latido, expira_en, updated_at
  ) values (
    v_sede_id, auth.uid(), v_session_id, public.current_profile_id(), v_now, v_now, v_expires, v_now
  );

  update public.caja_sede_intentos
  set intentos_fallidos = 0,
      ventana_iniciada_en = v_now,
      bloqueado_hasta = null,
      updated_at = v_now
  where auth_user_id = auth.uid() and sede_id = v_sede_id;

  insert into public.auditoria (usuario_id, accion, tabla_afectada, registro_id, informacion_nueva)
  values (
    public.current_profile_id(),
    'apertura_exclusiva_caja_musa',
    'caja_sede_sesiones',
    v_sede_id,
    jsonb_build_object('sede_id', v_sede_id, 'expira_en', v_expires)
  );

  return query select true, 'Caja Musa abierta en este equipo.'::text, v_expires, null::timestamptz, v_config.intentos_maximos::integer;
end;
$$;

create or replace function public.heartbeat_musa_cash_access()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sede_id uuid := public.musa_cash_branch_id();
  v_now timestamptz := now();
begin
  if auth.uid() is null or v_sede_id is null then return false; end if;

  update public.caja_sede_sesiones
  set ultimo_latido = v_now,
      expira_en = v_now + interval '90 seconds',
      updated_at = v_now
  where sede_id = v_sede_id
    and auth_user_id = auth.uid()
    and auth_session_id = public.current_auth_session_id()
    and expira_en > v_now
    and ultimo_latido > v_now - interval '90 seconds';

  return found;
end;
$$;

create or replace function public.lock_musa_cash_access()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sede_id uuid := public.musa_cash_branch_id();
  v_deleted boolean := false;
begin
  if auth.uid() is null or v_sede_id is null then return; end if;

  delete from public.caja_sede_sesiones
  where sede_id = v_sede_id
    and auth_user_id = auth.uid()
    and auth_session_id = public.current_auth_session_id();
  v_deleted := found;

  delete from public.caja_sede_autorizaciones
  where auth_user_id = auth.uid() and sede_id = v_sede_id;

  if v_deleted then
    insert into public.auditoria (usuario_id, accion, tabla_afectada, registro_id, informacion_nueva)
    values (
      public.current_profile_id(),
      'cierre_caja_musa',
      'caja_sede_sesiones',
      v_sede_id,
      jsonb_build_object('sede_id', v_sede_id)
    );
  end if;
end;
$$;

create or replace function public.change_musa_cash_pin(p_current_pin text, p_new_pin text)
returns table (exito boolean, mensaje text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_sede_id uuid := public.musa_cash_branch_id();
  v_config public.caja_sede_seguridad%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede configurar el PIN de Caja Musa.';
  end if;

  if v_sede_id is null then
    raise exception 'No se encontro la sede Musa.';
  end if;

  if p_new_pin is null or p_new_pin !~ '^[0-9]{4,8}$' then
    return query select false, 'El nuevo PIN debe contener entre 4 y 8 digitos.'::text;
    return;
  end if;

  insert into public.caja_sede_seguridad (sede_id)
  values (v_sede_id)
  on conflict (sede_id) do nothing;

  select * into v_config
  from public.caja_sede_seguridad c
  where c.sede_id = v_sede_id
  for update;

  if v_config.pin_hash is not null
    and not coalesce(
      p_current_pin ~ '^[0-9]{4,8}$'
        and extensions.crypt(coalesce(p_current_pin, ''), v_config.pin_hash) = v_config.pin_hash,
      false
    ) then
    return query select false, 'PIN actual incorrecto.'::text;
    return;
  end if;

  update public.caja_sede_seguridad
  set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 12)),
      actualizado_por = public.current_profile_id(),
      updated_at = now()
  where sede_id = v_sede_id;

  delete from public.caja_sede_sesiones where sede_id = v_sede_id;
  delete from public.caja_sede_autorizaciones where sede_id = v_sede_id;
  delete from public.caja_sede_intentos where sede_id = v_sede_id;

  insert into public.auditoria (usuario_id, accion, tabla_afectada, registro_id, informacion_nueva)
  values (
    public.current_profile_id(),
    'cambio_pin_caja_musa',
    'caja_sede_seguridad',
    v_sede_id,
    jsonb_build_object('configurado', true, 'sesiones_revocadas', true)
  );

  return query select true, 'PIN de Caja Musa actualizado correctamente.'::text;
end;
$$;

-- La funcion se usa tanto desde RLS como desde el trigger de ventas.
create or replace function public.can_access_financial_sede(target_sede_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.can_access_sede(target_sede_id)
    and (not public.is_musa_branch(target_sede_id) or public.has_musa_cash_access()),
    false
  );
$$;

-- Realtime para que ventas, items y comprobantes se reflejen sin recargar.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ventas') then
      alter publication supabase_realtime add table public.ventas;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'venta_items') then
      alter publication supabase_realtime add table public.venta_items;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comprobantes') then
      alter publication supabase_realtime add table public.comprobantes;
    end if;
  end if;
end;
$$;

-- Portal del paciente: el telefono se obtiene de Auth despues de verificar el OTP.
create or replace function public.normalize_patient_phone(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when length(regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g')) >= 9
      then right(regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g'), 9)
    else null
  end;
$$;

create or replace function public.get_my_patient_portal()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_phone text;
  v_phone9 text;
  v_patient public.pacientes%rowtype;
  v_count integer;
  v_histories jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion con tu telefono.';
  end if;

  select u.phone into v_phone
  from auth.users u
  where u.id = auth.uid();

  v_phone9 := public.normalize_patient_phone(v_phone);
  if v_phone9 is null then
    return jsonb_build_object('linked', false, 'reason', 'phone_missing');
  end if;

  select count(*)
  into v_count
  from public.pacientes p
  where p.eliminado = false
    and (
      public.normalize_patient_phone(p.telefono) = v_phone9
      or public.normalize_patient_phone(p.telefono_alternativo) = v_phone9
    );

  if v_count = 0 then
    return jsonb_build_object('linked', false, 'reason', 'not_found', 'phone_last_digits', right(v_phone9, 4));
  end if;

  if v_count > 1 then
    return jsonb_build_object('linked', false, 'reason', 'ambiguous', 'phone_last_digits', right(v_phone9, 4));
  end if;

  select * into v_patient
  from public.pacientes p
  where p.eliminado = false
    and (
      public.normalize_patient_phone(p.telefono) = v_phone9
      or public.normalize_patient_phone(p.telefono_alternativo) = v_phone9
    )
  limit 1;

  select coalesce(jsonb_agg(q.payload order by q.sort_date desc), '[]'::jsonb)
  into v_histories
  from (
    select
      coalesce(c.fecha, hc.created_at::date) as sort_date,
      jsonb_build_object(
        'id', hc.id,
        'paciente_id', hc.paciente_id,
        'cita_id', hc.cita_id,
        'sede_id', hc.sede_id,
        'profesional_id', hc.profesional_id,
        'diagnostico', hc.diagnostico,
        'tratamiento_realizado', hc.tratamiento_realizado,
        'evolucion', hc.evolucion,
        'recomendaciones', hc.recomendaciones,
        'proxima_fecha_sugerida', hc.proxima_fecha_sugerida,
        'eliminado', hc.eliminado,
        'created_at', hc.created_at,
        'updated_at', hc.updated_at,
        'paciente', jsonb_build_object(
          'id', v_patient.id,
          'nombres', v_patient.nombres,
          'apellidos', v_patient.apellidos,
          'dni', v_patient.dni,
          'telefono', v_patient.telefono,
          'fecha_nacimiento', v_patient.fecha_nacimiento,
          'direccion', v_patient.direccion,
          'sexo', v_patient.sexo
        ),
        'sede', case when s.id is null then null else jsonb_build_object('id', s.id, 'nombre', s.nombre, 'direccion', s.direccion, 'telefono', s.telefono) end,
        'profesional', case when pr.id is null then null else jsonb_build_object('id', pr.id, 'nombres', pr.nombres, 'apellidos', pr.apellidos, 'especialidad', pr.especialidad, 'telefono', pr.telefono) end,
        'cita', case when c.id is null then null else jsonb_build_object(
          'id', c.id,
          'fecha', c.fecha,
          'hora_inicio', c.hora_inicio,
          'estado', c.estado,
          'diagnostico', c.diagnostico,
          'tratamiento', c.tratamiento,
          'observaciones', c.observaciones,
          'servicio', case when sv.id is null then null else jsonb_build_object('id', sv.id, 'nombre', sv.nombre) end,
          'expedientes_podologia', '[]'::jsonb
        ) end
      ) as payload
    from public.historias_clinicas hc
    left join public.sedes s on s.id = hc.sede_id
    left join public.profesionales pr on pr.id = hc.profesional_id
    left join public.citas c on c.id = hc.cita_id and c.eliminado = false
    left join public.servicios sv on sv.id = c.servicio_id
    where hc.paciente_id = v_patient.id
      and hc.eliminado = false
  ) q;

  return jsonb_build_object(
    'linked', true,
    'patient', jsonb_build_object(
      'id', v_patient.id,
      'nombres', v_patient.nombres,
      'apellidos', v_patient.apellidos,
      'dni', v_patient.dni,
      'telefono', v_patient.telefono,
      'telefono_alternativo', v_patient.telefono_alternativo,
      'fecha_nacimiento', v_patient.fecha_nacimiento,
      'sexo', v_patient.sexo,
      'direccion', v_patient.direccion,
      'observaciones', v_patient.observaciones,
      'sede_de_registro_id', v_patient.sede_de_registro_id,
      'creado_por', v_patient.creado_por,
      'eliminado', v_patient.eliminado,
      'created_at', v_patient.created_at,
      'updated_at', v_patient.updated_at
    ),
    'histories', v_histories
  );
end;
$$;

create or replace function public.record_patient_history_download(p_history_id uuid, p_file_name text default null)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_phone9 text;
  v_patient_id uuid;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion con tu telefono.';
  end if;

  select public.normalize_patient_phone(u.phone)
  into v_phone9
  from auth.users u
  where u.id = auth.uid();

  select count(*)
  into v_count
  from public.pacientes p
  where p.eliminado = false
    and (
      public.normalize_patient_phone(p.telefono) = v_phone9
      or public.normalize_patient_phone(p.telefono_alternativo) = v_phone9
    );

  if v_count = 1 then
    select p.id into v_patient_id
    from public.pacientes p
    where p.eliminado = false
      and (
        public.normalize_patient_phone(p.telefono) = v_phone9
        or public.normalize_patient_phone(p.telefono_alternativo) = v_phone9
      )
    limit 1;
  end if;

  if v_count <> 1 or not exists (
    select 1 from public.historias_clinicas hc
    where hc.id = p_history_id
      and hc.paciente_id = v_patient_id
      and hc.eliminado = false
  ) then
    raise exception 'No tienes permiso para descargar esta historia clinica.';
  end if;

  insert into public.auditoria (usuario_id, accion, tabla_afectada, registro_id, informacion_nueva)
  values (
    null,
    'descarga_historia_portal_paciente',
    'historias_clinicas',
    p_history_id,
    jsonb_strip_nulls(jsonb_build_object(
      'auth_user_id', auth.uid(),
      'paciente_id', v_patient_id,
      'telefono_ultimos4', right(v_phone9, 4),
      'file_name', nullif(trim(coalesce(p_file_name, '')), '')
    ))
  );
end;
$$;

revoke all on table public.caja_sede_sesiones from public;
revoke all on function public.current_auth_session_id() from public;
revoke all on function public.get_musa_cash_exclusive_status() from public;
revoke all on function public.heartbeat_musa_cash_access() from public;
revoke all on function public.normalize_patient_phone(text) from public;
revoke all on function public.get_my_patient_portal() from public;
revoke all on function public.record_patient_history_download(uuid, text) from public;

grant execute on function public.get_musa_cash_exclusive_status() to authenticated;
grant execute on function public.heartbeat_musa_cash_access() to authenticated;
grant execute on function public.get_my_patient_portal() to authenticated;
grant execute on function public.record_patient_history_download(uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;