import { expect, test } from "@playwright/test";
import { ADMIN_PRUEBAS, SIN_ROL_PRUEBAS } from "../utilidades/supabase";
import { alerta } from "./utilidades";

// Pruebas @humo: no necesitan datos ni credenciales, así que se pueden ejecutar
// contra pruebas y producción después de cada despliegue (deploy.yml).
test.describe("@humo acceso", () => {
  test("la página de acceso carga", async ({ page }) => {
    const respuesta = await page.goto("/login");
    expect(respuesta?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Cesta solidaria" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  });

  test("CA-26: el cron rechaza las llamadas sin CRON_SECRET", async ({ request }) => {
    const sinSecreto = await request.get("/api/cron/diario");
    expect(sinSecreto.status()).toBe(401);
    const conOtro = await request.get("/api/cron/diario", { headers: { authorization: "Bearer no-es-el-secreto" } });
    expect(conOtro.status()).toBe(401);
  });

  test("CA-23: sin sesión, la gestión redirige al acceso", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("CA-28: la página de acceso no desborda en horizontal", async ({ page }) => {
    await page.goto("/login");
    const desborda = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(desborda).toBe(false);
  });
});

// Necesita los usuarios de pruebas: solo contra Supabase local (no en entornos desplegados).
// Solo en el proyecto "escritorio" para no compartir sesión entre proyectos en paralelo.
test.describe("acceso con credenciales", () => {
  test.skip(Boolean(process.env.BASE_URL), "Solo contra Supabase local");
  test.skip(({ viewport }) => (viewport?.width ?? 1280) < 768, "Solo en escritorio");

  test("con credenciales correctas se entra y se puede salir", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(ADMIN_PRUEBAS.email);
    await page.getByLabel("Contraseña").fill(ADMIN_PRUEBAS.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();

    await page.getByRole("button", { name: "Salir" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("con contraseña incorrecta se muestra un error y no se entra", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(ADMIN_PRUEBAS.email);
    await page.getByLabel("Contraseña").fill("incorrecta-123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(alerta(page, "Correo o contraseña incorrectos.")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("CA-23/CA-25: una cuenta sin rol de administrador no entra", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(SIN_ROL_PRUEBAS.email);
    await page.getByLabel("Contraseña").fill(SIN_ROL_PRUEBAS.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(alerta(page, "Correo o contraseña incorrectos.")).toBeVisible();
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });
});
