-- Huella de seguridad de los esquemas de la app: permisos (ACL) de esquemas, tablas,
-- vistas, secuencias y funciones; RLS; SECURITY DEFINER, y políticas. Una línea por
-- objeto, ordenada. Solo metadatos: ningún dato de las tablas.
--
-- El workflow "copia" la saca de producción y de la copia restaurada y las compara:
-- si difieren, la copia no deja la base igual que estaba.
--   psql "$DB_URL" --no-psqlrc -At --variable ON_ERROR_STOP=1 --file scripts/huella-permisos.sql
set search_path = '';

select linea from (
  select format('esquema %s acl=%s', n.nspname,
         (select string_agg(a::text, ',' order by a::text)
          from unnest(coalesce(n.nspacl, acldefault('n', n.nspowner))) a)) as linea
  from pg_namespace n
  where n.nspname in ('public', 'privado')

  union all
  select format('%s %s rls=%s forzada=%s acl=%s',
         case c.relkind when 'r' then 'tabla' when 'p' then 'tabla' when 'v' then 'vista'
                        when 'm' then 'vista_materializada' else 'secuencia' end,
         c.oid::regclass, c.relrowsecurity, c.relforcerowsecurity,
         (select string_agg(a::text, ',' order by a::text)
          from unnest(coalesce(c.relacl, acldefault((case when c.relkind = 'S' then 's' else 'r' end)::"char", c.relowner))) a))
  from pg_class c
  where c.relnamespace in ('public'::regnamespace, 'privado'::regnamespace)
    and c.relkind in ('r', 'p', 'v', 'm', 'S')

  union all
  select format('funcion %s definer=%s acl=%s', p.oid::regprocedure, p.prosecdef,
         (select string_agg(a::text, ',' order by a::text)
          from unnest(coalesce(p.proacl, acldefault('f', p.proowner))) a))
  from pg_proc p
  where p.pronamespace in ('public'::regnamespace, 'privado'::regnamespace)

  union all
  select format('politica %s.%s %s %s %s roles=%s using=%s check=%s', schemaname, tablename, policyname,
         permissive, cmd, array_to_string(roles, ','), qual, with_check)
  from pg_policies
  where schemaname in ('public', 'privado')
) as huella
order by linea;
