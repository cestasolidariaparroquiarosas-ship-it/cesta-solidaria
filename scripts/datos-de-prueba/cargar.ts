// Carga de los datos de prueba (iteración 0002). Usa las reglas de la app (R1 a R3) y sus
// funciones SQL, así que lo que se ve es lo que la app habría hecho. Todo en una
// transacción (RD2), y solo en una base vacía (RD1).
//
// RGPD: no escribe nombres ni correos en ningún registro; solo recuentos.

import { proponerCesta, type ItemPlantilla } from "../../lib/dominio/cesta";
import { candidatosOrdenados, seleccionar, type Candidato } from "../../lib/dominio/seleccion";
import { repartir, type ItemRepartible } from "../../lib/dominio/reparto";
import { plazoReasignacion } from "../../lib/dominio/plazos";
import { hoyEnMadrid, instanteDeMadrid, sumarDias } from "../../lib/fechas";
import { ajustar } from "./ajuste";
import {
  aliasDeCorreo,
  CAMBIOS_DE_ESTADO,
  FAMILIAS,
  HORA_PLAZO,
  LISTA_BASE,
  NOMBRES,
  PRECIO_BASE,
  PRODUCTOS,
  SEMANAS,
  type SemanaDePrueba,
} from "./datos";

/** Lo mínimo de una conexión a Postgres: lo cumplen `pg` y PGlite. */
export type Bd = { query: (texto: string, valores?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

/** Error previsto (RD1, RD3): se muestra tal cual, porque no lleva datos personales. */
export class ErrorDatosDePrueba extends Error {}

/** Tablas de la app, de las hijas a las madres. `etiquetas_exclusion` no se toca. */
export const TABLAS = [
  "asignacion_items",
  "asignaciones",
  "cesta_items",
  "cesta_exclusiones",
  "cestas",
  "semanas",
  "colaboradores",
  "lista_base_items",
  "listas_base",
  "alimento_etiquetas",
  "alimentos",
] as const;

const ADMINISTRADOR = JSON.stringify({ role: "authenticated", app_metadata: { rol: "admin" } });
const HORA_MS = 3_600_000;

export type Resumen = Record<string, number>;

/** Recuento de filas de cada tabla de la app (solo números). */
export async function recuentos(bd: Bd): Promise<Resumen> {
  const resumen: Resumen = {};
  for (const tabla of TABLAS) {
    const { rows } = await bd.query(`select count(*)::int as n from public.${tabla}`);
    resumen[tabla] = Number(rows[0].n);
  }
  return resumen;
}

export async function enTransaccion<T>(bd: Bd, trabajo: () => Promise<T>): Promise<T> {
  await bd.query("begin");
  try {
    // Como una sesión de administrador: las funciones de la app lo comprueban igual.
    await bd.query("select set_config('request.jwt.claims', $1, true)", [ADMINISTRADOR]);
    const resultado = await trabajo();
    await bd.query("commit");
    return resultado;
  } catch (e) {
    await bd.query("rollback");
    throw e;
  }
}

export async function cargar(bd: Bd, opciones: { correoBase: string; ahora?: Date }): Promise<Resumen> {
  const ahora = opciones.ahora ?? new Date();
  const hoy = hoyEnMadrid(ahora);
  // Comprueba la base antes de empezar: si no es válida, falla sin tocar nada.
  aliasDeCorreo(opciones.correoBase, 1);

  return enTransaccion(bd, async () => {
    // RD1: solo en una base vacía.
    const antes = await recuentos(bd);
    const ocupadas = Object.entries(antes).filter(([, n]) => n > 0);
    if (ocupadas.length)
      throw new ErrorDatosDePrueba(
        `La base de datos no está vacía (${ocupadas.map(([t, n]) => `${t}: ${n}`).join(", ")}). No se ha cargado nada.`,
      );

    const q = async (texto: string, valores?: unknown[]) => (await bd.query(texto, valores)).rows;

    // Etiquetas de la migración inicial.
    const etiquetas = new Map<string, string>(
      (await q("select codigo, id::text from public.etiquetas_exclusion")).map((e) => [String(e.codigo), String(e.id)]),
    );
    const etiqueta = (codigo: string) => {
      const id = etiquetas.get(codigo);
      if (!id) throw new ErrorDatosDePrueba(`Falta la etiqueta de exclusión «${codigo}»`);
      return id;
    };

    // Catálogo.
    const alimentos = new Map<string, string>();
    for (const p of PRODUCTOS) {
      const [{ id }] = await q(
        "insert into public.alimentos (nombre, unidad, precio_aprox) values ($1, $2, $3) returning id::text",
        [p.nombre, p.unidad, p.precio],
      );
      alimentos.set(p.clave, String(id));
      for (const codigo of p.etiquetas)
        await q("insert into public.alimento_etiquetas (alimento_id, etiqueta_id) values ($1, $2)", [id, etiqueta(codigo)]);
    }
    const alimento = (clave: string) => alimentos.get(clave)!;

    // Lista base: la cesta tipo ajustada por adulto y por niño.
    const [{ id: listaId }] = await q(
      "insert into public.listas_base (nombre, predeterminada) values ($1, true) returning id::text",
      [LISTA_BASE],
    );
    const plantilla: ItemPlantilla[] = [];
    for (const p of PRODUCTOS) {
      if (!p.tramos) continue;
      const a = ajustar(p.tramos);
      if (a.porAdulto === 0 && a.porNino === 0) continue;
      await q(
        `insert into public.lista_base_items (lista_base_id, alimento_id, cantidad_por_adulto, cantidad_por_nino)
         values ($1, $2, $3, $4)`,
        [listaId, alimento(p.clave), a.porAdulto, a.porNino],
      );
      plantilla.push({
        alimento: { id: alimento(p.clave), nombre: p.nombre, unidad: p.unidad, activo: true, etiquetas: p.etiquetas.map(etiqueta) },
        cantidad_por_adulto: a.porAdulto,
        cantidad_por_nino: a.porNino,
      });
    }

    // Colaboradores: todos activos al principio; altas escalonadas para que el orden de
    // R2 a igualdad de participación sea estable.
    const colaboradores: string[] = [];
    for (const [i, nombre] of NOMBRES.entries()) {
      const alta = new Date(ahora.getTime() - (400 - i) * 24 * HORA_MS);
      const [{ id }] = await q(
        `insert into public.colaboradores (nombre, email, estado, fecha_consentimiento, creado_en)
         values ($1, $2, 'activo', $3, $3) returning id::text`,
        [nombre, aliasDeCorreo(opciones.correoBase, i + 1), alta.toISOString()],
      );
      colaboradores.push(String(id));
    }

    let estadosAplicados = false;
    for (const semana of SEMANAS) {
      // Las pausas y la baja son recientes: después de las semanas pasadas.
      if (semana.estado !== "cerrada" && !estadosAplicados) {
        for (const c of CAMBIOS_DE_ESTADO) {
          const hasta = c.estado === "pausado" && c.pausaDias != null ? sumarDias(hoy, c.pausaDias) : null;
          await q("update public.colaboradores set estado = $2, pausado_hasta = $3 where id = $1", [
            colaboradores[c.posicion],
            c.estado,
            hasta,
          ]);
        }
        estadosAplicados = true;
      }
      await cargarSemana(q, semana, { ahora, hoy, listaId: String(listaId), plantilla, etiqueta, alimento });
    }

    return recuentos(bd);
  });
}

type Q = (texto: string, valores?: unknown[]) => Promise<Record<string, unknown>[]>;

function instante(fecha: string, hora: string): Date {
  const i = instanteDeMadrid(fecha, hora);
  if (!i) throw new Error(`Fecha u hora no válida: ${fecha} ${hora}`);
  return i;
}

async function candidatos(q: Q): Promise<Candidato[]> {
  const filas = await q(
    `select c.id::text, c.estado, c.pausado_hasta::text, c.creado_en::text, u.ultima_participacion::text
     from public.colaboradores c
     left join public.ultimas_participaciones u on u.colaborador_id = c.id
     where c.estado <> 'baja'`,
  );
  return filas.map((f) => ({
    id: String(f.id),
    estado: f.estado as Candidato["estado"],
    pausado_hasta: (f.pausado_hasta as string | null) ?? null,
    creado_en: new Date(String(f.creado_en)).toISOString(),
    ultima_participacion: (f.ultima_participacion as string | null) ?? null,
  }));
}

/** Candidatos para sustituir: R2, sin los que ya están en el reparto de esa semana. */
async function candidatosParaSustituir(q: Q, semanaId: string, fecha: string): Promise<string[]> {
  const ya = new Set(
    (await q("select colaborador_id::text from public.asignaciones where semana_id = $1 and colaborador_id is not null", [semanaId])).map(
      (f) => String(f.colaborador_id),
    ),
  );
  return candidatosOrdenados(await candidatos(q), fecha, ya).map((c) => c.id);
}

async function responder(q: Q, token: string, respuesta: "si" | "no", candidatosIds: string[] = [], plazo?: Date) {
  const [{ r }] = await q("select public.responder_asignacion($1, $2, $3::uuid[], $4) as r", [
    token,
    respuesta,
    candidatosIds,
    plazo?.toISOString() ?? null,
  ]);
  const resultado = r as { resultado: string; nueva?: string | null };
  const esperado = respuesta === "si" ? "confirmada" : "rechazada";
  if (resultado.resultado !== esperado) throw new Error(`Respuesta inesperada: ${resultado.resultado}`);
  return resultado.nueva ?? null;
}

async function token(q: Q, asignacionId: string): Promise<string> {
  const [{ token: t }] = await q("select token from public.asignaciones where id = $1", [asignacionId]);
  return String(t);
}

async function cargarSemana(
  q: Q,
  semana: SemanaDePrueba,
  c: {
    ahora: Date;
    hoy: string;
    listaId: string;
    plantilla: ItemPlantilla[];
    etiqueta: (codigo: string) => string;
    alimento: (clave: string) => string;
  },
) {
  const fecha = sumarDias(c.hoy, semana.entrega);
  const plazoReal = instante(sumarDias(c.hoy, semana.plazo), HORA_PLAZO);
  const pasada = semana.estado === "cerrada";
  // Las funciones de la app no aceptan plazos pasados: las semanas pasadas se preparan
  // con un plazo provisional y después se les pone el suyo (spec §2).
  const plazoProvisional = new Date(c.ahora.getTime() + HORA_MS);

  const [{ id }] = await q(
    "insert into public.semanas (fecha_entrega, precio_base, plazo_confirmacion) values ($1, $2, $3) returning id::text",
    [fecha, PRECIO_BASE, (pasada ? plazoProvisional : plazoReal).toISOString()],
  );
  const semanaId = String(id);

  // R1: cestas propuestas con la lista base, más los casos especiales a mano.
  for (const clave of semana.familias) {
    const f = FAMILIAS[clave];
    const exclusiones = f.exclusiones.map(c.etiqueta);
    const propuesta = proponerCesta({ adultos: f.adultos, ninos: f.ninos, exclusiones }, c.plantilla);
    const items = [...propuesta.items, ...f.extras.map((e) => ({ alimento_id: c.alimento(e.clave), cantidad: e.cantidad }))];
    await q("select public.guardar_cesta(null, $1, $2, $3, $4, $5, $6::uuid[], $7::jsonb)", [
      semanaId,
      f.identificador,
      f.adultos,
      f.ninos,
      c.listaId,
      exclusiones,
      JSON.stringify(items),
    ]);
  }
  if (semana.estado === "borrador") return;

  // R2 y R3, como en la pantalla de reparto.
  const items: ItemRepartible[] = (
    await q(
      `select ci.id::text as cesta_item_id, ci.alimento_id::text, ci.cantidad, ci.precio_unitario
       from public.cesta_items ci join public.cestas ce on ce.id = ci.cesta_id
       where ce.semana_id = $1`,
      [semanaId],
    )
  ).map((f) => ({
    cesta_item_id: String(f.cesta_item_id),
    alimento_id: String(f.alimento_id),
    cantidad: Number(f.cantidad),
    precio_unitario: Number(f.precio_unitario),
  }));
  const costeTotal = items.reduce((s, i) => s + Math.round(i.precio_unitario * 100) * i.cantidad, 0) / 100;
  const { elegidos } = seleccionar(await candidatos(q), { fechaEntrega: fecha, costeTotal, precioBase: PRECIO_BASE });
  const reparto = repartir(
    items,
    elegidos.map((e) => e.id),
  );
  await q("select public.proponer_reparto($1, $2::jsonb)", [
    semanaId,
    JSON.stringify(reparto.map(({ colaborador_id, items: i }) => ({ colaborador_id, items: i }))),
  ]);
  await q("select public.enviar_semana($1)", [semanaId]);

  // Las asignaciones en el orden del reparto (R2).
  const orden = new Map(reparto.map((r, i) => [r.colaborador_id, i]));
  const asignaciones = (await q("select id::text, colaborador_id::text from public.asignaciones where semana_id = $1", [semanaId]))
    .map((f) => ({ id: String(f.id), colaborador: String(f.colaborador_id) }))
    .sort((a, b) => orden.get(a.colaborador)! - orden.get(b.colaborador)!);

  if (semana.estado === "enviada") {
    await q("update public.asignaciones set enviado_en = $2 where semana_id = $1", [semanaId, c.ahora.toISOString()]);
    const [primeros, resto] = [asignaciones.slice(0, semana.noPueden), asignaciones.slice(semana.noPueden)];
    for (const a of primeros) {
      const plazo = plazoReasignacion(c.ahora, fecha);
      const nueva = await responder(q, await token(q, a.id), "no", await candidatosParaSustituir(q, semanaId, fecha), plazo);
      if (nueva) await q("update public.asignaciones set enviado_en = $2 where id = $1", [nueva, c.ahora.toISOString()]);
    }
    for (const a of resto.slice(0, Math.floor(resto.length / 2))) await responder(q, await token(q, a.id), "si");
    return;
  }

  // Semana pasada: noPueden, sinRespuesta y el resto confirma. Los sustitutos confirman.
  const envio = instante(sumarDias(c.hoy, semana.plazo - 3), "10:00");
  const sustituciones: { original: string; nueva: string }[] = [];
  let i = 0;
  for (const a of asignaciones.slice(i, (i += semana.noPueden))) {
    const nueva = await responder(q, await token(q, a.id), "no", await candidatosParaSustituir(q, semanaId, fecha), plazoProvisional);
    if (nueva) sustituciones.push({ original: a.id, nueva });
  }
  for (const a of asignaciones.slice(i, (i += semana.sinRespuesta))) {
    // Lo que haría la tarea diaria al vencer el plazo.
    await q("update public.asignaciones set estado = 'sin_respuesta' where id = $1", [a.id]);
    const [{ nueva }] = await q("select privado.reasignar($1, $2::uuid[], $3)::text as nueva", [
      a.id,
      await candidatosParaSustituir(q, semanaId, fecha),
      plazoProvisional.toISOString(),
    ]);
    if (nueva) sustituciones.push({ original: a.id, nueva: String(nueva) });
  }
  for (const a of asignaciones.slice(i)) await responder(q, await token(q, a.id), "si");
  for (const s of sustituciones) await responder(q, await token(q, s.nueva), "si");

  // Fechas realistas: envío tres días antes del plazo, respuestas escalonadas.
  await q("update public.semanas set plazo_confirmacion = $2 where id = $1", [semanaId, plazoReal.toISOString()]);
  for (const [n, a] of asignaciones.entries()) {
    await q(
      `update public.asignaciones set plazo = $2, enviado_en = $3,
         respondido_en = case when respondido_en is null then null else $4::timestamptz end
       where id = $1`,
      [a.id, plazoReal.toISOString(), envio.toISOString(), new Date(envio.getTime() + (n + 1) * 2 * HORA_MS).toISOString()],
    );
  }
  for (const [n, s] of sustituciones.entries()) {
    const reenvio = new Date(plazoReal.getTime() - (n + 1) * HORA_MS);
    await q("update public.asignaciones set enviado_en = $2, plazo = $3, respondido_en = $4 where id = $1", [
      s.nueva,
      reenvio.toISOString(),
      plazoReasignacion(reenvio, fecha).toISOString(),
      new Date(reenvio.getTime() + 3 * HORA_MS).toISOString(),
    ]);
  }

  // Entregas: todas las confirmadas, salvo las últimas `sinEntregar`.
  const confirmadas = (
    await q("select id::text from public.asignaciones where semana_id = $1 and estado = 'confirmada' order by respondido_en, id", [
      semanaId,
    ])
  ).map((f) => String(f.id));
  const entregadas = confirmadas.slice(0, confirmadas.length - semana.sinEntregar);
  await q("update public.asignaciones set entregado = true where id = any ($1::uuid[])", [entregadas]);

  await q("select public.cerrar_semana($1)", [semanaId]);
  await q("update public.semanas set cerrada_en = $2 where id = $1", [semanaId, instante(sumarDias(fecha, 2), "12:00").toISOString()]);
}
