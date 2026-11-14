import { expect, type Page } from "@playwright/test";
import { ADMIN_PRUEBAS } from "../utilidades/supabase";

/**
 * Mensaje de error con este texto. Next.js añade un anunciador de rutas que también
 * tiene role="alert", así que getByRole("alert") a secas encuentra dos elementos.
 */
export function alerta(page: Page, texto: string) {
  return page.getByRole("alert").filter({ hasText: texto });
}

/** Entra como el administrador de pruebas (solo contra Supabase local). */
export async function entrarComoAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(ADMIN_PRUEBAS.email);
  await page.getByLabel("Contraseña").fill(ADMIN_PRUEBAS.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();
}
