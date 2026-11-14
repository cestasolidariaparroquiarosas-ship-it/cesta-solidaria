// Catálogo: etiquetas de exclusión, alimentos y listas base (spec §3, base de R1).
// Lógica pura, sin base de datos.

export type Etiqueta = { id: string; codigo: string; nombre: string };

export type Alimento = {
  id: string;
  nombre: string;
  unidad: string;
  precio_aprox: number;
  activo: boolean;
  /** Ids de las etiquetas que "contiene" (cerdo, gluten...). */
  etiquetas: string[];
};

export type ListaBase = { id: string; nombre: string; predeterminada: boolean };

export type ItemLista = {
  id: string;
  alimento_id: string;
  cantidad_por_adulto: number;
  cantidad_por_nino: number;
};

export const LIMITES_CATALOGO = {
  nombreEtiqueta: 40,
  nombreAlimento: 80,
  unidad: 40,
  nombreLista: 60,
  precioMaximo: 1000,
  cantidadMaxima: 100,
} as const;

type Errores<C extends string> = Partial<Record<C, string>>;
type Validacion<T, C extends string> = { ok: true; datos: T } | { ok: false; errores: Errores<C> };

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim().replace(/\s+/g, " ") : "";
}

/**
 * Número con como mucho dos decimales, con coma o con punto ("1,25", "1.25", "3").
 * Devuelve null si no es un número válido o es negativo.
 */
export function leerDecimal(valor: unknown): number | null {
  const t = typeof valor === "string" ? valor.trim() : typeof valor === "number" ? String(valor) : "";
  if (!/^\d+([.,]\d{1,2})?$/.test(t)) return null;
  return Number(t.replace(",", "."));
}

/** "Frutos secos" → "frutos_secos". Sin tildes ni símbolos, para el campo `codigo`. */
export function codigoDe(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Etiqueta de exclusión: se nombra por lo que se excluye ("cerdo", "gluten"). */
export function validarEtiqueta(entrada: { nombre?: unknown }): Validacion<{ nombre: string; codigo: string }, "nombre"> {
  const nombre = texto(entrada.nombre).toLowerCase();
  if (!nombre) return { ok: false, errores: { nombre: "Escribe el nombre." } };
  if (nombre.length > LIMITES_CATALOGO.nombreEtiqueta)
    return { ok: false, errores: { nombre: `Como mucho ${LIMITES_CATALOGO.nombreEtiqueta} caracteres.` } };
  const codigo = codigoDe(nombre);
  if (!codigo) return { ok: false, errores: { nombre: "Usa al menos una letra o un número." } };
  return { ok: true, datos: { nombre, codigo } };
}

export type DatosAlimento = { nombre: string; unidad: string; precio_aprox: number; activo: boolean; etiquetas: string[] };
export type CampoAlimento = "nombre" | "unidad" | "precio_aprox";

export function validarAlimento(entrada: {
  nombre?: unknown;
  unidad?: unknown;
  precio_aprox?: unknown;
  activo?: unknown;
  etiquetas?: unknown;
}): Validacion<DatosAlimento, CampoAlimento> {
  const nombre = texto(entrada.nombre);
  const unidad = texto(entrada.unidad);
  const precio = leerDecimal(entrada.precio_aprox);
  const errores: Errores<CampoAlimento> = {};

  if (!nombre) errores.nombre = "Escribe el nombre.";
  else if (nombre.length > LIMITES_CATALOGO.nombreAlimento)
    errores.nombre = `Como mucho ${LIMITES_CATALOGO.nombreAlimento} caracteres.`;

  if (!unidad) errores.unidad = "Escribe la unidad (paquete 1 kg, litro, lata...).";
  else if (unidad.length > LIMITES_CATALOGO.unidad) errores.unidad = `Como mucho ${LIMITES_CATALOGO.unidad} caracteres.`;

  if (precio === null) errores.precio_aprox = "Escribe el precio en euros, por ejemplo 1,25.";
  else if (precio > LIMITES_CATALOGO.precioMaximo) errores.precio_aprox = "El precio parece demasiado alto.";

  if (Object.keys(errores).length) return { ok: false, errores };

  const etiquetas = Array.isArray(entrada.etiquetas)
    ? [...new Set(entrada.etiquetas.filter((e): e is string => typeof e === "string" && e.length > 0))]
    : [];
  return {
    ok: true,
    datos: { nombre, unidad, precio_aprox: precio!, activo: entrada.activo !== false, etiquetas },
  };
}

export function validarLista(entrada: { nombre?: unknown }): Validacion<{ nombre: string }, "nombre"> {
  const nombre = texto(entrada.nombre);
  if (!nombre) return { ok: false, errores: { nombre: "Escribe el nombre." } };
  if (nombre.length > LIMITES_CATALOGO.nombreLista)
    return { ok: false, errores: { nombre: `Como mucho ${LIMITES_CATALOGO.nombreLista} caracteres.` } };
  return { ok: true, datos: { nombre } };
}

export type CampoItem = "alimento_id" | "cantidad_por_adulto" | "cantidad_por_nino";
export type DatosItem = { cantidad_por_adulto: number; cantidad_por_nino: number };

/**
 * Cantidades de un alimento en una lista base, en unidades al mes (R1.1). Pueden ser 0
 * por adulto o por niño, pero no las dos: un alimento con 0 y 0 nunca entraría en una cesta.
 */
export function validarCantidades(entrada: {
  cantidad_por_adulto?: unknown;
  cantidad_por_nino?: unknown;
}): Validacion<DatosItem, CampoItem> {
  const adulto = leerDecimal(entrada.cantidad_por_adulto === "" ? "0" : entrada.cantidad_por_adulto);
  const nino = leerDecimal(entrada.cantidad_por_nino === "" ? "0" : entrada.cantidad_por_nino);
  const errores: Errores<CampoItem> = {};
  const max = LIMITES_CATALOGO.cantidadMaxima;

  if (adulto === null) errores.cantidad_por_adulto = "Escribe un número, por ejemplo 1,5.";
  else if (adulto > max) errores.cantidad_por_adulto = `Como mucho ${max}.`;
  if (nino === null) errores.cantidad_por_nino = "Escribe un número, por ejemplo 0,5.";
  else if (nino > max) errores.cantidad_por_nino = `Como mucho ${max}.`;

  if (!Object.keys(errores).length && adulto === 0 && nino === 0) {
    errores.cantidad_por_adulto = "Pon una cantidad por adulto, por niño o ambas.";
  }
  if (Object.keys(errores).length) return { ok: false, errores };
  return { ok: true, datos: { cantidad_por_adulto: adulto!, cantidad_por_nino: nino! } };
}

/** 1.2 → "1,20 €". */
export function formatearEuros(importe: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(importe);
}

/** 1.5 → "1,5"; 2 → "2". Para mostrar cantidades y rellenar campos. */
export function formatearCantidad(cantidad: number): string {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2, useGrouping: false }).format(cantidad);
}

/** Lo que un alimento "contiene", para mostrar: "Contiene gluten y lactosa". */
export function textoContiene(nombres: string[]): string {
  if (!nombres.length) return "";
  const ordenados = [...nombres].sort((a, b) => a.localeCompare(b, "es"));
  const lista =
    ordenados.length === 1
      ? ordenados[0]
      : `${ordenados.slice(0, -1).join(", ")} y ${ordenados[ordenados.length - 1]}`;
  return `Contiene ${lista}`;
}
