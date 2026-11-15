-- Selección y reparto (plan PR 5, R2 y R3, CA-09 a CA-13).
--
-- Compatible con la versión anterior (0.5.0): esa versión no lee ni escribe
-- asignaciones. Las funciones son SECURITY INVOKER: la Row Level Security se aplica
-- igual que en una consulta normal, y solo las puede ejecutar authenticated.
--
-- El reparto de una semana en preparación son sus asignaciones en estado 'propuesta',
-- con sus alimentos (asignacion_items). Al enviar (PR 6) pasan a 'pendiente'.

-- ---------------------------------------------------------------------------
-- 1. Última participación de cada colaborador (spec §3, R2.4).
--    Agregada en la base de datos: PostgREST devuelve como mucho 1000 filas, y leer
--    todas las asignaciones confirmadas para calcularla en la app dejaría de ser
--    correcto con los años (pendiente de la versión 0.3.0).
-- ---------------------------------------------------------------------------

create view public.ultimas_participaciones
with (security_invoker = true) as
select a.colaborador_id, max(s.fecha_entrega) as ultima_participacion
from public.asignaciones a
join public.semanas s on s.id = a.semana_id
where a.estado = 'confirmada' and a.colaborador_id is not null
group by a.colaborador_id;

comment on view public.ultimas_participaciones is
  'Fecha de entrega más reciente con una asignación confirmada, por colaborador (R2.4).';

revoke all on public.ultimas_participaciones from anon, public;
grant select on public.ultimas_participaciones to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. CA-12: todas las unidades de todas las cestas, asignadas exactamente una vez.
--    Lo comprueban las dos funciones que cambian el reparto, al final de su trabajo.
-- ---------------------------------------------------------------------------

