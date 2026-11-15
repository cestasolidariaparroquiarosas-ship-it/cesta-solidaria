// Cierre de semanas, casilla "entregado" e histórico (plan PR 8; spec §5.6, §5.7, §10).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EstadoAsignacion } from "@/lib/dominio/respuestas";

export type ErrorHistorico = "no_enviada" | "entrega_futura" | "no_encontrado" | "sin_permiso" | "desconocido";
export type Resultado<T = void> = { ok: true; valor: T } | { ok: false; error: ErrorHistorico };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fallo = (error: ErrorHistorico): Resultado<never> => ({ ok: false, error });

function traducirError(error: { code?: string; hint?: string } | null): ErrorHistorico {
  switch (error?.code) {
    case "55000":
      return error.hint === "entrega_futura" ? "entrega_futura" : "no_enviada";
    case "P0002":
    case "PGRST116":
      return "no_encontrado";
    case "42501":
      return "sin_permiso";
  }
  console.error(`Error de base de datos en el histórico (código ${error?.code ?? "?"})`);
  return "desconocido";
}

/**
 * Cierra una semana enviada cuya entrega ya ha llegado (función SQL cerrar_semana):
 * pasa al histórico y lo que siga esperando respuesta queda "sin respuesta".
 * Devuelve cuántas han quedado así.
 */
export async function cerrarSemana(cliente: SupabaseClient, semanaId: string): Promise<Resultado<number>> {
  if (!UUID.test(semanaId)) return fallo("no_encontrado");
  const { data, error } = await cliente.rpc("cerrar_semana", { p_semana_id: semanaId });
  if (error) return fallo(traducirError(error));
  return { ok: true, valor: data as number };
}

/**
 * Casilla "entregado" de una asignación confirmada (spec §10, pregunta 6). Se puede
 * marcar y desmarcar también con la semana cerrada: es para dejar constancia.
 */
export async function marcarEntregado(
  cliente: SupabaseClient,
  semanaId: string,
  asignacionId: string,
  entregado: boolean,
): Promise<Resultado> {
  if (!UUID.test(semanaId) || !UUID.test(asignacionId)) return fallo("no_encontrado");
  const { count, error } = await cliente
    .from("asignaciones")
    .update({ entregado }, { count: "exact" })
    .eq("id", asignacionId)
    .eq("semana_id", semanaId)
    .eq("estado", "confirmada");
  if (error) return fallo(traducirError(error));
  if (!count) return fallo("no_encontrado");
  return { ok: true, valor: undefined };
}

export type SemanaCerrada = {
  id: string;
  fecha_entrega: string;
  cerrada_en: string;
  asignaciones: { estado: EstadoAsignacion; entregado: boolean }[];
};

/** Histórico (spec §5.7): las semanas cerradas, de la más reciente a la más antigua. */
export async function listarCerradas(cliente: SupabaseClient): Promise<Resultado<SemanaCerrada[]>> {
  const { data, error } = await cliente
    .from("semanas")
    .select("id, fecha_entrega, cerrada_en, asignaciones(estado, entregado)")
    .eq("estado", "cerrada")
    .order("fecha_entrega", { ascending: false });
  if (error) return fallo(traducirError(error));
  return { ok: true, valor: data as unknown as SemanaCerrada[] };
}
