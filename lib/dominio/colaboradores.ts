// Reglas de los colaboradores (spec §3, R2.3, R5). Lógica pura, sin base de datos.

import { esFechaValida } from "@/lib/fechas";

export const ESTADOS_COLABORADOR = ["activo", "pausado", "baja"] as const;
export type EstadoColaborador = (typeof ESTADOS_COLABORADOR)[number];

export const NOMBRE_ESTADO: Record<EstadoColaborador, string> = {
  activo: "Activo",
  pausado: "En pausa",
  baja: "De baja",
};

export type Colaborador = {
  id: string;
  nombre: string;
  email: string;
  estado: EstadoColaborador;
  /** Último día de la pausa (incluido), "AAAA-MM-DD". Sin fecha: pausa indefinida. */
  pausado_hasta: string | null;
  fecha_consentimiento: string | null;
  notas: string | null;
  creado_en: string;
};

export function esEstadoColaborador(valor: unknown): valor is EstadoColaborador {
  return ESTADOS_COLABORADOR.includes(valor as EstadoColaborador);
}

/**
 * R2.3 (CA-02, CA-03): ¿puede recibir alimentos en la semana con esta fecha de entrega?
 * - activo: sí.
 * - pausado: solo si su pausa termina antes de la fecha de entrega. Sin fecha de
 *   vuelta, la pausa es indefinida y no es candidato hasta que se reactive.
 * - baja: nunca.
 */
export function esCandidato(
  colaborador: Pick<Colaborador, "estado" | "pausado_hasta">,
  fechaEntrega: string,
): boolean {
  switch (colaborador.estado) {
    case "activo":
      return true;
    case "pausado":
      return colaborador.pausado_hasta !== null && colaborador.pausado_hasta < fechaEntrega;
    case "baja":
      return false;
  }
}

/** R5.2 (CA-04): tras "Eliminar definitivamente", sus asignaciones no tienen colaborador. */
export const COLABORADOR_ELIMINADO = "Colaborador eliminado";

export function nombreVisible(colaborador: { nombre: string } | null | undefined): string {
  return colaborador?.nombre ?? COLABORADOR_ELIMINADO;
}

/**
 * Última participación (spec §3): la fecha de entrega más reciente de una semana en
 * la que el colaborador tuvo una asignación confirmada. Recibe solo las confirmadas.
 */
export function ultimasParticipaciones(
  confirmadas: { colaborador_id: string | null; fecha_entrega: string }[],
): Map<string, string> {
  const ultimas = new Map<string, string>();
  for (const { colaborador_id, fecha_entrega } of confirmadas) {
    if (!colaborador_id) continue;
    const actual = ultimas.get(colaborador_id);
    if (!actual || fecha_entrega > actual) ultimas.set(colaborador_id, fecha_entrega);
  }
  return ultimas;
}

// ---------------------------------------------------------------------------
// Validación de los formularios
// ---------------------------------------------------------------------------

export const LIMITES = { nombre: 100, email: 254, notas: 500 } as const;

// Algo más estricto que la base de datos: exige un punto en el dominio.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type DatosColaborador = { nombre: string; email: string; notas: string | null };
export type CampoColaborador = keyof DatosColaborador | "consentimiento";
export type Errores<C extends string> = Partial<Record<C, string>>;

type Validacion<T, C extends string> = { ok: true; datos: T } | { ok: false; errores: Errores<C> };

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

/** Nombre, correo y notas. El correo se guarda en minúsculas (CA-01 no distingue). */
export function validarDatosColaborador(entrada: {
  nombre?: unknown;
  email?: unknown;
  notas?: unknown;
}): Validacion<DatosColaborador, CampoColaborador> {
  const nombre = texto(entrada.nombre).replace(/\s+/g, " ");
  const email = texto(entrada.email).toLowerCase();
  const notas = texto(entrada.notas);
  const errores: Errores<CampoColaborador> = {};

  if (!nombre) errores.nombre = "Escribe el nombre.";
  else if (nombre.length > LIMITES.nombre) errores.nombre = `Como mucho ${LIMITES.nombre} caracteres.`;

  if (!email) errores.email = "Escribe el correo.";
  else if (email.length > LIMITES.email || !EMAIL.test(email)) errores.email = "El correo no es válido.";

  if (notas.length > LIMITES.notas) errores.notas = `Como mucho ${LIMITES.notas} caracteres.`;

  if (Object.keys(errores).length) return { ok: false, errores };
  return { ok: true, datos: { nombre, email, notas: notas || null } };
}

/**
 * Fecha de vuelta de una pausa: opcional (vacía = pausa indefinida). Si se da, es el
 * último día de la pausa y no puede ser anterior a hoy.
 */
export function validarPausa(
  entrada: unknown,
  hoy: string,
): { ok: true; pausadoHasta: string | null } | { ok: false; error: string } {
  const fecha = texto(entrada);
  if (!fecha) return { ok: true, pausadoHasta: null };
  if (!esFechaValida(fecha)) return { ok: false, error: "La fecha no es válida." };
  if (fecha < hoy) return { ok: false, error: "La fecha de vuelta no puede ser anterior a hoy." };
  return { ok: true, pausadoHasta: fecha };
}
