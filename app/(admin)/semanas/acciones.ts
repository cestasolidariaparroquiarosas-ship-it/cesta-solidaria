"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requerirAdmin } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { validarSemana } from "@/lib/dominio/semanas";
import {
  etiquetasEnConflicto,
  proponerCesta,
  textoSin,
  validarCantidadItem,
  validarCesta,
  type DatosCesta,
} from "@/lib/dominio/cesta";
import { listarEtiquetas, obtenerAlimento } from "@/lib/servicios/catalogo";
import {
  anadirACesta,
  cambiarCantidadCesta,
  crearSemana,
  eliminarCesta,
  eliminarSemana,
  guardarCesta,
  guardarSemana,
  obtenerCesta,
  plantillaDeLista,
  quitarDeCesta,
  type ErrorSemanas,
} from "@/lib/servicios/semanas";

export type EstadoSemanas = {
  error?: string;
  errores?: Partial<Record<string, string>>;
  /** Lo enviado, para volver a mostrarlo si hay un error (React vacía el formulario). */
  valores?: Record<string, string | string[]>;
};

const GENERICOS: Record<ErrorSemanas, string> = {
  duplicado: "Ya existe.",
  en_uso: "Algo de lo elegido ya no existe. Recarga la página.",
  excluido: "Algún alimento choca con las exclusiones de la cesta.",
  no_editable: "La semana ya se ha enviado: sus cestas ya no se pueden cambiar.",
  no_encontrado: "Ya no existe. Recarga la página.",
  sin_permiso: "No tienes permiso para hacer esto.",
  desconocido: "No se ha podido guardar. Inténtalo de nuevo.",
};

function leer(formData: FormData, campos: string[]): Record<string, string> {
  return Object.fromEntries(campos.map((c) => [c, String(formData.get(c) ?? "")]));
}

function refrescarSemana(semanaId: string, ...rutas: string[]) {
  for (const ruta of ["/semanas", `/semanas/${semanaId}`, ...rutas]) revalidatePath(ruta);
}

// ---------------------------------------------------------------------------
// Semanas
// ---------------------------------------------------------------------------

const CAMPOS_SEMANA = ["fecha_entrega", "precio_base", "plazo_fecha", "plazo_hora"];

/** Alta (id nulo) o cambio de los datos de la semana (paso 1). */
export async function guardarSemanaAccion(
  id: string | null,
  _estado: EstadoSemanas,
  formData: FormData,
): Promise<EstadoSemanas> {
  await requerirAdmin();
  const valores = leer(formData, CAMPOS_SEMANA);
  const validacion = validarSemana(valores);
  if (!validacion.ok) return { errores: validacion.errores, valores };

  const cliente = await crearClienteServidor();
  const resultado =
    id === null
      ? await crearSemana(cliente, validacion.datos)
      : await guardarSemana(cliente, id, validacion.datos).then((r) => (r.ok ? { ok: true as const, valor: { id } } : r));
  if (!resultado.ok) {
    if (resultado.error === "duplicado") {
      return { errores: { fecha_entrega: "Ya hay una semana con esa fecha de entrega." }, valores };
    }
    const error =
      resultado.error === "no_editable" ? "La semana ya se ha enviado: sus datos ya no se pueden cambiar." : GENERICOS[resultado.error];
    return { error, valores };
  }
  refrescarSemana(resultado.valor.id);
  redirect(`/semanas/${resultado.valor.id}?aviso=${id === null ? "creada" : "guardada"}`);
}

export async function eliminarSemanaAccion(id: string, _estado: EstadoSemanas, formData: FormData): Promise<EstadoSemanas> {
  await requerirAdmin();
  if (formData.get("confirmar") !== "si") return { error: "Marca la casilla para confirmar." };

  const resultado = await eliminarSemana(await crearClienteServidor(), id);
  if (!resultado.ok) {
    if (resultado.error === "no_editable") return { error: "Una semana ya enviada no se puede eliminar." };
    return { error: GENERICOS[resultado.error] };
  }
  revalidatePath("/semanas");
  redirect("/semanas?aviso=eliminada");
}

// ---------------------------------------------------------------------------
// Cestas
// ---------------------------------------------------------------------------

const CAMPOS_CESTA = ["identificador_receptor", "adultos", "ninos", "lista_base_id", "recalcular"];

