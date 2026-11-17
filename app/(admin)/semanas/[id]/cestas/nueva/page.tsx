import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requerirAdmin } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { semanaEditable } from "@/lib/dominio/semanas";
import { formatearFecha } from "@/lib/fechas";
import { listarEtiquetas, listarListas } from "@/lib/servicios/catalogo";
import { tieneReparto } from "@/lib/servicios/reparto";
import { obtenerSemana } from "@/lib/servicios/semanas";
import { crearCestaAccion } from "../../../acciones";
import { FormularioCesta } from "../../../formularios";
import { Volver } from "../../../../_ui/aviso";

export const metadata: Metadata = { title: "Nueva cesta · Cesta solidaria" };

export default async function PaginaNuevaCesta({ params }: PageProps<"/semanas/[id]/cestas/nueva">) {
  await requerirAdmin();
  const { id } = await params;

  const cliente = await crearClienteServidor();
  const [semana, listas, etiquetas, hayReparto] = await Promise.all([
    obtenerSemana(cliente, id),
    listarListas(cliente),
    listarEtiquetas(cliente),
    tieneReparto(cliente, id),
  ]);
  if (!semana.ok) {
    if (semana.error === "no_encontrado") notFound();
    throw new Error("No se ha podido cargar la semana");
  }
  if (!listas.ok || !etiquetas.ok) throw new Error("No se ha podido cargar el catálogo");
  if (!semanaEditable(semana.valor)) redirect(`/semanas/${id}`);
  const predeterminada = listas.valor.find((l) => l.predeterminada);

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Volver href={`/semanas/${id}`} texto={`Entrega del ${formatearFecha(semana.valor.fecha_entrega)}`} />
      <h1 className="text-3xl font-bold">Nueva cesta</h1>
      <p className="text-sm text-stone-600">
        Con la lista base y el número de personas se propone qué lleva la cesta. Lo que choque con
        las exclusiones se quita, y después puedes cambiar lo que quieras.
      </p>
      {hayReparto && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Esta semana ya tiene un reparto propuesto. Si cambias los alimentos de las cestas, se descarta y habrá que
          volver a proponerlo.
        </p>
      )}
      <section className="rounded-xl border border-stone-300 bg-white p-4 shadow-sm">
        <FormularioCesta
          accion={crearCestaAccion.bind(null, id)}
          inicial={{
            identificador_receptor: "",
            adultos: "",
            ninos: "",
            lista_base_id: predeterminada?.id ?? "",
            exclusiones: [],
          }}
          listas={listas.valor}
          etiquetas={etiquetas.valor}
          textoBoton="Crear cesta"
        />
      </section>
    </div>
  );
}
