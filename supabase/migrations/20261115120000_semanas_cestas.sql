-- Semanas y cestas (plan PR 4, R1, CA-05 a CA-08).
--
-- Compatible con la versión anterior (0.4.0): esa versión no lee ni escribe cestas.
-- Las funciones son SECURITY INVOKER: la Row Level Security se aplica igual que en una
-- consulta normal, y solo las puede ejecutar authenticated.

-- ---------------------------------------------------------------------------
-- 1. Cada alimento de una cesta guarda su precio y su unidad del momento.
--    CA-08: si cambia el precio en el catálogo, la cesta conserva el que tenía.
--    Lo mismo con la unidad (requisito de la revisión del PR 3): si "paquete 1 kg"
--    pasa a "paquete 500 g", a los colaboradores se les sigue pidiendo lo que se
--    calculó, no la mitad.
-- ---------------------------------------------------------------------------

alter table public.cesta_items add column unidad text;

update public.cesta_items ci
set unidad = a.unidad
from public.alimentos a
where a.id = ci.alimento_id and ci.unidad is null;

alter table public.cesta_items
  alter column unidad set not null,
  add constraint cesta_items_unidad_no_vacia check (length(trim(unidad)) > 0);

-- Al añadir un alimento a una cesta, si no se indica precio o unidad se copian del
-- catálogo en ese momento. Así nadie tiene que leer el precio y luego insertarlo en
-- dos pasos, y las versiones que no conocen la columna unidad siguen funcionando.
create function privado.completar_cesta_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.precio_unitario is null or new.unidad is null then
    select coalesce(new.precio_unitario, a.precio_aprox), coalesce(new.unidad, a.unidad)
    into new.precio_unitario, new.unidad
    from public.alimentos a
    where a.id = new.alimento_id;

    -- Mismo error que daría la clave ajena, en vez de "precio vacío".
    if not found then
      raise exception 'El alimento no existe' using errcode = 'foreign_key_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger cesta_items_completar
  before insert on public.cesta_items
  for each row execute function privado.completar_cesta_item();

-- ---------------------------------------------------------------------------
-- 2. Las cestas solo se cambian mientras la semana está en preparación (borrador).
--    Una vez enviada, cambiar una cesta dejaría alimentos sin colaborador o pediría
--    cosas distintas de las del correo. La app ya lo comprueba; esto cubre que dos
--    pestañas abiertas hagan cosas a la vez: la comprobación bloquea la fila de la
--    semana (FOR SHARE) hasta el final de la transacción, así que "Enviar" (PR 6), que
--    debe cambiar el estado con SELECT ... FOR UPDATE, espera a que termine el cambio
--    de la cesta, y un cambio que llegue después ya ve la semana enviada.
--    Sí se pueden cambiar siempre:
--    - El identificador del receptor: a los 12 meses de cerrar una semana se sustituye
--      por "Cesta n.º X" (spec §10, PR 8).
--    - La lista base de referencia: al borrar una lista, la clave ajena la pone a NULL
--      en todas las cestas que la usaron. Los alimentos ya están copiados en la cesta.
--    Borrar la semana entera funciona: en la cascada la semana ya no existe.
-- ---------------------------------------------------------------------------

