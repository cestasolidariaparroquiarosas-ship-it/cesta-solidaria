// Respuestas desde los enlaces del correo y reasignaciones (R4.2 a R4.6, R5.1).
//
// Las páginas públicas usan el cliente con la clave secreta (lib/supabase/servicio.ts):
// aquí cada consulta se limita a la asignación del token, y lo que se devuelve para
// mostrar es solo lo que permite CA-24 (nombre de pila, fecha y alimentos).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Correo } from "@/lib/correo/transporte";
import { costeCesta } from "@/lib/dominio/cesta";
import type { LineaCorreo } from "@/lib/correo/plantillas";
import { plazoReasignacion, plazoVencido } from "@/lib/dominio/plazos";
import {
  nombreDePila,
  situacionAsignacion,
  tokenValido,
  type EstadoAsignacion,
  type Respuesta,
  type Situacion,
} from "@/lib/dominio/respuestas";
import { candidatosOrdenados } from "@/lib/dominio/seleccion";
import type { EstadoSemana } from "@/lib/dominio/semanas";
import { listarCandidatos } from "./reparto";
import {
  aItems,
  avisarSinSustituto,
  enviarAsignacion,
  lineasCorreo,
  SELECCION_ITEMS,
  traducirErrorEnvio,
  type Resultado,
} from "./envio";

// ---------------------------------------------------------------------------
// Lo que ve quien abre el enlace (CA-15: solo leer, nunca cambiar nada)
// ---------------------------------------------------------------------------

export type VistaAsignacion = {
  /** CA-24: solo el nombre de pila. */
  nombre: string;
  fechaEntrega: string;
  plazo: string | null;
  situacion: Situacion;
  lineas: LineaCorreo[];
  gasto: number;
};

export async function leerAsignacion(servicio: SupabaseClient, token: string): Promise<VistaAsignacion | null> {
  if (!tokenValido(token)) return null;
  const { data } = await servicio
    .from("asignaciones")
    .select(`estado, plazo, colaboradores(nombre), semanas(fecha_entrega, estado), ${SELECCION_ITEMS}`)
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  const a = data as unknown as {
    estado: EstadoAsignacion;
    plazo: string | null;
    colaboradores: { nombre: string } | null;
    semanas: { fecha_entrega: string; estado: EstadoSemana };
    asignacion_items: Parameters<typeof aItems>[0];
  };
  const items = aItems(a.asignacion_items);
  return {
    nombre: nombreDePila(a.colaboradores?.nombre),
    fechaEntrega: a.semanas.fecha_entrega,
    plazo: a.plazo,
    situacion: situacionAsignacion(a, a.semanas),
    lineas: lineasCorreo(items),
    gasto: costeCesta(items),
  };
}

/** Para la página de baja: nombre de pila y si ya está de baja. */
export async function leerColaboradorDelToken(
  servicio: SupabaseClient,
  token: string,
): Promise<{ nombre: string; deBaja: boolean } | null> {
  if (!tokenValido(token)) return null;
  const { data } = await servicio
    .from("asignaciones")
    .select("colaboradores(nombre, estado)")
    .eq("token", token)
    .maybeSingle();
  const c = (data as unknown as { colaboradores: { nombre: string; estado: string } | null } | null)?.colaboradores;
  if (!c) return null;
  return { nombre: nombreDePila(c.nombre), deBaja: c.estado === "baja" };
}

// ---------------------------------------------------------------------------
// Reasignación (R4.4)
// ---------------------------------------------------------------------------

/**
 * Candidatos para sustituir en una semana, en el orden de R2.4, y el plazo de la
 * asignación nueva. La función SQL salta a quien ya tenga asignación esa semana.
 */
export async function datosReasignacion(
  cliente: SupabaseClient,
  semanaId: string,
  ahora: Date,
): Promise<{ candidatos: string[]; plazo: Date } | null> {
  const [semana, candidatos] = await Promise.all([
    cliente.from("semanas").select("fecha_entrega").eq("id", semanaId).maybeSingle(),
    listarCandidatos(cliente),
  ]);
  if (!semana.data || !candidatos.ok) return null;
  const fecha = semana.data.fecha_entrega as string;
  return {
    candidatos: candidatosOrdenados(candidatos.valor, fecha).map((c) => c.id),
    plazo: plazoReasignacion(ahora, fecha),
  };
}

/**
 * Tras una reasignación: si hay asignación nueva, su correo sale en el momento
 * (CA-17); si no, se avisa al administrador (R4.6).
 */
