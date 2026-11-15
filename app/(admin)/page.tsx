import type { Metadata } from "next";
import Link from "next/link";
import { requerirAdmin } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { esCandidato } from "@/lib/dominio/colaboradores";
import { avisosSemana, recuento, semanaEnCurso, type Aviso } from "@/lib/dominio/inicio";
import { plazoVencido } from "@/lib/dominio/plazos";
import { formatearFecha, formatearFechaHora, hoyEnMadrid } from "@/lib/fechas";
import { obtenerReparto } from "@/lib/servicios/reparto";
import { listarSemanas } from "@/lib/servicios/semanas";
import { EstadoSemanaEtiqueta } from "./semanas/estado-semana";
import { ProbarCorreo } from "./_inicio/probar-correo";
import { BOTON_PRINCIPAL } from "./_ui/estilos";

export const metadata: Metadata = { title: "Inicio · Cesta solidaria" };

const ESTILO_AVISO: Record<Aviso["tipo"], string> = {
  error: "border-red-200 bg-red-50 text-red-900",
  atencion: "border-amber-200 bg-amber-50 text-amber-950",
  info: "border-stone-200 bg-stone-50 text-stone-800",
};

/** Inicio (spec §5.2): la semana en curso, cuántas confirmadas, pendientes y rechazadas, y avisos. */
export default async function Inicio() {
  await requerirAdmin();
  const cliente = await crearClienteServidor();
  const hoy = hoyEnMadrid();
  const semanas = await listarSemanas(cliente);
  const enCurso = semanas.ok ? semanaEnCurso(semanas.valor, hoy) : null;
  const reparto = enCurso ? await obtenerReparto(cliente, enCurso.id) : null;
  const asignaciones = reparto?.ok ? reparto.valor : [];

  const vivas = asignaciones.filter((a) => ["propuesta", "pendiente", "confirmada"].includes(a.estado));
  const r = recuento(asignaciones);
  const avisos = enCurso
    ? avisosSemana({
        estado: enCurso.estado,
        fechaEntrega: enCurso.fecha_entrega,
        plazoVencido: plazoVencido(enCurso.plazo_confirmacion),
        hoy,
        cestas: enCurso.cestas,
        enReparto: vivas.length,
        noDisponibles: vivas.filter(
          (a) => a.estado === "propuesta" && (!a.colaborador || !esCandidato(a.colaborador, enCurso.fecha_entrega)),
        ).length,
        correosSinEnviar: asignaciones.filter((a) => a.estado === "pendiente" && !a.enviado_en).length,
        sinCubrir: asignaciones.filter(
          (a) => (a.estado === "rechazada" || a.estado === "sin_respuesta") && a.items.length > 0,
        ).length,
      })
    : [];

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Inicio</h1>

      <section className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4" aria-label="Semana en curso">
        {!semanas.ok || (reparto && !reparto.ok) ? (
          <p role="alert" className="text-red-700">
            No se ha podido cargar la semana en curso. Recarga la página.
          </p>
        ) : !enCurso ? (
          <>
            <h2 className="text-lg font-semibold">No hay ninguna semana en marcha</h2>
            <div>
              <Link href="/semanas/nueva" className={BOTON_PRINCIPAL}>
                Nueva semana
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">Entrega del {formatearFecha(enCurso.fecha_entrega)}</h2>
              <EstadoSemanaEtiqueta estado={enCurso.estado} />
            </div>
            {enCurso.estado === "borrador" ? (
              <p className="text-sm text-stone-700">
                {enCurso.cestas} cesta{enCurso.cestas === 1 ? "" : "s"} · {vivas.length} colaborador
                {vivas.length === 1 ? "" : "es"} en el reparto · plazo para responder:{" "}
                {formatearFechaHora(enCurso.plazo_confirmacion)}
              </p>
            ) : (
              <dl className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-emerald-50 p-2">
                  <dt className="text-xs text-stone-600">Confirmadas</dt>
                  <dd className="text-2xl font-semibold text-emerald-900">{r.confirmadas}</dd>
                </div>
                <div className="rounded-lg bg-amber-50 p-2">
                  <dt className="text-xs text-stone-600">Esperando</dt>
                  <dd className="text-2xl font-semibold text-amber-900">{r.esperando}</dd>
                </div>
                <div className="rounded-lg bg-stone-100 p-2">
                  <dt className="text-xs text-stone-600">No pueden</dt>
                  <dd className="text-2xl font-semibold text-stone-800">{r.noPueden}</dd>
                </div>
              </dl>
            )}
            {avisos.length > 0 && (
              <ul className="flex flex-col gap-2" aria-label="Avisos">
                {avisos.map((a) => (
                  <li key={a.texto} className={`rounded-md border px-3 py-2 text-sm ${ESTILO_AVISO[a.tipo]}`}>
                    {a.texto}
                  </li>
                ))}
              </ul>
            )}
            <div>
              <Link href={`/semanas/${enCurso.id}`} className={BOTON_PRINCIPAL}>
                Ir a la semana
              </Link>
            </div>
          </>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Correo</h2>
        <p className="text-sm text-stone-600">
          Comprueba que los correos salen bien: se envía uno de prueba a la dirección del administrador.
        </p>
        <ProbarCorreo />
      </section>
    </div>
  );
}
