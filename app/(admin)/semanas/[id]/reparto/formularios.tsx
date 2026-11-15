"use client";

import { useActionState } from "react";
import { Campo, Casilla, ErrorGeneral } from "../../../_ui/campos";
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO, ENTRADA } from "../../../_ui/estilos";
import type { EstadoReparto } from "./acciones";

type Accion = (estado: EstadoReparto, formData: FormData) => Promise<EstadoReparto>;

/**
 * Proponer el reparto. Si ya hay uno, pide confirmación porque se pierden los cambios
 * hechos a mano; si no, la confirmación va oculta.
 */
export function FormularioProponer({ accion, hayReparto }: { accion: Accion; hayReparto: boolean }) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  return (
    <form action={enviar} className="flex flex-col gap-3">
      {hayReparto ? (
        <Casilla nombre="confirmar" texto="Quiero sustituir el reparto actual y perder los cambios hechos a mano." />
      ) : (
        <input type="hidden" name="confirmar" value="si" />
      )}
      <ErrorGeneral estado={estado} />
      <div>
        <button type="submit" disabled={enviando} className={hayReparto ? BOTON_SECUNDARIO : BOTON_PRINCIPAL}>
          {enviando ? "Calculando…" : hayReparto ? "Volver a proponer el reparto" : "Proponer reparto"}
        </button>
      </div>
    </form>
  );
}

/** R3.5: mover unidades de un alimento a otro colaborador. */
export function FormularioMover({
  accion,
  nombre,
  cantidad,
  destinos,
}: {
  accion: Accion;
  /** "Arroz (paquete 1 kg) de Ana", para que cada formulario tenga un nombre accesible distinto. */
  nombre: string;
  cantidad: number;
  destinos: { id: string; nombre: string }[];
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const errores = estado.errores ?? {};
  const v = estado.valores;
  return (
    <form
      action={enviar}
      className="flex flex-wrap items-end gap-3 pt-2"
      noValidate
      aria-label={`Mover ${nombre}`}
    >
      <Campo etiqueta="Unidades" error={errores.cantidad}>
        {(props) => (
          <input
            {...props}
            name="cantidad"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={v?.cantidad ?? String(cantidad)}
            className={`${ENTRADA} w-20`}
          />
        )}
      </Campo>
      {/* min-w-0 y w-full: con nombres largos, el desplegable se recorta en vez de
          ensanchar la pantalla del móvil (CA-28). */}
      <div className="min-w-0 flex-1 basis-48">
        <Campo etiqueta="A quién" error={errores.destino}>
          {(props) => (
            <select {...props} name="destino" defaultValue={v?.destino ?? ""} className={`${ENTRADA} w-full`}>
              <option value="">Elige…</option>
              {destinos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
          )}
        </Campo>
      </div>
      <button type="submit" disabled={enviando} className={BOTON_SECUNDARIO}>
        Mover
      </button>
      <div className="basis-full">
        <ErrorGeneral estado={estado} />
      </div>
    </form>
  );
}

/** R3.5: cambiar el colaborador de una asignación por otro candidato. */
export function FormularioCambiarColaborador({
  accion,
  nombre,
  candidatos,
}: {
  accion: Accion;
  nombre: string;
  /** En el orden de R2.4, con la última participación ya en el texto. */
  candidatos: { id: string; texto: string }[];
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const errores = estado.errores ?? {};
  if (candidatos.length === 0) {
    return <p className="pt-2 text-sm text-stone-600">No queda ningún otro colaborador disponible.</p>;
  }
  return (
    <form
      action={enviar}
      className="flex flex-wrap items-end gap-3 pt-2"
      noValidate
      aria-label={`Cambiar a ${nombre}`}
    >
      <div className="w-full min-w-0">
        <Campo etiqueta="Nuevo colaborador" error={errores.colaborador_id}>
          {(props) => (
            <select
              {...props}
              name="colaborador_id"
              defaultValue={estado.valores?.colaborador_id ?? ""}
              className={`${ENTRADA} w-full`}
            >
              <option value="">Elige…</option>
              {candidatos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.texto}
                </option>
              ))}
            </select>
          )}
        </Campo>
      </div>
      <button type="submit" disabled={enviando} className={BOTON_SECUNDARIO}>
        Cambiar
      </button>
      <div className="basis-full">
        <ErrorGeneral estado={estado} />
      </div>
    </form>
  );
}