function leerCesta(formData: FormData) {
  const valores = { ...leer(formData, CAMPOS_CESTA), exclusiones: formData.getAll("exclusiones").map(String) };
  return { valores, entrada: valores };
}

/** R1.1 y R1.2: los alimentos que propone la lista base para esta familia. */
async function propuestaPara(
  cliente: Awaited<ReturnType<typeof crearClienteServidor>>,
  datos: DatosCesta,
): Promise<{ ok: true; items: { alimento_id: string; cantidad: number }[] } | { ok: false; error: ErrorSemanas }> {
  if (!datos.lista_base_id) return { ok: true, items: [] };
  const plantilla = await plantillaDeLista(cliente, datos.lista_base_id);
  if (!plantilla.ok) return plantilla;
  return { ok: true, items: proponerCesta(datos, plantilla.valor).items };
}

function errorCesta(error: ErrorSemanas, valores: EstadoSemanas["valores"]): EstadoSemanas {
  if (error === "excluido") {
    return {
      error: "El catálogo acaba de cambiar y algún alimento choca con las exclusiones. Vuelve a intentarlo.",
      valores,
    };
  }
  if (error === "en_uso") return { error: "La semana o la lista base ya no existen. Recarga la página.", valores };
  return { error: GENERICOS[error], valores };
}

/** Alta de una cesta con la propuesta automática (R1). */
export async function crearCestaAccion(semanaId: string, _estado: EstadoSemanas, formData: FormData): Promise<EstadoSemanas> {
  await requerirAdmin();
  const { valores, entrada } = leerCesta(formData);
  const validacion = validarCesta(entrada);
  if (!validacion.ok) return { errores: validacion.errores, valores };

  const cliente = await crearClienteServidor();
  const propuesta = await propuestaPara(cliente, validacion.datos);
  if (!propuesta.ok) return errorCesta(propuesta.error, valores);

  const resultado = await guardarCesta(cliente, { id: null, semanaId, datos: validacion.datos, items: propuesta.items });
  if (!resultado.ok) return errorCesta(resultado.error, valores);
  refrescarSemana(semanaId);
  const aviso = validacion.datos.lista_base_id ? "creada" : "creada_vacia";
  redirect(`/semanas/${semanaId}/cestas/${resultado.valor.id}?aviso=${aviso}`);
}

/**
 * Cambia los datos de la cesta. Con "recalcular", vuelve a proponer los alimentos con
 * la lista base (se pierden los cambios a mano). Sin él, se conservan, salvo los que
 * choquen con las exclusiones nuevas, que se quitan (R1.2).
 */
export async function editarCestaAccion(
  semanaId: string,
  cestaId: string,
  _estado: EstadoSemanas,
  formData: FormData,
): Promise<EstadoSemanas> {
  await requerirAdmin();
  const { valores, entrada } = leerCesta(formData);
  const validacion = validarCesta(entrada);
  if (!validacion.ok) return { errores: validacion.errores, valores };

  const cliente = await crearClienteServidor();
  let items: { alimento_id: string; cantidad: number }[] | null = null;
  if (formData.get("recalcular") === "si") {
    const propuesta = await propuestaPara(cliente, validacion.datos);
    if (!propuesta.ok) return errorCesta(propuesta.error, valores);
    items = propuesta.items;
  }

  const resultado = await guardarCesta(cliente, { id: cestaId, semanaId, datos: validacion.datos, items });
  if (!resultado.ok) return errorCesta(resultado.error, valores);
  refrescarSemana(semanaId, `/semanas/${semanaId}/cestas/${cestaId}`);
  const { quitados } = resultado.valor;
  if (items === null && quitados.length > 0) {
    // Solo ids: la página los traduce a nombres del catálogo (nunca pinta texto de la URL).
    redirect(`/semanas/${semanaId}/cestas/${cestaId}?aviso=quitados&quitados=${quitados.join(",")}`);
  }
  redirect(`/semanas/${semanaId}/cestas/${cestaId}?aviso=${items !== null ? "recalculada" : "guardada"}`);
}

