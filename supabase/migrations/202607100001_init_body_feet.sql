create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;
create extension if not exists btree_gist;

create type public.rol_usuario as enum ('administrador', 'recepcion', 'profesional');
create type public.sexo_paciente as enum ('femenino', 'masculino', 'otro', 'no_indica');
create type public.estado_cita as enum ('pendiente', 'confirmada', 'atendida', 'reprogramada', 'cancelada', 'no_asistio');
create type public.tipo_recordatorio as enum ('whatsapp', 'telefono', 'manual');
create type public.estado_recordatorio as enum (
  'programado',
  'enviado',
  'pendiente_respuesta',
  'confirmado',
  'reprogramado',
  'cancelado',
  'no_contactado'
);

create table public.sedes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  direccion text,
  telefono text,
  horario text,
  activo boolean not null default true,
  responsable_sede text,
  created_at timestamptz not null default now()
);

create table public.perfiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  nombres text not null,
  apellidos text not null,
  correo text not null unique,
  telefono text,
  rol public.rol_usuario not null default 'recepcion',
  sede_id uuid references public.sedes(id) on delete set null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pacientes (
  id uuid primary key default gen_random_uuid(),
  nombres text not null,
  apellidos text not null,
  dni text,
  telefono text not null,
  telefono_alternativo text,
  fecha_nacimiento date,
  sexo public.sexo_paciente,
  direccion text,
  observaciones text,
  sede_de_registro_id uuid not null references public.sedes(id),
  creado_por uuid references public.perfiles(id) on delete set null,
  eliminado boolean not null default false,
  dni_normalizado text generated always as (nullif(regexp_replace(coalesce(dni, ''), '\D', '', 'g'), '')) stored,
  telefono_normalizado text generated always as (nullif(regexp_replace(coalesce(telefono, ''), '\D', '', 'g'), '')) stored,
  nombre_busqueda text generated always as (lower(trim(nombres || ' ' || apellidos))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pacientes_telefono_minimo check (length(regexp_replace(telefono, '\D', '', 'g')) >= 6)
);

create unique index pacientes_dni_unico_idx on public.pacientes (dni_normalizado)
where dni_normalizado is not null and eliminado = false;

create index pacientes_telefono_busqueda_idx on public.pacientes (telefono_normalizado)
where telefono_normalizado is not null and eliminado = false;

create index pacientes_busqueda_trgm_idx on public.pacientes using gin (nombre_busqueda gin_trgm_ops);
create index pacientes_sede_registro_idx on public.pacientes (sede_de_registro_id);

create table public.servicios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  descripcion text,
  duracion_aproximada integer not null default 45,
  precio numeric(10, 2),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint servicios_duracion_positiva check (duracion_aproximada > 0),
  constraint servicios_precio_no_negativo check (precio is null or precio >= 0)
);

create table public.profesionales (
  id uuid primary key default gen_random_uuid(),
  nombres text not null,
  apellidos text not null,
  especialidad text,
  telefono text,
  usuario_id uuid references public.perfiles(id) on delete set null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profesional_sede (
  profesional_id uuid not null references public.profesionales(id) on delete cascade,
  sede_id uuid not null references public.sedes(id) on delete cascade,
  horario_disponible text,
  primary key (profesional_id, sede_id)
);

create table public.servicio_sede (
  servicio_id uuid not null references public.servicios(id) on delete cascade,
  sede_id uuid not null references public.sedes(id) on delete cascade,
  primary key (servicio_id, sede_id)
);

create table public.profesional_servicio (
  profesional_id uuid not null references public.profesionales(id) on delete cascade,
  servicio_id uuid not null references public.servicios(id) on delete cascade,
  primary key (profesional_id, servicio_id)
);

create table public.citas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes(id),
  sede_id uuid not null references public.sedes(id),
  servicio_id uuid not null references public.servicios(id),
  profesional_id uuid references public.profesionales(id) on delete set null,
  fecha date not null,
  hora_inicio time not null,
  hora_fin time not null,
  diagnostico text,
  tratamiento text,
  observaciones text,
  estado public.estado_cita not null default 'pendiente',
  creado_por uuid references public.perfiles(id) on delete set null,
  eliminado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint citas_horas_validas check (hora_fin > hora_inicio)
);

alter table public.citas
  add constraint citas_sin_cruce_profesional
  exclude using gist (
    sede_id with =,
    profesional_id with =,
    tsrange(fecha + hora_inicio, fecha + hora_fin, '[)') with &&
  )
  where (
    profesional_id is not null
    and eliminado = false
    and estado in ('pendiente', 'confirmada', 'atendida')
  );

