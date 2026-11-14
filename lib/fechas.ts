// Fechas. Las fechas sin hora (fecha_entrega, pausado_hasta) se manejan como texto
// "AAAA-MM-DD": se comparan como texto sin problemas de zona horaria.
// "Hoy" es siempre el día en Madrid, aunque el servidor (Vercel) esté en UTC.

const ZONA = "Europe/Madrid";
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Día de hoy en Madrid, como "AAAA-MM-DD". */
export function hoyEnMadrid(ahora: Date = new Date()): string {
  // en-CA da el formato AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

/** true si el texto es una fecha real con formato AAAA-MM-DD (rechaza 2026-02-30). */
export function esFechaValida(texto: string): boolean {
  const partes = FECHA.exec(texto);
  if (!partes) return false;
  const [, a, m, d] = partes.map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d));
  return fecha.getUTCFullYear() === a && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
}

/** "2026-11-20" → "20/11/2026". */
export function formatearFecha(texto: string): string {
  const partes = FECHA.exec(texto);
  if (!partes) return texto;
  return `${partes[3]}/${partes[2]}/${partes[1]}`;
}

/** Fecha y hora (timestamptz) → "14/11/2026", en hora de Madrid. */
export function formatearDia(instante: string | Date): string {
  return formatearFecha(hoyEnMadrid(new Date(instante)));
}
