import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { costeCesta } from "@/lib/dominio/cesta";
import { repartir } from "@/lib/dominio/reparto";
import { seleccionar } from "@/lib/dominio/seleccion";
import { listarColaboradores } from "@/lib/servicios/colaboradores";
import {
  cambiarColaborador,
  itemsDeSemana,
  listarCandidatos,
  moverEnReparto,
  obtenerReparto,
  proponerReparto,
  tieneReparto,
} from "@/lib/servicios/reparto";
import { anadirACesta, cambiarCantidadCesta, crearSemana, guardarCesta, obtenerCesta } from "@/lib/servicios/semanas";
import {
  ADMIN_PRUEBAS,
  SIN_ROL_PRUEBAS,
  asegurarUsuariosPruebas,
  clienteConSesion,
  clienteServicio,
} from "../utilidades/supabase";

// Selección y reparto contra Supabase local (plan PR 5, R2 y R3, CA-09 a CA-13).
// Los colaboradores de la base de datos los comparten todas las pruebas: aquí se
// trabaja solo con los creados en este archivo (los que llevan MARCA en el correo).

const MARCA = `reparto-${Date.now()}`;

function fechaUnica(anioBase = 2900) {
  const dias = Math.floor(Math.random() * 300_000);
  return new Date(Date.UTC(anioBase, 0, 1) + dias * 86_400_000).toISOString().slice(0, 10);
}
const futuro = () => new Date(Date.now() + 86_400_000).toISOString();