create index citas_fecha_sede_idx on public.citas (fecha, sede_id);
create index citas_paciente_idx on public.citas (paciente_id, fecha desc);
create index citas_profesional_fecha_idx on public.citas (profesional_id, fecha);
create index citas_estado_idx on public.citas (estado);

create table public.historias_clinicas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes(id),
  cita_id uuid references public.citas(id) on delete set null,
  sede_id uuid not null references public.sedes(id),
  profesional_id uuid references public.profesionales(id) on delete set null,
  diagnostico text not null,
  tratamiento_realizado text not null,
  evolucion text,
  recomendaciones text,
  proxima_fecha_sugerida date,
  eliminado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index historias_paciente_idx on public.historias_clinicas (paciente_id, created_at desc);
create index historias_cita_idx on public.historias_clinicas (cita_id);
create index historias_sede_idx on public.historias_clinicas (sede_id);

create table public.recordatorios (
  id uuid primary key default gen_random_uuid(),
  cita_id uuid not null references public.citas(id) on delete cascade,
  tipo public.tipo_recordatorio not null default 'whatsapp',
  fecha_programada timestamptz not null,
  estado public.estado_recordatorio not null default 'programado',
  fecha_envio timestamptz,
  enviado_por uuid references public.perfiles(id) on delete set null,
  medio text,
  mensaje text,
  observaciones text,
  created_at timestamptz not null default now()
);

create index recordatorios_cita_idx on public.recordatorios (cita_id);
create index recordatorios_estado_fecha_idx on public.recordatorios (estado, fecha_programada);

create table public.auditoria (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.perfiles(id) on delete set null,
  accion text not null,
  tabla_afectada text not null,
  registro_id uuid,
  informacion_anterior jsonb,
  informacion_nueva jsonb,
  fecha timestamptz not null default now()
);

create index auditoria_tabla_registro_idx on public.auditoria (tabla_afectada, registro_id);
create index auditoria_fecha_idx on public.auditoria (fecha desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger perfiles_set_updated_at
before update on public.perfiles
for each row execute function public.set_updated_at();

create trigger pacientes_set_updated_at
before update on public.pacientes
for each row execute function public.set_updated_at();

create trigger citas_set_updated_at
before update on public.citas
for each row execute function public.set_updated_at();

create trigger historias_set_updated_at
before update on public.historias_clinicas
for each row execute function public.set_updated_at();

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.perfiles
  where auth_user_id = auth.uid() and activo = true
  limit 1;
$$;

create or replace function public.current_user_role()
returns public.rol_usuario
language sql
stable
security definer
set search_path = public
as $$
  select rol from public.perfiles
  where auth_user_id = auth.uid() and activo = true
  limit 1;
$$;

create or replace function public.current_user_sede_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select sede_id from public.perfiles
  where auth_user_id = auth.uid() and activo = true
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'administrador', false);
$$;

create or replace function public.is_recepcion()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'recepcion', false);
$$;

create or replace function public.is_profesional()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'profesional', false);
$$;

