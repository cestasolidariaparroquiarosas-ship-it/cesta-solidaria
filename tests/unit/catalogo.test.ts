import { describe, expect, it } from "vitest";
import {
  codigoDe,
  formatearCantidad,
  formatearEuros,
  leerDecimal,
  textoContiene,
  validarAlimento,
  validarCantidades,
  validarEtiqueta,
  validarLista,
} from "@/lib/dominio/catalogo";

describe("leerDecimal", () => {
  it.each([
    ["1,25", 1.25],
    ["1.25", 1.25],
    [" 3 ", 3],
    ["0", 0],
    ["0,5", 0.5],
  ])("lee «%s» como %s", (entrada, esperado) => {
    expect(leerDecimal(entrada)).toBe(esperado);
  });

  it.each(["", "-1", "1,255", "1.2.3", "abc", "1e3", "1 000"])("rechaza «%s»", (entrada) => {
    expect(leerDecimal(entrada)).toBeNull();
  });

  it("no acepta valores que no sean texto o número", () => {
    expect(leerDecimal(null)).toBeNull();
    expect(leerDecimal(["1"])).toBeNull();
  });
});

describe("etiquetas", () => {
  it("el código no lleva tildes, mayúsculas ni espacios", () => {
    expect(codigoDe("Frutos secos")).toBe("frutos_secos");
    expect(codigoDe("Piñones y Sésamo")).toBe("pinones_y_sesamo");
  });

  it("valida el nombre y lo guarda en minúsculas", () => {
    expect(validarEtiqueta({ nombre: "  Soja " })).toEqual({ ok: true, datos: { nombre: "soja", codigo: "soja" } });
    expect(validarEtiqueta({ nombre: "" }).ok).toBe(false);
    expect(validarEtiqueta({ nombre: "¡¡!!" }).ok).toBe(false);
    expect(validarEtiqueta({ nombre: "a".repeat(41) }).ok).toBe(false);
  });
});

describe("validarAlimento", () => {
  it("acepta un alimento con precio con coma y quita etiquetas repetidas", () => {
    const r = validarAlimento({
      nombre: " Arroz ",
      unidad: "paquete 1 kg",
      precio_aprox: "1,20",
      etiquetas: ["e1", "e1", "", "e2"],
    });
    expect(r).toEqual({
      ok: true,
      datos: { nombre: "Arroz", unidad: "paquete 1 kg", precio_aprox: 1.2, activo: true, etiquetas: ["e1", "e2"] },
    });
  });

  it("puede guardarse desactivado", () => {
    const r = validarAlimento({ nombre: "Pan", unidad: "barra", precio_aprox: "1", activo: false });
    expect(r.ok && r.datos.activo).toBe(false);
  });

  it("exige nombre, unidad y un precio válido", () => {
    const r = validarAlimento({ nombre: "", unidad: "", precio_aprox: "gratis" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errores).sort()).toEqual(["nombre", "precio_aprox", "unidad"]);
  });

  it("rechaza precios negativos o desorbitados", () => {
    expect(validarAlimento({ nombre: "A", unidad: "u", precio_aprox: "-1" }).ok).toBe(false);
    expect(validarAlimento({ nombre: "A", unidad: "u", precio_aprox: "5000" }).ok).toBe(false);
  });
});

describe("validarLista", () => {
  it("exige un nombre", () => {
    expect(validarLista({ nombre: "Familia estándar" })).toEqual({ ok: true, datos: { nombre: "Familia estándar" } });
    expect(validarLista({ nombre: "  " }).ok).toBe(false);
  });
});

describe("validarCantidades (R1.1)", () => {
  it("acepta decimales y un campo vacío cuenta como 0", () => {
    expect(validarCantidades({ cantidad_por_adulto: "1,5", cantidad_por_nino: "" })).toEqual({
      ok: true,
      datos: { cantidad_por_adulto: 1.5, cantidad_por_nino: 0 },
    });
  });

  it("no deja las dos cantidades a 0: el alimento nunca entraría en una cesta", () => {
    const r = validarCantidades({ cantidad_por_adulto: "0", cantidad_por_nino: "0" });
    expect(r.ok).toBe(false);
  });

  it("rechaza negativos, textos y cantidades enormes", () => {
    expect(validarCantidades({ cantidad_por_adulto: "-1", cantidad_por_nino: "1" }).ok).toBe(false);
    expect(validarCantidades({ cantidad_por_adulto: "mucho", cantidad_por_nino: "1" }).ok).toBe(false);
    expect(validarCantidades({ cantidad_por_adulto: "101", cantidad_por_nino: "1" }).ok).toBe(false);
  });
});

describe("formatos", () => {
  it("euros y cantidades en formato español", () => {
    expect(formatearEuros(1.2).replace(/\s/g, " ")).toBe("1,20 €");
    expect(formatearCantidad(1.5)).toBe("1,5");
    expect(formatearCantidad(2)).toBe("2");
    expect(formatearCantidad(1000)).toBe("1000");
  });

  it("«Contiene» en orden y con «y» al final", () => {
    expect(textoContiene([])).toBe("");
    expect(textoContiene(["gluten"])).toBe("Contiene gluten");
    expect(textoContiene(["lactosa", "gluten", "huevo"])).toBe("Contiene gluten, huevo y lactosa");
  });
});
