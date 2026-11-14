import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  anadirALista,
  cambiarCantidades,
  crearEtiqueta,
  crearLista,
  eliminarAlimento,
  eliminarEtiqueta,
  eliminarLista,
  guardarAlimento,
  listarAlimentos,
  listarEtiquetas,
  listarListas,
  marcarListaPredeterminada,
  obtenerAlimento,
  obtenerLista,
  quitarDeLista,
  renombrarEtiqueta,
} from "@/lib/servicios/catalogo";
import {
  ADMIN_PRUEBAS,
  SIN_ROL_PRUEBAS,
  asegurarUsuariosPruebas,
  clienteConSesion,
  clienteServicio,
} from "../utilidades/supabase";

// Catálogo contra Supabase local (plan PR 3): etiquetas, alimentos y listas base.

const MARCA = `catalogo-${Date.now()}`;

describe("servicio del catálogo", () => {
  let admin: SupabaseClient;
  let sinRol: SupabaseClient;
  const servicio = clienteServicio();
  let cerdo: string;
  let gluten: string;

  beforeAll(async () => {
    await asegurarUsuariosPruebas();
    admin = await clienteConSesion(ADMIN_PRUEBAS);
    sinRol = await clienteConSesion(SIN_ROL_PRUEBAS);
    const { data } = await servicio.from("etiquetas_exclusion").select("id, codigo").in("codigo", ["cerdo", "gluten"]);
    cerdo = data!.find((e) => e.codigo === "cerdo")!.id;
    gluten = data!.find((e) => e.codigo === "gluten")!.id;
  });

  afterAll(async () => {
    await servicio.from("listas_base").delete().like("nombre", `${MARCA}%`);
    await servicio.from("alimentos").delete().like("nombre", `${MARCA}%`);
    await servicio.from("etiquetas_exclusion").delete().like("codigo", `${MARCA.replace("-", "_")}%`);
  });

  async function alimento(nombre: string, etiquetas: string[] = []) {
    const r = await guardarAlimento(admin, null, {
      nombre: `${MARCA} ${nombre}`,
      unidad: "paquete",
      precio_aprox: 1.5,
      activo: true,
      etiquetas,
    });
    if (!r.ok) throw new Error(`No se pudo crear: ${r.error}`);
    return r.valor.id;
  }

  describe("alimentos", () => {
    it("da de alta un alimento con sus etiquetas y lo devuelve con el precio como número", async () => {
      const id = await alimento("salchichón", [cerdo, gluten]);
      const r = await obtenerAlimento(admin, id);
      expect(r.ok && r.valor).toMatchObject({ unidad: "paquete", precio_aprox: 1.5, activo: true });
      expect(r.ok && [...r.valor.etiquetas].sort()).toEqual([cerdo, gluten].sort());
    });

    it("al editar, sustituye las etiquetas (quita las que ya no están y añade las nuevas)", async () => {
      const id = await alimento("pan", [gluten]);
      const r = await guardarAlimento(admin, id, {
        nombre: `${MARCA} pan de molde`,
        unidad: "paquete",
        precio_aprox: 1.6,
        activo: false,
        etiquetas: [cerdo],
      });
      expect(r).toEqual({ ok: true, valor: { id } });
      const guardado = await obtenerAlimento(admin, id);
      expect(guardado.ok && guardado.valor).toMatchObject({
        nombre: `${MARCA} pan de molde`,
        precio_aprox: 1.6,
        activo: false,
        etiquetas: [cerdo],
      });
    });

    it("guardar con la lista de etiquetas vacía le quita todas", async () => {
      const id = await alimento("sin nada", [cerdo, gluten]);
      await guardarAlimento(admin, id, {
        nombre: `${MARCA} sin nada`,
        unidad: "paquete",
        precio_aprox: 1.5,
        activo: true,
        etiquetas: [],
      });
      const r = await obtenerAlimento(admin, id);
      expect(r.ok && r.valor.etiquetas).toEqual([]);
    });

    it("las etiquetas se guardan junto con el alimento o no se guarda nada (una etiqueta inexistente lo anula todo)", async () => {
      const r = await guardarAlimento(admin, null, {
        nombre: `${MARCA} atómico`,
        unidad: "lata",
        precio_aprox: 1,
        activo: true,
        etiquetas: [cerdo, "00000000-0000-4000-8000-000000000000"],
      });
      expect(r).toEqual({ ok: false, error: "en_uso" });
      const { count } = await servicio
        .from("alimentos")
        .select("*", { count: "exact", head: true })
        .eq("nombre", `${MARCA} atómico`);
      expect(count).toBe(0);
    });

    it("no admite dos alimentos con el mismo nombre y unidad", async () => {
      await alimento("lentejas");
      const r = await guardarAlimento(admin, null, {
        nombre: `${MARCA} LENTEJAS`,
        unidad: "PAQUETE",
        precio_aprox: 2,
        activo: true,
        etiquetas: [],
      });
      expect(r).toEqual({ ok: false, error: "duplicado" });
    });

    it("la lista oculta los desactivados salvo que se pidan", async () => {
      const id = await alimento("desactivado");
      await guardarAlimento(admin, id, {
        nombre: `${MARCA} desactivado`,
        unidad: "paquete",
        precio_aprox: 1,
        activo: false,
        etiquetas: [],
      });
      const activos = await listarAlimentos(admin);
      const todos = await listarAlimentos(admin, { incluirInactivos: true });
      expect(activos.ok && activos.valor.some((a) => a.id === id)).toBe(false);
      expect(todos.ok && todos.valor.some((a) => a.id === id)).toBe(true);
    });

    it("no se puede eliminar un alimento que está en una lista base; uno sin usar, sí", async () => {
      const usado = await alimento("usado");
      const libre = await alimento("libre");
      const lista = await crearLista(admin, `${MARCA} lista uso`);
      if (!lista.ok) throw new Error(lista.error);
      await anadirALista(admin, lista.valor.id, usado, { cantidad_por_adulto: 1, cantidad_por_nino: 0 });

      expect(await eliminarAlimento(admin, usado)).toEqual({ ok: false, error: "en_uso" });
      expect(await eliminarAlimento(admin, libre)).toEqual({ ok: true, valor: undefined });
    });

    it("editar un alimento que no existe responde no_encontrado", async () => {
      const r = await guardarAlimento(admin, "00000000-0000-4000-8000-000000000000", {
        nombre: `${MARCA} fantasma`,
        unidad: "u",
        precio_aprox: 1,
        activo: true,
        etiquetas: [],
      });
      expect(r).toEqual({ ok: false, error: "no_encontrado" });
    });
  });

  describe("etiquetas", () => {
    it("crea, renombra y elimina una etiqueta sin uso", async () => {
      const codigo = `${MARCA.replace("-", "_")}_soja`;
      const r = await crearEtiqueta(admin, { nombre: "soja de prueba", codigo });
      expect(r.ok).toBe(true);
      const id = r.ok ? r.valor.id : "";
      expect(await renombrarEtiqueta(admin, id, "soja")).toEqual({ ok: true, valor: undefined });
      const lista = await listarEtiquetas(admin);
      expect(lista.ok && lista.valor.find((e) => e.id === id)).toMatchObject({ nombre: "soja", codigo, alimentos: 0 });
      expect(await eliminarEtiqueta(admin, id)).toEqual({ ok: true, valor: undefined });
    });

    it("no se puede eliminar una etiqueta que lleva algún alimento, y cuenta cuántos la llevan", async () => {
      const codigo = `${MARCA.replace("-", "_")}_marisco`;
      const r = await crearEtiqueta(admin, { nombre: "marisco de prueba", codigo });
      const id = r.ok ? r.valor.id : "";
      await alimento("gambas", [id]);
      const lista = await listarEtiquetas(admin);
      expect(lista.ok && lista.valor.find((e) => e.id === id)?.alimentos).toBe(1);
      expect(await eliminarEtiqueta(admin, id)).toEqual({ ok: false, error: "en_uso" });
    });

    it("no admite dos etiquetas con el mismo código", async () => {
      expect(await crearEtiqueta(admin, { nombre: "cerdo", codigo: "cerdo" })).toEqual({ ok: false, error: "duplicado" });
    });

    it("no se puede renombrar una etiqueta con el nombre de otra (dos «cerdo» romperían las exclusiones)", async () => {
      const codigo = `${MARCA.replace("-", "_")}_otra`;
      const r = await crearEtiqueta(admin, { nombre: "otra de prueba", codigo });
      const id = r.ok ? r.valor.id : "";
      expect(await renombrarEtiqueta(admin, id, "Cerdo")).toEqual({ ok: false, error: "duplicado" });
      expect(await crearEtiqueta(admin, { nombre: "otra de prueba", codigo: `${codigo}_2` })).toEqual({
        ok: false,
        error: "duplicado",
      });
    });
  });

  describe("listas base", () => {
    it("añade alimentos con cantidades decimales, las cambia y los quita", async () => {
      const arroz = await alimento("arroz");
      const lista = await crearLista(admin, `${MARCA} familia`);
      if (!lista.ok) throw new Error(lista.error);
      const id = lista.valor.id;

      expect(await anadirALista(admin, id, arroz, { cantidad_por_adulto: 1.5, cantidad_por_nino: 1 })).toEqual({
        ok: true,
        valor: undefined,
      });
      expect(await anadirALista(admin, id, arroz, { cantidad_por_adulto: 1, cantidad_por_nino: 1 })).toEqual({
        ok: false,
        error: "duplicado",
      });

      let r = await obtenerLista(admin, id);
      expect(r.ok && r.valor.items).toHaveLength(1);
      const item = r.ok ? r.valor.items[0] : null;
      expect(item).toMatchObject({ alimento_id: arroz, cantidad_por_adulto: 1.5, cantidad_por_nino: 1 });
      expect(item?.alimento.nombre).toBe(`${MARCA} arroz`);

      await cambiarCantidades(admin, item!.id, { cantidad_por_adulto: 2.25, cantidad_por_nino: 0 });
      r = await obtenerLista(admin, id);
      expect(r.ok && r.valor.items[0]).toMatchObject({ cantidad_por_adulto: 2.25, cantidad_por_nino: 0 });

      expect(await quitarDeLista(admin, item!.id)).toEqual({ ok: true, valor: undefined });
      r = await obtenerLista(admin, id);
      expect(r.ok && r.valor.items).toHaveLength(0);
    });

    it("solo hay una predeterminada: marcar otra desmarca la anterior de una vez", async () => {
      const a = await crearLista(admin, `${MARCA} A`);
      const b = await crearLista(admin, `${MARCA} B`);
      if (!a.ok || !b.ok) throw new Error("no se crearon");
      // La predeterminada de seed.sql se vuelve a marcar al final, falle o no la prueba.
      const { data: antes } = await servicio.from("listas_base").select("id").eq("predeterminada", true).maybeSingle();
      try {
        expect(await marcarListaPredeterminada(admin, a.valor.id)).toEqual({ ok: true, valor: undefined });
        expect(await marcarListaPredeterminada(admin, b.valor.id)).toEqual({ ok: true, valor: undefined });

        const listas = await listarListas(admin);
        const predeterminadas = listas.ok ? listas.valor.filter((l) => l.predeterminada) : [];
        expect(predeterminadas.map((l) => l.id)).toEqual([b.valor.id]);

        // Si la lista no existe, no cambia nada (tampoco se desmarca la actual).
        expect(await marcarListaPredeterminada(admin, "00000000-0000-4000-8000-000000000000")).toEqual({
          ok: false,
          error: "no_encontrado",
        });
        const despues = await listarListas(admin);
        expect(despues.ok && despues.valor.filter((l) => l.predeterminada).map((l) => l.id)).toEqual([b.valor.id]);
      } finally {
        if (antes) await marcarListaPredeterminada(admin, antes.id);
      }
    });

    it("eliminar una lista borra sus cantidades", async () => {
      const arroz = await alimento("arroz para borrar");
      const lista = await crearLista(admin, `${MARCA} para borrar`);
      if (!lista.ok) throw new Error(lista.error);
      await anadirALista(admin, lista.valor.id, arroz, { cantidad_por_adulto: 1, cantidad_por_nino: 1 });
      expect(await eliminarLista(admin, lista.valor.id)).toEqual({ ok: true, valor: undefined });
      const { count } = await servicio
        .from("lista_base_items")
        .select("*", { count: "exact", head: true })
        .eq("lista_base_id", lista.valor.id);
      expect(count).toBe(0);
    });
  });

  describe("CA-23: un usuario sin rol de administrador no puede usar el catálogo", () => {
    it("no ve nada", async () => {
      expect(await listarEtiquetas(sinRol)).toEqual({ ok: true, valor: [] });
      expect(await listarAlimentos(sinRol, { incluirInactivos: true })).toEqual({ ok: true, valor: [] });
      expect(await listarListas(sinRol)).toEqual({ ok: true, valor: [] });
    });

    it("no puede crear alimentos ni con la función SQL", async () => {
      const r = await guardarAlimento(sinRol, null, {
        nombre: `${MARCA} intruso`,
        unidad: "u",
        precio_aprox: 1,
        activo: true,
        etiquetas: [],
      });
      expect(r).toEqual({ ok: false, error: "sin_permiso" });
    });

    it("no puede editar un alimento existente ni cambiar la lista predeterminada", async () => {
      const id = await alimento("protegido");
      const r = await guardarAlimento(sinRol, id, {
        nombre: `${MARCA} cambiado`,
        unidad: "u",
        precio_aprox: 99,
        activo: true,
        etiquetas: [],
      });
      expect(r).toEqual({ ok: false, error: "no_encontrado" });
      const sigue = await obtenerAlimento(admin, id);
      expect(sigue.ok && sigue.valor.precio_aprox).toBe(1.5);

      const lista = await crearLista(admin, `${MARCA} protegida`);
      if (!lista.ok) throw new Error(lista.error);
      expect(await marcarListaPredeterminada(sinRol, lista.valor.id)).toEqual({ ok: false, error: "no_encontrado" });
    });
  });
});
