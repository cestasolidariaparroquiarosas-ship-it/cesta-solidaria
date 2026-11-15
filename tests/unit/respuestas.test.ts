import { describe, expect, it } from "vitest";
import { plazoReasignacion, plazoVencido } from "@/lib/dominio/plazos";
import { leerRespuesta, nombreDePila, situacionAsignacion, tokenValido } from "@/lib/dominio/respuestas";
import { correoAsignacion, correoSinSustituto, PIE_PROTECCION_DATOS } from "@/lib/correo/plantillas";
import { formatearFechaLarga } from "@/lib/fechas";

const TOKEN = "a".repeat(64);

describe("R4.4: plazo de una reasignación", () => {
  it("48 horas desde el envío, si llegan antes que la víspera de la entrega", () => {
    const envio = new Date("2026-11-16T09:00:00Z");
    expect(plazoReasignacion(envio, "2026-11-21").toISOString()).toBe("2026-11-18T09:00:00.000Z");
  });

  it("las 23:59 (Madrid) del día anterior a la entrega, si llegan antes que las 48 horas", () => {
    const envio = new Date("2026-11-19T09:00:00Z");
    // 20/11 a las 23:59 en Madrid (UTC+1) = 22:59 UTC.
    expect(plazoReasignacion(envio, "2026-11-21").toISOString()).toBe("2026-11-20T22:59:00.000Z");
  });

  it("en verano, la víspera a las 23:59 es UTC+2", () => {
    expect(plazoReasignacion(new Date("2026-07-02T12:00:00Z"), "2026-07-04").toISOString()).toBe(
      "2026-07-03T21:59:00.000Z",
    );
  });

  it("si ya ha pasado la víspera, el plazo queda en el pasado (no hay tiempo de pedírselo a nadie)", () => {
    const ahora = new Date("2026-11-21T10:00:00Z");
    expect(plazoVencido(plazoReasignacion(ahora, "2026-11-21"), ahora)).toBe(true);
  });

  it("plazoVencido: justo en el plazo ya ha vencido", () => {
    expect(plazoVencido("2026-11-20T22:59:00Z", new Date("2026-11-20T22:59:00Z"))).toBe(true);
    expect(plazoVencido("2026-11-20T22:59:00Z", new Date("2026-11-20T22:58:59Z"))).toBe(false);
  });
});

describe("enlaces del correo", () => {
  it("CA-18: solo se acepta un token de 64 caracteres hexadecimales", () => {
    expect(tokenValido(TOKEN)).toBe(true);
    expect(tokenValido("A".repeat(64))).toBe(false);
    expect(tokenValido("a".repeat(63))).toBe(false);
    expect(tokenValido(`${"a".repeat(63)}'`)).toBe(false);
    expect(tokenValido(undefined)).toBe(false);
  });

  it("leerRespuesta", () => {
    expect(leerRespuesta("si")).toBe("si");
    expect(leerRespuesta("no")).toBe("no");
    expect(leerRespuesta("SI")).toBeNull();
    expect(leerRespuesta(undefined)).toBeNull();
  });

  it("CA-24: solo el nombre de pila", () => {
    expect(nombreDePila("  María José   Pérez ")).toBe("María");
    expect(nombreDePila("")).toBe("colaborador/a");
    expect(nombreDePila(null)).toBe("colaborador/a");
  });
});

