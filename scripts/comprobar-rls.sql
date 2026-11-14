-- Comprobación de seguridad del esquema public (CA-23). CI la ejecuta tras aplicar las
-- migraciones; falla si alguna tabla o vista se ha quedado sin proteger:
--   psql "$DB_URL" --variable ON_ERROR_STOP=1 --file scripts/comprobar-rls.sql
-- Reglas:
--   1. Toda tabla tiene Row Level Security activada y al menos una política.
--   2. Ninguna política se aplica a anon ni a PUBLIC: solo a authenticated.
--   3. Toda política exige ser administrador: usa privado.es_admin() en USING y,
--      si lo tiene, en WITH CHECK.
--   4. El rol anon no tiene ningún permiso sobre tablas, vistas ni vistas materializadas.
--   5. Toda vista usa security_invoker (si no, se saltaría la RLS de sus tablas).
--   6. Las vistas materializadas no admiten RLS: authenticated no puede leerlas.
--   7. anon no puede ejecutar ninguna función de public, y authenticated no puede
--      ejecutar las SECURITY DEFINER (se saltan la RLS). Esas las llama solo el
--      servidor, con la clave secreta.

do $$
declare
  problemas text[];
begin
  select array_agg(problema order by problema) into problemas
  from (
    select format('%s: sin Row Level Security', c.relname) as problema
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity

    union all
    select format('%s: sin ninguna política', c.relname)
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p')
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid)

    union all
    select format('%s: la política %s se aplica a anon o a PUBLIC', c.relname, p.polname)
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where c.relnamespace = 'public'::regnamespace
      and (0::oid = any (p.polroles) or 'anon'::regrole = any (p.polroles))

    union all
    select format('%s: la política %s no exige privado.es_admin()', c.relname, p.polname)
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where c.relnamespace = 'public'::regnamespace
      and (
        coalesce(pg_get_expr(p.polqual, p.polrelid), '') not like '%privado.es_admin()%'
        or (p.polwithcheck is not null
            and pg_get_expr(p.polwithcheck, p.polrelid) not like '%privado.es_admin()%')
      )

    union all
    select format('%s: anon tiene permisos', c.relname)
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p', 'v', 'm')
      and has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')

    union all
    select format('%s: vista sin security_invoker', c.relname)
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'v'
      and not coalesce('security_invoker=true' = any (c.reloptions), false)

    union all
    select format('%s: vista materializada legible por authenticated', c.relname)
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'm'
      and has_table_privilege('authenticated', c.oid, 'SELECT')

    union all
    select format('función %s: anon puede ejecutarla', p.oid::regprocedure)
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and has_function_privilege('anon', p.oid, 'EXECUTE')

    union all
    select format('función %s: SECURITY DEFINER ejecutable por authenticated', p.oid::regprocedure)
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) as p;

  if problemas is not null then
    raise exception E'Problemas de seguridad en el esquema public:\n  - %',
      array_to_string(problemas, E'\n  - ');
  end if;

  raise notice 'Esquema public: RLS y permisos correctos.';
end;
$$;
