import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { clienteServicio } from "../utilidades/supabase";
import { alerta, entrarComoAdmin } from "./utilidades";

// Pantallas del catálogo (plan PR 3). Escriben datos: solo contra Supabase local.
test.skip(Boolean(process.env.BASE_URL), "Solo contra Supabase local");

config({ path: ".env.local", quiet: true });
const MARCA = `e2e${Date.now()}`;

test.afterAll(async () => {
  const s = clienteServicio();
  await s.from("listas_base").delete().like("nombre", `${MARCA}%`);
  await s.from("alimentos").delete().like("nombre", `${MARCA}%`);
  await s.from("etiquetas_exclusion").delete().like("codigo", `${MARCA}%`);
});

async function sinDesbordar(page: Page) {
  const desborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(desborda).toBe(false);
}

test.describe("catálogo en escritorio", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) < 768, "Solo en escritorio");

  test("etiqueta nueva, alimento que la contiene y nombre repetido", async ({ page }) => {
    const etiqueta = `${MARCA} soja`;
    await entrarComoAdmin(page);
    await page.getByRole("link", { name: "Alimentos", exact: true }).click();
    await page.getByRole("link", { name: "Etiquetas" }).click();

    await page.getByLabel("Nueva etiqueta").fill(etiqueta);
    await page.getByRole("button", { name: "Añadir etiqueta" }).click();
    await expect(page.getByRole("status")).toHaveText("Etiqueta añadida.");
    await expect(page.getByLabel(`Etiqueta «${etiqueta}»`)).toHaveValue(etiqueta);

    await page.goto("/alimentos/nuevo");
    await page.getByLabel("Nombre").fill(`${MARCA} Tofu`);
    await page.getByLabel("Unidad").fill("bloque 400 g");
    await page.getByLabel("Precio aproximado (€)").fill("2,35");
    await page.getByLabel(etiqueta, { exact: true }).check();
    await page.getByRole("button", { name: "Dar de alta" }).click();

    await expect(page).toHaveURL(/\/alimentos\?aviso=creado$/);
    const fila = page.getByRole("link", { name: new RegExp(`${MARCA} Tofu`) });
    await expect(fila).toContainText("2,35");
    await expect(fila).toContainText(`Contiene ${etiqueta}`);

    // Mismo nombre y unidad: no se guarda y se avisa; lo escrito se conserva.
    await page.goto("/alimentos/nuevo");
    await page.getByLabel("Nombre").fill(`${MARCA} tofu`);
    await page.getByLabel("Unidad").fill("BLOQUE 400 G");
    await page.getByLabel("Precio aproximado (€)").fill("2");
    await page.getByRole("button", { name: "Dar de alta" }).click();
    await expect(alerta(page, "Ya hay un alimento con ese nombre y esa unidad.")).toBeVisible();
    await expect(page.getByLabel("Unidad")).toHaveValue("BLOQUE 400 G");

    // La etiqueta ya no se puede eliminar: la lleva un alimento.
    await page.goto("/alimentos/etiquetas");
    const filaEtiqueta = page.getByRole("listitem").filter({ hasText: `Etiqueta «${etiqueta}»` });
    await expect(filaEtiqueta.getByText("La llevan 1 alimento.")).toBeVisible();
    await expect(filaEtiqueta.getByRole("button", { name: "Eliminar" })).toBeDisabled();
  });

  test("editar y desactivar un alimento", async ({ page }) => {
    await entrarComoAdmin(page);
    await page.goto("/alimentos/nuevo");
    await page.getByLabel("Nombre").fill(`${MARCA} Harina`);
    await page.getByLabel("Unidad").fill("paquete 1 kg");
    await page.getByLabel("Precio aproximado (€)").fill("0,90");
    await page.getByRole("button", { name: "Dar de alta" }).click();
    await page.getByRole("link", { name: new RegExp(`${MARCA} Harina`) }).click();

    await page.getByLabel("Precio aproximado (€)").fill("1,05");
    await page.getByLabel(/Activo/).uncheck();
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByRole("status")).toHaveText("Cambios guardados.");
    await expect(page.getByLabel("Precio aproximado (€)")).toHaveValue("1,05");

    await page.goto("/alimentos");
    await expect(page.getByRole("link", { name: new RegExp(`${MARCA} Harina`) })).toHaveCount(0);
    await page.getByRole("link", { name: "Ver también los desactivados" }).click();
    await expect(page.getByRole("link", { name: new RegExp(`${MARCA} Harina`) })).toContainText("Desactivado");
  });

  test("lista base: crear, añadir un alimento, cambiar cantidades y quitarlo", async ({ page }) => {
    await entrarComoAdmin(page);
    await page.goto("/alimentos/nuevo");
    await page.getByLabel("Nombre").fill(`${MARCA} Arroz`);
    await page.getByLabel("Unidad").fill("paquete 1 kg");
    await page.getByLabel("Precio aproximado (€)").fill("1,20");
    await page.getByRole("button", { name: "Dar de alta" }).click();
    await expect(page).toHaveURL(/aviso=creado/);

    await page.getByRole("link", { name: "Listas base" }).click();
    await page.getByLabel("Nueva lista").fill(`${MARCA} Familia`);
    await page.getByRole("button", { name: "Crear lista" }).click();
    await expect(page.getByRole("status")).toHaveText("Lista creada. Ahora añade sus alimentos.");

    // Las dos cantidades a 0 no se aceptan.
    await page.getByLabel("Alimento", { exact: true }).selectOption({ label: `${MARCA} Arroz (paquete 1 kg)` });
    await page.getByRole("button", { name: "Añadir a la lista" }).click();
    await expect(page.getByText("Pon una cantidad por adulto, por niño o ambas.")).toBeVisible();

    await page.getByLabel("Alimento", { exact: true }).selectOption({ label: `${MARCA} Arroz (paquete 1 kg)` });
    await page.getByLabel("Por adulto al mes").fill("1,5");
    await page.getByLabel("Por niño al mes").fill("1");
    await page.getByRole("button", { name: "Añadir a la lista" }).click();
    await expect(page.getByRole("status")).toHaveText("Alimento añadido.");

    const cantidades = page.getByRole("form", { name: `Cantidades de ${MARCA} Arroz (paquete 1 kg)` });
    await expect(cantidades.getByLabel("Por adulto")).toHaveValue("1,5");
    await cantidades.getByLabel("Por niño").fill("0,5");
    await cantidades.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByRole("status")).toHaveText("Cantidades guardadas.");
    await expect(cantidades.getByLabel("Por niño")).toHaveValue("0,5");

    await page.getByRole("button", { name: `Quitar ${MARCA} Arroz (paquete 1 kg)` }).click();
    await expect(page.getByRole("status")).toHaveText("Alimento quitado de la lista.");
    await expect(page.getByText("Todavía no tiene alimentos.")).toBeVisible();
  });
});

