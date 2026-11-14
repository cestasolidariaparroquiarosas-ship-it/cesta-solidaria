"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requerirAdmin } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { validarCantidades, validarLista } from "@/lib/dominio/catalogo";
import {
  anadirALista,
  cambiarCantidades,
  crearLista,
  eliminarLista,
  marcarListaPredeterminada,
  quitarDeLista,
  renombrarLista,
  type ErrorCatalogo,
} from "@/lib/servicios/catalogo";

export type EstadoLista = {
  error?: string;
  errores?: Partial<Record<string, string>>;
  valores?: Record<string, string>;
};

const GENERICOS: Record<ErrorCatalogo, string> = {
  duplicado: "Ya existe.",
  en_uso: "Ese alimento o esa lista ya no existen. Recarga la página.",
  no_encontrado: "Ya no existe. Recarga la página.",
  sin_permiso: "No tienes permiso para hacer esto.",
  desconocido: "No se ha podido guardar. Inténtalo de nuevo.",
};

function aFicha(id: string, aviso: string): never {
  revalidatePath("/listas");
  revalidatePath(`/listas/${id}`);
  redirect(`/listas/${id}?aviso=${aviso}`);
}

function valores(formData: FormData, campos: string[]): Record<string, string> {
  return Object.fromEntries(campos.map((c) => [c, String(formData.get(c) ?? "")]));
}

export async function crearListaAccion(_estado: EstadoLista, formData: FormData): Promise<EstadoLista> {
  await requerirAdmin();
  const validacion = validarLista({ nombre: formData.get("nombre") });
  if (!validacion.ok) return { errores: validacion.errores, valores: valores(formData, ["nombre"]) };

  const resultado = await crearLista(await crearClienteServidor(), validacion.datos.nombre);
  if (!resultado.ok) {
    if (resultado.error === "duplicado") {
      return { errores: { nombre: "Ya hay una lista con ese nombre." }, valores: valores(formData, ["nombre"]) };
    }
    return { error: GENERICOS[resultado.error] };
  }
  aFicha(resultado.valor.id, "creada");
}

export async function renombrarListaAccion(id: string, _estado: EstadoLista, formData: FormData): Promise<EstadoLista> {
  await requerirAdmin();
  const validacion = validarLista({ nombre: formData.get("nombre") });
  if (!validacion.ok) return { errores: validacion.errores, valores: valores(formData, ["nombre"]) };

  const resultado = await renombrarLista(await crearClienteServidor(), id, validacion.datos.nombre);
  if (!resultado.ok) {
    if (resultado.error === "duplicado") {
      return { errores: { nombre: "Ya hay una lista con ese nombre." }, valores: valores(formData, ["nombre"]) };
    }
    return { error: GENERICOS[resultado.error] };
  }
  aFicha(id, "guardada");
}

export async function marcarPredeterminadaAccion(id: string): Promise<EstadoLista> {
  await requerirAdmin();
  const resultado = await marcarListaPredeterminada(await crearClienteServidor(), id);
  if (!resultado.ok) return { error: GENERICOS[resultado.error] };
  aFicha(id, "predeterminada");
}

export async function eliminarListaAccion(id: string, _estado: EstadoLista, formData: FormData): Promise<EstadoLista> {
  await requerirAdmin();
  if (formData.get("confirmar") !== "si") return { error: "Marca la casilla para confirmar." };

  const resultado = await eliminarLista(await crearClienteServidor(), id);
  if (!resultado.ok) return { error: GENERICOS[resultado.error] };
  revalidatePath("/listas");
  redirect("/listas?aviso=eliminada");
}

const CAMPOS_ITEM = ["alimento_id", "cantidad_por_adulto", "cantidad_por_nino"];

export async function anadirAlimentoAccion(listaId: string, _estado: EstadoLista, formData: FormData): Promise<EstadoLista> {
  await requerirAdmin();
  const alimentoId = String(formData.get("alimento_id") ?? "");
  const validacion = validarCantidades({
    cantidad_por_adulto: formData.get("cantidad_por_adulto"),
    cantidad_por_nino: formData.get("cantidad_por_nino"),
  });
  const errores = validacion.ok ? {} : { ...validacion.errores };
  if (!alimentoId) errores.alimento_id = "Elige un alimento.";
  if (!validacion.ok || !alimentoId) return { errores, valores: valores(formData, CAMPOS_ITEM) };

  const resultado = await anadirALista(await crearClienteServidor(), listaId, alimentoId, validacion.datos);
  if (!resultado.ok) {
    if (resultado.error === "duplicado") {
      return { errores: { alimento_id: "Ese alimento ya está en la lista." }, valores: valores(formData, CAMPOS_ITEM) };
    }
    return { error: GENERICOS[resultado.error] };
  }
  aFicha(listaId, "anadido");
}

export async function cambiarCantidadesAccion(
  listaId: string,
  itemId: string,
  _estado: EstadoLista,
  formData: FormData,
): Promise<EstadoLista> {
  await requerirAdmin();
  const validacion = validarCantidades({
    cantidad_por_adulto: formData.get("cantidad_por_adulto"),
    cantidad_por_nino: formData.get("cantidad_por_nino"),
  });
  if (!validacion.ok) return { errores: validacion.errores, valores: valores(formData, CAMPOS_ITEM) };

  const resultado = await cambiarCantidades(await crearClienteServidor(), itemId, validacion.datos);
  if (!resultado.ok) return { error: GENERICOS[resultado.error] };
  aFicha(listaId, "cantidades");
}

export async function quitarAlimentoAccion(listaId: string, itemId: string): Promise<EstadoLista> {
  await requerirAdmin();
  const resultado = await quitarDeLista(await crearClienteServidor(), itemId);
  if (!resultado.ok) return { error: GENERICOS[resultado.error] };
  aFicha(listaId, "quitado");
}
