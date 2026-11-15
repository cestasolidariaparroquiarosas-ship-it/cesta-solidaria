import type { Metadata } from "next";
import Link from "next/link";
import { formatearEuros } from "@/lib/dominio/catalogo";
import { formatearFecha, formatearFechaHora, formatearFechaLarga } from "@/lib/fechas";
import { crearClienteServicio } from "@/lib/supabase/servicio";
import { leerAsignacion } from "@/lib/servicios/respuestas";
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO } from "../../../(admin)/_ui/estilos";
import { responderAccion } from "../../acciones";

export const metadata: Metadata = { title: "Tu respuesta · Cesta solidaria" };

// Con "No puedo", la acción busca sustituto y le envía su correo en el momento.
export const maxDuration = 30;

/**
 * R4.2: abrir el enlace solo muestra el resumen (CA-15). La respuesta cuenta al pulsar
 * uno de los botones. CA-24: solo el nombre de pila, la fecha y los alimentos.
 */
export default async function PaginaRespuesta({ params, searchParams }: PageProps<"/r/[token]">) {
  const { token } = await params;
  const { respuesta, hecho } = await searchParams;
  const vista = await leerAsignacion(crearClienteServicio(), token);

  // CA-18: token que no existe o manipulado.
  if (!vista) {
    return (
      <>
        <h1 className="text-xl font-semibold">Este enlace no es válido</h1>
        <p className="text-stone-700">
          Puede que esté incompleto. Abre el enlace directamente desde el correo o contesta al correo para avisarnos.
        </p>
      </>
    );
  }

  const fecha = `${formatearFechaLarga(vista.fechaEntrega)} (${formatearFecha(vista.fechaEntrega)})`;
  const lista = vista.lineas.length > 0 && (
    <>
      <ul className="list-disc pl-5" aria-label="Alimentos">
        {vista.lineas.map((l) => (
          <li key={`${l.nombre}|${l.unidad}`}>
            {l.cantidad} × {l.nombre} ({l.unidad})
          </li>
        ))}
      </ul>
      <p className="text-sm text-stone-600">Gasto aproximado: {formatearEuros(vista.gasto)}.</p>
    </>
  );
  const baja = (
    <p className="border-t border-stone-200 pt-3 text-xs text-stone-500">
      ¿No quieres recibir más correos de la cesta?{" "}
      <Link href={`/baja/${token}`} className="underline">
        Darme de baja
      </Link>
    </p>
  );

  switch (vista.situacion) {
    case "confirmada":
      return (
        <>
          <div role="status">
            <h1 className="text-xl font-semibold">
              {hecho === "si" ? `¡Gracias, ${vista.nombre}!` : "Ya lo confirmaste"}
            </h1>
          </div>
          <p>Hemos anotado que llevarás estos alimentos para el {fecha}:</p>
          {lista}
          {baja}
        </>
      );
    case "rechazada":
      return (
        <>
          <div role="status">
            <h1 className="text-xl font-semibold">
              {hecho === "no" ? `Gracias por avisar, ${vista.nombre}` : "Ya respondiste"}
            </h1>
          </div>
          <p>Hemos anotado que esta vez no puedes. Se lo pediremos a otra persona.</p>
          {baja}
        </>
      );
    case "vencida":
      return (
        <>
          <h1 className="text-xl font-semibold">El plazo para responder ha terminado</h1>
          <p>
            {vista.plazo ? `Terminó el ${formatearFechaHora(vista.plazo)}. ` : ""}Si aún puedes ayudar, contesta al
            correo y te diremos si hace falta.
          </p>
          {baja}
        </>
      );
    case "no_disponible":
      return (
        <>
          <h1 className="text-xl font-semibold">Esta petición ya no está activa</h1>
          <p>No hace falta que hagas nada. Si tienes alguna duda, contesta al correo.</p>
        </>
      );
  }

  // Puede responder. El enlace del correo dice qué eligió; aun así se ofrecen los dos.
  const eligio = respuesta === "si" || respuesta === "no" ? respuesta : null;
  const botonSi = (
    <form action={responderAccion.bind(null, token, "si")}>
      <button type="submit" className={eligio === "no" ? BOTON_SECUNDARIO : BOTON_PRINCIPAL}>
        Sí, puedo llevarlo
      </button>
    </form>
  );
  const botonNo = (
    <form action={responderAccion.bind(null, token, "no")}>
      <button type="submit" className={eligio === "no" ? BOTON_PRINCIPAL : BOTON_SECUNDARIO}>
        No puedo esta vez
      </button>
    </form>
  );

  return (
    <>
      <h1 className="text-xl font-semibold">Hola, {vista.nombre}</h1>
      <p>Para la cesta solidaria del {fecha} te pedimos que lleves:</p>
      {lista}
      {vista.plazo && (
        <p>
          Responde antes del <strong>{formatearFechaHora(vista.plazo)}</strong>.
        </p>
      )}
      {eligio && (
        <p className="rounded-md bg-stone-100 px-3 py-2 text-sm">
          Has elegido «{eligio === "si" ? "Puedo llevarlo" : "No puedo esta vez"}». Pulsa el botón para confirmarlo.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {eligio === "no" ? (
          <>
            {botonNo}
            {botonSi}
          </>
        ) : (
          <>
            {botonSi}
            {botonNo}
          </>
        )}
      </div>
      {baja}
    </>
  );
}
