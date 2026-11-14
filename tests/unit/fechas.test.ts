import { describe, expect, it } from "vitest";
import { esFechaValida, formatearDia, formatearFecha, hoyEnMadrid } from "@/lib/fechas";

describe("hoyEnMadrid", () => {
  it("usa el día de Madrid aunque en UTC aún sea el día anterior (horario de verano)", () => {
    // 23:30 UTC del 30 de junio = 01:30 del 1 de julio en Madrid (CEST, UTC+2).
    expect(hoyEnMadrid(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
  });

  it("en horario de invierno la diferencia es de una hora", () => {
    expect(hoyEnMadrid(new Date("2026-11-14T22:59:00Z"))).toBe("2026-11-14");
    expect(hoyEnMadrid(new Date("2026-11-14T23:00:00Z"))).toBe("2026-11-15");
  });

  it("el día del cambio de hora de octubre", () => {
    // 25/10/2026: a las 03:00 CEST se vuelve a las 02:00 CET.
    expect(hoyEnMadrid(new Date("2026-10-25T22:59:00Z"))).toBe("2026-10-25");
    expect(hoyEnMadrid(new Date("2026-10-25T23:00:00Z"))).toBe("2026-10-26");
  });
});

describe("esFechaValida", () => {
  it("acepta fechas reales", () => {
    expect(esFechaValida("2028-02-29")).toBe(true);
    expect(esFechaValida("2026-12-31")).toBe(true);
  });

  it("rechaza fechas imposibles o con otro formato", () => {
    expect(esFechaValida("2026-02-29")).toBe(false);
    expect(esFechaValida("2026-13-01")).toBe(false);
    expect(esFechaValida("14/11/2026")).toBe(false);
    expect(esFechaValida("2026-1-1")).toBe(false);
  });
});

describe("formatearFecha y formatearDia", () => {
  it("muestra las fechas como DD/MM/AAAA", () => {
    expect(formatearFecha("2026-11-20")).toBe("20/11/2026");
  });

  it("muestra el día en hora de Madrid", () => {
    expect(formatearDia("2026-11-14T23:30:00Z")).toBe("15/11/2026");
  });
});
