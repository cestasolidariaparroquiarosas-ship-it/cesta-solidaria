// R2 — Selección de colaboradores (spec §4, CA-09, CA-10, CA-13). Lógica pura.

import { esCandidato, type Colaborador } from "./colaboradores";

/** En céntimos, para no arrastrar errores de coma flotante. */
const centimos = (euros: number) => Math.round(euros * 100);

/** R2.2: N = redondeo hacia arriba(coste total / precio base). */
export function colaboradoresNecesarios(costeTotal: number, precioBase: number): number {
  if (precioBase <= 0) throw new Error("El precio base tiene que ser mayor que 0");
  return Math.ceil(centimos(costeTotal) / centimos(precioBase));
}

export type Candidato = Pick<Colaborador, "id" | "estado" | "pausado_hasta" | "creado_en"> & {
  /** Fecha de entrega más reciente con una asignación confirmada; null si nunca. */
  ultima_participacion: string | null;
};

/**
 * R2.4: primero quienes nunca han participado; después, de la última participación
 * más antigua a la más reciente; a igualdad, quien se dio de alta antes. El id deshace
 * el último empate para que el orden no dependa de cómo llegan los datos.
 */
export function compararCandidatos(a: Candidato, b: Candidato): number {
  if (a.ultima_participacion !== b.ultima_participacion) {
    if (a.ultima_participacion === null) return -1;
    if (b.ultima_participacion === null) return 1;
    return a.ultima_participacion < b.ultima_participacion ? -1 : 1;
  }
  if (a.creado_en !== b.creado_en) return new Date(a.creado_en).getTime() - new Date(b.creado_en).getTime();
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** R2.3 y R2.4: los candidatos para esa fecha de entrega, en el orden en que se eligen. */
export function candidatosOrdenados<T extends Candidato>(
  colaboradores: T[],
  fechaEntrega: string,
  excluir: ReadonlySet<string> = new Set(),
): T[] {
  return colaboradores
    .filter((c) => !excluir.has(c.id) && esCandidato(c, fechaEntrega))
    .sort(compararCandidatos);
}

export type Seleccion<T> = {
  necesarios: number;
  elegidos: T[];
  /** R2.5 (CA-13): cuántos faltan. Si es > 0, el gasto de cada uno superará el precio base. */
  faltan: number;
};

/** R2: los N primeros candidatos, o todos si no hay bastantes. */
export function seleccionar<T extends Candidato>(
  colaboradores: T[],
  { fechaEntrega, costeTotal, precioBase }: { fechaEntrega: string; costeTotal: number; precioBase: number },
): Seleccion<T> {
  const necesarios = colaboradoresNecesarios(costeTotal, precioBase);
  const elegidos = candidatosOrdenados(colaboradores, fechaEntrega).slice(0, necesarios);
  return { necesarios, elegidos, faltan: Math.max(0, necesarios - elegidos.length) };
}
