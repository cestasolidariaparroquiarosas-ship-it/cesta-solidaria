// Resumen de Inicio (spec §5.2): la semana en curso y sus avisos. Lógica pura.

import type { EstadoSemana } from "./semanas";
import type { EstadoAsignacion } from "./respuestas";

/** Días tras la entrega en que el cron cierra solo una semana que nadie ha cerrado. */
export const DIAS_PARA_CERRAR = 7;

/**
 * La semana en curso es la siguiente entrega que no está cerrada: la más próxima de
 * hoy en adelante. Si todas las que quedan abiertas ya pasaron, la más reciente (que
 * falta cerrar). null si no hay ninguna abierta.
 */
export function semanaEnCurso<T extends { fecha_entrega: string; estado: EstadoSemana }>(
  semanas: T[],
  hoy: string,
): T | null {
  const abiertas = semanas.filter((s) => s.estado !== "cerrada");
  const proximas = abiertas.filter((s) => s.fecha_entrega >= hoy).sort((a, b) => a.fecha_entrega.localeCompare(b.fecha_entrega));
  if (proximas.length) return proximas[0];
  const pasadas = abiertas.sort((a, b) => b.fecha_entrega.localeCompare(a.fecha_entrega));
  return pasadas[0] ?? null;
}

export type Recuento = { confirmadas: number; esperando: number; noPueden: number; entregadas: number };

/** Cuántas confirmadas, esperando respuesta y que no pueden (spec §5.2). */
export function recuento(asignaciones: { estado: EstadoAsignacion; entregado: boolean }[]): Recuento {
  return {
    confirmadas: asignaciones.filter((a) => a.estado === "confirmada").length,
    esperando: asignaciones.filter((a) => a.estado === "pendiente").length,
    noPueden: asignaciones.filter((a) => a.estado === "rechazada" || a.estado === "sin_respuesta").length,
    entregadas: asignaciones.filter((a) => a.entregado).length,
  };
}

export type Aviso = { tipo: "error" | "atencion" | "info"; texto: string };

/** Lo que el administrador tiene que hacer o mirar en la semana en curso. */
export function avisosSemana(d: {
  estado: EstadoSemana;
  fechaEntrega: string;
  plazoVencido: boolean;
  hoy: string;
  cestas: number;
  /** Asignaciones vivas (propuesta, pendiente o confirmada). */
  enReparto: number;
  /** En el reparto, colaboradores que ya no están disponibles (CA-03). */
  noDisponibles: number;
  /** Pendientes cuyo correo no ha salido. */
  correosSinEnviar: number;
  /** Rechazadas o sin respuesta que aún tienen alimentos (R4.6). */
  sinCubrir: number;
}): Aviso[] {
  const avisos: Aviso[] = [];
  if (d.estado === "borrador") {
    if (d.cestas === 0) avisos.push({ tipo: "info", texto: "Añade las cestas de las familias." });
    else if (d.enReparto === 0) avisos.push({ tipo: "info", texto: "Prepara el reparto." });
    else if (d.noDisponibles > 0)
      avisos.push({ tipo: "error", texto: "En el reparto hay colaboradores que ya no están disponibles: cámbialos." });
    else if (d.plazoVencido)
      avisos.push({ tipo: "error", texto: "El plazo para responder ya ha pasado: cámbialo antes de enviar." });
    else avisos.push({ tipo: "info", texto: "Todo listo para enviar los correos." });
    return avisos;
  }
  if (d.estado === "enviada") {
    if (d.correosSinEnviar > 0)
      avisos.push({
        tipo: "error",
        texto:
          d.correosSinEnviar === 1
            ? "Un correo no se ha podido enviar."
            : `${d.correosSinEnviar} correos no se han podido enviar.`,
      });
    if (d.sinCubrir > 0)
      avisos.push({
        tipo: "atencion",
        texto:
          d.sinCubrir === 1
            ? "Hay alimentos sin cubrir: nadie los lleva."
            : `Hay alimentos de ${d.sinCubrir} colaboradores sin cubrir: nadie los lleva.`,
      });
    if (d.fechaEntrega <= d.hoy)
      avisos.push({ tipo: "info", texto: "Cuando acabe la entrega, marca lo entregado y cierra la semana." });
  }
  return avisos;
}
