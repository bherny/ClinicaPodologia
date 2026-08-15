-- Proteccion adicional para la informacion financiera de la sede Musa.
-- El PIN se almacena con bcrypt, se valida en PostgreSQL y nunca se devuelve al cliente.

begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.caja_sede_seguridad (
  sede_id uuid primary key references public.sedes(id) on delete cascade,
  pin_hash text,
  intentos_maximos smallint not null default 5 check (intentos_maximos between 3 and 10),
  duracion_bloqueo_minutos smallint not null default 15 check (duracion_bloqueo_minutos between 5 and 120),
  duracion_sesion_minutos smallint not null default 30 check (duracion_sesion_minutos between 5 and 240),
  actualizado_por uuid references public.perfiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.caja_sede_intentos (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  sede_id uuid not null references public.sedes(id) on delete cascade,
  intentos_fallidos smallint not null default 0 check (intentos_fallidos >= 0),
  ventana_iniciada_en timestamptz not null default now(),
  bloqueado_hasta timestamptz,
  updated_at timestamptz not null default now(),
  primary key (auth_user_id, sede_id)
);

create table if not exists public.caja_sede_autorizaciones (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  sede_id uuid not null references public.sedes(id) on delete cascade,
  autorizado_hasta timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (auth_user_id, sede_id)
);

create index if not exists caja_sede_autorizaciones_expira_idx
  on public.caja_sede_autorizaciones (autorizado_hasta);

insert into public.caja_sede_seguridad (sede_id)
select s.id
from public.sedes s
where lower(trim(s.nombre)) = 'musa'
on conflict (sede_id) do nothing;

alter table public.caja_sede_seguridad enable row level security;
alter table public.caja_sede_intentos enable row level security;
alter table public.caja_sede_autorizaciones enable row level security;

-- No se crean politicas directas: estas tablas solo se usan mediante RPC security definer.

create or replace function public.musa_cash_branch_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.sedes s
  where lower(trim(s.nombre)) = 'musa'
  order by s.created_at
  limit 1;
$$;

create or replace function public.is_musa_branch(target_sede_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(target_sede_id = public.musa_cash_branch_id(), false);
$$;

create or replace function public.has_musa_cash_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(exists (
    select 1
    from public.caja_sede_autorizaciones a
    where a.auth_user_id = auth.uid()
      and a.sede_id = public.musa_cash_branch_id()
      and a.autorizado_hasta > now()
  ), false);
$$;

create or replace function public.can_access_financial_sede(target_sede_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.can_access_sede(target_sede_id)
    and (
      not public.is_musa_branch(target_sede_id)
      or public.has_musa_cash_access()
    ),
    false
  );
$$;

create or replace function public.get_musa_cash_security_status()
returns table (
  sede_id uuid,
  configurado boolean,
  autorizado boolean,
  autorizado_hasta timestamptz,
  bloqueado_hasta timestamptz,
  intentos_restantes integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sede_id uuid := public.musa_cash_branch_id();
  v_config public.caja_sede_seguridad%rowtype;
  v_attempt public.caja_sede_intentos%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  if v_sede_id is null then
    raise exception 'No se encontro la sede Musa.';
  end if;

  if not public.can_access_sede(v_sede_id) then
    raise exception 'No tienes acceso a la informacion financiera de Musa.';
  end if;

  select * into v_config
  from public.caja_sede_seguridad c
  where c.sede_id = v_sede_id;

  select * into v_attempt
  from public.caja_sede_intentos i
  where i.auth_user_id = auth.uid()
    and i.sede_id = v_sede_id;

  return query
  select
    v_sede_id,
    v_config.pin_hash is not null,
    public.has_musa_cash_access(),
    (
      select a.autorizado_hasta
      from public.caja_sede_autorizaciones a
      where a.auth_user_id = auth.uid() and a.sede_id = v_sede_id
    ),
    case when v_attempt.bloqueado_hasta > now() then v_attempt.bloqueado_hasta else null end,
    greatest(
      coalesce(v_config.intentos_maximos, 5)::integer
        - case
            when v_attempt.ventana_iniciada_en is null
              or v_attempt.ventana_iniciada_en < now() - make_interval(mins => coalesce(v_config.duracion_bloqueo_minutos, 15))
              then 0
            else coalesce(v_attempt.intentos_fallidos, 0)::integer
          end,
      0
    );
end;
$$;

create or replace function public.verify_musa_cash_pin(p_pin text)
returns table (
  exito boolean,
  mensaje text,
  autorizado_hasta timestamptz,
  bloqueado_hasta timestamptz,
  intentos_restantes integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_sede_id uuid := public.musa_cash_branch_id();
  v_config public.caja_sede_seguridad%rowtype;
  v_attempt public.caja_sede_intentos%rowtype;
  v_now timestamptz := now();
  v_expires timestamptz;
  v_failed integer;
  v_blocked_until timestamptz;
  v_matches boolean;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  if v_sede_id is null or not public.can_access_sede(v_sede_id) then
    raise exception 'No tienes acceso a la informacion financiera de Musa.';
  end if;

  select * into v_config
  from public.caja_sede_seguridad c
  where c.sede_id = v_sede_id
  for update;

  if v_config.sede_id is null or v_config.pin_hash is null then
    return query select false, 'El PIN de Caja Musa aun no esta configurado.'::text, null::timestamptz, null::timestamptz, 0;
    return;
  end if;

  insert into public.caja_sede_intentos (auth_user_id, sede_id)
  values (auth.uid(), v_sede_id)
  on conflict (auth_user_id, sede_id) do nothing;

  select * into v_attempt
  from public.caja_sede_intentos i
  where i.auth_user_id = auth.uid() and i.sede_id = v_sede_id
  for update;

  if v_attempt.bloqueado_hasta is not null and v_attempt.bloqueado_hasta > v_now then
    insert into public.auditoria (usuario_id, accion, tabla_afectada, registro_id, informacion_nueva)
    values (
      public.current_profile_id(),
      'pin_caja_musa_bloqueado',
      'caja_sede_seguridad',
      v_sede_id,
      jsonb_build_object('sede_id', v_sede_id, 'bloqueado_hasta', v_attempt.bloqueado_hasta)
    );
    return query select false, 'Acceso bloqueado temporalmente por demasiados intentos.'::text, null::timestamptz, v_attempt.bloqueado_hasta, 0;
    return;
  end if;

  if v_attempt.bloqueado_hasta is not null
    or v_attempt.ventana_iniciada_en < v_now - make_interval(mins => v_config.duracion_bloqueo_minutos) then
    update public.caja_sede_intentos
    set intentos_fallidos = 0,
        ventana_iniciada_en = v_now,
        bloqueado_hasta = null,
        updated_at = v_now
    where auth_user_id = auth.uid() and sede_id = v_sede_id;
    v_attempt.intentos_fallidos := 0;
    v_attempt.ventana_iniciada_en := v_now;
    v_attempt.bloqueado_hasta := null;
  end if;

  v_matches := coalesce(
    p_pin ~ '^[0-9]{4,8}$'
      and extensions.crypt(coalesce(p_pin, ''), v_config.pin_hash) = v_config.pin_hash,
    false
  );

  if not v_matches then
    v_failed := v_attempt.intentos_fallidos + 1;
    v_blocked_until := case
      when v_failed >= v_config.intentos_maximos
        then v_now + make_interval(mins => v_config.duracion_bloqueo_minutos)
      else null
    end;

    update public.caja_sede_intentos
    set intentos_fallidos = v_failed,
        bloqueado_hasta = v_blocked_until,
        updated_at = v_now
    where auth_user_id = auth.uid() and sede_id = v_sede_id;

    insert into public.auditoria (usuario_id, accion, tabla_afectada, registro_id, informacion_nueva)
    values (
      public.current_profile_id(),
      'pin_caja_musa_incorrecto',
      'caja_sede_seguridad',
      v_sede_id,
      jsonb_build_object(
        'sede_id', v_sede_id,
        'bloqueado', v_blocked_until is not null,
        'intentos_restantes', greatest(v_config.intentos_maximos - v_failed, 0)
      )
    );

    return query select
      false,
      case when v_blocked_until is null
        then 'PIN incorrecto. Intentalo nuevamente.'
        else 'Acceso bloqueado temporalmente por demasiados intentos.'
      end::text,
      null::timestamptz,
      v_blocked_until,
      greatest(v_config.intentos_maximos - v_failed, 0)::integer;
    return;
  end if;

  v_expires := v_now + make_interval(mins => v_config.duracion_sesion_minutos);

  insert into public.caja_sede_autorizaciones (auth_user_id, sede_id, autorizado_hasta)
  values (auth.uid(), v_sede_id, v_expires)
  on conflict (auth_user_id, sede_id)
  do update set autorizado_hasta = excluded.autorizado_hasta, created_at = v_now;

  update public.caja_sede_intentos
  set intentos_fallidos = 0,
      ventana_iniciada_en = v_now,
      bloqueado_hasta = null,
      updated_at = v_now
  where auth_user_id = auth.uid() and sede_id = v_sede_id;

  insert into public.auditoria (usuario_id, accion, tabla_afectada, registro_id, informacion_nueva)
  values (
    public.current_profile_id(),
    'acceso_caja_musa',
    'caja_sede_seguridad',
    v_sede_id,
    jsonb_build_object('sede_id', v_sede_id, 'autorizado_hasta', v_expires)
  );

  return query select true, 'Acceso autorizado.'::text, v_expires, null::timestamptz, v_config.intentos_maximos::integer;
end;
$$;

create or replace function public.lock_musa_cash_access()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sede_id uuid := public.musa_cash_branch_id();
begin
  if auth.uid() is null or v_sede_id is null then return; end if;

  delete from public.caja_sede_autorizaciones
  where auth_user_id = auth.uid() and sede_id = v_sede_id;

  insert into public.auditoria (usuario_id, accion, tabla_afectada, registro_id, informacion_nueva)
  values (
    public.current_profile_id(),
    'bloqueo_caja_musa',
    'caja_sede_seguridad',
    v_sede_id,
    jsonb_build_object('sede_id', v_sede_id)
  );
end;
$$;

create or replace function public.change_musa_cash_pin(p_current_pin text, p_new_pin text)
returns table (exito boolean, mensaje text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_sede_id uuid := public.musa_cash_branch_id();
  v_config public.caja_sede_seguridad%rowtype;
  v_verification record;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede configurar el PIN de Caja Musa.';
  end if;

  if v_sede_id is null then
    raise exception 'No se encontro la sede Musa.';
  end if;

  if p_new_pin is null or p_new_pin !~ '^[0-9]{4,8}$' then
    return query select false, 'El nuevo PIN debe contener entre 4 y 8 digitos.'::text;
    return;
  end if;

  insert into public.caja_sede_seguridad (sede_id)
  values (v_sede_id)
  on conflict (sede_id) do nothing;

  select * into v_config
  from public.caja_sede_seguridad c
  where c.sede_id = v_sede_id
  for update;

  if v_config.pin_hash is not null then
    select * into v_verification
    from public.verify_musa_cash_pin(p_current_pin);

    if not coalesce(v_verification.exito, false) then
      return query select false, coalesce(v_verification.mensaje, 'PIN actual incorrecto.')::text;
      return;
    end if;
  end if;

  update public.caja_sede_seguridad
  set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf', 12)),
      actualizado_por = public.current_profile_id(),
      updated_at = now()
  where sede_id = v_sede_id;

  delete from public.caja_sede_autorizaciones where sede_id = v_sede_id;
  delete from public.caja_sede_intentos where sede_id = v_sede_id;

  insert into public.auditoria (usuario_id, accion, tabla_afectada, registro_id, informacion_nueva)
  values (
    public.current_profile_id(),
    'cambio_pin_caja_musa',
    'caja_sede_seguridad',
    v_sede_id,
    jsonb_build_object('sede_id', v_sede_id, 'configurado', true, 'sesiones_revocadas', true)
  );

  return query select true, 'PIN de Caja Musa actualizado correctamente.'::text;
end;
$$;

-- La lectura financiera de Musa requiere tanto acceso normal a la sede como PIN vigente.
drop policy if exists ventas_read on public.ventas;
drop policy if exists ventas_insert on public.ventas;
drop policy if exists ventas_update on public.ventas;
drop policy if exists venta_items_read on public.venta_items;
drop policy if exists correlativos_read on public.correlativos_comprobante;
drop policy if exists comprobantes_read on public.comprobantes;

create policy ventas_read on public.ventas
for select to authenticated
using (
  eliminado = false
  and (public.is_admin() or public.is_recepcion())
  and public.can_access_financial_sede(sede_id)
);

create policy ventas_insert on public.ventas
for insert to authenticated
with check (
  (public.is_admin() or public.is_recepcion())
  and public.can_access_financial_sede(sede_id)
);

create policy ventas_update on public.ventas
for update to authenticated
using (
  (public.is_admin() or public.is_recepcion())
  and public.can_access_financial_sede(sede_id)
)
with check (
  (public.is_admin() or public.is_recepcion())
  and public.can_access_financial_sede(sede_id)
);

create policy venta_items_read on public.venta_items
for select to authenticated
using (exists (
  select 1
  from public.ventas v
  where v.id = venta_items.venta_id
    and v.eliminado = false
    and (public.is_admin() or public.is_recepcion())
    and public.can_access_financial_sede(v.sede_id)
));

create policy correlativos_read on public.correlativos_comprobante
for select to authenticated
using (
  (public.is_admin() or public.is_recepcion())
  and public.can_access_financial_sede(sede_id)
);

create policy comprobantes_read on public.comprobantes
for select to authenticated
using (exists (
  select 1
  from public.ventas v
  where v.id = comprobantes.venta_id
    and v.eliminado = false
    and (public.is_admin() or public.is_recepcion())
    and public.can_access_financial_sede(v.sede_id)
));

-- Las funciones de venta son security definer; este trigger evita que omitan el PIN.
create or replace function public.enforce_musa_cash_sale_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sede_id uuid;
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_sede_id := case when tg_op = 'DELETE' then old.sede_id else new.sede_id end;

  if public.is_musa_branch(v_sede_id) and not public.has_musa_cash_access() then
    raise exception 'Caja Musa esta bloqueada. Ingresa el PIN para continuar.' using errcode = '42501';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists ventas_enforce_musa_cash_access on public.ventas;
create trigger ventas_enforce_musa_cash_access
before insert or update or delete on public.ventas
for each row execute function public.enforce_musa_cash_sale_access();

revoke all on function public.musa_cash_branch_id() from public;
revoke all on function public.is_musa_branch(uuid) from public;
revoke all on function public.has_musa_cash_access() from public;
revoke all on function public.can_access_financial_sede(uuid) from public;
revoke all on function public.get_musa_cash_security_status() from public;
revoke all on function public.verify_musa_cash_pin(text) from public;
revoke all on function public.lock_musa_cash_access() from public;
revoke all on function public.change_musa_cash_pin(text, text) from public;

grant execute on function public.can_access_financial_sede(uuid) to authenticated;
grant execute on function public.get_musa_cash_security_status() to authenticated;
grant execute on function public.verify_musa_cash_pin(text) to authenticated;
grant execute on function public.lock_musa_cash_access() to authenticated;
grant execute on function public.change_musa_cash_pin(text, text) to authenticated;

notify pgrst, 'reload schema';

commit;