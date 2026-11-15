// R1 — Propuesta de cesta (spec §4, CA-05 a CA-08). Lógica pura, sin base de datos.

import type { Alimento } from "./catalogo";

export const LIMITES_CESTA = {
  identificador: 40,
  personas: 20,
  cantidad: 999,
} as const;

/** Un alimento de la lista base, con sus datos actuales del catálogo. */
export type ItemPlantilla = {
  alimento: Pick<Alimento, "id" | "nombre" | "unidad" | "activo" | "etiquetas">;
  cantidad_por_adulto: number;
  cantidad_por_nino: number;
};

export type Familia = { adultos: number; ninos: number; exclusiones: string[] };

export type AlimentoQuitado = { alimento_id: string; nombre: string; unidad: string; etiquetas: string[] };

export type Propuesta = {
  items: { alimento_id: string; cantidad: number }[];
  /** R1.2: quitados por chocar con las exclusiones de la cesta, con las etiquetas que chocan. */
  quitados: AlimentoQuitado[];
  /** Desactivados en el catálogo: no se proponen (decisión del PR 3). */
  desactivados: { alimento_id: string; nombre: string; unidad: string }[];
};

/**
 * R1.1: redondeo hacia arriba de adultos × por adulto + niños × por niño.
 * Las cantidades tienen como mucho dos decimales: se cuenta en centésimas para que
 * 2 × 1,5 + 1 sea exactamente 4 y no 4,000000001 (que daría 5).
 */
export function cantidadPropuesta(adultos: number, ninos: number, porAdulto: number, porNino: number): number {
  const centesimas = adultos * Math.round(porAdulto * 100) + ninos * Math.round(porNino * 100);
  return Math.ceil(centesimas / 100);
}

/** Etiquetas del alimento que la cesta excluye (vacío si no choca). */
export function etiquetasEnConflicto(etiquetasAlimento: string[], exclusiones: string[]): string[] {
  const excluidas = new Set(exclusiones);
  return etiquetasAlimento.filter((e) => excluidas.has(e));
}

/** R1.1 y R1.2: la cesta que se propone a partir de una lista base. */
export function proponerCesta(familia: Familia, plantilla: ItemPlantilla[]): Propuesta {
  const propuesta: Propuesta = { items: [], quitados: [], desactivados: [] };
  for (const item of plantilla) {
    const cantidad = cantidadPropuesta(familia.adultos, familia.ninos, item.cantidad_por_adulto, item.cantidad_por_nino);
    if (cantidad <= 0) continue;
    const { id, nombre, unidad } = item.alimento;
    const conflicto = etiquetasEnConflicto(item.alimento.etiquetas, familia.exclusiones);
    if (conflicto.length) {
      propuesta.quitados.push({ alimento_id: id, nombre, unidad, etiquetas: conflicto });
    } else if (!item.alimento.activo) {
      propuesta.desactivados.push({ alimento_id: id, nombre, unidad });
    } else {
      propuesta.items.push({ alimento_id: id, cantidad });
    }
  }
  return propuesta;
}

/**
 * Alimentos de la cesta que chocan con sus exclusiones. Solo puede pasar si después de
 * crear la cesta se añade una etiqueta al alimento en el catálogo (eso no se bloquea:
 * corregir el catálogo tiene que ser posible siempre). La cesta lo avisa.
 */
export function choquesEnCesta<T extends { alimento_id: string; etiquetas: string[] }>(
  items: T[],
  exclusiones: string[],
): (T & { conflicto: string[] })[] {
  return items
    .map((i) => ({ ...i, conflicto: etiquetasEnConflicto(i.etiquetas, exclusiones) }))
    .filter((i) => i.conflicto.length > 0);
}

/** Coste de una cesta en euros, sumando en céntimos para no acumular errores. */
export function costeCesta(items: { cantidad: number; precio_unitario: number }[]): number {
  return items.reduce((total, i) => total + i.cantidad * Math.round(i.precio_unitario * 100), 0) / 100;
}

