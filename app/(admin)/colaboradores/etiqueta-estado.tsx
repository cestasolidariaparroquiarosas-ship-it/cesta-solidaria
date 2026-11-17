import { formatearFecha } from "@/lib/fechas";
import { NOMBRE_ESTADO, type Colaborador } from "@/lib/dominio/colaboradores";
import { Etiqueta, type Tono } from "../_ui/etiqueta";

const TONO: Record<Colaborador["estado"], Tono> = {
  activo: "verde",
  pausado: "ambar",
  baja: "gris",
};

export function EtiquetaEstado({ colaborador }: { colaborador: Pick<Colaborador, "estado" | "pausado_hasta"> }) {
  const { estado, pausado_hasta } = colaborador;
  const texto =
    estado === "pausado"
      ? pausado_hasta
        ? `En pausa hasta el ${formatearFecha(pausado_hasta)}`
        : "En pausa (sin fecha de vuelta)"
      : NOMBRE_ESTADO[estado];
  return <Etiqueta tono={TONO[estado]}>{texto}</Etiqueta>;
}
