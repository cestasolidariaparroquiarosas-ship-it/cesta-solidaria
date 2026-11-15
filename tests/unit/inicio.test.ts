import { describe, expect, it } from "vitest";
import { avisosSemana, recuento, semanaEnCurso, semanasSinCerrar } from "@/lib/dominio/inicio";
import type { EstadoSemana } from "@/lib/dominio/semanas";

const HOY = "2026-11-18";

describe("semana en curso (spec §5.2)", () => {
  const s = (fecha_entrega: string, estado: "borrador" | "enviada" | "cerrada") => ({ fecha_entrega, estado });

  it("la próxima entrega abierta, de hoy en adelante", () => {
    expect(semanaEnCurso([s("2026-11-28", "borrador"), s("2026-11-21", "enviada"), s("2026-11-14", "enviada")], HOY)).toEqual(
      s("2026-11-21", "enviada"),
    );
    expect(semanaEnCurso([s(HOY, "enviada"), s("2026-11-21", "borrador")], HOY)).toEqual(s(HOY, "enviada"));
  });

  it("si todas las abiertas ya pasaron, la más reciente (falta cerrarla)", () => {
    expect(semanaEnCurso([s("2026-11-07", "enviada"), s("2026-11-14", "enviada"), s("2026-11-21", "cerrada")], HOY)).toEqual(
      s("2026-11-14", "enviada"),
    );
  });

  it("aparte, las enviadas cuya entrega ya pasó y siguen sin cerrar (aunque haya borrador de la siguiente)", () => {
    const semanas = [
      { id: "a", ...s("2026-11-07", "enviada") },
      { id: "b", ...s("2026-11-14", "enviada") },
      { id: "c", ...s("2026-11-21", "borrador") },
      { id: "d", ...s("2026-10-31", "cerrada") },
    ];
    const enCurso = semanaEnCurso(semanas, HOY);
    expect(enCurso?.id).toBe("c");
    expect(semanasSinCerrar(semanas, HOY, enCurso).map((x) => x.id)).toEqual(["b", "a"]);
    // Sin borrador, la última pasada es la semana en curso y no se repite.
    const sinBorrador = semanas.filter((x) => x.id !== "c");
    expect(semanasSinCerrar(sinBorrador, HOY, semanaEnCurso(sinBorrador, HOY)).map((x) => x.id)).toEqual(["a"]);
  });

  it("las cerradas no cuentan", () => {
    expect(semanaEnCurso([s("2026-11-21", "cerrada")], HOY)).toBeNull();
    expect(semanaEnCurso([], HOY)).toBeNull();
  });
});

describe("recuento", () => {
  it("confirmadas, esperando, no pueden y entregadas", () => {
    expect(
      recuento([
        { estado: "confirmada", entregado: true },
        { estado: "confirmada", entregado: false },
        { estado: "pendiente", entregado: false },
        { estado: "rechazada", entregado: false },
        { estado: "sin_respuesta", entregado: false },
        { estado: "propuesta", entregado: false },
      ]),
    ).toEqual({ confirmadas: 2, esperando: 1, noPueden: 2, entregadas: 1 });
  });
});

describe("avisos de la semana en curso", () => {
  const base = {
    estado: "borrador" as EstadoSemana,
    fechaEntrega: "2026-11-21",
    plazoVencido: false,
    hoy: HOY,
    cestas: 3,
    enReparto: 2,
    noDisponibles: 0,
    correosSinEnviar: 0,
    sinCubrir: 0,
  };
  const textos = (d: Partial<typeof base>) => avisosSemana({ ...base, ...d }).map((a) => a.texto);

  it("en preparación, el siguiente paso", () => {
    expect(textos({ cestas: 0, enReparto: 0 })).toEqual(["Añade las cestas de las familias."]);
    expect(textos({ enReparto: 0 })).toEqual(["Prepara el reparto."]);
    expect(textos({ noDisponibles: 1 })).toEqual([
      "En el reparto hay colaboradores que ya no están disponibles: cámbialos.",
    ]);
    expect(textos({ plazoVencido: true })).toEqual(["El plazo para responder ya ha pasado: cámbialo antes de enviar."]);
    expect(textos({ fechaEntrega: "2026-11-14", plazoVencido: true })).toEqual([
      "La fecha de entrega ya ha pasado: cámbiala o elimina la semana.",
    ]);
    expect(textos({})).toEqual(["Todo listo para enviar los correos."]);
  });

  it("enviada: correos sin salir, alimentos sin cubrir y cierre tras la entrega", () => {
    expect(textos({ estado: "enviada" })).toEqual([]);
    expect(textos({ estado: "enviada", correosSinEnviar: 2, sinCubrir: 1, fechaEntrega: HOY })).toEqual([
      "2 correos no se han podido enviar.",
      "Un colaborador no puede llevar lo suyo y nadie lo lleva.",
      "Hoy es la entrega: después, marca lo entregado y cierra la semana.",
    ]);
    expect(textos({ estado: "enviada", sinCubrir: 2, fechaEntrega: "2026-11-14" })).toEqual([
      "2 colaboradores no pueden llevar lo suyo y nadie lo lleva.",
      "Ya ha sido la entrega: marca lo entregado y cierra la semana.",
    ]);
    expect(avisosSemana({ ...base, estado: "enviada", correosSinEnviar: 1 })[0]).toEqual({
      tipo: "error",
      texto: "Un correo no se ha podido enviar.",
    });
  });

  it("una semana cerrada no tiene avisos", () => {
    expect(textos({ estado: "cerrada" })).toEqual([]);
  });
});
