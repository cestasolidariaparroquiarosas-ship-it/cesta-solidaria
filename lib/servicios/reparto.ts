// Selección y reparto en la base de datos (plan PR 5, R2 y R3).
//
// Como en el resto de servicios: cada función recibe el cliente de quien hace la
// petición y la Row Level Security decide. Los errores se tratan por `code` (y `hint`
// en los de nuestras funciones) y nunca se registran enteros.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Colaborador } from "@/lib/dominio/colaboradores";
import type { ItemAsignado, ItemRepartible } from "@/lib/dominio/reparto";
import type { Candidato } from "@/lib/dominio/seleccion";

export type ErrorReparto =
  | "duplicado"
  | "incompleto"
  | "cantidad_insuficiente"
  | "mismo_colaborador"
  | "no_editable"
  | "no_encontrado"
  | "sin_permiso"
  | "desconocido";
export type Resultado<T = void> = { ok: true; valor: T } | { ok: false; error: ErrorReparto };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ok = <T>(valor: T): Resultado<T> => ({ ok: true, valor });
const fallo = (error: ErrorReparto): Resultado<never> => ({ ok: false, error });

function traducirError(error: { code?: string; hint?: string } | null): ErrorReparto {
  switch (error?.code) {
    case "23505":
      // Un colaborador solo puede tener una asignación por semana.
      return "duplicado";
    case "23514":
      if (error.hint === "reparto_incompleto") return "incompleto";
      if (error.hint === "cantidad_insuficiente") return "cantidad_insuficiente";
      if (error.hint === "mismo_colaborador") return "mismo_colaborador";
      break;
    case "55000":
      return "no_editable";
    case "P0002":
    case "PGRST116":
      return "no_encontrado";
    case "42501":
      return "sin_permiso";
  }
  // Solo el código: nunca el mensaje ni los detalles (pueden llevar datos personales).
  console.error(`Error de base de datos en el reparto (código ${error?.code ?? "?"})`);
  return "desconocido";
}

// ---------------------------------------------------------------------------
// Candidatos (R2.3 y R2.4)
// ---------------------------------------------------------------------------

export type CandidatoConNombre = Candidato & Pick<Colaborador, "nombre">;

/** Fecha de la última participación de cada colaborador (vista agregada en la base de datos). */
export async function ultimasParticipaciones(cliente: SupabaseClient): Promise<Resultado<Map<string, string>>> {
  const { data, error } = await cliente.from("ultimas_participaciones").select("colaborador_id, ultima_participacion");
  if (error) return fallo(traducirError(error));
  return ok(
    new Map((data as { colaborador_id: string; ultima_participacion: string }[]).map((f) => [f.colaborador_id, f.ultima_participacion])),
  );
}

/**
 * Colaboradores que pueden llegar a ser candidatos (todos menos los de baja), con su
 * última participación. Si de verdad lo son para una semana lo decide
 * `candidatosOrdenados` con la fecha de entrega.
 */
export async function listarCandidatos(cliente: SupabaseClient): Promise<Resultado<CandidatoConNombre[]>> {
  const [colaboradores, ultimas] = await Promise.all([
    cliente.from("colaboradores").select("id, nombre, estado, pausado_hasta, creado_en").neq("estado", "baja"),
    ultimasParticipaciones(cliente),
  ]);
  if (colaboradores.error) return fallo(traducirError(colaboradores.error));
  if (!ultimas.ok) return ultimas;
  return ok(
    (colaboradores.data as Omit<CandidatoConNombre, "ultima_participacion">[]).map((c) => ({
      ...c,
      ultima_participacion: ultimas.valor.get(c.id) ?? null,
    })),
  );
}

// ---------------------------------------------------------------------------
// Reparto
// ---------------------------------------------------------------------------

/**
 * Todos los alimentos de todas las cestas de la semana: lo que hay que repartir.
 * Se lee por cestas: PostgREST devuelve como mucho 1000 filas (max_rows) de la tabla
 * principal, y una semana tiene pocas cestas aunque sume muchos alimentos.
 */
export async function itemsDeSemana(cliente: SupabaseClient, semanaId: string): Promise<Resultado<ItemRepartible[]>> {
  if (!UUID.test(semanaId)) return fallo("no_encontrado");
  const { data, error } = await cliente
    .from("cestas")
    .select("cesta_items(id, alimento_id, cantidad, precio_unitario)")
    .eq("semana_id", semanaId);
  if (error) return fallo(traducirError(error));
  const cestas = data as unknown as {
    cesta_items: { id: string; alimento_id: string; cantidad: number; precio_unitario: number | string }[];
  }[];
  return ok(
    cestas.flatMap((c) =>
      c.cesta_items.map((i) => ({
        cesta_item_id: i.id,
        alimento_id: i.alimento_id,
        cantidad: i.cantidad,
        precio_unitario: Number(i.precio_unitario),
      })),
    ),
  );
}

