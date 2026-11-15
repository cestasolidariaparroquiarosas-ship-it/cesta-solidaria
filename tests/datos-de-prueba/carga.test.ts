// Iteración 0002: carga y borrado de los datos de prueba contra el Supabase local de CI.
// Necesita una base sin datos de la app: CI ejecuta antes `supabase db reset --no-seed`.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { cargar, recuentos, TABLAS, TABLAS_FUERA } from "@/scripts/datos-de-prueba/cargar";
import { borrar } from "@/scripts/datos-de-prueba/borrar";
import { esAliasDePrueba } from "@/scripts/datos-de-prueba/datos";
import { semanaEnCurso, semanasSinCerrar } from "@/lib/dominio/inicio";
import { hoyEnMadrid, sumarDias } from "@/lib/fechas";
import type { EstadoSemana } from "@/lib/dominio/semanas";

const URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const BASE = process.env.DEMO_CORREO_BASE ?? "cesta@example.com";
const bd = new Client({ connectionString: URL });
const q = async (sql: string, valores?: unknown[]) => (await bd.query(sql, valores)).rows;
const vacia = Object.fromEntries(TABLAS.map((t) => [t, 0]));

beforeAll(async () => {
  await bd.connect();
  expect(await recuentos(bd), "la base tiene que empezar vacía (supabase db reset --no-seed)").toEqual(vacia);
});
afterAll(async () => {
  await bd.end();
});

