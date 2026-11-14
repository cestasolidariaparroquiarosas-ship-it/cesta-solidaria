import { formatearFecha } from "@/lib/fechas";
import { NOMBRE_ESTADO, type Colaborador } from "@/lib/dominio/colaboradores";

const COLOR_ESTADO: Record<Colaborador["estado"], string> = {
  activo: "bg-emerald-100 text-emerald-900",
  pausado: "bg-amber-100 text-amber-900",
  baja: "bg-stone-200 text-stone-700",
};

export function EtiquetaEstado({ colaborador }: { colaborador: Pick<Colaborador, "estado" | "pausado_hasta"> }) {
  const { estado, pausado_hasta } = colaborador;
  const texto =
    estado === "pausado"
      ? pausado_hasta
        ? `En pausa hasta el ${formatearFecha(pausado_hasta)}`
        : "En pausa (sin fecha de vuelta)"
      : NOMBRE_ESTADO[estado];
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_ESTADO[estado]}`}>
      {texto}
    </span>
  );
}
