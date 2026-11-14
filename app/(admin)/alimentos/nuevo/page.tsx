import type { Metadata } from "next";
import { requerirAdmin } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { listarEtiquetas } from "@/lib/servicios/catalogo";
import { guardarAlimentoAccion } from "../acciones";
import { FormularioAlimento } from "../formularios";
import { Volver } from "../../_ui/aviso";

export const metadata: Metadata = { title: "Nuevo alimento · Cesta solidaria" };

export default async function PaginaNuevoAlimento() {
  await requerirAdmin();
  const etiquetas = await listarEtiquetas(await crearClienteServidor());
  if (!etiquetas.ok) throw new Error("No se han podido cargar las etiquetas");

  return (
    <section className="flex max-w-xl flex-col gap-4">
      <Volver href="/alimentos" texto="Alimentos" />
      <h1 className="text-2xl font-semibold">Nuevo alimento</h1>
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <FormularioAlimento
          accion={guardarAlimentoAccion.bind(null, null)}
          etiquetas={etiquetas.valor}
          textoBoton="Dar de alta"
        />
      </div>
    </section>
  );
}