export async function eliminarCestaAccion(
  semanaId: string,
  cestaId: string,
  _estado: EstadoSemanas,
  formData: FormData,
): Promise<EstadoSemanas> {
  await requerirAdmin();
  if (formData.get("confirmar") !== "si") return { error: "Marca la casilla para confirmar." };
  const resultado = await eliminarCesta(await crearClienteServidor(), semanaId, cestaId);
  if (!resultado.ok) return { error: GENERICOS[resultado.error] };
  refrescarSemana(semanaId);
  redirect(`/semanas/${semanaId}?aviso=cesta_eliminada`);
}

/** R1.3 y CA-07: añadir un alimento a mano; no se guarda si choca con las exclusiones. */
export async function anadirACestaAccion(
  semanaId: string,
  cestaId: string,
  _estado: EstadoSemanas,
  formData: FormData,
): Promise<EstadoSemanas> {
  await requerirAdmin();
  const valores = leer(formData, ["alimento_id", "cantidad"]);
  const cantidad = validarCantidadItem(valores.cantidad);
  const errores: Record<string, string> = {};
  if (!valores.alimento_id) errores.alimento_id = "Elige un alimento.";
  if (!cantidad.ok) errores.cantidad = cantidad.error;
  if (Object.keys(errores).length || !cantidad.ok) return { errores, valores };

  const cliente = await crearClienteServidor();
  const [cesta, alimento, etiquetas] = await Promise.all([
    obtenerCesta(cliente, cestaId),
    obtenerAlimento(cliente, valores.alimento_id),
    listarEtiquetas(cliente),
  ]);
  if (!cesta.ok) return { error: GENERICOS[cesta.error], valores };
  if (cesta.valor.semana.id !== semanaId) return { error: GENERICOS.no_encontrado, valores };
  if (!alimento.ok) return { errores: { alimento_id: "Ese alimento ya no existe. Recarga la página." }, valores };

  const conflicto = etiquetasEnConflicto(alimento.valor.etiquetas, cesta.valor.exclusiones);
  if (conflicto.length) {
    const nombres = etiquetas.ok ? etiquetas.valor.filter((e) => conflicto.includes(e.id)).map((e) => e.nombre) : [];
    const sin = nombres.length ? ` (${textoSin(nombres).toLowerCase()})` : "";
    return { errores: { alimento_id: `No se puede añadir: choca con las exclusiones de esta cesta${sin}.` }, valores };
  }

  const resultado = await anadirACesta(cliente, cestaId, valores.alimento_id, cantidad.cantidad);
  if (!resultado.ok) {
    if (resultado.error === "excluido") {
      return { errores: { alimento_id: "No se puede añadir: choca con las exclusiones de esta cesta." }, valores };
    }
    if (resultado.error === "duplicado") {
      return { errores: { alimento_id: "Ese alimento ya está en la cesta: cambia su cantidad." }, valores };
    }
    return { error: GENERICOS[resultado.error], valores };
  }
  refrescarSemana(semanaId, `/semanas/${semanaId}/cestas/${cestaId}`);
  redirect(`/semanas/${semanaId}/cestas/${cestaId}?aviso=anadido`);
}

export async function cambiarCantidadAccion(
  semanaId: string,
  cestaId: string,
  itemId: string,
  _estado: EstadoSemanas,
  formData: FormData,
): Promise<EstadoSemanas> {
  await requerirAdmin();
  const valores = leer(formData, ["cantidad"]);
  const cantidad = validarCantidadItem(valores.cantidad);
  if (!cantidad.ok) return { errores: { cantidad: cantidad.error }, valores };

  const resultado = await cambiarCantidadCesta(await crearClienteServidor(), cestaId, itemId, cantidad.cantidad);
  if (!resultado.ok) return { error: GENERICOS[resultado.error], valores };
  refrescarSemana(semanaId, `/semanas/${semanaId}/cestas/${cestaId}`);
  redirect(`/semanas/${semanaId}/cestas/${cestaId}?aviso=cantidad`);
}

export async function quitarDeCestaAccion(semanaId: string, cestaId: string, itemId: string): Promise<EstadoSemanas> {
  await requerirAdmin();
  const resultado = await quitarDeCesta(await crearClienteServidor(), cestaId, itemId);
  if (!resultado.ok) return { error: GENERICOS[resultado.error] };
  refrescarSemana(semanaId, `/semanas/${semanaId}/cestas/${cestaId}`);
  redirect(`/semanas/${semanaId}/cestas/${cestaId}?aviso=quitado`);
}
