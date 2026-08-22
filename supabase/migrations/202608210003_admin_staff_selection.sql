begin;

-- Administrador y propietaria gestionan turnos usando la lista real de profesionales.
drop policy if exists turnos_owner_all on public.turnos_profesionales;
drop policy if exists turnos_admin_manage on public.turnos_profesionales;
create policy turnos_admin_manage on public.turnos_profesionales
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Resuelve el trabajador de la marcacion. El personal solo puede elegirse a si
-- mismo; administrador y owner pueden usar el terminal compartido.
create or replace function public.resolve_attendance_professional(p_requested_professional_id uuid default null)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_current_professional_id uuid := public.current_professional_id();
  v_resolved_id uuid;
begin
  if public.current_profile_id() is null then
    raise exception 'Debes iniciar sesion para registrar asistencia.';
  end if;

  if p_requested_professional_id is null then
    v_resolved_id := v_current_professional_id;
  elsif public.is_admin() or p_requested_professional_id = v_current_professional_id then
    v_resolved_id := p_requested_professional_id;
  else
    raise exception 'No tienes permiso para marcar la asistencia de otro profesional.';
  end if;

  if not exists (
    select 1 from public.profesionales p
    where p.id = v_resolved_id and p.activo = true
  ) then
    return null;
  end if;

  return v_resolved_id;
end;
$$;