describe("selección y reparto", () => {
  let admin: SupabaseClient;
  let sinRol: SupabaseClient;
  const servicio = clienteServicio();
  const semanas: string[] = [];
  const col: Record<string, string> = {};
  let arroz: string;
  let aceite: string;

  async function colaborador(nombre: string, creadoEn: string) {
    const { data, error } = await servicio
      .from("colaboradores")
      .insert({ nombre: `${MARCA} ${nombre}`, email: `${MARCA}-${nombre}@cesta.test`.toLowerCase(), creado_en: creadoEn })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    col[nombre] = data.id;
  }

  async function semana(fecha = fechaUnica()) {
    const r = await crearSemana(admin, { fecha_entrega: fecha, precio_base: 20, plazo_confirmacion: futuro() });
    if (!r.ok) throw new Error(r.error);
    semanas.push(r.valor.id);
    return r.valor.id;
  }

  /** Una semana con una cesta de N arroces (1,20 €) y M aceites (7,50 €). */
  async function semanaConCesta(arroces: number, aceites: number) {
    const id = await semana();
    const items = [
      ...(arroces ? [{ alimento_id: arroz, cantidad: arroces }] : []),
      ...(aceites ? [{ alimento_id: aceite, cantidad: aceites }] : []),
    ];
    const r = await guardarCesta(admin, {
      id: null,
      semanaId: id,
      datos: { identificador_receptor: "Familia R", adultos: 2, ninos: 0, lista_base_id: null, exclusiones: [] },
      items,
    });
    if (!r.ok) throw new Error(r.error);
    return { id, cestaId: r.valor.id };
  }

  /** Lo mismo que hace la acción "Proponer reparto", con los colaboradores de esta prueba. */
  async function proponer(semanaId: string, fechaEntrega: string) {
    const [items, candidatos] = await Promise.all([itemsDeSemana(admin, semanaId), listarCandidatos(admin)]);
    if (!items.ok || !candidatos.ok) throw new Error("No se pudieron leer los datos");
    const mios = candidatos.valor.filter((c) => c.nombre.startsWith(MARCA));
    const seleccion = seleccionar(mios, { fechaEntrega, costeTotal: costeCesta(items.valor), precioBase: 20 });
    const reparto = repartir(
      items.valor,
      seleccion.elegidos.map((c) => c.id),
    );
    const r = await proponerReparto(admin, semanaId, reparto);
    return { r, seleccion, items: items.valor };
  }

  async function fechaDe(semanaId: string) {
    const { data } = await servicio.from("semanas").select("fecha_entrega").eq("id", semanaId).single();
    return data!.fecha_entrega as string;
  }

  beforeAll(async () => {
    await asegurarUsuariosPruebas();
    admin = await clienteConSesion(ADMIN_PRUEBAS);
    sinRol = await clienteConSesion(SIN_ROL_PRUEBAS);

    const { data: alimentos, error } = await servicio
      .from("alimentos")
      .insert([
        { nombre: `${MARCA} arroz`, unidad: "paquete 1 kg", precio_aprox: 1.2 },
        { nombre: `${MARCA} aceite`, unidad: "botella 1 l", precio_aprox: 7.5 },
      ])
      .select("id, nombre");
    if (error) throw new Error(error.message);
    arroz = alimentos.find((a) => a.nombre.endsWith("arroz"))!.id;
    aceite = alimentos.find((a) => a.nombre.endsWith("aceite"))!.id;

    // A nunca ha participado; B, hace 3 semanas; C, la semana pasada (CA-10).
    // C se dio de alta la primera, para que el orden no salga por la fecha de alta.
    await colaborador("C", "2026-01-01T00:00:00Z");
    await colaborador("B", "2026-02-01T00:00:00Z");
    await colaborador("A", "2026-03-01T00:00:00Z");
    for (const [nombre, dias] of [
      ["B", 21],
      ["C", 7],
    ] as const) {
      // Semanas pasadas (1900 + días), con una asignación confirmada.
      const fecha = new Date(Date.UTC(1900, 0, 30) - dias * 86_400_000).toISOString().slice(0, 10);
      const { data: s } = await servicio
        .from("semanas")
        .insert({
          fecha_entrega: fecha,
          precio_base: 20,
          plazo_confirmacion: futuro(),
          estado: "cerrada",
          cerrada_en: new Date().toISOString(),
        })
        .select("id")
        .single();
      semanas.push(s!.id);
      const { error: e } = await servicio
        .from("asignaciones")
        .insert({ semana_id: s!.id, colaborador_id: col[nombre], estado: "confirmada", respondido_en: new Date().toISOString() });
      if (e) throw new Error(e.message);
    }
  });

  afterAll(async () => {
    if (semanas.length) await servicio.from("semanas").delete().in("id", semanas);
    await servicio.from("colaboradores").delete().like("email", `${MARCA}%`);
    await servicio.from("alimentos").delete().like("nombre", `${MARCA}%`);
  });

  describe("R2: selección", () => {
    it("CA-10: la última participación sale de la vista agregada; con N = 2 se eligen A y B", async () => {
      // 4 arroces × 1,20 + 3 aceites × 7,50 = 27,30 €: N = 2.
      const { id } = await semanaConCesta(4, 3);
      const { r, seleccion } = await proponer(id, await fechaDe(id));
      expect(r.ok).toBe(true);
      expect(seleccion.necesarios).toBe(2);
      expect(seleccion.elegidos.map((c) => c.id)).toEqual([col.A, col.B]);

      const reparto = await obtenerReparto(admin, id);
      expect(reparto.ok && reparto.valor.map((a) => a.colaborador?.id).sort()).toEqual([col.A, col.B].sort());
      expect(reparto.ok && reparto.valor.every((a) => a.estado === "propuesta")).toBe(true);

      // La lista de colaboradores usa la misma vista.
      const lista = await listarColaboradores(admin);
      const fila = lista.ok ? lista.valor.find((c) => c.id === col.C) : undefined;
      expect(fila?.ultima_participacion).toBe("1900-01-23");
    });

    it("CA-09: 95 € de coste con 20 € de precio base: hacen falta 5", async () => {
      // 10 aceites × 7,50 + 17 arroces × 1,20 = 95,40 € → redondeo hacia arriba de 4,77 = 5.
      const { id } = await semanaConCesta(17, 10);
      const items = await itemsDeSemana(admin, id);
      expect(items.ok && costeCesta(items.valor)).toBe(95.4);
      const { seleccion } = await proponer(id, await fechaDe(id));
      expect(seleccion.necesarios).toBe(5);
    });

    it("CA-13: con menos candidatos que N se reparte todo entre los disponibles y se avisa", async () => {
      const { id } = await semanaConCesta(17, 10);
      const { r, seleccion } = await proponer(id, await fechaDe(id));
      expect(r.ok).toBe(true);
      expect(seleccion).toMatchObject({ necesarios: 5, faltan: 2 });
      const reparto = await obtenerReparto(admin, id);
      expect(reparto.ok && reparto.valor).toHaveLength(3);
      // Todo repartido: 17 arroces y 10 aceites.
      const unidades = reparto.ok ? reparto.valor.flatMap((a) => a.items).reduce((t, i) => t + i.cantidad, 0) : 0;
      expect(unidades).toBe(27);
    });

    it("CA-02: un colaborador en pausa hasta la entrega no se elige", async () => {
      const fecha = fechaUnica();
      const { id } = await semanaConCesta(4, 3);
      await servicio.from("semanas").update({ fecha_entrega: fecha }).eq("id", id);
      // Directamente en la base de datos: A ya tiene repartos propuestos de las pruebas
      // anteriores, y la app no deja pausar a quien tiene una asignación en curso.
      await servicio.from("colaboradores").update({ estado: "pausado", pausado_hasta: fecha }).eq("id", col.A);
      try {
        const { seleccion } = await proponer(id, fecha);
        expect(seleccion.elegidos.map((c) => c.id)).toEqual([col.B, col.C]);
      } finally {
        await servicio.from("colaboradores").update({ estado: "activo", pausado_hasta: null }).eq("id", col.A);
      }
    });
  });

  describe("R3: reparto", () => {
    it("CA-11 y CA-12: todo se asigna una vez y la diferencia de gasto no supera la pieza más cara", async () => {
      const { id } = await semanaConCesta(9, 4);
      const { r } = await proponer(id, await fechaDe(id));
      expect(r.ok).toBe(true);
      const reparto = await obtenerReparto(admin, id);
      if (!reparto.ok) throw new Error(reparto.error);
      const gastos = reparto.valor.map((a) => costeCesta(a.items));
      expect(Math.max(...gastos) - Math.min(...gastos)).toBeLessThanOrEqual(7.5);
      const total = (alimento: string) =>
        reparto.valor.flatMap((a) => a.items).filter((i) => i.alimento_id === alimento).reduce((t, i) => t + i.cantidad, 0);
      expect([total(arroz), total(aceite)]).toEqual([9, 4]);
    });

    it("CA-12: la base de datos rechaza un reparto que no cubre todas las unidades, y no guarda nada", async () => {
      const { id } = await semanaConCesta(4, 0);
      const items = await itemsDeSemana(admin, id);
      if (!items.ok) throw new Error(items.error);
      const incompleto = [{ colaborador_id: col.A, items: [{ cesta_item_id: items.valor[0].cesta_item_id, cantidad: 3 }] }];
      expect(await proponerReparto(admin, id, incompleto)).toEqual({ ok: false, error: "incompleto" });
      const repetido = [{ colaborador_id: col.A, items: [{ cesta_item_id: items.valor[0].cesta_item_id, cantidad: 5 }] }];
      expect(await proponerReparto(admin, id, repetido)).toEqual({ ok: false, error: "incompleto" });
      expect(await tieneReparto(admin, id)).toBe(false);
    });

    it("R3.5: mover alimentos y cambiar de colaborador; quien se queda sin nada sale", async () => {
      const { id } = await semanaConCesta(4, 1);
      const items = await itemsDeSemana(admin, id);
      if (!items.ok) throw new Error(items.error);
      const ci = (alimento: string) => items.valor.find((i) => i.alimento_id === alimento)!.cesta_item_id;
      // A: 1 aceite; B: 4 arroces.
      expect(
        await proponerReparto(admin, id, [
          { colaborador_id: col.A, items: [{ cesta_item_id: ci(aceite), cantidad: 1 }] },
          { colaborador_id: col.B, items: [{ cesta_item_id: ci(arroz), cantidad: 4 }] },
        ]),
      ).toEqual({ ok: true, valor: 2 });
      const asignacion = async (c: string) => {
        const r = await obtenerReparto(admin, id);
        return r.ok ? r.valor.find((a) => a.colaborador?.id === c) : undefined;
      };
      const a = (await asignacion(col.A))!;
      const b = (await asignacion(col.B))!;

      const mover = (origen: string, destino: string, cantidad: number) =>
        moverEnReparto(admin, { origen, destino, alimentoId: arroz, unidad: "paquete 1 kg", cantidad });
      expect(await mover(b.id, a.id, 2)).toEqual({ ok: true, valor: { origenEliminado: false } });
      expect((await asignacion(col.A))?.items.find((i) => i.alimento_id === arroz)?.cantidad).toBe(2);
      expect(await mover(b.id, a.id, 3)).toEqual({ ok: false, error: "cantidad_insuficiente" });
      expect(await mover(b.id, b.id, 1)).toEqual({ ok: false, error: "mismo_colaborador" });

      // Cambiar a A por C; y a C por B no se puede: B ya está.
      expect(await cambiarColaborador(admin, id, a.id, col.C)).toEqual({ ok: true, valor: undefined });
      expect(await cambiarColaborador(admin, id, a.id, col.B)).toEqual({ ok: false, error: "duplicado" });

      // B pasa sus 2 arroces restantes: se queda sin nada y sale del reparto.
      expect(await mover(b.id, a.id, 2)).toEqual({ ok: true, valor: { origenEliminado: true } });
      const r = await obtenerReparto(admin, id);
      expect(r.ok && r.valor.map((x) => x.colaborador?.id)).toEqual([col.C]);
      expect(r.ok && r.valor[0].items.reduce((t, i) => t + i.cantidad, 0)).toBe(5);
    });

    it("cambiar una cesta descarta el reparto propuesto (también quitar un alimento ya repartido)", async () => {
      const { id, cestaId } = await semanaConCesta(4, 1);
      expect((await proponer(id, await fechaDe(id))).r.ok).toBe(true);
      expect(await tieneReparto(admin, id)).toBe(true);

      const cesta = await obtenerCesta(admin, cestaId);
      const item = cesta.ok ? cesta.valor.items.find((i) => i.alimento_id === arroz) : undefined;
      expect(await cambiarCantidadCesta(admin, cestaId, item!.id, 6)).toEqual({ ok: true, valor: undefined });
      expect(await tieneReparto(admin, id)).toBe(false);

      // Se vuelve a proponer, y añadir otro alimento a la cesta también lo descarta.
      expect((await proponer(id, await fechaDe(id))).r.ok).toBe(true);
      const otro = await servicio
        .from("alimentos")
        .insert({ nombre: `${MARCA} lentejas`, unidad: "paquete 1 kg", precio_aprox: 1.8 })
        .select("id")
        .single();
      expect(await anadirACesta(admin, cestaId, otro.data!.id, 1)).toEqual({ ok: true, valor: undefined });
      expect(await tieneReparto(admin, id)).toBe(false);
    });

    it("una semana enviada no deja cambiar el reparto", async () => {
      const { id } = await semanaConCesta(4, 1);
      expect((await proponer(id, await fechaDe(id))).r.ok).toBe(true);
      const reparto = await obtenerReparto(admin, id);
      const [a, b] = reparto.ok ? reparto.valor : [];
      await servicio.from("semanas").update({ estado: "enviada" }).eq("id", id);
      expect(await proponerReparto(admin, id, [])).toEqual({ ok: false, error: "no_editable" });
      const movido = await moverEnReparto(admin, {
        origen: a.id,
        destino: b.id,
        alimentoId: arroz,
        unidad: "paquete 1 kg",
        cantidad: 1,
      });
      expect(movido.ok).toBe(false);
    });
  });

  describe("permisos (CA-23)", () => {
    it("sin rol de administrador no se ven candidatos ni repartos, ni se puede proponer", async () => {
      const { id } = await semanaConCesta(4, 1);
      expect((await proponer(id, await fechaDe(id))).r.ok).toBe(true);
      expect(await listarCandidatos(sinRol)).toEqual({ ok: true, valor: [] });
      expect(await obtenerReparto(sinRol, id)).toEqual({ ok: true, valor: [] });
      expect(await proponerReparto(sinRol, id, [])).toEqual({ ok: false, error: "no_encontrado" });
      expect(await tieneReparto(admin, id)).toBe(true);
    });
  });
});
