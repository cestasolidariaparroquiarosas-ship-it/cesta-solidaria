-- Catálogo (plan PR 3): operaciones que deben ocurrir de una vez.
--
-- Las dos funciones son SECURITY INVOKER: se ejecutan con los permisos de quien las
-- llama, así que la Row Level Security se aplica igual que en una consulta normal.
-- Un usuario que no es administrador no puede leer ni cambiar nada con ellas.
-- Solo las puede ejecutar authenticated (scripts/comprobar-rls.sql vigila que anon no).

-- Guarda un alimento y sus etiquetas ("contiene cerdo"...) en una sola transacción.
-- Si se guardara el alimento y fallaran las etiquetas, quedaría un alimento sin su
-- "contiene cerdo" y podría acabar en una cesta "sin cerdo" (R1.2, CA-06).
-- p_id nulo: alta. p_id con valor: edición (P0002 si no existe o no se puede ver).
create function public.guardar_alimento(
  p_id uuid,
  p_nombre text,
  p_unidad text,
  p_precio numeric,
  p_activo boolean,
  p_etiquetas uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_etiquetas uuid[] := coalesce(p_etiquetas, '{}');
begin
  if p_id is null then
    insert into public.alimentos (nombre, unidad, precio_aprox, activo)
    values (p_nombre, p_unidad, p_precio, p_activo)
    returning id into v_id;
  else
    update public.alimentos
    set nombre = p_nombre, unidad = p_unidad, precio_aprox = p_precio, activo = p_activo
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Alimento no encontrado' using errcode = 'no_data_found';
    end if;
  end if;

  delete from public.alimento_etiquetas
  where alimento_id = v_id
    and etiqueta_id <> all (v_etiquetas);

  insert into public.alimento_etiquetas (alimento_id, etiqueta_id)
  select distinct v_id, e
  from unnest(v_etiquetas) as e
  on conflict do nothing;

  return v_id;
end;
$$;

revoke all on function public.guardar_alimento(uuid, text, text, numeric, boolean, uuid[]) from public, anon;
grant execute on function public.guardar_alimento(uuid, text, text, numeric, boolean, uuid[]) to authenticated;

-- Marca una lista base como la predeterminada y desmarca la anterior, de una vez:
-- el índice único listas_base_una_predeterminada no admite dos a la vez.
create function public.marcar_lista_predeterminada(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.listas_base set predeterminada = false
  where predeterminada and id <> p_id;

  update public.listas_base set predeterminada = true
  where id = p_id;

  if not found then
    -- Deshace también el primer UPDATE: la excepción anula toda la llamada.
    raise exception 'Lista no encontrada' using errcode = 'no_data_found';
  end if;
end;
$$;

revoke all on function public.marcar_lista_predeterminada(uuid) from public, anon;
grant execute on function public.marcar_lista_predeterminada(uuid) to authenticated;
