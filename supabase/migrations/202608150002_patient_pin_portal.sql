-- Portal del paciente sin costo SMS: telefono registrado + PIN privado.
-- Ejecutar despues de 202608150001_realtime_cash_and_patient_portal.sql.

begin;

create table if not exists public.paciente_portal_accesos (
  paciente_id uuid primary key references public.pacientes(id) on delete cascade,
  pin_hash text not null,
  activo boolean not null default true,
  intentos_fallidos integer not null default 0 check (intentos_fallidos >= 0),
  ventana_iniciada_en timestamptz,
  bloqueado_hasta timestamptz,
  actualizado_por uuid references public.perfiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.paciente_portal_sesiones (
  token_hash text primary key,
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists paciente_portal_sesiones_patient_idx
  on public.paciente_portal_sesiones (paciente_id);
create index if not exists paciente_portal_sesiones_expires_idx
  on public.paciente_portal_sesiones (expires_at);

alter table public.paciente_portal_accesos enable row level security;
alter table public.paciente_portal_sesiones enable row level security;

revoke all on table public.paciente_portal_accesos from public, anon, authenticated;
revoke all on table public.paciente_portal_sesiones from public, anon, authenticated;

create or replace function public.build_patient_portal_payload(p_patient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient public.pacientes%rowtype;
  v_histories jsonb := '[]'::jsonb;
begin
  select * into v_patient
  from public.pacientes p
  where p.id = p_patient_id
    and p.eliminado = false;

  if v_patient.id is null then
    return jsonb_build_object('linked', false, 'reason', 'not_found');
  end if;

  select coalesce(
    jsonb_agg(q.payload order by q.sort_date desc, q.sort_created desc),
    '[]'::jsonb
  )
  into v_histories
  from (
    select
      coalesce(c.fecha, hc.created_at::date) as sort_date,
      hc.created_at as sort_created,
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
        'sede', case
          when s.id is null then null
          else jsonb_build_object(
            'id', s.id,
            'nombre', s.nombre,
            'direccion', s.direccion,
            'telefono', s.telefono
          )
        end,
        'profesional', case
          when pr.id is null then null
          else jsonb_build_object(
            'id', pr.id,
            'nombres', pr.nombres,
            'apellidos', pr.apellidos,
            'especialidad', pr.especialidad,
            'telefono', pr.telefono
          )
        end,
        'cita', case
          when c.id is null then null
          else jsonb_build_object(
            'id', c.id,
            'fecha', c.fecha,
            'hora_inicio', c.hora_inicio,
            'estado', c.estado,
            'diagnostico', c.diagnostico,
            'tratamiento', c.tratamiento,
            'observaciones', c.observaciones,
            'servicio', case
              when sv.id is null then null
              else jsonb_build_object('id', sv.id, 'nombre', sv.nombre)
            end,
            'expedientes_podologia', '[]'::jsonb
          )
        end
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

create or replace function public.configure_patient_portal_pin(
  p_patient_id uuid,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_patient public.pacientes%rowtype;
begin
  if auth.uid() is null or not (public.is_admin() or public.is_recepcion()) then
    raise exception 'No tienes permiso para configurar el acceso del paciente.';
  end if;

  select * into v_patient
  from public.pacientes p
  where p.id = p_patient_id
    and p.eliminado = false;

  if v_patient.id is null or not public.can_access_sede(v_patient.sede_de_registro_id) then
    raise exception 'No tienes acceso a este paciente.';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{6,10}$' then
    raise exception 'El PIN debe contener entre 6 y 10 digitos.';
  end if;

  insert into public.paciente_portal_accesos (
    paciente_id,
    pin_hash,
    activo,
    intentos_fallidos,
    ventana_iniciada_en,
    bloqueado_hasta,
    actualizado_por,
    updated_at
  )
  values (
    p_patient_id,
    extensions.crypt(p_pin, extensions.gen_salt('bf', 12)),
    true,
    0,
    now(),
    null,
    public.current_profile_id(),
    now()
  )
  on conflict (paciente_id) do update
  set pin_hash = excluded.pin_hash,
      activo = true,
      intentos_fallidos = 0,
      ventana_iniciada_en = now(),
      bloqueado_hasta = null,
      actualizado_por = public.current_profile_id(),
      updated_at = now();

  delete from public.paciente_portal_sesiones
  where paciente_id = p_patient_id;

  insert into public.auditoria (
    usuario_id,
    accion,
    tabla_afectada,
    registro_id,
    informacion_nueva
  )
  values (
    public.current_profile_id(),
    'configuracion_pin_portal_paciente',
    'paciente_portal_accesos',
    p_patient_id,
    jsonb_build_object('activo', true, 'sesiones_revocadas', true)
  );

  return jsonb_build_object(
    'success', true,
    'message', 'PIN del portal configurado correctamente.'
  );
end;
$$;

create or replace function public.get_patient_portal_access_status(p_patient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient public.pacientes%rowtype;
  v_access public.paciente_portal_accesos%rowtype;
begin
  if auth.uid() is null or not (public.is_admin() or public.is_recepcion()) then
    raise exception 'No tienes permiso para consultar este acceso.';
  end if;

  select * into v_patient
  from public.pacientes p
  where p.id = p_patient_id
    and p.eliminado = false;

  if v_patient.id is null or not public.can_access_sede(v_patient.sede_de_registro_id) then
    raise exception 'No tienes acceso a este paciente.';
  end if;

  select * into v_access
  from public.paciente_portal_accesos a
  where a.paciente_id = p_patient_id;

  return jsonb_build_object(
    'configured', v_access.paciente_id is not null,
    'active', coalesce(v_access.activo, false),
    'blocked_until', case
      when v_access.bloqueado_hasta > now() then v_access.bloqueado_hasta
      else null
    end,
    'updated_at', v_access.updated_at
  );
end;
$$;

create or replace function public.revoke_patient_portal_access(p_patient_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient public.pacientes%rowtype;
begin
  if auth.uid() is null or not (public.is_admin() or public.is_recepcion()) then
    raise exception 'No tienes permiso para revocar este acceso.';
  end if;

  select * into v_patient
  from public.pacientes p
  where p.id = p_patient_id
    and p.eliminado = false;

  if v_patient.id is null or not public.can_access_sede(v_patient.sede_de_registro_id) then
    raise exception 'No tienes acceso a este paciente.';
  end if;

  update public.paciente_portal_accesos
  set activo = false,
      intentos_fallidos = 0,
      bloqueado_hasta = null,
      actualizado_por = public.current_profile_id(),
      updated_at = now()
  where paciente_id = p_patient_id;

  delete from public.paciente_portal_sesiones
  where paciente_id = p_patient_id;

  insert into public.auditoria (
    usuario_id,
    accion,
    tabla_afectada,
    registro_id,
    informacion_nueva
  )
  values (
    public.current_profile_id(),
    'revocacion_portal_paciente',
    'paciente_portal_accesos',
    p_patient_id,
    jsonb_build_object('activo', false)
  );
end;
$$;

create or replace function public.login_patient_portal(
  p_phone text,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_phone9 text := public.normalize_patient_phone(p_phone);
  v_patient_id uuid;
  v_patient_count integer := 0;
  v_access public.paciente_portal_accesos%rowtype;
  v_now timestamptz := now();
  v_failed integer;
  v_blocked_until timestamptz;
  v_matches boolean := false;
  v_token text;
  v_token_hash text;
  v_expires timestamptz;
begin
  if v_phone9 is null or p_pin is null or p_pin !~ '^[0-9]{6,10}$' then
    return jsonb_build_object(
      'success', false,
      'message', 'Telefono o PIN incorrecto.'
    );
  end if;

  select count(*)
  into v_patient_count
  from public.pacientes p
  where p.eliminado = false
    and (
      public.normalize_patient_phone(p.telefono) = v_phone9
      or public.normalize_patient_phone(p.telefono_alternativo) = v_phone9
    );

  if v_patient_count <> 1 then
    return jsonb_build_object(
      'success', false,
      'message', 'Telefono o PIN incorrecto.'
    );
  end if;

  select p.id
  into v_patient_id
  from public.pacientes p
  where p.eliminado = false
    and (
      public.normalize_patient_phone(p.telefono) = v_phone9
      or public.normalize_patient_phone(p.telefono_alternativo) = v_phone9
    )
  limit 1;

  select * into v_access
  from public.paciente_portal_accesos a
  where a.paciente_id = v_patient_id
  for update;

  if v_access.paciente_id is null or not v_access.activo then
    return jsonb_build_object(
      'success', false,
      'message', 'Telefono o PIN incorrecto.'
    );
  end if;

  if v_access.bloqueado_hasta is not null and v_access.bloqueado_hasta > v_now then
    return jsonb_build_object(
      'success', false,
      'message', 'Acceso bloqueado temporalmente por demasiados intentos.',
      'blocked_until', v_access.bloqueado_hasta
    );
  end if;

  if v_access.ventana_iniciada_en is null
    or v_access.ventana_iniciada_en < v_now - interval '15 minutes' then
    update public.paciente_portal_accesos
    set intentos_fallidos = 0,
        ventana_iniciada_en = v_now,
        bloqueado_hasta = null,
        updated_at = v_now
    where paciente_id = v_patient_id;

    v_access.intentos_fallidos := 0;
    v_access.ventana_iniciada_en := v_now;
    v_access.bloqueado_hasta := null;
  end if;

  v_matches := coalesce(
    extensions.crypt(p_pin, v_access.pin_hash) = v_access.pin_hash,
    false
  );

  if not v_matches then
    v_failed := coalesce(v_access.intentos_fallidos, 0) + 1;
    v_blocked_until := case
      when v_failed >= 5 then v_now + interval '15 minutes'
      else null
    end;

    update public.paciente_portal_accesos
    set intentos_fallidos = v_failed,
        bloqueado_hasta = v_blocked_until,
        updated_at = v_now
    where paciente_id = v_patient_id;

    return jsonb_build_object(
      'success', false,
      'message', case
        when v_blocked_until is null then 'Telefono o PIN incorrecto.'
        else 'Acceso bloqueado temporalmente por demasiados intentos.'
      end,
      'attempts_remaining', greatest(5 - v_failed, 0),
      'blocked_until', v_blocked_until
    );
  end if;

  update public.paciente_portal_accesos
  set intentos_fallidos = 0,
      ventana_iniciada_en = v_now,
      bloqueado_hasta = null,
      updated_at = v_now
  where paciente_id = v_patient_id;

  delete from public.paciente_portal_sesiones
  where paciente_id = v_patient_id
     or expires_at <= v_now
     or last_seen_at <= v_now - interval '30 minutes';

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  v_expires := v_now + interval '8 hours';

  insert into public.paciente_portal_sesiones (
    token_hash,
    paciente_id,
    created_at,
    last_seen_at,
    expires_at
  )
  values (
    v_token_hash,
    v_patient_id,
    v_now,
    v_now,
    v_expires
  );

  insert into public.auditoria (
    usuario_id,
    accion,
    tabla_afectada,
    registro_id,
    informacion_nueva
  )
  values (
    null,
    'acceso_portal_paciente',
    'paciente_portal_sesiones',
    v_patient_id,
    jsonb_build_object(
      'paciente_id', v_patient_id,
      'telefono_ultimos4', right(v_phone9, 4),
      'expires_at', v_expires
    )
  );

  return jsonb_build_object(
    'success', true,
    'token', v_token,
    'expires_at', v_expires
  );
end;
$$;

create or replace function public.get_patient_portal_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token_hash text;
  v_session public.paciente_portal_sesiones%rowtype;
  v_now timestamptz := now();
begin
  if p_token is null or length(p_token) <> 64 then
    raise exception 'Sesion del paciente invalida.';
  end if;

  v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  delete from public.paciente_portal_sesiones
  where expires_at <= v_now
     or last_seen_at <= v_now - interval '30 minutes';

  select * into v_session
  from public.paciente_portal_sesiones s
  where s.token_hash = v_token_hash
    and s.expires_at > v_now
    and s.last_seen_at > v_now - interval '30 minutes';

  if v_session.token_hash is null then
    raise exception 'La sesion del paciente vencio. Ingresa nuevamente.';
  end if;

  if not exists (
    select 1
    from public.paciente_portal_accesos a
    where a.paciente_id = v_session.paciente_id
      and a.activo = true
  ) then
    raise exception 'El acceso del paciente fue desactivado.';
  end if;

  update public.paciente_portal_sesiones
  set last_seen_at = v_now
  where token_hash = v_token_hash;

  return public.build_patient_portal_payload(v_session.paciente_id);
end;
$$;

create or replace function public.record_patient_history_download_by_token(
  p_token text,
  p_history_id uuid,
  p_file_name text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token_hash text;
  v_session public.paciente_portal_sesiones%rowtype;
  v_now timestamptz := now();
begin
  if p_token is null or length(p_token) <> 64 then
    raise exception 'Sesion del paciente invalida.';
  end if;

  v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  select * into v_session
  from public.paciente_portal_sesiones s
  where s.token_hash = v_token_hash
    and s.expires_at > v_now
    and s.last_seen_at > v_now - interval '30 minutes';

  if v_session.token_hash is null or not exists (
    select 1
    from public.paciente_portal_accesos a
    where a.paciente_id = v_session.paciente_id
      and a.activo = true
  ) then
    raise exception 'La sesion del paciente vencio. Ingresa nuevamente.';
  end if;

  if not exists (
    select 1
    from public.historias_clinicas hc
    where hc.id = p_history_id
      and hc.paciente_id = v_session.paciente_id
      and hc.eliminado = false
  ) then
    raise exception 'No tienes permiso para descargar esta historia clinica.';
  end if;

  update public.paciente_portal_sesiones
  set last_seen_at = v_now
  where token_hash = v_token_hash;

  insert into public.auditoria (
    usuario_id,
    accion,
    tabla_afectada,
    registro_id,
    informacion_nueva
  )
  values (
    null,
    'descarga_historia_portal_paciente',
    'historias_clinicas',
    p_history_id,
    jsonb_strip_nulls(jsonb_build_object(
      'paciente_id', v_session.paciente_id,
      'file_name', nullif(trim(coalesce(p_file_name, '')), '')
    ))
  );
end;
$$;

revoke all on function public.build_patient_portal_payload(uuid) from public;
revoke all on function public.configure_patient_portal_pin(uuid, text) from public;
revoke all on function public.get_patient_portal_access_status(uuid) from public;
revoke all on function public.revoke_patient_portal_access(uuid) from public;
revoke all on function public.login_patient_portal(text, text) from public;
revoke all on function public.get_patient_portal_by_token(text) from public;
revoke all on function public.record_patient_history_download_by_token(text, uuid, text) from public;

-- El flujo anterior por SMS queda deshabilitado. El portal usa PIN privado.
revoke execute on function public.get_my_patient_portal() from authenticated;
revoke execute on function public.record_patient_history_download(uuid, text) from authenticated;

grant execute on function public.configure_patient_portal_pin(uuid, text) to authenticated;
grant execute on function public.get_patient_portal_access_status(uuid) to authenticated;
grant execute on function public.revoke_patient_portal_access(uuid) to authenticated;
grant execute on function public.login_patient_portal(text, text) to anon, authenticated;
grant execute on function public.get_patient_portal_by_token(text) to anon, authenticated;
grant execute on function public.record_patient_history_download_by_token(text, uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
