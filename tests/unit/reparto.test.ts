import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  agruparPorAlimento,
  repartir,
  superaPrecioBase,
  validarMovimiento,
  type ItemRepartible,
} from "@/lib/dominio/reparto";

const item = (cesta_item_id: string, alimento_id: string, cantidad: number, precio_unitario: number): ItemRepartible => ({
  cesta_item_id,
  alimento_id,
  cantidad,
  precio_unitario,
});

/** Gasto de cada asignación recalculado desde los items, en céntimos. */
function gastos(items: ItemRepartible[], reparto: ReturnType<typeof repartir>) {
  const precio = new Map(items.map((i) => [i.cesta_item_id, Math.round(i.precio_unitario * 100)]));
  return reparto.map((a) => a.items.reduce((t, i) => t + i.cantidad * precio.get(i.cesta_item_id)!, 0));
}

// Semanas generadas al azar: hasta 30 alimentos de cesta, de 1 a 12 unidades, de 0 a 15 €.
const semana = fc.array(
  fc.record({
    alimento: fc.integer({ min: 0, max: 9 }),
    cantidad: fc.integer({ min: 1, max: 12 }),
    centimos: fc.integer({ min: 0, max: 1500 }),
  }),
  { minLength: 1, maxLength: 30 },
);
const aItems = (s: { alimento: number; cantidad: number; centimos: number }[]) =>
  s.map((x, i) => item(`ci${String(i).padStart(2, "0")}`, `al${x.alimento}`, x.cantidad, x.centimos / 100));
const colaboradores = (n: number) => Array.from({ length: n }, (_, i) => `col${i}`);

describe("R3: reparto equilibrado", () => {
  it("reparte de la pieza más cara a la más barata al que menos lleva", () => {
    const items = [item("aceite", "aceite", 1, 8), item("arroz", "arroz", 4, 1), item("leche", "leche", 4, 1)];
    const r = repartir(items, ["A", "B"]);
    // A: aceite (8). B: 4 arroz + 4 leche (8). Empate exacto.
    expect(r).toEqual([
      { colaborador_id: "A", items: [{ cesta_item_id: "aceite", cantidad: 1 }], gasto: 8 },
      {
        colaborador_id: "B",
        items: [
          { cesta_item_id: "arroz", cantidad: 4 },
          { cesta_item_id: "leche", cantidad: 4 },
        ],
        gasto: 8,
      },
    ]);
  });

  it("R3.3: a igualdad de gasto, prefiere a quien ya lleva ese alimento (3 paquetes de arroz no se parten)", () => {
    // Aceite (2 €) a A. Arroz 1 → B (1 €). Arroz 2 → B (1 < 2), y empatan a 2 €.
    // Arroz 3: empate; B ya lleva arroz y A no → B. Sin la regla iría a A, el primero.
    const r = repartir([item("aceite", "aceite", 1, 2), item("arroz", "arroz", 3, 1)], ["A", "B"]);
    expect(r).toEqual([
      { colaborador_id: "A", items: [{ cesta_item_id: "aceite", cantidad: 1 }], gasto: 2 },
      { colaborador_id: "B", items: [{ cesta_item_id: "arroz", cantidad: 3 }], gasto: 3 },
    ]);
  });

  it("no parte un alimento entre colaboradores si no hace falta", () => {
    // Un solo colaborador: todo para él, en una línea por alimento de cesta.
    expect(repartir([item("arroz", "arroz", 3, 1.2)], ["A"])).toEqual([
      { colaborador_id: "A", items: [{ cesta_item_id: "arroz", cantidad: 3 }], gasto: 3.6 },
    ]);
  });

  it("quien no recibe nada no aparece; sin piezas no hay reparto", () => {
    expect(repartir([item("aceite", "aceite", 1, 30)], ["A", "B", "C"]).map((a) => a.colaborador_id)).toEqual(["A"]);
    expect(repartir([], ["A"])).toEqual([]);
    expect(() => repartir([item("x", "x", 1, 1)], [])).toThrow();
  });

  it("CA-11 (propiedad): la diferencia entre el que más gasta y el que menos no supera la pieza más cara", () => {
    fc.assert(
      fc.property(semana, fc.integer({ min: 1, max: 12 }), (s, n) => {
        const items = aItems(s);
        const reparto = repartir(items, colaboradores(n));
        // Los que no aparecen gastan 0.
        const g = [...gastos(items, reparto), ...Array(n - reparto.length).fill(0)];
        const piezaMasCara = Math.max(...items.map((i) => Math.round(i.precio_unitario * 100)));
        expect(Math.max(...g) - Math.min(...g)).toBeLessThanOrEqual(piezaMasCara);
      }),
      { numRuns: 500 },
    );
  });

  it("CA-12 (propiedad): cada unidad de cada cesta se asigna exactamente una vez", () => {
    fc.assert(
      fc.property(semana, fc.integer({ min: 1, max: 12 }), (s, n) => {
        const items = aItems(s);
        const reparto = repartir(items, colaboradores(n));
        const asignado = new Map<string, number>();
        for (const a of reparto) {
          for (const i of a.items) {
            expect(i.cantidad).toBeGreaterThan(0);
            asignado.set(i.cesta_item_id, (asignado.get(i.cesta_item_id) ?? 0) + i.cantidad);
          }
        }
        expect(Object.fromEntries(asignado)).toEqual(Object.fromEntries(items.map((i) => [i.cesta_item_id, i.cantidad])));
        // Y el gasto que dice cada asignación cuadra con sus piezas.
        expect(reparto.map((a) => Math.round(a.gasto * 100))).toEqual(gastos(items, reparto));
        // Nadie aparece dos veces.
        expect(new Set(reparto.map((a) => a.colaborador_id)).size).toBe(reparto.length);
      }),
      { numRuns: 500 },
    );
  });
});

