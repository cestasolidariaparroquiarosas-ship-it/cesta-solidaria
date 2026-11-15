import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anadirALista, crearLista, guardarAlimento, obtenerAlimento } from "@/lib/servicios/catalogo";
import { choquesEnCesta, proponerCesta, type DatosCesta } from "@/lib/dominio/cesta";
import {
  anadirACesta,
  cambiarCantidadCesta,
  crearSemana,
  eliminarCesta,
  eliminarSemana,
  guardarCesta,
  guardarSemana,
  listarSemanas,
  obtenerCesta,
  obtenerSemana,
  plantillaDeLista,
  quitarDeCesta,
} from "@/lib/servicios/semanas";
import {
  ADMIN_PRUEBAS,
  SIN_ROL_PRUEBAS,
  asegurarUsuariosPruebas,
  clienteConSesion,
  clienteServicio,
} from "../utilidades/supabase";

// Semanas y cestas contra Supabase local (plan PR 4, R1, CA-05 a CA-08).

const MARCA = `semanas-${Date.now()}`;

function fechaUnica() {
  const dias = Math.floor(Math.random() * 300_000);
  return new Date(Date.UTC(2900, 0, 1) + dias * 86_400_000).toISOString().slice(0, 10);
}

const futuro = () => new Date(Date.now() + 86_400_000).toISOString();

