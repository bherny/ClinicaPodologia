-- Expedientes podologicos, ventas y comprobantes de Body Feet.
-- Ejecutar despues de 202607130001_add_prescriptions.sql.

create type public.estado_venta as enum ('pendiente', 'pagada', 'anulada');
create type public.metodo_pago as enum ('efectivo', 'yape', 'plin', 'tarjeta', 'transferencia', 'mixto', 'otro');
create type public.tipo_comprobante as enum ('nota_venta', 'boleta', 'factura');
create type public.estado_comprobante as enum ('borrador', 'pendiente_envio', 'aceptado', 'rechazado', 'anulado');

create table public.expedientes_podologia (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes(id),
  cita_id uuid references public.citas(id) on delete set null,
  sede_id uuid not null references public.sedes(id),
  profesional_id uuid references public.profesionales(id) on delete set null,
  fecha date not null default current_date,
  motivo_consulta text not null,
  pulso_pedio_izquierdo boolean,
  pulso_pedio_derecho boolean,
  pulso_tibial_izquierdo boolean,
  pulso_tibial_derecho boolean,
  temperatura text check (temperatura is null or temperatura in ('fria', 'normal', 'caliente')),
  tipo_piel text check (tipo_piel is null or tipo_piel in ('seca', 'grasa', 'mixta')),
  enfermedades jsonb not null default '[]'::jsonb,
  otra_enfermedad text,
  tratamientos jsonb not null default '[]'::jsonb,
  otro_tratamiento text,
  formas_unas jsonb not null default '[]'::jsonb,
  alteraciones_unas text,
  alergias text,
  problemas_piel jsonb not null default '[]'::jsonb,
  otro_problema_piel text,
  tipo_pie text check (tipo_pie is null or tipo_pie in ('romano', 'egipcio', 'griego', 'cuadrado')),
  mapa_anatomico_notas text,
  observaciones text,
  creado_por uuid references public.perfiles(id) on delete set null,
  eliminado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index expedientes_podologia_cita_unique
  on public.expedientes_podologia (cita_id)
  where cita_id is not null and eliminado = false;
create index expedientes_podologia_paciente_idx on public.expedientes_podologia (paciente_id, fecha desc);
create index expedientes_podologia_sede_fecha_idx on public.expedientes_podologia (sede_id, fecha desc);

create table public.ventas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid references public.pacientes(id) on delete set null,
  cita_id uuid references public.citas(id) on delete set null,
  sede_id uuid not null references public.sedes(id),
  fecha timestamptz not null default now(),
  estado public.estado_venta not null default 'pagada',
  metodo_pago public.metodo_pago not null default 'efectivo',
  subtotal numeric(12,2) not null check (subtotal >= 0),
  descuento numeric(12,2) not null default 0 check (descuento >= 0),
  igv numeric(12,2) not null default 0 check (igv >= 0),
  total numeric(12,2) not null check (total >= 0),
  moneda char(3) not null default 'PEN' check (moneda = 'PEN'),
  numero_operacion text,
  observaciones text,
  creado_por uuid references public.perfiles(id) on delete set null,
  eliminado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ventas_total_valido check (total = round(subtotal - descuento + igv, 2))
);

create index ventas_sede_fecha_idx on public.ventas (sede_id, fecha desc);
create index ventas_paciente_idx on public.ventas (paciente_id, fecha desc);
create index ventas_estado_idx on public.ventas (estado, fecha desc);

create table public.venta_items (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references public.ventas(id) on delete cascade,
  servicio_id uuid references public.servicios(id) on delete set null,
  descripcion text not null,
  cantidad numeric(10,2) not null default 1 check (cantidad > 0),
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  importe numeric(12,2) generated always as (round(cantidad * precio_unitario, 2)) stored,
  orden smallint not null default 1,
  created_at timestamptz not null default now()
);

create index venta_items_venta_idx on public.venta_items (venta_id, orden);

create table public.correlativos_comprobante (
  sede_id uuid not null references public.sedes(id) on delete cascade,
  tipo public.tipo_comprobante not null,
  serie varchar(4) not null,
  ultimo_numero bigint not null default 0,
  primary key (sede_id, tipo),
  unique (serie)
);

create table public.comprobantes (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null unique references public.ventas(id),
  tipo public.tipo_comprobante not null,
  serie varchar(4) not null,
  numero bigint not null check (numero > 0),
  estado public.estado_comprobante not null default 'borrador',
  cliente_tipo_documento text,
  cliente_numero_documento text,
  cliente_nombre text not null,
  cliente_direccion text,
  proveedor_emision text,
  identificador_externo text,
  respuesta_proveedor jsonb,
  xml_url text,
  pdf_url text,
  fecha_emision timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (serie, numero)
);

create index comprobantes_estado_fecha_idx on public.comprobantes (estado, fecha_emision desc);

