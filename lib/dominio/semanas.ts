// Semanas: datos de la entrega (spec §3, §5.6 paso 1). Lógica pura, sin base de datos.

import { esFechaValida, hoyEnMadrid, instanteDeMadrid } from "@/lib/fechas";
import { LIMITES_CATALOGO, leerDecimal } from "./catalogo";

export const ESTADOS_SEMANA = ["borrador", "enviada", "cerrada"] as const;
export type EstadoSemana = (typeof ESTADOS_SEMANA)[number];

export const NOMBRE_ESTADO_SEMANA: Record<EstadoSemana, string> = {
  borrador: "En preparación",
  enviada: "Enviada",
  cerrada: "Cerrada",
};

export type Semana = {
  id: string;
  /** Fin de semana en que los colaboradores llevan los alimentos, "AAAA-MM-DD". */
  fecha_entrega: string;
  precio_base: number;
  /** Instante (timestamptz) hasta el que pueden responder. */
  plazo_confirmacion: string;
  estado: EstadoSemana;
};

export type DatosSemana = { fecha_entrega: string; precio_base: number; plazo_confirmacion: string };
export type CampoSemana = "fecha_entrega" | "precio_base" | "plazo_fecha" | "plazo_hora";

type Validacion<T, C extends string> = { ok: true; datos: T } | { ok: false; errores: Partial<Record<C, string>> };

/** Las cestas solo se pueden cambiar mientras la semana se prepara. */
export function semanaEditable(semana: Pick<Semana, "estado">): boolean {
  return semana.estado === "borrador";
}

/**
 * Datos de la semana. El plazo se escribe en hora de Madrid y se guarda como instante.
 * - La fecha de entrega no puede haber pasado.
 * - El plazo tiene que ser futuro y anterior al día de la entrega: los colaboradores
 *   necesitan saber antes si llevan los alimentos.
 */
export function validarSemana(
  entrada: { fecha_entrega?: unknown; precio_base?: unknown; plazo_fecha?: unknown; plazo_hora?: unknown },
  ahora: Date = new Date(),
): Validacion<DatosSemana, CampoSemana> {
  const fecha = typeof entrada.fecha_entrega === "string" ? entrada.fecha_entrega.trim() : "";
  const plazoFecha = typeof entrada.plazo_fecha === "string" ? entrada.plazo_fecha.trim() : "";
  const plazoHora = typeof entrada.plazo_hora === "string" ? entrada.plazo_hora.trim() : "";
  const precio = leerDecimal(entrada.precio_base);
  const errores: Partial<Record<CampoSemana, string>> = {};
  const hoy = hoyEnMadrid(ahora);

  if (!esFechaValida(fecha)) errores.fecha_entrega = "Elige la fecha de entrega.";
  else if (fecha < hoy) errores.fecha_entrega = "La fecha de entrega ya ha pasado.";

  if (precio === null) errores.precio_base = "Escribe el precio en euros, por ejemplo 20.";
  else if (precio <= 0) errores.precio_base = "Tiene que ser mayor que 0.";
  else if (precio > LIMITES_CATALOGO.precioMaximo) errores.precio_base = "El precio parece demasiado alto.";

  const plazo = instanteDeMadrid(plazoFecha, plazoHora);
  if (!esFechaValida(plazoFecha)) errores.plazo_fecha = "Elige el día del plazo.";
  else if (!plazo) errores.plazo_hora = "Escribe una hora válida, por ejemplo 20:00.";
  else if (plazo.getTime() <= ahora.getTime()) errores.plazo_fecha = "El plazo ya ha pasado.";
  else if (!errores.fecha_entrega && plazoFecha >= fecha)
    errores.plazo_fecha = "El plazo tiene que terminar antes del día de la entrega.";

  if (Object.keys(errores).length) return { ok: false, errores };
  return {
    ok: true,
    datos: { fecha_entrega: fecha, precio_base: precio!, plazo_confirmacion: plazo!.toISOString() },
  };
}

export type PasoSemana = { clave: "datos" | "cestas" | "reparto" | "envio"; hecho: boolean; actual: boolean };

/**
 * Pasos de la semana (spec 0003, P1). Datos siempre está hecho; Cestas, si hay alguna;
 * Reparto, si hay asignaciones vivas; Envío, si la semana está cerrada. El actual es el
 * primero sin hacer, salvo con la semana enviada, que es Envío. Cerrada: ninguno.
 */
export function pasosSemana(d: { estado: EstadoSemana; cestas: number; enReparto: number }): PasoSemana[] {
  const hechos = {
    datos: true,
    cestas: d.cestas > 0,
    reparto: d.enReparto > 0,
    envio: d.estado === "cerrada",
  };
  const claves = ["datos", "cestas", "reparto", "envio"] as const;
  const actual =
    d.estado === "cerrada" ? null : d.estado === "enviada" ? "envio" : (claves.find((c) => !hechos[c]) ?? null);
  return claves.map((clave) => ({ clave, hecho: hechos[clave], actual: clave === actual }));
}
