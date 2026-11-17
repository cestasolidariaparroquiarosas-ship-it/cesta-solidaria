import type { Metadata } from "next";
import { crearClienteServicio } from "@/lib/supabase/servicio";
import { leerColaboradorDelToken } from "@/lib/servicios/respuestas";
import { BOTON_PRINCIPAL } from "../../../(admin)/_ui/estilos";
import { darDeBajaAccion } from "../../acciones";

export const metadata: Metadata = { title: "Baja · Cesta solidaria" };

// Si tenía alimentos pendientes de confirmar, se buscan sustitutos y se les escribe.
export const maxDuration = 30;

/** R5.1 (CA-22): abrir el enlace solo pregunta; la baja cuenta al pulsar el botón. */
export default async function PaginaBaja({ params, searchParams }: PageProps<"/baja/[token]">) {
  const { token } = await params;
  const { hecho } = await searchParams;
  const colaborador = await leerColaboradorDelToken(crearClienteServicio(), token);

  if (!colaborador) {
    return (
      <>
        <h1 className="text-2xl font-bold">Este enlace no es válido</h1>
        <p className="text-stone-700">
          Puede que esté incompleto, o que tus datos ya se hayan borrado. Si quieres darte de baja, contesta a
          cualquiera de nuestros correos.
        </p>
      </>
    );
  }

  if (colaborador.deBaja) {
    return (
      <>
        <div role="status">
          <h1 className="text-2xl font-bold">
            {hecho ? `Te hemos dado de baja, ${colaborador.nombre}` : "Ya estás de baja"}
          </h1>
        </div>
        <p>No volverás a recibir correos de la cesta solidaria. Gracias por tu ayuda.</p>
        <p className="text-sm text-stone-600">
          Si quieres que borremos también tu nombre y tu correo, o volver a colaborar algún día, contesta a cualquiera
          de nuestros correos.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold">Hola, {colaborador.nombre}</h1>
      <p>¿Quieres dejar de recibir correos de la cesta solidaria?</p>
      <p className="text-sm text-stone-600">
        Si tenías alimentos pendientes de confirmar, se los pediremos a otra persona. Lo que ya confirmaste se mantiene;
        si al final no puedes llevarlo, contesta al correo para avisarnos.
      </p>
      <form action={darDeBajaAccion.bind(null, token)}>
        <button type="submit" className={BOTON_PRINCIPAL}>
          Darme de baja
        </button>
      </form>
    </>
  );
}