describe("servicio de semanas y cestas", () => {
  let admin: SupabaseClient;
  let sinRol: SupabaseClient;
  const servicio = clienteServicio();
  const semanasCreadas: string[] = [];
  let cerdo: string;
  let gluten: string;
  let arroz: string;
  let chorizo: string;
  let lentejas: string;
  let lista: string;

  async function alimento(nombre: string, precio: number, etiquetas: string[] = []) {
    const r = await guardarAlimento(admin, null, {
      nombre: `${MARCA} ${nombre}`,
      unidad: "paquete 1 kg",
      precio_aprox: precio,
      activo: true,
      etiquetas,
    });
    if (!r.ok) throw new Error(`No se pudo crear el alimento: ${r.error}`);
    return r.valor.id;
  }

  async function semana() {
    const r = await crearSemana(admin, { fecha_entrega: fechaUnica(), precio_base: 20, plazo_confirmacion: futuro() });
    if (!r.ok) throw new Error(`No se pudo crear la semana: ${r.error}`);
    semanasCreadas.push(r.valor.id);
    return r.valor.id;
  }

  /** Lo mismo que hace la pantalla: propuesta de R1 con la lista base y alta de una vez. */
  async function cestaPropuesta(semanaId: string, datos: Partial<DatosCesta> = {}) {
    const d: DatosCesta = {
      identificador_receptor: "Familia 1",
      adultos: 2,
      ninos: 1,
      lista_base_id: lista,
      exclusiones: [],
      ...datos,
    };
    const plantilla = await plantillaDeLista(admin, lista);
    if (!plantilla.ok) throw new Error(plantilla.error);
    const propuesta = proponerCesta(d, plantilla.valor);
    const r = await guardarCesta(admin, { id: null, semanaId, datos: d, items: propuesta.items });
    if (!r.ok) throw new Error(`No se pudo crear la cesta: ${r.error}`);
    return { id: r.valor.id, propuesta };
  }

  async function itemDe(cestaId: string, alimentoId: string) {
    const c = await obtenerCesta(admin, cestaId);
    if (!c.ok) throw new Error(c.error);
    return c.valor.items.find((i) => i.alimento_id === alimentoId);
  }

  beforeAll(async () => {
    await asegurarUsuariosPruebas();
    admin = await clienteConSesion(ADMIN_PRUEBAS);
    sinRol = await clienteConSesion(SIN_ROL_PRUEBAS);
    const { data } = await servicio.from("etiquetas_exclusion").select("id, codigo").in("codigo", ["cerdo", "gluten"]);
    cerdo = data!.find((e) => e.codigo === "cerdo")!.id;
    gluten = data!.find((e) => e.codigo === "gluten")!.id;

    arroz = await alimento("arroz", 1.2);
    chorizo = await alimento("chorizo", 2.5, [cerdo]);
    lentejas = await alimento("lentejas", 1.8);
    const l = await crearLista(admin, `${MARCA} lista`);
    if (!l.ok) throw new Error(l.error);
    lista = l.valor.id;
    await anadirALista(admin, lista, arroz, { cantidad_por_adulto: 1.5, cantidad_por_nino: 1 });
    await anadirALista(admin, lista, chorizo, { cantidad_por_adulto: 0.5, cantidad_por_nino: 0 });
  });

  afterAll(async () => {
    if (semanasCreadas.length) await servicio.from("semanas").delete().in("id", semanasCreadas);
    await servicio.from("listas_base").delete().like("nombre", `${MARCA}%`);
    await servicio.from("alimentos").delete().like("nombre", `${MARCA}%`);
  });

  describe("semanas", () => {
    it("crea, cambia y lista una semana; la fecha de entrega no se repite", async () => {
      const id = await semana();
      const s = await obtenerSemana(admin, id);
      expect(s.ok && s.valor).toMatchObject({ precio_base: 20, estado: "borrador", cestas: [] });

      const fecha = fechaUnica();
      expect(await guardarSemana(admin, id, { fecha_entrega: fecha, precio_base: 17.5, plazo_confirmacion: futuro() })).toEqual({
        ok: true,
        valor: undefined,
      });
      const lista = await listarSemanas(admin);
      expect(lista.ok && lista.valor.find((x) => x.id === id)).toMatchObject({ fecha_entrega: fecha, precio_base: 17.5, cestas: 0 });

      const repetida = await crearSemana(admin, { fecha_entrega: fecha, precio_base: 20, plazo_confirmacion: futuro() });
      expect(repetida).toEqual({ ok: false, error: "duplicado" });
    });

    it("una semana ya enviada no se cambia ni se elimina, y sus cestas tampoco", async () => {
      const id = await semana();
      const { id: cestaId } = await cestaPropuesta(id);
      const item = await itemDe(cestaId, arroz);
      await servicio.from("semanas").update({ estado: "enviada" }).eq("id", id);

      const datos = { fecha_entrega: fechaUnica(), precio_base: 20, plazo_confirmacion: futuro() };
      expect(await guardarSemana(admin, id, datos)).toEqual({ ok: false, error: "no_editable" });
      expect(await eliminarSemana(admin, id)).toEqual({ ok: false, error: "no_editable" });
      expect(await anadirACesta(admin, cestaId, lentejas, 1)).toEqual({ ok: false, error: "no_editable" });
      expect(await cambiarCantidadCesta(admin, item!.id, 9)).toEqual({ ok: false, error: "no_editable" });
      expect(await quitarDeCesta(admin, item!.id)).toEqual({ ok: false, error: "no_editable" });
      expect(await eliminarCesta(admin, cestaId)).toEqual({ ok: false, error: "no_editable" });
      const otra = await guardarCesta(admin, {
        id: null,
        semanaId: id,
        datos: { identificador_receptor: "Tarde", adultos: 1, ninos: 0, lista_base_id: null, exclusiones: [] },
        items: [],
      });
      expect(otra).toEqual({ ok: false, error: "no_editable" });
      expect((await itemDe(cestaId, arroz))?.cantidad).toBe(4);
    });

    it("eliminar una semana en preparación borra sus cestas", async () => {
      const id = await semana();
      const { id: cestaId } = await cestaPropuesta(id);
      expect(await eliminarSemana(admin, id)).toEqual({ ok: true, valor: undefined });
      expect(await obtenerCesta(admin, cestaId)).toEqual({ ok: false, error: "no_encontrado" });
    });
  });

  describe("cestas (R1)", () => {
    it("CA-05: arroz a 1,5 por adulto y 1 por niño, para 2 adultos y 1 niño: se guardan 4 paquetes", async () => {
      const id = await semana();
      const { id: cestaId } = await cestaPropuesta(id);
      expect(await itemDe(cestaId, arroz)).toMatchObject({ cantidad: 4, precio_unitario: 1.2, unidad: "paquete 1 kg" });
      // Y el chorizo, sin exclusiones: 2 × 0,5 = 1.
      expect((await itemDe(cestaId, chorizo))?.cantidad).toBe(1);

      const s = await obtenerSemana(admin, id);
      expect(s.ok && s.valor.cestas).toEqual([
        expect.objectContaining({ id: cestaId, unidades: 5, coste: 7.3, choques: 0, exclusiones: [] }),
      ]);
    });

    it("CA-06: una cesta sin cerdo no lleva nada con cerdo y la propuesta dice qué se quitó", async () => {
      const id = await semana();
      const { id: cestaId, propuesta } = await cestaPropuesta(id, { exclusiones: [cerdo] });
      const c = await obtenerCesta(admin, cestaId);
      expect(c.ok && c.valor.items.map((i) => i.alimento_id)).toEqual([arroz]);
      expect(c.ok && c.valor.exclusiones).toEqual([cerdo]);
      expect(propuesta.quitados.map((q) => q.alimento_id)).toEqual([chorizo]);
    });

    it("CA-06: si después se añade al catálogo una etiqueta que la cesta excluye, la cesta lo avisa", async () => {
      const id = await semana();
      const salchicha = await alimento("salchicha", 2);
      const { id: cestaId } = await cestaPropuesta(id, { exclusiones: [cerdo] });
      expect(await anadirACesta(admin, cestaId, salchicha, 2)).toEqual({ ok: true, valor: undefined });

      // Corregir el catálogo no se bloquea...
      const r = await guardarAlimento(admin, salchicha, {
        nombre: `${MARCA} salchicha`,
        unidad: "paquete 1 kg",
        precio_aprox: 2,
        activo: true,
        etiquetas: [cerdo],
      });
      expect(r.ok).toBe(true);
      const a = await obtenerAlimento(admin, salchicha);
      expect(a.ok && a.valor.etiquetas).toEqual([cerdo]);

      // ...pero la cesta y la semana lo señalan.
      const c = await obtenerCesta(admin, cestaId);
      expect(c.ok && choquesEnCesta(c.valor.items, c.valor.exclusiones).map((i) => i.alimento_id)).toEqual([salchicha]);
      const s = await obtenerSemana(admin, id);
      expect(s.ok && s.valor.cestas[0].choques).toBe(1);

      // Y se puede quitar.
      const item = c.ok ? c.valor.items.find((i) => i.alimento_id === salchicha) : undefined;
      expect(await quitarDeCesta(admin, item!.id)).toEqual({ ok: true, valor: undefined });
    });

    it("CA-07: no deja añadir a mano un alimento que choca con las exclusiones", async () => {
      const id = await semana();
      const { id: cestaId } = await cestaPropuesta(id, { exclusiones: [cerdo, gluten] });
      expect(await anadirACesta(admin, cestaId, chorizo, 1)).toEqual({ ok: false, error: "excluido" });
      expect(await itemDe(cestaId, chorizo)).toBeUndefined();

      // Uno que no choca, sí; y repetirlo da "duplicado".
      expect(await anadirACesta(admin, cestaId, lentejas, 3)).toEqual({ ok: true, valor: undefined });
      expect(await itemDe(cestaId, lentejas)).toMatchObject({ cantidad: 3, precio_unitario: 1.8 });
      expect(await anadirACesta(admin, cestaId, lentejas, 1)).toEqual({ ok: false, error: "duplicado" });
    });

    it("CA-07: un alta cuyo alimento choca no guarda nada (catálogo cambiado a medias)", async () => {
      const id = await semana();
      const r = await guardarCesta(admin, {
        id: null,
        semanaId: id,
        datos: { identificador_receptor: "Choque", adultos: 1, ninos: 0, lista_base_id: lista, exclusiones: [cerdo] },
        items: [{ alimento_id: chorizo, cantidad: 1 }],
      });
      expect(r).toEqual({ ok: false, error: "excluido" });
      const s = await obtenerSemana(admin, id);
      expect(s.ok && s.valor.cestas).toEqual([]);
    });

    it("CA-08: si cambia el precio (o la unidad) en el catálogo, la cesta conserva los que tenía", async () => {
      const id = await semana();
      const aceite = await alimento("aceite", 7.5);
      const { id: cestaId } = await cestaPropuesta(id);
      await anadirACesta(admin, cestaId, aceite, 1);

      const r = await guardarAlimento(admin, aceite, {
        nombre: `${MARCA} aceite`,
        unidad: "botella 5 l",
        precio_aprox: 30,
        activo: true,
        etiquetas: [],
      });
      expect(r.ok).toBe(true);

      expect(await itemDe(cestaId, aceite)).toMatchObject({ precio_unitario: 7.5, unidad: "paquete 1 kg" });
      // Cambiar la cantidad tampoco cambia el precio.
      const item = await itemDe(cestaId, aceite);
      await cambiarCantidadCesta(admin, item!.id, 2);
      expect(await itemDe(cestaId, aceite)).toMatchObject({ cantidad: 2, precio_unitario: 7.5 });
    });

    it("editar: una exclusión nueva quita lo que choca; recalcular sustituye los alimentos", async () => {
      const id = await semana();
      const { id: cestaId } = await cestaPropuesta(id);
      await anadirACesta(admin, cestaId, lentejas, 2);

      const datos: DatosCesta = {
        identificador_receptor: "Familia 1 bis",
        adultos: 2,
        ninos: 1,
        lista_base_id: lista,
        exclusiones: [cerdo],
      };
      const r = await guardarCesta(admin, { id: cestaId, semanaId: id, datos, items: null });
      expect(r).toEqual({ ok: true, valor: { id: cestaId, quitados: 1 } });
      let c = await obtenerCesta(admin, cestaId);
      expect(c.ok && c.valor).toMatchObject({ identificador_receptor: "Familia 1 bis", exclusiones: [cerdo] });
      expect(c.ok && c.valor.items.map((i) => i.alimento_id).sort()).toEqual([arroz, lentejas].sort());

      // Recalcular con 4 adultos: solo lo de la lista base, sin las lentejas añadidas a mano.
      const plantilla = await plantillaDeLista(admin, lista);
      const nuevos = { ...datos, adultos: 4, ninos: 0, exclusiones: [] };
      const items = proponerCesta(nuevos, plantilla.ok ? plantilla.valor : []).items;
      await guardarCesta(admin, { id: cestaId, semanaId: id, datos: nuevos, items });
      c = await obtenerCesta(admin, cestaId);
      expect(c.ok && c.valor.items.map((i) => [i.alimento_id, i.cantidad])).toEqual(
        expect.arrayContaining([
          [arroz, 6],
          [chorizo, 2],
        ]),
      );
      expect(c.ok && c.valor.items).toHaveLength(2);
      expect(c.ok && c.valor.exclusiones).toEqual([]);
    });

    it("una cesta de otra lista o sin lista: la plantilla vacía no propone nada", async () => {
      const id = await semana();
      const r = await guardarCesta(admin, {
        id: null,
        semanaId: id,
        datos: { identificador_receptor: "Vacía", adultos: 1, ninos: 0, lista_base_id: null, exclusiones: [] },
        items: [],
      });
      expect(r.ok).toBe(true);
      const c = await obtenerCesta(admin, r.ok ? r.valor.id : "");
      expect(c.ok && c.valor).toMatchObject({ lista_base_id: null, items: [] });
    });
  });

  describe("permisos (CA-23)", () => {
    it("un usuario sin rol de administrador no ve ni crea semanas ni cestas", async () => {
      const id = await semana();
      expect(await listarSemanas(sinRol)).toEqual({ ok: true, valor: [] });
      expect(await obtenerSemana(sinRol, id)).toEqual({ ok: false, error: "no_encontrado" });
      const r = await crearSemana(sinRol, { fecha_entrega: fechaUnica(), precio_base: 20, plazo_confirmacion: futuro() });
      expect(r).toEqual({ ok: false, error: "sin_permiso" });
      const cesta = await guardarCesta(sinRol, {
        id: null,
        semanaId: id,
        datos: { identificador_receptor: "X", adultos: 1, ninos: 0, lista_base_id: null, exclusiones: [] },
        items: [],
      });
      expect(cesta.ok).toBe(false);
    });
  });
});
