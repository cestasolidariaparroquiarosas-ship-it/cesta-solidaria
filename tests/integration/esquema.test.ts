import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADMIN_PRUEBAS,
  SIN_ROL_PRUEBAS,
  asegurarUsuariosPruebas,
  clienteAnonimo,
  clienteConSesion,
  clienteServicio,
} from "../utilidades/supabase";

// Esquema de la base de datos (plan PR 1): Row Level Security y restricciones.
// scripts/comprobar-rls.sql vigila además, en el catálogo de Postgres, que ninguna
// tabla nueva se quede sin RLS.

const TABLAS = [
  "colaboradores",
  "etiquetas_exclusion",
  "alimentos",
  "alimento_etiquetas",
  "listas_base",
  "lista_base_items",
  "semanas",
  "cestas",
  "cesta_exclusiones",
  "cesta_items",
  "asignaciones",
  "asignacion_items",
  "registro_eventos",
] as const;

// Prefijo para reconocer y borrar lo que crean estas pruebas.
const MARCA = `esquema-${Date.now()}`;

/** Una fecha de entrega única muy en el futuro, para no chocar con otras pruebas. */
function fechaUnica() {
  const dias = Math.floor(Math.random() * 300_000);
  return new Date(Date.UTC(2100, 0, 1) + dias * 86_400_000).toISOString().slice(0, 10);
}

