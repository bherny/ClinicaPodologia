-- Eliminacion logica segura para expedientes podologicos.
create or replace function public.soft_delete_podology_record(p_record_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.expedientes_podologia%rowtype;
begin
  select * into v_record
  from public.expedientes_podologia
  where id = p_record_id and eliminado = false;

  if v_record.id is null then
    raise exception 'Expediente podologico no encontrado o ya eliminado.';
  end if;

  if not (
    public.is_admin()
    or (public.is_profesional() and public.can_access_sede(v_record.sede_id))
  ) then
    raise exception 'No tienes permiso para eliminar este expediente podologico.';
  end if;

  update public.expedientes_podologia
  set eliminado = true
  where id = p_record_id;
end;
$$;

revoke all on function public.soft_delete_podology_record(uuid) from public;
grant execute on function public.soft_delete_podology_record(uuid) to authenticated;

-- Restringe las escrituras clinicas a administradores y profesionales de la sede.
drop policy if exists expedientes_podologia_write on public.expedientes_podologia;
drop policy if exists expedientes_podologia_insert on public.expedientes_podologia;
drop policy if exists expedientes_podologia_update on public.expedientes_podologia;

create policy expedientes_podologia_insert on public.expedientes_podologia
for insert to authenticated
with check (
  public.is_admin()
  or (public.is_profesional() and public.can_access_sede(sede_id))
);

create policy expedientes_podologia_update on public.expedientes_podologia
for update to authenticated
using (
  public.is_admin()
  or (public.is_profesional() and public.can_access_sede(sede_id))
)
with check (
  public.is_admin()
  or (public.is_profesional() and public.can_access_sede(sede_id))
);
notify pgrst, 'reload schema';

