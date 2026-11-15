"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requerirAdmin } from "@/lib/auth";
import { conCorreo } from "@/lib/correo/transporte";
import { urlApp } from "@/lib/env";
import { crearClienteServidor } from "@/lib/supabase/server";
import { enviarPendientes, enviarSemana, type ErrorEnvioSemana } from "@/lib/servicios/envio";
import { buscarSustituto } from "@/lib/servicios/respuestas";

export type EstadoEnvio = { error?: string };

const MENSAJES: Record<ErrorEnvioSemana, string> = {
  sin_reparto: "Primero prepara el reparto.",
  plazo_vencido: "El plazo para responder ya ha pasado: cámbialo en los datos de la semana antes de enviar.",
  colaborador_no_disponible:
    "Algún colaborador del reparto ya no está disponible (de baja o en pausa): cámbialo en el reparto antes de enviar.",
  incompleto: "El reparto no cubre todos los alimentos de las cestas. Vuelve a proponerlo.",
  no_editable: "La semana ya se ha enviado.",
  no_enviada: "La semana todavía no se ha enviado.",
  nada_que_cubrir: "Esos alimentos ya tienen quien los lleve. Recarga la página.",
  no_encontrado: "Ya no existe. Recarga la página.",
  sin_permiso: "No tienes permiso para hacer esto.",
  desconocido: "No se ha podido hacer. Inténtalo de nuevo.",
};

function terminar(semanaId: string, aviso: string): never {
  revalidatePath(`/semanas/${semanaId}`);
  revalidatePath(`/semanas/${semanaId}/reparto`);
  revalidatePath("/semanas");
  redirect(`/semanas/${semanaId}?aviso=${aviso}#envio`);
}

/** R4.1 (CA-14): envía la semana. Pide confirmación: después ya no se puede cambiar nada. */
export async function enviarSemanaAccion(semanaId: string, _estado: EstadoEnvio, formData: FormData): Promise<EstadoEnvio> {
  await requerirAdmin();
  if (formData.get("confirmar") !== "si") return { error: "Marca la casilla para confirmar." };

  const cliente = await crearClienteServidor();
  const resultado = await conCorreo((correo) => enviarSemana(cliente, semanaId, correo, urlApp()));
  if (!resultado.ok) return { error: MENSAJES[resultado.error] };
  terminar(semanaId, resultado.valor.fallidos > 0 ? "enviada_con_fallos" : "enviada");
}

/** Vuelve a intentar los correos que no se pudieron enviar. */
export async function reenviarAccion(semanaId: string): Promise<EstadoEnvio> {
  await requerirAdmin();
  const cliente = await crearClienteServidor();
  const resultado = await conCorreo((correo) => enviarPendientes(cliente, semanaId, correo, urlApp()));
  if (!resultado.ok) return { error: MENSAJES[resultado.error] };
  terminar(semanaId, resultado.valor.fallidos > 0 ? "reenvio_con_fallos" : "reenviados");
}

/** R4.6: buscar a alguien para unos alimentos que se quedaron sin cubrir. */
export async function buscarSustitutoAccion(semanaId: string, asignacionId: string): Promise<EstadoEnvio> {
  await requerirAdmin();
  const cliente = await crearClienteServidor();
  const resultado = await conCorreo((correo) => buscarSustituto(cliente, semanaId, asignacionId, correo, urlApp()));
  if (!resultado.ok) return { error: MENSAJES[resultado.error] };
  if (!resultado.valor.encontrado) {
    return {
      error: resultado.valor.sinTiempo
        ? "Ya no hay tiempo para pedírselo a nadie antes de la entrega."
        : "Sigue sin haber ningún colaborador disponible. Puedes dar de alta a alguien o reactivar a quien esté en pausa.",
    };
  }
  terminar(semanaId, "sustituto");
}
