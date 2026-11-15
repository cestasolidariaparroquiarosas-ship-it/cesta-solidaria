import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { hoyEnMadrid, sumarDias } from "../../lib/fechas";
import { clienteServicio } from "../utilidades/supabase";
import { alerta, entrarComoAdmin } from "./utilidades";

// Semanas y cestas (plan PR 4, R1). Escriben datos: solo contra Supabase local.
test.skip(Boolean(process.env.BASE_URL), "Solo contra Supabase local");

config({ path: ".env.local", quiet: true });
const MARCA = `e2e${Date.now()}`;
const fechas: string[] = [];

/** Una fecha de entrega futura que no choque con otras pruebas. */
function fechaLibre() {
  const fecha = sumarDias(hoyEnMadrid(), 30 + Math.floor(Math.random() * 3000));
  fechas.push(fecha);
  return fecha;
}

test.beforeAll(async () => {
  const s = clienteServicio();
  const { data: cerdo } = await s.from("etiquetas_exclusion").select("id").eq("codigo", "cerdo").single();
  const { data: alimentos } = await s
    .from("alimentos")
    .insert([
      { nombre: `${MARCA} Arroz`, unidad: "paquete 1 kg", precio_aprox: 1.2 },
      { nombre: `${MARCA} Chorizo`, unidad: "pieza 200 g", precio_aprox: 2.5 },
    ])
    .select("id, nombre");
  const id = (nombre: string) => alimentos!.find((a) => a.nombre === `${MARCA} ${nombre}`)!.id;
  await s.from("alimento_etiquetas").insert({ alimento_id: id("Chorizo"), etiqueta_id: cerdo!.id });
  const { data: lista } = await s.from("listas_base").insert({ nombre: `${MARCA} Familia` }).select("id").single();
  await s.from("lista_base_items").insert([
    { lista_base_id: lista!.id, alimento_id: id("Arroz"), cantidad_por_adulto: 1.5, cantidad_por_nino: 1 },
    { lista_base_id: lista!.id, alimento_id: id("Chorizo"), cantidad_por_adulto: 0.5, cantidad_por_nino: 0 },
  ]);
});

test.afterAll(async () => {
  const s = clienteServicio();
  if (fechas.length) await s.from("semanas").delete().in("fecha_entrega", fechas);
  await s.from("listas_base").delete().like("nombre", `${MARCA}%`);
  await s.from("alimentos").delete().like("nombre", `${MARCA}%`);
});

async function sinDesbordar(page: Page) {
  const desborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(desborda).toBe(false);
}

async function crearSemana(page: Page) {
  const fecha = fechaLibre();
  await page.goto("/semanas");
  await page.getByRole("link", { name: "Nueva semana" }).click();
  await page.getByLabel("Fecha de entrega").fill(fecha);
  await page.getByLabel("Precio base (€)").fill("20");
  await page.getByLabel("Día del plazo").fill(sumarDias(fecha, -2));
  await page.getByLabel("Hora del plazo").fill("20:00");
  await page.getByRole("button", { name: "Crear semana" }).click();
  await expect(page.getByRole("status")).toHaveText("Semana creada. Ahora añade las cestas.");
  return fecha;
}

