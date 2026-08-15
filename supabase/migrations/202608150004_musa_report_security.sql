-- Protege los reportes de Musa con el mismo PIN de Caja, sin ocupar la caja exclusiva.
begin;

create table if not exists public.reporte_musa_intentos (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  sede_id uuid not null references public.sedes(id) on delete cascade,
  intentos_fallidos smallint not null default 0 check (intentos_fallidos >= 0),
  ventana_iniciada_en timestamptz not null default now(),
  bloqueado_hasta timestamptz,
  updated_at timestamptz not null default now(),
  primary key (auth_user_id, sede_id)
);

create table if not exists public.reporte_musa_autorizaciones (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  auth_session_id text not null,
  sede_id uuid not null references public.sedes(id) on delete cascade,
  autorizado_hasta timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (auth_user_id, auth_session_id, sede_id)
);

create index if not exists reporte_musa_autorizaciones_expira_idx
  on public.reporte_musa_autorizaciones (autorizado_hasta);

alter table public.reporte_musa_intentos enable row level security;
alter table public.reporte_musa_autorizaciones enable row level security;

create or replace function public.has_musa_report_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(exists (
    select 1
    from public.reporte_musa_autorizaciones a
    where a.auth_user_id = auth.uid()
      and a.auth_session_id = public.current_auth_session_id()
      and a.sede_id = public.musa_cash_branch_id()
      and a.autorizado_hasta > now()
  ), false);
$$;

create or replace function public.get_musa_report_security_status()
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
  v_attempt public.reporte_musa_intentos%rowtype;
  v_session_id text := public.current_auth_session_id();
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  if v_sede_id is null then
    raise exception 'No se encontro la sede Musa.';
  end if;

  if not public.can_access_sede(v_sede_id) then
    raise exception 'No tienes acceso a los reportes de Musa.';
  end if;

  delete from public.reporte_musa_autorizaciones a
  where a.autorizado_hasta <= now();

  select * into v_config
  from public.caja_sede_seguridad c
  where c.sede_id = v_sede_id;

  select * into v_attempt
  from public.reporte_musa_intentos i
  where i.auth_user_id = auth.uid()
    and i.sede_id = v_sede_id;

  return query
  select
    v_sede_id,
    v_config.pin_hash is not null,
    public.has_musa_report_access(),
    (
      select a.autorizado_hasta
      from public.reporte_musa_autorizaciones a
      where a.auth_user_id = auth.uid()
        and a.auth_session_id = v_session_id
        and a.sede_id = v_sede_id
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

create or replace function public.verify_musa_report_pin(p_pin text)
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
  v_attempt public.reporte_musa_intentos%rowtype;
  v_session_id text := public.current_auth_session_id();
  v_now timestamptz := now();
  v_expires timestamptz;
  v_failed integer;
  v_blocked_until timestamptz;
  v_matches boolean;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  if v_session_id is null then
    raise exception 'No se pudo identificar la sesion actual.';
  end if;

  if v_sede_id is null or not public.can_access_sede(v_sede_id) then
    raise exception 'No tienes acceso a los reportes de Musa.';
  end if;

  select * into v_config
  from public.caja_sede_seguridad c
  where c.sede_id = v_sede_id
  for update;

  if v_config.sede_id is null or v_config.pin_hash is null then
    return query select false, 'El PIN de Musa aun no esta configurado.'::text, null::timestamptz, null::timestamptz, 0;
    return;
  end if;

  insert into public.reporte_musa_intentos (auth_user_id, sede_id)
  values (auth.uid(), v_sede_id)
  on conflict (auth_user_id, sede_id) do nothing;

  select * into v_attempt
  from public.reporte_musa_intentos i
  where i.auth_user_id = auth.uid() and i.sede_id = v_sede_id
  for update;

  if v_attempt.bloqueado_hasta is not null and v_attempt.bloqueado_hasta > v_now then
    return query select false, 'Acceso bloqueado temporalmente por demasiados intentos.'::text, null::timestamptz, v_attempt.bloqueado_hasta, 0;
    return;
  end if;

  if v_attempt.bloqueado_hasta is not null
    or v_attempt.ventana_iniciada_en < v_now - make_interval(mins => v_config.duracion_bloqueo_minutos) then
    update public.reporte_musa_intentos
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

    update public.reporte_musa_intentos
    set intentos_fallidos = v_failed,
        bloqueado_hasta = v_blocked_until,
        updated_at = v_now
    where auth_user_id = auth.uid() and sede_id = v_sede_id;

    insert into public.auditoria (usuario_id, accion, tabla_afectada, registro_id, informacion_nueva)
    values (
      public.current_profile_id(),
      'pin_reporte_musa_incorrecto',
      'reporte_musa_autorizaciones',
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

  v_expires := v_now + make_interval(mins => coalesce(v_config.duracion_sesion_minutos, 15));

  insert into public.reporte_musa_autorizaciones (
    auth_user_id,
    auth_session_id,
    sede_id,
    autorizado_hasta,
    updated_at
  )
  values (auth.uid(), v_session_id, v_sede_id, v_expires, v_now)
  on conflict (auth_user_id, auth_session_id, sede_id)
  do update set autorizado_hasta = excluded.autorizado_hasta, updated_at = v_now;

  update public.reporte_musa_intentos
  set intentos_fallidos = 0,
      ventana_iniciada_en = v_now,
      bloqueado_hasta = null,
      updated_at = v_now
  where auth_user_id = auth.uid() and sede_id = v_sede_id;

  insert into public.auditoria (usuario_id, accion, tabla_afectada, registro_id, informacion_nueva)
  values (
    public.current_profile_id(),
    'acceso_reporte_musa',
    'reporte_musa_autorizaciones',
    v_sede_id,
    jsonb_build_object('sede_id', v_sede_id, 'autorizado_hasta', v_expires)
  );

  return query select true, 'Reportes de Musa desbloqueados.'::text, v_expires, null::timestamptz, v_config.intentos_maximos::integer;
end;
$$;

create or replace function public.lock_musa_report_access()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sede_id uuid := public.musa_cash_branch_id();
  v_deleted boolean := false;
begin
  if auth.uid() is null or v_sede_id is null then return; end if;

  delete from public.reporte_musa_autorizaciones
  where auth_user_id = auth.uid()
    and auth_session_id = public.current_auth_session_id()
    and sede_id = v_sede_id;
  v_deleted := found;

  if v_deleted then
    insert into public.auditoria (usuario_id, accion, tabla_afectada, registro_id, informacion_nueva)
    values (
      public.current_profile_id(),
      'bloqueo_reporte_musa',
      'reporte_musa_autorizaciones',
      v_sede_id,
      jsonb_build_object('sede_id', v_sede_id)
    );
  end if;
end;
$$;

create or replace function public.revoke_musa_report_access_on_pin_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.pin_hash is distinct from new.pin_hash and public.is_musa_branch(new.sede_id) then
    delete from public.reporte_musa_autorizaciones where sede_id = new.sede_id;
    delete from public.reporte_musa_intentos where sede_id = new.sede_id;
  end if;
  return new;
end;
$$;

drop trigger if exists caja_seguridad_revoke_musa_reports on public.caja_sede_seguridad;
create trigger caja_seguridad_revoke_musa_reports
after update of pin_hash on public.caja_sede_seguridad
for each row execute function public.revoke_musa_report_access_on_pin_change();

create or replace function public.can_read_financial_sede(target_sede_id uuid)
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
      or public.has_musa_report_access()
    ),
    false
  );
