-- Firmas digitales manuscritas y comunicacion interna de Body Feet.
-- Ejecutar despues de 202608250001_complete_clinical_history.sql.

create table if not exists public.firmas_documentos (
  id uuid primary key default gen_random_uuid(),
  tipo_documento text not null check (tipo_documento in ('historia_clinica', 'expediente_podologico', 'receta')),
  documento_id uuid not null,
  sede_id uuid not null references public.sedes(id),
  paciente_id uuid not null references public.pacientes(id),
  tipo_firmante text not null check (tipo_firmante in ('paciente', 'profesional', 'responsable')),
  firmante_nombre text not null check (char_length(trim(firmante_nombre)) between 2 and 120),
  trazos jsonb not null check (
    jsonb_typeof(trazos) = 'array'
    and jsonb_array_length(trazos) between 1 and 50
    and octet_length(trazos::text) <= 120000
  ),
  creado_por uuid not null references public.perfiles(id),
  firmado_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tipo_documento, documento_id, tipo_firmante)
);

create index if not exists firmas_documentos_documento_idx
  on public.firmas_documentos (tipo_documento, documento_id);
create index if not exists firmas_documentos_paciente_idx
  on public.firmas_documentos (paciente_id, firmado_at desc);
create index if not exists firmas_documentos_sede_idx
  on public.firmas_documentos (sede_id, firmado_at desc);

