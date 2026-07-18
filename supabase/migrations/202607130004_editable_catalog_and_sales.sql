-- Edicion segura y eliminacion logica para profesionales y ventas.

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
  v_sale record;
  v_receipt_state public.estado_comprobante;
  v_subtotal numeric(12,2);
  v_total numeric(12,2);
begin
  select * into v_sale from public.ventas where id = p_sale_id and eliminado = false;
  if v_sale.id is null then raise exception 'Venta no encontrada.'; end if;

  if not (public.is_admin() or (public.is_recepcion() and public.can_access_sede(v_sale.sede_id))) then
    raise exception 'No tienes permiso para editar esta venta.';
  end if;

  select estado into v_receipt_state from public.comprobantes where venta_id = p_sale_id;
  if v_receipt_state = 'aceptado' then
    raise exception 'Un comprobante aceptado por SUNAT no se edita. Debe emitirse una nota de credito.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta debe incluir al menos un concepto.';
  end if;

  select round(sum((item->>'cantidad')::numeric * (item->>'precio_unitario')::numeric), 2)
  into v_subtotal from jsonb_array_elements(p_items) item;
  v_total := round(v_subtotal - coalesce(p_discount, 0) + coalesce(p_tax, 0), 2);
  if v_total < 0 then raise exception 'El total no puede ser negativo.'; end if;

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
  select p_sale_id, nullif(item->>'servicio_id', '')::uuid, trim(item->>'descripcion'),
    (item->>'cantidad')::numeric, (item->>'precio_unitario')::numeric, ordinality::smallint
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
  v_sale record;
  v_receipt_state public.estado_comprobante;
begin
  select * into v_sale from public.ventas where id = p_sale_id and eliminado = false;
  if v_sale.id is null then raise exception 'Venta no encontrada o ya eliminada.'; end if;

  if not (public.is_admin() or (public.is_recepcion() and public.can_access_sede(v_sale.sede_id))) then
    raise exception 'No tienes permiso para anular esta venta.';
  end if;

  select estado into v_receipt_state from public.comprobantes where venta_id = p_sale_id;
  if v_receipt_state = 'aceptado' then
    raise exception 'No se puede eliminar una venta aceptada por SUNAT. Debe emitirse una nota de credito.';
  end if;

  update public.ventas set estado = 'anulada', eliminado = true where id = p_sale_id;
  update public.comprobantes set estado = 'anulado' where venta_id = p_sale_id;
end;
$$;

revoke all on function public.soft_delete_sale(uuid) from public;
grant execute on function public.soft_delete_sale(uuid) to authenticated;

