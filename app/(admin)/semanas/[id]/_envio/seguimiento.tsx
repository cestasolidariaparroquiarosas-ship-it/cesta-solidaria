import { formatearEuros } from "@/lib/dominio/catalogo";
import { costeCesta } from "@/lib/dominio/cesta";
import { esCandidato, nombreVisible } from "@/lib/dominio/colaboradores";
import { DIAS_PARA_CERRAR, gruposSeguimiento, type GrupoSeguimiento } from "@/lib/dominio/inicio";
import { agruparPorAlimento } from "@/lib/dominio/reparto";
import type { Semana } from "@/lib/dominio/semanas";
import { formatearFechaHora, hoyEnMadrid } from "@/lib/fechas";
import type { AsignacionReparto } from "@/lib/servicios/reparto";
import {
  buscarSustitutoAccion,
  cerrarSemanaAccion,
  enviarSemanaAccion,
  marcarEntregadoAccion,
  reenviarAccion,
} from "./acciones";
import { BotonAccion, FormularioCerrar, FormularioEnviar } from "./formularios";
import { BarraProporcion } from "../../../_ui/barra";
import { AVISO } from "../../../_ui/estilos";
import { Etiqueta, type Tono } from "../../../_ui/etiqueta";
import { IconoCheck, IconoCruz, IconoReloj } from "../../../_ui/iconos";

const ESTADOS: Record<AsignacionReparto["estado"], { texto: string; tono: Tono }> = {
  propuesta: { texto: "Propuesta", tono: "gris" },
  pendiente: { texto: "Esperando respuesta", tono: "ambar" },
  confirmada: { texto: "Confirmada", tono: "verde" },
  rechazada: { texto: "No puede", tono: "rosa" },
  sin_respuesta: { texto: "Sin respuesta", tono: "rosa" },
};

// Cabecera de cada grupo (P2). Los textos no repiten los de las etiquetas de estado.
const GRUPOS: Record<GrupoSeguimiento, { titulo: string; clase: string; Icono: typeof IconoReloj }> = {
  propuesta: { titulo: "Sin enviar", clase: "border-stone-300 bg-stone-100 text-stone-800", Icono: IconoReloj },
  esperando: { titulo: "Esperan respuesta", clase: "border-amber-200 bg-amber-50 text-amber-900", Icono: IconoReloj },
  confirmadas: { titulo: "Confirmadas", clase: "border-emerald-200 bg-emerald-50 text-emerald-900", Icono: IconoCheck },
  noPueden: {
    titulo: "No pueden o no respondieron",
    clase: "border-rose-200 bg-rose-50 text-rose-900",
    Icono: IconoCruz,
  },
};

function Cabecera({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-stone-300 bg-stone-100 px-4 py-3">
      <h2 className="text-lg font-bold">4. Envío y respuestas</h2>
      {children}
    </div>
  );
}

