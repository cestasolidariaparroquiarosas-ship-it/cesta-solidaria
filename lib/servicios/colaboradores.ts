// Colaboradores en la base de datos (spec §3, R5; CA-01 a CA-04).
//
// Cada función recibe el cliente de Supabase de quien hace la petición, así que la
// Row Level Security decide siempre: con un usuario que no es administrador, nada
// se lee ni se escribe. Las acciones de la app pasan el cliente con la sesión del
// administrador; las pruebas de integración, el de un usuario de pruebas.
//
// RGPD: los errores de Supabase pueden llevar el correo (un 23505 lo trae en
// `details`), así que se tratan por `code` y nunca se devuelven ni se registran enteros.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ultimasParticipaciones,
  type Colaborador,
  type DatosColaborador,
  type EstadoColaborador,
} from "@/lib/dominio/colaboradores";

export type ErrorColaborador =
  | "email_repetido"
  | "no_encontrado"
  | "asignacion_en_curso"
  | "sin_permiso"
  | "desconocido";

export type Resultado<T = void> = { ok: true; valor: T } | { ok: false; error: ErrorColaborador };

export type ColaboradorConParticipacion = Colaborador & { ultima_participacion: string | null };

const COLUMNAS = "id, nombre, email, estado, pausado_hasta, fecha_consentimiento, notas, creado_en";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function traducirError(error: { code?: string } | null): ErrorColaborador {
  switch (error?.code) {
    case "23505":
      return "email_repetido";
    case "42501":
      return "sin_permiso";
    default:
      // Solo el código: nunca el mensaje ni los detalles (pueden llevar datos personales).
      console.error(`Error de base de datos en colaboradores (código ${error?.code ?? "?"})`);
      return "desconocido";
  }
}

const ok = <T>(valor: T): Resultado<T> => ({ ok: true, valor });
const fallo = (error: ErrorColaborador): Resultado<never> => ({ ok: false, error });

/** Lista ordenada por nombre, con la fecha de su última participación. */
export async function listarColaboradores(
  cliente: SupabaseClient,
  estado?: EstadoColaborador,
): Promise<Resultado<ColaboradorConParticipacion[]>> {
  let consulta = cliente.from("colaboradores").select(COLUMNAS).order("nombre").order("creado_en");
  if (estado) consulta = consulta.eq("estado", estado);
  const { data, error } = await consulta;
  if (error) return fallo(traducirError(error));

  // Límite conocido: PostgREST devuelve como mucho max_rows (1000) filas sin avisar.
  // Con unas 5-10 confirmaciones por semana alcanza para años, pero la selección de
  // R2.4 (PR 5) debe usar una vista agregada (max(fecha_entrega) por colaborador),
  // y esta lista también.
  const { data: confirmadas, error: errorConfirmadas } = await cliente
    .from("asignaciones")
    .select("colaborador_id, semanas!inner(fecha_entrega)")
    .eq("estado", "confirmada")
    .not("colaborador_id", "is", null);
  if (errorConfirmadas) return fallo(traducirError(errorConfirmadas));

  const ultimas = ultimasParticipaciones(
    (confirmadas as unknown as { colaborador_id: string; semanas: { fecha_entrega: string } }[]).map(
      (a) => ({ colaborador_id: a.colaborador_id, fecha_entrega: a.semanas.fecha_entrega }),
    ),
  );

  return ok(
    (data as Colaborador[]).map((c) => ({ ...c, ultima_participacion: ultimas.get(c.id) ?? null })),
  );
}

export async function obtenerColaborador(
  cliente: SupabaseClient,
  id: string,
): Promise<Resultado<Colaborador>> {
  if (!UUID.test(id)) return fallo("no_encontrado");
  const { data, error } = await cliente.from("colaboradores").select(COLUMNAS).eq("id", id).maybeSingle();
  if (error) return fallo(traducirError(error));
  if (!data) return fallo("no_encontrado");
  return ok(data as Colaborador);
}

/** Alta (CA-01: si el correo ya existe, no se guarda). Siempre empieza activo. */
export async function crearColaborador(
  cliente: SupabaseClient,
  datos: DatosColaborador,
  ahora: Date = new Date(),
): Promise<Resultado<{ id: string }>> {
  const { data, error } = await cliente
    .from("colaboradores")
    .insert({ ...datos, estado: "activo", fecha_consentimiento: ahora.toISOString() })
    .select("id")
    .single();
  if (error) return fallo(traducirError(error));
  return ok({ id: data.id as string });
}

/**
 * Cambia nombre, correo y notas (CA-01 también al cambiar el correo). Con
 * `registrarConsentimiento`, anota además ahora el consentimiento, en el mismo cambio.
 */
