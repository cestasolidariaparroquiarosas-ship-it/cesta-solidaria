import type { Metadata } from "next";
import Link from "next/link";
import { requerirAdmin } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { esCandidato } from "@/lib/dominio/colaboradores";
import {
  avisosSemana,
  DIAS_PARA_CERRAR,
  recuento,
  semanaEnCurso,
  semanasSinCerrar,
  type Aviso,
} from "@/lib/dominio/inicio";
import { plazoVencido } from "@/lib/dominio/plazos";
import { formatearFecha, formatearFechaHora, hoyEnMadrid } from "@/lib/fechas";
import { obtenerReparto } from "@/lib/servicios/reparto";
import { listarSemanas } from "@/lib/servicios/semanas";
import { EstadoSemanaEtiqueta } from "./semanas/estado-semana";
import { ProbarCorreo } from "./_inicio/probar-correo";
import { AVISO, BOTON_PRINCIPAL } from "./_ui/estilos";
import { BarraProporcion } from "./_ui/barra";
import { IconoAtencion, IconoCheck, IconoCruz, IconoInfo, IconoReloj } from "./_ui/iconos";
import { Tarjeta } from "./_ui/tarjeta";

export const metadata: Metadata = { title: "Inicio · Cesta solidaria" };

const ICONO_AVISO: Record<Aviso["tipo"], typeof IconoInfo> = {
  error: IconoAtencion,
  atencion: IconoAtencion,
  info: IconoInfo,
};

/** Inicio (spec §5.2): la semana en curso, cuántas confirmadas, pendientes y rechazadas, y avisos. */
export default async function Inicio() {
  await requerirAdmin();
  const cliente = await crearClienteServidor();
  const hoy = hoyEnMadrid();
  const semanas = await listarSemanas(cliente);
  const enCurso = semanas.ok ? semanaEnCurso(semanas.valor, hoy) : null;
  const sinCerrar = semanas.ok ? semanasSinCerrar(semanas.valor, hoy, enCurso) : [];
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
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Inicio</h1>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
          <section
            aria-label="Semana en curso"
            className="overflow-hidden rounded-xl border border-stone-300 bg-white shadow-sm"
          >
            {!semanas.ok || (reparto && !reparto.ok) ? (
              <p role="alert" className="p-4 text-red-700">
                No se ha podido cargar la semana en curso. Recarga la página.
              </p>
            ) : !enCurso ? (
              <div className="flex flex-col gap-3 p-4">
                <h2 className="text-lg font-bold">No hay ninguna semana en marcha</h2>
                <div>
                  <Link href="/semanas/nueva" className={BOTON_PRINCIPAL}>
                    Nueva semana
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-stone-300 bg-stone-100 px-4 py-3">
                  <p className="w-full text-xs font-bold tracking-wide text-stone-600 uppercase">Semana en curso</p>
                  <h2 className="text-xl font-bold">Entrega del {formatearFecha(enCurso.fecha_entrega)}</h2>
                  <EstadoSemanaEtiqueta estado={enCurso.estado} />
                  <p className="text-sm text-stone-700 sm:ml-auto">
                    Plazo para responder:{" "}
                    <strong className="font-semibold">{formatearFechaHora(enCurso.plazo_confirmacion)}</strong>
                  </p>
                </div>
                <div className="flex flex-col gap-4 p-4">
                  {enCurso.estado === "borrador" ? (
                    <p className="text-stone-700">
                      {enCurso.cestas} cesta{enCurso.cestas === 1 ? "" : "s"} · {vivas.length} colaborador
                      {vivas.length === 1 ? "" : "es"} en el reparto
                    </p>
                  ) : (
                    <>
                      <dl className="grid grid-cols-3 gap-2 sm:gap-3">
                        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-2 py-2 text-center sm:px-4 sm:py-3 sm:text-left">
                          <dt className="flex items-center justify-center gap-1.5 text-[13px] font-semibold sm:justify-start sm:text-sm text-emerald-900">
                            <IconoCheck className="hidden size-4 sm:block" />
                            Confirmadas
                          </dt>
                          <dd className="text-3xl font-bold text-emerald-900 sm:text-4xl">{r.confirmadas}</dd>
                        </div>
                        <div className="rounded-xl border border-amber-300 bg-amber-50 px-2 py-2 text-center sm:px-4 sm:py-3 sm:text-left">
                          <dt className="flex items-center justify-center gap-1.5 text-[13px] font-semibold sm:justify-start sm:text-sm text-amber-900">
                            <IconoReloj className="hidden size-4 sm:block" />
                            Esperando
                          </dt>
                          <dd className="text-3xl font-bold text-amber-900 sm:text-4xl">{r.esperando}</dd>
                        </div>
                        <div className="rounded-xl border border-rose-300 bg-rose-50 px-2 py-2 text-center sm:px-4 sm:py-3 sm:text-left">
                          <dt className="flex items-center justify-center gap-1.5 text-[13px] font-semibold sm:justify-start sm:text-sm text-rose-900">
                            <IconoCruz className="hidden size-4 sm:block" />
                            No pueden
                          </dt>
                          <dd className="text-3xl font-bold text-rose-900 sm:text-4xl">{r.noPueden}</dd>
                        </div>
                      </dl>
                      <BarraProporcion
                        texto={`${r.confirmadas} confirmadas, ${r.esperando} esperando y ${r.noPueden} que no pueden`}
                        tramos={[
                          { valor: r.confirmadas, clase: "bg-emerald-600" },
                          { valor: r.esperando, clase: "bg-amber-500" },
                          { valor: r.noPueden, clase: "bg-rose-600" },
                        ]}
                      />
                    </>
                  )}
                  {avisos.length > 0 && (
                    <ul className="flex flex-col gap-2" aria-label="Avisos">
                      {avisos.map((a) => {
                        const Icono = ICONO_AVISO[a.tipo];
                        return (
                          <li
                            key={a.texto}
                            className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${AVISO[a.tipo]}`}
                          >
                            <Icono className="mt-0.5 size-5" />
                            <span>{a.texto}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div>
                    <Link href={`/semanas/${enCurso.id}`} className={BOTON_PRINCIPAL}>
                      Ir a la semana
                    </Link>
                  </div>
                </div>
              </>
            )}
          </section>

          {sinCerrar.length > 0 && (
            <section
              className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-sm"
              aria-label="Semanas sin cerrar"
            >
              <h2 className="text-lg font-bold">Falta cerrar</h2>
              <p className="text-sm text-amber-950">
                Ya ha sido la entrega: marca lo entregado y cierra la semana. Si no, se cierra sola a los{" "}
                {DIAS_PARA_CERRAR} días.
              </p>
              <ul className="flex flex-col gap-1">
                {sinCerrar.map((s) => (
                  <li key={s.id}>
                    <Link href={`/semanas/${s.id}`} className="font-semibold text-amber-950 underline">
                      Entrega del {formatearFecha(s.fecha_entrega)}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="min-w-0 flex-[1_1_280px]">
          <Tarjeta titulo="Correo">
            <p className="text-stone-700">
              Comprueba que los correos salen bien: se envía uno de prueba a la dirección del administrador.
            </p>
            <ProbarCorreo />
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
