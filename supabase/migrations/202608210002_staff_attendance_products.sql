begin;

-- Owner hereda los permisos operativos del administrador, pero las tablas de
-- personal usan is_owner() para mantener el panel privado separado.
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'owner', false);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('administrador', 'owner'), false);
$$;

create or replace function public.current_professional_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profesionales p
  where p.usuario_id = public.current_profile_id()
    and p.activo = true
  order by p.created_at
  limit 1;
$$;

create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  nombre varchar(160) not null,
  descripcion text,
  sku varchar(60),
  precio numeric(12,2) not null default 0 check (precio >= 0),
  activo boolean not null default true,
  creado_por uuid references public.perfiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists productos_sku_unique_idx
on public.productos (lower(sku)) where sku is not null and activo = true;
create index if not exists productos_nombre_idx on public.productos (lower(nombre));
create index if not exists productos_activo_idx on public.productos (activo, nombre);

alter table public.venta_items
  add column if not exists producto_id uuid references public.productos(id) on delete set null;
create index if not exists venta_items_producto_idx on public.venta_items (producto_id) where producto_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'venta_items_un_catalogo_check'
  ) then
    alter table public.venta_items
      add constraint venta_items_un_catalogo_check
      check (num_nonnulls(servicio_id, producto_id) <= 1) not valid;
  end if;
end;
$$;

create table if not exists public.turnos_profesionales (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null references public.profesionales(id) on delete restrict,
  sede_id uuid not null references public.sedes(id) on delete restrict,
  dia_semana smallint not null check (dia_semana between 1 and 7),
  hora_inicio time,
  hora_fin time,
  es_descanso boolean not null default false,
  tolerancia_minutos smallint not null default 10 check (tolerancia_minutos between 0 and 180),
  vigente_desde date not null default (timezone('America/Lima', now()))::date,
  vigente_hasta date,
  activo boolean not null default true,
  creado_por uuid references public.perfiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint turnos_rango_vigencia_check check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  constraint turnos_horas_check check (
    (es_descanso and hora_inicio is null and hora_fin is null)
    or (not es_descanso and hora_inicio is not null and hora_fin is not null and hora_fin > hora_inicio)
  )
);

create index if not exists turnos_profesional_dia_idx
on public.turnos_profesionales (profesional_id, dia_semana, vigente_desde desc)
where activo = true;
create index if not exists turnos_sede_dia_idx
on public.turnos_profesionales (sede_id, dia_semana, vigente_desde desc)
where activo = true;

create table if not exists public.jornadas_asistencia (
  id uuid primary key default gen_random_uuid(),
  profesional_id uuid not null references public.profesionales(id) on delete restrict,
  sede_id uuid not null references public.sedes(id) on delete restrict,
  turno_id uuid references public.turnos_profesionales(id) on delete set null,
  fecha_local date not null,
  entrada_at timestamptz not null,
  salida_at timestamptz,
  foto_entrada_path text not null,
  foto_salida_path text,
  estado_entrada varchar(24) not null check (estado_entrada in ('a_tiempo', 'tardanza', 'sin_turno')),
  minutos_trabajados integer check (minutos_trabajados is null or minutos_trabajados >= 0),
  entrada_request_id uuid not null unique,
  salida_request_id uuid unique,
  creado_por uuid references public.perfiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jornadas_salida_check check (
    (salida_at is null and foto_salida_path is null and salida_request_id is null and minutos_trabajados is null)
    or (salida_at is not null and salida_at >= entrada_at and foto_salida_path is not null and salida_request_id is not null and minutos_trabajados is not null)
  )
);

create unique index if not exists jornadas_profesional_abierta_idx
on public.jornadas_asistencia (profesional_id) where salida_at is null;
create index if not exists jornadas_profesional_fecha_idx
on public.jornadas_asistencia (profesional_id, fecha_local desc);
create index if not exists jornadas_sede_fecha_idx
on public.jornadas_asistencia (sede_id, fecha_local desc);
create index if not exists jornadas_entrada_idx
on public.jornadas_asistencia (entrada_at desc);
create index if not exists jornadas_estado_idx
on public.jornadas_asistencia (estado_entrada, fecha_local desc);

