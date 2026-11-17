import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirAdmin } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formatearCantidad, formatearEuros } from "@/lib/dominio/catalogo";
import { textoSin } from "@/lib/dominio/cesta";
import { pasosSemana, semanaEditable } from "@/lib/dominio/semanas";
import { fechaHoraEnMadrid, formatearFecha, formatearFechaHora, hoyEnMadrid } from "@/lib/fechas";
import { listarEtiquetas } from "@/lib/servicios/catalogo";
import { obtenerReparto } from "@/lib/servicios/reparto";
import { obtenerSemana } from "@/lib/servicios/semanas";
import { eliminarSemanaAccion, guardarSemanaAccion } from "../acciones";
import { FormularioEliminar, FormularioSemana } from "../formularios";
import { EstadoSemanaEtiqueta } from "../estado-semana";
import { Aviso, Volver } from "../../_ui/aviso";
import { Envio } from "./_envio/seguimiento";
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO, FILA_ENLACE, LISTA } from "../../_ui/estilos";
import { Tarjeta } from "../../_ui/tarjeta";
import { PasosSemana } from "./pasos";

export const metadata: Metadata = { title: "Semana · Cesta solidaria" };

// Las acciones de esta página envían los correos de la semana, uno detrás de otro:
// más tiempo que el que da Vercel por defecto.
export const maxDuration = 60;

