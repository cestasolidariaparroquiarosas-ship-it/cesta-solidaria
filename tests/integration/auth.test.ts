import { beforeAll, describe, expect, it } from "vitest";
import {
  ADMIN_PRUEBAS,
  SIN_ROL_PRUEBAS,
  asegurarUsuariosPruebas,
  clienteAnonimo,
} from "../utilidades/supabase";

describe("acceso de administradores", () => {
  beforeAll(asegurarUsuariosPruebas);

  it("CA-25: nadie puede registrarse por su cuenta", async () => {
    const { data, error } = await clienteAnonimo().auth.signUp({
      email: `intruso-${Date.now()}@ejemplo.test`,
      password: "Intento-de-registro-1",
    });
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });

  it("CA-25: no se permiten sesiones anónimas", async () => {
    const { error } = await clienteAnonimo().auth.signInAnonymously();
    expect(error).not.toBeNull();
  });

  it("un administrador dado de alta a mano puede entrar y su sesión lleva el rol", async () => {
    const { data, error } = await clienteAnonimo().auth.signInWithPassword(ADMIN_PRUEBAS);
    expect(error).toBeNull();
    expect(data.user?.email).toBe(ADMIN_PRUEBAS.email);
    expect(data.user?.app_metadata?.rol).toBe("admin");
  });

  it("un usuario no puede darse a sí mismo el rol de administrador", async () => {
    const cliente = clienteAnonimo();
    await cliente.auth.signInWithPassword(SIN_ROL_PRUEBAS);
    // updateUser solo permite tocar user_metadata, nunca app_metadata.
    await cliente.auth.updateUser({ data: { rol: "admin" } });
    const { data } = await cliente.auth.refreshSession();
    expect(data.user?.app_metadata?.rol).toBeUndefined();
  });

  it("una contraseña incorrecta no da acceso", async () => {
    const { error } = await clienteAnonimo().auth.signInWithPassword({
      email: ADMIN_PRUEBAS.email,
      password: "incorrecta-123",
    });
    expect(error).not.toBeNull();
  });
});
