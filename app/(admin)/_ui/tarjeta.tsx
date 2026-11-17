import type { ReactNode } from "react";

/**
 * Tarjeta blanca con franja de cabecera (spec 0003 §2). `extra` va a la derecha del
 * título (un total, un botón). Sin `cuerpo`, los hijos van de borde a borde (listas).
 */
export function Tarjeta({
  titulo,
  extra,
  id,
  peligro = false,
  cuerpo = true,
  etiqueta,
  children,
}: {
  titulo?: ReactNode;
  extra?: ReactNode;
  id?: string;
  peligro?: boolean;
  cuerpo?: boolean;
  /** aria-label de la sección cuando no tiene título visible. */
  etiqueta?: string;
  children?: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-label={etiqueta}
      className={`scroll-mt-4 overflow-hidden rounded-xl border bg-white shadow-sm ${peligro ? "border-red-200" : "border-stone-300"}`}
    >
      {(titulo || extra) && (
        <div
          className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-4 py-3 ${
            peligro ? "border-red-200 bg-red-50" : "border-stone-300 bg-stone-100"
          }`}
        >
          {titulo && <h2 className="min-w-0 break-words text-lg font-bold">{titulo}</h2>}
          {extra}
        </div>
      )}
      {cuerpo ? <div className="flex flex-col gap-3 p-4">{children}</div> : children}
    </section>
  );
}

/** Cabecera de columnas de una lista en tarjeta: solo se ve desde 640 px. */
export function CabeceraColumnas({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="hidden border-b border-stone-300 bg-stone-100 px-4 py-2 text-xs font-bold tracking-wide text-stone-700 uppercase sm:flex sm:gap-4"
    >
      {children}
    </div>
  );
}
