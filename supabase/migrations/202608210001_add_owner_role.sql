-- El valor owner se agrega en una migracion independiente porque PostgreSQL
-- no permite usar un valor nuevo de enum dentro de la misma transaccion.
alter type public.rol_usuario add value if not exists 'owner';

notify pgrst, 'reload schema';
