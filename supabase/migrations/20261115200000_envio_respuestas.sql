-- Envío, respuestas, reasignación y baja (plan PR 6, R4 y R5.1; CA-14 a CA-19, CA-22, CA-24).
--
-- Compatible con la versión anterior (0.6.0): esa versión no envía ni lee estas funciones.
-- Todas son SECURITY INVOKER.
-- - enviar_semana y buscar_sustituto las usa el administrador (authenticated, con RLS).
-- - responder_asignacion y dar_de_baja las usan las páginas públicas de los enlaces del
--   correo con la clave secreta (service_role): authenticated y anon no pueden.
--
-- Todo lo que cambia asignaciones de una semana enviada bloquea antes la fila de la
-- semana con FOR UPDATE. Así dos rechazos casi simultáneos no eligen al mismo sustituto
-- (plan §4, el riesgo más alto): el segundo espera y ve la asignación del primero.
--
-- El orden de los candidatos (R2.3 y R2.4) lo calcula la app (lib/dominio/seleccion.ts)
-- y lo pasa como lista; aquí se toma el primero que siga disponible y no tenga ya
-- asignación esa semana.

-- ---------------------------------------------------------------------------
-- 1. ¿Sigue siendo candidato? (R2.3, CA-02, CA-03). La misma regla que esCandidato en
--    lib/dominio/colaboradores.ts: aquí es la última comprobación, justo al asignar.
-- ---------------------------------------------------------------------------

create function privado.es_candidato(p_colaborador_id uuid, p_fecha_entrega date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.colaboradores c
    where c.id = p_colaborador_id
      and (c.estado = 'activo'
           or (c.estado = 'pausado' and c.pausado_hasta is not null and c.pausado_hasta < p_fecha_entrega))
  );
$$;

revoke all on function privado.es_candidato(uuid, date) from public;
grant execute on function privado.es_candidato(uuid, date) to authenticated, service_role;

-- Bloquea una semana enviada (FOR UPDATE). Devuelve su fecha de entrega.
create function privado.bloquear_semana_enviada(p_semana_id uuid)
returns date
language plpgsql
set search_path = ''
as $$
declare
  v_estado text;
  v_fecha date;
begin
  select s.estado, s.fecha_entrega into v_estado, v_fecha
  from public.semanas s where s.id = p_semana_id for update;
  if v_estado is null then
    raise exception 'Semana no encontrada' using errcode = 'no_data_found';
  end if;
  if v_estado <> 'enviada' then
    raise exception 'La semana no está enviada' using errcode = 'object_not_in_prerequisite_state', hint = 'semana_no_enviada';
  end if;
  return v_fecha;
end;
$$;

