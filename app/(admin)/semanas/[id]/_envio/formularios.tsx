"use client";

import { useActionState } from "react";
import { Casilla, ErrorGeneral } from "../../../_ui/campos";
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO } from "../../../_ui/estilos";
import type { EstadoEnvio } from "./acciones";

type Accion = (estado: EstadoEnvio, formData: FormData) => Promise<EstadoEnvio>;

/** R4.1: enviar la semana, con confirmación. */
export function FormularioEnviar({ accion, colaboradores }: { accion: Accion; colaboradores: number }) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  return (
    <form action={enviar} className="flex flex-col gap-3">
      <Casilla
        nombre="confirmar"
        texto={`Quiero enviar el correo a ${colaboradores === 1 ? "1 colaborador" : `los ${colaboradores} colaboradores`}. Después ya no se pueden cambiar las cestas ni el reparto.`}
      />
      <ErrorGeneral estado={estado} />
      <div>
        <button type="submit" disabled={enviando} className={BOTON_PRINCIPAL}>
          {enviando ? "Enviando…" : "Enviar los correos"}
        </button>
      </div>
    </form>
  );
}

/** Un botón que lanza una acción sin datos (reenviar, buscar sustituto). */
export function BotonAccion({
  accion,
  texto,
  textoEnviando,
  etiqueta,
}: {
  accion: () => Promise<EstadoEnvio>;
  texto: string;
  textoEnviando: string;
  /** Nombre accesible del botón, si el texto no basta para distinguirlo. */
  etiqueta?: string;
}) {
  const [estado, enviar, enviando] = useActionState(async () => accion(), {});
  return (
    <form action={enviar} className="flex flex-col gap-2">
      <div>
        <button type="submit" disabled={enviando} className={BOTON_SECUNDARIO} aria-label={etiqueta}>
          {enviando ? textoEnviando : texto}
        </button>
      </div>
      <ErrorGeneral estado={estado} />
    </form>
  );
}

/** Cerrar la semana, con confirmación. */
export function FormularioCerrar({ accion }: { accion: Accion }) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  return (
    <form action={enviar} className="flex flex-col gap-3">
      <Casilla
        nombre="confirmar"
        texto="Quiero cerrar la semana. Quien siga sin responder quedará como «sin respuesta», y la semana pasará al histórico."
      />
      <ErrorGeneral estado={estado} />
      <div>
        <button type="submit" disabled={enviando} className={BOTON_SECUNDARIO}>
          {enviando ? "Cerrando…" : "Cerrar la semana"}
        </button>
      </div>
    </form>
  );
}