insert into public.correlativos_comprobante (sede_id, tipo, serie)
select s.id, t.tipo, left(prefix || lpad(row_number() over (partition by t.tipo order by s.nombre)::text, 3, '0'), 4)
from public.sedes s
cross join (values
  ('nota_venta'::public.tipo_comprobante, 'N'),
  ('boleta'::public.tipo_comprobante, 'B'),
  ('factura'::public.tipo_comprobante, 'F')
) as t(tipo, prefix)
on conflict do nothing;

create or replace function public.create_branch_receipt_series()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.correlativos_comprobante (sede_id, tipo, serie)
  values
    (new.id, 'nota_venta', 'N' || upper(substr(md5(new.id::text || 'N'), 1, 3))),
    (new.id, 'boleta', 'B' || upper(substr(md5(new.id::text || 'B'), 1, 3))),
    (new.id, 'factura', 'F' || upper(substr(md5(new.id::text || 'F'), 1, 3)))
  on conflict do nothing;
  return new;
end;
$$;

create trigger sedes_create_receipt_series
after insert on public.sedes
for each row execute function public.create_branch_receipt_series();

create trigger expedientes_podologia_set_updated_at
before update on public.expedientes_podologia
for each row execute function public.set_updated_at();

create trigger ventas_set_updated_at
before update on public.ventas
for each row execute function public.set_updated_at();

create trigger comprobantes_set_updated_at
before update on public.comprobantes
for each row execute function public.set_updated_at();

create trigger auditoria_expedientes_podologia
after insert or update or delete on public.expedientes_podologia
for each row execute function public.audit_row_changes();

create trigger auditoria_ventas
after insert or update or delete on public.ventas
for each row execute function public.audit_row_changes();

create trigger auditoria_comprobantes
after insert or update or delete on public.comprobantes
for each row execute function public.audit_row_changes();

alter table public.expedientes_podologia enable row level security;
alter table public.ventas enable row level security;
alter table public.venta_items enable row level security;
alter table public.correlativos_comprobante enable row level security;
alter table public.comprobantes enable row level security;

create policy expedientes_podologia_read on public.expedientes_podologia
for select to authenticated
using (
  eliminado = false and (
    public.is_admin()
    or public.can_access_sede(sede_id)
    or exists (
      select 1 from public.profesionales pr
      where pr.id = expedientes_podologia.profesional_id
        and pr.usuario_id = public.current_profile_id()
    )
  )
);

create policy expedientes_podologia_write on public.expedientes_podologia
for all to authenticated
using (public.is_admin() or public.can_access_sede(sede_id))
with check (public.is_admin() or public.can_access_sede(sede_id));

create policy ventas_read on public.ventas
for select to authenticated
using (eliminado = false and (public.is_admin() or public.can_access_sede(sede_id)));

create policy ventas_insert on public.ventas
for insert to authenticated
with check (public.is_admin() or (public.is_recepcion() and public.can_access_sede(sede_id)));

create policy ventas_update on public.ventas
for update to authenticated
using (public.is_admin() or (public.is_recepcion() and public.can_access_sede(sede_id)))
with check (public.is_admin() or (public.is_recepcion() and public.can_access_sede(sede_id)));

create policy venta_items_read on public.venta_items
for select to authenticated
using (exists (
  select 1 from public.ventas v
  where v.id = venta_items.venta_id
    and v.eliminado = false
    and (public.is_admin() or public.can_access_sede(v.sede_id))
));

create policy correlativos_read on public.correlativos_comprobante
for select to authenticated
using (public.is_admin() or public.can_access_sede(sede_id));

create policy comprobantes_read on public.comprobantes
for select to authenticated
using (exists (
  select 1 from public.ventas v
  where v.id = comprobantes.venta_id
    and v.eliminado = false
    and (public.is_admin() or public.can_access_sede(v.sede_id))
));

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

  select round(sum((item->>'cantidad')::numeric * (item->>'precio_unitario')::numeric), 2)
  into v_subtotal
  from jsonb_array_elements(p_items) item;

  if v_subtotal is null or v_subtotal < 0 then
    raise exception 'El subtotal de la venta no es valido.';
  end if;

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

  insert into public.venta_items (venta_id, servicio_id, descripcion, cantidad, precio_unitario, orden)
  select
    v_sale_id,
    nullif(item->>'servicio_id', '')::uuid,
    trim(item->>'descripcion'),
    (item->>'cantidad')::numeric,
    (item->>'precio_unitario')::numeric,
    ordinality::smallint
  from jsonb_array_elements(p_items) with ordinality as x(item, ordinality);

  update public.correlativos_comprobante
  set ultimo_numero = ultimo_numero + 1
  where sede_id = p_branch_id and tipo = p_receipt_type
  returning serie, ultimo_numero into v_series, v_number;

  if v_series is null then
    raise exception 'No existe una serie configurada para la sede y el tipo de comprobante.';
  end if;

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

revoke all on function public.create_sale(uuid, uuid, uuid, public.metodo_pago, numeric, numeric, text, text, public.tipo_comprobante, text, text, text, text, jsonb) from public;
grant execute on function public.create_sale(uuid, uuid, uuid, public.metodo_pago, numeric, numeric, text, text, public.tipo_comprobante, text, text, text, text, jsonb) to authenticated;