export async function despuesDeReasignar(
  cliente: SupabaseClient,
  origen: string,
  nueva: string | null,
  plazo: Date,
  correo: Correo,
  urlBase: string,
): Promise<void> {
  if (nueva) {
    await enviarAsignacion(cliente, nueva, correo, urlBase);
  } else {
    await avisarSinSustituto(cliente, origen, plazoVencido(plazo) ? "sin_tiempo" : "sin_candidatos", correo, urlBase);
  }
}

export type ResultadoRespuesta = "confirmada" | "rechazada" | "ya_respondida" | "vencida" | "no_encontrada";

/**
 * R4.2 a R4.4 (CA-16 a CA-19): registra la respuesta pulsada en la página del enlace.
 * Con "no", los alimentos pasan al siguiente candidato y su correo sale en el momento.
 */
export async function responder(
  servicio: SupabaseClient,
  token: string,
  respuesta: Respuesta,
  correo: Correo,
  urlBase: string,
  motivo: "respuesta" | "baja" = "respuesta",
): Promise<ResultadoRespuesta> {
  if (!tokenValido(token)) return "no_encontrada";
  const { data: asignacion } = await servicio
    .from("asignaciones")
    .select("id, semana_id")
    .eq("token", token)
    .maybeSingle();
  if (!asignacion) return "no_encontrada";

  const ahora = new Date();
  const reasignacion =
    respuesta === "no" ? await datosReasignacion(servicio, asignacion.semana_id as string, ahora) : null;
  // Sin la lista de candidatos no se guarda el "no": se perdería la reasignación. Mejor
  // un error y que vuelva a pulsar.
  if (respuesta === "no" && !reasignacion) throw new Error("No se han podido leer los candidatos");
  const plazo = reasignacion?.plazo ?? ahora;

  const { data, error } = await servicio.rpc("responder_asignacion", {
    p_token: token,
    p_respuesta: respuesta,
    p_candidatos: reasignacion?.candidatos ?? [],
    p_plazo: plazo.toISOString(),
    p_motivo: motivo,
  });
  if (error) {
    traducirErrorEnvio(error);
    throw new Error("No se ha podido registrar la respuesta");
  }
  const r = data as { resultado: ResultadoRespuesta; nueva?: string | null };
  if (r.resultado === "rechazada") {
    await despuesDeReasignar(servicio, asignacion.id as string, r.nueva ?? null, plazo, correo, urlBase);
  }
  return r.resultado;
}

/**
 * R5.1 (CA-22): baja desde el enlace del correo. Sus asignaciones pendientes se tratan
 * como un "no puedo", para que alguien las cubra; las confirmadas se mantienen.
 */
export async function darDeBaja(
  servicio: SupabaseClient,
  token: string,
  correo: Correo,
  urlBase: string,
): Promise<"baja" | "ya_de_baja" | "no_encontrada"> {
  if (!tokenValido(token)) return "no_encontrada";
  const { data, error } = await servicio.rpc("dar_de_baja", { p_token: token });
  if (error) {
    traducirErrorEnvio(error);
    throw new Error("No se ha podido registrar la baja");
  }
  const r = data as { resultado: "baja" | "ya_de_baja" | "no_encontrada"; pendientes?: { token: string }[] };
  for (const p of r.pendientes ?? []) {
    await responder(servicio, p.token, "no", correo, urlBase, "baja");
  }
  return r.resultado;
}

/**
 * Para el administrador: busca a alguien para unos alimentos que se quedaron sin
 * cubrir. Devuelve si se ha encontrado.
 */
export async function buscarSustituto(
  cliente: SupabaseClient,
  semanaId: string,
  asignacionId: string,
  correo: Correo,
  urlBase: string,
): Promise<Resultado<{ encontrado: boolean; sinTiempo: boolean }>> {
  // La asignación tiene que ser de la semana de la URL: sus candidatos y su plazo
  // dependen de la fecha de entrega.
  const { data: asignacion } = await cliente.from("asignaciones").select("semana_id").eq("id", asignacionId).maybeSingle();
  if (!asignacion || asignacion.semana_id !== semanaId) return { ok: false, error: "no_encontrado" };
  const datos = await datosReasignacion(cliente, semanaId, new Date());
  if (!datos) return { ok: false, error: "no_encontrado" };
  const { data, error } = await cliente.rpc("buscar_sustituto", {
    p_asignacion_id: asignacionId,
    p_candidatos: datos.candidatos,
    p_plazo: datos.plazo.toISOString(),
  });
  if (error) return { ok: false, error: traducirErrorEnvio(error) };
  const nueva = data as string | null;
  if (nueva) await enviarAsignacion(cliente, nueva, correo, urlBase);
  return { ok: true, valor: { encontrado: Boolean(nueva), sinTiempo: !nueva && plazoVencido(datos.plazo) } };
}
