-- Cron diario (plan PR 7, R4.5 y R4.6; CA-20, CA-21).
--
-- Compatible con la versión anterior (0.7.0): solo añade una función.
-- La ejecuta la ruta del cron con la clave secreta (service_role): authenticated y anon
-- no pueden.

-- ---------------------------------------------------------------------------
-- R4.5 (CA-20): una asignación pendiente cuyo plazo ha vencido pasa a 'sin_respuesta'
-- y, si p_reasignar, sus alimentos van al siguiente candidato, igual que en un rechazo
-- (privado.reasignar, que bloquea la semana).
-- Vuelve a comprobarlo todo con la semana bloqueada: si mientras tanto la persona ha
-- respondido, o el plazo no ha vencido, no cambia nada.
-- Devuelve {"resultado": "vencida" | "no_vencida", "nueva": id o null}.
-- ---------------------------------------------------------------------------

create function public.vencer_asignacion(
  p_asignacion_id uuid,
  p_candidatos uuid[],
  p_plazo timestamptz,
  p_reasignar boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_semana uuid;
  v_estado_semana text;
  v_estado text;
  v_plazo timestamptz;
  v_nueva uuid;
begin
  select a.semana_id into v_semana from public.asignaciones a where a.id = p_asignacion_id;
  if v_semana is null then
    return jsonb_build_object('resultado', 'no_vencida');
  end if;

  -- Primero la semana, después la asignación: el mismo orden que el resto de funciones.
  select s.estado into v_estado_semana from public.semanas s where s.id = v_semana for update;
  select a.estado, a.plazo into v_estado, v_plazo from public.asignaciones a where a.id = p_asignacion_id for update;

  if v_estado_semana <> 'enviada' or v_estado <> 'pendiente' or v_plazo is null or v_plazo > now() then
    return jsonb_build_object('resultado', 'no_vencida');
  end if;

  update public.asignaciones set estado = 'sin_respuesta' where id = p_asignacion_id;
  insert into public.registro_eventos (tipo, semana_id, asignacion_id)
  values ('sin_respuesta', v_semana, p_asignacion_id);

  if p_reasignar then
    v_nueva := privado.reasignar(p_asignacion_id, p_candidatos, p_plazo);
  end if;
  return jsonb_build_object('resultado', 'vencida', 'nueva', v_nueva);
end;
$$;

revoke all on function public.vencer_asignacion(uuid, uuid[], timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.vencer_asignacion(uuid, uuid[], timestamptz, boolean) to service_role;