create table if not exists public.mensajes_internos (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid not null references public.perfiles(id),
  autor_nombre text not null,
  autor_rol text not null,
  sede_id uuid references public.sedes(id),
  contenido text not null check (char_length(trim(contenido)) between 1 and 2000),
  eliminado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mensajes_internos_canal_fecha_idx
  on public.mensajes_internos (sede_id, created_at desc)
  where eliminado = false;

create table if not exists public.comunicados (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid not null references public.perfiles(id),
  autor_nombre text not null,
  autor_rol text not null,
  sede_id uuid references public.sedes(id),
  tipo text not null default 'novedad' check (tipo in ('novedad', 'evidencia', 'incidencia', 'logro')),
  titulo text not null check (char_length(trim(titulo)) between 3 and 140),
  contenido text not null check (char_length(trim(contenido)) between 3 and 4000),
  evidencia_path text,
  fijado boolean not null default false,
  eliminado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists comunicados_canal_fecha_idx
  on public.comunicados (sede_id, fijado desc, created_at desc)
  where eliminado = false;

create table if not exists public.comentarios_comunicado (
  id uuid primary key default gen_random_uuid(),
  comunicado_id uuid not null references public.comunicados(id) on delete cascade,
  autor_id uuid not null references public.perfiles(id),
  autor_nombre text not null,
  autor_rol text not null,
  contenido text not null check (char_length(trim(contenido)) between 1 and 1500),
  eliminado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists comentarios_comunicado_fecha_idx
  on public.comentarios_comunicado (comunicado_id, created_at)
  where eliminado = false;

create or replace function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_profile_id() is not null;
$$;

create or replace function public.can_access_signed_document(p_tipo text, p_documento_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return true;
  end if;

  if not public.is_profesional() then
    return false;
  end if;

  if p_tipo = 'historia_clinica' then
    return exists (
      select 1
      from public.historias_clinicas hc
      join public.profesionales pr on pr.usuario_id = public.current_profile_id() and pr.activo = true
      where hc.id = p_documento_id
        and hc.eliminado = false
        and public.can_access_sede(hc.sede_id)
        and (
          hc.profesional_id = pr.id
          or exists (
            select 1 from public.citas c
            where c.id = hc.cita_id and c.profesional_id = pr.id and c.eliminado = false
          )
        )
    );
  elsif p_tipo = 'expediente_podologico' then
    return exists (
      select 1
      from public.expedientes_podologia ep
      join public.profesionales pr on pr.usuario_id = public.current_profile_id() and pr.activo = true
      where ep.id = p_documento_id
        and ep.eliminado = false
        and ep.profesional_id = pr.id
        and public.can_access_sede(ep.sede_id)
    );
  elsif p_tipo = 'receta' then
    return exists (
      select 1
      from public.recetas r
      join public.profesionales pr on pr.usuario_id = public.current_profile_id() and pr.activo = true
      where r.id = p_documento_id
        and r.eliminado = false
        and r.profesional_id = pr.id
        and public.can_access_sede(r.sede_id)
    );
  end if;

  return false;
end;
$$;

create or replace function public.save_document_signature(
  p_tipo_documento text,
  p_documento_id uuid,
  p_tipo_firmante text,
  p_firmante_nombre text,
  p_trazos jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sede_id uuid;
  v_paciente_id uuid;
  v_signature_id uuid;
begin
  if p_tipo_documento not in ('historia_clinica', 'expediente_podologico', 'receta') then
    raise exception 'Tipo de documento no valido';
  end if;
  if p_tipo_firmante not in ('paciente', 'profesional', 'responsable') then
    raise exception 'Tipo de firmante no valido';
  end if;
  if char_length(trim(coalesce(p_firmante_nombre, ''))) not between 2 and 120 then
    raise exception 'Escribe el nombre completo del firmante';
  end if;
  if jsonb_typeof(p_trazos) <> 'array'
     or jsonb_array_length(p_trazos) not between 1 and 50
     or octet_length(p_trazos::text) > 120000 then
    raise exception 'La firma no es valida o excede el tamano permitido';
  end if;
  if not public.can_access_signed_document(p_tipo_documento, p_documento_id) then
    raise exception 'No tienes permiso para firmar este documento';
  end if;

  if p_tipo_documento = 'historia_clinica' then
    select sede_id, paciente_id into v_sede_id, v_paciente_id
    from public.historias_clinicas where id = p_documento_id and eliminado = false;
  elsif p_tipo_documento = 'expediente_podologico' then
    select sede_id, paciente_id into v_sede_id, v_paciente_id
    from public.expedientes_podologia where id = p_documento_id and eliminado = false;
  else
    select sede_id, paciente_id into v_sede_id, v_paciente_id
    from public.recetas where id = p_documento_id and eliminado = false;
  end if;

  if v_sede_id is null or v_paciente_id is null then
    raise exception 'Documento no encontrado';
  end if;

  insert into public.firmas_documentos (
    tipo_documento, documento_id, sede_id, paciente_id, tipo_firmante,
    firmante_nombre, trazos, creado_por, firmado_at, updated_at
  )
  values (
    p_tipo_documento, p_documento_id, v_sede_id, v_paciente_id, p_tipo_firmante,
    trim(p_firmante_nombre), p_trazos, public.current_profile_id(), now(), now()
  )
  on conflict (tipo_documento, documento_id, tipo_firmante)
  do update set
    firmante_nombre = excluded.firmante_nombre,
    trazos = excluded.trazos,
    creado_por = excluded.creado_por,
    firmado_at = now(),
    updated_at = now()
  returning id into v_signature_id;

  return v_signature_id;
end;
$$;

create or replace function public.delete_document_signature(p_signature_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_signature public.firmas_documentos%rowtype;
begin
  select * into v_signature from public.firmas_documentos where id = p_signature_id;
  if not found then
    return;
  end if;
  if not public.can_access_signed_document(v_signature.tipo_documento, v_signature.documento_id) then
    raise exception 'No tienes permiso para eliminar esta firma';
  end if;
  delete from public.firmas_documentos where id = p_signature_id;
end;
$$;

create or replace function public.stamp_internal_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.perfiles%rowtype;
begin
  select * into v_profile
  from public.perfiles
  where id = public.current_profile_id() and activo = true;

  if not found then
    raise exception 'Perfil activo requerido';
  end if;

  if tg_op = 'UPDATE' then
    new.autor_id = old.autor_id;
    new.autor_nombre = old.autor_nombre;
    new.autor_rol = old.autor_rol;
  else
    new.autor_id = v_profile.id;
    new.autor_nombre = trim(v_profile.nombres || ' ' || v_profile.apellidos);
    new.autor_rol = v_profile.rol::text;
  end if;

  if tg_table_name = 'comunicados' and not public.is_admin() then
    if tg_op = 'INSERT' and coalesce((to_jsonb(new)->>'fijado')::boolean, false) then
      raise exception 'Solo administracion puede fijar comunicados';
    elsif tg_op = 'UPDATE'
      and coalesce((to_jsonb(new)->>'fijado')::boolean, false)
        is distinct from coalesce((to_jsonb(old)->>'fijado')::boolean, false) then
      raise exception 'Solo administracion puede cambiar el estado fijado';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists firmas_documentos_set_updated_at on public.firmas_documentos;
create trigger firmas_documentos_set_updated_at
before update on public.firmas_documentos
for each row execute function public.set_updated_at();

drop trigger if exists mensajes_internos_set_updated_at on public.mensajes_internos;
create trigger mensajes_internos_set_updated_at
before update on public.mensajes_internos
for each row execute function public.set_updated_at();

drop trigger if exists comunicados_set_updated_at on public.comunicados;
create trigger comunicados_set_updated_at
before update on public.comunicados
for each row execute function public.set_updated_at();

drop trigger if exists comentarios_comunicado_set_updated_at on public.comentarios_comunicado;
create trigger comentarios_comunicado_set_updated_at
before update on public.comentarios_comunicado
for each row execute function public.set_updated_at();

drop trigger if exists mensajes_internos_stamp_author on public.mensajes_internos;
create trigger mensajes_internos_stamp_author
before insert or update on public.mensajes_internos
for each row execute function public.stamp_internal_author();

drop trigger if exists comunicados_stamp_author on public.comunicados;
create trigger comunicados_stamp_author
before insert or update on public.comunicados
for each row execute function public.stamp_internal_author();

drop trigger if exists comentarios_comunicado_stamp_author on public.comentarios_comunicado;
create trigger comentarios_comunicado_stamp_author
before insert or update on public.comentarios_comunicado
for each row execute function public.stamp_internal_author();

drop trigger if exists auditoria_firmas_documentos on public.firmas_documentos;
create trigger auditoria_firmas_documentos
after insert or update or delete on public.firmas_documentos
for each row execute function public.audit_row_changes();

drop trigger if exists auditoria_comunicados on public.comunicados;
create trigger auditoria_comunicados
after insert or update or delete on public.comunicados
for each row execute function public.audit_row_changes();

alter table public.firmas_documentos enable row level security;
alter table public.mensajes_internos enable row level security;
alter table public.comunicados enable row level security;
alter table public.comentarios_comunicado enable row level security;

drop policy if exists firmas_documentos_read on public.firmas_documentos;
create policy firmas_documentos_read on public.firmas_documentos
for select to authenticated
using (public.can_access_signed_document(tipo_documento, documento_id));

drop policy if exists mensajes_internos_read on public.mensajes_internos;
create policy mensajes_internos_read on public.mensajes_internos
for select to authenticated using (public.is_active_staff() and eliminado = false);
drop policy if exists mensajes_internos_insert on public.mensajes_internos;
create policy mensajes_internos_insert on public.mensajes_internos
for insert to authenticated with check (public.is_active_staff());
drop policy if exists mensajes_internos_update on public.mensajes_internos;
create policy mensajes_internos_update on public.mensajes_internos
for update to authenticated
using (autor_id = public.current_profile_id() or public.is_admin())
with check (autor_id = public.current_profile_id() or public.is_admin());

drop policy if exists comunicados_read on public.comunicados;
create policy comunicados_read on public.comunicados
for select to authenticated using (public.is_active_staff() and eliminado = false);
drop policy if exists comunicados_insert on public.comunicados;
create policy comunicados_insert on public.comunicados
for insert to authenticated with check (public.is_active_staff());
drop policy if exists comunicados_update on public.comunicados;
create policy comunicados_update on public.comunicados
for update to authenticated
using (autor_id = public.current_profile_id() or public.is_admin())
with check (autor_id = public.current_profile_id() or public.is_admin());

drop policy if exists comentarios_comunicado_read on public.comentarios_comunicado;
create policy comentarios_comunicado_read on public.comentarios_comunicado
for select to authenticated
using (
  public.is_active_staff()
  and eliminado = false
  and exists (
    select 1 from public.comunicados c
    where c.id = comentarios_comunicado.comunicado_id and c.eliminado = false
  )
);
drop policy if exists comentarios_comunicado_insert on public.comentarios_comunicado;
create policy comentarios_comunicado_insert on public.comentarios_comunicado
for insert to authenticated
with check (
  public.is_active_staff()
  and exists (
    select 1 from public.comunicados c
    where c.id = comentarios_comunicado.comunicado_id and c.eliminado = false
  )
);
drop policy if exists comentarios_comunicado_update on public.comentarios_comunicado;
create policy comentarios_comunicado_update on public.comentarios_comunicado
for update to authenticated
using (autor_id = public.current_profile_id() or public.is_admin())
with check (autor_id = public.current_profile_id() or public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'team-evidence',
  'team-evidence',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists team_evidence_read on storage.objects;
create policy team_evidence_read on storage.objects
for select to authenticated
using (bucket_id = 'team-evidence' and public.is_active_staff());

drop policy if exists team_evidence_insert on storage.objects;
create policy team_evidence_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'team-evidence'
  and public.is_active_staff()
  and (storage.foldername(name))[1] = public.current_profile_id()::text
);

drop policy if exists team_evidence_delete on storage.objects;
create policy team_evidence_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'team-evidence'
  and (
    (storage.foldername(name))[1] = public.current_profile_id()::text
    or public.is_admin()
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mensajes_internos'
  ) then
    alter publication supabase_realtime add table public.mensajes_internos;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comunicados'
  ) then
    alter publication supabase_realtime add table public.comunicados;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comentarios_comunicado'
  ) then
    alter publication supabase_realtime add table public.comentarios_comunicado;
  end if;
end
$$;

revoke all on function public.is_active_staff() from public;
revoke all on function public.can_access_signed_document(text, uuid) from public;
revoke all on function public.save_document_signature(text, uuid, text, text, jsonb) from public;
revoke all on function public.delete_document_signature(uuid) from public;
grant execute on function public.is_active_staff() to authenticated;
grant execute on function public.can_access_signed_document(text, uuid) to authenticated;
grant execute on function public.save_document_signature(text, uuid, text, text, jsonb) to authenticated;
grant execute on function public.delete_document_signature(uuid) to authenticated;

grant select on public.firmas_documentos to authenticated;
grant select, insert, update on public.mensajes_internos to authenticated;
grant select, insert, update on public.comunicados to authenticated;
grant select, insert, update on public.comentarios_comunicado to authenticated;