describe("para mostrar y editar el reparto", () => {
  it("agrupa el mismo alimento de distintas cestas, pero no si cambió la unidad", () => {
    const lineas = agruparPorAlimento([
      { alimento_id: "arroz", nombre: "Arroz", unidad: "paquete 1 kg", cantidad: 2, precio_unitario: 1.2 },
      { alimento_id: "leche", nombre: "Leche", unidad: "brik 1 l", cantidad: 1, precio_unitario: 0.9 },
      { alimento_id: "arroz", nombre: "Arroz", unidad: "paquete 1 kg", cantidad: 3, precio_unitario: 1.3 },
      { alimento_id: "arroz", nombre: "Arroz", unidad: "paquete 500 g", cantidad: 1, precio_unitario: 0.7 },
    ]);
    expect(lineas).toEqual([
      { alimento_id: "arroz", nombre: "Arroz", unidad: "paquete 1 kg", cantidad: 5, gasto: 6.3 },
      { alimento_id: "arroz", nombre: "Arroz", unidad: "paquete 500 g", cantidad: 1, gasto: 0.7 },
      { alimento_id: "leche", nombre: "Leche", unidad: "brik 1 l", cantidad: 1, gasto: 0.9 },
    ]);
  });

  it("R3.5: avisa si un gasto supera el precio base", () => {
    expect(superaPrecioBase(20.01, 20)).toBe(true);
    expect(superaPrecioBase(20, 20)).toBe(false);
    expect(superaPrecioBase(0.1 + 0.2, 0.3)).toBe(false);
  });

  it("valida cuánto se mueve", () => {
    expect(validarMovimiento("2", 3)).toEqual({ ok: true, cantidad: 2 });
    expect(validarMovimiento("4", 3)).toEqual({ ok: false, error: "Como mucho 3: es lo que lleva." });
    expect(validarMovimiento("0", 3).ok).toBe(false);
    expect(validarMovimiento("1,5", 3).ok).toBe(false);
  });
});