test.describe("semanas y cestas en escritorio", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) < 768, "Solo en escritorio");

  test("CA-05, CA-06 y CA-07: semana nueva, cesta propuesta sin cerdo y alimento que choca", async ({ page }) => {
    await entrarComoAdmin(page);
    await crearSemana(page);

    await page.getByRole("link", { name: "Añadir cesta" }).click();
    await page.getByLabel("Identificador").fill(`${MARCA} Familia 7`);
    await page.getByLabel("Adultos").fill("2");
    await page.getByLabel("Niños").fill("1");
    await page.getByLabel("Lista base").selectOption({ label: `${MARCA} Familia` });
    await page.getByLabel("Sin cerdo", { exact: true }).check();
    await page.getByRole("button", { name: "Crear cesta" }).click();
    await expect(page.getByRole("status")).toContainText("Cesta creada con la propuesta de la lista base.");

    // CA-05: 2 × 1,5 + 1 × 1 = 4 paquetes de arroz.
    const arroz = page.getByRole("form", { name: `Cantidad de ${MARCA} Arroz (paquete 1 kg)` });
    await expect(arroz.getByLabel("Cantidad")).toHaveValue("4");
    // CA-06: el chorizo no está y se avisa de que se ha quitado.
    await expect(page.getByRole("form", { name: new RegExp(`Cantidad de ${MARCA} Chorizo`) })).toHaveCount(0);
    await expect(page.getByText("No entran por las exclusiones")).toBeVisible();
    await expect(page.getByText(`${MARCA} Chorizo (pieza 200 g): contiene cerdo`)).toBeVisible();

    // CA-07: añadirlo a mano no se guarda.
    const anadir = page.getByRole("form", { name: "Añadir un alimento" });
    await anadir.getByLabel("Alimento").selectOption({ label: `${MARCA} Chorizo (pieza 200 g) · Contiene cerdo` });
    await anadir.getByLabel("Cantidad").fill("1");
    await anadir.getByRole("button", { name: "Añadir a la cesta" }).click();
    await expect(alerta(page, "No se puede añadir: choca con las exclusiones de esta cesta (sin cerdo).")).toBeVisible();
    await expect(page.getByRole("form", { name: new RegExp(`Cantidad de ${MARCA} Chorizo`) })).toHaveCount(0);

    // R1.3: cambiar una cantidad.
    await arroz.getByLabel("Cantidad").fill("5");
    await arroz.getByRole("button", { name: /Guardar cantidad/ }).click();
    await expect(page.getByRole("status")).toHaveText("Cantidad guardada.");
    await expect(page.locator("p").filter({ hasText: "Coste de la cesta:" })).toContainText("6,00");

    // La semana muestra la cesta con su coste.
    await page.getByRole("link", { name: /Entrega del/ }).click();
    const fila = page.getByRole("link", { name: new RegExp(`${MARCA} Familia 7`) });
    await expect(fila).toContainText("5 unidades");
    await expect(fila).toContainText("Sin cerdo");
  });

  test("datos de la semana: el plazo tiene que ser antes de la entrega; quitar y eliminar", async ({ page }) => {
    await entrarComoAdmin(page);
    const fecha = await crearSemana(page);

    await page.getByLabel("Día del plazo").fill(fecha);
    await page.getByRole("button", { name: "Guardar datos" }).click();
    await expect(page.getByText("El plazo tiene que terminar antes del día de la entrega.")).toBeVisible();
    await expect(page.getByLabel("Día del plazo")).toHaveValue(fecha);

    await page.getByLabel("Día del plazo").fill(sumarDias(fecha, -1));
    await page.getByLabel("Precio base (€)").fill("17,50");
    await page.getByRole("button", { name: "Guardar datos" }).click();
    await expect(page.getByRole("status")).toHaveText("Datos de la semana guardados.");
    await expect(page.getByLabel("Precio base (€)")).toHaveValue("17,5");

    // Cesta sin lista: empieza vacía; se añade y se quita un alimento.
    await page.getByRole("link", { name: "Añadir cesta" }).click();
    await page.getByLabel("Identificador").fill(`${MARCA} Vacía`);
    await page.getByLabel("Adultos").fill("1");
    await page.getByLabel("Lista base").selectOption({ label: "Sin lista (la cesta empieza vacía)" });
    await page.getByRole("button", { name: "Crear cesta" }).click();
    await expect(page.getByText("La cesta no tiene alimentos.")).toBeVisible();
    const anadir = page.getByRole("form", { name: "Añadir un alimento" });
    await anadir.getByLabel("Alimento").selectOption({ label: `${MARCA} Arroz (paquete 1 kg)` });
    await anadir.getByLabel("Cantidad").fill("2");
    await anadir.getByRole("button", { name: "Añadir a la cesta" }).click();
    await expect(page.getByRole("status")).toHaveText("Alimento añadido.");
    await page.getByRole("button", { name: `Quitar ${MARCA} Arroz (paquete 1 kg)` }).click();
    await expect(page.getByRole("status")).toHaveText("Alimento quitado de la cesta.");

    await page.getByRole("link", { name: /Entrega del/ }).click();
    await page.getByLabel("Quiero eliminar esta semana y sus cestas.").check();
    await page.getByRole("button", { name: "Eliminar semana" }).click();
    await expect(page.getByRole("status")).toHaveText("Semana eliminada con sus cestas.");
  });
});

test.describe("semanas en el móvil", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) >= 768, "Solo en el móvil");

  test("CA-28: semanas, semana y cesta no desbordan a 375 px", async ({ page }) => {
    await entrarComoAdmin(page);
    for (const ruta of ["/semanas", "/semanas/nueva"]) {
      await page.goto(ruta);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await sinDesbordar(page);
    }
    await crearSemana(page);
    await sinDesbordar(page);
    await page.getByRole("link", { name: "Añadir cesta" }).click();
    await page.getByLabel("Identificador").fill(`${MARCA} Familia con nombre largo`);
    await page.getByLabel("Adultos").fill("3");
    await page.getByLabel("Lista base").selectOption({ label: `${MARCA} Familia` });
    await page.getByRole("button", { name: "Crear cesta" }).click();
    await expect(page.getByRole("status")).toBeVisible();
    await sinDesbordar(page);
  });
});
