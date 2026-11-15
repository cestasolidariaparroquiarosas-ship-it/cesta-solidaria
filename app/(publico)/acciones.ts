"use server";

// Acciones de las páginas públicas. No hay sesión: lo único que autoriza es el token
// (32 bytes aleatorios), que se comprueba antes de tocar la base de datos.

import { redirect } from "next/navigation";
import { conCorreo } from "@/lib/correo/transporte";
import { urlApp } from "@/lib/env";
import { leerRespuesta, tokenValido } from "@/lib/dominio/respuestas";
import { crearClienteServicio } from "@/lib/supabase/servicio";
import { darDeBaja, responder } from "@/lib/servicios/respuestas";

/** R4.2: solo cuenta pulsar el botón (POST), nunca abrir el enlace (CA-15). */
export async function responderAccion(token: string, respuesta: string): Promise<void> {
  const r = leerRespuesta(respuesta);
  if (!tokenValido(token) || !r) redirect("/r/enlace-no-valido");

  const resultado = await conCorreo((correo) => responder(crearClienteServicio(), token, r, correo, urlApp()));
  // Si ya había respondido o el plazo terminó, la página lo explica (CA-19).
  redirect(resultado === "confirmada" || resultado === "rechazada" ? `/r/${token}?hecho=${r}` : `/r/${token}`);
}

/** R5.1 (CA-22): baja tras confirmar en la página. */
export async function darDeBajaAccion(token: string): Promise<void> {
  if (!tokenValido(token)) redirect("/baja/enlace-no-valido");
  await conCorreo((correo) => darDeBaja(crearClienteServicio(), token, correo, urlApp()));
  redirect(`/baja/${token}?hecho=1`);
}
