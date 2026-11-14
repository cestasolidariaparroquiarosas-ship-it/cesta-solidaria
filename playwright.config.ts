import { defineConfig, devices } from "@playwright/test";

// BASE_URL apunta al entorno que se prueba:
// - CI de PR: la app arrancada en local contra Supabase local.
// - deploy.yml: la versión desplegada en pruebas o en producción (solo @humo).
const baseURL = process.env.BASE_URL ?? "http://localhost:3000";
const remoto = Boolean(process.env.BASE_URL);

// Si Vercel protege las vistas previas, este secreto permite que las pruebas pasen.
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/preparacion-global.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  // Sin reintentos: una prueba que falla una vez es un fallo (CA-30).
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
    trace: "retain-on-failure",
    extraHTTPHeaders: bypass ? { "x-vercel-protection-bypass": bypass } : undefined,
  },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"] } },
    // CA-28: las pantallas se usan en un móvil de 375 px.
    { name: "movil", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 740 } } },
  ],
  webServer: remoto
    ? undefined
    : {
        command: "npm run start",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