describe("esquema: Row Level Security y restricciones", () => {
  let admin: SupabaseClient;
  let sinRol: SupabaseClient;
  const servicio = clienteServicio();
  const semanasCreadas: string[] = [];

  beforeAll(async () => {
    await asegurarUsuariosPruebas();
    admin = await clienteConSesion(ADMIN_PRUEBAS);
    sinRol = await clienteConSesion(SIN_ROL_PRUEBAS);
    await crearUnaFilaEnCadaTabla();
  });

  afterAll(async () => {
    if (semanasCreadas.length) await servicio.from("semanas").delete().in("id", semanasCreadas);
    await servicio.from("colaboradores").delete().like("email", `${MARCA}%`);
    await servicio.from("listas_base").delete().like("nombre", `${MARCA}%`);
    await servicio.from("alimentos").delete().like("nombre", `${MARCA}%`);
  });

  async function crearSemana() {
    const { data, error } = await servicio
      .from("semanas")
      .insert({ fecha_entrega: fechaUnica(), precio_base: 20, plazo_confirmacion: new Date().toISOString() })
      .select("id")
      .single();
    if (error) throw error;
    semanasCreadas.push(data.id);
    return data.id as string;
  }

  async function idDe(tabla: string, columna: string, valor: string) {
    const { data, error } = await servicio.from(tabla).select("id").eq(columna, valor).single();
    if (error) throw error;
    return data.id as string;
  }

  async function insertar(tabla: string, fila: Record<string, unknown>) {
    const { data, error } = await servicio.from(tabla).insert(fila).select().single();
    if (error) throw error;
    return data as Record<string, string>;
  }

  /** Para que "no ve nada" signifique algo, cada tabla tiene al menos una fila. */
  async function crearUnaFilaEnCadaTabla() {
    const semana = await crearSemana();
    const colaborador = await insertar("colaboradores", { nombre: "Visible", email: `${MARCA}-fila@ejemplo.test` });
    const alimento = await insertar("alimentos", { nombre: `${MARCA} arroz`, unidad: "kg", precio_aprox: 1.2 });
    await insertar("alimento_etiquetas", {
      alimento_id: alimento.id,
      etiqueta_id: await idDe("etiquetas_exclusion", "codigo", "gluten"),
    });
    const lista = await insertar("listas_base", { nombre: `${MARCA} lista` });
    await insertar("lista_base_items", { lista_base_id: lista.id, alimento_id: alimento.id, cantidad_por_adulto: 1 });
    const cesta = await insertar("cestas", { semana_id: semana, identificador_receptor: "F-0", adultos: 1, ninos: 0 });
    await insertar("cesta_exclusiones", {
      cesta_id: cesta.id,
      etiqueta_id: await idDe("etiquetas_exclusion", "codigo", "cerdo"),
    });
    const item = await insertar("cesta_items", { cesta_id: cesta.id, alimento_id: alimento.id, cantidad: 2, precio_unitario: 1.2 });
    const asignacion = await insertar("asignaciones", { semana_id: semana, colaborador_id: colaborador.id });
    await insertar("asignacion_items", { asignacion_id: asignacion.id, cesta_item_id: item.id, cantidad: 2 });
    await insertar("registro_eventos", { tipo: "prueba", semana_id: semana, asignacion_id: asignacion.id });
  }

  describe("CA-23: sin sesión de administrador no se ve ni se cambia nada", () => {
    it.each(TABLAS)("CA-23: un visitante anónimo no puede leer %s", async (tabla) => {
      const { data, error } = await clienteAnonimo().from(tabla).select("*").limit(1);
      expect(data ?? []).toHaveLength(0);
      expect(error?.code).toBe("42501");
    });

    it("CA-23: un visitante anónimo no puede escribir", async () => {
      const { error } = await clienteAnonimo()
        .from("colaboradores")
        .insert({ nombre: "Intruso", email: `${MARCA}-anon@ejemplo.test` });
      expect(error?.code).toBe("42501");
    });

    it.each(TABLAS)("CA-23: un usuario sin rol de administrador no lee %s, aunque tenga filas", async (tabla) => {
      const { count } = await servicio.from(tabla).select("*", { count: "exact", head: true });
      expect(count).toBeGreaterThan(0);
      const { data, error } = await sinRol.from(tabla).select("*");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("CA-23: un usuario sin rol no puede escribir", async () => {
      const { error } = await sinRol
        .from("colaboradores")
        .insert({ nombre: "Sin rol", email: `${MARCA}-sinrol@ejemplo.test` });
      expect(error?.code).toBe("42501");

      const { data } = await sinRol.from("etiquetas_exclusion").update({ nombre: "x" }).eq("codigo", "cerdo").select();
      expect(data ?? []).toEqual([]);
      const { data: etiqueta } = await servicio.from("etiquetas_exclusion").select("nombre").eq("codigo", "cerdo").single();
      expect(etiqueta?.nombre).toBe("cerdo");
    });
  });

  describe("administrador", () => {
    it.each(TABLAS)("puede leer %s", async (tabla) => {
      const { data, error } = await admin.from(tabla).select("*").limit(1);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("ve las etiquetas de exclusión iniciales", async () => {
      const { data } = await admin.from("etiquetas_exclusion").select("codigo");
      expect(data?.map((e) => e.codigo)).toEqual(
        expect.arrayContaining(["cerdo", "gluten", "lactosa", "frutos_secos", "huevo"]),
      );
    });

    it("puede dar de alta, editar y borrar un colaborador", async () => {
      const email = `${MARCA}-alta@ejemplo.test`;
      const { data, error } = await admin
        .from("colaboradores")
        .insert({ nombre: "Ana", email })
        .select("id, estado, creado_en, actualizado_en")
        .single();
      expect(error).toBeNull();
      expect(data?.estado).toBe("activo");

      const { data: editado } = await admin
        .from("colaboradores")
        .update({ estado: "pausado", pausado_hasta: "2100-01-01" })
        .eq("id", data!.id)
        .select("estado, creado_en, actualizado_en")
        .single();
      expect(editado?.estado).toBe("pausado");
      // Al crear, las dos fechas son iguales; el trigger actualiza solo actualizado_en.
      expect(data!.actualizado_en).toBe(data!.creado_en);
      expect(new Date(editado!.actualizado_en) > new Date(editado!.creado_en)).toBe(true);

      const { error: errorBorrado } = await admin.from("colaboradores").delete().eq("id", data!.id);
      expect(errorBorrado).toBeNull();
    });
  });

  describe("restricciones de la base de datos", () => {
    it("CA-01 (base de datos): no se guardan dos colaboradores con el mismo correo, aunque cambien las mayúsculas", async () => {
      const email = `${MARCA}-repetido@ejemplo.test`;
      const primero = await admin.from("colaboradores").insert({ nombre: "Uno", email });
      expect(primero.error).toBeNull();
      const segundo = await admin.from("colaboradores").insert({ nombre: "Dos", email: email.toUpperCase() });
      expect(segundo.error?.code).toBe("23505");
    });

    it("CA-07 (base de datos): no deja guardar un alimento que choca con las exclusiones de la cesta", async () => {
      const semana = await crearSemana();
      const { data: alimento } = await servicio
        .from("alimentos")
        .insert({ nombre: `${MARCA} embutido`, unidad: "pieza", precio_aprox: 2.5 })
        .select("id")
        .single();
      await servicio
        .from("alimento_etiquetas")
        .insert({ alimento_id: alimento!.id, etiqueta_id: await idDe("etiquetas_exclusion", "codigo", "cerdo") });
      const { data: cesta } = await admin
        .from("cestas")
        .insert({ semana_id: semana, identificador_receptor: "F-1", adultos: 2, ninos: 1 })
        .select("id")
        .single();
      await admin
        .from("cesta_exclusiones")
        .insert({ cesta_id: cesta!.id, etiqueta_id: await idDe("etiquetas_exclusion", "codigo", "cerdo") });

      const { error } = await admin
        .from("cesta_items")
        .insert({ cesta_id: cesta!.id, alimento_id: alimento!.id, cantidad: 1, precio_unitario: 2.5 });
      expect(error?.code).toBe("23514");
      expect(error?.hint).toBe("alimento_excluido");

      // Y al revés: no se puede añadir la exclusión a una cesta que ya lleva el alimento.
      const { data: otra } = await admin
        .from("cestas")
        .insert({ semana_id: semana, identificador_receptor: "F-2", adultos: 1, ninos: 0 })
        .select("id")
        .single();
      await admin
        .from("cesta_items")
        .insert({ cesta_id: otra!.id, alimento_id: alimento!.id, cantidad: 1, precio_unitario: 2.5 });
      const { error: errorExclusion } = await admin
        .from("cesta_exclusiones")
        .insert({ cesta_id: otra!.id, etiqueta_id: await idDe("etiquetas_exclusion", "codigo", "cerdo") });
      expect(errorExclusion?.code).toBe("23514");

      // Cambiar solo la cantidad de un alimento que ya estaba sí se puede, aunque el
      // catálogo cambie después (lo avisará la pantalla de la cesta, PR 4).
      const { error: errorCantidad } = await admin
        .from("cesta_items")
        .update({ cantidad: 3 })
        .eq("cesta_id", otra!.id);
      expect(errorCantidad).toBeNull();
    });

    it("CA-04 (base de datos): al borrar un colaborador, sus asignaciones se conservan sin él", async () => {
      const semana = await crearSemana();
      const { data: colaborador } = await admin
        .from("colaboradores")
        .insert({ nombre: "Borrable", email: `${MARCA}-borrable@ejemplo.test` })
        .select("id")
        .single();
      const { data: asignacion } = await admin
        .from("asignaciones")
        .insert({ semana_id: semana, colaborador_id: colaborador!.id })
        .select("id, token")
        .single();
      expect(asignacion?.token).toMatch(/^[0-9a-f]{64}$/);

      await admin.from("colaboradores").delete().eq("id", colaborador!.id);
      const { data: despues } = await admin
        .from("asignaciones")
        .select("colaborador_id")
        .eq("id", asignacion!.id)
        .single();
      expect(despues?.colaborador_id).toBeNull();
      const { count } = await servicio
        .from("colaboradores")
        .select("*", { count: "exact", head: true })
        .eq("id", colaborador!.id);
      expect(count).toBe(0);
    });

    it("una asignación pendiente necesita plazo (si no, el cron nunca la vencería)", async () => {
      const semana = await crearSemana();
      const { error } = await admin
        .from("asignaciones")
        .insert({ semana_id: semana, estado: "pendiente", enviado_en: new Date().toISOString() });
      expect(error?.code).toBe("23514");
    });

    it("quitar un alimento repartido: con reparto propuesto, se descarta; ya enviado, falla; borrar la semana sí", async () => {
      const semana = await crearSemana();
      const { data: alimento } = await servicio
        .from("alimentos")
        .insert({ nombre: `${MARCA} lentejas`, unidad: "kg", precio_aprox: 1.8 })
        .select("id")
        .single();
      const { data: cesta } = await admin
        .from("cestas")
        .insert({ semana_id: semana, identificador_receptor: "F-3", adultos: 1, ninos: 0 })
        .select("id")
        .single();
      const { data: item } = await admin
        .from("cesta_items")
        .insert({ cesta_id: cesta!.id, alimento_id: alimento!.id, cantidad: 1, precio_unitario: 1.8 })
        .select("id")
        .single();
      const repartir = async (estado: "propuesta" | "pendiente") => {
        const { data: asignacion } = await admin
          .from("asignaciones")
          .insert({ semana_id: semana, estado, plazo: new Date().toISOString() })
          .select("id")
          .single();
        await admin.from("asignacion_items").insert({ asignacion_id: asignacion!.id, cesta_item_id: item!.id, cantidad: 1 });
        return asignacion!.id as string;
      };

      // Reparto propuesto (semana en preparación): cambiar la cesta lo descarta
      // (migración del reparto, PR 5).
      const propuesta = await repartir("propuesta");
      expect((await admin.from("cesta_items").update({ cantidad: 2 }).eq("id", item!.id)).error).toBeNull();
      const { data: queda } = await admin.from("asignaciones").select("id").eq("id", propuesta);
      expect(queda).toEqual([]);

      // Una asignación ya enviada no se descarta: la clave ajena impide quitar el alimento.
      // (En la app no puede pasar: con la semana enviada, las cestas no se cambian.)
      await repartir("pendiente");
      const { error } = await admin.from("cesta_items").delete().eq("id", item!.id);
      expect(error?.code).toBe("23503");

      const { error: errorSemana } = await admin.from("semanas").delete().eq("id", semana);
      expect(errorSemana).toBeNull();
    });

    it("un colaborador no puede tener dos asignaciones en la misma semana", async () => {
      const semana = await crearSemana();
      const { data: colaborador } = await admin
        .from("colaboradores")
        .insert({ nombre: "Repetido", email: `${MARCA}-doble@ejemplo.test` })
        .select("id")
        .single();
      const primera = await admin.from("asignaciones").insert({ semana_id: semana, colaborador_id: colaborador!.id });
      expect(primera.error).toBeNull();
      const segunda = await admin.from("asignaciones").insert({ semana_id: semana, colaborador_id: colaborador!.id });
      expect(segunda.error?.code).toBe("23505");
    });
  });
});
