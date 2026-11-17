import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requerirAdmin } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { listarAlimentos, obtenerLista } from "@/lib/servicios/catalogo";
import {
  anadirAlimentoAccion,
  cambiarCantidadesAccion,
  eliminarListaAccion,
  marcarPredeterminadaAccion,
  quitarAlimentoAccion,
  renombrarListaAccion,
} from "../acciones";
import { BotonLista, FilaItem, FormularioAnadir, FormularioEliminarLista, FormularioNombreLista } from "../formularios";
import { Aviso, Volver } from "../../_ui/aviso";
import { Etiqueta } from "../../_ui/etiqueta";

export const metadata: Metadata = { title: "Lista base · Cesta solidaria" };

const AVISOS = {
  creada: "Lista creada. Ahora añade sus alimentos.",
  guardada: "Nombre guardado.",
  predeterminada: "Ahora es la lista predeterminada.",
  anadido: "Alimento añadido.",
  cantidades: "Cantidades guardadas.",
  quitado: "Alimento quitado de la lista.",
};

export default async function PaginaLista({ params, searchParams }: PageProps<"/listas/[id]">) {
  await requerirAdmin();
  const { id } = await params;
  const { aviso } = await searchParams;

  const cliente = await crearClienteServidor();
  const [lista, alimentos] = await Promise.all([obtenerLista(cliente, id), listarAlimentos(cliente)]);
  if (!lista.ok) {
    if (lista.error === "no_encontrado") notFound();
    throw new Error("No se ha podido cargar la lista");
  }
  if (!alimentos.ok) throw new Error("No se ha podido cargar el catálogo");
  const l = lista.valor;
  const yaEnLista = new Set(l.items.map((i) => i.alimento_id));
  const disponibles = alimentos.valor.filter((a) => !yaEnLista.has(a.id));

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Volver href="/listas" texto="Listas base" />
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="break-words text-3xl font-bold">{l.nombre}</h1>
        {l.predeterminada && (
          <Etiqueta tono="verde">Predeterminada</Etiqueta>
        )}
      </div>
      <Aviso clave={aviso} textos={AVISOS} />

      <section className="overflow-hidden rounded-xl border border-stone-300 bg-white shadow-sm">
        <h2 className="border-b border-stone-300 bg-stone-100 px-4 py-3 text-lg font-bold">Alimentos y cantidades al mes</h2>
        <div className="flex flex-col gap-3 p-4">
          <p className="text-sm text-stone-600">
            La cesta de una familia lleva, de cada alimento, adultos × cantidad por adulto + niños ×
            cantidad por niño, redondeado hacia arriba. Se aceptan decimales: 0,5 por adulto son 2
            unidades para 3 adultos.
          </p>
          {l.items.length === 0 ? (
            <p className="text-sm text-stone-600">Todavía no tiene alimentos.</p>
          ) : (
            <ul className="-mx-4 flex flex-col divide-y divide-stone-200 border-y border-stone-200">
              {l.items.map((item) => (
                <FilaItem
                  key={`${item.id}|${item.cantidad_por_adulto}|${item.cantidad_por_nino}`}
                  item={item}
                  guardar={cambiarCantidadesAccion.bind(null, l.id, item.id)}
                  quitar={quitarAlimentoAccion.bind(null, l.id, item.id)}
                />
              ))}
            </ul>
          )}
          <h3 className="mt-2 font-medium">Añadir un alimento</h3>
          <FormularioAnadir
            key={l.items.length}
            accion={anadirAlimentoAccion.bind(null, l.id)}
            alimentos={disponibles.map((a) => ({ id: a.id, nombre: a.nombre, unidad: a.unidad }))}
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-stone-300 bg-white shadow-sm">
        <h2 className="border-b border-stone-300 bg-stone-100 px-4 py-3 text-lg font-bold">Ajustes de la lista</h2>
        <div className="flex flex-col gap-3 p-4">
          <FormularioNombreLista
            key={l.nombre}
            accion={renombrarListaAccion.bind(null, l.id)}
            nombre={l.nombre}
            etiqueta="Nombre"
            textoBoton="Guardar nombre"
          />
          {!l.predeterminada && (
            <BotonLista accion={marcarPredeterminadaAccion.bind(null, l.id)} texto="Marcar como predeterminada" />
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-stone-300 bg-white shadow-sm">
        <h2 className="border-b border-stone-300 bg-stone-100 px-4 py-3 text-lg font-bold">Eliminar</h2>
        <div className="flex flex-col gap-3 p-4">
          <p className="text-sm text-stone-600">
            Las cestas que ya se prepararon con esta lista no cambian: conservan sus alimentos.
          </p>
          <FormularioEliminarLista accion={eliminarListaAccion.bind(null, l.id)} />
        </div>
      </section>
    </div>
  );
}
