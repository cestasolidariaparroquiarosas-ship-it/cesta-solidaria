// Buzón de pruebas de Supabase local (Mailpit): API en MAILPIT_URL (puerto 54324).
// https://mailpit.axllent.org/docs/api-v1/

export type CorreoRecibido = {
  ID: string;
  Subject: string;
  Text: string;
  HTML: string;
  To: { Address: string }[];
  ReplyTo: { Address: string }[];
};

function base(): string {
  const url = process.env.MAILPIT_URL;
  if (!url) throw new Error("Falta MAILPIT_URL (npm run supabase:env)");
  return url.replace(/\/+$/, "");
}

/** Correos recibidos por esa dirección, completos, del más antiguo al más reciente. */
export async function correosPara(direccion: string): Promise<CorreoRecibido[]> {
  const consulta = encodeURIComponent(`to:"${direccion}"`);
  const respuesta = await fetch(`${base()}/api/v1/search?query=${consulta}&limit=50`);
  if (!respuesta.ok) throw new Error(`Mailpit respondió ${respuesta.status}`);
  const { messages } = (await respuesta.json()) as { messages: { ID: string }[] };
  const completos = await Promise.all(
    messages.map(async (m) => (await fetch(`${base()}/api/v1/message/${m.ID}`)).json() as Promise<CorreoRecibido>),
  );
  return completos.reverse();
}

/** El enlace de un correo que empieza por `prefijo` (por ejemplo, "http://localhost:3000/r/"). */
export function enlace(correo: CorreoRecibido, contiene: string): string {
  const encontrado = correo.Text.match(/https?:\/\/\S+/g)?.find((u) => u.includes(contiene));
  if (!encontrado) throw new Error(`No hay ningún enlace con "${contiene}" en el correo`);
  return encontrado;
}