describe("R4.3 y CA-19: qué puede hacer quien abre el enlace", () => {
  const ahora = new Date("2026-11-18T10:00:00Z");
  const enviada = { estado: "enviada" as const };

  it("solo responde una asignación pendiente, antes del plazo, con la semana enviada", () => {
    expect(situacionAsignacion({ estado: "pendiente", plazo: "2026-11-19T10:00:00Z" }, enviada, ahora)).toBe(
      "puede_responder",
    );
    expect(situacionAsignacion({ estado: "pendiente", plazo: "2026-11-18T10:00:00Z" }, enviada, ahora)).toBe("vencida");
    expect(situacionAsignacion({ estado: "pendiente", plazo: null }, enviada, ahora)).toBe("vencida");
    expect(
      situacionAsignacion({ estado: "pendiente", plazo: "2026-11-19T10:00:00Z" }, { estado: "cerrada" }, ahora),
    ).toBe("no_disponible");
  });

  it("si ya respondió o no respondió a tiempo, se le explica", () => {
    expect(situacionAsignacion({ estado: "confirmada", plazo: null }, enviada, ahora)).toBe("confirmada");
    expect(situacionAsignacion({ estado: "rechazada", plazo: null }, enviada, ahora)).toBe("rechazada");
    expect(situacionAsignacion({ estado: "sin_respuesta", plazo: null }, enviada, ahora)).toBe("vencida");
    expect(situacionAsignacion({ estado: "propuesta", plazo: null }, { estado: "borrador" }, ahora)).toBe(
      "no_disponible",
    );
  });
});

describe("CA-14: el correo de la asignación", () => {
  const datos = {
    nombre: "Ana <b>María</b> Pérez",
    fechaEntrega: "2026-11-21",
    plazo: "2026-11-19T19:00:00Z",
    lineas: [
      { cantidad: 4, nombre: "Arroz", unidad: "paquete 1 kg" },
      { cantidad: 1, nombre: "Aceite <de oliva>", unidad: "botella 1 l" },
    ],
    gasto: 12.3,
    urlRespuesta: `https://cesta.example/r/${TOKEN}`,
    urlBaja: `https://cesta.example/baja/${TOKEN}`,
    sustitucion: false,
  };

  it("lleva la fecha, la lista con cantidades, el plazo, los dos enlaces y el pie con la baja", () => {
    const m = correoAsignacion(datos);
    expect(m.asunto).toBe("Cesta solidaria: ¿puedes llevar alimentos el 21/11/2026?");
    for (const cuerpo of [m.texto, m.html]) {
      expect(cuerpo).toContain("sábado 21 de noviembre");
      expect(cuerpo).toContain("4 × Arroz (paquete 1 kg)");
      expect(cuerpo).toContain("19/11/2026 a las 20:00");
      expect(cuerpo).toContain(`/r/${TOKEN}?respuesta=si`);
      expect(cuerpo).toContain(`/r/${TOKEN}?respuesta=no`);
      expect(cuerpo).toContain(`/baja/${TOKEN}`);
      expect(cuerpo).toContain("Puedo llevarlo");
      expect(cuerpo).toContain("No puedo esta vez");
      expect(cuerpo).toContain("12,30");
    }
    expect(m.texto).toContain(PIE_PROTECCION_DATOS);
  });

  it("saluda solo por el nombre de pila y escapa el HTML", () => {
    const m = correoAsignacion(datos);
    expect(m.texto).toContain("Hola, Ana:");
    expect(m.texto).not.toContain("Pérez");
    expect(m.html).toContain("Aceite &lt;de oliva&gt;");
    expect(m.html).not.toContain("<de oliva>");
  });

  it("una sustitución lo explica", () => {
    expect(correoAsignacion({ ...datos, sustitucion: true }).texto).toContain("Otra persona no puede llevar");
  });

  it("el aviso al administrador no lleva nombres ni correos", () => {
    const m = correoSinSustituto({
      fechaEntrega: "2026-11-21",
      motivo: "sin_candidatos",
      lineas: datos.lineas,
      urlSemana: "https://cesta.example/semanas/1",
    });
    expect(m.asunto).toBe("Cesta solidaria: alimentos sin cubrir para el 21/11/2026");
    expect(m.texto).toContain("no queda ningún otro colaborador disponible");
    expect(m.texto).toContain("4 × Arroz (paquete 1 kg)");
    expect(m.texto).not.toContain("Ana");
  });

  it("fecha larga", () => {
    expect(formatearFechaLarga("2026-11-21")).toBe("sábado 21 de noviembre");
  });
});
