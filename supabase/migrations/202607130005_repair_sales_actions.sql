-- Actualizacion acumulada para instalaciones con funciones pendientes.
-- Incluye profesionales y ventas internas: editar, desactivar y anular.

create or replace function public.soft_delete_professional(p_professional_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede desactivar profesionales.';
  end if;

  update public.profesionales
  set activo = false
  where id = p_professional_id and activo = true;

  if not found then
    raise exception 'Profesional no encontrado o ya inactivo.';
  end if;
end;
$$;

revoke all on function public.soft_delete_professional(uuid) from public;
grant execute on function public.soft_delete_professional(uuid) to authenticated;

create or replace function public.soft_delete_patient(p_patient_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.perfiles%rowtype;
  v_branch_id uuid;
begin
  select * into v_profile
  from public.perfiles
  where auth_user_id = auth.uid() and activo = true
  limit 1;

  select sede_de_registro_id into v_branch_id
  from public.pacientes
  where id = p_patient_id and eliminado = false;

  if v_profile.id is null or v_branch_id is null then
    raise exception 'Paciente no encontrado o usuario sin perfil activo.';
  end if;

  if v_profile.rol <> 'administrador'
    and not (v_profile.rol = 'recepcion' and v_profile.sede_id = v_branch_id) then
    raise exception 'No tienes permiso para eliminar este paciente.';
  end if;

  update public.pacientes set eliminado = true where id = p_patient_id;
end;
$$;

revoke all on function public.soft_delete_patient(uuid) from public;
grant execute on function public.soft_delete_patient(uuid) to authenticated;

create or replace function public.soft_delete_appointment(p_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.perfiles%rowtype;
  v_branch_id uuid;
begin
  select * into v_profile
  from public.perfiles
  where auth_user_id = auth.uid() and activo = true
  limit 1;

  select sede_id into v_branch_id
  from public.citas
  where id = p_appointment_id and eliminado = false;

  if v_profile.id is null or v_branch_id is null then
    raise exception 'Cita no encontrada o usuario sin perfil activo.';
  end if;

  if v_profile.rol <> 'administrador'
    and not (v_profile.rol = 'recepcion' and v_profile.sede_id = v_branch_id) then
    raise exception 'No tienes permiso para eliminar esta cita.';
  end if;

  update public.citas set eliminado = true where id = p_appointment_id;
end;
$$;

revoke all on function public.soft_delete_appointment(uuid) from public;
grant execute on function public.soft_delete_appointment(uuid) to authenticated;

create or replace function public.soft_delete_clinical_history(p_history_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.perfiles%rowtype;
  v_branch_id uuid;
begin
  select * into v_profile
  from public.perfiles
  where auth_user_id = auth.uid() and activo = true
  limit 1;

  select sede_id into v_branch_id
  from public.historias_clinicas
  where id = p_history_id and eliminado = false;

  if v_profile.id is null or v_branch_id is null then
    raise exception 'Historia clinica no encontrada o usuario sin perfil activo.';
  end if;

  if v_profile.rol not in ('administrador', 'profesional')
    or not public.can_access_sede(v_branch_id) then
    raise exception 'No tienes permiso para eliminar esta historia clinica.';
  end if;

  update public.historias_clinicas set eliminado = true where id = p_history_id;
end;
$$;

revoke all on function public.soft_delete_clinical_history(uuid) from public;
grant execute on function public.soft_delete_clinical_history(uuid) to authenticated;

-- La historia nace en la misma transaccion que la cita.
create or replace function public.create_clinical_history_from_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.historias_clinicas (
    paciente_id,
    cita_id,
    sede_id,
    profesional_id,
    diagnostico,
    tratamiento_realizado,
    evolucion,
    recomendaciones
  )
  select
    new.paciente_id,
    new.id,
    new.sede_id,
    new.profesional_id,
    coalesce(nullif(btrim(new.diagnostico), ''), 'Pendiente de registrar'),
    coalesce(nullif(btrim(new.tratamiento), ''), 'Pendiente de registrar'),
    'Pendiente de atencion',
    new.observaciones
  where new.paciente_id is not null
    and not exists (
      select 1
      from public.historias_clinicas hc
      where hc.cita_id = new.id and hc.eliminado = false
    );

  return new;
end;
$$;

drop trigger if exists citas_create_clinical_history on public.citas;
create trigger citas_create_clinical_history
after insert on public.citas
for each row execute function public.create_clinical_history_from_appointment();

insert into public.historias_clinicas (
  paciente_id,
  cita_id,
  sede_id,
  profesional_id,
  diagnostico,
  tratamiento_realizado,
  evolucion,
  recomendaciones,
  created_at,
  updated_at
)
select
  c.paciente_id,
  c.id,
  c.sede_id,
  c.profesional_id,
  coalesce(nullif(btrim(c.diagnostico), ''), 'Pendiente de registrar'),
  coalesce(nullif(btrim(c.tratamiento), ''), 'Pendiente de registrar'),
  'Pendiente de atencion',
  c.observaciones,
  c.created_at,
  now()
from public.citas c
where c.eliminado = false
  and c.paciente_id is not null
  and not exists (
    select 1
    from public.historias_clinicas hc
    where hc.cita_id = c.id and hc.eliminado = false
  );

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
  if v_sale.id is null then
    raise exception 'Venta no encontrada.';
  end if;

  if not (public.is_admin() or (public.is_recepcion() and public.can_access_sede(v_sale.sede_id))) then
    raise exception 'No tienes permiso para editar esta venta.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta debe incluir al menos un concepto.';
  end if;

  select round(sum((item->>'cantidad')::numeric * (item->>'precio_unitario')::numeric), 2)
  into v_subtotal
  from jsonb_array_elements(p_items) item;

  v_total := round(v_subtotal - coalesce(p_discount, 0) + coalesce(p_tax, 0), 2);
  if v_total < 0 then
    raise exception 'El total no puede ser negativo.';
  end if;

  update public.ventas set
    paciente_id = p_patient_id,
    metodo_pago = p_payment_method,
    subtotal = v_subtotal,
    descuento = coalesce(p_discount, 0),
    igv = coalesce(p_tax, 0),
    total = v_total,
    numero_operacion = nullif(trim(p_operation_number), ''),
    observaciones = nullif(trim(p_notes), '')
  where id = p_sale_id;

  delete from public.venta_items where venta_id = p_sale_id;
  insert into public.venta_items (venta_id, servicio_id, descripcion, cantidad, precio_unitario, orden)
  select
    p_sale_id,
    nullif(item->>'servicio_id', '')::uuid,
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

revoke all on function public.update_sale(uuid, uuid, public.metodo_pago, numeric, numeric, text, text, text, text, text, text, jsonb) from public;
grant execute on function public.update_sale(uuid, uuid, public.metodo_pago, numeric, numeric, text, text, text, text, text, text, jsonb) to authenticated;

create or replace function public.soft_delete_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.ventas%rowtype;
begin
  select * into v_sale from public.ventas where id = p_sale_id and eliminado = false;
  if v_sale.id is null then
    raise exception 'Venta no encontrada o ya anulada.';
  end if;

  if not (public.is_admin() or (public.is_recepcion() and public.can_access_sede(v_sale.sede_id))) then
    raise exception 'No tienes permiso para anular esta venta.';
  end if;

  update public.ventas
  set estado = 'anulada', eliminado = true
  where id = p_sale_id;

  update public.comprobantes
  set estado = 'anulado'
  where venta_id = p_sale_id;
end;
$$;

revoke all on function public.soft_delete_sale(uuid) from public;
grant execute on function public.soft_delete_sale(uuid) to authenticated;

-- Fuerza a Supabase a reconocer las funciones nuevas de inmediato.
notify pgrst, 'reload schema';
