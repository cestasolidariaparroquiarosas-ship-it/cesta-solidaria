import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requerirAdmin } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formatearEuros, textoContiene } from "@/lib/dominio/catalogo";
import { choquesEnCesta, costeCesta, proponerCesta, textoSin, type Propuesta } from "@/lib/dominio/cesta";
import { semanaEditable } from "@/lib/dominio/semanas";
import { formatearFecha } from "@/lib/fechas";
import { listarAlimentos, listarEtiquetas, listarListas } from "@/lib/servicios/catalogo";
import { obtenerCesta, plantillaDeLista } from "@/lib/servicios/semanas";
import {
  anadirACestaAccion,
  cambiarCantidadAccion,
  editarCestaAccion,
  eliminarCestaAccion,
  quitarDeCestaAccion,
} from "../../../acciones";
import { FilaAlimentoCesta, FormularioAnadirACesta, FormularioCesta, FormularioEliminar } from "../../../formularios";
import { Aviso, Volver } from "../../../../_ui/aviso";

export const metadata: Metadata = { title: "Cesta · Cesta solidaria" };

const AVISOS = {
  creada: "Cesta creada con la propuesta de la lista base. Revisa los alimentos y cámbialos si hace falta.",
  creada_vacia: "Cesta creada sin lista base. Añade sus alimentos.",
  guardada: "Datos de la cesta guardados.",
  quitados: "Datos guardados. Se han quitado los alimentos que chocaban con las exclusiones nuevas.",
  recalculada: "Datos guardados y alimentos propuestos de nuevo con la lista base.",
  anadido: "Alimento añadido.",
  cantidad: "Cantidad guardada.",
  quitado: "Alimento quitado de la cesta.",
};

