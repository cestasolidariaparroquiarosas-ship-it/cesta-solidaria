import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearCorreo, ErrorEnvio, type Correo } from "@/lib/correo/transporte";
import { configCorreo } from "@/lib/env";
import { candidatosOrdenados } from "@/lib/dominio/seleccion";
import { enviarAsignacion, enviarPendientes, enviarSemana } from "@/lib/servicios/envio";
import { listarCandidatos, proponerReparto } from "@/lib/servicios/reparto";
import { buscarSustituto, darDeBaja, leerAsignacion, responder } from "@/lib/servicios/respuestas";
import { crearSemana, guardarCesta } from "@/lib/servicios/semanas";
import { correosPara } from "../utilidades/mailpit";
import {
  ADMIN_PRUEBAS,
  SIN_ROL_PRUEBAS,
  asegurarUsuariosPruebas,
  clienteConSesion,
  clienteServicio,
} from "../utilidades/supabase";

// Envío, respuestas, reasignación y baja contra Supabase local y Mailpit (plan PR 6;
// CA-14 a CA-19, CA-21 en parte, CA-22, CA-24).

const MARCA = `envio-${Date.now()}`;
const URL_APP = "http://localhost:3000";
const ADMIN = `${MARCA}-admin@cesta.test`;

const fechaUnica = () =>
  new Date(Date.UTC(2900, 0, 1) + Math.floor(Math.random() * 300_000) * 86_400_000).toISOString().slice(0, 10);