create function privado.exigir_semana_en_preparacion(p_semana_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_estado text;
begin
  select s.estado into v_estado from public.semanas s where s.id = p_semana_id for share;
  -- Sin semana (se está borrando en cascada), no hay nada que proteger.
  if v_estado is not null and v_estado <> 'borrador' then
    raise exception 'La semana ya no está en preparación'
      using errcode = 'object_not_in_prerequisite_state', hint = 'semana_no_editable';
  end if;
end;
$$;

-- Los disparadores la llaman con los permisos de quien cambia la cesta, y las funciones
-- nuevas no se pueden ejecutar por defecto (migración inicial).
revoke all on function privado.exigir_semana_en_preparacion(uuid) from public;
grant execute on function privado.exigir_semana_en_preparacion(uuid) to authenticated, service_role;

create function privado.cestas_solo_en_preparacion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform privado.exigir_semana_en_preparacion(old.semana_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform privado.exigir_semana_en_preparacion(new.semana_id);
    return new;
  end if;
  return old;
end;
$$;

create trigger cestas_solo_en_preparacion
  before insert or delete or update of semana_id, adultos, ninos on public.cestas
  for each row execute function privado.cestas_solo_en_preparacion();

-- Para cesta_items y cesta_exclusiones: la semana se busca a través de la cesta.
create function privado.contenido_cesta_solo_en_preparacion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_semana uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select c.semana_id into v_semana from public.cestas c where c.id = old.cesta_id;
    perform privado.exigir_semana_en_preparacion(v_semana);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select c.semana_id into v_semana from public.cestas c where c.id = new.cesta_id;
    perform privado.exigir_semana_en_preparacion(v_semana);
    return new;
  end if;
  return old;
end;
$$;

create trigger cesta_items_solo_en_preparacion
  before insert or update or delete on public.cesta_items
  for each row execute function privado.contenido_cesta_solo_en_preparacion();

create trigger cesta_exclusiones_solo_en_preparacion
  before insert or update or delete on public.cesta_exclusiones
  for each row execute function privado.contenido_cesta_solo_en_preparacion();

-- ---------------------------------------------------------------------------
-- 3. Guardar una cesta con sus exclusiones y sus alimentos de una vez.
--    Si fallara a medias, podría quedar una cesta "sin cerdo" sin la exclusión
--    guardada, y el chorizo podría acabar dentro.
--
--    p_id nulo: alta en la semana p_semana_id. Con valor: edición.
--    p_items: [{"alimento_id": "...", "cantidad": 4}, ...]
--      - con valor: sustituye todos los alimentos (la propuesta de R1 calculada en
--        lib/dominio/cesta.ts). Precio y unidad se copian del catálogo ahora (CA-08).
--      - nulo: conserva los alimentos, salvo los que choquen con las exclusiones
--        nuevas, que se quitan (R1.2).
--    Devuelve {"id": "...", "quitados": [ids]}: los alimentos quitados por las exclusiones.
--    En la edición, la cesta tiene que ser de la semana p_semana_id.
-- ---------------------------------------------------------------------------

create function public.guardar_cesta(
  p_id uuid,
  p_semana_id uuid,
  p_identificador text,
  p_adultos integer,
  p_ninos integer,
  p_lista_base_id uuid,
  p_exclusiones uuid[],
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_exclusiones uuid[] := coalesce(p_exclusiones, '{}');
  v_quitados uuid[] := '{}';
begin
  if p_id is null then
    insert into public.cestas (semana_id, identificador_receptor, adultos, ninos, lista_base_id)
    values (p_semana_id, p_identificador, p_adultos, p_ninos, p_lista_base_id)
    returning id into v_id;
  else
    update public.cestas
    set identificador_receptor = p_identificador,
        adultos = p_adultos,
        ninos = p_ninos,
        lista_base_id = p_lista_base_id
    where id = p_id and semana_id = p_semana_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Cesta no encontrada' using errcode = 'no_data_found';
    end if;
  end if;

  if p_items is not null then
    delete from public.cesta_items where cesta_id = v_id;
  else
    -- R1.2: fuera lo que choca con las exclusiones nuevas.
    with borrados as (
      delete from public.cesta_items ci
      where ci.cesta_id = v_id
        and exists (
          select 1 from public.alimento_etiquetas ae
          where ae.alimento_id = ci.alimento_id and ae.etiqueta_id = any (v_exclusiones)
        )
      returning ci.alimento_id
    )
    select coalesce(array_agg(alimento_id), '{}') into v_quitados from borrados;
  end if;

  delete from public.cesta_exclusiones
  where cesta_id = v_id
    and etiqueta_id <> all (v_exclusiones);

  insert into public.cesta_exclusiones (cesta_id, etiqueta_id)
  select distinct v_id, e
  from unnest(v_exclusiones) as e
  on conflict do nothing;

  if p_items is not null then
    -- Si un alimento choca (el catálogo cambió mientras tanto), el disparador
    -- cesta_items_sin_exclusiones lo rechaza y no se guarda nada.
    insert into public.cesta_items (cesta_id, alimento_id, cantidad)
    select v_id, (i ->> 'alimento_id')::uuid, (i ->> 'cantidad')::integer
    from jsonb_array_elements(p_items) as i;
  end if;

  return jsonb_build_object('id', v_id, 'quitados', to_jsonb(v_quitados));
end;
$$;

revoke all on function public.guardar_cesta(uuid, uuid, text, integer, integer, uuid, uuid[], jsonb) from public, anon;
grant execute on function public.guardar_cesta(uuid, uuid, text, integer, integer, uuid, uuid[], jsonb) to authenticated;
