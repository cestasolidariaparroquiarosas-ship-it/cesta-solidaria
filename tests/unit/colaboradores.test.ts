import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  COLABORADOR_ELIMINADO,
  esCandidato,
  nombreVisible,
  ultimasParticipaciones,
  validarDatosColaborador,
  validarPausa,
} from "@/lib/dominio/colaboradores";

const ENTREGA = "2026-11-21";

describe("esCandidato (R2.3)", () => {
  it("un colaborador activo es candidato", () => {
    expect(esCandidato({ estado: "activo", pausado_hasta: null }, ENTREGA)).toBe(true);
  });

  it("CA-02: en pausa hasta el mismo día de la entrega, no es candidato", () => {
    expect(esCandidato({ estado: "pausado", pausado_hasta: ENTREGA }, ENTREGA)).toBe(false);
  });

  it("CA-02: en pausa hasta después de la entrega, no es candidato", () => {
    expect(esCandidato({ estado: "pausado", pausado_hasta: "2026-12-01" }, ENTREGA)).toBe(false);
  });

  it("CA-02: en pausa hasta antes de la entrega, sí es candidato", () => {
    expect(esCandidato({ estado: "pausado", pausado_hasta: "2026-11-20" }, ENTREGA)).toBe(true);
  });

  it("CA-02: una pausa sin fecha de vuelta es indefinida: no es candidato", () => {
    expect(esCandidato({ estado: "pausado", pausado_hasta: null }, ENTREGA)).toBe(false);
  });

  it("CA-03 (parcial: candidatos): un colaborador de baja nunca es candidato, tenga la fecha que tenga", () => {
    fc.assert(
      fc.property(
        fc.option(fc.date({ min: new Date("2000-01-01"), max: new Date("2100-01-01"), noInvalidDate: true })),
        fc.date({ min: new Date("2000-01-01"), max: new Date("2100-01-01"), noInvalidDate: true }),
        (pausa, entrega) => {
          const pausadoHasta = pausa ? pausa.toISOString().slice(0, 10) : null;
          return !esCandidato({ estado: "baja", pausado_hasta: pausadoHasta }, entrega.toISOString().slice(0, 10));
        },
      ),
    );
  });

  it("CA-02: con fechas al azar, un pausado es candidato si y solo si su pausa acaba antes de la entrega", () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date("2000-01-01"), max: new Date("2100-01-01"), noInvalidDate: true }),
        fc.date({ min: new Date("2000-01-01"), max: new Date("2100-01-01"), noInvalidDate: true }),
        (pausa, entrega) => {
          const hasta = pausa.toISOString().slice(0, 10);
          const dia = entrega.toISOString().slice(0, 10);
          return esCandidato({ estado: "pausado", pausado_hasta: hasta }, dia) === (pausa.getTime() < entrega.getTime() && hasta !== dia);
        },
      ),
    );
  });
});

describe("nombreVisible (R5.2)", () => {
  it("CA-04 (parcial: texto): una asignación sin colaborador se muestra como «Colaborador eliminado»", () => {
    expect(nombreVisible(null)).toBe(COLABORADOR_ELIMINADO);
    expect(nombreVisible(undefined)).toBe("Colaborador eliminado");
  });

  it("con colaborador, muestra su nombre", () => {
    expect(nombreVisible({ nombre: "Ana" })).toBe("Ana");
  });
});

describe("ultimasParticipaciones (spec §3)", () => {
  it("se queda con la fecha de entrega más reciente de cada colaborador", () => {
    const ultimas = ultimasParticipaciones([
      { colaborador_id: "a", fecha_entrega: "2026-10-03" },
      { colaborador_id: "b", fecha_entrega: "2026-10-10" },
      { colaborador_id: "a", fecha_entrega: "2026-11-07" },
      { colaborador_id: "a", fecha_entrega: "2026-09-26" },
      { colaborador_id: null, fecha_entrega: "2026-12-01" },
    ]);
    expect(Object.fromEntries(ultimas)).toEqual({ a: "2026-11-07", b: "2026-10-10" });
  });
});

describe("validarDatosColaborador", () => {
  it("acepta datos correctos, recorta espacios y guarda el correo en minúsculas", () => {
    expect(validarDatosColaborador({ nombre: "  Ana   María ", email: " Ana@Ejemplo.ES ", notas: "  " })).toEqual({
      ok: true,
      datos: { nombre: "Ana María", email: "ana@ejemplo.es", notas: null },
    });
  });

  it("exige nombre y correo", () => {
    const r = validarDatosColaborador({ nombre: " ", email: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errores.nombre).toBeDefined();
      expect(r.errores.email).toBeDefined();
    }
  });

  it.each(["ana", "ana@", "@ejemplo.es", "ana@ejemplo", "ana @ejemplo.es", "ana@ejem plo.es"])(
    "rechaza el correo «%s»",
    (email) => {
      const r = validarDatosColaborador({ nombre: "Ana", email });
      expect(r.ok).toBe(false);
    },
  );

  it("rechaza textos demasiado largos", () => {
    const r = validarDatosColaborador({
      nombre: "a".repeat(101),
      email: `${"a".repeat(250)}@e.es`,
      notas: "n".repeat(501),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errores).sort()).toEqual(["email", "nombre", "notas"]);
  });

  it("no acepta valores que no sean texto", () => {
    const r = validarDatosColaborador({ nombre: 3, email: ["a@b.es"] });
    expect(r.ok).toBe(false);
  });
});

describe("validarPausa", () => {
  const HOY = "2026-11-14";

  it("sin fecha, la pausa es indefinida", () => {
    expect(validarPausa("", HOY)).toEqual({ ok: true, pausadoHasta: null });
    expect(validarPausa(null, HOY)).toEqual({ ok: true, pausadoHasta: null });
  });

  it("acepta hoy y fechas futuras", () => {
    expect(validarPausa(HOY, HOY)).toEqual({ ok: true, pausadoHasta: HOY });
    expect(validarPausa("2027-01-06", HOY)).toEqual({ ok: true, pausadoHasta: "2027-01-06" });
  });

  it("rechaza fechas pasadas e inválidas", () => {
    expect(validarPausa("2026-11-13", HOY).ok).toBe(false);
    expect(validarPausa("2027-02-30", HOY).ok).toBe(false);
    expect(validarPausa("mañana", HOY).ok).toBe(false);
  });
});
