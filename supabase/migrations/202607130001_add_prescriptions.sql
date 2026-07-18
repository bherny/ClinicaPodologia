create table if not exists public.recetas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes(id),
  cita_id uuid references public.citas(id) on delete set null,
  historia_clinica_id uuid references public.historias_clinicas(id) on delete set null,
  sede_id uuid not null references public.sedes(id),
  profesional_id uuid references public.profesionales(id) on delete set null,
  fecha date not null default current_date,
  diagnostico text,
  indicaciones_generales text,
  creado_por uuid references public.perfiles(id) on delete set null default public.current_profile_id(),
  eliminado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.receta_items (
  id uuid primary key default gen_random_uuid(),
  receta_id uuid not null references public.recetas(id) on delete cascade,
  medicamento text not null,
  dosis text,
  frecuencia text,
  duracion text,
  via text,
  indicaciones text,
  orden integer not null default 1,
  created_at timestamptz not null default now(),
  constraint receta_items_medicamento_no_vacio check (length(trim(medicamento)) >= 2),
  constraint receta_items_orden_positiva check (orden > 0)
);

create index if not exists recetas_paciente_fecha_idx on public.recetas (paciente_id, fecha desc);
create index if not exists recetas_sede_fecha_idx on public.recetas (sede_id, fecha desc);
create index if not exists recetas_profesional_idx on public.recetas (profesional_id, fecha desc);
create index if not exists receta_items_receta_orden_idx on public.receta_items (receta_id, orden);

drop trigger if exists recetas_set_updated_at on public.recetas;
create trigger recetas_set_updated_at
before update on public.recetas
for each row execute function public.set_updated_at();

drop trigger if exists auditoria_recetas on public.recetas;
create trigger auditoria_recetas
after insert or update or delete on public.recetas
for each row execute function public.audit_row_changes();

drop trigger if exists auditoria_receta_items on public.receta_items;
create trigger auditoria_receta_items
after insert or update or delete on public.receta_items
for each row execute function public.audit_row_changes();

alter table public.recetas enable row level security;
alter table public.receta_items enable row level security;

drop policy if exists recetas_read_clinical_scope on public.recetas;
create policy recetas_read_clinical_scope on public.recetas
for select to authenticated
using (
  eliminado = false
  and (public.is_admin() or (public.is_profesional() and public.can_access_sede(sede_id)))
);

drop policy if exists recetas_insert_clinical_scope on public.recetas;
create policy recetas_insert_clinical_scope on public.recetas
for insert to authenticated
with check (public.is_admin() or (public.is_profesional() and public.can_access_sede(sede_id)));

drop policy if exists recetas_update_clinical_scope on public.recetas;
create policy recetas_update_clinical_scope on public.recetas
for update to authenticated
using (public.is_admin() or (public.is_profesional() and public.can_access_sede(sede_id)))
with check (public.is_admin() or (public.is_profesional() and public.can_access_sede(sede_id)));

drop policy if exists receta_items_read_clinical_scope on public.receta_items;
create policy receta_items_read_clinical_scope on public.receta_items
for select to authenticated
using (
  exists (
    select 1 from public.recetas r
    where r.id = receta_items.receta_id
      and r.eliminado = false
      and (public.is_admin() or (public.is_profesional() and public.can_access_sede(r.sede_id)))
  )
);

drop policy if exists receta_items_write_clinical_scope on public.receta_items;
create policy receta_items_write_clinical_scope on public.receta_items
for all to authenticated
using (
  exists (
    select 1 from public.recetas r
    where r.id = receta_items.receta_id
      and (public.is_admin() or (public.is_profesional() and public.can_access_sede(r.sede_id)))
  )
)
with check (
  exists (
    select 1 from public.recetas r
    where r.id = receta_items.receta_id
      and (public.is_admin() or (public.is_profesional() and public.can_access_sede(r.sede_id)))
  )
);

create or replace function public.create_prescription(
  p_patient_id uuid,
  p_branch_id uuid,
  p_professional_id uuid,
  p_date date,
  p_diagnosis text,
  p_general_instructions text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.perfiles%rowtype;
  v_prescription_id uuid;
begin
  select * into v_profile
  from public.perfiles
  where auth_user_id = auth.uid() and activo = true
  limit 1;

  if v_profile.id is null then
    raise exception 'Usuario sin perfil activo.';
  end if;

  if v_profile.rol not in ('administrador', 'profesional') then
    raise exception 'Solo administradores y profesionales pueden emitir recetas.';
  end if;

  if not public.can_access_sede(p_branch_id) then
    raise exception 'No tienes acceso a la sede seleccionada.';
  end if;

  if not exists (select 1 from public.pacientes p where p.id = p_patient_id and p.eliminado = false) then
    raise exception 'Paciente no encontrado.';
  end if;

  if v_profile.rol = 'profesional' and not exists (
    select 1 from public.profesionales pr
    where pr.id = p_professional_id and pr.usuario_id = v_profile.id and pr.activo = true
  ) then
    raise exception 'El profesional seleccionado no corresponde al usuario actual.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un medicamento o indicacion.';
  end if;

  insert into public.recetas (
    paciente_id, sede_id, profesional_id, fecha, diagnostico, indicaciones_generales, creado_por
  ) values (
    p_patient_id,
    p_branch_id,
    p_professional_id,
    coalesce(p_date, current_date),
    nullif(trim(p_diagnosis), ''),
    nullif(trim(p_general_instructions), ''),
    v_profile.id
  ) returning id into v_prescription_id;

  insert into public.receta_items (
    receta_id, medicamento, dosis, frecuencia, duracion, via, indicaciones, orden
  )
  select
    v_prescription_id,
    trim(item.medicamento),
    nullif(trim(item.dosis), ''),
    nullif(trim(item.frecuencia), ''),
    nullif(trim(item.duracion), ''),
    nullif(trim(item.via), ''),
    nullif(trim(item.indicaciones), ''),
    item.orden
  from jsonb_to_recordset(p_items) as item(
    medicamento text, dosis text, frecuencia text, duracion text, via text, indicaciones text, orden integer
  );

  return v_prescription_id;
end;
$$;

create or replace function public.soft_delete_prescription(p_prescription_id uuid)
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
  from public.recetas
  where id = p_prescription_id and eliminado = false;

  if v_profile.id is null or v_branch_id is null then
    raise exception 'Receta no encontrada o usuario sin perfil activo.';
  end if;

  if v_profile.rol not in ('administrador', 'profesional') or not public.can_access_sede(v_branch_id) then
    raise exception 'No tienes permiso para eliminar esta receta.';
  end if;

  update public.recetas set eliminado = true where id = p_prescription_id;
end;
$$;

revoke all on function public.create_prescription(uuid, uuid, uuid, date, text, text, jsonb) from public;
revoke all on function public.soft_delete_prescription(uuid) from public;
grant execute on function public.create_prescription(uuid, uuid, uuid, date, text, text, jsonb) to authenticated;
grant execute on function public.soft_delete_prescription(uuid) to authenticated;
