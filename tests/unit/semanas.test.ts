import { describe, expect, it } from "vitest";
import { semanaEditable, validarSemana } from "@/lib/dominio/semanas";
import { fechaHoraEnMadrid, formatearFechaHora, instanteDeMadrid, sumarDias } from "@/lib/fechas";

// 15/11/2026 a las 10:00 en Madrid (CET, UTC+1).
const AHORA = new Date("2026-11-15T09:00:00Z");

describe("instanteDeMadrid (plan §4: horas en UTC, escritas en Madrid)", () => {
  it("en invierno, Madrid es UTC+1", () => {
    expect(instanteDeMadrid("2026-11-20", "23:59")?.toISOString()).toBe("2026-11-20T22:59:00.000Z");
  });

  it("en verano, Madrid es UTC+2", () => {
    expect(instanteDeMadrid("2026-07-01", "00:30")?.toISOString()).toBe("2026-06-30T22:30:00.000Z");
  });

  it("cambio de hora de marzo: de 2:00 a 2:59 no existe; antes y después, sí", () => {
    // 29/03/2026: a las 02:00 CET se pasa a las 03:00 CEST.
    expect(instanteDeMadrid("2026-03-29", "01:59")?.toISOString()).toBe("2026-03-29T00:59:00.000Z");
    expect(instanteDeMadrid("2026-03-29", "02:30")).toBeNull();
    expect(instanteDeMadrid("2026-03-29", "03:00")?.toISOString()).toBe("2026-03-29T01:00:00.000Z");
  });

  it("cambio de hora de octubre: en la hora repetida se toma la primera vez", () => {
    // 25/10/2026: a las 03:00 CEST se vuelve a las 02:00 CET.
    expect(instanteDeMadrid("2026-10-25", "02:30")?.toISOString()).toBe("2026-10-25T00:30:00.000Z");
    expect(instanteDeMadrid("2026-10-25", "03:30")?.toISOString()).toBe("2026-10-25T02:30:00.000Z");
  });

  it.each([
    ["2026-02-30", "10:00"],
    ["2026-11-20", "24:00"],
    ["2026-11-20", "9:00"],
    ["20/11/2026", "10:00"],
  ])("rechaza %s %s", (fecha, hora) => {
    expect(instanteDeMadrid(fecha, hora)).toBeNull();
  });

  it("ida y vuelta: fechaHoraEnMadrid devuelve lo escrito", () => {
    for (const [fecha, hora] of [
      ["2026-11-20", "23:59"],
      ["2027-03-28", "03:15"],
      ["2027-10-31", "01:00"],
    ]) {
      expect(fechaHoraEnMadrid(instanteDeMadrid(fecha, hora)!)).toEqual({ fecha, hora });
    }
  });

  it("formatea y suma días", () => {
    expect(formatearFechaHora("2026-11-20T22:59:00Z")).toBe("20/11/2026 a las 23:59");
    expect(sumarDias("2026-12-30", 3)).toBe("2027-01-02");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("validarSemana", () => {
  const valida = { fecha_entrega: "2026-11-21", precio_base: "20", plazo_fecha: "2026-11-19", plazo_hora: "23:59" };

  it("acepta una semana correcta y guarda el plazo en UTC", () => {
    expect(validarSemana(valida, AHORA)).toEqual({
      ok: true,
      datos: { fecha_entrega: "2026-11-21", precio_base: 20, plazo_confirmacion: "2026-11-19T22:59:00.000Z" },
    });
  });

  it("acepta decimales con coma en el precio", () => {
    const r = validarSemana({ ...valida, precio_base: "17,50" }, AHORA);
    expect(r.ok && r.datos.precio_base).toBe(17.5);
  });

  it("todo vacío: un error por campo", () => {
    expect(validarSemana({}, AHORA)).toEqual({
      ok: false,
      errores: {
        fecha_entrega: "Elige la fecha de entrega.",
        precio_base: "Escribe el precio en euros, por ejemplo 20.",
        plazo_fecha: "Elige el día del plazo.",
      },
    });
  });

  it("la fecha de entrega no puede haber pasado", () => {
    const r = validarSemana({ ...valida, fecha_entrega: "2026-11-14" }, AHORA);
    expect(!r.ok && r.errores.fecha_entrega).toBe("La fecha de entrega ya ha pasado.");
  });

  it("el precio base tiene que ser mayor que 0", () => {
    const r = validarSemana({ ...valida, precio_base: "0" }, AHORA);
    expect(!r.ok && r.errores.precio_base).toBe("Tiene que ser mayor que 0.");
  });

  it("el plazo tiene que ser futuro", () => {
    const r = validarSemana({ ...valida, plazo_fecha: "2026-11-15", plazo_hora: "09:59" }, AHORA);
    expect(!r.ok && r.errores.plazo_fecha).toBe("El plazo ya ha pasado.");
  });

  it("el plazo tiene que terminar antes del día de la entrega (en hora de Madrid)", () => {
    const r = validarSemana({ ...valida, plazo_fecha: "2026-11-21", plazo_hora: "00:30" }, AHORA);
    expect(!r.ok && r.errores.plazo_fecha).toBe("El plazo tiene que terminar antes del día de la entrega.");
    // 23:59 del día anterior sí vale, aunque en UTC sea 22:59.
    expect(validarSemana({ ...valida, plazo_fecha: "2026-11-20", plazo_hora: "23:59" }, AHORA).ok).toBe(true);
  });

  it("una hora que no existe por el cambio de hora", () => {
    const r = validarSemana(
      { fecha_entrega: "2027-04-03", precio_base: "20", plazo_fecha: "2027-03-28", plazo_hora: "02:30" },
      AHORA,
    );
    expect(!r.ok && r.errores.plazo_hora).toBe("Escribe una hora válida, por ejemplo 20:00.");
  });

  it("solo se preparan las semanas en borrador", () => {
    expect(semanaEditable({ estado: "borrador" })).toBe(true);
    expect(semanaEditable({ estado: "enviada" })).toBe(false);
    expect(semanaEditable({ estado: "cerrada" })).toBe(false);
  });
});