describe("carga de los datos de prueba", () => {
  let etiquetas: number;

  it("RD1 y RD3: toda tabla de public está clasificada (vaciable o fuera de la carga)", async () => {
    // Si se añade una tabla y no se clasifica, la carga no la miraría y el borrado podría
    // dejarla con filas: esta prueba obliga a decidir.
    const tablas = (await q("select tablename from pg_tables where schemaname = 'public' order by 1")).map((f) =>
      String(f.tablename),
    );
    expect(tablas).toEqual([...TABLAS, ...TABLAS_FUERA].sort());
  });

  it("CA-0201: crea el catálogo, la lista base, los colaboradores y las 5 semanas", async () => {
    etiquetas = Number((await q("select count(*) n from public.etiquetas_exclusion"))[0].n);
    const r = await cargar(bd, { correoBase: BASE });
    expect(r.colaboradores).toBe(45);
    expect(r.listas_base).toBe(1);
    expect(r.alimentos).toBeGreaterThanOrEqual(40);

    const porEtiqueta = await q(
      `select e.codigo, count(*)::int n from public.alimento_etiquetas ae
       join public.etiquetas_exclusion e on e.id = ae.etiqueta_id group by e.codigo`,
    );
    const n = (c: string) => porEtiqueta.find((f) => f.codigo === c)?.n ?? 0;
    expect(n("cerdo")).toBeGreaterThanOrEqual(3);
    expect(n("lactosa")).toBeGreaterThanOrEqual(3);
    expect((await q("select count(*)::int n from public.listas_base where predeterminada"))[0].n).toBe(1);

    const estados = await q("select estado, count(*)::int n from public.colaboradores group by estado order by estado");
    expect(estados).toEqual([
      { estado: "activo", n: 42 },
      { estado: "baja", n: 1 },
      { estado: "pausado", n: 2 },
    ]);

    const semanas = await q(
      `select s.estado, (select count(*)::int from public.cestas c where c.semana_id = s.id) cestas,
              (select count(*)::int from public.asignaciones a where a.semana_id = s.id) asignaciones
       from public.semanas s order by s.fecha_entrega`,
    );
    expect(semanas.map((s) => s.estado)).toEqual(["cerrada", "cerrada", "cerrada", "enviada", "borrador"]);
    expect(semanas.map((s) => s.cestas)).toEqual([3, 3, 4, 3, 3]);
    expect(semanas[4].asignaciones).toBe(0);
    for (const s of semanas.slice(0, 4)) expect(s.asignaciones).toBeGreaterThan(0);

    // Semana 1: alguien no pudo y alguien no respondió; sus sustitutos confirmaron.
    const s1 = await q(
      `select a.estado, count(*)::int n from public.asignaciones a
       where a.semana_id = (select id from public.semanas order by fecha_entrega limit 1) group by a.estado`,
    );
    expect(s1.find((f) => f.estado === "rechazada")?.n).toBe(1);
    expect(s1.find((f) => f.estado === "sin_respuesta")?.n).toBe(1);
    expect(
      (await q("select count(*)::int n from public.asignaciones where sustituye_a is not null and estado = 'confirmada'"))[0].n,
    ).toBe(2);

    // Semana 2: todo entregado. Semana 3: un confirmado sin marcar como entregado.
    const entregas = await q(
      `select count(*) filter (where a.estado = 'confirmada' and not a.entregado)::int sin_entregar
       from public.semanas s left join public.asignaciones a on a.semana_id = s.id
       where s.estado = 'cerrada' group by s.fecha_entrega order by s.fecha_entrega`,
    );
    expect(entregas.map((f) => f.sin_entregar)).toEqual([0, 0, 1]);

    // Pausas: una hasta D+30 y otra sin fecha.
    const pausas = await q("select pausado_hasta::text from public.colaboradores where estado = 'pausado' order by 1 nulls last");
    expect(pausas.map((f) => f.pausado_hasta)).toEqual([sumarDias(hoyEnMadrid(), 30), null]);

    // Semana 4: hay confirmados, esperando, y un sustituto esperando con su plazo.
    const s4 = await q(
      `select a.estado, a.sustituye_a is not null sustituto, a.enviado_en is not null enviado
       from public.asignaciones a join public.semanas s on s.id = a.semana_id where s.estado = 'enviada'`,
    );
    expect(s4.some((a) => a.estado === "confirmada")).toBe(true);
    expect(s4.some((a) => a.estado === "pendiente" && !a.sustituto)).toBe(true);
    expect(s4.some((a) => a.estado === "pendiente" && a.sustituto)).toBe(true);
    expect(s4.filter((a) => a.estado === "rechazada")).toHaveLength(1);
    // Pocos esperando: 3 más el sustituto (spec §2).
    expect(s4.filter((a) => a.estado === "pendiente")).toHaveLength(4);
    // Constan como enviadas: la tarea diaria no las reenvía al cargar.
    expect(s4.every((a) => a.enviado)).toBe(true);
  });

  it("CA-0202: ninguna cesta choca con sus exclusiones", async () => {
    const choques = await q(
      `select count(*)::int n from public.cesta_items ci
       join public.alimento_etiquetas ae on ae.alimento_id = ci.alimento_id
       join public.cesta_exclusiones ce on ce.cesta_id = ci.cesta_id and ce.etiqueta_id = ae.etiqueta_id`,
    );
    expect(choques[0].n).toBe(0);
    expect((await q("select count(*)::int n from public.cesta_exclusiones"))[0].n).toBeGreaterThan(0);
  });

  it("CA-0202: en cada reparto, cada unidad está asignada una vez y el gasto está equilibrado (CA-11, CA-12)", async () => {
    const descuadres = await q(
      `select ci.id from public.cesta_items ci
       join public.cestas c on c.id = ci.cesta_id
       join public.semanas s on s.id = c.semana_id and s.estado <> 'borrador'
       left join public.asignacion_items ai on ai.cesta_item_id = ci.id
       group by ci.id, ci.cantidad having coalesce(sum(ai.cantidad), 0) <> ci.cantidad`,
    );
    expect(descuadres).toEqual([]);

    const semanas = await q(
      `select s.id,
              max(g.gasto) - min(g.gasto) as diferencia,
              (select max(ci.precio_unitario) from public.cesta_items ci join public.cestas c on c.id = ci.cesta_id
               where c.semana_id = s.id) as pieza
       from public.semanas s
       join (select a.semana_id, a.id, sum(ai.cantidad * ci.precio_unitario) gasto
             from public.asignaciones a
             join public.asignacion_items ai on ai.asignacion_id = a.id
             join public.cesta_items ci on ci.id = ai.cesta_item_id
             group by a.semana_id, a.id) g on g.semana_id = s.id
       group by s.id`,
    );
    expect(semanas).toHaveLength(4);
    for (const s of semanas) expect(Number(s.diferencia)).toBeLessThanOrEqual(Number(s.pieza));
  });

  it("CA-0203: todos los correos son alias +demoNN de la base", async () => {
    const correos = (await q("select email from public.colaboradores")).map((f) => String(f.email));
    expect(correos).toHaveLength(45);
    expect(correos.every((c) => esAliasDePrueba(BASE, c))).toBe(true);
  });

  it("CA-0207: el histórico tiene 3 semanas cerradas e Inicio muestra la semana enviada como semana en curso", async () => {
    const semanas = (await q("select id::text, fecha_entrega::text, estado from public.semanas")) as {
      id: string;
      fecha_entrega: string;
      estado: EstadoSemana;
    }[];
    const hoy = hoyEnMadrid();
    expect(semanas.filter((s) => s.estado === "cerrada")).toHaveLength(3);
    const enCurso = semanaEnCurso(semanas, hoy);
    expect(enCurso?.estado).toBe("enviada");
    expect(enCurso?.fecha_entrega).toBe(sumarDias(hoy, 5));
    expect(semanasSinCerrar(semanas, hoy, enCurso)).toEqual([]);
  });

  it("CA-0206: después de cargar, la comprobación de RLS y permisos sigue pasando", async () => {
    await expect(bd.query(readFileSync("scripts/comprobar-rls.sql", "utf8"))).resolves.toBeDefined();
  });

  it("CA-0204: con datos en la base, la carga falla y no cambia nada", async () => {
    const antes = await recuentos(bd);
    await expect(cargar(bd, { correoBase: BASE })).rejects.toThrow(/no está vacía/);
    expect(await recuentos(bd)).toEqual(antes);
  });

  it("CA-0205: con un colaborador que no es de prueba, el borrado falla y no cambia nada", async () => {
    await q("insert into public.colaboradores (nombre, email) values ('Real', 'alguien@example.org')");
    const antes = await recuentos(bd);
    await expect(borrar(bd, { correoBase: BASE })).rejects.toThrow(/no son de prueba/);
    expect(await recuentos(bd)).toEqual(antes);
    await q("delete from public.colaboradores where email = 'alguien@example.org'");
  });

  it("CA-0205: el borrado deja vacías las tablas de la app y conserva las etiquetas y los eventos ajenos", async () => {
    await q("insert into public.registro_eventos (tipo) values ('correo_prueba')");
    expect(await borrar(bd, { correoBase: BASE })).toEqual(vacia);
    expect((await q("select count(*)::int n from public.registro_eventos where tipo = 'correo_prueba'"))[0].n).toBe(1);
    await q("delete from public.registro_eventos where tipo = 'correo_prueba'");
    expect(Number((await q("select count(*) n from public.etiquetas_exclusion"))[0].n)).toBe(etiquetas);
    expect(
      (await q("select count(*)::int n from public.registro_eventos where semana_id is not null or asignacion_id is not null"))[0].n,
    ).toBe(0);
  });

  it("CA-0201: después de borrar se puede volver a cargar", async () => {
    const r = await cargar(bd, { correoBase: BASE });
    expect(r.semanas).toBe(5);
    expect(await borrar(bd, { correoBase: BASE })).toEqual(vacia);
  });
});
