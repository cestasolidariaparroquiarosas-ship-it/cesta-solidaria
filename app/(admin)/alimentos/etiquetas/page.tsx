import type { Metadata } from "next";
import { requerirAdmin } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { listarEtiquetas } from "@/lib/servicios/catalogo";
import { crearEtiquetaAccion, eliminarEtiquetaAccion, renombrarEtiquetaAccion } from "../acciones";
import { FilaEtiqueta, FormularioEtiqueta } from "../formularios";
import { Aviso, Volver } from "../../_ui/aviso";

export const metadata: Metadata = { title: "Etiquetas · Cesta solidaria" };

const AVISOS = {
  creada: "Etiqueta añadida.",
  guardada: "Etiqueta guardada.",
  eliminada: "Etiqueta eliminada.",
};

export default async function PaginaEtiquetas({ searchParams }: PageProps<"/alimentos/etiquetas">) {
  await requerirAdmin();
  const { aviso } = await searchParams;
  const etiquetas = await listarEtiquetas(await crearClienteServidor());

  return (
    <section className="flex max-w-xl flex-col gap-4">
      <Volver href="/alimentos" texto="Alimentos" />
      <h1 className="text-3xl font-bold">Etiquetas de exclusión</h1>
      <p className="text-sm text-stone-600">
        Sirven para dos cosas: en cada alimento se marca lo que <strong>contiene</strong>, y en cada
        cesta lo que la familia <strong>no puede tomar</strong>. Son restricciones alimentarias,
        nunca religión ni salud.
      </p>
      <Aviso clave={aviso} textos={AVISOS} />

      {!etiquetas.ok ? (
        <p role="alert" className="text-red-700">
          No se han podido cargar las etiquetas. Recarga la página.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-300 bg-white shadow-sm [&>li:nth-child(even)]:bg-stone-50">
          {etiquetas.valor.map((e) => (
            <FilaEtiqueta
              key={`${e.id}|${e.nombre}`}
              etiqueta={e}
              alimentos={e.alimentos}
              renombrar={renombrarEtiquetaAccion.bind(null, e.id)}
              eliminar={eliminarEtiquetaAccion.bind(null, e.id)}
            />
          ))}
        </ul>
      )}

      <div className="rounded-xl border border-stone-300 bg-white p-4 shadow-sm">
        <FormularioEtiqueta accion={crearEtiquetaAccion} />
      </div>
    </section>
  );
}
