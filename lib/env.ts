// Lectura centralizada de variables de entorno. Falla pronto y con un mensaje claro
// si falta alguna, en lugar de producir errores confusos más adelante.

function requerida(nombre: string, valor: string | undefined): string {
  if (!valor) {
    throw new Error(`Falta la variable de entorno ${nombre}`);
  }
  return valor;
}

// Las variables NEXT_PUBLIC_* deben leerse de forma literal para que Next.js
// las incluya en el código del navegador.
export function supabasePublico() {
  return {
    url: requerida("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    clave: requerida(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  };
}

// ---------------------------------------------------------------------------
// Solo en el servidor (no llevan NEXT_PUBLIC_): nunca llegan al navegador.
// ---------------------------------------------------------------------------

/** Clave secreta de Supabase: salta la RLS. Solo para lib/supabase/servicio.ts. */
export function claveSecretaSupabase(): string {
  return requerida("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);
}

export type ConfigCorreo = {
  host: string;
  port: number;
  secure: boolean;
  /** Vacíos en local y en CI: Mailpit no pide usuario. */
  user: string;
  pass: string;
  /** Dirección del remitente: la cuenta de Gmail de la cesta (o una de pruebas). */
  remitente: string;
  /** "Responder a" de los correos y destino de los avisos (R4.6, R4.7). */
  admin: string;
};

export function configCorreo(): ConfigCorreo {
  const user = process.env.SMTP_USER ?? "";
  const admin = requerida("ADMIN_EMAIL", process.env.ADMIN_EMAIL);
  return {
    host: requerida("SMTP_HOST", process.env.SMTP_HOST),
    port: Number(requerida("SMTP_PORT", process.env.SMTP_PORT)),
    secure: process.env.SMTP_SECURE === "true",
    user,
    pass: process.env.SMTP_PASS ?? "",
    remitente: user || "cesta@cesta.test",
    admin,
  };
}

/**
 * Dirección pública de la app, para los enlaces de los correos. En producción,
 * APP_URL. En las vistas previas de Vercel, que cambian de dirección en cada
 * despliegue, la que pone Vercel (VERCEL_URL, sin https://).
 */
export function urlApp(): string {
  const url = process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);
  return requerida("APP_URL", url).replace(/\/+$/, "");
}
