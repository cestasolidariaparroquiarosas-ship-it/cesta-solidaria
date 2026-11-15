// Tarea diaria (plan PR 7; R4.5, R4.6; CA-20, CA-21, CA-27).
//
// La lanza el cron de Vercel una vez al día (vercel.json, 07:00 UTC: las 8:00 en Madrid
// en invierno y las 9:00 en verano). Usa el cliente con la clave secreta: no hay sesión.
// El resumen que devuelve solo lleva números, nunca nombres ni correos.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Correo } from "@/lib/correo/transporte";
import { DIAS_PARA_CERRAR } from "@/lib/dominio/inicio";
import { hoyEnMadrid, sumarDias } from "@/lib/fechas";
import { enviarPendientes, traducirErrorEnvio } from "./envio";
import { datosReasignacion, despuesDeReasignar } from "./respuestas";

export type ResumenDiario = {
  /** CA-27: la consulta que mantiene despierto el proyecto de Supabase. */
  baseDeDatos: "ok";
  /** Asignaciones que han pasado a "sin respuesta" (CA-20). */
  vencidas: number;
  reasignadas: number;
  /** Vencidas cuyos alimentos se han quedado sin cubrir (aviso al administrador, CA-21). */
  sinSustituto: number;
  /** Correos que no habían salido y se han reintentado. */
  reenviados: number;
  fallidos: number;
  /** Lo que no ha dado tiempo a hacer: se hace mañana. */
  pendientesParaManana: number;
  /** Semanas cerradas solas, a los DIAS_PARA_CERRAR días de la entrega. */
  semanasCerradas: number;
  /** Cestas cuyo identificador ha pasado a "Cesta n.º X" (conservación a 12 meses). */
  cestasConservadas: number;
};

export async function tareaDiaria(
  servicio: SupabaseClient,
  correo: Correo,
  urlBase: string,
  // Margen para el límite de 60 s de la ruta: con Gmail sin responder, un solo correo
  // puede tardar hasta 31 s (tiempos de espera de lib/correo/transporte.ts). Así que
  // no se empieza nada nuevo pasados 25 s.
  { limiteMs = 25_000 }: { limiteMs?: number } = {},
): Promise<ResumenDiario> {
  const inicio = Date.now();
  const quedaTiempo = () => Date.now() - inicio < limiteMs;
  const resumen: ResumenDiario = {
    baseDeDatos: "ok",
    vencidas: 0,
    reasignadas: 0,
    sinSustituto: 0,
    reenviados: 0,
    fallidos: 0,
    pendientesParaManana: 0,
    semanasCerradas: 0,
    cestasConservadas: 0,
  };

  // 1. CA-27: una consulta, para que Supabase no pause el proyecto por inactividad.
  const { error: errorConsulta } = await servicio.from("semanas").select("id", { count: "exact", head: true });
  if (errorConsulta) {
    traducirErrorEnvio(errorConsulta);
    throw new Error("La base de datos no responde");
  }

  const ahora = new Date();
  const hoy = hoyEnMadrid(ahora);

  // 2. Semanas que nadie ha cerrado a los DIAS_PARA_CERRAR días de la entrega: al
  //    histórico. Lo que siguiera esperando respuesta queda "sin respuesta".
  const { data: porCerrar, error: errorPorCerrar } = await servicio
    .from("semanas")
    .select("id")
    .eq("estado", "enviada")
    .lte("fecha_entrega", sumarDias(hoy, -DIAS_PARA_CERRAR));
  if (errorPorCerrar) {
    traducirErrorEnvio(errorPorCerrar);
    resumen.pendientesParaManana++;
  }
  for (const { id } of (porCerrar ?? []) as { id: string }[]) {
    const { error: errorCerrar } = await servicio.rpc("cerrar_semana", { p_semana_id: id });
    if (errorCerrar) {
      traducirErrorEnvio(errorCerrar);
      resumen.pendientesParaManana++;
    } else {
      resumen.semanasCerradas++;
    }
  }

  // 3. Conservación a 12 meses (spec §10): el identificador del receptor pasa a
  //    "Cesta n.º X" en las semanas cerradas hace más de un año.
  const { data: conservadas, error: errorConservar } = await servicio.rpc("conservar_doce_meses");
  if (errorConservar) {
    traducirErrorEnvio(errorConservar);
    resumen.pendientesParaManana++;
  } else {
    resumen.cestasConservadas = conservadas as number;
  }

  // 4. R4.5 (CA-20): pendientes con el plazo vencido, de semanas enviadas.
  const { data: vencidas, error } = await servicio
    .from("asignaciones")
    .select("id, semana_id, semanas!inner(fecha_entrega, estado)")
    .eq("estado", "pendiente")
    .lte("plazo", ahora.toISOString())
    .eq("semanas.estado", "enviada")
    .order("plazo");
  if (error) {
    traducirErrorEnvio(error);
    throw new Error("No se han podido leer las asignaciones vencidas");
  }

  const filas = vencidas as unknown as { id: string; semana_id: string; semanas: { fecha_entrega: string } }[];
  for (const [i, a] of filas.entries()) {
    if (!quedaTiempo()) {
      resumen.pendientesParaManana += filas.length - i;
      break;
    }
    // Si la entrega ya pasó, solo se anota: ya no hay nada que reasignar ni que avisar.
    const reasignar = a.semanas.fecha_entrega >= hoy;
    const datos = reasignar ? await datosReasignacion(servicio, a.semana_id, new Date()) : null;
    if (reasignar && !datos) {
      // Sin la lista de candidatos no se marca nada: se reintenta mañana.
      resumen.pendientesParaManana++;
      continue;
    }
    const plazo = datos?.plazo ?? new Date();
    const { data, error: errorVencer } = await servicio.rpc("vencer_asignacion", {
      p_asignacion_id: a.id,
      p_candidatos: datos?.candidatos ?? [],
      p_plazo: plazo.toISOString(),
      p_reasignar: reasignar,
    });
    if (errorVencer) {
      traducirErrorEnvio(errorVencer);
      resumen.pendientesParaManana++;
      continue;
    }
    const r = data as { resultado: "vencida" | "no_vencida"; nueva?: string | null };
    if (r.resultado !== "vencida") continue;
    resumen.vencidas++;
    if (!reasignar) continue;
    // CA-17 y CA-21: el correo del sustituto sale ya; si no hay nadie, aviso al administrador.
    await despuesDeReasignar(servicio, a.id, r.nueva ?? null, plazo, correo, urlBase);
    if (r.nueva) resumen.reasignadas++;
    else resumen.sinSustituto++;
  }

  // 5. Correos que no salieron (plan §4): de semanas enviadas cuya entrega no ha pasado.
  const { data: semanas, error: errorSemanas } = await servicio
    .from("semanas")
    .select("id")
    .eq("estado", "enviada")
    .gte("fecha_entrega", hoy)
    .order("fecha_entrega");
  if (errorSemanas) {
    traducirErrorEnvio(errorSemanas);
    resumen.pendientesParaManana++;
  }
  for (const { id } of (semanas ?? []) as { id: string }[]) {
    const restante = limiteMs - (Date.now() - inicio);
    if (restante <= 0) break;
    const r = await enviarPendientes(servicio, id, correo, urlBase, { limiteMs: restante });
    if (r.ok) {
      resumen.reenviados += r.valor.enviados;
      resumen.fallidos += r.valor.fallidos;
    }
  }

  return resumen;
}
