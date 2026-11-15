import { describe, expect, it } from "vitest";
import { cronAutorizado } from "@/lib/cron";

describe("CA-26: autorización del cron", () => {
  const secreto = "un-secreto-largo-de-prueba";

  it("acepta solo la cabecera exacta que envía Vercel", () => {
    expect(cronAutorizado(`Bearer ${secreto}`, secreto)).toBe(true);
  });

  it.each([
    ["sin cabecera", null],
    ["cabecera vacía", ""],
    ["sin «Bearer»", secreto],
    ["otro secreto", "Bearer otro-secreto"],
    ["el secreto con un carácter de más", `Bearer ${secreto}x`],
    ["minúsculas", `bearer ${secreto}`],
  ])("rechaza: %s", (_caso, cabecera) => {
    expect(cronAutorizado(cabecera, secreto)).toBe(false);
  });

  it("sin CRON_SECRET configurado no acepta nada, ni siquiera «Bearer »", () => {
    expect(cronAutorizado("Bearer ", undefined)).toBe(false);
    expect(cronAutorizado("Bearer ", "")).toBe(false);
    expect(cronAutorizado("Bearer undefined", undefined)).toBe(false);
  });
});