$$;

drop policy if exists ventas_read on public.ventas;
drop policy if exists venta_items_read on public.venta_items;
drop policy if exists correlativos_read on public.correlativos_comprobante;
drop policy if exists comprobantes_read on public.comprobantes;

create policy ventas_read on public.ventas
for select to authenticated
using (
  eliminado = false
  and (public.is_admin() or public.is_recepcion())
  and public.can_read_financial_sede(sede_id)
);

create policy venta_items_read on public.venta_items
for select to authenticated
using (exists (
  select 1
  from public.ventas v
  where v.id = venta_items.venta_id
    and v.eliminado = false
    and (public.is_admin() or public.is_recepcion())
    and public.can_read_financial_sede(v.sede_id)
));

create policy correlativos_read on public.correlativos_comprobante
for select to authenticated
using (
  (public.is_admin() or public.is_recepcion())
  and public.can_read_financial_sede(sede_id)
);

create policy comprobantes_read on public.comprobantes
for select to authenticated
using (exists (
  select 1
  from public.ventas v
  where v.id = comprobantes.venta_id
    and v.eliminado = false
    and (public.is_admin() or public.is_recepcion())
    and public.can_read_financial_sede(v.sede_id)
));

revoke all on table public.reporte_musa_intentos from public;
revoke all on table public.reporte_musa_autorizaciones from public;
revoke all on function public.has_musa_report_access() from public;
revoke all on function public.get_musa_report_security_status() from public;
revoke all on function public.verify_musa_report_pin(text) from public;
revoke all on function public.lock_musa_report_access() from public;
revoke all on function public.revoke_musa_report_access_on_pin_change() from public;
revoke all on function public.can_read_financial_sede(uuid) from public;

grant execute on function public.get_musa_report_security_status() to authenticated;
grant execute on function public.verify_musa_report_pin(text) to authenticated;
grant execute on function public.lock_musa_report_access() to authenticated;
grant execute on function public.can_read_financial_sede(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;