create or replace function public.get_attendance_context(
  p_professional_id uuid,
  p_branch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prof public.profesionales%rowtype;
  v_professional_id uuid;
  v_branch_id uuid;
  v_now timestamptz := clock_timestamp();
  v_local timestamp;
  v_shift public.turnos_profesionales%rowtype;
  v_open public.jornadas_asistencia%rowtype;
begin
  v_professional_id := public.resolve_attendance_professional(p_professional_id);

  if v_professional_id is null then
    return jsonb_build_object(
      'linked', false,
      'message', case
        when public.is_admin() then 'Selecciona un profesional activo para continuar.'
        else 'Tu perfil no esta vinculado a un profesional activo. Vinculalo desde Administracion.'
      end
    );
  end if;

  select * into v_prof
  from public.profesionales
  where id = v_professional_id and activo = true;

  select * into v_open
  from public.jornadas_asistencia
  where profesional_id = v_prof.id and salida_at is null
  order by entrada_at desc
  limit 1;

  -- Una salida siempre conserva la sede donde se abrio la jornada.
  v_branch_id := coalesce(v_open.sede_id, p_branch_id);
  if v_branch_id is null then
    select ps.sede_id into v_branch_id
    from public.profesional_sede ps
    where ps.profesional_id = v_prof.id
    order by ps.sede_id
    limit 1;
  end if;

  if v_branch_id is null or not exists (
    select 1 from public.profesional_sede ps
    where ps.profesional_id = v_prof.id and ps.sede_id = v_branch_id
  ) then
    return jsonb_build_object(
      'linked', true,
      'professional', jsonb_build_object(
        'id', v_prof.id,
        'nombres', v_prof.nombres,
        'apellidos', v_prof.apellidos,
        'especialidad', v_prof.especialidad
      ),
      'message', 'El profesional no esta asignado a la sede seleccionada.'
    );
  end if;

  v_local := v_now at time zone 'America/Lima';
  select * into v_shift
  from public.turnos_profesionales t
  where t.profesional_id = v_prof.id
    and t.sede_id = v_branch_id
    and t.dia_semana = extract(isodow from v_local)::smallint
    and t.vigente_desde <= v_local::date
    and (t.vigente_hasta is null or t.vigente_hasta >= v_local::date)
    and t.activo = true
  order by t.vigente_desde desc, t.created_at desc
  limit 1;

  return jsonb_build_object(
    'linked', true,
    'professional', jsonb_build_object(
      'id', v_prof.id,
      'nombres', v_prof.nombres,
      'apellidos', v_prof.apellidos,
      'especialidad', v_prof.especialidad
    ),
    'branch_id', v_branch_id,
    'expected_type', case when v_open.id is null then 'entrada' else 'salida' end,
    'server_now', v_now,
    'local_date', to_char(v_local, 'YYYY-MM-DD'),
    'open_session_id', v_open.id,
    'open_since', v_open.entrada_at,
    'shift', case when v_shift.id is null then null else jsonb_build_object(
      'id', v_shift.id,
      'hora_inicio', v_shift.hora_inicio,
      'hora_fin', v_shift.hora_fin,
      'es_descanso', v_shift.es_descanso,
      'tolerancia_minutos', v_shift.tolerancia_minutos
    ) end
  );
end;
$$;

create or replace function public.register_attendance_mark_for(
  p_professional_id uuid,
  p_branch_id uuid,
  p_photo_path text,
  p_expected_type text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prof public.profesionales%rowtype;
  v_professional_id uuid;
  v_now timestamptz := clock_timestamp();
  v_local timestamp;
  v_shift public.turnos_profesionales%rowtype;
  v_open public.jornadas_asistencia%rowtype;
  v_existing public.jornadas_asistencia%rowtype;
  v_status text := 'sin_turno';
  v_minutes integer;
begin
  if p_expected_type not in ('entrada', 'salida') then
    raise exception 'Tipo de marcacion invalido.';
  end if;
  if p_request_id is null then
    raise exception 'La marcacion no tiene identificador de seguridad.';
  end if;

  v_professional_id := public.resolve_attendance_professional(p_professional_id);
  if v_professional_id is null then
    raise exception 'Selecciona un profesional activo antes de marcar.';
  end if;

  select * into v_prof
  from public.profesionales
  where id = v_professional_id and activo = true;

  if not exists (
    select 1 from public.profesional_sede ps
    where ps.profesional_id = v_prof.id and ps.sede_id = p_branch_id
  ) then
    raise exception 'El profesional no esta asignado a esta sede.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_prof.id::text, 0));
  select * into v_existing
  from public.jornadas_asistencia
  where profesional_id = v_prof.id
    and (entrada_request_id = p_request_id or salida_request_id = p_request_id)
  limit 1;
  if v_existing.id is not null then
    return jsonb_build_object(
      'success', true,
      'id', v_existing.id,
      'type', case when v_existing.entrada_request_id = p_request_id then 'entrada' else 'salida' end,
      'recorded_at', case when v_existing.entrada_request_id = p_request_id then v_existing.entrada_at else v_existing.salida_at end,
      'status', v_existing.estado_entrada,
      'idempotent', true
    );
  end if;

  v_local := v_now at time zone 'America/Lima';
  if p_photo_path is null
    or p_photo_path not like 'attendance/' || v_prof.id::text || '/' || to_char(v_local, 'YYYY-MM-DD') || '/' || p_expected_type || '-%.webp'
  then
    raise exception 'La ruta de evidencia no es valida.';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'attendance-evidence' and o.name = p_photo_path
  ) then
    raise exception 'La fotografia no existe en el almacenamiento privado.';
  end if;
  if exists (
    select 1 from public.jornadas_asistencia j
    where j.foto_entrada_path = p_photo_path or j.foto_salida_path = p_photo_path
  ) then
    raise exception 'Esta fotografia ya fue utilizada en otra marcacion.';
  end if;

  select * into v_open
  from public.jornadas_asistencia
  where profesional_id = v_prof.id and salida_at is null
  order by entrada_at desc
  limit 1
  for update;

  if p_expected_type = 'entrada' then
    if v_open.id is not null then
      raise exception 'Ya existe una entrada abierta. La siguiente marcacion debe ser salida.';
    end if;

    select * into v_shift
    from public.turnos_profesionales t
    where t.profesional_id = v_prof.id
      and t.sede_id = p_branch_id
      and t.dia_semana = extract(isodow from v_local)::smallint
      and t.vigente_desde <= v_local::date
      and (t.vigente_hasta is null or t.vigente_hasta >= v_local::date)
      and t.activo = true
    order by t.vigente_desde desc, t.created_at desc
    limit 1;

    if v_shift.id is not null and not v_shift.es_descanso then
      if v_local::time <= v_shift.hora_inicio + make_interval(mins => v_shift.tolerancia_minutos) then
        v_status := 'a_tiempo';
      else
        v_status := 'tardanza';
      end if;
    end if;

    insert into public.jornadas_asistencia (
      profesional_id, sede_id, turno_id, fecha_local, entrada_at, foto_entrada_path,
      estado_entrada, entrada_request_id, creado_por
    ) values (
      v_prof.id, p_branch_id, v_shift.id, v_local::date, v_now, p_photo_path,
      v_status, p_request_id, public.current_profile_id()
    ) returning * into v_open;

    return jsonb_build_object(
      'success', true, 'id', v_open.id, 'type', 'entrada', 'recorded_at', v_now,
      'status', v_status, 'idempotent', false
    );
  end if;

  if v_open.id is null then
    raise exception 'No existe una entrada abierta. Primero debes marcar entrada.';
  end if;
  if v_open.sede_id <> p_branch_id then
    raise exception 'La salida debe registrarse en la misma sede de la entrada.';
  end if;

  v_minutes := greatest(0, floor(extract(epoch from (v_now - v_open.entrada_at)) / 60)::integer);
  update public.jornadas_asistencia
  set salida_at = v_now,
      foto_salida_path = p_photo_path,
      salida_request_id = p_request_id,
      minutos_trabajados = v_minutes
  where id = v_open.id
  returning * into v_open;

  return jsonb_build_object(
    'success', true, 'id', v_open.id, 'type', 'salida', 'recorded_at', v_now,
    'status', 'turno_completado', 'minutes_worked', v_minutes, 'idempotent', false
  );
end;
$$;

-- El terminal administrativo puede cargar una evidencia para el profesional
-- seleccionado. Una evidencia ya vinculada no se puede borrar desde el cliente.
drop policy if exists attendance_evidence_insert on storage.objects;
create policy attendance_evidence_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'attendance-evidence'
  and (storage.foldername(name))[1] = 'attendance'
  and exists (
    select 1 from public.profesionales p
    where p.activo = true
      and p.id::text = (storage.foldername(name))[2]
      and (public.is_admin() or p.id = public.current_professional_id())
  )
);

drop policy if exists attendance_evidence_delete on storage.objects;
create policy attendance_evidence_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'attendance-evidence'
  and (
    public.is_admin()
    or exists (
      select 1 from public.profesionales p
      where p.usuario_id = public.current_profile_id()
        and p.id::text = (storage.foldername(name))[2]
    )
  )
  and not exists (
    select 1 from public.jornadas_asistencia j
    where j.foto_entrada_path = name or j.foto_salida_path = name
  )
);

revoke all on function public.resolve_attendance_professional(uuid) from public;
revoke all on function public.get_attendance_context(uuid, uuid) from public;
revoke all on function public.register_attendance_mark_for(uuid, uuid, text, text, uuid) from public;
grant execute on function public.resolve_attendance_professional(uuid) to authenticated;
grant execute on function public.get_attendance_context(uuid, uuid) to authenticated;
grant execute on function public.register_attendance_mark_for(uuid, uuid, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';

commit;