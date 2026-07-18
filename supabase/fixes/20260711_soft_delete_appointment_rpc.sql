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
