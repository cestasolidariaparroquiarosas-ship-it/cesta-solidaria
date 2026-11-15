// Textos de los correos (R4.1, R4.6). Lógica pura: reciben los datos y devuelven el
// asunto y el cuerpo en texto y en HTML. Quién los envía está en ./transporte.ts.

import { formatearEuros } from "@/lib/dominio/catalogo";
import { nombreDePila } from "@/lib/dominio/respuestas";
import { formatearFecha, formatearFechaHora, formatearFechaLarga } from "@/lib/fechas";

export type Mensaje = { asunto: string; texto: string; html: string };

export type LineaCorreo = { cantidad: number; nombre: string; unidad: string };

/** Escapa lo que va dentro del HTML: los nombres los escribe el administrador. */
function e(texto: string): string {
  return texto
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const linea = (l: LineaCorreo) => `${l.cantidad} × ${l.nombre} (${l.unidad})`;

const ESTILO_BOTON =
  "display:inline-block;padding:10px 16px;margin:4px 8px 4px 0;border-radius:6px;text-decoration:none;font-weight:600;";

/** R4.1: pie con la información de protección de datos y el enlace de baja. */
export const PIE_PROTECCION_DATOS =
  "Protección de datos: recibes este correo porque colaboras con la cesta solidaria de la parroquia. " +
  "Solo guardamos tu nombre y tu correo para organizar las entregas, y no los compartimos con nadie.";

function pie(urlBaja: string): { texto: string; html: string } {
  return {
    texto: `--\n${PIE_PROTECCION_DATOS}\nSi no quieres recibir más correos, date de baja aquí: ${urlBaja}`,
    html:
      `<hr style="margin-top:24px;border:none;border-top:1px solid #ddd">` +
      `<p style="font-size:12px;color:#666">${e(PIE_PROTECCION_DATOS)} ` +
      `Si no quieres recibir más correos, <a href="${e(urlBaja)}">date de baja aquí</a>.</p>`,
  };
}

/**
 * R4.1 (CA-14): lo que tiene que llevar un colaborador, el plazo, los dos enlaces y el
 * pie de protección de datos. `urlRespuesta` es /r/<token>; los enlaces solo abren la
 * página, y la respuesta cuenta al pulsar el botón de allí (R4.2, CA-15).
 */
export function correoAsignacion(d: {
  nombre: string | null;
  fechaEntrega: string;
  plazo: string;
  lineas: LineaCorreo[];
  gasto: number;
  urlRespuesta: string;
  urlBaja: string;
  /** Viene de una reasignación: otra persona no podía (R4.4). */
  sustitucion: boolean;
}): Mensaje {
  const dia = formatearFechaLarga(d.fechaEntrega);
  const fecha = formatearFecha(d.fechaEntrega);
  const plazo = formatearFechaHora(d.plazo);
  const si = `${d.urlRespuesta}?respuesta=si`;
  const no = `${d.urlRespuesta}?respuesta=no`;
  const hola = `Hola, ${nombreDePila(d.nombre)}:`;
  const intro = d.sustitucion
    ? `Otra persona no puede llevar estos alimentos a la cesta solidaria. ¿Podrías llevarlos tú el ${dia} (${fecha})?`
    : `Para la cesta solidaria del ${dia} (${fecha}), te pedimos que lleves:`;
  const p = pie(d.urlBaja);

  const texto = [
    hola,
    "",
    intro,
    "",
    ...d.lineas.map((l) => `- ${linea(l)}`),
    "",
    `Gasto aproximado: ${formatearEuros(d.gasto)}.`,
    "",
    `Por favor, responde antes del ${plazo}:`,
    `- Puedo llevarlo: ${si}`,
    `- No puedo esta vez: ${no}`,
    "",
    "Al abrir el enlace verás un resumen y un botón para confirmar tu respuesta.",
    "Si lo prefieres, también puedes contestar a este correo.",
    "",
    "¡Gracias!",
    "",
    p.texto,
  ].join("\n");

  const html = [
    `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#1c1917;max-width:560px">`,
    `<p>${e(hola)}</p>`,
    `<p>${e(intro)}</p>`,
    `<ul>${d.lineas.map((l) => `<li>${e(linea(l))}</li>`).join("")}</ul>`,
    `<p>Gasto aproximado: ${e(formatearEuros(d.gasto))}.</p>`,
    `<p>Por favor, responde antes del <strong>${e(plazo)}</strong>:</p>`,
    `<p><a href="${e(si)}" style="${ESTILO_BOTON}background:#047857;color:#fff">Puedo llevarlo</a>`,
    `<a href="${e(no)}" style="${ESTILO_BOTON}background:#e7e5e4;color:#1c1917">No puedo esta vez</a></p>`,
    `<p style="font-size:14px;color:#57534e">Al abrir el enlace verás un resumen y un botón para confirmar tu respuesta. ` +
      `Si lo prefieres, también puedes contestar a este correo.</p>`,
    `<p>¡Gracias!</p>`,
    p.html,
    `</div>`,
  ].join("\n");

  return { asunto: `Cesta solidaria: ¿puedes llevar alimentos el ${fecha}?`, texto, html };
}

/**
 * R4.6 (CA-21): aviso al administrador cuando unos alimentos se quedan sin nadie.
 * Sin nombres ni correos: el detalle está en la app.
 */
export function correoSinSustituto(d: {
  fechaEntrega: string;
  motivo: "sin_candidatos" | "sin_tiempo";
  lineas: LineaCorreo[];
  urlSemana: string;
}): Mensaje {
  const fecha = formatearFecha(d.fechaEntrega);
  const motivo =
    d.motivo === "sin_candidatos"
      ? "Un colaborador no puede llevar sus alimentos y no queda ningún otro colaborador disponible."
      : "Un colaborador no puede llevar sus alimentos y ya no hay tiempo para pedírselo a otro antes de la entrega.";
  const texto = [
    `${motivo}`,
    "",
    `Entrega del ${fecha}. Alimentos sin cubrir:`,
    ...d.lineas.map((l) => `- ${linea(l)}`),
    "",
    `Puedes verlo y buscar un sustituto en la app: ${d.urlSemana}`,
  ].join("\n");
  const html = [
    `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5">`,
    `<p>${e(motivo)}</p>`,
    `<p>Entrega del ${e(fecha)}. Alimentos sin cubrir:</p>`,
    `<ul>${d.lineas.map((l) => `<li>${e(linea(l))}</li>`).join("")}</ul>`,
    `<p><a href="${e(d.urlSemana)}">Verlo en la app</a></p>`,
    `</div>`,
  ].join("\n");
  return { asunto: `Cesta solidaria: alimentos sin cubrir para el ${fecha}`, texto, html };
}

/** Para comprobar desde la app que el correo está bien configurado. */
export function correoPrueba(): Mensaje {
  const texto = "Este es un correo de prueba de la app de la cesta solidaria. Si lo recibes, el envío funciona.";
  return { asunto: "Cesta solidaria: correo de prueba", texto, html: `<p>${e(texto)}</p>` };
}