export default async function PaginaCesta({ params, searchParams }: PageProps<"/semanas/[id]/cestas/[cestaId]">) {
  await requerirAdmin();
  const { id, cestaId } = await params;
  const { aviso, quitados: quitadosParam } = await searchParams;

  const cliente = await crearClienteServidor();
  const [cesta, etiquetas, listas, alimentos] = await Promise.all([
    obtenerCesta(cliente, cestaId),
    listarEtiquetas(cliente),
    listarListas(cliente),
    listarAlimentos(cliente, { incluirInactivos: true }),
  ]);
  if (!cesta.ok) {
    if (cesta.error === "no_encontrado") notFound();
    throw new Error("No se ha podido cargar la cesta");
  }
  if (cesta.valor.semana.id !== id) notFound();
  if (!etiquetas.ok || !listas.ok || !alimentos.ok) throw new Error("No se ha podido cargar el catálogo");

  const c = cesta.valor;
  const editable = semanaEditable(c.semana);
  const nombreEtiqueta = new Map(etiquetas.valor.map((e) => [e.id, e.nombre]));
  const nombres = (ids: string[]) => ids.map((e) => nombreEtiqueta.get(e) ?? "?");

  // Avisos de R1.2, mientras se prepara: lo que la lista base no ha metido por las
  // exclusiones (para añadir sustitutos) o por estar desactivado.
  let propuesta: Propuesta = { items: [], quitados: [], desactivados: [] };
  if (editable && c.lista_base_id) {
    const plantilla = await plantillaDeLista(cliente, c.lista_base_id);
    if (plantilla.ok) propuesta = proponerCesta(c, plantilla.valor);
  }
  const enCesta = new Set(c.items.map((i) => i.alimento_id));
  const quitados = propuesta.quitados.filter((q) => !enCesta.has(q.alimento_id));
  const desactivados = propuesta.desactivados.filter((d) => !enCesta.has(d.alimento_id));

  // Requisito de la revisión del PR 3: si después de crear la cesta se marca en el
  // catálogo que un alimento contiene algo que esta cesta excluye, se avisa.
  const choques = new Map(choquesEnCesta(c.items, c.exclusiones).map((i) => [i.id, textoContiene(nombres(i.conflicto))]));

  const sin = textoSin(nombres(c.exclusiones));
  const lista = listas.valor.find((l) => l.id === c.lista_base_id);
  // Tras añadir una exclusión: qué alimentos se han quitado (también los añadidos a
  // mano, que el aviso de la lista base no cubre). De la URL solo se toman ids del catálogo.
  const idsQuitados = new Set(
    aviso === "quitados" && typeof quitadosParam === "string" ? quitadosParam.split(",") : [],
  );
  const quitadosAhora = alimentos.valor.filter((a) => idsQuitados.has(a.id));

  const disponibles = alimentos.valor
    .filter((a) => a.activo && !enCesta.has(a.id))
    .map((a) => ({ id: a.id, nombre: a.nombre, unidad: a.unidad, contiene: textoContiene(nombres(a.etiquetas)) }));

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Volver href={`/semanas/${id}`} texto={`Entrega del ${formatearFecha(c.semana.fecha_entrega)}`} />
      <div className="flex flex-col gap-1">
        <h1 className="break-words text-2xl font-semibold">{c.identificador_receptor}</h1>
        <p className="text-sm text-stone-600">
          {c.adultos} adulto{c.adultos === 1 ? "" : "s"} y {c.ninos} niño{c.ninos === 1 ? "" : "s"}
          {sin && ` · ${sin}`}
          {lista ? ` · Lista «${lista.nombre}»` : " · Sin lista base"}
        </p>
      </div>
      <Aviso clave={aviso} textos={AVISOS} />
      {quitadosAhora.length > 0 && (
        <p className="text-sm text-emerald-900">
          Quitados: {quitadosAhora.map((a) => `${a.nombre} (${a.unidad})`).join(", ")}.
        </p>
      )}

      {choques.size > 0 && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          <p className="font-medium">
            {choques.size === 1 ? "Un alimento choca" : `${choques.size} alimentos chocan`} con las exclusiones de esta
            cesta: el catálogo ha cambiado después de prepararla.
          </p>
          <p>{editable ? "Quítalos o cámbialos por otros." : "La semana ya se ha enviado: avisa a quien lo lleve."}</p>
        </div>
      )}

      {(quitados.length > 0 || desactivados.length > 0) && (
        <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {quitados.length > 0 && (
            <div>
              <p className="font-medium">No entran por las exclusiones (añade sustitutos si quieres):</p>
              <ul className="list-disc pl-5">
                {quitados.map((q) => (
                  <li key={q.alimento_id}>
                    {q.nombre} ({q.unidad}): {textoContiene(nombres(q.etiquetas)).toLowerCase()}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {desactivados.length > 0 && (
            <div>
              <p className="font-medium">No se proponen porque están desactivados en el catálogo:</p>
              <ul className="list-disc pl-5">
                {desactivados.map((d) => (
                  <li key={d.alimento_id}>
                    {d.nombre} ({d.unidad})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <section className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Alimentos</h2>
        {c.items.length === 0 ? (
          <p className="text-sm text-stone-600">La cesta no tiene alimentos.</p>
        ) : (
          <ul className="-mx-4 flex flex-col divide-y divide-stone-200 border-y border-stone-200">
            {c.items.map((item) => (
              <FilaAlimentoCesta
                key={`${item.id}|${item.cantidad}`}
                item={{ ...item, choque: choques.get(item.id) }}
                guardar={editable ? cambiarCantidadAccion.bind(null, id, c.id, item.id) : undefined}
                quitar={editable ? quitarDeCestaAccion.bind(null, id, c.id, item.id) : undefined}
              />
            ))}
          </ul>
        )}
        <p className="text-sm">
          <span className="font-medium">Coste de la cesta:</span> {formatearEuros(costeCesta(c.items))}. Los precios son
          los del momento en que se añadió cada alimento.
        </p>
        {editable && (
          <>
            <h3 className="mt-2 font-medium">Añadir un alimento</h3>
            <FormularioAnadirACesta
              key={c.items.length}
              accion={anadirACestaAccion.bind(null, id, c.id)}
              alimentos={disponibles}
            />
          </>
        )}
      </section>

      {editable && (
        <>
          <section className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4">
            <h2 className="text-lg font-semibold">Datos de la cesta</h2>
            <p className="text-sm text-stone-600">
              Si añades una exclusión, se quitan los alimentos que choquen con ella.
            </p>
            <FormularioCesta
              key={`${c.identificador_receptor}|${c.adultos}|${c.ninos}|${c.lista_base_id}|${c.exclusiones.join(",")}|${c.items.length}`}
              accion={editarCestaAccion.bind(null, id, c.id)}
              inicial={{
                identificador_receptor: c.identificador_receptor,
                adultos: String(c.adultos),
                ninos: String(c.ninos),
                lista_base_id: c.lista_base_id ?? "",
                exclusiones: c.exclusiones,
              }}
              listas={listas.valor}
              etiquetas={etiquetas.valor}
              textoBoton="Guardar datos"
              conRecalcular
            />
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4">
            <h2 className="text-lg font-semibold">Eliminar</h2>
            <FormularioEliminar
              accion={eliminarCestaAccion.bind(null, id, c.id)}
              texto="Quiero eliminar esta cesta."
              boton="Eliminar cesta"
            />
          </section>
        </>
      )}
    </div>
  );
}
