import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearCorreo, type Correo } from "@/lib/correo/transporte";
import { configCorreo } from "@/lib/env";
import { hoyEnMadrid, sumarDias } from "@/lib/fechas";
import { tareaDiaria } from "@/lib/servicios/cron";
import { cerrarSemana, listarCerradas, marcarEntregado } from "@/lib/servicios/historico";
import { obtenerReparto } from "@/lib/servicios/reparto";
import {
  ADMIN_PRUEBAS,
  SIN_ROL_PRUEBAS,
  asegurarUsuariosPruebas,
  clienteConSesion,
  clienteServicio,
} from "../utilidades/supabase";

// Cierre de semanas, entregado, histórico y conservación a 12 meses (plan PR 8; CA-29).

const MARCA = `historico-${Date.now()}`;
const HORA = 3_600_000;

describe("histórico", () => {
  let admin: SupabaseClient;
  let sinRol: SupabaseClient;
  const servicio = clienteServicio();
  let correo: Correo;
  const semanas: string[] = [];
  const col: Record<string, string> = {};
  let arroz: string;

  async function comprobar<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
    const { data, error } = await p;
    if (error || data === null || data === undefined) throw new Error(error?.message ?? "Sin datos");
    return data;
  }

  /**
   * Semana enviada con una cesta («Familia Uno», «Familia Dos») y tres asignaciones:
   * Ana confirmada (2 arroces), Bea pendiente (1 arroz) y Carmen que no pudo (sin nada).
   */
  async function semanaEnviada(fecha: string) {
    const s = await comprobar(
      servicio
        .from("semanas")
        .insert({ fecha_entrega: fecha, precio_base: 20, plazo_confirmacion: new Date(Date.now() + HORA).toISOString() })
        .select("id")
        .single(),
    );
    semanas.push(s.id);
    const cestas = await comprobar(
      servicio
        .from("cestas")
        .insert([
          { semana_id: s.id, identificador_receptor: "Familia Uno", adultos: 1, ninos: 0 },
          { semana_id: s.id, identificador_receptor: "Familia Dos", adultos: 1, ninos: 0 },
        ])
        .select("id"),
    );
    const item = await comprobar(
      servicio.from("cesta_items").insert({ cesta_id: cestas[0].id, alimento_id: arroz, cantidad: 3 }).select("id").single(),
    );
    const plazo = new Date(Date.now() + HORA).toISOString();
    const ahora = new Date().toISOString();
    const asig = await comprobar(
      servicio
        .from("asignaciones")
        .insert([
          { semana_id: s.id, colaborador_id: col.Ana, estado: "confirmada", plazo, respondido_en: ahora, enviado_en: ahora },
          { semana_id: s.id, colaborador_id: col.Bea, estado: "pendiente", plazo, enviado_en: ahora },
          { semana_id: s.id, colaborador_id: col.Carmen, estado: "rechazada", plazo, respondido_en: ahora, enviado_en: ahora },
        ])
        .select("id, colaborador_id"),
    );
    const id = (c: string) => asig.find((a) => a.colaborador_id === col[c])!.id;
    await comprobar(
      servicio
        .from("asignacion_items")
        .insert([
          { asignacion_id: id("Ana"), cesta_item_id: item.id, cantidad: 2 },
          { asignacion_id: id("Bea"), cesta_item_id: item.id, cantidad: 1 },
        ])
        .select(),
    );
    await comprobar(servicio.from("semanas").update({ estado: "enviada" }).eq("id", s.id).select());
    return { id: s.id, asignacion: id };
  }

  async function estadoSemana(id: string) {
    const { data } = await servicio.from("semanas").select("estado").eq("id", id).single();
    return data!.estado as string;
  }

  // Fechas de entrega pasadas que no chocan con otras pruebas (año 1800 y pico).
  const fechaPasada = () => sumarDias("1850-01-01", Math.floor(Math.random() * 40_000));

  beforeAll(async () => {
    await asegurarUsuariosPruebas();
    admin = await clienteConSesion(ADMIN_PRUEBAS);
    sinRol = await clienteConSesion(SIN_ROL_PRUEBAS);
    correo = crearCorreo({ ...configCorreo(), admin: `${MARCA}-admin@cesta.test` });
    arroz = (
      await comprobar(
        servicio.from("alimentos").insert({ nombre: `${MARCA} Arroz`, unidad: "paquete 1 kg", precio_aprox: 1.2 }).select("id").single(),
      )
    ).id;
    for (const nombre of ["Ana", "Bea", "Carmen"]) {
      col[nombre] = (
        await comprobar(
          servicio
            .from("colaboradores")
            .insert({ nombre: `${nombre} ${MARCA}`, email: `${MARCA}-${nombre}@cesta.test`.toLowerCase() })
            .select("id")
            .single(),
        )
      ).id;
    }
  });

  afterAll(async () => {
    correo?.cerrar();
    if (semanas.length) await servicio.from("semanas").delete().in("id", semanas);
    await servicio.from("colaboradores").delete().like("email", `${MARCA}%`);
    await servicio.from("alimentos").delete().like("nombre", `${MARCA}%`);
  });

  it("cerrar: solo una semana enviada cuya entrega ha llegado; lo pendiente queda sin respuesta", async () => {
    const futura = await semanaEnviada(sumarDias(hoyEnMadrid(), 5000 + Math.floor(Math.random() * 30_000)));
    expect(await cerrarSemana(admin, futura.id)).toEqual({ ok: false, error: "entrega_futura" });

    const { id, asignacion } = await semanaEnviada(fechaPasada());
    expect(await cerrarSemana(sinRol, id)).toEqual({ ok: false, error: "no_encontrado" });
    expect(await cerrarSemana(admin, id)).toEqual({ ok: true, valor: 1 });
    expect(await estadoSemana(id)).toBe("cerrada");
    const { data: bea } = await servicio.from("asignaciones").select("estado").eq("id", asignacion("Bea")).single();
    expect(bea!.estado).toBe("sin_respuesta");
    expect(await cerrarSemana(admin, id)).toEqual({ ok: false, error: "no_enviada" });
  });

  it("CA-29: el histórico muestra cada colaborador con sus alimentos y su estado final", async () => {
    const { id, asignacion } = await semanaEnviada(fechaPasada());
    // Entregado: solo en las confirmadas, también con la semana ya cerrada.
    expect(await marcarEntregado(admin, id, asignacion("Bea"), true)).toEqual({ ok: false, error: "no_encontrado" });
    await cerrarSemana(admin, id);
    expect(await marcarEntregado(admin, id, asignacion("Ana"), true)).toEqual({ ok: true, valor: undefined });
    expect(await marcarEntregado(sinRol, id, asignacion("Ana"), false)).toEqual({ ok: false, error: "no_encontrado" });

    const cerradas = await listarCerradas(admin);
    const esta = cerradas.ok ? cerradas.valor.find((s) => s.id === id) : undefined;
    expect(esta?.asignaciones).toHaveLength(3);
    expect(esta?.asignaciones.filter((a) => a.entregado)).toHaveLength(1);

    const detalle = await obtenerReparto(admin, id);
    if (!detalle.ok) throw new Error(detalle.error);
    const de = (c: string) => detalle.valor.find((a) => a.colaborador?.id === col[c])!;
    expect(de("Ana")).toMatchObject({ estado: "confirmada", entregado: true });
    expect(de("Ana").items).toEqual([expect.objectContaining({ nombre: `${MARCA} Arroz`, cantidad: 2 })]);
    expect(de("Bea")).toMatchObject({ estado: "sin_respuesta", entregado: false });
    expect(de("Carmen")).toMatchObject({ estado: "rechazada", items: [] });
    expect(await listarCerradas(sinRol)).toEqual({ ok: true, valor: [] });
  });

  it("el cron cierra solo las semanas a los 7 días de la entrega, y no antes", async () => {
    const vieja = await semanaEnviada(sumarDias(hoyEnMadrid(), -7));
    const reciente = await semanaEnviada(sumarDias(hoyEnMadrid(), -6));
    const resumen = await tareaDiaria(servicio, correo, "http://localhost:3000");
    expect(resumen.semanasCerradas).toBeGreaterThanOrEqual(1);
    expect(await estadoSemana(vieja.id)).toBe("cerrada");
    expect(await estadoSemana(reciente.id)).toBe("enviada");
  });

  it("conservación (spec §10): a los 12 meses de cerrar, «Familia …» pasa a «Cesta n.º X»", async () => {
    const reciente = await semanaEnviada(fechaPasada());
    const antigua = await semanaEnviada(fechaPasada());
    await cerrarSemana(admin, reciente.id);
    await cerrarSemana(admin, antigua.id);
    const haceTreceMeses = new Date(Date.now() - 395 * 24 * HORA).toISOString();
    await comprobar(servicio.from("semanas").update({ cerrada_en: haceTreceMeses }).eq("id", antigua.id).select());

    const resumen = await tareaDiaria(servicio, correo, "http://localhost:3000");
    expect(resumen.cestasConservadas).toBeGreaterThanOrEqual(2);
    const nombres = async (semana: string) =>
      (await comprobar(servicio.from("cestas").select("identificador_receptor").eq("semana_id", semana).order("creado_en")))
        .map((c) => c.identificador_receptor)
        .sort();
    expect(await nombres(antigua.id)).toEqual(["Cesta n.º 1", "Cesta n.º 2"]);
    expect(await nombres(reciente.id)).toEqual(["Familia Dos", "Familia Uno"]);

    // Otra pasada no cambia nada más.
    await tareaDiaria(servicio, correo, "http://localhost:3000");
    expect(await nombres(antigua.id)).toEqual(["Cesta n.º 1", "Cesta n.º 2"]);
  });
});
