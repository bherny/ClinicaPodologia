-- Recetas: permisos clinicos, edicion transaccional y auditoria documental.
-- Ejecutar despues de 202608140001_clinical_history_documents.sql.

drop policy if exists recetas_read_clinical_scope on public.recetas;
drop policy if exists recetas_insert_clinical_scope on public.recetas;
drop policy if exists recetas_update_clinical_scope on public.recetas;
drop policy if exists receta_items_read_clinical_scope on public.receta_items;
drop policy if exists receta_items_write_clinical_scope on public.receta_items;

create policy recetas_read_clinical_scope on public.recetas
for select to authenticated
using (
  eliminado = false
  and (
    public.is_admin()
    or (
      public.is_profesional()
      and public.can_access_sede(recetas.sede_id)
      and exists (
        select 1
        from public.profesionales pr
        where pr.id = recetas.profesional_id
          and pr.usuario_id = public.current_profile_id()
          and pr.activo = true
      )
    )
  )
);

create policy recetas_insert_clinical_scope on public.recetas
for insert to authenticated
with check (
  public.is_admin()
  or (
    public.is_profesional()
    and public.can_access_sede(recetas.sede_id)
    and exists (
      select 1
      from public.profesionales pr
      where pr.id = recetas.profesional_id
        and pr.usuario_id = public.current_profile_id()
        and pr.activo = true
    )
  )
);

create policy recetas_update_clinical_scope on public.recetas
for update to authenticated
using (
  public.is_admin()
  or (
    public.is_profesional()
    and public.can_access_sede(recetas.sede_id)
    and exists (
      select 1
      from public.profesionales pr
      where pr.id = recetas.profesional_id
        and pr.usuario_id = public.current_profile_id()
        and pr.activo = true
    )
  )
)
with check (
  public.is_admin()
  or (
    public.is_profesional()
    and public.can_access_sede(recetas.sede_id)
    and exists (
      select 1
      from public.profesionales pr
      where pr.id = recetas.profesional_id
        and pr.usuario_id = public.current_profile_id()
        and pr.activo = true
    )
  )
);

create policy receta_items_read_clinical_scope on public.receta_items
for select to authenticated
using (
  exists (
    select 1
    from public.recetas r
    where r.id = receta_items.receta_id
      and r.eliminado = false
      and (
        public.is_admin()
        or (
          public.is_profesional()
          and public.can_access_sede(r.sede_id)
          and exists (
            select 1
            from public.profesionales pr
            where pr.id = r.profesional_id
              and pr.usuario_id = public.current_profile_id()
              and pr.activo = true
          )
        )
      )
  )
);