// ---------------------------------------------------------------------------
// Validación de los formularios
// ---------------------------------------------------------------------------

type Errores<C extends string> = Partial<Record<C, string>>;
type Validacion<T, C extends string> = { ok: true; datos: T } | { ok: false; errores: Errores<C> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Entero entre min y max, escrito sin decimales. null si no lo es. */
export function leerEntero(valor: unknown, min: number, max: number): number | null {
  const t = typeof valor === "string" ? valor.trim() : typeof valor === "number" ? String(valor) : "";
  if (!/^\d{1,4}$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
}

export type DatosCesta = {
  identificador_receptor: string;
  adultos: number;
  ninos: number;
  lista_base_id: string | null;
  exclusiones: string[];
};
export type CampoCesta = "identificador_receptor" | "adultos" | "ninos" | "lista_base_id";

/** Del receptor solo se guarda un identificador (RGPD). */
export function validarCesta(entrada: {
  identificador_receptor?: unknown;
  adultos?: unknown;
  ninos?: unknown;
  lista_base_id?: unknown;
  exclusiones?: unknown;
}): Validacion<DatosCesta, CampoCesta> {
  const identificador =
    typeof entrada.identificador_receptor === "string" ? entrada.identificador_receptor.trim().replace(/\s+/g, " ") : "";
  const max = LIMITES_CESTA.personas;
  const adultos = leerEntero(entrada.adultos === "" ? "0" : entrada.adultos, 0, max);
  const ninos = leerEntero(entrada.ninos === "" ? "0" : entrada.ninos, 0, max);
  const lista = typeof entrada.lista_base_id === "string" ? entrada.lista_base_id : "";
  const errores: Errores<CampoCesta> = {};

  if (!identificador) errores.identificador_receptor = "Escribe un identificador, por ejemplo «Familia 12».";
  else if (identificador.length > LIMITES_CESTA.identificador)
    errores.identificador_receptor = `Como mucho ${LIMITES_CESTA.identificador} caracteres.`;

  if (adultos === null) errores.adultos = `Escribe un número entero entre 0 y ${max}.`;
  if (ninos === null) errores.ninos = `Escribe un número entero entre 0 y ${max}.`;
  if (adultos === 0 && ninos === 0) errores.adultos = "La familia tiene que tener al menos una persona.";

  if (lista && !UUID.test(lista)) errores.lista_base_id = "Elige una lista base.";

  if (Object.keys(errores).length) return { ok: false, errores };
  const exclusiones = Array.isArray(entrada.exclusiones)
    ? [...new Set(entrada.exclusiones.filter((e): e is string => typeof e === "string" && UUID.test(e)))]
    : [];
  return {
    ok: true,
    datos: { identificador_receptor: identificador, adultos: adultos!, ninos: ninos!, lista_base_id: lista || null, exclusiones },
  };
}

/** Cantidad de un alimento añadido o cambiado a mano: unidades enteras (R1.3). */
export function validarCantidadItem(valor: unknown): { ok: true; cantidad: number } | { ok: false; error: string } {
  const cantidad = leerEntero(valor, 1, LIMITES_CESTA.cantidad);
  if (cantidad === null) return { ok: false, error: `Escribe un número entero entre 1 y ${LIMITES_CESTA.cantidad}.` };
  return { ok: true, cantidad };
}

/** "Sin cerdo y gluten", para mostrar las exclusiones de una cesta. */
export function textoSin(nombres: string[]): string {
  if (!nombres.length) return "";
  const ordenados = [...nombres].sort((a, b) => a.localeCompare(b, "es"));
  const lista =
    ordenados.length === 1 ? ordenados[0] : `${ordenados.slice(0, -1).join(", ")} y ${ordenados[ordenados.length - 1]}`;
  return `Sin ${lista}`;
}
