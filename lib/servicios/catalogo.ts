// Catálogo en la base de datos: etiquetas, alimentos y listas base (plan PR 3).
//
// Como en colaboradores: cada función recibe el cliente de quien hace la petición y la
// Row Level Security decide. Los errores se tratan por `code` y nunca se registran enteros.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Alimento,
  DatosAlimento,
  DatosItem,
  Etiqueta,
  ItemLista,
  ListaBase,
} from "@/lib/dominio/catalogo";

export type ErrorCatalogo = "duplicado" | "en_uso" | "no_encontrado" | "sin_permiso" | "desconocido";
export type Resultado<T = void> = { ok: true; valor: T } | { ok: false; error: ErrorCatalogo };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ok = <T>(valor: T): Resultado<T> => ({ ok: true, valor });
const fallo = (error: ErrorCatalogo): Resultado<never> => ({ ok: false, error });

function traducirError(error: { code?: string } | null): ErrorCatalogo {
  switch (error?.code) {
    case "23505":
      return "duplicado";
    case "23503":
      return "en_uso";
    case "P0002":
    case "PGRST116":
      return "no_encontrado";
    case "42501":
      return "sin_permiso";
    default:
      console.error(`Error de base de datos en el catálogo (código ${error?.code ?? "?"})`);
      return "desconocido";
  }
}