create policy receta_items_write_clinical_scope on public.receta_items
for all to authenticated
using (
  exists (
    select 1
    from public.recetas r
    where r.id = receta_items.receta_id
      and r.eliminado = false
      and (
        public.is_admin()
        or (
          public.is_profesional()
          and public.can_access_sede(r.sede_id)
          and exists (
            select 1
            from public.profesionales pr
            where pr.id = r.profesional_id
              and pr.usuario_id = public.current_profile_id()
              and pr.activo = true
          )
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.recetas r
    where r.id = receta_items.receta_id
      and r.eliminado = false
      and (
        public.is_admin()
        or (
          public.is_profesional()
          and public.can_access_sede(r.sede_id)
          and exists (
            select 1
            from public.profesionales pr
            where pr.id = r.profesional_id
              and pr.usuario_id = public.current_profile_id()
              and pr.activo = true
          )
        )
      )
  )
);

create or replace function public.update_prescription(
  p_prescription_id uuid,
  p_patient_id uuid,
  p_branch_id uuid,
  p_professional_id uuid,
  p_date date,
  p_diagnosis text,
  p_general_instructions text,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.perfiles%rowtype;
  v_prescription public.recetas%rowtype;
begin
  select * into v_profile
  from public.perfiles
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;

  select * into v_prescription
  from public.recetas
  where id = p_prescription_id
    and eliminado = false;

  if v_profile.id is null or v_prescription.id is null then
    raise exception 'Receta no encontrada o usuario sin perfil activo.';
  end if;

  if v_profile.rol = 'administrador' then
    null;
  elsif v_profile.rol = 'profesional' then
    if not public.can_access_sede(v_prescription.sede_id)
      or not exists (
        select 1
        from public.profesionales pr
        where pr.id = v_prescription.profesional_id
          and pr.usuario_id = v_profile.id
          and pr.activo = true
      ) then
      raise exception 'No tienes permiso para editar esta receta.';
    end if;

    if p_patient_id <> v_prescription.paciente_id or p_branch_id <> v_prescription.sede_id then
      raise exception 'Un profesional no puede reasignar la receta a otro paciente o sede.';
    end if;

    if not exists (
      select 1
      from public.profesionales pr
      where pr.id = p_professional_id
        and pr.usuario_id = v_profile.id
        and pr.activo = true
    ) then
      raise exception 'El profesional seleccionado no corresponde al usuario actual.';
    end if;
  else
    raise exception 'No tienes permiso para editar esta receta.';
  end if;

  if not public.can_access_sede(p_branch_id) then
    raise exception 'No tienes acceso a la sede seleccionada.';
  end if;

  if not exists (
    select 1 from public.pacientes p
    where p.id = p_patient_id
      and p.eliminado = false
  ) then
    raise exception 'Paciente no encontrado.';
  end if;

  if not exists (
    select 1 from public.profesionales pr
    where pr.id = p_professional_id
      and pr.activo = true
  ) then
    raise exception 'Profesional no encontrado o inactivo.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un medicamento o indicacion.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(medicamento text)
    where length(trim(coalesce(item.medicamento, ''))) < 2
  ) then
    raise exception 'Cada indicacion debe incluir un medicamento o tratamiento valido.';
  end if;

  update public.recetas
  set paciente_id = p_patient_id,
      sede_id = p_branch_id,
      profesional_id = p_professional_id,
      fecha = coalesce(p_date, current_date),
      diagnostico = nullif(trim(p_diagnosis), ''),
      indicaciones_generales = nullif(trim(p_general_instructions), '')
  where id = p_prescription_id;

  delete from public.receta_items
  where receta_id = p_prescription_id;

  insert into public.receta_items (
    receta_id, medicamento, dosis, frecuencia, duracion, via, indicaciones, orden
  )
  select
    p_prescription_id,
    trim(item.medicamento),
    nullif(trim(item.dosis), ''),
    nullif(trim(item.frecuencia), ''),
    nullif(trim(item.duracion), ''),
    nullif(trim(item.via), ''),
    nullif(trim(item.indicaciones), ''),
    item.orden
  from jsonb_to_recordset(p_items) as item(
    medicamento text, dosis text, frecuencia text, duracion text, via text, indicaciones text, orden integer
  );
end;
$$;

create or replace function public.soft_delete_prescription(p_prescription_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.perfiles%rowtype;
  v_prescription public.recetas%rowtype;
  v_allowed boolean := false;
begin
  select * into v_profile
  from public.perfiles
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;

  select * into v_prescription
  from public.recetas
  where id = p_prescription_id
    and eliminado = false;

  if v_profile.id is null or v_prescription.id is null then
    raise exception 'Receta no encontrada o usuario sin perfil activo.';
  end if;

  if v_profile.rol = 'administrador' then
    v_allowed := true;
  elsif v_profile.rol = 'profesional' and public.can_access_sede(v_prescription.sede_id) then
    select exists (
      select 1
      from public.profesionales pr
      where pr.id = v_prescription.profesional_id
        and pr.usuario_id = v_profile.id
        and pr.activo = true
    ) into v_allowed;
  end if;

  if not v_allowed then
    raise exception 'No tienes permiso para eliminar esta receta.';
  end if;

  update public.recetas
  set eliminado = true
  where id = p_prescription_id;
end;
$$;

create or replace function public.record_prescription_document_action(
  p_prescription_id uuid,
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
  v_prescription public.recetas%rowtype;
  v_allowed boolean := false;
  v_safe_metadata jsonb;
begin
  select * into v_profile
  from public.perfiles
  where auth_user_id = auth.uid()
    and activo = true
  limit 1;

  select * into v_prescription
  from public.recetas
  where id = p_prescription_id
    and eliminado = false;

  if v_profile.id is null or v_prescription.id is null then
    raise exception 'Receta no encontrada o usuario sin perfil activo.';
  end if;

  if p_action not in ('descarga_pdf', 'intento_compartir_whatsapp') then
    raise exception 'Accion documental no permitida.';
  end if;

  if v_profile.rol = 'administrador' then
    v_allowed := true;
  elsif v_profile.rol = 'profesional' and public.can_access_sede(v_prescription.sede_id) then
    select exists (
      select 1
      from public.profesionales pr
      where pr.id = v_prescription.profesional_id
        and pr.usuario_id = v_profile.id
        and pr.activo = true
    ) into v_allowed;
  end if;

  if not v_allowed then
    raise exception 'No tienes permiso para usar este documento clinico.';
  end if;

  v_safe_metadata := jsonb_strip_nulls(jsonb_build_object(
    'document_type', 'receta',
    'sede_id', v_prescription.sede_id,
    'file_name', nullif(trim(p_metadata->>'file_name'), ''),
    'phone_last_digits', nullif(regexp_replace(coalesce(p_metadata->>'phone_last_digits', ''), '\D', '', 'g'), '')
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
    'recetas',
    v_prescription.id,
    v_safe_metadata
  );
end;
$$;

revoke all on function public.update_prescription(uuid, uuid, uuid, uuid, date, text, text, jsonb) from public;
revoke all on function public.soft_delete_prescription(uuid) from public;
revoke all on function public.record_prescription_document_action(uuid, text, jsonb) from public;
grant execute on function public.update_prescription(uuid, uuid, uuid, uuid, date, text, text, jsonb) to authenticated;
grant execute on function public.soft_delete_prescription(uuid) to authenticated;
grant execute on function public.record_prescription_document_action(uuid, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
