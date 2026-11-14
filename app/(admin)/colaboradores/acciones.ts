"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requerirAdmin } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { hoyEnMadrid } from "@/lib/fechas";
import {
  validarDatosColaborador,
  validarPausa,
  type CampoColaborador,
  type Errores,
} from "@/lib/dominio/colaboradores";
import {
  actualizarDatosColaborador,
  cambiarEstadoColaborador,
  crearColaborador,
  eliminarColaborador,
  type ErrorColaborador,
} from "@/lib/servicios/colaboradores";

export type EstadoFormulario = {
  error?: string;
  errores?: Errores<CampoColaborador | "pausado_hasta">;
  /**
   * Lo que se envió, para volver a mostrarlo si hay un error: React vacía el
   * formulario después de cada envío.
   */
  valores?: { nombre: string; email: string; notas: string; consentimiento: boolean };
};

function valoresDe(formData: FormData): EstadoFormulario["valores"] {
  const texto = (campo: string) => String(formData.get(campo) ?? "");
  return {
    nombre: texto("nombre"),
    email: texto("email"),
    notas: texto("notas"),
    consentimiento: formData.get("consentimiento") === "si",
  };
}

const MENSAJES: Record<ErrorColaborador, string> = {
  email_repetido: "Ya hay un colaborador con ese correo. No se ha guardado.",
  no_encontrado: "Ese colaborador ya no existe.",
  asignacion_en_curso:
    "Tiene alimentos asignados en una semana en curso. Cámbialo por otro colaborador en el reparto de esa semana y vuelve a intentarlo.",
  sin_permiso: "No tienes permiso para hacer esto.",
  desconocido: "No se ha podido guardar. Inténtalo de nuevo.",
};

function errorDe(error: ErrorColaborador): EstadoFormulario {
  // CA-01: el correo repetido se muestra junto al campo.
  if (error === "email_repetido") return { errores: { email: MENSAJES.email_repetido } };
  return { error: MENSAJES[error] };
}

/**
 * Tras un cambio que sale bien se vuelve a la ficha con un aviso (lo muestra la página
 * con role="status"). No se devuelve un mensaje en el estado del formulario: al
 * cambiar la ficha, el formulario que lanzó la acción se desmonta y lo perdería.
 */
function volverAFicha(id: string, aviso: "guardado" | "pausado" | "activo" | "baja"): never {
  revalidatePath("/colaboradores");
  revalidatePath(`/colaboradores/${id}`);
  redirect(`/colaboradores/${id}?aviso=${aviso}`);
}

export async function crearColaboradorAccion(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await requerirAdmin();

  const validacion = validarDatosColaborador(Object.fromEntries(formData));
  const consentimiento = formData.get("consentimiento") === "si";
  if (!validacion.ok || !consentimiento) {
    return {
      valores: valoresDe(formData),
      errores: {
        ...(validacion.ok ? {} : validacion.errores),
        ...(consentimiento ? {} : { consentimiento: "Hace falta su consentimiento para guardar sus datos." }),
      },
    };
  }

  const resultado = await crearColaborador(await crearClienteServidor(), validacion.datos);
  if (!resultado.ok) return { ...errorDe(resultado.error), valores: valoresDe(formData) };

  revalidatePath("/colaboradores");
  redirect("/colaboradores?aviso=creado");
}

export async function guardarDatosAccion(
  id: string,
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await requerirAdmin();

  const validacion = validarDatosColaborador(Object.fromEntries(formData));
  if (!validacion.ok) return { errores: validacion.errores, valores: valoresDe(formData) };

  const resultado = await actualizarDatosColaborador(await crearClienteServidor(), id, validacion.datos, {
    registrarConsentimiento: formData.get("consentimiento") === "si",
  });
  if (!resultado.ok) return { ...errorDe(resultado.error), valores: valoresDe(formData) };

  volverAFicha(id, "guardado");
}

export async function pausarAccion(
  id: string,
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await requerirAdmin();

  const pausa = validarPausa(formData.get("pausado_hasta"), hoyEnMadrid());
  if (!pausa.ok) return { errores: { pausado_hasta: pausa.error } };

  const resultado = await cambiarEstadoColaborador(await crearClienteServidor(), id, {
    estado: "pausado",
    pausadoHasta: pausa.pausadoHasta,
  });
  if (!resultado.ok) return errorDe(resultado.error);

  volverAFicha(id, "pausado");
}

export async function reactivarAccion(id: string): Promise<EstadoFormulario> {
  await requerirAdmin();
  const resultado = await cambiarEstadoColaborador(await crearClienteServidor(), id, { estado: "activo" });
  if (!resultado.ok) return errorDe(resultado.error);
  volverAFicha(id, "activo");
}

export async function darDeBajaAccion(id: string): Promise<EstadoFormulario> {
  await requerirAdmin();
  const resultado = await cambiarEstadoColaborador(await crearClienteServidor(), id, { estado: "baja" });
  if (!resultado.ok) return errorDe(resultado.error);
  volverAFicha(id, "baja");
}

export async function eliminarAccion(
  id: string,
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  await requerirAdmin();

  if (formData.get("confirmar") !== "si") {
    return { error: "Marca la casilla para confirmar que quieres borrar sus datos." };
  }

  const resultado = await eliminarColaborador(await crearClienteServidor(), id);
  if (!resultado.ok) return errorDe(resultado.error);

  revalidatePath("/colaboradores");
  redirect("/colaboradores?aviso=eliminado");
}