create function privado.comprobar_reparto_completo(p_semana_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  -- Cada alimento de cesta, con lo asignado de él.
  if exists (
    select 1
    from public.cesta_items ci
    join public.cestas c on c.id = ci.cesta_id
    left join public.asignacion_items ai on ai.cesta_item_id = ci.id
    left join public.asignaciones a on a.id = ai.asignacion_id and a.semana_id = c.semana_id
    where c.semana_id = p_semana_id
    group by ci.id, ci.cantidad
    having coalesce(sum(ai.cantidad) filter (where a.id is not null), 0) <> ci.cantidad
  ) then
    raise exception 'El reparto no cubre exactamente todas las unidades de las cestas'
      using errcode = 'check_violation', hint = 'reparto_incompleto';
  end if;

  -- Y nada asignado de cestas de otra semana.
  if exists (
    select 1
    from public.asignaciones a
    join public.asignacion_items ai on ai.asignacion_id = a.id
    join public.cesta_items ci on ci.id = ai.cesta_item_id
    join public.cestas c on c.id = ci.cesta_id
    where a.semana_id = p_semana_id and c.semana_id <> p_semana_id
  ) then
    raise exception 'El reparto incluye alimentos de otra semana'
      using errcode = 'check_violation', hint = 'reparto_incompleto';
  end if;
end;
$$;

revoke all on function privado.comprobar_reparto_completo(uuid) from public;
grant execute on function privado.comprobar_reparto_completo(uuid) to authenticated, service_role;

-- Bloquea la semana hasta el final de la transacción y exige que esté en preparación.
-- FOR UPDATE: dos propuestas o movimientos a la vez se hacen uno detrás de otro, y
-- esperan a los cambios de cestas en curso (que la bloquean con FOR SHARE).
create function privado.bloquear_semana_en_preparacion(p_semana_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_estado text;
begin
  select s.estado into v_estado from public.semanas s where s.id = p_semana_id for update;
  if v_estado is null then
    raise exception 'Semana no encontrada' using errcode = 'no_data_found';
  end if;
  if v_estado <> 'borrador' then
    raise exception 'La semana ya no está en preparación'
      using errcode = 'object_not_in_prerequisite_state', hint = 'semana_no_editable';
  end if;
end;
$$;

revoke all on function privado.bloquear_semana_en_preparacion(uuid) from public;
grant execute on function privado.bloquear_semana_en_preparacion(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Si cambian las cestas, el reparto propuesto se descarta.
--    (Pendiente de la versión 0.5.0.) El reparto se calcula con lo que hay en las
--    cestas; si cambian, ya no cuadra: faltarían o sobrarían unidades, y quitar un
--    alimento repartido fallaría por la clave ajena. Volver a proponerlo es un clic, y
--    la pantalla de la cesta avisa antes de que se pierda.
--    Solo afecta a las asignaciones 'propuesta': una semana enviada no deja cambiar
--    sus cestas (migración de semanas y cestas).
-- ---------------------------------------------------------------------------

create function privado.descartar_reparto_propuesto()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_semana uuid;
begin
  if tg_table_name = 'cestas' then
    v_semana := old.semana_id;
  elsif tg_op = 'INSERT' then
    select c.semana_id into v_semana from public.cestas c where c.id = new.cesta_id;
  else
    select c.semana_id into v_semana from public.cestas c where c.id = old.cesta_id;
  end if;

  -- Sin semana (se está borrando en cascada), no hay nada que descartar.
  if v_semana is not null then
    delete from public.asignaciones where semana_id = v_semana and estado = 'propuesta';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger cesta_items_descartar_reparto
  before insert or delete or update of cantidad, alimento_id, precio_unitario, cesta_id on public.cesta_items
  for each row execute function privado.descartar_reparto_propuesto();

-- Al borrar una cesta, sus alimentos se borran en cascada cuando la cesta ya no existe
-- y el disparador de arriba no encontraría la semana: se descarta aquí, antes.
create trigger cestas_descartar_reparto
  before delete on public.cestas
  for each row execute function privado.descartar_reparto_propuesto();

-- ---------------------------------------------------------------------------
-- 4. Guardar la propuesta de reparto de una vez (R2 + R3, calculados en
--    lib/dominio/seleccion.ts y lib/dominio/reparto.ts).
--    p_asignaciones: [{"colaborador_id": "...", "items": [{"cesta_item_id": "...", "cantidad": 2}]}]
--    Sustituye el reparto propuesto que hubiera. Devuelve cuántas asignaciones crea.
-- ---------------------------------------------------------------------------

create function public.proponer_reparto(p_semana_id uuid, p_asignaciones jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_asignacion jsonb;
  v_id uuid;
  v_total integer := 0;
begin
  perform privado.bloquear_semana_en_preparacion(p_semana_id);

  delete from public.asignaciones where semana_id = p_semana_id and estado = 'propuesta';

  for v_asignacion in select * from jsonb_array_elements(coalesce(p_asignaciones, '[]'::jsonb)) loop
    insert into public.asignaciones (semana_id, colaborador_id, estado)
    values (p_semana_id, (v_asignacion ->> 'colaborador_id')::uuid, 'propuesta')
    returning id into v_id;

    insert into public.asignacion_items (asignacion_id, cesta_item_id, cantidad)
    select v_id, (i ->> 'cesta_item_id')::uuid, (i ->> 'cantidad')::integer
    from jsonb_array_elements(v_asignacion -> 'items') as i;

    v_total := v_total + 1;
  end loop;

  perform privado.comprobar_reparto_completo(p_semana_id);
  return v_total;
end;
$$;

revoke all on function public.proponer_reparto(uuid, jsonb) from public, anon;
grant execute on function public.proponer_reparto(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Mover unidades de un alimento de un colaborador a otro (R3.5).
--    Se mueve por alimento y unidad (como se muestra), tomando de las cestas en orden.
--    Si el origen se queda sin nada, sale del reparto: no recibiría un correo vacío.
--    Devuelve {"origen_eliminado": true|false}.
-- ---------------------------------------------------------------------------

create function public.mover_en_reparto(
  p_origen uuid,
  p_destino uuid,
  p_alimento_id uuid,
  p_unidad text,
  p_cantidad integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_semana uuid;
  v_quedan integer := p_cantidad;
  v_fila record;
  v_toma integer;
  v_origen_eliminado boolean := false;
begin
  if p_cantidad is null or p_cantidad < 1 then
    raise exception 'La cantidad tiene que ser mayor que 0' using errcode = 'check_violation', hint = 'cantidad_insuficiente';
  end if;
  if p_origen = p_destino then
    raise exception 'El origen y el destino son el mismo' using errcode = 'check_violation', hint = 'mismo_colaborador';
  end if;

  select a.semana_id into v_semana from public.asignaciones a where a.id = p_origen and a.estado = 'propuesta';
  if v_semana is null
     or not exists (
       select 1 from public.asignaciones a
       where a.id = p_destino and a.semana_id = v_semana and a.estado = 'propuesta'
     ) then
    raise exception 'Asignación no encontrada' using errcode = 'no_data_found';
  end if;

  perform privado.bloquear_semana_en_preparacion(v_semana);

  for v_fila in
    select ai.id, ai.cesta_item_id, ai.cantidad
    from public.asignacion_items ai
    join public.cesta_items ci on ci.id = ai.cesta_item_id
    where ai.asignacion_id = p_origen and ci.alimento_id = p_alimento_id and ci.unidad = p_unidad
    order by ci.cesta_id, ci.id
    for update of ai
  loop
    exit when v_quedan = 0;
    v_toma := least(v_quedan, v_fila.cantidad);

    if v_toma = v_fila.cantidad then
      delete from public.asignacion_items where id = v_fila.id;
    else
      update public.asignacion_items set cantidad = cantidad - v_toma where id = v_fila.id;
    end if;

    insert into public.asignacion_items (asignacion_id, cesta_item_id, cantidad)
    values (p_destino, v_fila.cesta_item_id, v_toma)
    on conflict (asignacion_id, cesta_item_id)
    do update set cantidad = public.asignacion_items.cantidad + excluded.cantidad;

    v_quedan := v_quedan - v_toma;
  end loop;

  if v_quedan > 0 then
    raise exception 'El colaborador no lleva tantas unidades' using errcode = 'check_violation', hint = 'cantidad_insuficiente';
  end if;

  if not exists (select 1 from public.asignacion_items where asignacion_id = p_origen) then
    delete from public.asignaciones where id = p_origen;
    v_origen_eliminado := true;
  end if;

  perform privado.comprobar_reparto_completo(v_semana);
  return jsonb_build_object('origen_eliminado', v_origen_eliminado);
end;
$$;

revoke all on function public.mover_en_reparto(uuid, uuid, uuid, text, integer) from public, anon;
grant execute on function public.mover_en_reparto(uuid, uuid, uuid, text, integer) to authenticated;
