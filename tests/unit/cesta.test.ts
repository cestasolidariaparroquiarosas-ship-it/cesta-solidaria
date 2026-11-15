import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  cantidadPropuesta,
  choquesEnCesta,
  costeCesta,
  etiquetasEnConflicto,
  leerEntero,
  proponerCesta,
  textoSin,
  validarCantidadItem,
  validarCesta,
  type ItemPlantilla,
} from "@/lib/dominio/cesta";

const CERDO = "00000000-0000-4000-8000-000000000001";
const GLUTEN = "00000000-0000-4000-8000-000000000002";
const LISTA = "00000000-0000-4000-8000-0000000000aa";

function item(
  id: string,
  porAdulto: number,
  porNino: number,
  { etiquetas = [] as string[], activo = true } = {},
): ItemPlantilla {
  return {
    alimento: { id, nombre: id, unidad: "paquete", activo, etiquetas },
    cantidad_por_adulto: porAdulto,
    cantidad_por_nino: porNino,
  };
}

describe("R1.1: cantidad propuesta", () => {
  it("CA-05: arroz a 1,5 por adulto y 1 por niño, para 2 adultos y 1 niño, son 4 paquetes", () => {
    expect(cantidadPropuesta(2, 1, 1.5, 1)).toBe(4);
    const propuesta = proponerCesta({ adultos: 2, ninos: 1, exclusiones: [] }, [item("arroz", 1.5, 1)]);
    expect(propuesta.items).toEqual([{ alimento_id: "arroz", cantidad: 4 }]);
  });

  it("redondea hacia arriba", () => {
    expect(cantidadPropuesta(3, 0, 0.5, 0)).toBe(2);
    expect(cantidadPropuesta(1, 1, 0.3, 0.3)).toBe(1);
  });

  it("no se pasa de una unidad por errores de coma flotante", () => {
    // 0,1 × 3 = 0,30000000000000004 en coma flotante; 0,3 son 30 centésimas exactas.
    expect(cantidadPropuesta(3, 0, 0.1, 0)).toBe(1);
    expect(cantidadPropuesta(10, 0, 0.1, 0)).toBe(1);
    expect(cantidadPropuesta(3, 3, 1.15, 0.85)).toBe(6);
  });

  it("si el resultado es 0, el alimento no se incluye", () => {
    const propuesta = proponerCesta({ adultos: 0, ninos: 2, exclusiones: [] }, [item("aceite", 0.5, 0)]);
    expect(propuesta).toEqual({ items: [], quitados: [], desactivados: [] });
  });

  it("propiedad: la cantidad nunca se queda corta ni se pasa de una unidad", () => {
    const decimal = fc.integer({ min: 0, max: 10_000 }).map((c) => c / 100);
    fc.assert(
      fc.property(fc.nat(20), fc.nat(20), decimal, decimal, (adultos, ninos, pa, pn) => {
        const exacta = (adultos * Math.round(pa * 100) + ninos * Math.round(pn * 100)) / 100;
        const cantidad = cantidadPropuesta(adultos, ninos, pa, pn);
        expect(Number.isInteger(cantidad)).toBe(true);
        expect(cantidad).toBeGreaterThanOrEqual(exacta);
        expect(cantidad - exacta).toBeLessThan(1);
      }),
    );
  });
});