drop trigger if exists productos_set_updated_at on public.productos;
create trigger productos_set_updated_at before update on public.productos
for each row execute function public.set_updated_at();
drop trigger if exists turnos_set_updated_at on public.turnos_profesionales;
create trigger turnos_set_updated_at before update on public.turnos_profesionales
for each row execute function public.set_updated_at();
drop trigger if exists jornadas_set_updated_at on public.jornadas_asistencia;
create trigger jornadas_set_updated_at before update on public.jornadas_asistencia
for each row execute function public.set_updated_at();

drop trigger if exists auditoria_productos on public.productos;
create trigger auditoria_productos after insert or update or delete on public.productos
for each row execute function public.audit_row_changes();
drop trigger if exists auditoria_turnos on public.turnos_profesionales;
create trigger auditoria_turnos after insert or update or delete on public.turnos_profesionales
for each row execute function public.audit_row_changes();
drop trigger if exists auditoria_jornadas on public.jornadas_asistencia;
create trigger auditoria_jornadas after insert or update or delete on public.jornadas_asistencia
for each row execute function public.audit_row_changes();

alter table public.productos enable row level security;
alter table public.turnos_profesionales enable row level security;
alter table public.jornadas_asistencia enable row level security;

drop policy if exists productos_read on public.productos;
create policy productos_read on public.productos
for select to authenticated
using (activo = true or public.is_admin());
drop policy if exists productos_owner_write on public.productos;
create policy productos_owner_write on public.productos
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists turnos_owner_all on public.turnos_profesionales;
create policy turnos_owner_all on public.turnos_profesionales
for all to authenticated
using (public.is_owner())
with check (public.is_owner());
drop policy if exists turnos_profesional_read on public.turnos_profesionales;
create policy turnos_profesional_read on public.turnos_profesionales
for select to authenticated
using (profesional_id = public.current_professional_id());

drop policy if exists jornadas_owner_read on public.jornadas_asistencia;
create policy jornadas_owner_read on public.jornadas_asistencia
for select to authenticated
using (public.is_owner());
drop policy if exists jornadas_profesional_read on public.jornadas_asistencia;
create policy jornadas_profesional_read on public.jornadas_asistencia
for select to authenticated
using (profesional_id = public.current_professional_id());

