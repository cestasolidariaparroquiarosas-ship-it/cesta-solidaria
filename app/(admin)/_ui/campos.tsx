"use client";

// Piezas de formulario compartidas por las pantallas de gestión.
// La etiqueta solo contiene el nombre del campo; la ayuda y el error van fuera y se
// enlazan con aria-describedby, para que el lector de pantalla no los lea dos veces.

import { useId, type ReactNode } from "react";
import { ETIQUETA } from "./estilos";

/** Lo mínimo que devuelve una acción de servidor con useActionState. */
export type EstadoConErrores = { error?: string; errores?: Partial<Record<string, string>> };

function describir(...ids: (string | false | undefined)[]) {
  return ids.filter(Boolean).join(" ") || undefined;
}

export type PropsEntrada = { id: string; "aria-invalid": boolean; "aria-describedby"?: string };

export function Campo({
  etiqueta,
  ayuda,
  error,
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  error?: string;
  children: (props: PropsEntrada) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={ETIQUETA}>
        {etiqueta}
      </label>
      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": describir(ayuda && `${id}-ayuda`, error && `${id}-error`),
      })}
      {ayuda && (
        <p id={`${id}-ayuda`} className="text-xs text-stone-500">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

/** Casilla con su texto y, si lo hay, su error. */
export function Casilla({
  nombre,
  texto,
  error,
  marcada,
  valor = "si",
}: {
  nombre: string;
  texto: ReactNode;
  error?: string;
  marcada?: boolean;
  valor?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-2 text-sm">
        <input
          id={id}
          type="checkbox"
          name={nombre}
          value={valor}
          defaultChecked={marcada}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-1 size-4 shrink-0"
        />
        <label htmlFor={id}>{texto}</label>
      </div>
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Error del formulario, con role="alert" para que se anuncie al aparecer. Si solo hay
 * un error de campo y es `destacar` (p. ej., un nombre repetido, que no se ve venir),
 * se repite aquí; si hay más, basta con un resumen.
 */
export function ErrorGeneral({ estado, destacar }: { estado: EstadoConErrores; destacar?: string }) {
  const errores = estado.errores ?? {};
  const claves = Object.keys(errores);
  const texto =
    estado.error ??
    (destacar && claves.length === 1 && errores[destacar]
      ? errores[destacar]
      : claves.length
        ? "Revisa los campos marcados."
        : undefined);
  if (!texto) return null;
  return (
    <p role="alert" className="text-sm font-medium text-red-700">
      {texto}
    </p>
  );
}