/** Un UPDATE o DELETE que no cambia ninguna fila: no existe o la RLS no deja verla. */
async function cambiarUna(
  consulta: PromiseLike<{ count: number | null; error: { code?: string } | null }>,
): Promise<Resultado> {
  const { count, error } = await consulta;
  if (error) return fallo(traducirError(error));
  if (!count) return fallo("no_encontrado");
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Etiquetas de exclusión
// ---------------------------------------------------------------------------

export type EtiquetaConUso = Etiqueta & { alimentos: number };

export async function listarEtiquetas(cliente: SupabaseClient): Promise<Resultado<EtiquetaConUso[]>> {
  const { data, error } = await cliente
    .from("etiquetas_exclusion")
    .select("id, codigo, nombre, alimento_etiquetas(count)")
    .order("nombre");
  if (error) return fallo(traducirError(error));
  return ok(
    (data as unknown as (Etiqueta & { alimento_etiquetas: { count: number }[] })[]).map((e) => ({
      id: e.id,
      codigo: e.codigo,
      nombre: e.nombre,
      alimentos: e.alimento_etiquetas[0]?.count ?? 0,
    })),
  );
}

export async function crearEtiqueta(
  cliente: SupabaseClient,
  datos: { nombre: string; codigo: string },
): Promise<Resultado<{ id: string }>> {
  const { data, error } = await cliente.from("etiquetas_exclusion").insert(datos).select("id").single();
  if (error) return fallo(traducirError(error));
  return ok({ id: data.id as string });
}

/** Solo cambia el nombre visible; el código se mantiene para no romper nada. */
export async function renombrarEtiqueta(cliente: SupabaseClient, id: string, nombre: string): Promise<Resultado> {
  if (!UUID.test(id)) return fallo("no_encontrado");
  return cambiarUna(cliente.from("etiquetas_exclusion").update({ nombre }, { count: "exact" }).eq("id", id));
}

/** Falla con "en_uso" si algún alimento o cesta la usa (clave ajena ON DELETE RESTRICT). */
export async function eliminarEtiqueta(cliente: SupabaseClient, id: string): Promise<Resultado> {
  if (!UUID.test(id)) return fallo("no_encontrado");
  return cambiarUna(cliente.from("etiquetas_exclusion").delete({ count: "exact" }).eq("id", id));
}

// ---------------------------------------------------------------------------
// Alimentos
// ---------------------------------------------------------------------------

type FilaAlimento = Omit<Alimento, "etiquetas"> & { alimento_etiquetas: { etiqueta_id: string }[] };
const COLUMNAS_ALIMENTO = "id, nombre, unidad, precio_aprox, activo, alimento_etiquetas(etiqueta_id)";

function aAlimento(f: FilaAlimento): Alimento {
  return {
    id: f.id,
    nombre: f.nombre,
    unidad: f.unidad,
    precio_aprox: Number(f.precio_aprox),
    activo: f.activo,
    etiquetas: f.alimento_etiquetas.map((e) => e.etiqueta_id),
  };
}

export async function listarAlimentos(
  cliente: SupabaseClient,
  { incluirInactivos = false }: { incluirInactivos?: boolean } = {},
): Promise<Resultado<Alimento[]>> {
  let consulta = cliente.from("alimentos").select(COLUMNAS_ALIMENTO).order("nombre").order("unidad");
  if (!incluirInactivos) consulta = consulta.eq("activo", true);
  const { data, error } = await consulta;
  if (error) return fallo(traducirError(error));
  return ok((data as unknown as FilaAlimento[]).map(aAlimento));
}

export async function obtenerAlimento(cliente: SupabaseClient, id: string): Promise<Resultado<Alimento>> {
  if (!UUID.test(id)) return fallo("no_encontrado");
  const { data, error } = await cliente.from("alimentos").select(COLUMNAS_ALIMENTO).eq("id", id).maybeSingle();
  if (error) return fallo(traducirError(error));
  if (!data) return fallo("no_encontrado");
  return ok(aAlimento(data as unknown as FilaAlimento));
}

/**
 * Alta (id nulo) o edición, con sus etiquetas, en una sola transacción
 * (función SQL guardar_alimento). Un nombre y unidad repetidos dan "duplicado".
 */
export async function guardarAlimento(
  cliente: SupabaseClient,
  id: string | null,
  datos: DatosAlimento,
): Promise<Resultado<{ id: string }>> {
  if (id !== null && !UUID.test(id)) return fallo("no_encontrado");
  if (datos.etiquetas.some((e) => !UUID.test(e))) return fallo("no_encontrado");
  const { data, error } = await cliente.rpc("guardar_alimento", {
    p_id: id,
    p_nombre: datos.nombre,
    p_unidad: datos.unidad,
    p_precio: datos.precio_aprox,
    p_activo: datos.activo,
    p_etiquetas: datos.etiquetas,
  });
  if (error) return fallo(traducirError(error));
  return ok({ id: data as string });
}

/** Falla con "en_uso" si está en alguna lista base o cesta: entonces, mejor desactivarlo. */
export async function eliminarAlimento(cliente: SupabaseClient, id: string): Promise<Resultado> {
  if (!UUID.test(id)) return fallo("no_encontrado");
  return cambiarUna(cliente.from("alimentos").delete({ count: "exact" }).eq("id", id));
}

// ---------------------------------------------------------------------------
// Listas base
// ---------------------------------------------------------------------------

export type ListaConTotal = ListaBase & { alimentos: number };
export type ItemConAlimento = ItemLista & { alimento: { nombre: string; unidad: string; activo: boolean } };

export async function listarListas(cliente: SupabaseClient): Promise<Resultado<ListaConTotal[]>> {
  const { data, error } = await cliente
    .from("listas_base")
    .select("id, nombre, predeterminada, lista_base_items(count)")
    .order("predeterminada", { ascending: false })
    .order("nombre");
  if (error) return fallo(traducirError(error));
  return ok(
    (data as unknown as (ListaBase & { lista_base_items: { count: number }[] })[]).map((l) => ({
      id: l.id,
      nombre: l.nombre,
      predeterminada: l.predeterminada,
      alimentos: l.lista_base_items[0]?.count ?? 0,
    })),
  );
}

export async function obtenerLista(
  cliente: SupabaseClient,
  id: string,
): Promise<Resultado<ListaBase & { items: ItemConAlimento[] }>> {
  if (!UUID.test(id)) return fallo("no_encontrado");
  const { data, error } = await cliente
    .from("listas_base")
    .select(
      "id, nombre, predeterminada, lista_base_items(id, alimento_id, cantidad_por_adulto, cantidad_por_nino, alimentos(nombre, unidad, activo))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return fallo(traducirError(error));
  if (!data) return fallo("no_encontrado");

  const fila = data as unknown as ListaBase & {
    lista_base_items: (ItemLista & { alimentos: ItemConAlimento["alimento"] })[];
  };
  const items = fila.lista_base_items
    .map((i) => ({
      id: i.id,
      alimento_id: i.alimento_id,
      cantidad_por_adulto: Number(i.cantidad_por_adulto),
      cantidad_por_nino: Number(i.cantidad_por_nino),
      alimento: i.alimentos,
    }))
    .sort((a, b) => a.alimento.nombre.localeCompare(b.alimento.nombre, "es"));
  return ok({ id: fila.id, nombre: fila.nombre, predeterminada: fila.predeterminada, items });
}

export async function crearLista(cliente: SupabaseClient, nombre: string): Promise<Resultado<{ id: string }>> {
  const { data, error } = await cliente.from("listas_base").insert({ nombre }).select("id").single();
  if (error) return fallo(traducirError(error));
  return ok({ id: data.id as string });
}

export async function renombrarLista(cliente: SupabaseClient, id: string, nombre: string): Promise<Resultado> {
  if (!UUID.test(id)) return fallo("no_encontrado");
  return cambiarUna(cliente.from("listas_base").update({ nombre }, { count: "exact" }).eq("id", id));
}

/** La marca como predeterminada y desmarca la anterior, de una vez (función SQL). */
export async function marcarListaPredeterminada(cliente: SupabaseClient, id: string): Promise<Resultado> {
  if (!UUID.test(id)) return fallo("no_encontrado");
  const { error } = await cliente.rpc("marcar_lista_predeterminada", { p_id: id });
  if (error) return fallo(traducirError(error));
  return ok(undefined);
}

/** Borra la lista y sus cantidades. Las cestas que la usaron se quedan sin lista base. */
export async function eliminarLista(cliente: SupabaseClient, id: string): Promise<Resultado> {
  if (!UUID.test(id)) return fallo("no_encontrado");
  return cambiarUna(cliente.from("listas_base").delete({ count: "exact" }).eq("id", id));
}

/** "duplicado" si el alimento ya está en la lista; "en_uso" si el alimento o la lista no existen. */
export async function anadirALista(
  cliente: SupabaseClient,
  listaId: string,
  alimentoId: string,
  cantidades: DatosItem,
): Promise<Resultado> {
  if (!UUID.test(listaId) || !UUID.test(alimentoId)) return fallo("no_encontrado");
  const { error } = await cliente
    .from("lista_base_items")
    .insert({ lista_base_id: listaId, alimento_id: alimentoId, ...cantidades });
  if (error) return fallo(traducirError(error));
  return ok(undefined);
}

export async function cambiarCantidades(
  cliente: SupabaseClient,
  itemId: string,
  cantidades: DatosItem,
): Promise<Resultado> {
  if (!UUID.test(itemId)) return fallo("no_encontrado");
  return cambiarUna(cliente.from("lista_base_items").update(cantidades, { count: "exact" }).eq("id", itemId));
}

export async function quitarDeLista(cliente: SupabaseClient, itemId: string): Promise<Resultado> {
  if (!UUID.test(itemId)) return fallo("no_encontrado");
  return cambiarUna(cliente.from("lista_base_items").delete({ count: "exact" }).eq("id", itemId));
}