create or replace function public.can_access_sede(target_sede_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or (
      public.current_user_role() = 'recepcion'
      and public.current_user_sede_id() = target_sede_id
    )
    or exists (
      select 1
      from public.profesionales pr
      join public.profesional_sede ps on ps.profesional_id = pr.id
      where pr.usuario_id = public.current_profile_id()
        and pr.activo = true
        and ps.sede_id = target_sede_id
    );
$$;

create or replace function public.audit_row_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario uuid;
  v_registro uuid;
begin
  select public.current_profile_id() into v_usuario;

  if tg_op = 'INSERT' then
    v_registro := new.id;
    insert into public.auditoria (usuario_id, accion, tabla_afectada, registro_id, informacion_nueva)
    values (v_usuario, 'creacion', tg_table_name, v_registro, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    v_registro := new.id;
    insert into public.auditoria (usuario_id, accion, tabla_afectada, registro_id, informacion_anterior, informacion_nueva)
    values (
      v_usuario,
      case
        when tg_table_name = 'citas' and to_jsonb(old)->>'estado' is distinct from to_jsonb(new)->>'estado' then 'cambio_estado'
        when tg_table_name = 'citas'
          and (
            to_jsonb(old)->>'fecha',
            to_jsonb(old)->>'hora_inicio',
            to_jsonb(old)->>'hora_fin'
          ) is distinct from (
            to_jsonb(new)->>'fecha',
            to_jsonb(new)->>'hora_inicio',
            to_jsonb(new)->>'hora_fin'
          ) then 'reprogramacion'
        when tg_table_name = 'citas' and to_jsonb(old)->>'sede_id' is distinct from to_jsonb(new)->>'sede_id' then 'cambio_sede'
        when coalesce((to_jsonb(old)->>'eliminado')::boolean, false) = false
          and coalesce((to_jsonb(new)->>'eliminado')::boolean, false) = true then 'eliminacion_logica'
        else 'edicion'
      end,
      tg_table_name,
      v_registro,
      to_jsonb(old),
      to_jsonb(new)
    );
    return new;
  elsif tg_op = 'DELETE' then
    v_registro := old.id;
    insert into public.auditoria (usuario_id, accion, tabla_afectada, registro_id, informacion_anterior)
    values (v_usuario, 'eliminacion', tg_table_name, v_registro, to_jsonb(old));
    return old;
  end if;

  return null;
end;
$$;

create trigger auditoria_perfiles
after insert or update or delete on public.perfiles
for each row execute function public.audit_row_changes();

create trigger auditoria_sedes
after insert or update or delete on public.sedes
for each row execute function public.audit_row_changes();

create trigger auditoria_pacientes
after insert or update or delete on public.pacientes
for each row execute function public.audit_row_changes();

create trigger auditoria_servicios
after insert or update or delete on public.servicios
for each row execute function public.audit_row_changes();

create trigger auditoria_profesionales
after insert or update or delete on public.profesionales
for each row execute function public.audit_row_changes();

create trigger auditoria_citas
after insert or update or delete on public.citas
for each row execute function public.audit_row_changes();

create trigger auditoria_historias
after insert or update or delete on public.historias_clinicas
for each row execute function public.audit_row_changes();

create trigger auditoria_recordatorios
after insert or update or delete on public.recordatorios
for each row execute function public.audit_row_changes();

alter table public.perfiles enable row level security;
alter table public.sedes enable row level security;
alter table public.pacientes enable row level security;
alter table public.servicios enable row level security;
alter table public.profesionales enable row level security;
alter table public.profesional_sede enable row level security;
alter table public.servicio_sede enable row level security;
alter table public.profesional_servicio enable row level security;
alter table public.citas enable row level security;
alter table public.historias_clinicas enable row level security;
alter table public.recordatorios enable row level security;
alter table public.auditoria enable row level security;

create policy perfiles_admin_all on public.perfiles
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy perfiles_own_read on public.perfiles
for select to authenticated
using (auth_user_id = auth.uid());

create policy sedes_read on public.sedes
for select to authenticated
using (activo = true or public.is_admin());

create policy sedes_admin_write on public.sedes
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy servicios_read on public.servicios
for select to authenticated
using (activo = true or public.is_admin());

create policy servicios_admin_write on public.servicios
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy profesionales_read on public.profesionales
for select to authenticated
using (
  activo = true
  or public.is_admin()
  or usuario_id = public.current_profile_id()
);

create policy profesionales_admin_write on public.profesionales
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy profesional_sede_read on public.profesional_sede
for select to authenticated
using (public.is_admin() or public.can_access_sede(sede_id));

create policy profesional_sede_admin_write on public.profesional_sede
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy servicio_sede_read on public.servicio_sede
for select to authenticated
using (public.is_admin() or public.can_access_sede(sede_id));

create policy servicio_sede_admin_write on public.servicio_sede
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy profesional_servicio_read on public.profesional_servicio
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.profesional_sede ps
    where ps.profesional_id = profesional_servicio.profesional_id
      and public.can_access_sede(ps.sede_id)
  )
);

create policy profesional_servicio_admin_write on public.profesional_servicio
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy pacientes_read_by_scope on public.pacientes
for select to authenticated
using (
  eliminado = false
  and (
    public.is_admin()
    or public.can_access_sede(sede_de_registro_id)
    or exists (
      select 1 from public.citas c
      where c.paciente_id = pacientes.id
        and c.eliminado = false
        and public.can_access_sede(c.sede_id)
    )
  )
);

create policy pacientes_insert_by_scope on public.pacientes
for insert to authenticated
with check (
  public.is_admin()
  or (public.is_recepcion() and sede_de_registro_id = public.current_user_sede_id())
);

