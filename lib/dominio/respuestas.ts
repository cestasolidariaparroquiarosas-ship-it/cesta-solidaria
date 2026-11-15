// Respuestas de los colaboradores desde los enlaces del correo (R4, R5.1). Lógica pura.

import type { EstadoSemana } from "./semanas";

/** 32 bytes aleatorios en hexadecimal (migración inicial, columna asignaciones.token). */
const TOKEN = /^[0-9a-f]{64}$/;

/** CA-18: un token con otro formato ni se busca en la base de datos. */
export function tokenValido(token: unknown): token is string {
  return typeof token === "string" && TOKEN.test(token);
}

export type Respuesta = "si" | "no";

export function leerRespuesta(valor: unknown): Respuesta | null {
  return valor === "si" || valor === "no" ? valor : null;
}

/**
 * CA-24: en las páginas públicas y en el saludo del correo, solo el nombre de pila.
 * "María José Pérez" → "María". Sin nombre (colaborador eliminado), un saludo neutro.
 */
export function nombreDePila(nombre: string | null | undefined): string {
  const primero = nombre?.trim().split(/\s+/)[0];
  return primero || "colaborador/a";
}

export type EstadoAsignacion = "propuesta" | "pendiente" | "confirmada" | "rechazada" | "sin_respuesta";

/** Lo que puede hacer el colaborador al abrir el enlace (R4.3, CA-19). */
export type Situacion = "puede_responder" | "confirmada" | "rechazada" | "vencida" | "no_disponible";

export function situacionAsignacion(
  a: { estado: EstadoAsignacion; plazo: string | null },
  semana: { estado: EstadoSemana },
  ahora: Date = new Date(),
): Situacion {
  if (a.estado === "confirmada") return "confirmada";
  if (a.estado === "rechazada") return "rechazada";
  if (a.estado === "sin_respuesta") return "vencida";
  if (a.estado !== "pendiente" || semana.estado !== "enviada") return "no_disponible";
  if (!a.plazo || new Date(a.plazo).getTime() <= ahora.getTime()) return "vencida";
  return "puede_responder";
}
