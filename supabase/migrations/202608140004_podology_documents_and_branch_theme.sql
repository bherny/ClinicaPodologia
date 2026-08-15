-- Documentos podologicos auditados y personalizacion visual por sede.
-- Ejecutar despues de 202608140003_musa_cash_security.sql.

alter table public.sedes
  add column if not exists color_sidebar varchar(7),
  add column if not exists color_primario varchar(7),
  add column if not exists color_acento varchar(7);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sedes_color_sidebar_hex') then
    alter table public.sedes add constraint sedes_color_sidebar_hex
      check (color_sidebar is null or color_sidebar ~ '^#[0-9A-Fa-f]{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sedes_color_primario_hex') then
    alter table public.sedes add constraint sedes_color_primario_hex
      check (color_primario is null or color_primario ~ '^#[0-9A-Fa-f]{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sedes_color_acento_hex') then
    alter table public.sedes add constraint sedes_color_acento_hex
      check (color_acento is null or color_acento ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end;
$$;

create or replace function public.record_podology_document_action(
  p_record_id uuid,
  p_action text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.perfiles%rowtype;
  v_record public.expedientes_podologia%rowtype;
  v_allowed boolean := false;
  v_safe_metadata jsonb;
begin
  select * into v_profile
  from public.perfiles
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;

  select * into v_record
  from public.expedientes_podologia
  where id = p_record_id
    and eliminado = false;

  if v_profile.id is null or v_record.id is null then
    raise exception 'Expediente podologico no encontrado o usuario sin perfil activo.';
  end if;

  if p_action not in ('descarga_pdf', 'intento_compartir_whatsapp') then
    raise exception 'Accion documental no permitida.';
  end if;

  if v_profile.rol = 'administrador' then
    v_allowed := true;
  elsif v_profile.rol = 'profesional' and public.can_access_sede(v_record.sede_id) then
    select exists (
      select 1
      from public.profesionales pr
      where pr.usuario_id = v_profile.id
        and pr.activo = true
        and (
          pr.id = v_record.profesional_id
          or exists (
            select 1
            from public.citas c
            where c.id = v_record.cita_id
              and c.profesional_id = pr.id
              and c.eliminado = false
          )
        )
    ) into v_allowed;
  end if;

  if not v_allowed then
    raise exception 'No tienes permiso para usar este documento podologico.';
  end if;

  v_safe_metadata := jsonb_strip_nulls(jsonb_build_object(
    'document_type', 'expediente_podologico',
    'sede_id', v_record.sede_id,
    'file_name', nullif(trim(p_metadata->>'file_name'), ''),
    'phone_last_digits', nullif(regexp_replace(coalesce(p_metadata->>'phone_last_digits', ''), '[^0-9]', '', 'g'), '')
  ));

  insert into public.auditoria (
    usuario_id,
    accion,
    tabla_afectada,
    registro_id,
    informacion_nueva
  ) values (
    v_profile.id,
    p_action,
    'expedientes_podologia',
    v_record.id,
    v_safe_metadata
  );
end;
$$;

revoke all on function public.record_podology_document_action(uuid, text, jsonb) from public;
grant execute on function public.record_podology_document_action(uuid, text, jsonb) to authenticated;

comment on column public.sedes.color_sidebar is 'Color hexadecimal del menu lateral para la sede.';
comment on column public.sedes.color_primario is 'Color hexadecimal de acciones principales para la sede.';
comment on column public.sedes.color_acento is 'Color hexadecimal de acentos visuales para la sede.';

notify pgrst, 'reload schema';