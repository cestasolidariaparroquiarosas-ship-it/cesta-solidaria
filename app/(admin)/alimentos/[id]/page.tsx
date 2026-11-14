import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requerirAdmin } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { listarEtiquetas, obtenerAlimento } from "@/lib/servicios/catalogo";
import { eliminarAlimentoAccion, guardarAlimentoAccion } from "../acciones";
import { FormularioAlimento, FormularioEliminar } from "../formularios";
import { Aviso, Volver } from "../../_ui/aviso";

export const metadata: Metadata = { title: "Alimento · Cesta solidaria" };

const AVISOS = { guardado: "Cambios guardados." };

export default async function PaginaAlimento({ params, searchParams }: PageProps<"/alimentos/[id]">) {
  await requerirAdmin();
  const { id } = await params;
  const { aviso } = await searchParams;

  const cliente = await crearClienteServidor();
  const [alimento, etiquetas] = await Promise.all([obtenerAlimento(cliente, id), listarEtiquetas(cliente)]);
  if (!alimento.ok) {
    if (alimento.error === "no_encontrado") notFound();
    throw new Error("No se ha podido cargar el alimento");
  }
  if (!etiquetas.ok) throw new Error("No se han podido cargar las etiquetas");
  const a = alimento.valor;

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Volver href="/alimentos" texto="Alimentos" />
      <h1 className="break-words text-2xl font-semibold">{a.nombre}</h1>
      <Aviso clave={aviso} textos={AVISOS} />

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        {/* key: tras guardar, el formulario se vuelve a montar con los datos nuevos. */}
        <FormularioAlimento
          key={`${a.nombre}|${a.unidad}|${a.precio_aprox}|${a.activo}|${a.etiquetas.join(",")}`}
          accion={guardarAlimentoAccion.bind(null, a.id)}
          alimento={a}
          etiquetas={etiquetas.valor}
          textoBoton="Guardar cambios"
        />
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Eliminar</h2>
        <p className="text-sm text-stone-600">
          Solo se puede eliminar si no está en ninguna lista base ni en ninguna cesta. Si ya se ha
          usado, desactívalo: dejará de proponerse y el histórico se conserva.
        </p>
        <FormularioEliminar
          accion={eliminarAlimentoAccion.bind(null, a.id)}
          texto="Quiero eliminar este alimento del catálogo."
        />
      </section>
    </div>
  );
}