describe("R1.2: exclusiones", () => {
  it("CA-06: una cesta sin cerdo no lleva nada que contenga cerdo, y se dice qué se ha quitado", () => {
    const propuesta = proponerCesta({ adultos: 2, ninos: 0, exclusiones: [CERDO] }, [
      item("arroz", 1, 1),
      item("chorizo", 0.5, 0, { etiquetas: [CERDO] }),
      item("salchichón", 0.5, 0, { etiquetas: [CERDO, GLUTEN] }),
    ]);
    expect(propuesta.items).toEqual([{ alimento_id: "arroz", cantidad: 2 }]);
    expect(propuesta.quitados).toEqual([
      { alimento_id: "chorizo", nombre: "chorizo", unidad: "paquete", etiquetas: [CERDO] },
      { alimento_id: "salchichón", nombre: "salchichón", unidad: "paquete", etiquetas: [CERDO] },
    ]);
  });

  it("propiedad: ningún alimento propuesto choca con las exclusiones (CA-06)", () => {
    const etiqueta = fc.constantFrom(CERDO, GLUTEN, "e3", "e4");
    const plantilla = fc.array(
      fc.record({
        etiquetas: fc.uniqueArray(etiqueta, { maxLength: 3 }),
        activo: fc.boolean(),
        pa: fc.integer({ min: 0, max: 400 }),
        pn: fc.integer({ min: 0, max: 400 }),
      }),
      { maxLength: 15 },
    );
    fc.assert(
      fc.property(plantilla, fc.uniqueArray(etiqueta, { maxLength: 3 }), fc.nat(6), fc.nat(6), (p, excl, ad, ni) => {
        const items = p.map((x, i) => item(`a${i}`, x.pa / 100, x.pn / 100, x));
        const propuesta = proponerCesta({ adultos: ad, ninos: ni, exclusiones: excl }, items);
        for (const { alimento_id } of propuesta.items) {
          const original = items.find((i) => i.alimento.id === alimento_id)!;
          expect(etiquetasEnConflicto(original.alimento.etiquetas, excl)).toEqual([]);
          expect(original.alimento.activo).toBe(true);
        }
        // Cada alimento con cantidad > 0 acaba en un solo sitio.
        const conCantidad = items.filter(
          (i) => cantidadPropuesta(ad, ni, i.cantidad_por_adulto, i.cantidad_por_nino) > 0,
        ).length;
        expect(propuesta.items.length + propuesta.quitados.length + propuesta.desactivados.length).toBe(conCantidad);
      }),
    );
  });

  it("los alimentos desactivados no se proponen y se avisa", () => {
    const propuesta = proponerCesta({ adultos: 1, ninos: 0, exclusiones: [] }, [item("galletas", 1, 1, { activo: false })]);
    expect(propuesta.items).toEqual([]);
    expect(propuesta.desactivados).toEqual([{ alimento_id: "galletas", nombre: "galletas", unidad: "paquete" }]);
  });

  it("CA-06 (choque posterior): detecta los alimentos que chocan si el catálogo cambió después", () => {
    const items = [
      { alimento_id: "arroz", etiquetas: [] },
      { alimento_id: "fabada", etiquetas: [CERDO] },
    ];
    expect(choquesEnCesta(items, [CERDO, GLUTEN])).toEqual([{ alimento_id: "fabada", etiquetas: [CERDO], conflicto: [CERDO] }]);
    expect(choquesEnCesta(items, [])).toEqual([]);
  });
});

describe("validarCesta", () => {
  const valida = { identificador_receptor: "  Familia   12 ", adultos: "2", ninos: "", lista_base_id: LISTA, exclusiones: [CERDO, CERDO, "x"] };

  it("normaliza el identificador, toma 0 si un número está vacío y quita exclusiones repetidas o raras", () => {
    expect(validarCesta(valida)).toEqual({
      ok: true,
      datos: { identificador_receptor: "Familia 12", adultos: 2, ninos: 0, lista_base_id: LISTA, exclusiones: [CERDO] },
    });
  });

  it("sin lista base, la cesta empieza vacía", () => {
    const r = validarCesta({ ...valida, lista_base_id: "" });
    expect(r.ok && r.datos.lista_base_id).toBeNull();
  });

  it("exige identificador y al menos una persona", () => {
    expect(validarCesta({ identificador_receptor: " ", adultos: "0", ninos: "0" })).toEqual({
      ok: false,
      errores: {
        identificador_receptor: "Escribe un identificador, por ejemplo «Familia 12».",
        adultos: "La familia tiene que tener al menos una persona.",
      },
    });
  });

  it.each(["-1", "1,5", "21", "dos"])("rechaza «%s» adultos", (adultos) => {
    const r = validarCesta({ ...valida, adultos });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errores.adultos).toBe("Escribe un número entero entre 0 y 20.");
  });

  it("limita el largo del identificador", () => {
    const r = validarCesta({ ...valida, identificador_receptor: "x".repeat(41) });
    expect(!r.ok && r.errores.identificador_receptor).toBe("Como mucho 40 caracteres.");
  });
});

describe("cantidades a mano y otros", () => {
  it.each([
    ["3", 3],
    [" 12 ", 12],
  ])("acepta «%s»", (v, n) => {
    expect(validarCantidadItem(v)).toEqual({ ok: true, cantidad: n });
  });

  it.each(["0", "1,5", "", "1000", "-2"])("rechaza «%s»", (v) => {
    expect(validarCantidadItem(v).ok).toBe(false);
  });

  it("leerEntero respeta los límites", () => {
    expect(leerEntero("5", 1, 5)).toBe(5);
    expect(leerEntero("6", 1, 5)).toBeNull();
    expect(leerEntero(null, 0, 5)).toBeNull();
  });

  it("el coste suma en céntimos", () => {
    expect(costeCesta([{ cantidad: 3, precio_unitario: 0.1 }, { cantidad: 4, precio_unitario: 1.2 }])).toBe(5.1);
    expect(costeCesta([])).toBe(0);
  });

  it("textoSin", () => {
    expect(textoSin([])).toBe("");
    expect(textoSin(["gluten", "cerdo"])).toBe("Sin cerdo y gluten");
    expect(textoSin(["huevo", "cerdo", "lactosa"])).toBe("Sin cerdo, huevo y lactosa");
  });
});
