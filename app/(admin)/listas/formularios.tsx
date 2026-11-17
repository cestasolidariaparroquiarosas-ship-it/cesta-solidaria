"use client";

import { useActionState } from "react";
import { LIMITES_CATALOGO, formatearCantidad } from "@/lib/dominio/catalogo";
import type { ItemConAlimento } from "@/lib/servicios/catalogo";
import { Campo, Casilla, ErrorGeneral } from "../_ui/campos";
import { BOTON_PELIGRO, BOTON_PRINCIPAL, BOTON_SECUNDARIO, ENTRADA } from "../_ui/estilos";
import type { EstadoLista } from "./acciones";
import { Etiqueta } from "../_ui/etiqueta";

type Accion = (estado: EstadoLista, formData: FormData) => Promise<EstadoLista>;

const CANTIDAD = `${ENTRADA} w-24`;

export function FormularioNombreLista({
  accion,
  nombre,
  etiqueta,
  textoBoton,
}: {
  accion: Accion;
  nombre?: string;
  etiqueta: string;
  textoBoton: string;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  return (
    <form action={enviar} className="flex flex-col gap-3" noValidate>
      <Campo etiqueta={etiqueta} error={estado.errores?.nombre}>
        {(props) => (
          <input
            {...props}
            name="nombre"
            defaultValue={estado.valores?.nombre ?? nombre}
            maxLength={LIMITES_CATALOGO.nombreLista}
            autoComplete="off"
            className={`${ENTRADA} max-w-sm`}
          />
        )}
      </Campo>
      <ErrorGeneral estado={estado} destacar="nombre" />
      <div>
        <button type="submit" disabled={enviando} className={BOTON_PRINCIPAL}>
          {textoBoton}
        </button>
      </div>
    </form>
  );
}

export function BotonLista({ accion, texto }: { accion: Accion; texto: string }) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  return (
    <form action={enviar} className="flex flex-col gap-2">
      <div>
        <button type="submit" disabled={enviando} className={BOTON_SECUNDARIO}>
          {texto}
        </button>
      </div>
      <ErrorGeneral estado={estado} />
    </form>
  );
}

export function FormularioEliminarLista({ accion }: { accion: Accion }) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  return (
    <form action={enviar} className="flex flex-col gap-3">
      <Casilla nombre="confirmar" texto="Quiero eliminar esta lista y sus cantidades." />
      <ErrorGeneral estado={estado} />
      <div>
        <button type="submit" disabled={enviando} className={BOTON_PELIGRO}>
          Eliminar lista
        </button>
      </div>
    </form>
  );
}

/** Añadir un alimento del catálogo con sus cantidades al mes. */
export function FormularioAnadir({
  accion,
  alimentos,
}: {
  accion: Accion;
  alimentos: { id: string; nombre: string; unidad: string }[];
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const errores = estado.errores ?? {};
  const v = estado.valores ?? {};
  if (alimentos.length === 0) {
    return <p className="text-sm text-stone-600">Ya están todos los alimentos activos del catálogo.</p>;
  }
  return (
    <form action={enviar} className="flex flex-col gap-3" noValidate>
      <Campo etiqueta="Alimento" error={errores.alimento_id}>
        {(props) => (
          <select {...props} name="alimento_id" defaultValue={v.alimento_id ?? ""} className={`${ENTRADA} max-w-full`}>
            <option value="">Elige un alimento…</option>
            {alimentos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre} ({a.unidad})
              </option>
            ))}
          </select>
        )}
      </Campo>
      <div className="flex flex-wrap gap-4">
        <Campo etiqueta="Por adulto al mes" error={errores.cantidad_por_adulto}>
          {(props) => (
            <input
              {...props}
              name="cantidad_por_adulto"
              defaultValue={v.cantidad_por_adulto ?? ""}
              inputMode="decimal"
              placeholder="0"
              className={CANTIDAD}
            />
          )}
        </Campo>
        <Campo etiqueta="Por niño al mes" error={errores.cantidad_por_nino}>
          {(props) => (
            <input
              {...props}
              name="cantidad_por_nino"
              defaultValue={v.cantidad_por_nino ?? ""}
              inputMode="decimal"
              placeholder="0"
              className={CANTIDAD}
            />
          )}
        </Campo>
      </div>
      <ErrorGeneral estado={estado} destacar="alimento_id" />
      <div>
        <button type="submit" disabled={enviando} className={BOTON_PRINCIPAL}>
          Añadir a la lista
        </button>
      </div>
    </form>
  );
}

/** Un alimento de la lista: cambiar sus cantidades o quitarlo. */
export function FilaItem({
  item,
  guardar,
  quitar,
}: {
  item: ItemConAlimento;
  guardar: Accion;
  quitar: Accion;
}) {
  const [estado, enviar, guardando] = useActionState(guardar, {});
  const [estadoQuitar, enviarQuitar, quitando] = useActionState(quitar, {});
  const errores = estado.errores ?? {};
  const v = estado.valores ?? {
    cantidad_por_adulto: formatearCantidad(item.cantidad_por_adulto),
    cantidad_por_nino: formatearCantidad(item.cantidad_por_nino),
  };
  const nombre = `${item.alimento.nombre} (${item.alimento.unidad})`;

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <p className="font-medium">
        {nombre}
        {!item.alimento.activo && (
          <span className="ml-2">
            <Etiqueta tono="ambar">Desactivado: no se propondrá</Etiqueta>
          </span>
        )}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <form action={enviar} className="flex flex-wrap items-end gap-3" noValidate aria-label={`Cantidades de ${nombre}`}>
          <Campo etiqueta="Por adulto" error={errores.cantidad_por_adulto}>
            {(props) => (
              <input {...props} name="cantidad_por_adulto" defaultValue={v.cantidad_por_adulto} inputMode="decimal" className={CANTIDAD} />
            )}
          </Campo>
          <Campo etiqueta="Por niño" error={errores.cantidad_por_nino}>
            {(props) => (
              <input {...props} name="cantidad_por_nino" defaultValue={v.cantidad_por_nino} inputMode="decimal" className={CANTIDAD} />
            )}
          </Campo>
          <button type="submit" disabled={guardando} className={BOTON_SECUNDARIO} aria-label={`Guardar cantidades de ${nombre}`}>
            Guardar
          </button>
        </form>
        <form action={enviarQuitar}>
          <button type="submit" disabled={quitando} className={BOTON_SECUNDARIO} aria-label={`Quitar ${nombre}`}>
            Quitar
          </button>
        </form>
      </div>
      <ErrorGeneral estado={estado} />
      <ErrorGeneral estado={estadoQuitar} />
    </li>
  );
}
