"use client";

import { useActionState } from "react";
import { LIMITES_CATALOGO, formatearCantidad, type Alimento, type Etiqueta } from "@/lib/dominio/catalogo";
import { Campo, Casilla, ErrorGeneral } from "../_ui/campos";
import { BOTON_PELIGRO, BOTON_PRINCIPAL, BOTON_SECUNDARIO, ENTRADA } from "../_ui/estilos";
import type { EstadoAccion } from "./acciones";

type Accion = (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;

/** Alta y edición de un alimento con sus etiquetas ("contiene..."). */
export function FormularioAlimento({
  accion,
  alimento,
  etiquetas,
  textoBoton,
}: {
  accion: Accion;
  alimento?: Alimento;
  etiquetas: Etiqueta[];
  textoBoton: string;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const errores = estado.errores ?? {};
  const v = estado.valores ?? {
    nombre: alimento?.nombre ?? "",
    unidad: alimento?.unidad ?? "",
    precio_aprox: alimento ? formatearCantidad(alimento.precio_aprox) : "",
    activo: alimento?.activo ?? true,
    etiquetas: alimento?.etiquetas ?? [],
  };

  return (
    <form action={enviar} className="flex flex-col gap-4" noValidate>
      <Campo etiqueta="Nombre" error={errores.nombre}>
        {(props) => (
          <input
            {...props}
            name="nombre"
            defaultValue={v.nombre}
            maxLength={LIMITES_CATALOGO.nombreAlimento}
            autoComplete="off"
            className={ENTRADA}
          />
        )}
      </Campo>
      <Campo
        etiqueta="Unidad"
        ayuda="Cómo se compra: paquete 1 kg, litro, lata 400 g... Las cestas ya creadas conservan la unidad que tenían."
        error={errores.unidad}
      >
        {(props) => (
          <input
            {...props}
            name="unidad"
            defaultValue={v.unidad}
            maxLength={LIMITES_CATALOGO.unidad}
            autoComplete="off"
            className={ENTRADA}
          />
        )}
      </Campo>
      <Campo
        etiqueta="Precio aproximado (€)"
        ayuda="Por unidad. Sirve para repartir el gasto entre colaboradores. Las cestas ya creadas conservan el precio que tenían."
        error={errores.precio_aprox}
      >
        {(props) => (
          <input
            {...props}
            name="precio_aprox"
            defaultValue={v.precio_aprox}
            inputMode="decimal"
            autoComplete="off"
            className={`${ENTRADA} max-w-40`}
          />
        )}
      </Campo>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Contiene</legend>
        <p className="text-xs text-stone-500">
          Marca lo que contiene. Al proponer o completar una cesta &quot;sin cerdo&quot;, no se podrán
          añadir alimentos marcados con &quot;cerdo&quot;.
        </p>
        {etiquetas.length === 0 ? (
          <p className="text-sm text-stone-600">No hay etiquetas. Créalas en la pantalla de etiquetas.</p>
        ) : (
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {etiquetas.map((e) => (
              <Casilla
                key={e.id}
                nombre="etiquetas"
                valor={e.id}
                texto={e.nombre}
                marcada={v.etiquetas?.includes(e.id)}
              />
            ))}
          </div>
        )}
      </fieldset>
      {alimento && (
        <Casilla
          nombre="activo"
          texto="Activo: se puede añadir a las cestas. Desmárcalo si ya no se usa."
          marcada={v.activo}
        />
      )}
      <ErrorGeneral estado={estado} destacar="nombre" />
      <div>
        <button type="submit" disabled={enviando} className={BOTON_PRINCIPAL}>
          {enviando ? "Guardando…" : textoBoton}
        </button>
      </div>
    </form>
  );
}

/** Formulario con una casilla de confirmación y un botón rojo. */
export function FormularioEliminar({ accion, texto }: { accion: Accion; texto: string }) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  return (
    <form action={enviar} className="flex flex-col gap-3">
      <Casilla nombre="confirmar" texto={texto} />
      <ErrorGeneral estado={estado} />
      <div>
        <button type="submit" disabled={enviando} className={BOTON_PELIGRO}>
          Eliminar
        </button>
      </div>
    </form>
  );
}

/** Alta de una etiqueta de exclusión. */
export function FormularioEtiqueta({ accion }: { accion: Accion }) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  return (
    <form action={enviar} className="flex flex-col gap-3" noValidate>
      <Campo
        etiqueta="Nueva etiqueta"
        ayuda="Lo que se excluye, en minúsculas: «soja», «marisco»... Nunca religión ni salud."
        error={estado.errores?.nombre}
      >
        {(props) => (
          <input
            {...props}
            name="nombre"
            defaultValue={estado.valores?.nombre}
            maxLength={LIMITES_CATALOGO.nombreEtiqueta}
            autoComplete="off"
            className={`${ENTRADA} max-w-xs`}
          />
        )}
      </Campo>
      <ErrorGeneral estado={estado} destacar="nombre" />
      <div>
        <button type="submit" disabled={enviando} className={BOTON_PRINCIPAL}>
          Añadir etiqueta
        </button>
      </div>
    </form>
  );
}

/** Una etiqueta existente: cambiar el nombre o eliminarla. */
export function FilaEtiqueta({
  etiqueta,
  alimentos,
  renombrar,
  eliminar,
}: {
  etiqueta: Etiqueta;
  alimentos: number;
  renombrar: Accion;
  eliminar: Accion;
}) {
  const [estadoNombre, enviarNombre, guardando] = useActionState(renombrar, {});
  const [estadoBorrar, enviarBorrar, borrando] = useActionState(eliminar, {});
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-end gap-2">
        <form action={enviarNombre} className="flex min-w-0 flex-1 flex-wrap items-end gap-2" noValidate>
          <Campo etiqueta={`Etiqueta «${etiqueta.nombre}»`} error={estadoNombre.errores?.nombre}>
            {(props) => (
              <input
                {...props}
                name="nombre"
                defaultValue={estadoNombre.valores?.nombre ?? etiqueta.nombre}
                maxLength={LIMITES_CATALOGO.nombreEtiqueta}
                autoComplete="off"
                className={`${ENTRADA} w-48`}
              />
            )}
          </Campo>
          <button
            type="submit"
            disabled={guardando}
            className={BOTON_SECUNDARIO}
            aria-label={`Guardar etiqueta «${etiqueta.nombre}»`}
          >
            Guardar
          </button>
        </form>
        {alimentos === 0 && (
          <form action={enviarBorrar} className="flex items-center gap-2">
            <Casilla nombre="confirmar" texto="Confirmar" />
            <button
              type="submit"
              disabled={borrando}
              className={BOTON_SECUNDARIO}
              aria-label={`Eliminar etiqueta «${etiqueta.nombre}»`}
            >
              Eliminar
            </button>
          </form>
        )}
      </div>
      <p className="text-xs text-stone-500">
        {alimentos === 0
          ? "Ningún alimento la lleva."
          : `La llevan ${alimentos} alimento${alimentos === 1 ? "" : "s"}: no se puede eliminar.`}
      </p>
      <ErrorGeneral estado={estadoNombre} />
      <ErrorGeneral estado={estadoBorrar} />
    </li>
  );
}
