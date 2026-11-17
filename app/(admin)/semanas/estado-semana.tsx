import { NOMBRE_ESTADO_SEMANA, type EstadoSemana } from "@/lib/dominio/semanas";
import { Etiqueta, type Tono } from "../_ui/etiqueta";

const TONO: Record<EstadoSemana, Tono> = {
  borrador: "ambar",
  enviada: "azul",
  cerrada: "gris",
};

export function EstadoSemanaEtiqueta({ estado }: { estado: EstadoSemana }) {
  return <Etiqueta tono={TONO[estado]}>{NOMBRE_ESTADO_SEMANA[estado]}</Etiqueta>;
}
