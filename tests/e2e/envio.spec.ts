import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { hoyEnMadrid, sumarDias } from "../../lib/fechas";
import { correosPara, enlace } from "../utilidades/mailpit";
import { clienteServicio } from "../utilidades/supabase";
import { entrarComoAdmin } from "./utilidades";

// Envío, respuestas y baja (plan PR 6). Escriben datos: solo contra Supabase local.
//
// Aquí no se deja que nadie rechace con sustitutos posibles: el sustituto saldría de
// todos los colaboradores de la base de datos, también de los de otras pruebas que se
// ejecutan a la vez. La reasignación se prueba en tests/integration/envio.test.ts.
test.skip(Boolean(process.env.BASE_URL), "Solo contra Supabase local");

config({ path: ".env.local", quiet: true });
const MARCA = `e2e-envio-${Date.now()}`;
const semanas: string[] = [];
const alimentos: Record<string, string> = {};
const col: Record<string, { id: string; email: string }> = {};

function comprobar<T>({ data, error }: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (error || data === null || data === undefined) throw new Error(`No se han podido preparar los datos: ${error?.message}`);
  return data;
}

test.beforeAll(async ({}, info) => {
  const s = clienteServicio();
  const sufijo = info.project.name;
  for (const f of comprobar(
    await s
      .from("alimentos")
      .insert([
        { nombre: `${MARCA}-${sufijo} Arroz`, unidad: "paquete 1 kg", precio_aprox: 1.2 },
        { nombre: `${MARCA}-${sufijo} Aceite de oliva virgen extra`, unidad: "botella 1 l", precio_aprox: 7.5 },
      ])
      .select("id, nombre"),
  )) {
    alimentos[f.nombre.endsWith("Arroz") ? "Arroz" : "Aceite"] = f.id;
  }
  // Nombre de pila primero: es lo único que muestran las páginas públicas (CA-24).
  for (const nombre of ["Ana", "Bea"]) {
    const email = `${MARCA}-${sufijo}-${nombre}@cesta.test`.toLowerCase();
    const c = comprobar(
      await s.from("colaboradores").insert({ nombre: `${nombre} ${MARCA}`, email }).select("id").single(),
    );
    col[nombre] = { id: c.id, email };
  }
});

test.afterAll(async () => {
  const s = clienteServicio();
  if (semanas.length) await s.from("semanas").delete().in("id", semanas);
  await s.from("colaboradores").delete().like("email", `${MARCA}%`);
  await s.from("alimentos").delete().like("nombre", `${MARCA}%`);
});

/**
 * Semana con una cesta (3 arroces y 1 aceite) y su reparto ya hecho: Ana, el aceite y
 * 2 arroces; Bea, 1 arroz. `enviada` la deja ya enviada, con las asignaciones pendientes.
 */
async function semanaConReparto({ fecha, enviada = false }: { fecha: string; enviada?: boolean }) {
  const s = clienteServicio();
  const plazo = new Date(Date.now() + 3_600_000).toISOString();
  const semana = comprobar(
    await s
      .from("semanas")
      .insert({ fecha_entrega: fecha, precio_base: 20, plazo_confirmacion: plazo })
      .select("id")
      .single(),
  );
  semanas.push(semana.id);
  const cesta = comprobar(
    await s
      .from("cestas")
      .insert({ semana_id: semana.id, identificador_receptor: `${MARCA} Familia secreta`, adultos: 2, ninos: 0 })
      .select("id")
      .single(),
  );
  const items = comprobar(
    await s
      .from("cesta_items")
      .insert([
        { cesta_id: cesta.id, alimento_id: alimentos.Arroz, cantidad: 3 },
        { cesta_id: cesta.id, alimento_id: alimentos.Aceite, cantidad: 1 },
      ])
      .select("id, alimento_id"),
  );
  const ci = (a: string) => items.find((i) => i.alimento_id === a)!.id;
  const estado = enviada ? { estado: "pendiente", plazo, enviado_en: new Date().toISOString() } : {};
  const asignaciones = comprobar(
    await s
      .from("asignaciones")
      .insert([
        { semana_id: semana.id, colaborador_id: col.Ana.id, ...estado },
        { semana_id: semana.id, colaborador_id: col.Bea.id, ...estado },
      ])
      .select("id, colaborador_id, token"),
  );
  const de = (c: string) => asignaciones.find((a) => a.colaborador_id === col[c].id)!;
  comprobar(
    await s
      .from("asignacion_items")
      .insert([
        { asignacion_id: de("Ana").id, cesta_item_id: ci(alimentos.Aceite), cantidad: 1 },
        { asignacion_id: de("Ana").id, cesta_item_id: ci(alimentos.Arroz), cantidad: 2 },
        { asignacion_id: de("Bea").id, cesta_item_id: ci(alimentos.Arroz), cantidad: 1 },
      ])
      .select(),
  );
  if (enviada) comprobar(await s.from("semanas").update({ estado: "enviada" }).eq("id", semana.id).select());
  return { semana: semana.id, token: (c: string) => de(c).token as string };
}

async function estadoDe(token: string) {
  const { data } = await clienteServicio().from("asignaciones").select("estado").eq("token", token).single();
  return data!.estado as string;
}

const fechaFutura = () => sumarDias(hoyEnMadrid(), 30 + Math.floor(Math.random() * 3000));

