import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { clienteServicio } from "../utilidades/supabase";
import { alerta, entrarComoAdmin as entrar } from "./utilidades";

// Pantallas de colaboradores (plan PR 2). Necesitan el administrador de pruebas y
// escriben datos: solo contra Supabase local, nunca contra entornos desplegados.
test.skip(Boolean(process.env.BASE_URL), "Solo contra Supabase local");

config({ path: ".env.local", quiet: true });
const MARCA = `e2e-colab-${Date.now()}`;
const correo = (sufijo: string) => `${MARCA}-${sufijo}@ejemplo.test`;

test.afterAll(async () => {
  await clienteServicio().from("colaboradores").delete().like("email", `${MARCA}%`);
});

async function darDeAlta(page: Page, nombre: string, email: string) {
  await page.goto("/colaboradores/nuevo");
  await page.getByLabel("Nombre", { exact: true }).fill(nombre);
  await page.getByLabel("Correo electrónico", { exact: true }).fill(email);
  await page.getByLabel(/consentimiento/).check();
  await page.getByRole("button", { name: "Dar de alta" }).click();
}

async function sinDesbordar(page: Page) {
  const desborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(desborda).toBe(false);
}

test.describe("colaboradores en escritorio", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) < 768, "Solo en escritorio");

  test("alta: sin consentimiento no se guarda; con él aparece en la lista", async ({ page }) => {
    await entrar(page);
    await page.getByRole("link", { name: "Colaboradores" }).click();
    await page.getByRole("link", { name: "Nuevo colaborador" }).click();

    await page.getByLabel("Nombre", { exact: true }).fill("Ana Prueba");
    await page.getByLabel("Correo electrónico", { exact: true }).fill(correo("ana"));
    await page.getByRole("button", { name: "Dar de alta" }).click();
    await expect(page.getByText("Hace falta su consentimiento")).toBeVisible();

    await page.getByLabel(/consentimiento/).check();
    await page.getByRole("button", { name: "Dar de alta" }).click();
    await expect(page).toHaveURL(/\/colaboradores\?aviso=creado$/);
    await expect(page.getByRole("status")).toHaveText("Colaborador dado de alta.");
    await expect(page.getByRole("link", { name: /Ana Prueba/ })).toBeVisible();
  });

  test("CA-01: con un correo que ya existe no se guarda y se muestra un aviso", async ({ page }) => {
    await entrar(page);
    await darDeAlta(page, "Bea Prueba", correo("bea"));
    await expect(page).toHaveURL(/aviso=creado/);

    await darDeAlta(page, "Otra Bea", correo("bea").toUpperCase());
    await expect(alerta(page, "Ya hay un colaborador con ese correo. No se ha guardado.")).toBeVisible();
    await expect(page).toHaveURL(/\/colaboradores\/nuevo$/);

    await page.goto("/colaboradores");
    await expect(page.getByRole("link", { name: /Otra Bea/ })).toHaveCount(0);
  });

  test("pausa, reactivación, baja y eliminación definitiva (CA-04)", async ({ page }) => {
    await entrar(page);
    await darDeAlta(page, "Carlos Prueba", correo("carlos"));
    await page.getByRole("link", { name: /Carlos Prueba/ }).click();
    await expect(page.getByRole("heading", { name: "Carlos Prueba" })).toBeVisible();

    await page.getByLabel("En pausa hasta (incluido)").fill("2100-01-31");
    await page.getByRole("button", { name: "Poner en pausa" }).click();
    await expect(page.getByRole("status")).toHaveText("Colaborador en pausa.");
    await expect(page.getByText("En pausa hasta el 31/01/2100")).toBeVisible();

    await page.goto("/colaboradores?estado=pausado");
    await expect(page.getByRole("link", { name: /Carlos Prueba/ })).toBeVisible();
    await page.getByRole("link", { name: /Carlos Prueba/ }).click();

    await page.getByRole("button", { name: "Reactivar ya" }).click();
    await expect(page.getByRole("status")).toHaveText("Colaborador activo.");
    await expect(page.getByRole("button", { name: "Poner en pausa" })).toBeVisible();

    await page.getByLabel("Notas (opcional)").fill("Mejor los sábados");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByRole("status")).toHaveText("Datos guardados.");
    await expect(page.getByLabel("Notas (opcional)")).toHaveValue("Mejor los sábados");

    await page.getByRole("button", { name: "Dar de baja" }).click();
    await expect(page.getByRole("status")).toContainText("Colaborador dado de baja.");
    await expect(page.getByText("De baja", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Eliminar definitivamente" }).click();
    await expect(alerta(page, "Marca la casilla")).toBeVisible();

    await page.getByLabel(/no se puede deshacer/).check();
    await page.getByRole("button", { name: "Eliminar definitivamente" }).click();
    await expect(page).toHaveURL(/\/colaboradores\?aviso=eliminado$/);
    await expect(page.getByRole("link", { name: /Carlos Prueba/ })).toHaveCount(0);

    const { count } = await clienteServicio()
      .from("colaboradores")
      .select("*", { count: "exact", head: true })
      .eq("email", correo("carlos"));
    expect(count).toBe(0);
  });

  test("un colaborador que no existe da 404", async ({ page }) => {
    await entrar(page);
    const respuesta = await page.goto("/colaboradores/00000000-0000-4000-8000-000000000000");
    expect(respuesta?.status()).toBe(404);
  });
});

test.describe("colaboradores en el móvil", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) >= 768, "Solo en el móvil");

  test("CA-28: la lista, el alta y la ficha no desbordan a 375 px", async ({ page }) => {
    await entrar(page);
    await darDeAlta(page, "Dolores Nombre Bastante Largo Para Probar El Ancho", correo("dolores-con-correo-largo"));
    await expect(page).toHaveURL(/aviso=creado/);
    await sinDesbordar(page);

    await page.goto("/colaboradores/nuevo");
    await sinDesbordar(page);

    await page.goto("/colaboradores");
    await page.getByRole("link", { name: /Dolores/ }).click();
    await expect(page.getByRole("heading", { name: /Dolores/ })).toBeVisible();
    await sinDesbordar(page);
  });
});
