// Plazos de respuesta (R4). Lógica pura, sin base de datos.

import { instanteDeMadrid, sumarDias } from "@/lib/fechas";

const HORA_MS = 3_600_000;

/**
 * R4.4: plazo de una asignación que viene de una reasignación. Es el que llegue antes
 * de estos dos: 48 horas desde el envío, o las 23:59 (hora de Madrid) del día anterior
 * a la entrega.
 */
export function plazoReasignacion(envio: Date, fechaEntrega: string): Date {
  const en48Horas = new Date(envio.getTime() + 48 * HORA_MS);
  const vispera = instanteDeMadrid(sumarDias(fechaEntrega, -1), "23:59");
  if (!vispera) throw new Error("Fecha de entrega no válida");
  return en48Horas < vispera ? en48Horas : vispera;
}

/** Una respuesta solo se acepta antes del plazo (R4.3, CA-19). */
export function plazoVencido(plazo: string | Date, ahora: Date = new Date()): boolean {
  return new Date(plazo).getTime() <= ahora.getTime();
}
