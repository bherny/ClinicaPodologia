-- Vincula cada nuevo expediente con una cita podologica o servicio derivado.

create or replace function public.validate_podology_appointment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_appointment record;
begin
  if new.cita_id is null then
    raise exception 'Selecciona una cita podologica para crear el expediente.';
  end if;

  select c.paciente_id, c.sede_id, s.nombre as servicio
  into v_appointment
  from public.citas c
  join public.servicios s on s.id = c.servicio_id
  where c.id = new.cita_id
    and c.eliminado = false;

  if v_appointment.paciente_id is null then
    raise exception 'La cita seleccionada no existe o fue eliminada.';
  end if;

  if v_appointment.paciente_id <> new.paciente_id or v_appointment.sede_id <> new.sede_id then
    raise exception 'El paciente y la sede deben coincidir con la cita seleccionada.';
  end if;

  if lower(v_appointment.servicio) !~ '(podolog|plantilla|quiropod|onic|pie)' then
    raise exception 'La cita no corresponde a Podologia ni a un servicio relacionado.';
  end if;

  return new;
end;
$$;

drop trigger if exists expedientes_validate_podology_appointment on public.expedientes_podologia;
create trigger expedientes_validate_podology_appointment
before insert or update of cita_id, paciente_id, sede_id on public.expedientes_podologia
for each row execute function public.validate_podology_appointment();

