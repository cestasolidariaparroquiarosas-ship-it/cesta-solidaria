import { describe, expect, it } from "vitest";
import { candidatosOrdenados, colaboradoresNecesarios, seleccionar, type Candidato } from "@/lib/dominio/seleccion";

const ENTREGA = "2026-11-21";

function c(id: string, datos: Partial<Candidato> = {}): Candidato {
  return {
    id,
    estado: "activo",
    pausado_hasta: null,
    creado_en: "2026-01-01T10:00:00Z",
    ultima_participacion: null,
    ...datos,
  };
}

describe("R2.2: colaboradores necesarios", () => {
  it("CA-09: con 95 € de coste y 20 € de precio base, hacen falta 5", () => {
    expect(colaboradoresNecesarios(95, 20)).toBe(5);
  });

  it("redondea hacia arriba, sin errores de coma flotante", () => {
    expect(colaboradoresNecesarios(100, 20)).toBe(5);
    expect(colaboradoresNecesarios(100.01, 20)).toBe(6);
    // 0,1 + 0,2 en coma flotante es 0,30000000000000004.
    expect(colaboradoresNecesarios(0.1 + 0.2, 0.3)).toBe(1);
    expect(colaboradoresNecesarios(0, 20)).toBe(0);
  });

  it("el precio base tiene que ser mayor que 0", () => {
    expect(() => colaboradoresNecesarios(10, 0)).toThrow();
  });
});

describe("R2.3 y R2.4: candidatos y orden", () => {
  it("CA-10: A nunca ha participado, B hace 3 semanas, C la semana pasada; con N = 2 se eligen A y B", () => {
    const colaboradores = [
      c("C", { ultima_participacion: "2026-11-14" }),
      c("B", { ultima_participacion: "2026-10-31" }),
      c("A"),
    ];
    // Coste 40 € y precio base 20 €: N = 2.
    const r = seleccionar(colaboradores, { fechaEntrega: ENTREGA, costeTotal: 40, precioBase: 20 });
    expect(r.necesarios).toBe(2);
    expect(r.elegidos.map((x) => x.id)).toEqual(["A", "B"]);
    expect(r.faltan).toBe(0);
  });

  it("a igualdad, va antes quien se dio de alta antes; y después, por id", () => {
    const orden = candidatosOrdenados(
      [
        c("z", { creado_en: "2026-03-01T00:00:00Z", ultima_participacion: "2026-11-07" }),
        c("y", { creado_en: "2026-02-01T00:00:00Z", ultima_participacion: "2026-11-07" }),
        c("x", { creado_en: "2026-02-01T00:00:00Z", ultima_participacion: "2026-11-07" }),
        c("w", { creado_en: "2026-05-01T00:00:00Z" }),
        c("v", { creado_en: "2026-04-01T00:00:00Z" }),
      ],
      ENTREGA,
    );
    expect(orden.map((x) => x.id)).toEqual(["v", "w", "x", "y", "z"]);
  });

  it("CA-02 y CA-03: solo son candidatos los activos y los pausados cuya pausa termina antes", () => {
    const orden = candidatosOrdenados(
      [
        c("activo"),
        c("baja", { estado: "baja" }),
        c("pausa-indefinida", { estado: "pausado" }),
        c("pausa-hasta-entrega", { estado: "pausado", pausado_hasta: ENTREGA }),
        c("pausa-terminada", { estado: "pausado", pausado_hasta: "2026-11-20" }),
      ],
      ENTREGA,
    );
    expect(orden.map((x) => x.id).sort()).toEqual(["activo", "pausa-terminada"]);
  });

  it("se puede excluir a quien ya está en el reparto", () => {
    const orden = candidatosOrdenados([c("a"), c("b"), c("c")], ENTREGA, new Set(["b"]));
    expect(orden.map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("CA-13: si hay menos candidatos que N, se eligen todos y se dice cuántos faltan", () => {
    const r = seleccionar([c("a"), c("b"), c("baja", { estado: "baja" })], {
      fechaEntrega: ENTREGA,
      costeTotal: 95,
      precioBase: 20,
    });
    expect(r).toMatchObject({ necesarios: 5, faltan: 3 });
    expect(r.elegidos.map((x) => x.id)).toEqual(["a", "b"]);
  });
});