async function sinDesbordar(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
}

test.describe("envío en escritorio", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) < 768, "Solo en escritorio");

  test("CA-14, CA-15, CA-16, CA-24 y CA-22: enviar, abrir el enlace, confirmar y darse de baja", async ({ page }) => {
    const { semana } = await semanaConReparto({ fecha: fechaFutura() });
    await entrarComoAdmin(page);
    await page.goto(`/semanas/${semana}`);

    // CA-14: enviar, con confirmación.
    await page.getByLabel(/Quiero enviar el correo a los 2 colaboradores/).check();
    await page.getByRole("button", { name: "Enviar los correos" }).click();
    await expect(page.getByRole("status")).toHaveText("Semana enviada: cada colaborador ha recibido su correo.");
    const respuestas = page.getByRole("list", { name: "Respuestas" });
    await expect(respuestas.getByText("Esperando respuesta")).toHaveCount(2);

    const [correo] = await correosPara(col.Ana.email);
    expect(correo.Text).toContain("2 × ");
    const urlSi = enlace(correo, "respuesta=si");
    const token = urlSi.match(/\/r\/([0-9a-f]{64})/)![1];

    // CA-15: abrir el enlace (GET) no cambia nada. CA-24: solo nombre de pila, fecha y alimentos.
    await page.goto(urlSi);
    await expect(page.getByRole("heading", { name: "Hola, Ana" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Alimentos" })).toContainText("2 × ");
    await expect(page.getByText("Has elegido «Puedo llevarlo»")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Familia secreta");
    await expect(page.locator("body")).not.toContainText(col.Ana.email);
    expect(await estadoDe(token)).toBe("pendiente");

    // CA-16: confirmar al pulsar el botón.
    await page.getByRole("button", { name: "Sí, puedo llevarlo" }).click();
    await expect(page.getByRole("status")).toHaveText("¡Gracias, Ana!");
    expect(await estadoDe(token)).toBe("confirmada");
    // CA-19: el mismo enlace, otra vez, solo lo explica.
    await page.goto(urlSi);
    await expect(page.getByRole("heading", { name: "Ya lo confirmaste" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sí, puedo llevarlo" })).toHaveCount(0);

    // El administrador lo ve.
    await page.goto(`/semanas/${semana}`);
    await expect(respuestas.getByRole("listitem", { name: `Ana ${MARCA}` })).toContainText("Confirmada");

    // CA-22: baja desde el enlace del correo, tras confirmar en la página.
    await page.goto(enlace(correo, "/baja/"));
    await expect(page.getByText("¿Quieres dejar de recibir correos de la cesta solidaria?")).toBeVisible();
    await page.getByRole("button", { name: "Darme de baja" }).click();
    await expect(page.getByRole("status")).toHaveText("Te hemos dado de baja, Ana");
    const { data } = await clienteServicio().from("colaboradores").select("estado").eq("id", col.Ana.id).single();
    expect(data!.estado).toBe("baja");
  });

  test("«No puedo» sin tiempo para un sustituto: se anota, se avisa al administrador y queda sin cubrir", async ({
    page,
  }) => {
    // Entrega hoy: ya ha pasado la víspera, así que nadie puede sustituir (R4.4).
    const { semana, token } = await semanaConReparto({ fecha: hoyEnMadrid(), enviada: true });
    await page.goto(`/r/${token("Bea")}?respuesta=no`);
    await expect(page.getByText("Has elegido «No puedo esta vez»")).toBeVisible();
    await page.getByRole("button", { name: "No puedo esta vez" }).click();
    await expect(page.getByRole("status")).toHaveText("Gracias por avisar, Bea");
    expect(await estadoDe(token("Bea"))).toBe("rechazada");

    const avisos = await correosPara(process.env.ADMIN_EMAIL!);
    expect(avisos.at(-1)?.Text).toContain("ya no hay tiempo para pedírselo a otro");

    await entrarComoAdmin(page);
    await page.goto(`/semanas/${semana}`);
    const bea = page.getByRole("list", { name: "Respuestas" }).getByRole("listitem", { name: `Bea ${MARCA}` });
    await expect(bea).toContainText("No puede");
    await expect(bea).toContainText("Sin cubrir: nadie lleva estos alimentos.");
  });

  test("CA-18: un enlace que no existe muestra un error", async ({ page }) => {
    await page.goto(`/r/${"0".repeat(64)}`);
    await expect(page.getByRole("heading", { name: "Este enlace no es válido" })).toBeVisible();
    await page.goto("/baja/no-es-un-token");
    await expect(page.getByRole("heading", { name: "Este enlace no es válido" })).toBeVisible();
  });
});

test.describe("enlaces del correo en el móvil", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) >= 768, "Solo en el móvil");

  test("CA-28: la respuesta y la baja no desbordan a 375 px", async ({ page }) => {
    const { token } = await semanaConReparto({ fecha: fechaFutura(), enviada: true });
    await page.goto(`/r/${token("Ana")}?respuesta=si`);
    await expect(page.getByRole("heading", { name: "Hola, Ana" })).toBeVisible();
    await sinDesbordar(page);
    await page.goto(`/baja/${token("Ana")}`);
    await expect(page.getByRole("button", { name: "Darme de baja" })).toBeVisible();
    await sinDesbordar(page);
  });
});