/** Paso 4 de la semana: enviar los correos y seguir las respuestas (R4). */
export function Envio({ semana, asignaciones }: { semana: Semana; asignaciones: AsignacionReparto[] }) {
  if (semana.estado === "borrador") {
    const propuestas = asignaciones.filter((a) => a.estado === "propuesta");
    const noDisponibles = propuestas.filter((a) => !a.colaborador || !esCandidato(a.colaborador, semana.fecha_entrega));
    return (
      <>
        <Cabecera />
        <div className="flex flex-col gap-3 p-4">
          <p className="text-stone-700">
            Cada colaborador recibe un correo con lo que tiene que llevar, el plazo para responder (
            {formatearFechaHora(semana.plazo_confirmacion)}) y dos enlaces: «Puedo llevarlo» y «No puedo esta vez». Si
            alguien no puede, sus alimentos pasan al siguiente colaborador disponible.
          </p>
          {propuestas.length === 0 ? (
            <p className="text-stone-600">Primero prepara el reparto.</p>
          ) : noDisponibles.length > 0 ? (
            <p role="alert" className="text-sm font-medium text-red-800">
              {noDisponibles.length === 1
                ? "En el reparto hay un colaborador que ya no está disponible: cámbialo antes de enviar."
                : `En el reparto hay ${noDisponibles.length} colaboradores que ya no están disponibles: cámbialos antes de enviar.`}
            </p>
          ) : (
            <FormularioEnviar accion={enviarSemanaAccion.bind(null, semana.id)} colaboradores={propuestas.length} />
          )}
        </div>
      </>
    );
  }

  const nombrePorId = new Map(asignaciones.map((a) => [a.id, nombreVisible(a.colaborador)]));
  const cuenta = (estado: AsignacionReparto["estado"]) => asignaciones.filter((a) => a.estado === estado).length;
  const confirmadas = cuenta("confirmada");
  const esperando = cuenta("pendiente");
  const noPueden = cuenta("rechazada") + cuenta("sin_respuesta");
  const sinEnviar = asignaciones.filter((a) => a.estado === "pendiente" && !a.enviado_en).length;
  // Rechazadas o sin respuesta que aún tienen alimentos: nadie los lleva (R4.6).
  const sinCubrir = (a: AsignacionReparto) =>
    (a.estado === "rechazada" || a.estado === "sin_respuesta") && a.items.length > 0;
  // Desde el día de la entrega: casilla "entregado" y, si sigue enviada, cerrar.
  const entregaLlegada = semana.fecha_entrega <= hoyEnMadrid();

  const fila = (a: AsignacionReparto) => {
    const nombre = nombreVisible(a.colaborador);
    const estado = ESTADOS[a.estado];
    const lineas = agruparPorAlimento(a.items);
    const detalle =
      a.estado === "pendiente" && !a.enviado_en
        ? "Correo no enviado"
        : a.respondido_en
          ? `Respondió el ${formatearFechaHora(a.respondido_en)}`
          : a.estado === "pendiente" && a.plazo
            ? `Plazo: ${formatearFechaHora(a.plazo)}`
            : null;
    return (
      <li key={a.id} className="flex flex-col gap-2 px-4 py-3" aria-label={nombre}>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="min-w-0 break-words font-bold">{nombre}</span>
          <Etiqueta tono={estado.tono}>{estado.texto}</Etiqueta>
          {a.sustituye_a && (
            <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[13px] font-semibold text-sky-900">
              Sustituye a {nombrePorId.get(a.sustituye_a) ?? "otro colaborador"}
            </span>
          )}
          {(detalle || lineas.length > 0) && (
            <span className="text-sm text-stone-700 sm:ml-auto">
              {detalle}
              {detalle && lineas.length > 0 && " · "}
              {lineas.length > 0 && <strong className="text-stone-900">{formatearEuros(costeCesta(a.items))}</strong>}
            </span>
          )}
        </div>
        {lineas.length > 0 && (
          <ul aria-label={`Lo que lleva ${nombre}`} className="flex flex-wrap gap-1.5">
            {lineas.map((l) => (
              <li
                key={`${l.alimento_id}|${l.unidad}`}
                className="rounded-md border border-stone-200 bg-stone-50 px-2 py-0.5 text-sm"
              >
                <strong>{l.cantidad}</strong> × {l.nombre}
              </li>
            ))}
          </ul>
        )}
        {a.estado === "confirmada" && entregaLlegada && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {a.entregado ? (
              <span className="font-semibold text-emerald-800">Entregado</span>
            ) : (
              <span className="text-stone-700">Sin marcar como entregado</span>
            )}
            <BotonAccion
              accion={marcarEntregadoAccion.bind(null, semana.id, a.id, !a.entregado)}
              texto={a.entregado ? "Deshacer" : "Marcar como entregado"}
              textoEnviando="Guardando…"
              etiqueta={a.entregado ? `Deshacer entregado de ${nombre}` : `Marcar como entregado: ${nombre}`}
            />
          </div>
        )}
        {sinCubrir(a) && (
          <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
            <p className="font-semibold text-amber-950">Sin cubrir: nadie lleva estos alimentos.</p>
            {semana.estado === "enviada" && (
              <BotonAccion
                accion={buscarSustitutoAccion.bind(null, semana.id, a.id)}
                texto="Buscar sustituto"
                textoEnviando="Buscando…"
                etiqueta={`Buscar sustituto de ${nombre}`}
              />
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <>
      <Cabecera>
        <div className="flex min-w-48 flex-1 items-center">
          <BarraProporcion
            texto={`${confirmadas} confirmadas, ${esperando} esperando y ${noPueden} que no pueden`}
            tramos={[
              { valor: confirmadas, clase: "bg-emerald-600" },
              { valor: esperando, clase: "bg-amber-500" },
              { valor: noPueden, clase: "bg-rose-600" },
            ]}
          />
        </div>
        <p className="text-sm text-stone-800">
          {confirmadas} confirmada{confirmadas === 1 ? "" : "s"} · {esperando} esperando respuesta · {noPueden}{" "}
          {noPueden === 1 ? "no puede o no respondió" : "no pueden o no respondieron"}
        </p>
      </Cabecera>
      {(semana.estado === "cerrada" || sinEnviar > 0) && (
        <div className="flex flex-col gap-3 p-4 pb-0">
          {semana.estado === "cerrada" && <p className="text-stone-700">Semana cerrada: está en el histórico.</p>}
          {sinEnviar > 0 && (
            <div role="alert" className={`flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm ${AVISO.error}`}>
              <p className="font-semibold">
                {sinEnviar === 1
                  ? "Un correo no se ha podido enviar."
                  : `${sinEnviar} correos no se han podido enviar.`}
              </p>
              <BotonAccion
                accion={reenviarAccion.bind(null, semana.id)}
                texto="Volver a intentarlo"
                textoEnviando="Enviando…"
              />
            </div>
          )}
        </div>
      )}
      <ul aria-label="Respuestas" className="mt-3 flex flex-col">
        {gruposSeguimiento(asignaciones).map((g) => {
          const { titulo, clase, Icono } = GRUPOS[g.grupo];
          return (
            <li key={g.grupo}>
              <h3 className={`flex items-center gap-2 border-y px-4 py-2 font-bold ${clase}`}>
                <Icono className="size-5" />
                {titulo}{" "}
                <span className="font-semibold">· {g.asignaciones.length}</span>
              </h3>
              <ul className="flex flex-col divide-y divide-stone-200">{g.asignaciones.map(fila)}</ul>
            </li>
          );
        })}
      </ul>
      {semana.estado === "enviada" && entregaLlegada && (
        <div className="flex flex-col gap-2 border-t border-stone-300 bg-stone-50 p-4">
          <h3 className="font-bold">Cerrar la semana</h3>
          <p className="text-sm text-stone-700">
            Si nadie la cierra, se cierra sola a los {DIAS_PARA_CERRAR} días de la entrega.
          </p>
          <FormularioCerrar accion={cerrarSemanaAccion.bind(null, semana.id)} />
        </div>
      )}
    </>
  );
}
