import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearCorreo, type Correo } from "@/lib/correo/transporte";
import { configCorreo } from "@/lib/env";
import { candidatosOrdenados } from "@/lib/dominio/seleccion";
import { tareaDiaria } from "@/lib/servicios/cron";
import { listarCandidatos } from "@/lib/servicios/reparto";
import { hoyEnMadrid, sumarDias } from "@/lib/fechas";
import { GET } from "@/app/api/cron/diario/route";
import { correosPara } from "../utilidades/mailpit";
import { clienteServicio } from "../utilidades/supabase";

// Cron diario contra Supabase local y Mailpit (plan PR 7; CA-20, CA-21, CA-26, CA-27).

const MARCA = `cron-${Date.now()}`;
const URL_APP = "http://localhost:3000";
const ADMIN = `${MARCA}-admin@cesta.test`;
const HORA = 3_600_000;

describe("tarea diaria", () => {
  const servicio = clienteServicio();
  let correo: Correo;
  const semanas: string[] = [];
  const col: Record<string, { id: string; email: string }> = {};
  let arroz: string;

  async function colaborador(nombre: string, dia: number) {
    const email = `${MARCA}-${nombre}@cesta.test`.toLowerCase();
    // Dados de alta en 1960: los primeros de R2.4 entre los que nunca han participado.
    const { data, error } = await servicio
      .from("colaboradores")
      .insert({ nombre: `${nombre} ${MARCA}`, email, creado_en: `1960-01-${String(dia).padStart(2, "0")}T00:00:00Z` })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    col[nombre] = { id: data.id, email };
  }

  /**
   * Semana ya enviada, con una asignación pendiente por colaborador (1 arroz cada una)
   * y el plazo que se indique para cada una (en horas desde ahora).
   */
  async function semanaEnviada(fecha: string, plazos: Record<string, number>) {
    const { data: s, error } = await servicio
      .from("semanas")
      .insert({ fecha_entrega: fecha, precio_base: 20, plazo_confirmacion: new Date(Date.now() + HORA).toISOString() })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    semanas.push(s.id);
    const ids = Object.keys(plazos);
    const { data: cesta } = await servicio
      .from("cestas")
      .insert({ semana_id: s.id, identificador_receptor: "Familia", adultos: 1, ninos: 0 })
      .select("id")
      .single();
    const { data: item } = await servicio
      .from("cesta_items")
      .insert({ cesta_id: cesta!.id, alimento_id: arroz, cantidad: ids.length })
      .select("id")
      .single();
    const asignaciones: Record<string, string> = {};
    for (const id of ids) {
      const colaboradorId = col[id]?.id ?? id;
      const { data: a, error: e } = await servicio
        .from("asignaciones")
        .insert({
          semana_id: s.id,
          colaborador_id: colaboradorId,
          estado: "pendiente",
          plazo: new Date(Date.now() + plazos[id] * HORA).toISOString(),
          enviado_en: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (e) throw new Error(e.message);
      await servicio.from("asignacion_items").insert({ asignacion_id: a.id, cesta_item_id: item!.id, cantidad: 1 });
      asignaciones[id] = a.id;
    }
    await servicio.from("semanas").update({ estado: "enviada" }).eq("id", s.id);
    return { id: s.id, asignaciones };
  }

  async function estado(asignacionId: string) {
    const { data } = await servicio.from("asignaciones").select("estado").eq("id", asignacionId).single();
    return data!.estado as string;
  }

  async function sustituta(asignacionId: string) {
    const { data } = await servicio
      .from("asignaciones")
      .select("colaborador_id, estado, enviado_en")
      .eq("sustituye_a", asignacionId)
      .maybeSingle();
    return data;
  }

  const fechaFutura = () => sumarDias(hoyEnMadrid(), 300 + Math.floor(Math.random() * 300_000));

  beforeAll(async () => {
    correo = crearCorreo({ ...configCorreo(), admin: ADMIN });
    const { data, error } = await servicio
      .from("alimentos")
      .insert({ nombre: `${MARCA} Arroz`, unidad: "paquete 1 kg", precio_aprox: 1.2 })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    arroz = data.id;
    for (const [i, n] of ["Ana", "Bea", "Carmen", "Dora"].entries()) await colaborador(n, i + 1);
  });

  afterAll(async () => {
    correo?.cerrar();
    if (semanas.length) await servicio.from("semanas").delete().in("id", semanas);
    await servicio.from("colaboradores").delete().like("email", `${MARCA}%`);
    await servicio.from("alimentos").delete().like("nombre", `${MARCA}%`);
  });

  it("CA-20: pasa a «sin respuesta» y reasigna las pendientes con el plazo vencido, y solo esas", async () => {
    // Ana venció hace una hora; Bea aún tiene tiempo.
    const { asignaciones } = await semanaEnviada(fechaFutura(), { Ana: -1, Bea: 24 });
    // Dora confirmó, con el plazo vencido: no se toca. (Y como ya ha participado,
    // pasa por detrás de Carmen en R2.4.)
    const otra = await semanaEnviada(fechaFutura(), { Dora: -1 });
    await servicio.from("asignaciones").update({ estado: "confirmada" }).eq("id", otra.asignaciones.Dora);

    const resumen = await tareaDiaria(servicio, correo, URL_APP);
    expect(resumen.baseDeDatos).toBe("ok");
    expect(resumen.vencidas).toBeGreaterThanOrEqual(1);

    expect(await estado(asignaciones.Ana)).toBe("sin_respuesta");
    expect(await estado(asignaciones.Bea)).toBe("pendiente");
    expect(await estado(otra.asignaciones.Dora)).toBe("confirmada");

    // R4.4: sus alimentos, al siguiente candidato que no tenga asignación esa semana.
    // Ana y Bea ya la tienen, y Dora ya participó: Carmen. Y su correo sale en el momento.
    const nueva = await sustituta(asignaciones.Ana);
    expect(nueva).toMatchObject({ colaborador_id: col.Carmen.id, estado: "pendiente" });
    expect(nueva!.enviado_en).not.toBeNull();
    expect((await correosPara(col.Carmen.email)).at(-1)?.Text).toContain("Otra persona no puede llevar");

    // Otra pasada no cambia nada más.
    await tareaDiaria(servicio, correo, URL_APP);
    expect(await estado(asignaciones.Bea)).toBe("pendiente");
    expect(await sustituta(asignaciones.Bea)).toBeNull();
  });

  it("si la entrega ya pasó, solo se anota «sin respuesta»: ni reasigna ni avisa", async () => {
    const avisosAntes = (await correosPara(ADMIN)).length;
    const { asignaciones } = await semanaEnviada(sumarDias(hoyEnMadrid(), -3 - Math.floor(Math.random() * 30_000)), {
      Dora: -100,
    });
    await tareaDiaria(servicio, correo, URL_APP);
    expect(await estado(asignaciones.Dora)).toBe("sin_respuesta");
    expect(await sustituta(asignaciones.Dora)).toBeNull();
    const { data: items } = await servicio.from("asignacion_items").select("cantidad").eq("asignacion_id", asignaciones.Dora);
    expect(items).toEqual([{ cantidad: 1 }]);
    expect(await correosPara(ADMIN)).toHaveLength(avisosAntes);
  });

  it("CA-21: si no quedan candidatos para reasignar, el administrador recibe un aviso", async () => {
    const fecha = fechaFutura();
    const candidatos = await listarCandidatos(servicio);
    if (!candidatos.ok) throw new Error(candidatos.error);
    // Todos los candidatos que haya ahora en la base de datos tienen asignación esa semana.
    const todos = candidatosOrdenados(candidatos.valor, fecha).map((c) => c.id);
    const plazos = Object.fromEntries(todos.map((id) => [id, 24]));
    const { asignaciones } = await semanaEnviada(fecha, { ...plazos, [col.Ana.id]: -1 });

    const resumen = await tareaDiaria(servicio, correo, URL_APP);
    expect(resumen.sinSustituto).toBeGreaterThanOrEqual(1);
    expect(await estado(asignaciones[col.Ana.id])).toBe("sin_respuesta");
    expect(await sustituta(asignaciones[col.Ana.id])).toBeNull();
    const aviso = (await correosPara(ADMIN)).at(-1);
    expect(aviso?.Subject).toContain("alimentos sin cubrir");
    expect(aviso?.Text).toContain("no queda ningún otro colaborador disponible");
  });

  it("reintenta los correos que no salieron (y no los de plazo vencido)", async () => {
    const { asignaciones } = await semanaEnviada(fechaFutura(), { Bea: 24 });
    await servicio.from("asignaciones").update({ enviado_en: null }).eq("id", asignaciones.Bea);
    const antes = (await correosPara(col.Bea.email)).length;

    const resumen = await tareaDiaria(servicio, correo, URL_APP);
    expect(resumen.reenviados).toBeGreaterThanOrEqual(1);
    const { data } = await servicio.from("asignaciones").select("enviado_en").eq("id", asignaciones.Bea).single();
    expect(data!.enviado_en).not.toBeNull();
    expect(await correosPara(col.Bea.email)).toHaveLength(antes + 1);
  });

  describe("ruta /api/cron/diario", () => {
    const url = "http://localhost:3000/api/cron/diario";

    it("CA-26: sin el secreto, o con otro, responde 401 y no hace nada", async () => {
      const { asignaciones } = await semanaEnviada(fechaFutura(), { Bea: -1 });
      const casos: Record<string, string>[] = [
        {},
        { authorization: "Bearer otro" },
        { authorization: process.env.CRON_SECRET! },
      ];
      for (const cabeceras of casos) {
        const respuesta = await GET(new Request(url, { headers: cabeceras }));
        expect(respuesta.status).toBe(401);
      }
      expect(await estado(asignaciones.Bea)).toBe("pendiente");
    });

    it("CA-27: con el secreto, hace su trabajo y una consulta a la base de datos", async () => {
      const respuesta = await GET(new Request(url, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
      expect(respuesta.status).toBe(200);
      const resumen = await respuesta.json();
      expect(resumen).toMatchObject({ baseDeDatos: "ok" });
      // Solo números: nada de nombres ni correos en la respuesta.
      expect(Object.values(resumen).every((v) => typeof v === "number" || v === "ok")).toBe(true);
    });
  });
});
