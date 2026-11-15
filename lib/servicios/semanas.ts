// Semanas y cestas en la base de datos (plan PR 4, R1).
//
// Como en el catálogo: cada función recibe el cliente de quien hace la petición y la
// Row Level Security decide. Los errores se tratan por `code` y nunca se registran enteros.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DatosCesta, ItemPlantilla } from "@/lib/dominio/cesta";
import { costeCesta, choquesEnCesta } from "@/lib/dominio/cesta";
import type { DatosSemana, EstadoSemana, Semana } from "@/lib/dominio/semanas";

export type ErrorSemanas =
  | "duplicado"
  | "en_uso"
  | "excluido"
  | "no_editable"
  | "no_encontrado"
  | "sin_permiso"
  | "desconocido";
export type Resultado<T = void> = { ok: true; valor: T } | { ok: false; error: ErrorSemanas };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ok = <T>(valor: T): Resultado<T> => ({ ok: true, valor });
const fallo = (error: ErrorSemanas): Resultado<never> => ({ ok: false, error });

function traducirError(error: { code?: string; hint?: string } | null): ErrorSemanas {
  switch (error?.code) {
    case "23505":
      return "duplicado";
    case "23503":
      return "en_uso";
    case "23514":
      // Disparadores de la migración inicial: el alimento choca con las exclusiones.
      if (error.hint === "alimento_excluido") return "excluido";
      break;
    case "55000":
      // La semana ya no está en preparación (migración de semanas y cestas).
      return "no_editable";
    case "P0002":
    case "PGRST116":
      return "no_encontrado";
    case "42501":
      return "sin_permiso";
  }
  console.error(`Error de base de datos en semanas o cestas (código ${error?.code ?? "?"})`);
  return "desconocido";
}

