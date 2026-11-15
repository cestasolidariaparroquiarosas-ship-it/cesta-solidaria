// Envío de los correos de las asignaciones (R4.1, R4.6; CA-14).
//
// Regla del plan (§4): primero se guarda y después se envía. Si el envío falla, la
// asignación se queda pendiente sin enviado_en, el panel lo muestra y se puede
// reintentar (el cron del PR 7 también lo hará).
//
// RGPD: los errores de SMTP pueden llevar la dirección del destinatario; solo se
// registran códigos.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Correo } from "@/lib/correo/transporte";
import { correoAsignacion, correoSinSustituto, type LineaCorreo } from "@/lib/correo/plantillas";
import { costeCesta } from "@/lib/dominio/cesta";
import { agruparPorAlimento, type ItemAsignado } from "@/lib/dominio/reparto";

export type ErrorEnvioSemana =
  | "sin_reparto"
  | "plazo_vencido"
  | "colaborador_no_disponible"
  | "incompleto"
  | "no_editable"
  | "no_enviada"
  | "nada_que_cubrir"
  | "no_encontrado"
  | "sin_permiso"
  | "desconocido";
export type Resultado<T = void> = { ok: true; valor: T } | { ok: false; error: ErrorEnvioSemana };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ok = <T>(valor: T): Resultado<T> => ({ ok: true, valor });
const fallo = (error: ErrorEnvioSemana): Resultado<never> => ({ ok: false, error });

export function traducirErrorEnvio(error: { code?: string; hint?: string } | null): ErrorEnvioSemana {
  switch (error?.code) {
    case "55000":
      switch (error.hint) {
        case "sin_reparto":
        case "plazo_vencido":
        case "colaborador_no_disponible":
        case "nada_que_cubrir":
          return error.hint;
        case "semana_no_enviada":
          return "no_enviada";
      }
      return "no_editable";
    case "23514":
      if (error.hint === "reparto_incompleto") return "incompleto";
      break;
    case "P0002":
    case "PGRST116":
      return "no_encontrado";
    case "42501":
      return "sin_permiso";
  }
  console.error(`Error de base de datos en el envío (código ${error?.code ?? "?"})`);
  return "desconocido";
}

// ---------------------------------------------------------------------------
// Datos de una asignación para su correo
// ---------------------------------------------------------------------------

type FilaItems = {
  cantidad: number;
  cesta_items: { alimento_id: string; unidad: string; precio_unitario: number | string; alimentos: { nombre: string } };
}[];

export const SELECCION_ITEMS =
  "asignacion_items(cantidad, cesta_items(alimento_id, unidad, precio_unitario, alimentos(nombre)))";

export function aItems(filas: FilaItems): ItemAsignado[] {
  return filas.map((i) => ({
    alimento_id: i.cesta_items.alimento_id,
    nombre: i.cesta_items.alimentos.nombre,
    unidad: i.cesta_items.unidad,
    cantidad: i.cantidad,
    precio_unitario: Number(i.cesta_items.precio_unitario),
  }));
}

export function lineasCorreo(items: ItemAsignado[]): LineaCorreo[] {
  return agruparPorAlimento(items).map(({ cantidad, nombre, unidad }) => ({ cantidad, nombre, unidad }));
}

async function registrar(
  cliente: SupabaseClient,
  evento: { tipo: string; semana_id?: string | null; asignacion_id?: string | null; detalle?: Record<string, unknown> },
) {
  const { error } = await cliente.from("registro_eventos").insert(evento);
  if (error) console.error(`No se ha podido anotar el evento ${evento.tipo} (código ${error.code})`);
}

// ---------------------------------------------------------------------------
// Envío
// ---------------------------------------------------------------------------

export type ResultadoEnvio = "enviado" | "fallido" | "no_aplica";

/**
 * Envía el correo de una asignación pendiente que aún no lo tiene. Antes de enviar,
 * la "reserva" anotando enviado_en solo si estaba vacío: así, si dos peticiones lo
 * intentan a la vez, solo una envía (CA-14: un solo correo). Si el envío falla, se
 * deshace la reserva y se anota el código del error.
 */