-- Resuelve el siguiente paso con hora del servidor y el profesional vinculado.
create or replace function public.get_my_attendance_context(p_branch_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prof public.profesionales%rowtype;
  v_branch_id uuid;
  v_now timestamptz := clock_timestamp();
  v_local timestamp;
  v_shift public.turnos_profesionales%rowtype;
  v_open public.jornadas_asistencia%rowtype;
begin
  select * into v_prof
  from public.profesionales
  where usuario_id = public.current_profile_id() and activo = true
  order by created_at
  limit 1;

  if v_prof.id is null then
    return jsonb_build_object(
      'linked', false,
      'message', 'Tu perfil no esta vinculado a un profesional activo. Vinculalo desde Administracion.'
    );
  end if;

  select * into v_open
  from public.jornadas_asistencia
  where profesional_id = v_prof.id and salida_at is null
  order by entrada_at desc
  limit 1;

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
      'professional', jsonb_build_object('id', v_prof.id, 'nombres', v_prof.nombres, 'apellidos', v_prof.apellidos),
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

create or replace function public.register_attendance_mark(
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

  select * into v_prof
  from public.profesionales
  where usuario_id = public.current_profile_id() and activo = true
  order by created_at
  limit 1;
  if v_prof.id is null then
    raise exception 'Tu perfil no esta vinculado a un profesional activo.';
  end if;
  if not exists (
    select 1 from public.profesional_sede ps
    where ps.profesional_id = v_prof.id and ps.sede_id = p_branch_id
  ) then
    raise exception 'El profesional no esta asignado a esta sede.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_prof.id::text, 0));
  select * into v_existing
  from public.jornadas_asistencia
  where entrada_request_id = p_request_id or salida_request_id = p_request_id
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
    select 1
    from storage.objects o
    where o.bucket_id = 'attendance-evidence'
      and o.name = p_photo_path
  ) then
    raise exception 'La fotografia no existe en el almacenamiento privado.';
  end if;
  if exists (
    select 1
    from public.jornadas_asistencia j
    where j.foto_entrada_path = p_photo_path
       or j.foto_salida_path = p_photo_path
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

-- La venta de producto usa la misma cabecera, correlativo, comprobante y
-- trigger de Caja Musa que una venta de servicio.
create or replace function public.create_sale(
  p_patient_id uuid,
  p_appointment_id uuid,
  p_branch_id uuid,
  p_payment_method public.metodo_pago,
  p_discount numeric,
  p_tax numeric,
  p_operation_number text,
  p_notes text,
  p_receipt_type public.tipo_comprobante,
  p_customer_document_type text,
  p_customer_document_number text,
  p_customer_name text,
  p_customer_address text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_subtotal numeric(12,2);
  v_total numeric(12,2);
  v_series varchar(4);
  v_number bigint;
begin
  if not (public.is_admin() or (public.is_recepcion() and public.can_access_sede(p_branch_id))) then
    raise exception 'No tienes permiso para registrar ventas en esta sede.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta debe incluir al menos un concepto.';
  end if;
  if trim(coalesce(p_customer_name, '')) = '' then
    raise exception 'Ingresa el nombre del cliente.';
  end if;

  select round(sum((item->>'cantidad')::numeric * (item->>'precio_unitario')::numeric), 2)
  into v_subtotal from jsonb_array_elements(p_items) item;
  if v_subtotal is null or v_subtotal < 0 then raise exception 'El subtotal de la venta no es valido.'; end if;
  v_total := round(v_subtotal - coalesce(p_discount, 0) + coalesce(p_tax, 0), 2);
  if v_total < 0 then raise exception 'El total de la venta no puede ser negativo.'; end if;

  insert into public.ventas (
    paciente_id, cita_id, sede_id, metodo_pago, subtotal, descuento, igv, total,
    numero_operacion, observaciones, creado_por
  ) values (
    p_patient_id, p_appointment_id, p_branch_id, p_payment_method, v_subtotal,
    coalesce(p_discount, 0), coalesce(p_tax, 0), v_total, nullif(trim(p_operation_number), ''),
    nullif(trim(p_notes), ''), public.current_profile_id()
  ) returning id into v_sale_id;

  insert into public.venta_items (venta_id, servicio_id, producto_id, descripcion, cantidad, precio_unitario, orden)
  select v_sale_id,
    nullif(item->>'servicio_id', '')::uuid,
    nullif(item->>'producto_id', '')::uuid,
    trim(item->>'descripcion'),
    (item->>'cantidad')::numeric,
    (item->>'precio_unitario')::numeric,
    ordinality::smallint
  from jsonb_array_elements(p_items) with ordinality as x(item, ordinality);

  update public.correlativos_comprobante
  set ultimo_numero = ultimo_numero + 1
  where sede_id = p_branch_id and tipo = p_receipt_type
  returning serie, ultimo_numero into v_series, v_number;
  if v_series is null then raise exception 'No existe una serie configurada para la sede y el tipo de comprobante.'; end if;

  insert into public.comprobantes (
    venta_id, tipo, serie, numero, cliente_tipo_documento, cliente_numero_documento,
    cliente_nombre, cliente_direccion
  ) values (
    v_sale_id, p_receipt_type, v_series, v_number, nullif(trim(p_customer_document_type), ''),
    nullif(trim(p_customer_document_number), ''), trim(p_customer_name), nullif(trim(p_customer_address), '')
  );
  return v_sale_id;
end;
$$;

create or replace function public.update_sale(
  p_sale_id uuid,
  p_patient_id uuid,
  p_payment_method public.metodo_pago,
  p_discount numeric,
  p_tax numeric,
  p_operation_number text,
  p_notes text,
  p_customer_document_type text,
  p_customer_document_number text,
  p_customer_name text,
  p_customer_address text,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.ventas%rowtype;
  v_subtotal numeric(12,2);
  v_total numeric(12,2);
begin
  select * into v_sale from public.ventas where id = p_sale_id and eliminado = false;
  if v_sale.id is null then raise exception 'Venta no encontrada.'; end if;
  if not (public.is_admin() or (public.is_recepcion() and public.can_access_sede(v_sale.sede_id))) then
    raise exception 'No tienes permiso para editar esta venta.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta debe incluir al menos un concepto.';
  end if;

  select round(sum((item->>'cantidad')::numeric * (item->>'precio_unitario')::numeric), 2)
  into v_subtotal from jsonb_array_elements(p_items) item;
  v_total := round(v_subtotal - coalesce(p_discount, 0) + coalesce(p_tax, 0), 2);
  if v_total < 0 then raise exception 'El total no puede ser negativo.'; end if;

  update public.ventas set
    paciente_id = p_patient_id, metodo_pago = p_payment_method, subtotal = v_subtotal,
    descuento = coalesce(p_discount, 0), igv = coalesce(p_tax, 0), total = v_total,
    numero_operacion = nullif(trim(p_operation_number), ''), observaciones = nullif(trim(p_notes), '')
  where id = p_sale_id;

  delete from public.venta_items where venta_id = p_sale_id;
  insert into public.venta_items (venta_id, servicio_id, producto_id, descripcion, cantidad, precio_unitario, orden)
  select p_sale_id,
    nullif(item->>'servicio_id', '')::uuid,
    nullif(item->>'producto_id', '')::uuid,
    trim(item->>'descripcion'),
    (item->>'cantidad')::numeric,
    (item->>'precio_unitario')::numeric,
    ordinality::smallint
  from jsonb_array_elements(p_items) with ordinality as x(item, ordinality);

  update public.comprobantes set
    cliente_tipo_documento = nullif(trim(p_customer_document_type), ''),
    cliente_numero_documento = nullif(trim(p_customer_document_number), ''),
    cliente_nombre = trim(p_customer_name),
    cliente_direccion = nullif(trim(p_customer_address), '')
  where venta_id = p_sale_id;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attendance-evidence', 'attendance-evidence', false, 2097152, array['image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists attendance_evidence_insert on storage.objects;
create policy attendance_evidence_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'attendance-evidence'
  and (storage.foldername(name))[1] = 'attendance'
  and (
    public.is_owner()
    or exists (
      select 1 from public.profesionales p
      where p.usuario_id = public.current_profile_id()
        and p.activo = true
        and p.id::text = (storage.foldername(name))[2]
    )
  )
);

drop policy if exists attendance_evidence_read on storage.objects;
create policy attendance_evidence_read on storage.objects
for select to authenticated
using (
  bucket_id = 'attendance-evidence'
  and (
    public.is_owner()
    or exists (
      select 1 from public.profesionales p
      where p.usuario_id = public.current_profile_id()
        and p.id::text = (storage.foldername(name))[2]
    )
  )
);

drop policy if exists attendance_evidence_owner_delete on storage.objects;
drop policy if exists attendance_evidence_delete on storage.objects;
create policy attendance_evidence_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'attendance-evidence'
  and (
    public.is_owner()
    or (
      exists (
        select 1 from public.profesionales p
        where p.usuario_id = public.current_profile_id()
          and p.id::text = (storage.foldername(name))[2]
      )
      and not exists (
        select 1 from public.jornadas_asistencia j
        where j.foto_entrada_path = name or j.foto_salida_path = name
      )
    )
  )
);

revoke all on function public.is_owner() from public;
revoke all on function public.current_professional_id() from public;
revoke all on function public.get_my_attendance_context(uuid) from public;
revoke all on function public.register_attendance_mark(uuid, text, text, uuid) from public;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.current_professional_id() to authenticated;
grant execute on function public.get_my_attendance_context(uuid) to authenticated;
grant execute on function public.register_attendance_mark(uuid, text, text, uuid) to authenticated;

-- Realtime para que el panel del propietario refleje marcaciones sin recargar.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'jornadas_asistencia'
    ) then
    alter publication supabase_realtime add table public.jornadas_asistencia;
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
