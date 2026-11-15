-- Cierre de semanas y conservación a 12 meses (plan PR 8; spec §5.6, §5.7, §10; CA-29).
--
-- Compatible con la versión anterior (0.8.0): solo añade funciones.

-- ---------------------------------------------------------------------------
-- 1. Cerrar una semana enviada cuya entrega ya ha llegado. Pasa al histórico.
--    Lo que siga esperando respuesta queda como 'sin_respuesta': ya no hay nada que
--    esperar. Lo usan el administrador (botón) y el cron (a los 7 días de la entrega).
--    Devuelve cuántas asignaciones han pasado a 'sin_respuesta'.
-- ---------------------------------------------------------------------------

create function public.cerrar_semana(p_semana_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_estado text;
  v_fecha date;
  v_sin_respuesta integer;
begin
  select s.estado, s.fecha_entrega into v_estado, v_fecha
  from public.semanas s where s.id = p_semana_id for update;
  if v_estado is null then
    raise exception 'Semana no encontrada' using errcode = 'no_data_found';
  end if;
  if v_estado <> 'enviada' then
    raise exception 'Solo se cierra una semana enviada'
      using errcode = 'object_not_in_prerequisite_state', hint = 'semana_no_enviada';
  end if;
  -- La fecha de hoy en Madrid, como en la app (lib/fechas.ts).
  if v_fecha > (now() at time zone 'Europe/Madrid')::date then
    raise exception 'La entrega todavía no ha llegado'
      using errcode = 'object_not_in_prerequisite_state', hint = 'entrega_futura';
  end if;

  update public.asignaciones
  set estado = 'sin_respuesta'
  where semana_id = p_semana_id and estado = 'pendiente';
  get diagnostics v_sin_respuesta = row_count;

  update public.semanas set estado = 'cerrada', cerrada_en = now() where id = p_semana_id;

  insert into public.registro_eventos (tipo, semana_id, detalle)
  values ('semana_cerrada', p_semana_id, jsonb_build_object('sin_respuesta', v_sin_respuesta));
  return v_sin_respuesta;
end;
$$;

revoke all on function public.cerrar_semana(uuid) from public, anon;
grant execute on function public.cerrar_semana(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Conservación (spec §10, pregunta 10; RGPD, minimización): a los 12 meses de
--    cerrar una semana, el identificador del receptor de cada cesta pasa a ser
--    "Cesta n.º X", numeradas por orden de alta dentro de la semana. El histórico
--    sigue sabiendo qué se llevó, pero ya no para quién.
--    Lo hace el cron cada día; volver a ejecutarlo no cambia nada.
--    Devuelve cuántas cestas ha cambiado.
-- ---------------------------------------------------------------------------

create function public.conservar_doce_meses()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total integer;
begin
  with numeradas as (
    select c.id, 'Cesta n.º ' || row_number() over (partition by c.semana_id order by c.creado_en, c.id) as nuevo
    from public.cestas c
    join public.semanas s on s.id = c.semana_id
    where s.estado = 'cerrada' and s.cerrada_en < now() - interval '12 months'
  )
  update public.cestas c
  set identificador_receptor = n.nuevo
  from numeradas n
  where c.id = n.id and c.identificador_receptor <> n.nuevo;
  get diagnostics v_total = row_count;

  if v_total > 0 then
    insert into public.registro_eventos (tipo, detalle)
    values ('conservacion_12_meses', jsonb_build_object('cestas', v_total));
  end if;
  return v_total;
end;
$$;

revoke all on function public.conservar_doce_meses() from public, anon, authenticated;
grant execute on function public.conservar_doce_meses() to service_role;
