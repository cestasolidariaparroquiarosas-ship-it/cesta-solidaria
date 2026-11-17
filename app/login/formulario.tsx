"use client";

import { useActionState } from "react";
import { iniciarSesion, type EstadoLogin } from "./acciones";
import { BOTON_PRINCIPAL, ENTRADA } from "@/app/(admin)/_ui/estilos";

const estadoInicial: EstadoLogin = {};

export function FormularioLogin() {
  const [estado, accion, enviando] = useActionState(iniciarSesion, estadoInicial);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Correo electrónico
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          className={ENTRADA}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Contraseña
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={ENTRADA}
        />
      </label>
      {estado.error && (
        <p role="alert" className="text-sm text-red-700">
          {estado.error}
        </p>
      )}
      <button
        type="submit"
        disabled={enviando}
        className={BOTON_PRINCIPAL}
      >
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
