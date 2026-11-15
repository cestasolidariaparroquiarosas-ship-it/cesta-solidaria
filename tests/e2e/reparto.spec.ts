import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { hoyEnMadrid, sumarDias } from "../../lib/fechas";
import { clienteServicio } from "../utilidades/supabase";
import { entrarComoAdmin } from "./utilidades";

// Selección y reparto (plan PR 5, R2 y R3). Escriben datos: solo contra Supabase local.
test.skip(Boolean(process.env.BASE_URL), "Solo contra Supabase local");

config({ path: ".env.local", quiet: true });
const MARCA = `e2e-reparto-${Date.now()}`;
const semanas: string[] = [];
const alimentos: Record<string, string> = {};

function comprobar<T>({ data, error }: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (error || data === null || data === undefined) throw new Error(`No se han podido preparar los datos: ${error?.message}`);
  return data;
}

test.beforeAll(async ({}, info) => {
  const s = clienteServicio();
  const filas = comprobar(
    await s
      .from("alimentos")
      .insert([
        { nombre: `${MARCA} Arroz`, unidad: "paquete 1 kg", precio_aprox: 1.2 },
        { nombre: `${MARCA} Aceite`, unidad: "botella 1 l", precio_aprox: 7.5 },
      ])
      .select("id, nombre"),
  );
  for (const f of filas) alimentos[f.nombre.slice(MARCA.length + 1)] = f.id;
  // Dados de alta hace mucho y sin participaciones: van los primeros en R2.4, por
  // delante de los que creen otras pruebas a la vez. Los del escritorio, antes que los
  // del móvil: la prueba del escritorio comprueba quién sale elegido y la del móvil no.
  const anio = info.project.name === "escritorio" ? 1990 : 1995;
  comprobar(
    await s
      .from("colaboradores")
      .insert(
        ["Ana", "Bea", "Carmen"].map((nombre, i) => ({
          nombre: `${MARCA} ${nombre}`,
          email: `${MARCA}-${nombre}@cesta.test`.toLowerCase(),
          creado_en: `${anio}-01-0${i + 1}T00:00:00Z`,
        })),
      )
      .select(),
  );
});

test.afterAll(async () => {
  const s = clienteServicio();
  if (semanas.length) await s.from("semanas").delete().in("id", semanas);
  await s.from("colaboradores").delete().like("email", `${MARCA}%`);
  await s.from("alimentos").delete().like("nombre", `${MARCA}%`);
});

/**
 * Semana con una cesta de 3 aceites (7,50 €) y 4 arroces (1,20 €): 27,30 €, así que
 * con 20 € de precio base hacen falta 2 colaboradores. El reparto de R3 queda así:
 * Ana, 2 aceites (15 €); Bea, 1 aceite y 4 arroces (12,30 €).
 */
async function semanaConCesta() {
  const s = clienteServicio();
  const fecha = sumarDias(hoyEnMadrid(), 30 + Math.floor(Math.random() * 3000));
  const semana = comprobar(
    await s
      .from("semanas")
      .insert({ fecha_entrega: fecha, precio_base: 20, plazo_confirmacion: new Date(Date.now() + 86_400_000).toISOString() })
      .select("id")
      .single(),
  );
  semanas.push(semana.id);
  const cesta = comprobar(
    await s
      .from("cestas")
      .insert({ semana_id: semana.id, identificador_receptor: `${MARCA} Familia`, adultos: 2, ninos: 0 })
      .select("id")
      .single(),
  );
  comprobar(
    await s
      .from("cesta_items")
      .insert([
        { cesta_id: cesta.id, alimento_id: alimentos.Aceite, cantidad: 3 },
        { cesta_id: cesta.id, alimento_id: alimentos.Arroz, cantidad: 4 },
      ])
      .select(),
  );
  return { semana: semana.id, cesta: cesta.id };
}

const tarjetas = (page: Page) => page.getByRole("list", { name: "Colaboradores del reparto" }).locator(":scope > li");
const tarjeta = (page: Page, nombre: string) => page.getByRole("listitem", { name: `${MARCA} ${nombre}`, exact: true });

