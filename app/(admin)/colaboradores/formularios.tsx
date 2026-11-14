"use client";

import { useActionState } from "react";
import { LIMITES, type Colaborador } from "@/lib/dominio/colaboradores";
import type { EstadoFormulario } from "./acciones";
import { BOTON_PELIGRO, BOTON_PRINCIPAL, BOTON_SECUNDARIO, ENTRADA } from "../_ui/estilos";
import { Campo, Casilla, ErrorGeneral } from "../_ui/campos";

type Accion = (estado: EstadoFormulario, formData: FormData) => Promise<EstadoFormulario>;

/** Alta y edición de nombre, correo y notas. */
export function FormularioColaborador({
  accion,
  colaborador,
  pedirConsentimiento,
  textoBoton,
}: {
  accion: Accion;
  colaborador?: Pick<Colaborador, "nombre" | "email" | "notas">;
  pedirConsentimiento: boolean;
  textoBoton: string;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const errores = estado.errores ?? {};
  // Tras un error se vuelve a mostrar lo enviado; si no, los datos guardados.
  const valores = estado.valores ?? {
    nombre: colaborador?.nombre ?? "",
    email: colaborador?.email ?? "",
    notas: colaborador?.notas ?? "",
    consentimiento: false,
  };

  return (
    <form action={enviar} className="flex flex-col gap-4" noValidate>
      <Campo etiqueta="Nombre" error={errores.nombre}>
        {(props) => (
          <input
            {...props}
            name="nombre"
            defaultValue={valores.nombre}
            required
            maxLength={LIMITES.nombre}
            autoComplete="off"
            className={ENTRADA}
          />
        )}
      </Campo>
      <Campo etiqueta="Correo electrónico" error={errores.email}>
        {(props) => (
          <input
            {...props}
            name="email"
            type="email"
            defaultValue={valores.email}
            required
            maxLength={LIMITES.email}
            autoComplete="off"
            className={ENTRADA}
          />
        )}
      </Campo>
      <Campo
        etiqueta="Notas (opcional)"
        ayuda="Solo lo necesario para organizar la cesta. No anotes datos de salud ni de religión."
        error={errores.notas}
      >
        {(props) => (
          <textarea
            {...props}
            name="notas"
            defaultValue={valores.notas}
            rows={3}
            maxLength={LIMITES.notas}
            className={ENTRADA}
          />
        )}
      </Campo>
      {pedirConsentimiento && (
        <Casilla
          nombre="consentimiento"
          texto="Me ha dado su consentimiento para guardar su nombre y su correo y escribirle para organizar la cesta. Sabe que puede darse de baja cuando quiera."
          error={errores.consentimiento}
          marcada={valores.consentimiento}
        />
      )}
      <ErrorGeneral estado={estado} destacar="email" />
      <div>
        <button type="submit" disabled={enviando} className={BOTON_PRINCIPAL}>
          {enviando ? "Guardando…" : textoBoton}
        </button>
      </div>
    </form>
  );
}

/** Formulario de un solo botón (reactivar, dar de baja). */
export function BotonAccion({
  accion,
  texto,
  peligro = false,
}: {
  accion: Accion;
  texto: string;
  peligro?: boolean;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  return (
    <form action={enviar} className="flex flex-col gap-2">
      <div>
        <button type="submit" disabled={enviando} className={peligro ? BOTON_PELIGRO : BOTON_SECUNDARIO}>
          {texto}
        </button>
      </div>
      <ErrorGeneral estado={estado} />
    </form>
  );
}

export function FormularioPausa({ accion, hoy }: { accion: Accion; hoy: string }) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  return (
    <form action={enviar} className="flex flex-col gap-2">
      <Campo
        etiqueta="En pausa hasta (incluido)"
        ayuda="Volverá a recibir alimentos en las semanas con entrega posterior a esa fecha. Déjala vacía si no sabes cuándo vuelve: seguirá en pausa hasta que lo reactives."
        error={estado.errores?.pausado_hasta}
      >
        {(props) => (
          <input {...props} type="date" name="pausado_hasta" min={hoy} className={`${ENTRADA} max-w-48`} />
        )}
      </Campo>
      <ErrorGeneral estado={estado} />
      <div>
        <button type="submit" disabled={enviando} className={BOTON_SECUNDARIO}>
          Poner en pausa
        </button>
      </div>
    </form>
  );
}

export function FormularioEliminar({ accion }: { accion: Accion }) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  return (
    <form action={enviar} className="flex flex-col gap-3">
      <Casilla
        nombre="confirmar"
        texto="Entiendo que se borrarán su nombre y su correo y que no se puede deshacer."
      />
      <ErrorGeneral estado={estado} />
      <div>
        <button type="submit" disabled={enviando} className={BOTON_PELIGRO}>
          Eliminar definitivamente
        </button>
      </div>
    </form>
  );
}
