import { createClient } from "@supabase/supabase-js";

const opciones = { auth: { persistSession: false, autoRefreshToken: false } };

/** Cliente sin sesión, como un visitante cualquiera. */
export function clienteAnonimo() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    opciones,
  );
}

/** Cliente con la clave secreta: solo para preparar datos de prueba. */
export function clienteServicio() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    opciones,
  );
}

export const ADMIN_PRUEBAS = {
  email: "admin@cesta.test",
  password: "Contrasena-de-pruebas-1",
};

/** Usuario con cuenta pero SIN rol de administrador. */
export const SIN_ROL_PRUEBAS = {
  email: "sin-rol@cesta.test",
  password: "Contrasena-de-pruebas-2",
};

async function asegurarUsuario(
  credenciales: { email: string; password: string },
  appMetadata: Record<string, unknown>,
) {
  const servicio = clienteServicio();
  const { error } = await servicio.auth.admin.createUser({
    ...credenciales,
    email_confirm: true,
    app_metadata: appMetadata,
  });
  if (error && !/already|registered|exists/i.test(error.message)) {
    throw error;
  }
}

/** Cliente con la sesión iniciada de un usuario de pruebas. */
export async function clienteConSesion(credenciales: { email: string; password: string }) {
  const cliente = clienteAnonimo();
  const { error } = await cliente.auth.signInWithPassword(credenciales);
  if (error) throw error;
  return cliente;
}

/** Crea (o deja como están) el administrador y el usuario sin rol de pruebas. */
export async function asegurarUsuariosPruebas() {
  await asegurarUsuario(ADMIN_PRUEBAS, { rol: "admin" });
  await asegurarUsuario(SIN_ROL_PRUEBAS, {});
}