async function cambiarUna(
  consulta: PromiseLike<{ count: number | null; error: { code?: string; hint?: string } | null }>,
): Promise<Resultado> {
  const { count, error } = await consulta;
  if (error) return fallo(traducirError(error));
  if (!count) return fallo("no_encontrado");
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Semanas
// ---------------------------------------------------------------------------

const COLUMNAS_SEMANA = "id, fecha_entrega, precio_base, plazo_confirmacion, estado";
type FilaSemana = Omit<Semana, "precio_base"> & { precio_base: number | string };

function aSemana(f: FilaSemana): Semana {
  return {
    id: f.id,
    fecha_entrega: f.fecha_entrega,
    precio_base: Number(f.precio_base),
    plazo_confirmacion: f.plazo_confirmacion,
    estado: f.estado as EstadoSemana,
  };
}

export type SemanaConTotal = Semana & { cestas: number };

/** Las más recientes primero. */
export async function listarSemanas(cliente: SupabaseClient): Promise<Resultado<SemanaConTotal[]>> {
  const { data, error } = await cliente
    .from("semanas")
    .select(`${COLUMNAS_SEMANA}, cestas(count)`)
    .order("fecha_entrega", { ascending: false });
  if (error) return fallo(traducirError(error));
  return ok(
    (data as unknown as (FilaSemana & { cestas: { count: number }[] })[]).map((s) => ({
      ...aSemana(s),
      cestas: s.cestas[0]?.count ?? 0,
    })),
  );
}

/** Precio base de la semana más reciente, para proponerlo en la siguiente. */
export async function ultimoPrecioBase(cliente: SupabaseClient): Promise<number | null> {
  const { data } = await cliente
    .from("semanas")
    .select("precio_base")
    .order("fecha_entrega", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? Number(data.precio_base) : null;
}

export type ResumenCesta = {
  id: string;
  identificador_receptor: string;
  adultos: number;
  ninos: number;
  exclusiones: string[];
  /** Unidades en total. */
  unidades: number;
  coste: number;
  /** Alimentos que chocan con sus exclusiones porque el catálogo cambió después. */
  choques: number;
};

type FilaItemResumen = {
  cantidad: number;
  precio_unitario: number | string;
  alimento_id: string;
  alimentos: { alimento_etiquetas: { etiqueta_id: string }[] } | null;
};

export async function obtenerSemana(
  cliente: SupabaseClient,
  id: string,
): Promise<Resultado<Semana & { cestas: ResumenCesta[] }>> {
  if (!UUID.test(id)) return fallo("no_encontrado");
  const { data, error } = await cliente
    .from("semanas")
    .select(
      `${COLUMNAS_SEMANA}, cestas(id, identificador_receptor, adultos, ninos, creado_en, cesta_exclusiones(etiqueta_id), cesta_items(cantidad, precio_unitario, alimento_id, alimentos(alimento_etiquetas(etiqueta_id))))`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return fallo(traducirError(error));
  if (!data) return fallo("no_encontrado");

  const fila = data as unknown as FilaSemana & {
    cestas: {
      id: string;
      identificador_receptor: string;
      adultos: number;
      ninos: number;
      creado_en: string;
      cesta_exclusiones: { etiqueta_id: string }[];
      cesta_items: FilaItemResumen[];
    }[];
  };
  const cestas = [...fila.cestas]
    .sort((a, b) => a.creado_en.localeCompare(b.creado_en))
    .map((c) => {
      const exclusiones = c.cesta_exclusiones.map((e) => e.etiqueta_id);
      const items = c.cesta_items.map((i) => ({
        alimento_id: i.alimento_id,
        cantidad: i.cantidad,
        precio_unitario: Number(i.precio_unitario),
        etiquetas: i.alimentos?.alimento_etiquetas.map((e) => e.etiqueta_id) ?? [],
      }));
      return {
        id: c.id,
        identificador_receptor: c.identificador_receptor,
        adultos: c.adultos,
        ninos: c.ninos,
        exclusiones,
        unidades: items.reduce((t, i) => t + i.cantidad, 0),
        coste: costeCesta(items),
        choques: choquesEnCesta(items, exclusiones).length,
      };
    });
  return ok({ ...aSemana(fila), cestas });
}

export async function crearSemana(cliente: SupabaseClient, datos: DatosSemana): Promise<Resultado<{ id: string }>> {
  const { data, error } = await cliente.from("semanas").insert(datos).select("id").single();
  if (error) return fallo(traducirError(error));
  return ok({ id: data.id as string });
}

/** Solo mientras está en preparación: "no_editable" si ya se envió. */
export async function guardarSemana(cliente: SupabaseClient, id: string, datos: DatosSemana): Promise<Resultado> {
  if (!UUID.test(id)) return fallo("no_encontrado");
  const r = await cambiarUna(
    cliente.from("semanas").update(datos, { count: "exact" }).eq("id", id).eq("estado", "borrador"),
  );
  return r.ok || r.error !== "no_encontrado" ? r : motivoNoCambiada(cliente, id);
}

/** Borra la semana y sus cestas. Solo mientras está en preparación. */
export async function eliminarSemana(cliente: SupabaseClient, id: string): Promise<Resultado> {
  if (!UUID.test(id)) return fallo("no_encontrado");
  const r = await cambiarUna(cliente.from("semanas").delete({ count: "exact" }).eq("id", id).eq("estado", "borrador"));
  return r.ok || r.error !== "no_encontrado" ? r : motivoNoCambiada(cliente, id);
}

/** Si un cambio no tocó ninguna fila: ¿no existe, o ya no está en preparación? */
async function motivoNoCambiada(cliente: SupabaseClient, id: string): Promise<Resultado> {
  const { data } = await cliente.from("semanas").select("estado").eq("id", id).maybeSingle();
  return fallo(data ? "no_editable" : "no_encontrado");
}

// ---------------------------------------------------------------------------
// Cestas
// ---------------------------------------------------------------------------

export type ItemCesta = {
  id: string;
  alimento_id: string;
  nombre: string;
  /** La unidad del momento en que se añadió (puede no ser la actual del catálogo). */
  unidad: string;
  cantidad: number;
  /** El precio del momento en que se añadió (CA-08). */
  precio_unitario: number;
  /** Etiquetas actuales del alimento en el catálogo, para avisar de choques. */
  etiquetas: string[];
};

export type Cesta = {
  id: string;
  semana: Pick<Semana, "id" | "fecha_entrega" | "estado">;
  identificador_receptor: string;
  adultos: number;
  ninos: number;
  lista_base_id: string | null;
  exclusiones: string[];
  items: ItemCesta[];
};

export async function obtenerCesta(cliente: SupabaseClient, id: string): Promise<Resultado<Cesta>> {
  if (!UUID.test(id)) return fallo("no_encontrado");
  const { data, error } = await cliente
    .from("cestas")
    .select(
      "id, identificador_receptor, adultos, ninos, lista_base_id, semanas(id, fecha_entrega, estado), cesta_exclusiones(etiqueta_id), cesta_items(id, alimento_id, unidad, cantidad, precio_unitario, alimentos(nombre, alimento_etiquetas(etiqueta_id)))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return fallo(traducirError(error));
  if (!data) return fallo("no_encontrado");

  const fila = data as unknown as Omit<Cesta, "semana" | "exclusiones" | "items"> & {
    semanas: Cesta["semana"];
    cesta_exclusiones: { etiqueta_id: string }[];
    cesta_items: {
      id: string;
      alimento_id: string;
      unidad: string;
      cantidad: number;
      precio_unitario: number | string;
      alimentos: { nombre: string; alimento_etiquetas: { etiqueta_id: string }[] };
    }[];
  };
  return ok({
    id: fila.id,
    semana: fila.semanas,
    identificador_receptor: fila.identificador_receptor,
    adultos: fila.adultos,
    ninos: fila.ninos,
    lista_base_id: fila.lista_base_id,
    exclusiones: fila.cesta_exclusiones.map((e) => e.etiqueta_id),
    items: fila.cesta_items
      .map((i) => ({
        id: i.id,
        alimento_id: i.alimento_id,
        nombre: i.alimentos.nombre,
        unidad: i.unidad,
        cantidad: i.cantidad,
        precio_unitario: Number(i.precio_unitario),
        etiquetas: i.alimentos.alimento_etiquetas.map((e) => e.etiqueta_id),
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
  });
}

/** La lista base con los datos actuales de cada alimento, para proponer una cesta (R1). */
export async function plantillaDeLista(cliente: SupabaseClient, listaId: string): Promise<Resultado<ItemPlantilla[]>> {
  if (!UUID.test(listaId)) return fallo("no_encontrado");
  const { data, error } = await cliente
    .from("lista_base_items")
    .select("cantidad_por_adulto, cantidad_por_nino, alimentos(id, nombre, unidad, activo, alimento_etiquetas(etiqueta_id))")
    .eq("lista_base_id", listaId);
  if (error) return fallo(traducirError(error));
  const filas = data as unknown as {
    cantidad_por_adulto: number | string;
    cantidad_por_nino: number | string;
    alimentos: { id: string; nombre: string; unidad: string; activo: boolean; alimento_etiquetas: { etiqueta_id: string }[] };
  }[];
  return ok(
    filas
      .map((f) => ({
        cantidad_por_adulto: Number(f.cantidad_por_adulto),
        cantidad_por_nino: Number(f.cantidad_por_nino),
        alimento: {
          id: f.alimentos.id,
          nombre: f.alimentos.nombre,
          unidad: f.alimentos.unidad,
          activo: f.alimentos.activo,
          etiquetas: f.alimentos.alimento_etiquetas.map((e) => e.etiqueta_id),
        },
      }))
      .sort((a, b) => a.alimento.nombre.localeCompare(b.alimento.nombre, "es")),
  );
}

/**
 * Alta (id nulo) o edición de una cesta con sus exclusiones, de una vez (función SQL
 * guardar_cesta).
 * - items con valor: sustituye todos los alimentos (la propuesta de R1). El precio y
 *   la unidad se copian del catálogo en ese momento.
 * - items nulo: conserva los alimentos, salvo los que choquen con las exclusiones, que
 *   se quitan. `quitados` dice cuáles (ids de alimento).
 * En la edición, la cesta tiene que ser de la semana `semanaId` ("no_encontrado" si no).
 * "excluido" si algún alimento de `items` choca (el catálogo cambió mientras tanto);
 * "no_editable" si la semana ya se envió; "en_uso" si la semana o la lista no existen.
 */
export async function guardarCesta(
  cliente: SupabaseClient,
  { id, semanaId, datos, items }: {
    id: string | null;
    semanaId: string;
    datos: DatosCesta;
    items: { alimento_id: string; cantidad: number }[] | null;
  },
): Promise<Resultado<{ id: string; quitados: string[] }>> {
  if ((id !== null && !UUID.test(id)) || !UUID.test(semanaId)) return fallo("no_encontrado");
  const { data, error } = await cliente.rpc("guardar_cesta", {
    p_id: id,
    p_semana_id: semanaId,
    p_identificador: datos.identificador_receptor,
    p_adultos: datos.adultos,
    p_ninos: datos.ninos,
    p_lista_base_id: datos.lista_base_id,
    p_exclusiones: datos.exclusiones,
    p_items: items,
  });
  if (error) return fallo(traducirError(error));
  const r = data as { id: string; quitados: string[] };
  return ok({ id: r.id, quitados: r.quitados });
}

/**
 * Añade un alimento a mano (R1.3). El precio y la unidad los copia la base de datos del
 * catálogo. "excluido" si choca con las exclusiones (CA-07); "duplicado" si ya está.
 */
export async function anadirACesta(
  cliente: SupabaseClient,
  cestaId: string,
  alimentoId: string,
  cantidad: number,
): Promise<Resultado> {
  if (!UUID.test(cestaId) || !UUID.test(alimentoId)) return fallo("no_encontrado");
  const { error } = await cliente.from("cesta_items").insert({ cesta_id: cestaId, alimento_id: alimentoId, cantidad });
  if (error) return fallo(traducirError(error));
  return ok(undefined);
}

/** Solo cambia la cantidad: el precio y la unidad copiados se conservan (CA-08). */
export async function cambiarCantidadCesta(
  cliente: SupabaseClient,
  cestaId: string,
  itemId: string,
  cantidad: number,
): Promise<Resultado> {
  if (!UUID.test(cestaId) || !UUID.test(itemId)) return fallo("no_encontrado");
  return cambiarUna(
    cliente.from("cesta_items").update({ cantidad }, { count: "exact" }).eq("id", itemId).eq("cesta_id", cestaId),
  );
}

export async function quitarDeCesta(cliente: SupabaseClient, cestaId: string, itemId: string): Promise<Resultado> {
  if (!UUID.test(cestaId) || !UUID.test(itemId)) return fallo("no_encontrado");
  return cambiarUna(cliente.from("cesta_items").delete({ count: "exact" }).eq("id", itemId).eq("cesta_id", cestaId));
}

export async function eliminarCesta(cliente: SupabaseClient, semanaId: string, id: string): Promise<Resultado> {
  if (!UUID.test(semanaId) || !UUID.test(id)) return fallo("no_encontrado");
  return cambiarUna(cliente.from("cestas").delete({ count: "exact" }).eq("id", id).eq("semana_id", semanaId));
}