export type AsignacionReparto = {
  id: string;
  estado: "propuesta" | "pendiente" | "confirmada" | "rechazada" | "sin_respuesta";
  /** null tras "Eliminar definitivamente" al colaborador (CA-04). */
  colaborador: Pick<Colaborador, "id" | "nombre" | "estado" | "pausado_hasta"> | null;
  items: ItemAsignado[];
  plazo: string | null;
  enviado_en: string | null;
  respondido_en: string | null;
  /** Asignación a la que sustituye, si viene de una reasignación (R4.4). */
  sustituye_a: string | null;
  /** Casilla "entregado" (spec §10, pregunta 6). */
  entregado: boolean;
};

export async function obtenerReparto(cliente: SupabaseClient, semanaId: string): Promise<Resultado<AsignacionReparto[]>> {
  if (!UUID.test(semanaId)) return fallo("no_encontrado");
  const { data, error } = await cliente
    .from("asignaciones")
    .select(
      "id, estado, creado_en, plazo, enviado_en, respondido_en, sustituye_a, entregado, colaboradores(id, nombre, estado, pausado_hasta), asignacion_items(cantidad, cesta_items(alimento_id, unidad, precio_unitario, alimentos(nombre)))",
    )
    .eq("semana_id", semanaId)
    .order("creado_en")
    .order("id");
  if (error) return fallo(traducirError(error));

  const filas = data as unknown as (Omit<AsignacionReparto, "colaborador" | "items"> & {
    colaboradores: AsignacionReparto["colaborador"];
    asignacion_items: {
      cantidad: number;
      cesta_items: { alimento_id: string; unidad: string; precio_unitario: number | string; alimentos: { nombre: string } };
    }[];
  })[];
  return ok(
    filas.map((a) => ({
      id: a.id,
      estado: a.estado,
      plazo: a.plazo,
      enviado_en: a.enviado_en,
      respondido_en: a.respondido_en,
      sustituye_a: a.sustituye_a,
      entregado: a.entregado,
      colaborador: a.colaboradores,
      items: a.asignacion_items.map((i) => ({
        alimento_id: i.cesta_items.alimento_id,
        nombre: i.cesta_items.alimentos.nombre,
        unidad: i.cesta_items.unidad,
        cantidad: i.cantidad,
        precio_unitario: Number(i.cesta_items.precio_unitario),
      })),
    })),
  );
}

/** ¿Tiene la semana un reparto (asignaciones)? Para avisar antes de cambiar cestas. */
export async function tieneReparto(cliente: SupabaseClient, semanaId: string): Promise<boolean> {
  if (!UUID.test(semanaId)) return false;
  const { count } = await cliente
    .from("asignaciones")
    .select("id", { count: "exact", head: true })
    .eq("semana_id", semanaId);
  return (count ?? 0) > 0;
}

/**
 * Guarda la propuesta (función SQL proponer_reparto), sustituyendo la que hubiera.
 * La base de datos comprueba que cada unidad de cada cesta queda asignada una sola vez
 * (CA-12): si no, "incompleto" y no se guarda nada (las cestas cambiaron mientras).
 */
export async function proponerReparto(
  cliente: SupabaseClient,
  semanaId: string,
  asignaciones: { colaborador_id: string; items: { cesta_item_id: string; cantidad: number }[] }[],
): Promise<Resultado<number>> {
  if (!UUID.test(semanaId)) return fallo("no_encontrado");
  const { data, error } = await cliente.rpc("proponer_reparto", {
    p_semana_id: semanaId,
    p_asignaciones: asignaciones.map(({ colaborador_id, items }) => ({ colaborador_id, items })),
  });
  if (error) return fallo(traducirError(error));
  return ok(data as number);
}

/**
 * R3.5: mueve unidades de un alimento (con esa unidad) de una asignación a otra de la
 * misma semana. Si el origen se queda sin nada, sale del reparto (`origenEliminado`).
 */
export async function moverEnReparto(
  cliente: SupabaseClient,
  semanaId: string,
  m: { origen: string; destino: string; alimentoId: string; unidad: string; cantidad: number },
): Promise<Resultado<{ origenEliminado: boolean }>> {
  if (![semanaId, m.origen, m.destino, m.alimentoId].every((id) => UUID.test(id))) return fallo("no_encontrado");
  const { data, error } = await cliente.rpc("mover_en_reparto", {
    p_semana_id: semanaId,
    p_origen: m.origen,
    p_destino: m.destino,
    p_alimento_id: m.alimentoId,
    p_unidad: m.unidad,
    p_cantidad: m.cantidad,
  });
  if (error) return fallo(traducirError(error));
  return ok({ origenEliminado: Boolean((data as { origen_eliminado: boolean }).origen_eliminado) });
}

/**
 * R3.5: cambia el colaborador de una asignación propuesta por otro. "duplicado" si el
 * nuevo ya está en el reparto de esa semana.
 */
export async function cambiarColaborador(
  cliente: SupabaseClient,
  semanaId: string,
  asignacionId: string,
  colaboradorId: string,
): Promise<Resultado> {
  if (![semanaId, asignacionId, colaboradorId].every((id) => UUID.test(id))) return fallo("no_encontrado");
  const { count, error } = await cliente
    .from("asignaciones")
    .update({ colaborador_id: colaboradorId }, { count: "exact" })
    .eq("id", asignacionId)
    .eq("semana_id", semanaId)
    .eq("estado", "propuesta");
  if (error) return fallo(traducirError(error));
  if (!count) return fallo("no_encontrado");
  return ok(undefined);
}
