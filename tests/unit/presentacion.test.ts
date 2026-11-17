import { describe, expect, it } from "vitest";
import { pasosSemana } from "@/lib/dominio/semanas";
import { gruposSeguimiento } from "@/lib/dominio/inicio";
import type { EstadoAsignacion } from "@/lib/dominio/respuestas";
import { seccionActual } from "@/app/(admin)/_ui/menu";

// Iteración 0003: reglas de presentación (spec 0003 §4).

const resumen = (p: ReturnType<typeof pasosSemana>) => ({
  hechos: p.filter((x) => x.hecho).map((x) => x.clave),
  actual: p.find((x) => x.actual)?.clave ?? null,
});

describe("CA-0302: pasos de la semana (P1)", () => {
  it("sin cestas: actual Cestas", () => {
    expect(resumen(pasosSemana({ estado: "borrador", cestas: 0, enReparto: 0 }))).toEqual({
      hechos: ["datos"],
      actual: "cestas",
    });
  });

  it("con cestas y sin reparto: actual Reparto", () => {
    expect(resumen(pasosSemana({ estado: "borrador", cestas: 3, enReparto: 0 }))).toEqual({
      hechos: ["datos", "cestas"],
      actual: "reparto",
    });
  });

  it("con reparto en preparación: actual Envío", () => {
    expect(resumen(pasosSemana({ estado: "borrador", cestas: 3, enReparto: 19 }))).toEqual({
      hechos: ["datos", "cestas", "reparto"],
      actual: "envio",
    });
  });

  it("enviada: actual Envío, con los tres primeros hechos", () => {
    expect(resumen(pasosSemana({ estado: "enviada", cestas: 3, enReparto: 19 }))).toEqual({
      hechos: ["datos", "cestas", "reparto"],
      actual: "envio",
    });
  });

  it("cerrada: los cuatro hechos y ninguno actual", () => {
    expect(resumen(pasosSemana({ estado: "cerrada", cestas: 3, enReparto: 19 }))).toEqual({
      hechos: ["datos", "cestas", "reparto", "envio"],
      actual: null,
    });
  });

  it("siempre devuelve los cuatro pasos en orden", () => {
    expect(pasosSemana({ estado: "borrador", cestas: 0, enReparto: 0 }).map((p) => p.clave)).toEqual([
      "datos",
      "cestas",
      "reparto",
      "envio",
    ]);
  });
});

describe("CA-0303: grupos del seguimiento (P2)", () => {
  const a = (nombre: string, estado: EstadoAsignacion) => ({ nombre, estado });

  it("esperando, confirmadas y no pueden, en ese orden y conservando el orden dentro de cada grupo", () => {
    const grupos = gruposSeguimiento([
      a("Ana", "confirmada"),
      a("Bea", "rechazada"),
      a("Carlos", "pendiente"),
      a("Dani", "confirmada"),
      a("Eva", "sin_respuesta"),
      a("Fran", "pendiente"),
    ]);
    expect(grupos.map((g) => [g.grupo, g.asignaciones.map((x) => x.nombre)])).toEqual([
      ["esperando", ["Carlos", "Fran"]],
      ["confirmadas", ["Ana", "Dani"]],
      ["noPueden", ["Bea", "Eva"]],
    ]);
  });

  it("omite los grupos vacíos", () => {
    expect(gruposSeguimiento([a("Ana", "confirmada")]).map((g) => g.grupo)).toEqual(["confirmadas"]);
    expect(gruposSeguimiento([])).toEqual([]);
  });

  it("no pierde ninguna asignación: una propuesta que quedara va la primera", () => {
    const todas = [a("Ana", "confirmada"), a("Bea", "propuesta"), a("Carlos", "pendiente")];
    const grupos = gruposSeguimiento(todas);
    expect(grupos[0]).toEqual({ grupo: "propuesta", asignaciones: [todas[1]] });
    expect(grupos.flatMap((g) => g.asignaciones)).toHaveLength(todas.length);
  });
});

describe("CA-0301: sección actual del menú", () => {
  it("cada sección y sus subpáginas", () => {
    expect(seccionActual("/")).toBe("/");
    expect(seccionActual("/semanas")).toBe("/semanas");
    expect(seccionActual("/semanas/abc/reparto")).toBe("/semanas");
    expect(seccionActual("/historico")).toBe("/historico");
    expect(seccionActual("/colaboradores/nuevo")).toBe("/colaboradores");
    expect(seccionActual("/alimentos/etiquetas")).toBe("/alimentos");
    expect(seccionActual("/listas/xyz")).toBe("/listas");
  });

  it("no confunde prefijos parecidos", () => {
    expect(seccionActual("/semanasx")).toBeUndefined();
  });
});
