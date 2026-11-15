import { formatearEuros } from "@/lib/dominio/catalogo";
import { costeCesta } from "@/lib/dominio/cesta";
import { esCandidato, nombreVisible } from "@/lib/dominio/colaboradores";
import { DIAS_PARA_CERRAR } from "@/lib/dominio/inicio";
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

const ESTADOS: Record<AsignacionReparto["estado"], { texto: string; clase: string }> = {
  propuesta: { texto: "Propuesta", clase: "bg-stone-100 text-stone-800" },
  pendiente: { texto: "Esperando respuesta", clase: "bg-amber-100 text-amber-900" },
  confirmada: { texto: "Confirmada", clase: "bg-emerald-100 text-emerald-900" },
  rechazada: { texto: "No puede", clase: "bg-stone-200 text-stone-800" },
  sin_respuesta: { texto: "Sin respuesta", clase: "bg-stone-200 text-stone-800" },
};

/** Paso 4 de la semana: enviar los correos y seguir las respuestas (R4). */
export function Envio({ semana, asignaciones }: { semana: Semana; asignaciones: AsignacionReparto[] }) {
  if (semana.estado === "borrador") {
    const propuestas = asignaciones.filter((a) => a.estado === "propuesta");
    const noDisponibles = propuestas.filter((a) => !a.colaborador || !esCandidato(a.colaborador, semana.fecha_entrega));
    return (
      <>
        <p className="text-sm text-stone-600">
          Cada colaborador recibe un correo con lo que tiene que llevar, el plazo para responder (
          {formatearFechaHora(semana.plazo_confirmacion)}) y dos enlaces: «Puedo llevarlo» y «No puedo esta vez». Si
          alguien no puede, sus alimentos pasan al siguiente colaborador disponible.
        </p>
        {propuestas.length === 0 ? (
          <p className="text-sm text-stone-600">Primero prepara el reparto.</p>
        ) : noDisponibles.length > 0 ? (
          <p role="alert" className="text-sm font-medium text-red-800">
            {noDisponibles.length === 1
              ? "En el reparto hay un colaborador que ya no está disponible: cámbialo antes de enviar."
              : `En el reparto hay ${noDisponibles.length} colaboradores que ya no están disponibles: cámbialos antes de enviar.`}
          </p>
        ) : (
          <FormularioEnviar accion={enviarSemanaAccion.bind(null, semana.id)} colaboradores={propuestas.length} />
        )}
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

  return (
    <>
      {semana.estado === "cerrada" && (
        <p className="text-sm text-stone-600">Semana cerrada: está en el histórico.</p>
      )}
      <p className="text-sm">
        {confirmadas} confirmada{confirmadas === 1 ? "" : "s"} · {esperando} esperando respuesta · {noPueden}{" "}
        {noPueden === 1 ? "no puede o no respondió" : "no pueden o no respondieron"}
      </p>
      {sinEnviar > 0 && (
        <div role="alert" className="flex flex-col gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm">
          <p className="font-medium text-red-900">
            {sinEnviar === 1 ? "Un correo no se ha podido enviar." : `${sinEnviar} correos no se han podido enviar.`}
          </p>
          <BotonAccion
            accion={reenviarAccion.bind(null, semana.id)}
            texto="Volver a intentarlo"
            textoEnviando="Enviando…"
          />
        </div>
      )}
      <ul className="-mx-4 flex flex-col divide-y divide-stone-200 border-y border-stone-200" aria-label="Respuestas">
        {asignaciones.map((a) => {
          const nombre = nombreVisible(a.colaborador);
          const estado = ESTADOS[a.estado];
          const lineas = agruparPorAlimento(a.items);
          return (
            <li key={a.id} className="flex flex-col gap-1 px-4 py-3" aria-label={nombre}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 break-words font-medium">{nombre}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${estado.clase}`}>{estado.texto}</span>
              </div>
              {a.sustituye_a && (
                <p className="text-xs text-stone-600">Sustituye a {nombrePorId.get(a.sustituye_a) ?? "otro colaborador"}</p>
              )}
              {lineas.length > 0 && (
                <p className="text-sm text-stone-700">
                  {lineas.map((l) => `${l.cantidad} × ${l.nombre}`).join(", ")} · {formatearEuros(costeCesta(a.items))}
                </p>
              )}
              <p className="text-xs text-stone-600">
                {a.estado === "pendiente" && !a.enviado_en
                  ? "Correo no enviado"
                  : a.respondido_en
                    ? `Respondió el ${formatearFechaHora(a.respondido_en)}`
                    : a.estado === "pendiente" && a.plazo
                      ? `Plazo: ${formatearFechaHora(a.plazo)}`
                      : null}
              </p>
              {a.estado === "confirmada" && entregaLlegada && (
                <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
                  {a.entregado ? (
                    <span className="font-medium text-emerald-800">Entregado</span>
                  ) : (
                    <span className="text-stone-600">Sin marcar como entregado</span>
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
                <div className="mt-1 flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                  <p className="font-medium text-amber-950">Sin cubrir: nadie lleva estos alimentos.</p>
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
        })}
      </ul>
      {semana.estado === "enviada" && entregaLlegada && (
        <div className="flex flex-col gap-2 border-t border-stone-200 pt-3">
          <h3 className="font-medium">Cerrar la semana</h3>
          <p className="text-sm text-stone-600">
            Si nadie la cierra, se cierra sola a los {DIAS_PARA_CERRAR} días de la entrega.
          </p>
          <FormularioCerrar accion={cerrarSemanaAccion.bind(null, semana.id)} />
        </div>
      )}
    </>
  );
}
