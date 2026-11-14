import { describe, expect, it } from "vitest";
import { esAdmin } from "@/lib/rol";

describe("esAdmin (CA-23 y CA-25: solo administradores marcados entran)", () => {
  it("acepta un usuario con rol admin en app_metadata", () => {
    expect(esAdmin({ sub: "u1", app_metadata: { rol: "admin" } })).toBe(true);
  });

  it("rechaza a un usuario autenticado sin rol (p. ej. si alguien llegara a registrarse)", () => {
    expect(esAdmin({ sub: "u1", app_metadata: {} })).toBe(false);
    expect(esAdmin({ sub: "u1" })).toBe(false);
  });

  it("rechaza otros roles y valores no textuales", () => {
    expect(esAdmin({ sub: "u1", app_metadata: { rol: "colaborador" } })).toBe(false);
    expect(esAdmin({ sub: "u1", app_metadata: { rol: ["admin"] } })).toBe(false);
  });

  it("rechaza sesiones anónimas aunque digan ser admin", () => {
    expect(esAdmin({ sub: "u1", is_anonymous: true, app_metadata: { rol: "admin" } })).toBe(false);
  });

  it("rechaza la ausencia de sesión", () => {
    expect(esAdmin(null)).toBe(false);
    expect(esAdmin(undefined)).toBe(false);
    expect(esAdmin({ app_metadata: { rol: "admin" } })).toBe(false);
  });
});
