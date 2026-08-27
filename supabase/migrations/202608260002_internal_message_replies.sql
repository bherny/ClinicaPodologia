-- Respuestas enlazadas y eliminacion colaborativa auditada.
-- Ejecutar despues de 202608260001_signatures_and_team_communication.sql.

alter table public.mensajes_internos
  add column if not exists respuesta_a_id uuid references public.mensajes_internos(id) on delete set null;

create index if not exists mensajes_internos_respuesta_idx
  on public.mensajes_internos (respuesta_a_id)
  where respuesta_a_id is not null;

create or replace function public.validate_internal_message_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent public.mensajes_internos%rowtype;
begin
  if new.respuesta_a_id is null then
    return new;
  end if;

  if new.id = new.respuesta_a_id then
    raise exception 'Un mensaje no puede responderse a si mismo';
  end if;

  select * into v_parent
  from public.mensajes_internos
  where id = new.respuesta_a_id;

  if not found or v_parent.eliminado then
    raise exception 'El mensaje original ya no esta disponible';
  end if;

  if new.sede_id is distinct from v_parent.sede_id then
    raise exception 'Solo puedes responder mensajes del mismo canal';
  end if;

  return new;
end;
$$;

drop trigger if exists mensajes_internos_validate_reply on public.mensajes_internos;
create trigger mensajes_internos_validate_reply
before insert or update of respuesta_a_id, sede_id on public.mensajes_internos
for each row execute function public.validate_internal_message_reply();

drop trigger if exists auditoria_mensajes_internos on public.mensajes_internos;
create trigger auditoria_mensajes_internos
after insert or update or delete on public.mensajes_internos
for each row execute function public.audit_row_changes();

drop trigger if exists auditoria_comentarios_comunicado on public.comentarios_comunicado;
create trigger auditoria_comentarios_comunicado
after insert or update or delete on public.comentarios_comunicado
for each row execute function public.audit_row_changes();

create or replace function public.soft_delete_internal_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_active_staff() then
    raise exception 'Perfil activo requerido';
  end if;

  update public.mensajes_internos
  set eliminado = true, updated_at = now()
  where id = p_message_id and eliminado = false;
end;
$$;

create or replace function public.soft_delete_community_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_active_staff() then
    raise exception 'Perfil activo requerido';
  end if;

  update public.comunicados
  set eliminado = true, updated_at = now()
  where id = p_post_id and eliminado = false;
end;
$$;

create or replace function public.soft_delete_community_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_active_staff() then
    raise exception 'Perfil activo requerido';
  end if;

  update public.comentarios_comunicado
  set eliminado = true, updated_at = now()
  where id = p_comment_id and eliminado = false;
end;
$$;

revoke all on function public.validate_internal_message_reply() from public;
revoke all on function public.soft_delete_internal_message(uuid) from public;
revoke all on function public.soft_delete_community_post(uuid) from public;
revoke all on function public.soft_delete_community_comment(uuid) from public;
grant execute on function public.soft_delete_internal_message(uuid) to authenticated;
grant execute on function public.soft_delete_community_post(uuid) to authenticated;
grant execute on function public.soft_delete_community_comment(uuid) to authenticated;