revoke all on function privado.bloquear_semana_enviada(uuid) from public;
grant execute on function privado.bloquear_semana_enviada(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Enviar la semana (R4.1, CA-14): las asignaciones propuestas pasan a pendientes
--    con el plazo de la semana, y la semana a enviada. Los correos los manda la app
--    después, uno por asignación, y anota enviado_en en cada uno.
-- ---------------------------------------------------------------------------

create function public.enviar_semana(p_semana_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plazo timestamptz;
  v_fecha date;
  v_total integer;
begin
  perform privado.bloquear_semana_en_preparacion(p_semana_id);
  select s.plazo_confirmacion, s.fecha_entrega into v_plazo, v_fecha from public.semanas s where s.id = p_semana_id;

  if not exists (select 1 from public.asignaciones where semana_id = p_semana_id and estado = 'propuesta') then
    raise exception 'La semana no tiene reparto' using errcode = 'object_not_in_prerequisite_state', hint = 'sin_reparto';
  end if;
  if v_plazo <= now() then
    raise exception 'El plazo ya ha pasado' using errcode = 'object_not_in_prerequisite_state', hint = 'plazo_vencido';
  end if;
  -- CA-03: nadie de baja, en pausa o eliminado recibe el correo.
  if exists (
    select 1 from public.asignaciones a
    where a.semana_id = p_semana_id and a.estado = 'propuesta'
      and (a.colaborador_id is null or not privado.es_candidato(a.colaborador_id, v_fecha))
  ) then
    raise exception 'Hay colaboradores que ya no están disponibles'
      using errcode = 'object_not_in_prerequisite_state', hint = 'colaborador_no_disponible';
  end if;
  perform privado.comprobar_reparto_completo(p_semana_id);

  update public.asignaciones
  set estado = 'pendiente', plazo = v_plazo
  where semana_id = p_semana_id and estado = 'propuesta';
  get diagnostics v_total = row_count;

  update public.semanas set estado = 'enviada' where id = p_semana_id;

  insert into public.registro_eventos (tipo, semana_id, detalle)
  values ('semana_enviada', p_semana_id, jsonb_build_object('asignaciones', v_total));
  return v_total;
end;
$$;

revoke all on function public.enviar_semana(uuid) from public, anon;
grant execute on function public.enviar_semana(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Reasignar los alimentos de una asignación rechazada o sin respuesta (R4.4).
--    Quien llama ya ha bloqueado la semana. Mueve los alimentos a una asignación
--    nueva, pendiente, para el primer candidato de la lista que siga disponible y no
--    tenga asignación esa semana. Si no hay nadie, o el plazo ya ha pasado (no queda
--    tiempo antes de la entrega), los alimentos se quedan en la asignación original,
--    sin cubrir, y se anota: la app avisa al administrador (R4.6).
--    Devuelve la asignación nueva, o null.
-- ---------------------------------------------------------------------------

create function privado.reasignar(p_asignacion_id uuid, p_candidatos uuid[], p_plazo timestamptz)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_semana uuid;
  v_fecha date;
  v_colaborador uuid;
  v_nueva uuid;
begin
  select a.semana_id, s.fecha_entrega into v_semana, v_fecha
  from public.asignaciones a join public.semanas s on s.id = a.semana_id
  where a.id = p_asignacion_id;

  if p_plazo is null or p_plazo <= now() then
    insert into public.registro_eventos (tipo, semana_id, asignacion_id, detalle)
    values ('sin_sustituto', v_semana, p_asignacion_id, jsonb_build_object('motivo', 'sin_tiempo'));
    return null;
  end if;

  select u.id into v_colaborador
  from unnest(coalesce(p_candidatos, '{}')) with ordinality as u (id, orden)
  where privado.es_candidato(u.id, v_fecha)
    and not exists (
      select 1 from public.asignaciones a where a.semana_id = v_semana and a.colaborador_id = u.id
    )
  order by u.orden
  limit 1;

  if v_colaborador is null then
    insert into public.registro_eventos (tipo, semana_id, asignacion_id, detalle)
    values ('sin_sustituto', v_semana, p_asignacion_id, jsonb_build_object('motivo', 'sin_candidatos'));
    return null;
  end if;

  insert into public.asignaciones (semana_id, colaborador_id, estado, plazo, sustituye_a)
  values (v_semana, v_colaborador, 'pendiente', p_plazo, p_asignacion_id)
  returning id into v_nueva;

  update public.asignacion_items set asignacion_id = v_nueva where asignacion_id = p_asignacion_id;

  insert into public.registro_eventos (tipo, semana_id, asignacion_id, detalle)
  values ('reasignacion', v_semana, v_nueva, jsonb_build_object('sustituye_a', p_asignacion_id));
  return v_nueva;
end;
$$;

revoke all on function privado.reasignar(uuid, uuid[], timestamptz) from public;
grant execute on function privado.reasignar(uuid, uuid[], timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Respuesta desde el enlace del correo (R4.2 a R4.4; CA-16 a CA-19).
--    Solo cuenta si la asignación sigue pendiente, la semana enviada y el plazo sin
--    vencer; si no, no cambia nada y devuelve por qué. Los casos normales ("ya
--    respondiste", "el plazo terminó") son resultados, no errores.
--    Devuelve {"resultado": "confirmada" | "rechazada" | "ya_respondida" | "vencida"
--    | "no_encontrada", "nueva": id de la asignación nueva o null, "semana_id": ...}.
--    p_motivo: 'respuesta' o 'baja' (se anota en el registro).
-- ---------------------------------------------------------------------------

create function public.responder_asignacion(
  p_token text,
  p_respuesta text,
  p_candidatos uuid[],
  p_plazo timestamptz,
  p_motivo text default 'respuesta'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_semana uuid;
  v_estado text;
  v_plazo timestamptz;
  v_estado_semana text;
  v_nueva uuid;
begin
  if p_respuesta not in ('si', 'no') then
    raise exception 'Respuesta no válida' using errcode = 'check_violation';
  end if;

  select a.id, a.semana_id into v_id, v_semana from public.asignaciones a where a.token = p_token;
  if v_id is null then
    return jsonb_build_object('resultado', 'no_encontrada');
  end if;

  -- Primero la semana, después la asignación: el mismo orden que el resto de funciones.
  select s.estado into v_estado_semana from public.semanas s where s.id = v_semana for update;
  select a.estado, a.plazo into v_estado, v_plazo from public.asignaciones a where a.id = v_id for update;

  if v_estado <> 'pendiente' then
    return jsonb_build_object('resultado', 'ya_respondida', 'semana_id', v_semana);
  end if;
  if v_estado_semana <> 'enviada' or v_plazo is null or v_plazo <= now() then
    return jsonb_build_object('resultado', 'vencida', 'semana_id', v_semana);
  end if;

  if p_respuesta = 'si' then
    update public.asignaciones set estado = 'confirmada', respondido_en = now() where id = v_id;
    insert into public.registro_eventos (tipo, semana_id, asignacion_id)
    values ('confirmacion', v_semana, v_id);
    return jsonb_build_object('resultado', 'confirmada', 'semana_id', v_semana);
  end if;

  update public.asignaciones set estado = 'rechazada', respondido_en = now() where id = v_id;
  insert into public.registro_eventos (tipo, semana_id, asignacion_id, detalle)
  values ('rechazo', v_semana, v_id, jsonb_build_object('motivo', p_motivo));
  v_nueva := privado.reasignar(v_id, p_candidatos, p_plazo);
  return jsonb_build_object('resultado', 'rechazada', 'nueva', v_nueva, 'semana_id', v_semana);
end;
$$;

revoke all on function public.responder_asignacion(text, text, uuid[], timestamptz, text) from public, anon, authenticated;
grant execute on function public.responder_asignacion(text, text, uuid[], timestamptz, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Buscar sustituto a mano (administrador): para alimentos que se quedaron sin
--    cubrir porque no había candidatos, cuando ya los hay (por ejemplo, tras dar de
--    alta a alguien). Devuelve la asignación nueva, o null si sigue sin haber nadie.
-- ---------------------------------------------------------------------------

create function public.buscar_sustituto(p_asignacion_id uuid, p_candidatos uuid[], p_plazo timestamptz)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_semana uuid;
begin
  select a.semana_id into v_semana from public.asignaciones a where a.id = p_asignacion_id;
  if v_semana is null then
    raise exception 'Asignación no encontrada' using errcode = 'no_data_found';
  end if;
  perform privado.bloquear_semana_enviada(v_semana);

  if not exists (
    select 1 from public.asignaciones a
    where a.id = p_asignacion_id and a.estado in ('rechazada', 'sin_respuesta')
      and exists (select 1 from public.asignacion_items ai where ai.asignacion_id = a.id)
  ) then
    raise exception 'No hay alimentos sin cubrir en esta asignación'
      using errcode = 'object_not_in_prerequisite_state', hint = 'nada_que_cubrir';
  end if;

  return privado.reasignar(p_asignacion_id, p_candidatos, p_plazo);
end;
$$;

revoke all on function public.buscar_sustituto(uuid, uuid[], timestamptz) from public, anon;
grant execute on function public.buscar_sustituto(uuid, uuid[], timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Baja desde el enlace del correo (R5.1, CA-22). El enlace lleva el token de una
--    asignación, que identifica al colaborador. Deja de ser candidato y de recibir
--    correos (CA-03). Devuelve sus asignaciones pendientes (token y semana): la app
--    las trata como un "no puedo" para que alguien las cubra.
--    Devuelve {"resultado": "baja" | "ya_de_baja" | "no_encontrada", "pendientes": [...]}.
-- ---------------------------------------------------------------------------

create function public.dar_de_baja(p_token text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_colaborador uuid;
  v_estado text;
begin
  select a.colaborador_id into v_colaborador from public.asignaciones a where a.token = p_token;
  if v_colaborador is null then
    return jsonb_build_object('resultado', 'no_encontrada');
  end if;

  select c.estado into v_estado from public.colaboradores c where c.id = v_colaborador for update;
  if v_estado is null then
    return jsonb_build_object('resultado', 'no_encontrada');
  end if;

  if v_estado <> 'baja' then
    update public.colaboradores set estado = 'baja', pausado_hasta = null where id = v_colaborador;
    -- Sin nombre ni correo en el registro: solo el id (CLAUDE.md, RGPD).
    insert into public.registro_eventos (tipo, detalle)
    values ('baja_desde_correo', jsonb_build_object('colaborador_id', v_colaborador));
  end if;

  return jsonb_build_object(
    'resultado', case when v_estado = 'baja' then 'ya_de_baja' else 'baja' end,
    'pendientes', coalesce((
      select jsonb_agg(jsonb_build_object('token', a.token, 'semana_id', a.semana_id))
      from public.asignaciones a
      where a.colaborador_id = v_colaborador and a.estado = 'pendiente'
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.dar_de_baja(text) from public, anon, authenticated;
grant execute on function public.dar_de_baja(text) to service_role;
