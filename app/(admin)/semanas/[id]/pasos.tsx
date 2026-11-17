import type { PasoSemana } from "@/lib/dominio/semanas";
import { IconoCheck } from "../../_ui/iconos";

const NOMBRE: Record<PasoSemana["clave"], string> = {
  datos: "1. Datos",
  cestas: "2. Cestas",
  reparto: "3. Reparto",
  envio: "4. Envío y respuestas",
};

/**
 * Barra de pasos del detalle de semana (spec 0003 §3, P1, CA-0302). Cada paso enlaza a
 * su sección; los hechos llevan una marca y el actual, aria-current="step".
 */
export function PasosSemana({ pasos, resumen }: { pasos: PasoSemana[]; resumen: Record<PasoSemana["clave"], string> }) {
  return (
    <ol
      aria-label="Pasos de la semana"
      className="grid grid-cols-2 gap-1 rounded-xl border border-stone-300 bg-white p-2 shadow-sm sm:grid-cols-4"
    >
      {pasos.map((p, i) => (
        <li key={p.clave}>
          <a
            href={`#${p.clave}`}
            aria-current={p.actual ? "step" : undefined}
            className={`flex h-full items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-stone-100 ${
              p.actual ? "bg-emerald-50 ring-2 ring-emerald-700" : ""
            }`}
          >
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${
                p.hecho
                  ? "bg-emerald-700 text-white"
                  : p.actual
                    ? "border-2 border-emerald-700 bg-white text-emerald-800"
                    : "border-2 border-stone-300 bg-white text-stone-600"
              }`}
            >
              {p.hecho ? <IconoCheck className="size-4" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className={`block text-[15px] ${p.actual ? "font-bold" : "font-semibold"}`}>
                {NOMBRE[p.clave]}
                {p.hecho && <span className="sr-only"> (hecho)</span>}
              </span>
              <span className={`block text-sm ${p.actual ? "text-emerald-900" : "text-stone-600"}`}>
                {resumen[p.clave]}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ol>
  );
}
