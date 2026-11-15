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

// ---------------------------------------------------------------------------
// Fecha y hora en Madrid (plazo de confirmación de una semana).
// Se guardan como instante (timestamptz, UTC) y se escriben y muestran en hora de
// Madrid, que cambia de UTC+1 a UTC+2 en marzo y vuelve en octubre (plan §4).
// ---------------------------------------------------------------------------

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

const partesMadrid = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Fecha ("AAAA-MM-DD") y hora ("HH:MM") de Madrid de un instante. */
export function fechaHoraEnMadrid(instante: string | Date): { fecha: string; hora: string } {
  const p = Object.fromEntries(partesMadrid.formatToParts(new Date(instante)).map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

/** Minutos que Madrid va por delante de UTC en ese instante (60 o 120). */
function desfaseMadrid(ms: number): number {
  const { fecha, hora } = fechaHoraEnMadrid(new Date(ms));
  const [a, m, d] = fecha.split("-").map(Number);
  const [h, mi] = hora.split(":").map(Number);
  return Math.round((Date.UTC(a, m - 1, d, h, mi) - ms) / 60_000);
}

/**
 * Instante de una fecha y hora de Madrid ("2026-11-20", "23:59").
 * Devuelve null si el formato no es válido o si esa hora no existe en Madrid (de 2:00
 * a 2:59 del último domingo de marzo). En la hora que se repite en octubre se toma la
 * primera vez, que es la más prudente para un plazo.
 */
export function instanteDeMadrid(fecha: string, hora: string): Date | null {
  if (!esFechaValida(fecha)) return null;
  const h = HORA.exec(hora);
  if (!h) return null;
  const [a, m, d] = fecha.split("-").map(Number);
  const comoUtc = Date.UTC(a, m - 1, d, Number(h[1]), Number(h[2]));
  // El desfase de una hora antes del momento buscado: así, en la hora repetida de
  // octubre se toma la primera vez (todavía en horario de verano).
  for (const desfase of [desfaseMadrid(comoUtc - 3 * 3_600_000), desfaseMadrid(comoUtc + 3 * 3_600_000)]) {
    const instante = new Date(comoUtc - desfase * 60_000);
    const vuelta = fechaHoraEnMadrid(instante);
    if (vuelta.fecha === fecha && vuelta.hora === hora) return instante;
  }
  return null;
}

/** Instante → "20/11/2026 a las 23:59", en hora de Madrid. */
export function formatearFechaHora(instante: string | Date): string {
  const { fecha, hora } = fechaHoraEnMadrid(instante);
  return `${formatearFecha(fecha)} a las ${hora}`;
}

/** Suma días a una fecha "AAAA-MM-DD". */
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}
