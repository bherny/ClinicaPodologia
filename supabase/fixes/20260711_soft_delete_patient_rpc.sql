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
