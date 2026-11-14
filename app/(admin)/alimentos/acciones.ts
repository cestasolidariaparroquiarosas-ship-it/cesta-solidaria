"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requerirAdmin } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { validarAlimento, validarEtiqueta } from "@/lib/dominio/catalogo";
import {
  crearEtiqueta,
  eliminarAlimento,
  eliminarEtiqueta,
  guardarAlimento,
  renombrarEtiqueta,
  type ErrorCatalogo,
} from "@/lib/servicios/catalogo";

export type EstadoAccion = {
  error?: string;
  errores?: Partial<Record<string, string>>;
  /** Lo enviado, para volver a mostrarlo si hay un error (React vacía el formulario). */
  valores?: { nombre?: string; unidad?: string; precio_aprox?: string; activo?: boolean; etiquetas?: string[] };
};

const GENERICOS: Record<ErrorCatalogo, string> = {
  duplicado: "Ya existe.",
  en_uso: "Está en uso.",
  no_encontrado: "Ya no existe. Recarga la página.",
  sin_permiso: "No tienes permiso para hacer esto.",
  desconocido: "No se ha podido guardar. Inténtalo de nuevo.",
};

function valoresAlimento(formData: FormData): EstadoAccion["valores"] {
  return {
    nombre: String(formData.get("nombre") ?? ""),
    unidad: String(formData.get("unidad") ?? ""),
    precio_aprox: String(formData.get("precio_aprox") ?? ""),
    activo: formData.get("activo") === "si",
    etiquetas: formData.getAll("etiquetas").map(String),
  };
}

function refrescar(...rutas: string[]) {
  for (const ruta of ["/alimentos", "/alimentos/etiquetas", "/listas", ...rutas]) revalidatePath(ruta);
}

// ---------------------------------------------------------------------------
// Alimentos
// ---------------------------------------------------------------------------

/** Alta (id nulo) o edición. `activo` solo se envía al editar; en el alta siempre es true. */
export async function guardarAlimentoAccion(
  id: string | null,
  _estado: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  await requerirAdmin();

  const validacion = validarAlimento({
    nombre: formData.get("nombre"),
    unidad: formData.get("unidad"),
    precio_aprox: formData.get("precio_aprox"),
    activo: id === null ? true : formData.get("activo") === "si",
    etiquetas: formData.getAll("etiquetas"),
  });
  if (!validacion.ok) return { errores: validacion.errores, valores: valoresAlimento(formData) };

  const resultado = await guardarAlimento(await crearClienteServidor(), id, validacion.datos);
  if (!resultado.ok) {
    if (resultado.error === "duplicado") {
      return {
        errores: { nombre: "Ya hay un alimento con ese nombre y esa unidad." },
        valores: valoresAlimento(formData),
      };
    }
    const error =
      resultado.error === "en_uso" ? "Alguna etiqueta marcada ya no existe. Recarga la página." : GENERICOS[resultado.error];
    return { error, valores: valoresAlimento(formData) };
  }

  refrescar(`/alimentos/${resultado.valor.id}`);
  redirect(id === null ? "/alimentos?aviso=creado" : `/alimentos/${id}?aviso=guardado`);
}

export async function eliminarAlimentoAccion(id: string, _estado: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  await requerirAdmin();
  if (formData.get("confirmar") !== "si") return { error: "Marca la casilla para confirmar." };

  const resultado = await eliminarAlimento(await crearClienteServidor(), id);
  if (!resultado.ok) {
    if (resultado.error === "en_uso") {
      return {
        error:
          "No se puede eliminar porque está en alguna lista base o en alguna cesta. Desactívalo: dejará de proponerse, pero el histórico se conserva.",
      };
    }
    return { error: GENERICOS[resultado.error] };
  }

  refrescar();
  redirect("/alimentos?aviso=eliminado");
}

// ---------------------------------------------------------------------------
// Etiquetas de exclusión
// ---------------------------------------------------------------------------

export async function crearEtiquetaAccion(_estado: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  await requerirAdmin();

  const validacion = validarEtiqueta({ nombre: formData.get("nombre") });
  if (!validacion.ok) return { errores: validacion.errores, valores: { nombre: String(formData.get("nombre") ?? "") } };

  const resultado = await crearEtiqueta(await crearClienteServidor(), validacion.datos);
  if (!resultado.ok) {
    if (resultado.error === "duplicado") {
      return {
        errores: { nombre: "Ya existe una etiqueta con ese nombre, o se llamó así antes de renombrarla." },
        valores: { nombre: validacion.datos.nombre },
      };
    }
    return { error: GENERICOS[resultado.error], valores: { nombre: validacion.datos.nombre } };
  }

  refrescar();
  redirect("/alimentos/etiquetas?aviso=creada");
}

export async function renombrarEtiquetaAccion(id: string, _estado: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  await requerirAdmin();

  const enviado = { nombre: String(formData.get("nombre") ?? "") };
  const validacion = validarEtiqueta({ nombre: formData.get("nombre") });
  if (!validacion.ok) return { errores: validacion.errores, valores: enviado };

  const resultado = await renombrarEtiqueta(await crearClienteServidor(), id, validacion.datos.nombre);
  if (!resultado.ok) {
    if (resultado.error === "duplicado") {
      return { errores: { nombre: "Ya hay otra etiqueta con ese nombre." }, valores: enviado };
    }
    return { error: GENERICOS[resultado.error], valores: enviado };
  }

  refrescar();
  redirect("/alimentos/etiquetas?aviso=guardada");
}

export async function eliminarEtiquetaAccion(id: string, _estado: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  await requerirAdmin();
  if (formData.get("confirmar") !== "si") return { error: "Marca «Confirmar» para eliminarla." };

  const resultado = await eliminarEtiqueta(await crearClienteServidor(), id);
  if (!resultado.ok) {
    if (resultado.error === "en_uso") {
      return { error: "No se puede eliminar: algún alimento la lleva o alguna cesta la usa como exclusión." };
    }
    return { error: GENERICOS[resultado.error] };
  }

  refrescar();
  redirect("/alimentos/etiquetas?aviso=eliminada");
}
