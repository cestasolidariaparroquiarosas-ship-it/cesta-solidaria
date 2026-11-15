import { timingSafeEqual } from "node:crypto";

/**
 * CA-26: la ruta del cron solo acepta la cabecera que envía Vercel,
 * "Authorization: Bearer <CRON_SECRET>". Sin secreto configurado, no acepta nada.
 * Se compara en tiempo constante para no dar pistas sobre el secreto.
 */
export function cronAutorizado(cabecera: string | null, secreto: string | undefined): boolean {
  if (!secreto || !cabecera) return false;
  const esperada = Buffer.from(`Bearer ${secreto}`);
  const recibida = Buffer.from(cabecera);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}