export async function actualizarDatosColaborador(
  cliente: SupabaseClient,
  id: string,
  datos: DatosColaborador,
  opciones: { registrarConsentimiento?: boolean; ahora?: Date } = {},
): Promise<Resultado> {
  const { registrarConsentimiento = false, ahora = new Date() } = opciones;
  return actualizar(cliente, id, {
    ...datos,
    ...(registrarConsentimiento ? { fecha_consentimiento: ahora.toISOString() } : {}),
  });
}

export type CambioEstado =
  | { estado: "activo" }
  | { estado: "pausado"; pausadoHasta: string | null }
  | { estado: "baja" };

/**
 * Pausa (con fecha de vuelta opcional), reactivación o baja.
 *
 * No se puede pausar ni dar de baja a quien tiene una asignación propuesta o pendiente
 * de respuesta: al enviar la semana le llegaría el correo igualmente (CA-03), o
 * seguiría esperando su respuesta. Primero hay que cambiarlo por otro en el reparto.
 */
export async function cambiarEstadoColaborador(
  cliente: SupabaseClient,
  id: string,
  cambio: CambioEstado,
): Promise<Resultado> {
  if (cambio.estado !== "activo") {
    const enCurso = await tieneAsignacionEnCurso(cliente, id, { contarConfirmadas: false });
    if (!enCurso.ok) return enCurso;
    if (enCurso.valor) return fallo("asignacion_en_curso");
  }
  return actualizar(cliente, id, {
    estado: cambio.estado,
    pausado_hasta: cambio.estado === "pausado" ? cambio.pausadoHasta : null,
  });
}

/**
 * R5.2 (CA-04): borra la fila, y con ella el nombre y el correo. Sus asignaciones se
 * conservan con colaborador_id nulo ("Colaborador eliminado"), por la clave ajena
 * `on delete set null`.
 *
 * No se permite si tiene una asignación en curso: propuesta, pendiente de respuesta o
 * confirmada sin entregar en una semana sin cerrar. Quedaría sin nadie que la lleve, o
 * el administrador no sabría a quién llamar. Primero hay que cambiarlo por otro en el
 * reparto de esa semana.
 *
 * Comprobar y borrar son dos pasos. Mientras el reparto (PR 5) no exista no importa;
 * allí habrá que decidir si se hace en una función SQL con bloqueo.
 */
export async function eliminarColaborador(cliente: SupabaseClient, id: string): Promise<Resultado> {
  if (!UUID.test(id)) return fallo("no_encontrado");

  const enCurso = await tieneAsignacionEnCurso(cliente, id, { contarConfirmadas: true });
  if (!enCurso.ok) return enCurso;
  if (enCurso.valor) return fallo("asignacion_en_curso");

  const { count, error } = await cliente.from("colaboradores").delete({ count: "exact" }).eq("id", id);
  if (error) return fallo(traducirError(error));
  if (!count) return fallo("no_encontrado");
  return ok(undefined);
}

/**
 * ¿Tiene alimentos asignados en una semana que aún no ha terminado? Cuentan las
 * asignaciones propuestas o pendientes y, si se pide, las confirmadas sin entregar
 * de semanas sin cerrar.
 */
async function tieneAsignacionEnCurso(
  cliente: SupabaseClient,
  id: string,
  { contarConfirmadas }: { contarConfirmadas: boolean },
): Promise<Resultado<boolean>> {
  if (!UUID.test(id)) return fallo("no_encontrado");
  const estados = contarConfirmadas ? ["propuesta", "pendiente", "confirmada"] : ["propuesta", "pendiente"];
  const { data, error } = await cliente
    .from("asignaciones")
    .select("estado, entregado, semanas!inner(estado)")
    .eq("colaborador_id", id)
    .in("estado", estados);
  if (error) return fallo(traducirError(error));

  const filas = data as unknown as { estado: string; entregado: boolean; semanas: { estado: string } }[];
  return ok(
    filas.some(
      (a) => a.estado !== "confirmada" || (!a.entregado && a.semanas.estado !== "cerrada"),
    ),
  );
}

async function actualizar(
  cliente: SupabaseClient,
  id: string,
  cambios: Record<string, unknown>,
): Promise<Resultado> {
  if (!UUID.test(id)) return fallo("no_encontrado");
  // Sin permiso, la RLS no devuelve error: simplemente no cambia ninguna fila.
  const { count, error } = await cliente
    .from("colaboradores")
    .update(cambios, { count: "exact" })
    .eq("id", id);
  if (error) return fallo(traducirError(error));
  if (!count) return fallo("no_encontrado");
  return ok(undefined);
}