create policy pacientes_update_by_scope on public.pacientes
for update to authenticated
using (
  exists (
    select 1
    from public.perfiles p
    where p.auth_user_id = auth.uid()
      and p.activo = true
      and (
        p.rol = 'administrador'
        or (
          p.rol = 'recepcion'
          and p.sede_id = pacientes.sede_de_registro_id
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.perfiles p
    where p.auth_user_id = auth.uid()
      and p.activo = true
      and p.rol in ('administrador', 'recepcion')
  )
);

create policy citas_read_by_scope on public.citas
for select to authenticated
using (
  eliminado = false
  and (
    public.is_admin()
    or public.can_access_sede(sede_id)
    or exists (
      select 1
      from public.profesionales pr
      where pr.id = citas.profesional_id
        and pr.usuario_id = public.current_profile_id()
    )
  )
);

create policy citas_insert_by_scope on public.citas
for insert to authenticated
with check (
  public.is_admin()
  or (public.is_recepcion() and sede_id = public.current_user_sede_id())
);

create policy citas_update_by_scope on public.citas
for update to authenticated
using (
  public.is_admin()
  or (public.is_recepcion() and public.can_access_sede(sede_id))
  or exists (
    select 1
    from public.profesionales pr
    where pr.id = citas.profesional_id
      and pr.usuario_id = public.current_profile_id()
  )
)
with check (
  public.is_admin()
  or (public.is_recepcion() and public.can_access_sede(sede_id))
  or exists (
    select 1
    from public.profesionales pr
    where pr.id = citas.profesional_id
      and pr.usuario_id = public.current_profile_id()
  )
);

create policy historias_read_by_scope on public.historias_clinicas
for select to authenticated
using (
  eliminado = false
  and (
    public.is_admin()
    or public.can_access_sede(sede_id)
    or exists (
      select 1
      from public.profesionales pr
      where pr.id = historias_clinicas.profesional_id
        and pr.usuario_id = public.current_profile_id()
    )
  )
);

create policy historias_insert_by_scope on public.historias_clinicas
for insert to authenticated
with check (
  public.is_admin()
  or public.can_access_sede(sede_id)
);

create policy historias_update_by_scope on public.historias_clinicas
for update to authenticated
using (
  public.is_admin()
  or public.can_access_sede(sede_id)
)
with check (
  public.is_admin()
  or public.can_access_sede(sede_id)
);

create policy recordatorios_read_by_scope on public.recordatorios
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.citas c
    where c.id = recordatorios.cita_id
      and public.can_access_sede(c.sede_id)
  )
);

create policy recordatorios_insert_by_scope on public.recordatorios
for insert to authenticated
with check (
  public.is_admin()
  or exists (
    select 1
    from public.citas c
    where c.id = recordatorios.cita_id
      and public.can_access_sede(c.sede_id)
  )
);

create policy recordatorios_update_by_scope on public.recordatorios
for update to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.citas c
    where c.id = recordatorios.cita_id
      and public.can_access_sede(c.sede_id)
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.citas c
    where c.id = recordatorios.cita_id
      and public.can_access_sede(c.sede_id)
  )
);

create policy auditoria_admin_read on public.auditoria
for select to authenticated
using (public.is_admin());

create policy auditoria_admin_insert on public.auditoria
for insert to authenticated
with check (public.is_admin());

create or replace function public.soft_delete_patient(p_patient_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
  v_patient_sede_id uuid;
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

  select sede_de_registro_id
  into v_patient_sede_id
  from public.pacientes
  where id = p_patient_id
    and eliminado = false;

  if v_patient_sede_id is null then
    raise exception 'Paciente no encontrado o ya eliminado.';
  end if;

  if v_profile.rol <> 'administrador'
    and not (v_profile.rol = 'recepcion' and v_profile.sede_id = v_patient_sede_id) then
    raise exception 'No tienes permiso para eliminar este paciente.';
  end if;

  update public.pacientes
  set eliminado = true
  where id = p_patient_id;
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
  v_profile record;
  v_appointment_sede_id uuid;
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
  into v_appointment_sede_id
  from public.citas
  where id = p_appointment_id
    and eliminado = false;

  if v_appointment_sede_id is null then
    raise exception 'Cita no encontrada o ya eliminada.';
  end if;

  if v_profile.rol <> 'administrador'
    and not (v_profile.rol = 'recepcion' and v_profile.sede_id = v_appointment_sede_id) then
    raise exception 'No tienes permiso para eliminar esta cita.';
  end if;

  update public.citas
  set eliminado = true
  where id = p_appointment_id;
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
  from public.historias_clinicas
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
