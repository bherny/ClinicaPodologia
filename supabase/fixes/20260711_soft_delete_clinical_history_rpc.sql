alter table public.historias_clinicas
add column if not exists eliminado boolean not null default false;

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
