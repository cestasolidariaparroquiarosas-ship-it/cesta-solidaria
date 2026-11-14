import { describe, expect, it } from "vitest";
import { esRutaPublica } from "@/lib/rutas";

describe("esRutaPublica (CA-23: solo estas rutas se abren sin sesión)", () => {
  it.each(["/login", "/r/abc123", "/baja/abc123", "/api/cron/diario"])(
    "%s es pública",
    (ruta) => {
      expect(esRutaPublica(ruta)).toBe(true);
    },
  );

  it.each(["/", "/colaboradores", "/semanas/1", "/loginx", "/rr", "/api/otra"])(
    "%s requiere sesión",
    (ruta) => {
      expect(esRutaPublica(ruta)).toBe(false);
    },
  );
});
