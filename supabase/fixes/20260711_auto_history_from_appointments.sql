alter table public.historias_clinicas
add column if not exists eliminado boolean not null default false;

create or replace function public.soft_delete_clinical_history(p_history_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
  v_history_sede_id uuid;
begin
  select id, rol, sede_id, activo
  into v_profile
  from public.perfiles
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;

  if v_profile.id is null then
    raise exception 'Usuario sin perfil activo.';
  end if;

  select sede_id
  into v_history_sede_id
  from public.historperoias_clinicas
  where id = p_history_id
    and eliminado = false;

  if v_history_sede_id is null then
    raise exception 'Historia clinica no encontrada o ya eliminada.';
  end if;

  if v_profile.rol <> 'administrador'
    and not (v_profile.rol = 'recepcion' and v_profile.sede_id = v_history_sede_id) then
    raise exception 'No tienes permiso para eliminar esta historia clinica.';
  end if;

  update public.historias_clinicas
  set eliminado = true
  where id = p_history_id;
end;
$$;

revoke all on function public.soft_delete_clinical_history(uuid) from public;
grant execute on function public.soft_delete_clinical_history(uuid) to authenticated;

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
  where not exists (
    select 1
    from public.historias_clinicas hc
    where hc.cita_id = new.id
      and hc.eliminado = false
  );

  return new;
end;
$$;

drop trigger if exists citas_create_clinical_history on public.citas;

create trigger citas_create_clinical_history
after insert on public.citas
for each row
execute function public.create_clinical_history_from_appointment();

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
  and not exists (
    select 1
    from public.historias_clinicas hc
    where hc.cita_id = c.id
      and hc.eliminado = false
  );
