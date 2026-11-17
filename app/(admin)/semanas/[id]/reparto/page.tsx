import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requerirAdmin } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formatearEuros } from "@/lib/dominio/catalogo";
import { costeCesta } from "@/lib/dominio/cesta";
import { esCandidato, nombreVisible } from "@/lib/dominio/colaboradores";
import { agruparPorAlimento, superaPrecioBase } from "@/lib/dominio/reparto";
import { candidatosOrdenados, colaboradoresNecesarios } from "@/lib/dominio/seleccion";
import { semanaEditable } from "@/lib/dominio/semanas";
import { formatearFecha } from "@/lib/fechas";
import { itemsDeSemana, listarCandidatos, obtenerReparto } from "@/lib/servicios/reparto";
import { obtenerSemana } from "@/lib/servicios/semanas";
import { Aviso, Volver } from "../../../_ui/aviso";
import { BarraProporcion } from "../../../_ui/barra";
import { AVISO } from "../../../_ui/estilos";
import { Etiqueta } from "../../../_ui/etiqueta";
import { Tarjeta } from "../../../_ui/tarjeta";
import { cambiarColaboradorAccion, moverAccion, proponerRepartoAccion } from "./acciones";
import { FormularioCambiarColaborador, FormularioMover, FormularioProponer } from "./formularios";

export const metadata: Metadata = { title: "Reparto · Cesta solidaria" };

const RECUADRO = "rounded-xl border border-stone-300 bg-white px-4 py-3 shadow-sm";

const AVISOS = {
  propuesto: "Reparto propuesto. Revísalo y cambia lo que haga falta.",
  movido: "Alimentos movidos.",
  movido_sale: "Alimentos movidos. Quien se ha quedado sin nada sale del reparto.",
  cambiado: "Colaborador cambiado.",
};

