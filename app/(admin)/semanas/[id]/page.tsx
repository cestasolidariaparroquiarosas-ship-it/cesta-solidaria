import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirAdmin } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formatearCantidad, formatearEuros } from "@/lib/dominio/catalogo";
import { textoSin } from "@/lib/dominio/cesta";
import { semanaEditable } from "@/lib/dominio/semanas";
import { fechaHoraEnMadrid, formatearFecha, formatearFechaHora, hoyEnMadrid } from "@/lib/fechas";
import { listarEtiquetas } from "@/lib/servicios/catalogo";
import { obtenerReparto } from "@/lib/servicios/reparto";
import { obtenerSemana } from "@/lib/servicios/semanas";
import { eliminarSemanaAccion, guardarSemanaAccion } from "../acciones";
import { FormularioEliminar, FormularioSemana } from "../formularios";
import { EstadoSemanaEtiqueta } from "../estado-semana";
import { Aviso, Volver } from "../../_ui/aviso";
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO } from "../../_ui/estilos";

export const metadata: Metadata = { title: "Semana · Cesta solidaria" };

const AVISOS = {
  creada: "Semana creada. Ahora añade las cestas.",
  guardada: "Datos de la semana guardados.",
  cesta_eliminada: "Cesta eliminada.",
};

function personas(adultos: number, ninos: number): string {
  const partes = [];
  if (adultos) partes.push(`${adultos} adulto${adultos === 1 ? "" : "s"}`);
  if (ninos) partes.push(`${ninos} niño${ninos === 1 ? "" : "s"}`);
  return partes.join(" y ");
}

export default async function PaginaSemana({ params, searchParams }: PageProps<"/semanas/[id]">) {
  await requerirAdmin();
  const { id } = await params;
  const { aviso } = await searchParams;

  const cliente = await crearClienteServidor();
  const [semana, etiquetas, reparto] = await Promise.all([
    obtenerSemana(cliente, id),
    listarEtiquetas(cliente),
    obtenerReparto(cliente, id),
  ]);
  if (!semana.ok) {
    if (semana.error === "no_encontrado") notFound();
    throw new Error("No se ha podido cargar la semana");
  }
  if (!etiquetas.ok) throw new Error("No se han podido cargar las etiquetas");
  if (!reparto.ok) throw new Error("No se ha podido cargar el reparto");
  const colaboradoresEnReparto = reparto.valor.length;
  const s = semana.valor;
  const editable = semanaEditable(s);
  const nombreEtiqueta = new Map(etiquetas.valor.map((e) => [e.id, e.nombre]));
  const plazo = fechaHoraEnMadrid(s.plazo_confirmacion);
  const costeTotal = s.cestas.reduce((t, c) => t + Math.round(c.coste * 100), 0) / 100;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Volver href="/semanas" texto="Semanas" />
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">Entrega del {formatearFecha(s.fecha_entrega)}</h1>
        <EstadoSemanaEtiqueta estado={s.estado} />
      </div>
      <Aviso clave={aviso} textos={AVISOS} />

      <section className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="text-lg font-semibold">1. Datos</h2>
        {editable ? (
          <FormularioSemana
            key={`${s.fecha_entrega}|${s.precio_base}|${s.plazo_confirmacion}`}
            accion={guardarSemanaAccion.bind(null, s.id)}
            hoy={hoyEnMadrid()}
            inicial={{
              fecha_entrega: s.fecha_entrega,
              precio_base: formatearCantidad(s.precio_base),
              plazo_fecha: plazo.fecha,
              plazo_hora: plazo.hora,
            }}
            textoBoton="Guardar datos"
          />
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-stone-600">Precio base</dt>
            <dd>{formatearEuros(s.precio_base)}</dd>
            <dt className="text-stone-600">Plazo</dt>
            <dd>{formatearFechaHora(s.plazo_confirmacion)}</dd>
          </dl>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">2. Cestas</h2>
          {editable && (
            <Link href={`/semanas/${s.id}/cestas/nueva`} className={BOTON_PRINCIPAL}>
              Añadir cesta
            </Link>
          )}
        </div>
        {s.cestas.length === 0 ? (
          <p className="text-sm text-stone-600">Todavía no hay cestas.</p>
        ) : (
          <>
            <ul className="-mx-4 flex flex-col divide-y divide-stone-200 border-y border-stone-200">
              {s.cestas.map((c) => {
                const sin = textoSin(c.exclusiones.map((e) => nombreEtiqueta.get(e) ?? "?"));
                return (
                  <li key={c.id}>
                    <Link
                      href={`/semanas/${s.id}/cestas/${c.id}`}
                      className="flex flex-col gap-1 px-4 py-3 hover:bg-stone-50"
                    >
                      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="min-w-0 break-words font-medium">{c.identificador_receptor}</span>
                        <span className="text-sm text-stone-600">
                          {c.unidades} unidad{c.unidades === 1 ? "" : "es"} · {formatearEuros(c.coste)}
                        </span>
                      </span>
                      <span className="text-sm text-stone-600">
                        {personas(c.adultos, c.ninos)}
                        {sin && ` · ${sin}`}
                      </span>
                      {c.choques > 0 && (
                        <span className="text-sm font-medium text-red-800">
                          Revisar: {c.choques} alimento{c.choques === 1 ? " choca" : "s chocan"} con sus exclusiones
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="text-sm">
              <span className="font-medium">Coste total:</span> {formatearEuros(costeTotal)} en {s.cestas.length} cesta
              {s.cestas.length === 1 ? "" : "s"}.
            </p>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">3. Reparto</h2>
          {(colaboradoresEnReparto > 0 || (editable && s.cestas.length > 0)) && (
            <Link
              href={`/semanas/${s.id}/reparto`}
              className={colaboradoresEnReparto > 0 ? BOTON_SECUNDARIO : BOTON_PRINCIPAL}
            >
              {colaboradoresEnReparto > 0 ? "Ver el reparto" : "Preparar el reparto"}
            </Link>
          )}
        </div>
        <p className="text-sm text-stone-600">
          {colaboradoresEnReparto > 0
            ? `${colaboradoresEnReparto} colaborador${colaboradoresEnReparto === 1 ? "" : "es"} con alimentos asignados.`
            : s.cestas.length > 0
              ? "Todavía no hay reparto."
              : "Primero añade las cestas."}
        </p>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-dashed border-stone-300 p-4 text-stone-600">
        <h2 className="text-lg font-semibold">4. Envío</h2>
        <p className="text-sm">El envío de los correos y el seguimiento de las respuestas llegarán en la próxima versión.</p>
      </section>

      {editable && (
        <section className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="text-lg font-semibold">Eliminar</h2>
          <p className="text-sm text-stone-600">Se borra la semana con todas sus cestas.</p>
          <FormularioEliminar
            accion={eliminarSemanaAccion.bind(null, s.id)}
            texto="Quiero eliminar esta semana y sus cestas."
            boton="Eliminar semana"
          />
        </section>
      )}
    </div>
  );
}
