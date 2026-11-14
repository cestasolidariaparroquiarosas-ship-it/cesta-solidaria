import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  actualizarDatosColaborador,
  cambiarEstadoColaborador,
  crearColaborador,
  eliminarColaborador,
  listarColaboradores,
  obtenerColaborador,
} from "@/lib/servicios/colaboradores";
import {
  ADMIN_PRUEBAS,
  SIN_ROL_PRUEBAS,
  asegurarUsuariosPruebas,
  clienteConSesion,
  clienteServicio,
} from "../utilidades/supabase";

// Servicio de colaboradores contra Supabase local (plan PR 2, CA-01 a CA-04).
// Se usa con la sesión del administrador, igual que las acciones de la app.

const MARCA = `colab-${Date.now()}`;
const correo = (sufijo: string) => `${MARCA}-${sufijo}@ejemplo.test`;

// Todas las tablas de public: CA-04 comprueba que en ninguna queda el nombre ni el correo.
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
];

function fechaUnica() {
  const dias = Math.floor(Math.random() * 300_000);
  return new Date(Date.UTC(2100, 0, 1) + dias * 86_400_000).toISOString().slice(0, 10);
}

describe("servicio de colaboradores", () => {
  let admin: SupabaseClient;
  let sinRol: SupabaseClient;
  const servicio = clienteServicio();
  const semanasCreadas: string[] = [];

  beforeAll(async () => {
    await asegurarUsuariosPruebas();
    admin = await clienteConSesion(ADMIN_PRUEBAS);
    sinRol = await clienteConSesion(SIN_ROL_PRUEBAS);
  });

  afterAll(async () => {
    if (semanasCreadas.length) await servicio.from("semanas").delete().in("id", semanasCreadas);
    await servicio.from("colaboradores").delete().like("email", `${MARCA}%`);
  });

  async function crearSemana(fecha = fechaUnica()) {
    const { data, error } = await servicio
      .from("semanas")
      .insert({ fecha_entrega: fecha, precio_base: 20, plazo_confirmacion: new Date().toISOString() })
      .select("id, fecha_entrega")
      .single();
    if (error) throw error;
    semanasCreadas.push(data.id);
    return data as { id: string; fecha_entrega: string };
  }

  async function alta(nombre: string, sufijo: string) {
    const r = await crearColaborador(admin, { nombre, email: correo(sufijo), notas: null });
    if (!r.ok) throw new Error(`No se pudo crear: ${r.error}`);
    return r.valor.id;
  }

  it("da de alta un colaborador activo con la fecha de consentimiento", async () => {
    const id = await alta("Ana", "ana");
    const r = await obtenerColaborador(admin, id);
    expect(r.ok && r.valor).toMatchObject({ nombre: "Ana", email: correo("ana"), estado: "activo" });
    expect(r.ok && r.valor.fecha_consentimiento).toBeTruthy();
  });

  it("CA-01: con un correo que ya existe no se guarda y devuelve el aviso, aunque cambien las mayúsculas", async () => {
    await alta("Bea", "bea");
    const antes = await servicio.from("colaboradores").select("*", { count: "exact", head: true });

    const r = await crearColaborador(admin, { nombre: "Otra Bea", email: correo("bea").toUpperCase(), notas: null });
    expect(r).toEqual({ ok: false, error: "email_repetido" });

    const despues = await servicio.from("colaboradores").select("*", { count: "exact", head: true });
    expect(despues.count).toBe(antes.count);
  });

  it("CA-01: tampoco se puede cambiar el correo de alguien al de otro colaborador", async () => {
    await alta("Carlos", "carlos");
    const id = await alta("Carmen", "carmen");
    const r = await actualizarDatosColaborador(admin, id, { nombre: "Carmen", email: correo("carlos"), notas: null });
    expect(r).toEqual({ ok: false, error: "email_repetido" });
    const guardado = await obtenerColaborador(admin, id);
    expect(guardado.ok && guardado.valor.email).toBe(correo("carmen"));
  });

  it("anota el consentimiento en el mismo cambio que los datos", async () => {
    const { data } = await servicio
      .from("colaboradores")
      .insert({ nombre: "Sin consentimiento", email: correo("sincons") })
      .select("id")
      .single();
    const r = await actualizarDatosColaborador(
      admin,
      data!.id,
      { nombre: "Con consentimiento", email: correo("sincons"), notas: null },
      { registrarConsentimiento: true },
    );
    expect(r.ok).toBe(true);
    const c = await obtenerColaborador(admin, data!.id);
    expect(c.ok && c.valor.nombre).toBe("Con consentimiento");
    expect(c.ok && c.valor.fecha_consentimiento).toBeTruthy();
  });

  it("edita nombre, correo y notas", async () => {
    const id = await alta("Dani", "dani");
    const r = await actualizarDatosColaborador(admin, id, {
      nombre: "Daniel",
      email: correo("daniel"),
      notas: "Prefiere fines de mes",
    });
    expect(r.ok).toBe(true);
    const guardado = await obtenerColaborador(admin, id);
    expect(guardado.ok && guardado.valor).toMatchObject({
      nombre: "Daniel",
      email: correo("daniel"),
      notas: "Prefiere fines de mes",
    });
  });

  it("pausa con fecha de vuelta, reactiva y da de baja", async () => {
    const id = await alta("Elena", "elena");

    await cambiarEstadoColaborador(admin, id, { estado: "pausado", pausadoHasta: "2100-01-31" });
    let c = await obtenerColaborador(admin, id);
    expect(c.ok && c.valor).toMatchObject({ estado: "pausado", pausado_hasta: "2100-01-31" });

    await cambiarEstadoColaborador(admin, id, { estado: "activo" });
    c = await obtenerColaborador(admin, id);
    expect(c.ok && c.valor).toMatchObject({ estado: "activo", pausado_hasta: null });

    await cambiarEstadoColaborador(admin, id, { estado: "baja" });
    c = await obtenerColaborador(admin, id);
    expect(c.ok && c.valor).toMatchObject({ estado: "baja", pausado_hasta: null });
  });

  it("la lista filtra por estado y muestra la última participación confirmada", async () => {
    const id = await alta("Fermín", "fermin");
    await alta("Fátima", "fatima");
    const [vieja, nueva] = [await crearSemana(), await crearSemana()];
    const fechas = [vieja.fecha_entrega, nueva.fecha_entrega].sort();
    // La rechazada es posterior a las dos confirmadas.
    const diaSiguiente = new Date(Date.parse(fechas[1]) + 86_400_000).toISOString().slice(0, 10);
    const rechazada = await crearSemana(diaSiguiente);
    await servicio.from("asignaciones").insert([
      { semana_id: vieja.id, colaborador_id: id, estado: "confirmada", respondido_en: new Date().toISOString() },
      { semana_id: nueva.id, colaborador_id: id, estado: "confirmada", respondido_en: new Date().toISOString() },
      // Una rechazada no cuenta como participación, aunque sea más reciente.
      { semana_id: rechazada.id, colaborador_id: id, estado: "rechazada", respondido_en: new Date().toISOString() },
    ]);
    const todos = await listarColaboradores(admin);
    expect(todos.ok).toBe(true);
    const fermin = todos.ok ? todos.valor.find((c) => c.id === id) : undefined;
    // La más reciente de las dos confirmadas; la rechazada no cuenta.
    expect(fermin?.ultima_participacion).toBe(fechas[1]);

    await cambiarEstadoColaborador(admin, id, { estado: "pausado", pausadoHasta: null });
    const pausados = await listarColaboradores(admin, "pausado");
    expect(pausados.ok && pausados.valor.every((c) => c.estado === "pausado")).toBe(true);
    expect(pausados.ok && pausados.valor.some((c) => c.id === id)).toBe(true);
    const activos = await listarColaboradores(admin, "activo");
    expect(activos.ok && activos.valor.some((c) => c.id === id)).toBe(false);
  });

  it("CA-04: tras eliminar definitivamente, su nombre y su correo no están en ninguna tabla", async () => {
    const nombre = `${MARCA} Gregorio Único`;
    const id = await alta(nombre, "gregorio");
    const semana = await crearSemana();
    // Semana cerrada: la asignación confirmada ya no está en curso.
    await servicio.from("semanas").update({ estado: "cerrada", cerrada_en: new Date().toISOString() }).eq("id", semana.id);
    const { data: asignacion } = await servicio
      .from("asignaciones")
      .insert({ semana_id: semana.id, colaborador_id: id, estado: "confirmada", respondido_en: new Date().toISOString() })
      .select("id")
      .single();
    await servicio
      .from("registro_eventos")
      .insert({ tipo: "respuesta", semana_id: semana.id, asignacion_id: asignacion!.id, detalle: { estado: "confirmada" } });

    const r = await eliminarColaborador(admin, id);
    expect(r).toEqual({ ok: true, valor: undefined });

    for (const tabla of TABLAS) {
      const { data, error } = await servicio.from(tabla).select("*");
      expect(error, tabla).toBeNull();
      const texto = JSON.stringify(data).toLowerCase();
      expect(texto.includes(nombre.toLowerCase()), `${tabla} contiene el nombre`).toBe(false);
      expect(texto.includes(correo("gregorio")), `${tabla} contiene el correo`).toBe(false);
    }

    // La asignación se conserva, sin colaborador: se mostrará como "Colaborador eliminado".
    const { data: conservada } = await servicio
      .from("asignaciones")
      .select("colaborador_id, estado")
      .eq("id", asignacion!.id)
      .single();
    expect(conservada).toEqual({ colaborador_id: null, estado: "confirmada" });
  });

  it("con una asignación pendiente no deja eliminar, ni dar de baja, ni pausar (CA-03: le llegarían correos)", async () => {
    const id = await alta("Hugo", "hugo");
    const semana = await crearSemana();
    await servicio
      .from("asignaciones")
      .insert({ semana_id: semana.id, colaborador_id: id, estado: "pendiente", plazo: new Date().toISOString() });

    const enCurso = { ok: false, error: "asignacion_en_curso" };
    expect(await eliminarColaborador(admin, id)).toEqual(enCurso);
    expect(await cambiarEstadoColaborador(admin, id, { estado: "baja" })).toEqual(enCurso);
    expect(await cambiarEstadoColaborador(admin, id, { estado: "pausado", pausadoHasta: null })).toEqual(enCurso);
    const sigue = await obtenerColaborador(admin, id);
    expect(sigue.ok && sigue.valor.estado).toBe("activo");
  });

  it("con una propuesta (semana aún sin enviar) tampoco deja darlo de baja", async () => {
    const id = await alta("Inés", "ines");
    const semana = await crearSemana();
    await servicio.from("asignaciones").insert({ semana_id: semana.id, colaborador_id: id, estado: "propuesta" });
    expect(await cambiarEstadoColaborador(admin, id, { estado: "baja" })).toEqual({
      ok: false,
      error: "asignacion_en_curso",
    });
  });

  it("confirmada sin entregar en una semana abierta: se puede dar de baja, pero no eliminar", async () => {
    const id = await alta("Jaime", "jaime");
    const semana = await crearSemana();
    const { data: asignacion } = await servicio
      .from("asignaciones")
      .insert({ semana_id: semana.id, colaborador_id: id, estado: "confirmada", respondido_en: new Date().toISOString() })
      .select("id")
      .single();

    expect(await eliminarColaborador(admin, id)).toEqual({ ok: false, error: "asignacion_en_curso" });
    // Ya confirmó: lo lleva igualmente; la baja solo evita lo que venga después.
    expect((await cambiarEstadoColaborador(admin, id, { estado: "baja" })).ok).toBe(true);

    // Una vez entregado, ya se puede eliminar.
    await servicio.from("asignaciones").update({ entregado: true }).eq("id", asignacion!.id);
    expect((await eliminarColaborador(admin, id)).ok).toBe(true);
  });

  it("un id inexistente o mal formado no rompe nada", async () => {
    expect(await obtenerColaborador(admin, "no-es-un-uuid")).toEqual({ ok: false, error: "no_encontrado" });
    expect(await obtenerColaborador(admin, "00000000-0000-4000-8000-000000000000")).toEqual({
      ok: false,
      error: "no_encontrado",
    });
    expect(await eliminarColaborador(admin, "00000000-0000-4000-8000-000000000000")).toEqual({
      ok: false,
      error: "no_encontrado",
    });
  });

  describe("CA-23: un usuario sin rol de administrador no puede usar el servicio", () => {
    it("no puede dar de alta", async () => {
      const r = await crearColaborador(sinRol, { nombre: "Intruso", email: correo("intruso"), notas: null });
      expect(r).toEqual({ ok: false, error: "sin_permiso" });
    });

    it("no ve a nadie, ni puede cambiar, pausar ni eliminar", async () => {
      const id = await alta("Irene", "irene");
      const lista = await listarColaboradores(sinRol);
      expect(lista).toEqual({ ok: true, valor: [] });
      expect(await obtenerColaborador(sinRol, id)).toEqual({ ok: false, error: "no_encontrado" });
      expect(await cambiarEstadoColaborador(sinRol, id, { estado: "baja" })).toEqual({
        ok: false,
        error: "no_encontrado",
      });
      expect(await eliminarColaborador(sinRol, id)).toEqual({ ok: false, error: "no_encontrado" });

      const sigue = await obtenerColaborador(admin, id);
      expect(sigue.ok && sigue.valor.estado).toBe("activo");
    });
  });
});