async function proponer(page: Page, semana: string) {
  await page.goto(`/semanas/${semana}`);
  await page.getByRole("link", { name: "Preparar el reparto" }).click();
  await expect(page.getByRole("heading", { name: "Reparto", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Proponer reparto" }).click();
  await expect(page.getByRole("status")).toHaveText("Reparto propuesto. Revísalo y cambia lo que haga falta.");
}

/** Abre el desplegable que contiene el formulario y lo devuelve. */
async function abrir(page: Page, formulario: string) {
  // Cerrado, el formulario está oculto y getByRole no lo ve sin includeHidden.
  const oculto = page.getByRole("form", { name: formulario, includeHidden: true });
  await page.locator("details", { has: oculto }).locator("summary").click();
  const form = page.getByRole("form", { name: formulario });
  await expect(form).toBeVisible();
  return form;
}

test.describe("reparto en escritorio", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) < 768, "Solo en escritorio");

  test("CA-09 a CA-12: proponer, mover alimentos, cambiar colaborador y descartar al cambiar una cesta", async ({
    page,
  }) => {
    const { semana, cesta } = await semanaConCesta();
    await entrarComoAdmin(page);
    await proponer(page, semana);

    // CA-09 y CA-10: 27,30 € / 20 € → 2 colaboradores, los que llevan más tiempo sin participar.
    await expect(page.getByRole("definition").filter({ hasText: "2 colaboradores" })).toBeVisible();
    await expect(tarjetas(page)).toHaveCount(2);
    // R3 y CA-11: 15 € y 12,30 €; la diferencia no supera la pieza más cara (7,50 €).
    await expect(tarjeta(page, "Ana")).toContainText("2 × " + `${MARCA} Aceite (botella 1 l)`);
    await expect(tarjeta(page, "Ana")).toContainText("15,00");
    await expect(tarjeta(page, "Bea")).toContainText(`4 × ${MARCA} Arroz (paquete 1 kg)`);
    await expect(tarjeta(page, "Bea")).toContainText("12,30");

    // R3.5: mover los 4 arroces de Bea a Ana (19,80 €).
    const mover = await abrir(page, `Mover ${MARCA} Arroz (paquete 1 kg)`);
    await mover.getByLabel("Unidades").fill("4");
    await mover.getByLabel("A quién").selectOption({ label: `${MARCA} Ana` });
    await mover.getByRole("button", { name: "Mover" }).click();
    await expect(page.getByRole("status")).toHaveText("Alimentos movidos.");
    await expect(tarjeta(page, "Ana")).toContainText(`4 × ${MARCA} Arroz (paquete 1 kg)`);
    await expect(tarjeta(page, "Ana")).toContainText("19,80");
    await expect(tarjeta(page, "Ana")).not.toContainText("supera el precio base");

    // Bea pasa su aceite: se queda sin nada y sale del reparto. CA-12: todo sigue asignado.
    const aceite = await abrir(page, `Mover ${MARCA} Aceite (botella 1 l)`);
    await aceite.getByLabel("A quién").selectOption({ label: `${MARCA} Ana` });
    await aceite.getByRole("button", { name: "Mover" }).click();
    await expect(page.getByRole("status")).toHaveText("Alimentos movidos. Quien se ha quedado sin nada sale del reparto.");
    await expect(tarjetas(page)).toHaveCount(1);
    await expect(tarjeta(page, "Ana")).toContainText(`3 × ${MARCA} Aceite (botella 1 l)`);
    await expect(tarjeta(page, "Ana")).toContainText("27,30");
    // R3.5: pasa de 20 €; se avisa, pero se permite.
    await expect(tarjeta(page, "Ana")).toContainText("supera el precio base (20,00");

    // Cambiar a Ana por Carmen.
    const cambiar = await abrir(page, `Cambiar a ${MARCA} Ana`);
    await cambiar.getByLabel("Nuevo colaborador").selectOption({ label: `${MARCA} Carmen · nunca ha participado` });
    await cambiar.getByRole("button", { name: "Cambiar" }).click();
    await expect(page.getByRole("status")).toHaveText("Colaborador cambiado.");
    await expect(tarjeta(page, "Carmen")).toContainText("27,30");

    // Volver a proponer pide confirmación y deshace los cambios a mano.
    await page.getByRole("button", { name: "Volver a proponer el reparto" }).click();
    await expect(page.getByText("Marca la casilla para confirmar")).toBeVisible();
    await page.getByLabel("Quiero sustituir el reparto actual y perder los cambios hechos a mano.").check();
    await page.getByRole("button", { name: "Volver a proponer el reparto" }).click();
    await expect(page.getByRole("status")).toHaveText("Reparto propuesto. Revísalo y cambia lo que haga falta.");
    await expect(tarjetas(page)).toHaveCount(2);

    // Cambiar una cesta descarta el reparto, y la cesta lo avisa antes.
    await page.goto(`/semanas/${semana}/cestas/${cesta}`);
    await expect(page.getByText("Esta semana ya tiene un reparto propuesto.")).toBeVisible();
    const arroz = page.getByRole("form", { name: `Cantidad de ${MARCA} Arroz (paquete 1 kg)` });
    await arroz.getByLabel("Cantidad", { exact: true }).fill("5");
    await arroz.getByRole("button", { name: /Guardar cantidad/ }).click();
    await expect(page.getByRole("status")).toHaveText("Cantidad guardada.");
    await expect(page.getByText("Esta semana ya tiene un reparto propuesto.")).toHaveCount(0);
    await page.goto(`/semanas/${semana}`);
    await expect(page.getByText("Todavía no hay reparto.")).toBeVisible();
  });
});

test.describe("reparto en el móvil", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) >= 768, "Solo en el móvil");

  test("CA-28: el reparto no desborda a 375 px", async ({ page }) => {
    const { semana } = await semanaConCesta();
    await entrarComoAdmin(page);
    await proponer(page, semana);
    // Quién sale elegido depende de las demás pruebas: se abren los primeros desplegables.
    await page.getByText("Mover a otro colaborador").first().click();
    await page.getByText("Cambiar por otro colaborador").first().click();
    await expect(page.getByLabel("Nuevo colaborador").first()).toBeVisible();
    const desborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(desborda).toBe(false);
  });
});
