import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ajustar, cantidadesDeLaApp, COMPOSICIONES } from "@/scripts/datos-de-prueba/ajuste";
import {
  aliasDeCorreo,
  CAMBIOS_DE_ESTADO,
  esAliasDePrueba,
  FAMILIAS,
  NOMBRES,
  PRODUCTOS,
  SEMANAS,
} from "@/scripts/datos-de-prueba/datos";
import { cantidadPropuesta } from "@/lib/dominio/cesta";

describe("ajuste de la cesta tipo (spec 0002 §2)", () => {
  it("una cantidad fija en todos los tramos se reproduce sin error", () => {
    const a = ajustar([1, 1, 1, 1, 1]);
    expect(a.error).toBe(0);
    expect(cantidadesDeLaApp(a).flat().every((n) => n === 1)).toBe(true);
  });

  it("un producto que no lleva nada en el primer tramo no se propone a 1 o 2 adultos", () => {
    const a = ajustar([0, 1, 1, 1, 1]);
    expect(cantidadPropuesta(1, 0, a.porAdulto, a.porNino)).toBe(0);
    expect(cantidadPropuesta(2, 0, a.porAdulto, a.porNino)).toBe(0);
  });

  it("elige la pareja de menor error entre todas las posibles (búsqueda completa)", () => {
    const tramos = [2, 2, 3, 4, 4] as const;
    const a = ajustar(tramos);
    for (let pa = 0; pa <= 3; pa += 0.25)
      for (let pn = 0; pn <= 3; pn += 0.25) {
        let error = 0;
        COMPOSICIONES.forEach((cs, t) =>
          cs.forEach(([ad, ni]) => (error += (cantidadPropuesta(ad, ni, pa, pn) - tramos[t]) ** 2)),
        );
        expect(a.error).toBeLessThanOrEqual(error);
      }
  });

  it("es determinista", () => {
    expect(ajustar([3, 4, 5, 7, 7])).toEqual(ajustar([3, 4, 5, 7, 7]));
  });
});

describe("CA-0203: correos de prueba", () => {
  it("CA-0203: son alias +demoNN de la base, en minúsculas", () => {
    expect(aliasDeCorreo("Cesta.Ejemplo@example.com", 7)).toBe("cesta.ejemplo+demo07@example.com");
    expect(aliasDeCorreo("cesta+algo@example.com", 45)).toBe("cesta+demo45@example.com");
  });

  it("CA-0203: una base no válida se rechaza", () => {
    expect(() => aliasDeCorreo("no-es-un-correo", 1)).toThrow();
    expect(() => aliasDeCorreo("", 1)).toThrow();
  });

  it("CA-0205: el borrado reconoce sus alias y nada más", () => {
    const base = "cesta@example.com";
    expect(esAliasDePrueba(base, aliasDeCorreo(base, 3))).toBe(true);
    expect(esAliasDePrueba(base, "CESTA+DEMO03@EXAMPLE.COM")).toBe(true);
    expect(esAliasDePrueba(base, "cesta@example.com")).toBe(false);
    expect(esAliasDePrueba(base, "cesta+demo3@example.com")).toBe(false);
    expect(esAliasDePrueba(base, "otra+demo03@example.com")).toBe(false);
    expect(esAliasDePrueba(base, "cesta+demo03@example.org")).toBe(false);
    expect(esAliasDePrueba("cesta.x@example.com", "cestaax+demo03@example.com")).toBe(false);
  });
});

describe("coherencia del conjunto de datos", () => {
  const etiquetasDeLaMigracion = [
    ...readFileSync("supabase/migrations/20261114210000_esquema_inicial.sql", "utf8").matchAll(/\('([a-z_]+)', '[^']+'\)/g),
  ].map((m) => m[1]);
  const claves = new Set(PRODUCTOS.map((p) => p.clave));

  it("las etiquetas existen en la migración inicial", () => {
    for (const p of PRODUCTOS) for (const e of p.etiquetas) expect(etiquetasDeLaMigracion).toContain(e);
    for (const f of Object.values(FAMILIAS)) for (const e of f.exclusiones) expect(etiquetasDeLaMigracion).toContain(e);
  });

  it("los productos no se repiten y los extras de las familias existen y no chocan con sus exclusiones", () => {
    expect(claves.size).toBe(PRODUCTOS.length);
    expect(new Set(PRODUCTOS.map((p) => `${p.nombre}|${p.unidad}`.toLowerCase())).size).toBe(PRODUCTOS.length);
    for (const f of Object.values(FAMILIAS))
      for (const e of f.extras) {
        const p = PRODUCTOS.find((x) => x.clave === e.clave);
        expect(p).toBeDefined();
        expect(p!.etiquetas.filter((t) => f.exclusiones.includes(t))).toEqual([]);
      }
  });

  it("CA-0201: 45 colaboradores con nombres únicos; 2 en pausa y 1 de baja", () => {
    expect(NOMBRES).toHaveLength(45);
    expect(new Set(NOMBRES).size).toBe(45);
    expect(CAMBIOS_DE_ESTADO.filter((c) => c.estado === "pausado")).toHaveLength(2);
    expect(CAMBIOS_DE_ESTADO.filter((c) => c.estado === "baja")).toHaveLength(1);
    for (const c of CAMBIOS_DE_ESTADO) expect(c.posicion).toBeLessThan(NOMBRES.length);
  });

  it("CA-0201: semanas en orden, con el plazo antes de la entrega y en los estados del spec", () => {
    for (let i = 1; i < SEMANAS.length; i++) expect(SEMANAS[i].entrega).toBeGreaterThan(SEMANAS[i - 1].entrega);
    for (const s of SEMANAS) expect(s.plazo).toBeLessThan(s.entrega);
    expect(SEMANAS.map((s) => s.estado)).toEqual(["cerrada", "cerrada", "cerrada", "enviada", "borrador"]);
    for (const s of SEMANAS) for (const f of s.familias) expect(FAMILIAS[f]).toBeDefined();
  });
});
