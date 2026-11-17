import type { ReactNode } from "react";

// Pastilla de estado (spec 0003 §2). El estado siempre va escrito: el color no va solo.
export type Tono = "verde" | "ambar" | "rosa" | "azul" | "gris";

const TONOS: Record<Tono, { fondo: string; punto: string }> = {
  verde: { fondo: "bg-emerald-100 text-emerald-900", punto: "bg-emerald-600" },
  ambar: { fondo: "bg-amber-100 text-amber-900", punto: "bg-amber-600" },
  rosa: { fondo: "bg-rose-100 text-rose-900", punto: "bg-rose-600" },
  azul: { fondo: "bg-sky-100 text-sky-900", punto: "bg-sky-600" },
  gris: { fondo: "bg-stone-200 text-stone-800", punto: "bg-stone-500" },
};

export function Etiqueta({ tono, children }: { tono: Tono; children: ReactNode }) {
  const t = TONOS[tono];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${t.fondo}`}
    >
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${t.punto}`} />
      {children}
    </span>
  );
}
