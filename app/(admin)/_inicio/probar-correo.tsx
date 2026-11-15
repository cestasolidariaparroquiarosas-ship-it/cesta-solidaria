"use client";

import { useActionState } from "react";
import { ErrorGeneral } from "../_ui/campos";
import { BOTON_SECUNDARIO } from "../_ui/estilos";
import { probarCorreoAccion, type EstadoPrueba } from "./acciones";

export function ProbarCorreo() {
  const [estado, enviar, enviando] = useActionState<EstadoPrueba>(async () => probarCorreoAccion(), {});
  return (
    <form action={enviar} className="flex flex-col gap-2">
      <div>
        <button type="submit" disabled={enviando} className={BOTON_SECUNDARIO}>
          {enviando ? "Enviando…" : "Enviar un correo de prueba"}
        </button>
      </div>
      {estado.ok && (
        <p role="status" className="text-sm text-emerald-900">
          Correo de prueba enviado. Debería llegarte en un momento al correo del administrador.
        </p>
      )}
      <ErrorGeneral estado={estado} />
    </form>
  );
}