export default async function PaginaReparto({ params, searchParams }: PageProps<"/semanas/[id]/reparto">) {
  await requerirAdmin();
  const { id } = await params;
  const { aviso } = await searchParams;

  const cliente = await crearClienteServidor();
  const [semana, items, reparto, candidatos] = await Promise.all([
    obtenerSemana(cliente, id),
    itemsDeSemana(cliente, id),
    obtenerReparto(cliente, id),
    listarCandidatos(cliente),
  ]);
  if (!semana.ok) {
    if (semana.error === "no_encontrado") notFound();
    throw new Error("No se ha podido cargar la semana");
  }
  if (!items.ok || !reparto.ok || !candidatos.ok) throw new Error("No se ha podido cargar el reparto");

  const s = semana.valor;
  const editable = semanaEditable(s);
  // Con la semana ya enviada, solo las que siguen vivas: las rechazadas o sin respuesta
  // se ven en el seguimiento de la semana (paso 4).
  const asignaciones = reparto.valor.filter((a) => ["propuesta", "pendiente", "confirmada"].includes(a.estado));
  const costeTotal = costeCesta(items.valor);
  const necesarios = colaboradoresNecesarios(costeTotal, s.precio_base);
  const disponibles = candidatosOrdenados(candidatos.valor, s.fecha_entrega);
  // R2.5 (CA-13): con menos candidatos que N, todos gastan más del precio base.
  const faltan = Math.max(0, necesarios - disponibles.length);

  const enReparto = new Set(asignaciones.flatMap((a) => (a.colaborador ? [a.colaborador.id] : [])));
  const libres = candidatosOrdenados(candidatos.valor, s.fecha_entrega, enReparto).map((c) => ({
    id: c.id,
    texto: `${c.nombre} · ${c.ultima_participacion ? `última vez ${formatearFecha(c.ultima_participacion)}` : "nunca ha participado"}`,
  }));
  const nombres = asignaciones.map((a) => ({ id: a.id, nombre: nombreVisible(a.colaborador) }));

  return (
    <div className="flex flex-col gap-5">
      <Volver href={`/semanas/${id}`} texto={`Entrega del ${formatearFecha(s.fecha_entrega)}`} />
      <h1 className="text-3xl font-bold">Reparto</h1>
      <Aviso clave={aviso} textos={AVISOS} />

      <section aria-label="Resumen del reparto" className="flex flex-col gap-3">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className={RECUADRO}>
            <dt className="text-sm text-stone-600">Coste de las cestas</dt>
            <dd className="text-2xl font-bold">{formatearEuros(costeTotal)}</dd>
          </div>
          <div className={RECUADRO}>
            <dt className="text-sm text-stone-600">Precio base</dt>
            <dd className="text-2xl font-bold">
              {formatearEuros(s.precio_base)}{" "}
              <span className="text-sm font-medium text-stone-600">por colaborador</span>
            </dd>
          </div>
          <div className={RECUADRO}>
            <dt className="text-sm text-stone-600">Hacen falta</dt>
            <dd className="text-2xl font-bold">
              {necesarios}{" "}
              <span className="text-sm font-medium text-stone-600">colaborador{necesarios === 1 ? "" : "es"}</span>
            </dd>
          </div>
          <div className={RECUADRO}>
            <dt className="text-sm text-stone-600">Disponibles</dt>
            <dd className="text-2xl font-bold">{disponibles.length}</dd>
          </div>
        </dl>
        {editable && faltan > 0 && costeTotal > 0 && (
          <p role="alert" className={`rounded-lg border px-3 py-2 ${AVISO.atencion}`}>
            Hacen falta {necesarios} colaboradores y solo hay {disponibles.length} disponibles: el gasto de cada uno
            superará el precio base.
          </p>
        )}
      </section>

      {editable && items.valor.length === 0 ? (
        <p className="text-stone-700">Añade alimentos a las cestas para poder repartirlos.</p>
      ) : (
        editable && (
          <div className="max-w-3xl">
            <Tarjeta titulo={asignaciones.length === 0 ? "Proponer el reparto" : "Volver a empezar"}>
              {asignaciones.length === 0 ? (
                <p className="text-stone-700">
                  Se eligen los colaboradores que hacen falta, empezando por quienes nunca han participado o llevan más
                  tiempo sin hacerlo, y se reparten los alimentos para que todos gasten parecido.
                </p>
              ) : (
                <p className="text-stone-700">
                  Si cambias alguna cesta, este reparto se descarta y hay que volver a proponerlo.
                </p>
              )}
              <FormularioProponer
                key={asignaciones.length}
                accion={proponerRepartoAccion.bind(null, id)}
                hayReparto={asignaciones.length > 0}
              />
            </Tarjeta>
          </div>
        )
      )}

      {asignaciones.length > 0 && (
        <ul className="grid items-start gap-4 lg:grid-cols-2" aria-label="Colaboradores del reparto">
          {asignaciones.map((a) => {
            const nombre = nombreVisible(a.colaborador);
            const gasto = costeCesta(a.items);
            const excede = superaPrecioBase(gasto, s.precio_base);
            // CA-03: alguien que ya no está disponible (baja, pausa o eliminado) no puede
            // recibir el correo; enviar_semana lo rechaza.
            const noDisponible = editable && (!a.colaborador || !esCandidato(a.colaborador, s.fecha_entrega));
            const otros = nombres.filter((n) => n.id !== a.id);
            return (
              <li
                key={a.id}
                className="overflow-hidden rounded-xl border border-stone-300 bg-white shadow-sm"
                aria-label={nombre}
              >
                <div className="flex flex-col gap-2 border-b border-stone-300 bg-stone-100 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <h2 className="min-w-0 break-words text-lg font-bold">{nombre}</h2>
                    {!editable && (
                      <Etiqueta tono={a.estado === "confirmada" ? "verde" : "ambar"}>
                        {a.estado === "confirmada" ? "Confirmada" : "Esperando respuesta"}
                      </Etiqueta>
                    )}
                    <span className="ml-auto text-lg font-bold">{formatearEuros(gasto)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <BarraProporcion
                      alto="h-2"
                      total={s.precio_base}
                      texto={`${formatearEuros(gasto)} de ${formatearEuros(s.precio_base)}`}
                      tramos={[{ valor: gasto, clase: excede ? "bg-amber-500" : "bg-emerald-600" }]}
                    />
                    <span className="text-sm whitespace-nowrap text-stone-700">de {formatearEuros(s.precio_base)}</span>
                  </div>
                  {excede && (
                    <p className="text-sm font-semibold text-amber-900">
                      Su gasto supera el precio base ({formatearEuros(s.precio_base)})
                    </p>
                  )}
                  {noDisponible && (
                    <p role="alert" className="text-sm font-semibold text-red-800">
                      Ya no está disponible para esta fecha: cámbialo por otro colaborador antes de enviar.
                    </p>
                  )}
                </div>
                <ul className="flex flex-col divide-y divide-stone-200 [&>li:nth-child(even)]:bg-stone-50">
                  {agruparPorAlimento(a.items).map((l) => {
                    const texto = `${l.nombre} (${l.unidad})`;
                    return (
                      <li key={`${l.alimento_id}|${l.unidad}`} className="px-4 py-2">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span>
                            <strong>{l.cantidad} ×</strong> {l.nombre}{" "}
                            <span className="text-sm text-stone-600">({l.unidad})</span>
                          </span>
                          <span className="tabular-nums">{formatearEuros(l.gasto)}</span>
                        </div>
                        {editable && otros.length > 0 && (
                          <details className="text-sm">
                            <summary className="cursor-pointer py-1 text-emerald-800 underline">
                              Mover a otro colaborador
                            </summary>
                            <FormularioMover
                              key={`${a.id}|${l.cantidad}`}
                              accion={moverAccion.bind(null, id, a.id, {
                                alimentoId: l.alimento_id,
                                unidad: l.unidad,
                                cantidad: l.cantidad,
                              })}
                              nombre={`${texto} de ${nombre}`}
                              cantidad={l.cantidad}
                              destinos={otros}
                            />
                          </details>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {editable && (
                  <details className="border-t border-stone-300 px-4 py-2 text-sm">
                    <summary className="cursor-pointer py-1 text-emerald-800 underline">
                      Cambiar por otro colaborador
                    </summary>
                    <FormularioCambiarColaborador
                      accion={cambiarColaboradorAccion.bind(null, id, a.id)}
                      nombre={nombre}
                      candidatos={libres}
                    />
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