export async function enviarAsignacion(
  cliente: SupabaseClient,
  asignacionId: string,
  correo: Correo,
  urlBase: string,
): Promise<ResultadoEnvio> {
  if (!UUID.test(asignacionId)) return "no_aplica";
  const { data: reservada, error: errorReserva } = await cliente
    .from("asignaciones")
    .update({ enviado_en: new Date().toISOString() })
    .eq("id", asignacionId)
    .eq("estado", "pendiente")
    .is("enviado_en", null)
    .select("id");
  if (errorReserva) {
    traducirErrorEnvio(errorReserva);
    return "fallido";
  }
  if (!reservada?.length) return "no_aplica";

  const deshacer = () =>
    cliente.from("asignaciones").update({ enviado_en: null }).eq("id", asignacionId).eq("estado", "pendiente");

  const { data, error } = await cliente
    .from("asignaciones")
    .select(`token, plazo, sustituye_a, semana_id, colaboradores(nombre, email, estado), semanas(fecha_entrega), ${SELECCION_ITEMS}`)
    .eq("id", asignacionId)
    .single();
  if (error || !data) {
    await deshacer();
    return "fallido";
  }
  const a = data as unknown as {
    token: string;
    plazo: string;
    sustituye_a: string | null;
    semana_id: string;
    colaboradores: { nombre: string; email: string; estado: string } | null;
    semanas: { fecha_entrega: string };
    asignacion_items: FilaItems;
  };

  // CA-03: a quien está de baja (o se eliminó) no se le escribe nunca.
  if (!a.colaboradores || a.colaboradores.estado === "baja") {
    await deshacer();
    await registrar(cliente, {
      tipo: "correo_no_enviado",
      semana_id: a.semana_id,
      asignacion_id: asignacionId,
      detalle: { motivo: "colaborador_no_disponible" },
    });
    return "no_aplica";
  }

  const items = aItems(a.asignacion_items);
  try {
    await correo.enviar(
      a.colaboradores.email,
      correoAsignacion({
        nombre: a.colaboradores.nombre,
        fechaEntrega: a.semanas.fecha_entrega,
        plazo: a.plazo,
        lineas: lineasCorreo(items),
        gasto: costeCesta(items),
        urlRespuesta: `${urlBase}/r/${a.token}`,
        urlBaja: `${urlBase}/baja/${a.token}`,
        sustitucion: a.sustituye_a !== null,
      }),
    );
  } catch (e) {
    const codigo = (e as { codigo?: string }).codigo ?? "desconocido";
    console.error(`No se ha podido enviar un correo de asignación (código ${codigo})`);
    await deshacer();
    await registrar(cliente, { tipo: "error_envio", semana_id: a.semana_id, asignacion_id: asignacionId, detalle: { codigo } });
    return "fallido";
  }
  await registrar(cliente, { tipo: "correo_enviado", semana_id: a.semana_id, asignacion_id: asignacionId });
  return "enviado";
}

/** Envía los correos pendientes de una semana (los que aún no tienen enviado_en). */
export async function enviarPendientes(
  cliente: SupabaseClient,
  semanaId: string,
  correo: Correo,
  urlBase: string,
): Promise<Resultado<{ enviados: number; fallidos: number }>> {
  if (!UUID.test(semanaId)) return fallo("no_encontrado");
  const { data, error } = await cliente
    .from("asignaciones")
    .select("id")
    .eq("semana_id", semanaId)
    .eq("estado", "pendiente")
    .is("enviado_en", null)
    .order("creado_en");
  if (error) return fallo(traducirErrorEnvio(error));

  let enviados = 0;
  let fallidos = 0;
  for (const { id } of data as { id: string }[]) {
    const r = await enviarAsignacion(cliente, id, correo, urlBase);
    if (r === "enviado") enviados++;
    if (r === "fallido") fallidos++;
  }
  return ok({ enviados, fallidos });
}

/**
 * R4.1 (CA-14): pasa la semana a enviada y las asignaciones propuestas a pendientes
 * (función SQL enviar_semana, que comprueba el reparto y que nadie esté de baja), y
 * después envía un correo a cada colaborador.
 */
export async function enviarSemana(
  cliente: SupabaseClient,
  semanaId: string,
  correo: Correo,
  urlBase: string,
): Promise<Resultado<{ enviados: number; fallidos: number }>> {
  if (!UUID.test(semanaId)) return fallo("no_encontrado");
  const { error } = await cliente.rpc("enviar_semana", { p_semana_id: semanaId });
  if (error) return fallo(traducirErrorEnvio(error));
  return enviarPendientes(cliente, semanaId, correo, urlBase);
}

/**
 * R4.6 (CA-21): avisa al administrador de que los alimentos de una asignación se han
 * quedado sin nadie. Si el aviso falla, se anota; el panel lo muestra igualmente.
 */
export async function avisarSinSustituto(
  cliente: SupabaseClient,
  asignacionId: string,
  motivo: "sin_candidatos" | "sin_tiempo",
  correo: Correo,
  urlBase: string,
): Promise<void> {
  const { data } = await cliente
    .from("asignaciones")
    .select(`semana_id, semanas(fecha_entrega), ${SELECCION_ITEMS}`)
    .eq("id", asignacionId)
    .single();
  if (!data) return;
  const a = data as unknown as { semana_id: string; semanas: { fecha_entrega: string }; asignacion_items: FilaItems };
  try {
    await correo.enviar(
      correo.admin,
      correoSinSustituto({
        fechaEntrega: a.semanas.fecha_entrega,
        motivo,
        lineas: lineasCorreo(aItems(a.asignacion_items)),
        urlSemana: `${urlBase}/semanas/${a.semana_id}`,
      }),
    );
  } catch (e) {
    const codigo = (e as { codigo?: string }).codigo ?? "desconocido";
    console.error(`No se ha podido avisar al administrador (código ${codigo})`);
    await registrar(cliente, { tipo: "error_aviso_admin", semana_id: a.semana_id, asignacion_id: asignacionId, detalle: { codigo } });
  }
}
