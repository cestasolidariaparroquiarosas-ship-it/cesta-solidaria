"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requerirAdmin } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { costeCesta } from "@/lib/dominio/cesta";
import { esCandidato } from "@/lib/dominio/colaboradores";
import { repartir, validarMovimiento } from "@/lib/dominio/reparto";
import { seleccionar } from "@/lib/dominio/seleccion";
import { semanaEditable } from "@/lib/dominio/semanas";
import { obtenerSemana } from "@/lib/servicios/semanas";
import {
  cambiarColaborador,
  itemsDeSemana,
  listarCandidatos,
  moverEnReparto,
  proponerReparto,
  type ErrorReparto,
} from "@/lib/servicios/reparto";

export type EstadoReparto = {
  error?: string;
  errores?: Partial<Record<string, string>>;
  /** Lo enviado, para volver a mostrarlo si hay un error (React vacía el formulario). */
  valores?: Record<string, string>;
};

const MENSAJES: Record<ErrorReparto, string> = {
  duplicado: "Ese colaborador ya está en el reparto de esta semana.",
  incompleto: "Las cestas acaban de cambiar. Vuelve a proponer el reparto.",
  cantidad_insuficiente: "No lleva tantas unidades. Recarga la página.",
  mismo_colaborador: "Elige otro colaborador.",
  no_editable: "La semana ya se ha enviado: el reparto ya no se puede cambiar.",
  no_encontrado: "Ya no existe. Recarga la página.",
  sin_permiso: "No tienes permiso para hacer esto.",
  desconocido: "No se ha podido guardar. Inténtalo de nuevo.",
};

function leer(formData: FormData, campos: string[]): Record<string, string> {
  return Object.fromEntries(campos.map((c) => [c, String(formData.get(c) ?? "")]));
}

function terminar(semanaId: string, aviso: string): never {
  revalidatePath(`/semanas/${semanaId}`);
  revalidatePath(`/semanas/${semanaId}/reparto`);
  redirect(`/semanas/${semanaId}/reparto?aviso=${aviso}`);
}

/**
 * R2 + R3: elige los colaboradores y reparte todos los alimentos de las cestas.
 * Sustituye el reparto propuesto que hubiera (pide confirmación en ese caso).
 */
export async function proponerRepartoAccion(
  semanaId: string,
  _estado: EstadoReparto,
  formData: FormData,
): Promise<EstadoReparto> {
  await requerirAdmin();
  if (formData.get("confirmar") !== "si") {
    return { error: "Marca la casilla para confirmar: se pierden los cambios hechos a mano." };
  }

  const cliente = await crearClienteServidor();
  const [semana, items, candidatos] = await Promise.all([
    obtenerSemana(cliente, semanaId),
    itemsDeSemana(cliente, semanaId),
    listarCandidatos(cliente),
  ]);
  if (!semana.ok) return { error: "Ya no existe. Recarga la página." };
  if (!semanaEditable(semana.valor)) return { error: MENSAJES.no_editable };
  if (!items.ok || !candidatos.ok) return { error: MENSAJES.desconocido };

  const costeTotal = costeCesta(items.valor);
  if (items.valor.length === 0 || costeTotal === 0) {
    return { error: "Las cestas no tienen alimentos con precio: no hay nada que repartir." };
  }
  const seleccion = seleccionar(candidatos.valor, {
    fechaEntrega: semana.valor.fecha_entrega,
    costeTotal,
    precioBase: semana.valor.precio_base,
  });
  if (seleccion.elegidos.length === 0) {
    return { error: "No hay ningún colaborador disponible para esta fecha de entrega." };
  }

  const reparto = repartir(
    items.valor,
    seleccion.elegidos.map((c) => c.id),
  );
  const resultado = await proponerReparto(cliente, semanaId, reparto);
  if (!resultado.ok) return { error: MENSAJES[resultado.error] };
  terminar(semanaId, "propuesto");
}

/** R3.5: cambiar el colaborador de una asignación por otro candidato. */
export async function cambiarColaboradorAccion(
  semanaId: string,
  asignacionId: string,
  _estado: EstadoReparto,
  formData: FormData,
): Promise<EstadoReparto> {
  await requerirAdmin();
  const valores = leer(formData, ["colaborador_id"]);
  if (!valores.colaborador_id) return { errores: { colaborador_id: "Elige un colaborador." }, valores };

  const cliente = await crearClienteServidor();
  const [semana, candidatos] = await Promise.all([obtenerSemana(cliente, semanaId), listarCandidatos(cliente)]);
  if (!semana.ok) return { error: MENSAJES.no_encontrado, valores };
  if (!candidatos.ok) return { error: MENSAJES.desconocido, valores };

  // R2.3: solo un candidato para esa fecha (CA-02, CA-03).
  const nuevo = candidatos.valor.find((c) => c.id === valores.colaborador_id);
  if (!nuevo || !esCandidato(nuevo, semana.valor.fecha_entrega)) {
    return { errores: { colaborador_id: "Ese colaborador no está disponible para esta fecha." }, valores };
  }

  const resultado = await cambiarColaborador(cliente, semanaId, asignacionId, nuevo.id);
  if (!resultado.ok) {
    if (resultado.error === "duplicado") return { errores: { colaborador_id: MENSAJES.duplicado }, valores };
    return { error: MENSAJES[resultado.error], valores };
  }
  terminar(semanaId, "cambiado");
}

/** R3.5: mover unidades de un alimento a otro colaborador del reparto. */
export async function moverAccion(
  semanaId: string,
  origen: string,
  linea: { alimentoId: string; unidad: string; cantidad: number },
  _estado: EstadoReparto,
  formData: FormData,
): Promise<EstadoReparto> {
  await requerirAdmin();
  const valores = leer(formData, ["destino", "cantidad"]);
  const cantidad = validarMovimiento(valores.cantidad, linea.cantidad);
  const errores: Record<string, string> = {};
  if (!valores.destino) errores.destino = "Elige a quién.";
  if (!cantidad.ok) errores.cantidad = cantidad.error;
  if (Object.keys(errores).length || !cantidad.ok) return { errores, valores };

  const resultado = await moverEnReparto(await crearClienteServidor(), semanaId, {
    origen,
    destino: valores.destino,
    alimentoId: linea.alimentoId,
    unidad: linea.unidad,
    cantidad: cantidad.cantidad,
  });
  if (!resultado.ok) return { error: MENSAJES[resultado.error], valores };
  terminar(semanaId, resultado.valor.origenEliminado ? "movido_sale" : "movido");
}
