"use server";

import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { esAdmin } from "@/lib/rol";

export type EstadoLogin = { error?: string };

// Mensaje único para cualquier fallo: no revelamos si el correo existe
// ni si la cuenta existe pero no es de administrador.
const ERROR_ACCESO = "Correo o contraseña incorrectos.";

export async function iniciarSesion(
  _estado: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Escribe tu correo y tu contraseña." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: ERROR_ACCESO };
  }

  const { data } = await supabase.auth.getClaims();
  if (!esAdmin(data?.claims)) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: ERROR_ACCESO };
  }

  redirect("/");
}

export async function cerrarSesion() {
  const supabase = await crearClienteServidor();
  // "local": solo cierra la sesión de este navegador, no las de otros dispositivos.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
