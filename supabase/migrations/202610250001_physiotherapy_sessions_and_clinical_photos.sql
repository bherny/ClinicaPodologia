-- Sesiones de fisioterapia y registro fotografico privado de la historia clinica.
-- Ejecutar despues de 202608260002_internal_message_replies.sql.

create table if not exists public.sesiones_fisioterapia (
  id uuid primary key default gen_random_uuid(),
  historia_clinica_id uuid not null references public.historias_clinicas(id) on delete cascade,
  paciente_id uuid not null references public.pacientes(id),
  sede_id uuid not null references public.sedes(id),
  profesional_id uuid references public.profesionales(id),
  fecha date not null default current_date,
  numero_sesion integer not null default 1 check (numero_sesion between 1 and 9999),
  motivo_zona text,
  diagnostico_medico text,
  eva_inicial smallint check (eva_inicial between 0 and 10),
  eva_final smallint check (eva_final between 0 and 10),
  zona_dolor text,
  observaciones_clinicas text[] not null default '{}',
  observacion_otro text,
  hallazgos text,
  tratamientos text[] not null default '{}',
  otro_tratamiento text,
  ejercicios_dosificacion text,
  evolucion text not null default '' check (evolucion in ('', 'mejoro', 'igual', 'empeoro')),
  respuesta_paciente text,
  indicaciones_proxima_sesion text,
  tecnico_nombre text,
  firma_trazos jsonb not null default '[]'::jsonb check (
    jsonb_typeof(firma_trazos) = 'array'
    and jsonb_array_length(firma_trazos) <= 50
    and octet_length(firma_trazos::text) <= 120000
  ),
  creado_por uuid references public.perfiles(id),
  eliminado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sesiones_fisioterapia_historia_numero_uniq
  on public.sesiones_fisioterapia (historia_clinica_id, numero_sesion);
create index if not exists sesiones_fisioterapia_historia_fecha_idx
  on public.sesiones_fisioterapia (historia_clinica_id, fecha desc, numero_sesion desc)
  where eliminado = false;
create index if not exists sesiones_fisioterapia_paciente_idx
  on public.sesiones_fisioterapia (paciente_id, fecha desc)
  where eliminado = false;

create table if not exists public.historia_clinica_fotos (
  id uuid primary key default gen_random_uuid(),
  historia_clinica_id uuid not null references public.historias_clinicas(id) on delete cascade,
  sesion_fisioterapia_id uuid references public.sesiones_fisioterapia(id) on delete set null,
  paciente_id uuid not null references public.pacientes(id),
  sede_id uuid not null references public.sedes(id),
  etapa text not null default 'seguimiento' check (etapa in ('antes', 'despues', 'seguimiento', 'otra')),
  fecha_toma timestamptz not null default now(),
  storage_path text not null unique,
  nota text,
  creado_por uuid references public.perfiles(id),
  eliminado boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists historia_clinica_fotos_historia_fecha_idx
  on public.historia_clinica_fotos (historia_clinica_id, fecha_toma desc)
  where eliminado = false;

create or replace function public.can_access_clinical_history(p_history_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.historias_clinicas hc
    where hc.id = p_history_id
      and hc.eliminado = false
      and (
        public.is_admin()
        or (
          public.is_profesional()
          and public.can_access_sede(hc.sede_id)
          and exists (
            select 1
            from public.profesionales pr
            where pr.usuario_id = public.current_profile_id()
              and pr.activo = true
              and (
                pr.id = hc.profesional_id
                or exists (
                  select 1 from public.citas c
                  where c.id = hc.cita_id
                    and c.profesional_id = pr.id
                    and c.eliminado = false
                )
              )
          )
        )
      )
  );
$$;

alter table public.sesiones_fisioterapia enable row level security;
alter table public.historia_clinica_fotos enable row level security;

drop policy if exists sesiones_fisioterapia_read on public.sesiones_fisioterapia;
create policy sesiones_fisioterapia_read on public.sesiones_fisioterapia
for select to authenticated
using (eliminado = false and public.can_access_clinical_history(historia_clinica_id));

drop policy if exists sesiones_fisioterapia_insert on public.sesiones_fisioterapia;
create policy sesiones_fisioterapia_insert on public.sesiones_fisioterapia
for insert to authenticated
with check (
  public.can_access_clinical_history(historia_clinica_id)
  and paciente_id = (select hc.paciente_id from public.historias_clinicas hc where hc.id = historia_clinica_id)
  and sede_id = (select hc.sede_id from public.historias_clinicas hc where hc.id = historia_clinica_id)
  and creado_por = public.current_profile_id()
);

drop policy if exists sesiones_fisioterapia_update on public.sesiones_fisioterapia;
create policy sesiones_fisioterapia_update on public.sesiones_fisioterapia
for update to authenticated
using (public.can_access_clinical_history(historia_clinica_id))
with check (public.can_access_clinical_history(historia_clinica_id));

drop policy if exists historia_clinica_fotos_read on public.historia_clinica_fotos;
create policy historia_clinica_fotos_read on public.historia_clinica_fotos
for select to authenticated
using (eliminado = false and public.can_access_clinical_history(historia_clinica_id));

drop policy if exists historia_clinica_fotos_insert on public.historia_clinica_fotos;
create policy historia_clinica_fotos_insert on public.historia_clinica_fotos
for insert to authenticated
with check (
  public.can_access_clinical_history(historia_clinica_id)
  and paciente_id = (select hc.paciente_id from public.historias_clinicas hc where hc.id = historia_clinica_id)
  and sede_id = (select hc.sede_id from public.historias_clinicas hc where hc.id = historia_clinica_id)
  and creado_por = public.current_profile_id()
);

drop policy if exists historia_clinica_fotos_update on public.historia_clinica_fotos;
create policy historia_clinica_fotos_update on public.historia_clinica_fotos
for update to authenticated
using (public.can_access_clinical_history(historia_clinica_id))
with check (public.can_access_clinical_history(historia_clinica_id));

drop trigger if exists sesiones_fisioterapia_set_updated_at on public.sesiones_fisioterapia;
create trigger sesiones_fisioterapia_set_updated_at
before update on public.sesiones_fisioterapia
for each row execute function public.set_updated_at();

drop trigger if exists auditoria_sesiones_fisioterapia on public.sesiones_fisioterapia;
create trigger auditoria_sesiones_fisioterapia
after insert or update or delete on public.sesiones_fisioterapia
for each row execute function public.audit_row_changes();

drop trigger if exists auditoria_historia_clinica_fotos on public.historia_clinica_fotos;
create trigger auditoria_historia_clinica_fotos
after insert or update or delete on public.historia_clinica_fotos
for each row execute function public.audit_row_changes();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clinical-history-photos',
  'clinical-history-photos',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists clinical_history_photos_read on storage.objects;
create policy clinical_history_photos_read on storage.objects
for select to authenticated
using (
  bucket_id = 'clinical-history-photos'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.can_access_clinical_history(split_part(name, '/', 1)::uuid)
);

drop policy if exists clinical_history_photos_insert on storage.objects;
create policy clinical_history_photos_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'clinical-history-photos'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.can_access_clinical_history(split_part(name, '/', 1)::uuid)
);

drop policy if exists clinical_history_photos_delete on storage.objects;
create policy clinical_history_photos_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'clinical-history-photos'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.can_access_clinical_history(split_part(name, '/', 1)::uuid)
);

revoke all on function public.can_access_clinical_history(uuid) from public;
grant execute on function public.can_access_clinical_history(uuid) to authenticated;
grant select, insert, update on public.sesiones_fisioterapia to authenticated;
grant select, insert, update on public.historia_clinica_fotos to authenticated;

notify pgrst, 'reload schema';
