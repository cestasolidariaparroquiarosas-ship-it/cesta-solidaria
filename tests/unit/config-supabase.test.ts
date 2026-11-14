import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// CA-25: el registro público de usuarios está desactivado.
// Esta prueba vigila la configuración versionada; la de integración comprueba
// el comportamiento real contra Supabase. En los proyectos alojados, el ajuste
// equivalente se verifica en la puesta en marcha (docs/operacion.md).
describe("configuración de Supabase", () => {
  const config = readFileSync(path.join(__dirname, "../../supabase/config.toml"), "utf8");
  const seccionAuth = config.split(/^\[auth\]$/m)[1]?.split(/^\[/m)[0] ?? "";

  it("tiene el registro público desactivado (CA-25)", () => {
    expect(seccionAuth).toMatch(/^enable_signup = false$/m);
  });

  it("no permite accesos anónimos", () => {
    expect(seccionAuth).toMatch(/^enable_anonymous_sign_ins = false$/m);
  });
});
