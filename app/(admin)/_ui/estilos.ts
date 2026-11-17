// Clases de Tailwind compartidas por las pantallas de gestión (colores: spec 0003 §2).
export const ENTRADA = "rounded-lg border border-stone-400 bg-white px-3 py-2 text-base font-normal";
export const ETIQUETA = "flex flex-col gap-1 text-sm font-medium";
export const AYUDA = "text-sm text-stone-600";
export const BOTON_PRINCIPAL =
  "inline-block rounded-lg bg-emerald-700 px-4 py-2.5 text-center font-semibold text-white hover:bg-emerald-800 disabled:opacity-60";
export const BOTON_SECUNDARIO =
  "inline-block rounded-lg border border-stone-400 bg-white px-4 py-2.5 text-center font-semibold text-stone-900 hover:bg-stone-100 disabled:opacity-60";
export const BOTON_PELIGRO =
  "inline-block rounded-lg bg-red-700 px-4 py-2.5 text-center font-semibold text-white hover:bg-red-800 disabled:opacity-60";

/** Lista dentro de una tarjeta, de borde a borde, con filas alternas. */
export const LISTA = "flex flex-col divide-y divide-stone-200 [&>li:nth-child(even)]:bg-stone-50";
/** Fila de una lista que es un enlace. */
export const FILA_ENLACE = "flex flex-col gap-1 px-4 py-3 hover:bg-emerald-50";
/** Recuadro de aviso por tipo. */
export const AVISO = {
  error: "border-red-300 bg-red-50 text-red-900",
  atencion: "border-amber-300 bg-amber-50 text-amber-950",
  info: "border-sky-200 bg-sky-50 text-sky-950",
  exito: "border-emerald-300 bg-emerald-50 text-emerald-950",
} as const;