test.describe("catálogo en el móvil", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) >= 768, "Solo en el móvil");

  test("CA-28: alimentos, etiquetas y listas no desbordan a 375 px", async ({ page }) => {
    await entrarComoAdmin(page);
    for (const ruta of ["/alimentos", "/alimentos/nuevo", "/alimentos/etiquetas", "/listas"]) {
      await page.goto(ruta);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await sinDesbordar(page);
    }
    // Ficha de un alimento y lista con una fila, que son las pantallas más anchas.
    await page.goto("/alimentos/nuevo");
    await page.getByLabel("Nombre").fill(`${MARCA} Garbanzos cocidos en bote de cristal`);
    await page.getByLabel("Unidad").fill("bote 400 g");
    await page.getByLabel("Precio aproximado (€)").fill("0,90");
    await page.getByRole("button", { name: "Dar de alta" }).click();
    await expect(page).toHaveURL(/aviso=creado/);
    await page.getByRole("link", { name: new RegExp(`${MARCA} Garbanzos`) }).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await sinDesbordar(page);

    await page.goto("/listas");
    await page.getByLabel("Nueva lista").fill(`${MARCA} Móvil con un nombre bastante largo`);
    await page.getByRole("button", { name: "Crear lista" }).click();
    await expect(page.getByRole("status")).toBeVisible();
    await page
      .getByLabel("Alimento", { exact: true })
      .selectOption({ label: `${MARCA} Garbanzos cocidos en bote de cristal (bote 400 g)` });
    await page.getByLabel("Por adulto al mes").fill("2");
    await page.getByRole("button", { name: "Añadir a la lista" }).click();
    await expect(page.getByRole("status")).toHaveText("Alimento añadido.");
    await sinDesbordar(page);
  });
});
