-- Se ejecuta justo ANTES de esquema.sql al restaurar una copia (docs/operacion.md y el
-- workflow "copia" de cesta-copias), dentro de la misma transacción.
--
-- Un proyecto de Supabase nuevo trae privilegios por defecto que dan permisos sobre
-- todo lo que se crea en public a anon, authenticated y service_role. La copia
-- (pg_dump) solo escribe los permisos que difieren de los de PostgreSQL de serie, así
-- que, sin esto, las tablas y funciones restauradas tendrían permisos de más: por
-- ejemplo, anon podría leer tablas (la RLS seguiría filtrando las filas) y authenticated
-- ejecutar funciones que en producción solo puede usar service_role.
--
-- Al quitarlos, cada objeto queda exactamente con los permisos de la copia. Los
-- privilegios por defecto de producción vienen al final de esquema.sql y se aplican
-- después, para lo que se cree en el futuro.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;
