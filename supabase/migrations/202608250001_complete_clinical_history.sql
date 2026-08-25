-- Ficha clinica integral solicitada por Body Feet.
-- Conserva las columnas historicas y agrega una evaluacion estructurada versionada.

alter table public.historias_clinicas
  add column if not exists fecha_evaluacion date;

update public.historias_clinicas hc
set fecha_evaluacion = coalesce(
  (select c.fecha from public.citas c where c.id = hc.cita_id),
  hc.created_at::date,
  current_date
)
where hc.fecha_evaluacion is null;

alter table public.historias_clinicas
  alter column fecha_evaluacion set default current_date,
  alter column fecha_evaluacion set not null;

alter table public.historias_clinicas
  add column if not exists evaluacion jsonb not null default '{"version": 1}'::jsonb;

alter table public.historias_clinicas
  drop constraint if exists historias_clinicas_evaluacion_object_check;

alter table public.historias_clinicas
  add constraint historias_clinicas_evaluacion_object_check
  check (jsonb_typeof(evaluacion) = 'object');

create index if not exists historias_clinicas_fecha_evaluacion_idx
  on public.historias_clinicas (fecha_evaluacion desc)
  where eliminado = false;

create index if not exists historias_clinicas_evaluacion_gin_idx
  on public.historias_clinicas using gin (evaluacion jsonb_path_ops);

comment on column public.historias_clinicas.fecha_evaluacion is
  'Fecha clinica de la evaluacion, independiente de la fecha de creacion del registro.';

comment on column public.historias_clinicas.evaluacion is
  'Ficha clinica estructurada y versionada: anamnesis, sintomas, dolor, limitaciones, pruebas y plan.';

notify pgrst, 'reload schema';