const AVISOS = {
  creada: "Semana creada. Ahora añade las cestas.",
  guardada: "Datos de la semana guardados.",
  cesta_eliminada: "Cesta eliminada.",
  enviada: "Semana enviada: cada colaborador ha recibido su correo.",
  enviada_con_fallos: "Semana enviada, pero algunos correos no se han podido enviar. Más abajo puedes volver a intentarlo.",
  reenviados: "Correos enviados.",
  reenvio_con_fallos: "Algunos correos siguen sin poder enviarse. Comprueba la configuración del correo.",
  sustituto: "Sustituto encontrado: ya tiene su correo.",
  cerrada: "Semana cerrada: ya está en el histórico.",
  entregado: "Marcado como entregado.",
  no_entregado: "Quitada la marca de entregado.",
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
  const colaboradoresEnReparto = reparto.valor.filter((a) =>
    ["propuesta", "pendiente", "confirmada"].includes(a.estado),
  ).length;
  const s = semana.valor;
  const editable = semanaEditable(s);
  const nombreEtiqueta = new Map(etiquetas.valor.map((e) => [e.id, e.nombre]));
  const plazo = fechaHoraEnMadrid(s.plazo_confirmacion);
  const costeTotal = s.cestas.reduce((t, c) => t + Math.round(c.coste * 100), 0) / 100;

  const confirmadas = reparto.valor.filter((a) => a.estado === "confirmada").length;
  const pasos = pasosSemana({ estado: s.estado, cestas: s.cestas.length, enReparto: colaboradoresEnReparto });
  const resumen = {
    datos: `${formatearEuros(s.precio_base)} · plazo ${formatearFecha(plazo.fecha)}`,
    cestas: s.cestas.length
      ? `${s.cestas.length} cesta${s.cestas.length === 1 ? "" : "s"} · ${formatearEuros(costeTotal)}`
      : "Sin cestas",
    reparto: colaboradoresEnReparto
      ? `${colaboradoresEnReparto} colaborador${colaboradoresEnReparto === 1 ? "" : "es"}`
      : "Sin reparto",
    envio:
      s.estado === "borrador"
        ? "Sin enviar"
        : s.estado === "cerrada"
          ? "Semana cerrada"
          : `${confirmadas} de ${colaboradoresEnReparto} confirmada${colaboradoresEnReparto === 1 ? "" : "s"}`,
  };
  // Enviada o cerrada: los tres primeros pasos, en resumen y uno junto a otro (decisión 2).
  const compacta = !editable;

  const datos = (
    <Tarjeta id="datos" titulo="1. Datos">
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
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-stone-600">Precio base</dt>
          <dd className="font-semibold">{formatearEuros(s.precio_base)}</dd>
          <dt className="text-stone-600">Plazo</dt>
          <dd className="font-semibold">{formatearFechaHora(s.plazo_confirmacion)}</dd>
        </dl>
      )}
    </Tarjeta>
  );

  const cestas = (
    <Tarjeta
      id="cestas"
      titulo="2. Cestas"
      cuerpo={false}
      extra={
        editable ? (
          <Link href={`/semanas/${s.id}/cestas/nueva`} className={BOTON_PRINCIPAL}>
            Añadir cesta
          </Link>
        ) : s.cestas.length > 0 ? (
          <span className="text-sm text-stone-700">
            Total <strong>{formatearEuros(costeTotal)}</strong>
          </span>
        ) : undefined
      }
    >
      {s.cestas.length === 0 ? (
        <p className="p-4 text-stone-600">Todavía no hay cestas.</p>
      ) : (
        <>
          <ul className={LISTA}>
            {s.cestas.map((c) => {
              const sin = textoSin(c.exclusiones.map((e) => nombreEtiqueta.get(e) ?? "?"));
              return (
                <li key={c.id}>
                  <Link href={`/semanas/${s.id}/cestas/${c.id}`} className={FILA_ENLACE}>
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="min-w-0 break-words font-semibold">{c.identificador_receptor}</span>
                      <span className="text-sm whitespace-nowrap text-stone-700">
                        {compacta
                          ? formatearEuros(c.coste)
                          : `${c.unidades} unidad${c.unidades === 1 ? "" : "es"} · ${formatearEuros(c.coste)}`}
                      </span>
                    </span>
                    <span className="text-sm text-stone-600">
                      {personas(c.adultos, c.ninos)}
                      {sin && ` · ${sin}`}
                    </span>
                    {c.choques > 0 && (
                      <span className="text-sm font-semibold text-red-800">
                        Revisar: {c.choques} alimento{c.choques === 1 ? " choca" : "s chocan"} con sus exclusiones
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          {!compacta && (
            <p className="border-t border-stone-300 bg-stone-50 px-4 py-3">
              <span className="font-semibold">Coste total:</span> {formatearEuros(costeTotal)} en {s.cestas.length}{" "}
              cesta
              {s.cestas.length === 1 ? "" : "s"}.
            </p>
          )}
        </>
      )}
    </Tarjeta>
  );

  const repartoTarjeta = (
    <Tarjeta id="reparto" titulo="3. Reparto">
      <p>
        {colaboradoresEnReparto > 0
          ? `${colaboradoresEnReparto} colaborador${colaboradoresEnReparto === 1 ? "" : "es"} con alimentos asignados.`
          : s.cestas.length > 0
            ? "Todavía no hay reparto."
            : "Primero añade las cestas."}
      </p>
      {(colaboradoresEnReparto > 0 || (editable && s.cestas.length > 0)) && (
        <div>
          <Link
            href={`/semanas/${s.id}/reparto`}
            className={colaboradoresEnReparto > 0 && !editable ? BOTON_SECUNDARIO : BOTON_PRINCIPAL}
          >
            {colaboradoresEnReparto > 0 ? "Ver el reparto" : "Preparar el reparto"}
          </Link>
        </div>
      )}
    </Tarjeta>
  );

  return (
    <div className="flex flex-col gap-5">
      {s.estado === "cerrada" ? (
        <Volver href="/historico" texto="Histórico" />
      ) : (
        <Volver href="/semanas" texto="Semanas" />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">Entrega del {formatearFecha(s.fecha_entrega)}</h1>
        <EstadoSemanaEtiqueta estado={s.estado} />
      </div>
      <Aviso clave={aviso} textos={AVISOS} />

      <PasosSemana pasos={pasos} resumen={resumen} />

      {compacta ? (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          {datos}
          {cestas}
          {repartoTarjeta}
        </div>
      ) : (
        <div className="flex max-w-3xl flex-col gap-5">
          {datos}
          {cestas}
          {repartoTarjeta}
        </div>
      )}

      <section id="envio" className="scroll-mt-4 overflow-hidden rounded-xl border border-stone-300 bg-white shadow-sm">
        <Envio semana={s} asignaciones={reparto.valor} />
      </section>

      {editable && (
        <div className="max-w-3xl">
          <Tarjeta titulo="Eliminar" peligro>
            <p className="text-stone-700">Se borra la semana con todas sus cestas.</p>
            <FormularioEliminar
              accion={eliminarSemanaAccion.bind(null, s.id)}
              texto="Quiero eliminar esta semana y sus cestas."
              boton="Eliminar semana"
            />
          </Tarjeta>
        </div>
      )}
    </div>
  );
}
