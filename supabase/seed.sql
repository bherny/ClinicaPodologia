insert into public.sedes (nombre, direccion, telefono, horario, activo)
values
  ('Musa', 'Pendiente de registrar', 'Pendiente de registrar', 'Pendiente de registrar', true),
  ('Flora Tristan', 'Pendiente de registrar', 'Pendiente de registrar', 'Pendiente de registrar', true),
  ('Manchay', 'Pendiente de registrar', 'Pendiente de registrar', 'Pendiente de registrar', true)
on conflict (nombre) do update
set activo = excluded.activo;

insert into public.servicios (nombre, descripcion, duracion_aproximada, activo)
values
  ('Podologia', null, 45, true),
  ('Acupuntura', null, 45, true),
  ('Quiropraxia', null, 45, true),
  ('Terapia Fisica', null, 60, true),
  ('Plantillas Ortopedicas', null, 45, true),
  ('Cosmiatria', null, 45, true),
  ('Magneto', null, 45, true),
  ('Terapia Combinada', null, 60, true),
  ('Laser', null, 45, true),
  ('CHC', null, 45, true),
  ('CF', null, 45, true),
  ('Kinesiologia', null, 60, true),
  ('Parafina', null, 30, true),
  ('Ondas de choque', null, 45, true)
on conflict (nombre) do update
set activo = excluded.activo,
    duracion_aproximada = excluded.duracion_aproximada;

insert into public.servicio_sede (servicio_id, sede_id)
select servicios.id, sedes.id
from public.servicios
cross join public.sedes
on conflict do nothing;
