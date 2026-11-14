"use client";

import { useActionState } from "react";
import { iniciarSesion, type EstadoLogin } from "./acciones";

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
          className="rounded-md border border-stone-300 px-3 py-2 text-base font-normal"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Contraseña
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-md border border-stone-300 px-3 py-2 text-base font-normal"
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
        className="rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