describe("envío y respuestas", () => {
  let admin: SupabaseClient;
  let sinRol: SupabaseClient;
  const servicio = clienteServicio();
  let correo: Correo;
  const semanas: string[] = [];
  const col: Record<string, { id: string; email: string }> = {};
  let arroz: string;
  let aceite: string;

  async function colaborador(nombre: string, dia: number) {
    const email = `${MARCA}-${nombre}@cesta.test`.toLowerCase();
    // Dados de alta en 1970: los primeros de R2.4 entre los que nunca han participado.
    const { data, error } = await servicio
      .from("colaboradores")
      .insert({ nombre: `${nombre} ${MARCA}`, email, creado_en: `1970-01-${String(dia).padStart(2, "0")}T00:00:00Z` })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    col[nombre] = { id: data.id, email };
  }

  /** Semana con una cesta y un reparto ya propuesto: cada colaborador, sus unidades de arroz. */
  async function semanaConReparto(reparto: Record<string, number>, aceites = 0) {
    const fecha = fechaUnica();
    const s = await crearSemana(admin, {
      fecha_entrega: fecha,
      precio_base: 20,
      plazo_confirmacion: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    });
    if (!s.ok) throw new Error(s.error);
    semanas.push(s.valor.id);
    const unidades = Object.values(reparto).reduce((t, n) => t + n, 0);
    const c = await guardarCesta(admin, {
      id: null,
      semanaId: s.valor.id,
      datos: { identificador_receptor: `${MARCA} Familia secreta`, adultos: 2, ninos: 0, lista_base_id: null, exclusiones: [] },
      items: [
        { alimento_id: arroz, cantidad: unidades },
        ...(aceites ? [{ alimento_id: aceite, cantidad: aceites }] : []),
      ],
    });
    if (!c.ok) throw new Error(c.error);
    const { data: items } = await servicio.from("cesta_items").select("id, alimento_id").eq("cesta_id", c.valor.id);
    const ci = (a: string) => items!.find((i) => i.alimento_id === a)!.id;
    const nombres = Object.keys(reparto);
    const r = await proponerReparto(
      admin,
      s.valor.id,
      nombres.map((n, i) => ({
        colaborador_id: col[n]?.id ?? n,
        items: [
          { cesta_item_id: ci(arroz), cantidad: reparto[n] },
          ...(i === 0 && aceites ? [{ cesta_item_id: ci(aceite), cantidad: aceites }] : []),
        ],
      })),
    );
    if (!r.ok) throw new Error(r.error);
    return { id: s.valor.id, fecha };
  }

  async function asignacionDe(semanaId: string, colaboradorId: string) {
    const { data } = await servicio
      .from("asignaciones")
      .select("id, estado, token, plazo, enviado_en, respondido_en, sustituye_a")
      .eq("semana_id", semanaId)
      .eq("colaborador_id", colaboradorId)
      .single();
    return data!;
  }

  async function enviar(semanaId: string) {
    const r = await enviarSemana(admin, semanaId, correo, URL_APP);
    if (!r.ok) throw new Error(r.error);
    return r.valor;
  }

  beforeAll(async () => {
    await asegurarUsuariosPruebas();
    admin = await clienteConSesion(ADMIN_PRUEBAS);
    sinRol = await clienteConSesion(SIN_ROL_PRUEBAS);
    correo = crearCorreo({ ...configCorreo(), admin: ADMIN });
    const { data, error } = await servicio
      .from("alimentos")
      .insert([
        { nombre: `${MARCA} Arroz`, unidad: "paquete 1 kg", precio_aprox: 1.2 },
        { nombre: `${MARCA} Aceite`, unidad: "botella 1 l", precio_aprox: 7.5 },
      ])
      .select("id, nombre");
    if (error) throw new Error(error.message);
    arroz = data.find((a) => a.nombre.endsWith("Arroz"))!.id;
    aceite = data.find((a) => a.nombre.endsWith("Aceite"))!.id;
    for (const [i, n] of ["Ana", "Bea", "Carmen", "Dora"].entries()) await colaborador(n, i + 1);
  });

  afterAll(async () => {
    correo?.cerrar();
    if (semanas.length) await servicio.from("semanas").delete().in("id", semanas);
    await servicio.from("colaboradores").delete().like("email", `${MARCA}%`);
    await servicio.from("alimentos").delete().like("nombre", `${MARCA}%`);
  });

  it("CA-14: al enviar, cada colaborador recibe un solo correo con su lista, el plazo, los dos enlaces y el pie", async () => {
    const { id } = await semanaConReparto({ Ana: 4, Bea: 2 }, 1);
    expect(await enviar(id)).toEqual({ enviados: 2, fallidos: 0 });

    const ana = await asignacionDe(id, col.Ana.id);
    expect(ana).toMatchObject({ estado: "pendiente" });
    expect(ana.enviado_en).not.toBeNull();
    expect(ana.plazo).not.toBeNull();
    const { data: semana } = await servicio.from("semanas").select("estado").eq("id", id).single();
    expect(semana!.estado).toBe("enviada");

    const correos = await correosPara(col.Ana.email);
    expect(correos).toHaveLength(1);
    const [m] = correos;
    expect(m.Text).toContain("Hola, Ana:");
    expect(m.Text).toContain(`4 × ${MARCA} Arroz (paquete 1 kg)`);
    expect(m.Text).toContain(`1 × ${MARCA} Aceite (botella 1 l)`);
    expect(m.Text).toContain("Por favor, responde antes del");
    expect(m.Text).toContain(`${URL_APP}/r/${ana.token}?respuesta=si`);
    expect(m.Text).toContain(`${URL_APP}/r/${ana.token}?respuesta=no`);
    expect(m.Text).toContain(`${URL_APP}/baja/${ana.token}`);
    expect(m.Text).toContain("Protección de datos");
    // R4.7: "Responder a" el administrador. Y nunca el identificador del receptor.
    expect(m.ReplyTo.map((r) => r.Address)).toEqual([ADMIN]);
    expect(m.Text).not.toContain("Familia secreta");
    expect(await correosPara(col.Bea.email)).toHaveLength(1);

    // Enviar otra vez no se puede, y reintentar los pendientes no repite ninguno.
    expect(await enviarSemana(admin, id, correo, URL_APP)).toEqual({ ok: false, error: "no_editable" });
    expect(await enviarPendientes(admin, id, correo, URL_APP)).toEqual({ ok: true, valor: { enviados: 0, fallidos: 0 } });
    expect(await correosPara(col.Ana.email)).toHaveLength(1);
  });

  it("CA-15 y CA-24: leer el enlace no cambia nada y solo muestra nombre de pila, fecha y alimentos", async () => {
    const { id, fecha } = await semanaConReparto({ Ana: 3 });
    await enviar(id);
    const { token } = await asignacionDe(id, col.Ana.id);

    const vista = await leerAsignacion(servicio, token);
    expect(vista).toMatchObject({
      nombre: "Ana",
      fechaEntrega: fecha,
      situacion: "puede_responder",
      lineas: [{ cantidad: 3, nombre: `${MARCA} Arroz`, unidad: "paquete 1 kg" }],
    });
    // Ni el identificador del receptor ni el correo del colaborador.
    expect(JSON.stringify(vista)).not.toContain("Familia secreta");
    expect(JSON.stringify(vista)).not.toContain(col.Ana.email);
    expect((await asignacionDe(id, col.Ana.id)).estado).toBe("pendiente");
  });

  it("CA-16 y CA-19: confirmar deja la asignación confirmada; responder otra vez no cambia nada", async () => {
    const { id } = await semanaConReparto({ Ana: 2 });
    await enviar(id);
    const { token } = await asignacionDe(id, col.Ana.id);

    expect(await responder(servicio, token, "si", correo, URL_APP)).toBe("confirmada");
    const a = await asignacionDe(id, col.Ana.id);
    expect(a.estado).toBe("confirmada");
    expect(a.respondido_en).not.toBeNull();

    expect(await responder(servicio, token, "no", correo, URL_APP)).toBe("ya_respondida");
    expect((await asignacionDe(id, col.Ana.id)).estado).toBe("confirmada");
    expect((await leerAsignacion(servicio, token))?.situacion).toBe("confirmada");
  });

  it("CA-19: después del plazo no se acepta la respuesta", async () => {
    const { id } = await semanaConReparto({ Ana: 2 });
    await enviar(id);
    const a = await asignacionDe(id, col.Ana.id);
    await servicio.from("asignaciones").update({ plazo: new Date(Date.now() - 60_000).toISOString() }).eq("id", a.id);

    expect(await responder(servicio, a.token, "si", correo, URL_APP)).toBe("vencida");
    expect((await asignacionDe(id, col.Ana.id)).estado).toBe("pendiente");
    expect((await leerAsignacion(servicio, a.token))?.situacion).toBe("vencida");
  });

  it("CA-18: un token inexistente o manipulado no cambia nada", async () => {
    const { id } = await semanaConReparto({ Ana: 2 });
    await enviar(id);
    const { token } = await asignacionDe(id, col.Ana.id);
    const manipulado = `${token.slice(0, -1)}${token.endsWith("0") ? "1" : "0"}`;

    expect(await responder(servicio, manipulado, "si", correo, URL_APP)).toBe("no_encontrada");
    expect(await responder(servicio, "no-es-un-token", "si", correo, URL_APP)).toBe("no_encontrada");
    expect(await leerAsignacion(servicio, manipulado)).toBeNull();
    expect(await darDeBaja(servicio, manipulado, correo, URL_APP)).toBe("no_encontrada");
    expect((await asignacionDe(id, col.Ana.id)).estado).toBe("pendiente");
  });

  it("CA-17: al pulsar «No puedo», los alimentos pasan al siguiente candidato y su correo sale en el momento", async () => {
    const { id, fecha } = await semanaConReparto({ Ana: 2, Bea: 3 });
    await enviar(id);
    const bea = await asignacionDe(id, col.Bea.id);
    const antes = Date.now();

    expect(await responder(servicio, bea.token, "no", correo, URL_APP)).toBe("rechazada");
    expect((await asignacionDe(id, col.Bea.id)).estado).toBe("rechazada");

    // Ana ya tenía asignación esa semana: el siguiente es Carmen.
    const carmen = await asignacionDe(id, col.Carmen.id);
    expect(carmen).toMatchObject({ estado: "pendiente", sustituye_a: bea.id });
    expect(carmen.enviado_en).not.toBeNull();
    // R4.4: 48 horas desde el envío (la víspera de la entrega queda muy lejos).
    const plazo = new Date(carmen.plazo!).getTime();
    expect(plazo).toBeGreaterThanOrEqual(antes + 48 * 3_600_000 - 1000);
    expect(plazo).toBeLessThanOrEqual(Date.now() + 48 * 3_600_000 + 1000);
    expect(fecha > new Date(plazo).toISOString().slice(0, 10)).toBe(true);

    const { data: items } = await servicio.from("asignacion_items").select("cantidad").eq("asignacion_id", carmen.id);
    expect(items).toEqual([{ cantidad: 3 }]);
    const correosCarmen = await correosPara(col.Carmen.email);
    expect(correosCarmen.at(-1)?.Text).toContain("Otra persona no puede llevar estos alimentos");
    expect(correosCarmen.at(-1)?.Text).toContain(`3 × ${MARCA} Arroz`);
  });

  it("plan §4: dos rechazos a la vez eligen sustitutos distintos", async () => {
    const { id } = await semanaConReparto({ Ana: 1, Bea: 1 });
    await enviar(id);
    const [ana, bea] = await Promise.all([asignacionDe(id, col.Ana.id), asignacionDe(id, col.Bea.id)]);

    const resultados = await Promise.all([
      responder(servicio, ana.token, "no", correo, URL_APP),
      responder(servicio, bea.token, "no", correo, URL_APP),
    ]);
    expect(resultados).toEqual(["rechazada", "rechazada"]);
    const { data: nuevas } = await servicio
      .from("asignaciones")
      .select("colaborador_id")
      .eq("semana_id", id)
      .eq("estado", "pendiente");
    expect(nuevas).toHaveLength(2);
    expect(new Set(nuevas!.map((n) => n.colaborador_id)).size).toBe(2);
    expect(nuevas!.map((n) => n.colaborador_id)).not.toContain(col.Ana.id);
    expect(nuevas!.map((n) => n.colaborador_id)).not.toContain(col.Bea.id);
  });

  it("R4.6: si no queda nadie, el administrador recibe un aviso y los alimentos quedan sin cubrir; luego se puede buscar sustituto", async () => {
    // Todos los candidatos que haya ahora en la base de datos, con 1 arroz cada uno.
    const candidatos = await listarCandidatos(admin);
    if (!candidatos.ok) throw new Error(candidatos.error);
    const todos = candidatosOrdenados(candidatos.valor, "2900-01-01");
    const reparto = Object.fromEntries(todos.map((c) => [c.id, 1]));
    const { id } = await semanaConReparto(reparto);
    await enviar(id);
    const dora = await asignacionDe(id, col.Dora.id);

    expect(await responder(servicio, dora.token, "no", correo, URL_APP)).toBe("rechazada");
    const { data: items } = await servicio.from("asignacion_items").select("cantidad").eq("asignacion_id", dora.id);
    expect(items).toEqual([{ cantidad: 1 }]);
    const avisos = await correosPara(ADMIN);
    expect(avisos.at(-1)?.Subject).toContain("alimentos sin cubrir");
    expect(avisos.at(-1)?.Text).toContain("no queda ningún otro colaborador disponible");

    // Sigue sin haber nadie...
    expect(await buscarSustituto(admin, id, dora.id, correo, URL_APP)).toEqual({
      ok: true,
      valor: { encontrado: false, sinTiempo: false },
    });
    // ...hasta que se da de alta a alguien.
    await colaborador("Elena", 5);
    expect(await buscarSustituto(admin, id, dora.id, correo, URL_APP)).toEqual({
      ok: true,
      valor: { encontrado: true, sinTiempo: false },
    });
    expect((await asignacionDe(id, col.Elena.id)).estado).toBe("pendiente");
    expect(await correosPara(col.Elena.email)).toHaveLength(1);
    // Ya cubierto: no hay nada más que buscar.
    expect(await buscarSustituto(admin, id, dora.id, correo, URL_APP)).toEqual({ ok: false, error: "nada_que_cubrir" });
  });

  it("CA-22: la baja desde el enlace deja al colaborador de baja; lo pendiente pasa a otro", async () => {
    const { id } = await semanaConReparto({ Ana: 1, Bea: 1 });
    await enviar(id);
    const ana = await asignacionDe(id, col.Ana.id);
    const bea = await asignacionDe(id, col.Bea.id);
    await responder(servicio, ana.token, "si", correo, URL_APP);

    try {
      // Ana ya confirmó: se queda de baja, y lo confirmado se mantiene.
      expect(await darDeBaja(servicio, ana.token, correo, URL_APP)).toBe("baja");
      expect(await darDeBaja(servicio, ana.token, correo, URL_APP)).toBe("ya_de_baja");
      const { data: c } = await servicio.from("colaboradores").select("estado").eq("id", col.Ana.id).single();
      expect(c!.estado).toBe("baja");
      expect((await asignacionDe(id, col.Ana.id)).estado).toBe("confirmada");

      // Bea tenía la suya pendiente: se trata como un «no puedo» y pasa a otra persona.
      expect(await darDeBaja(servicio, bea.token, correo, URL_APP)).toBe("baja");
      expect((await asignacionDe(id, col.Bea.id)).estado).toBe("rechazada");
      const { data: sustituta } = await servicio
        .from("asignaciones")
        .select("colaborador_id")
        .eq("sustituye_a", bea.id)
        .single();
      expect(sustituta!.colaborador_id).not.toBe(col.Ana.id);
    } finally {
      await servicio.from("colaboradores").update({ estado: "activo" }).in("id", [col.Ana.id, col.Bea.id]);
    }
  });

  it("CA-03: no se envía la semana si alguien del reparto está de baja, ni se escribe a quien está de baja", async () => {
    const { id } = await semanaConReparto({ Ana: 1, Bea: 1 });
    await servicio.from("colaboradores").update({ estado: "baja" }).eq("id", col.Bea.id);
    try {
      expect(await enviarSemana(admin, id, correo, URL_APP)).toEqual({ ok: false, error: "colaborador_no_disponible" });

      // Si a pesar de todo queda una pendiente suya sin enviar, no se le escribe.
      await servicio.from("colaboradores").update({ estado: "activo" }).eq("id", col.Bea.id);
      const fallon: Correo = { admin: ADMIN, cerrar() {}, async enviar() { throw new ErrorEnvio("ECONNECTION"); } };
      expect(await enviarSemana(admin, id, fallon, URL_APP)).toEqual({ ok: true, valor: { enviados: 0, fallidos: 2 } });
      await servicio.from("colaboradores").update({ estado: "baja" }).eq("id", col.Bea.id);
      const antes = (await correosPara(col.Bea.email)).length;
      const bea = await asignacionDe(id, col.Bea.id);
      expect(await enviarAsignacion(admin, bea.id, correo, URL_APP)).toBe("no_aplica");
      expect(await correosPara(col.Bea.email)).toHaveLength(antes);
      expect((await asignacionDe(id, col.Bea.id)).enviado_en).toBeNull();
    } finally {
      await servicio.from("colaboradores").update({ estado: "activo" }).eq("id", col.Bea.id);
    }
  });

  it("plan §4: si el correo falla, la asignación queda sin enviar, se anota y se puede reintentar", async () => {
    const { id } = await semanaConReparto({ Carmen: 1 });
    const fallon: Correo = { admin: ADMIN, cerrar() {}, async enviar() { throw new ErrorEnvio("535"); } };
    expect(await enviarSemana(admin, id, fallon, URL_APP)).toEqual({ ok: true, valor: { enviados: 0, fallidos: 1 } });
    const a = await asignacionDe(id, col.Carmen.id);
    expect(a).toMatchObject({ estado: "pendiente", enviado_en: null });
    const { data: eventos } = await servicio.from("registro_eventos").select("detalle").eq("asignacion_id", a.id).eq("tipo", "error_envio");
    expect(eventos).toEqual([{ detalle: { codigo: "535" } }]);

    expect(await enviarPendientes(admin, id, correo, URL_APP)).toEqual({ ok: true, valor: { enviados: 1, fallidos: 0 } });
    expect((await asignacionDe(id, col.Carmen.id)).enviado_en).not.toBeNull();
  });

  it("CA-23: sin rol de administrador no se envía; y las funciones de los enlaces solo las usa el servidor", async () => {
    const { id } = await semanaConReparto({ Ana: 1 });
    const r = await enviarSemana(sinRol, id, correo, URL_APP);
    expect(r.ok).toBe(false);
    const { error } = await admin.rpc("responder_asignacion", {
      p_token: "0".repeat(64),
      p_respuesta: "si",
      p_candidatos: [],
      p_plazo: new Date().toISOString(),
    });
    expect(error?.code).toBe("42501");
    const { error: errorBaja } = await admin.rpc("dar_de_baja", { p_token: "0".repeat(64) });
    expect(errorBaja?.code).toBe("42501");
  });
});
