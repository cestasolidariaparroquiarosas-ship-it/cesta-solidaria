"use server";

import { requerirAdmin } from "@/lib/auth";
import { correoPrueba } from "@/lib/correo/plantillas";
import { conCorreo, ErrorEnvio } from "@/lib/correo/transporte";

export type EstadoPrueba = { ok?: boolean; error?: string };

/** Envía un correo de prueba al administrador (ADMIN_EMAIL) para comprobar el SMTP. */
export async function probarCorreoAccion(): Promise<EstadoPrueba> {
  await requerirAdmin();
  try {
    await conCorreo((correo) => correo.enviar(correo.admin, correoPrueba()));
    return { ok: true };
  } catch (e) {
    const codigo = e instanceof ErrorEnvio ? e.codigo : "configuración incompleta";
    // 535 = usuario o contraseña rechazados: casi siempre, la contraseña de aplicación.
    const pista =
      codigo === "535"
        ? " Gmail no acepta el usuario o la contraseña: revisa SMTP_USER y la contraseña de aplicación (SMTP_PASS)."
        : "";
    return { error: `No se ha podido enviar (código ${codigo}).${pista}` };
  }
}
