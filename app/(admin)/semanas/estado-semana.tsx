import { NOMBRE_ESTADO_SEMANA, type EstadoSemana } from "@/lib/dominio/semanas";

const COLORES: Record<EstadoSemana, string> = {
  borrador: "bg-amber-100 text-amber-900",
  enviada: "bg-sky-100 text-sky-900",
  cerrada: "bg-stone-200 text-stone-800",
};

export function EstadoSemanaEtiqueta({ estado }: { estado: EstadoSemana }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COLORES[estado]}`}>
      {NOMBRE_ESTADO_SEMANA[estado]}
    </span>
  );
}
