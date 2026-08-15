-- Historias clinicas: permisos clinicos estrictos y auditoria de documentos.
-- Ejecutar despues de 202607180001_soft_delete_podology_record.sql.

drop policy if exists historias_read_by_scope on public.historias_clinicas;
drop policy if exists historias_insert_by_scope on public.historias_clinicas;
drop policy if exists historias_update_by_scope on public.historias_clinicas;

create policy historias_read_by_scope on public.historias_clinicas
for select to authenticated
using (
  eliminado = false
  and (
    public.is_admin()
    or (
      public.is_profesional()
      and public.can_access_sede(historias_clinicas.sede_id)
      and exists (
        select 1
        from public.profesionales pr
        where pr.usuario_id = public.current_profile_id()
          and pr.activo = true
          and (
            pr.id = historias_clinicas.profesional_id
            or exists (
              select 1
              from public.citas c
              where c.id = historias_clinicas.cita_id
                and c.profesional_id = pr.id
                and c.eliminado = false
            )
          )
      )
    )
  )
);

create policy historias_insert_by_scope on public.historias_clinicas
for insert to authenticated
with check (
  public.is_admin()
  or (
    public.is_profesional()
    and exists (
      select 1
      from public.profesionales pr
      where pr.id = historias_clinicas.profesional_id
        and pr.usuario_id = public.current_profile_id()
        and pr.activo = true
        and public.can_access_sede(historias_clinicas.sede_id)
    )
  )
);

create policy historias_update_by_scope on public.historias_clinicas
for update to authenticated
using (
  public.is_admin()
  or (
    public.is_profesional()
    and public.can_access_sede(historias_clinicas.sede_id)
    and exists (
      select 1
      from public.profesionales pr
      where pr.usuario_id = public.current_profile_id()
        and pr.activo = true
        and (
          pr.id = historias_clinicas.profesional_id
          or exists (
            select 1
            from public.citas c
            where c.id = historias_clinicas.cita_id
              and c.profesional_id = pr.id
              and c.eliminado = false
          )
        )
    )
  )
)
with check (
  public.is_admin()
  or (
    public.is_profesional()
    and exists (
      select 1
      from public.profesionales pr
      where pr.usuario_id = public.current_profile_id()
        and pr.activo = true
        and public.can_access_sede(historias_clinicas.sede_id)
        and (
          pr.id = historias_clinicas.profesional_id
          or exists (
            select 1
            from public.citas c
            where c.id = historias_clinicas.cita_id
              and c.profesional_id = pr.id
              and c.eliminado = false
          )
        )
    )
  )
);

create or replace function public.soft_delete_clinical_history(p_history_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.perfiles%rowtype;
  v_history public.historias_clinicas%rowtype;
  v_allowed boolean := false;
begin
  select * into v_profile
  from public.perfiles
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;

  select * into v_history
  from public.historias_clinicas
  where id = p_history_id
    and eliminado = false;

  if v_profile.id is null or v_history.id is null then
    raise exception 'Historia clinica no encontrada o usuario sin perfil activo.';
  end if;

  if v_profile.rol = 'administrador' then
    v_allowed := true;
  elsif v_profile.rol = 'profesional' and public.can_access_sede(v_history.sede_id) then
    select exists (
      select 1
      from public.profesionales pr
      where pr.usuario_id = v_profile.id
        and pr.activo = true
        and (
          pr.id = v_history.profesional_id
          or exists (
            select 1
            from public.citas c
            where c.id = v_history.cita_id
              and c.profesional_id = pr.id
              and c.eliminado = false
          )
        )
    ) into v_allowed;
  end if;

  if not v_allowed then
    raise exception 'No tienes permiso para eliminar esta historia clinica.';
  end if;

  update public.historias_clinicas
  set eliminado = true
  where id = p_history_id;
end;
$$;

revoke all on function public.soft_delete_clinical_history(uuid) from public;
grant execute on function public.soft_delete_clinical_history(uuid) to authenticated;
create or replace function public.record_clinical_document_action(
  p_history_id uuid,
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
  v_history public.historias_clinicas%rowtype;
  v_allowed boolean := false;
  v_safe_metadata jsonb;
begin
  select * into v_profile
  from public.perfiles
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;

  select * into v_history
  from public.historias_clinicas
  where id = p_history_id
    and eliminado = false;

  if v_profile.id is null or v_history.id is null then
    raise exception 'Historia clinica no encontrada o usuario sin perfil activo.';
  end if;

  if p_action not in ('descarga_pdf', 'intento_compartir_whatsapp') then
    raise exception 'Accion documental no permitida.';
  end if;

  if v_profile.rol = 'administrador' then
    v_allowed := true;
  elsif v_profile.rol = 'profesional' and public.can_access_sede(v_history.sede_id) then
    select exists (
      select 1
      from public.profesionales pr
      where pr.usuario_id = v_profile.id
        and pr.activo = true
        and (
          pr.id = v_history.profesional_id
          or exists (
            select 1
            from public.citas c
            where c.id = v_history.cita_id
              and c.profesional_id = pr.id
              and c.eliminado = false
          )
        )
    ) into v_allowed;
  end if;

  if not v_allowed then
    raise exception 'No tienes permiso para usar este documento clinico.';
  end if;

  v_safe_metadata := jsonb_strip_nulls(jsonb_build_object(
    'document_type', 'historia_clinica',
    'sede_id', v_history.sede_id,
    'file_name', nullif(trim(p_metadata->>'file_name'), ''),
    'phone_last_digits', nullif(regexp_replace(coalesce(p_metadata->>'phone_last_digits', ''), '\D', '', 'g'), '')
  ));

  insert into public.auditoria (
    usuario_id,
    accion,
    tabla_afectada,
    registro_id,
    informacion_nueva
  )
  values (
    v_profile.id,
    p_action,
    'historias_clinicas',
    v_history.id,
    v_safe_metadata
  );
end;
$$;

revoke all on function public.record_clinical_document_action(uuid, text, jsonb) from public;
grant execute on function public.record_clinical_document_action(uuid, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
