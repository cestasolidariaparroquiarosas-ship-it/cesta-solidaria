"use client";

import { useActionState } from "react";
import { formatearEuros } from "@/lib/dominio/catalogo";
import { LIMITES_CESTA } from "@/lib/dominio/cesta";
import { Campo, Casilla, ErrorGeneral } from "../_ui/campos";
import { BOTON_PELIGRO, BOTON_PRINCIPAL, BOTON_SECUNDARIO, ENTRADA } from "../_ui/estilos";
import type { EstadoSemanas } from "./acciones";

type Accion = (estado: EstadoSemanas, formData: FormData) => Promise<EstadoSemanas>;

const NUMERO = `${ENTRADA} w-24`;

/** Para las filas de una semana ya enviada, que no tienen acciones. */
const SIN_ACCION: Accion = async () => ({});

function texto(v: EstadoSemanas["valores"], campo: string, porDefecto: string): string {
  const valor = v?.[campo];
  return typeof valor === "string" ? valor : porDefecto;
}

// ---------------------------------------------------------------------------
// Semana (paso 1: datos)
// ---------------------------------------------------------------------------

export type ValoresSemana = { fecha_entrega: string; precio_base: string; plazo_fecha: string; plazo_hora: string };

export function FormularioSemana({
  accion,
  inicial,
  hoy,
  textoBoton,
}: {
  accion: Accion;
  inicial: ValoresSemana;
  hoy: string;
  textoBoton: string;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const errores = estado.errores ?? {};
  const v = estado.valores;

  return (
    <form action={enviar} className="flex flex-col gap-4" noValidate>
      <Campo
        etiqueta="Fecha de entrega"
        ayuda="El día en que los colaboradores llevan los alimentos."
        error={errores.fecha_entrega}
      >
        {(props) => (
          <input
            {...props}
            type="date"
            name="fecha_entrega"
            min={hoy}
            defaultValue={texto(v, "fecha_entrega", inicial.fecha_entrega)}
            className={`${ENTRADA} max-w-48`}
          />
        )}
      </Campo>
      <Campo
        etiqueta="Precio base (€)"
        ayuda="Lo que se pide gastar a cada colaborador, más o menos."
        error={errores.precio_base}
      >
        {(props) => (
          <input
            {...props}
            name="precio_base"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={texto(v, "precio_base", inicial.precio_base)}
            className={`${ENTRADA} max-w-40`}
          />
        )}
      </Campo>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Plazo para responder</legend>
        <p className="text-sm text-stone-600">
          Hora de Madrid. Tiene que terminar antes del día de la entrega.
        </p>
        <div className="flex flex-wrap gap-4">
          <Campo etiqueta="Día del plazo" error={errores.plazo_fecha}>
            {(props) => (
              <input
                {...props}
                type="date"
                name="plazo_fecha"
                min={hoy}
                defaultValue={texto(v, "plazo_fecha", inicial.plazo_fecha)}
                className={`${ENTRADA} max-w-48`}
              />
            )}
          </Campo>
          <Campo etiqueta="Hora del plazo" error={errores.plazo_hora}>
            {(props) => (
              <input
                {...props}
                type="time"
                name="plazo_hora"
                defaultValue={texto(v, "plazo_hora", inicial.plazo_hora)}
                className={`${ENTRADA} max-w-36`}
              />
            )}
          </Campo>
        </div>
      </fieldset>
      <ErrorGeneral estado={estado} destacar="fecha_entrega" />
      <div>
        <button type="submit" disabled={enviando} className={BOTON_PRINCIPAL}>
          {enviando ? "Guardando…" : textoBoton}
        </button>
      </div>
    </form>
  );
}

/** Casilla de confirmación y botón rojo. */
export function FormularioEliminar({ accion, texto: textoCasilla, boton }: { accion: Accion; texto: string; boton: string }) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  return (
    <form action={enviar} className="flex flex-col gap-3">
      <Casilla nombre="confirmar" texto={textoCasilla} />
      <ErrorGeneral estado={estado} />
      <div>
        <button type="submit" disabled={enviando} className={BOTON_PELIGRO}>
          {boton}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Cesta: datos de la familia
// ---------------------------------------------------------------------------

export type ValoresCesta = {
  identificador_receptor: string;
  adultos: string;
  ninos: string;
  lista_base_id: string;
  exclusiones: string[];
};

export function FormularioCesta({
  accion,
  inicial,
  listas,
  etiquetas,
  textoBoton,
  conRecalcular = false,
}: {
  accion: Accion;
  inicial: ValoresCesta;
  listas: { id: string; nombre: string }[];
  etiquetas: { id: string; nombre: string }[];
  textoBoton: string;
  /** En la edición: casilla para volver a proponer los alimentos con la lista base. */
  conRecalcular?: boolean;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const errores = estado.errores ?? {};
  const v = estado.valores;
  const exclusiones = Array.isArray(v?.exclusiones) ? v.exclusiones : inicial.exclusiones;

  return (
    <form action={enviar} className="flex flex-col gap-4" noValidate>
      <Campo
        etiqueta="Identificador"
        ayuda="Solo un identificador, como «Familia 12». Ni nombres ni datos personales."
        error={errores.identificador_receptor}
      >
        {(props) => (
          <input
            {...props}
            name="identificador_receptor"
            maxLength={LIMITES_CESTA.identificador}
            autoComplete="off"
            defaultValue={texto(v, "identificador_receptor", inicial.identificador_receptor)}
            className={`${ENTRADA} max-w-sm`}
          />
        )}
      </Campo>
      <div className="flex flex-wrap gap-4">
        <Campo etiqueta="Adultos" error={errores.adultos}>
          {(props) => (
            <input
              {...props}
              name="adultos"
              inputMode="numeric"
              autoComplete="off"
              defaultValue={texto(v, "adultos", inicial.adultos)}
              className={NUMERO}
            />
          )}
        </Campo>
        <Campo etiqueta="Niños" error={errores.ninos}>
          {(props) => (
            <input
              {...props}
              name="ninos"
              inputMode="numeric"
              autoComplete="off"
              defaultValue={texto(v, "ninos", inicial.ninos)}
              className={NUMERO}
            />
          )}
        </Campo>
      </div>
      <Campo etiqueta="Lista base" error={errores.lista_base_id}>
        {(props) => (
          <select
            {...props}
            name="lista_base_id"
            defaultValue={texto(v, "lista_base_id", inicial.lista_base_id)}
            className={`${ENTRADA} max-w-full`}
          >
            <option value="">Sin lista (la cesta empieza vacía)</option>
            {listas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </select>
        )}
      </Campo>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Exclusiones</legend>
        <p className="text-sm text-stone-600">
          Lo que esta familia no puede recibir. Son restricciones alimentarias: no anotes el motivo.
        </p>
        {etiquetas.length === 0 ? (
          <p className="text-sm text-stone-600">No hay etiquetas de exclusión.</p>
        ) : (
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {etiquetas.map((e) => (
              <Casilla
                key={e.id}
                nombre="exclusiones"
                valor={e.id}
                texto={`Sin ${e.nombre}`}
                marcada={exclusiones.includes(e.id)}
              />
            ))}
          </div>
        )}
      </fieldset>
      {conRecalcular && (
        <Casilla
          nombre="recalcular"
          marcada={texto(v, "recalcular", "") === "si"}
          texto="Volver a proponer los alimentos con la lista base y estos datos. Se pierden los cambios hechos a mano y se toman los precios actuales."
        />
      )}
      <ErrorGeneral estado={estado} destacar="identificador_receptor" />
      <div>
        <button type="submit" disabled={enviando} className={BOTON_PRINCIPAL}>
          {enviando ? "Guardando…" : textoBoton}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Cesta: alimentos
// ---------------------------------------------------------------------------

/** R1.3: añadir un alimento a mano. Si choca con las exclusiones, no se guarda (CA-07). */
export function FormularioAnadirACesta({
  accion,
  alimentos,
}: {
  accion: Accion;
  alimentos: { id: string; nombre: string; unidad: string; contiene: string }[];
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const errores = estado.errores ?? {};
  const v = estado.valores;
  if (alimentos.length === 0) {
    return <p className="text-sm text-stone-600">Ya están todos los alimentos activos del catálogo.</p>;
  }
  return (
    <form action={enviar} className="flex flex-col gap-3" noValidate aria-label="Añadir un alimento">
      <Campo etiqueta="Alimento" error={errores.alimento_id}>
        {(props) => (
          <select {...props} name="alimento_id" defaultValue={texto(v, "alimento_id", "")} className={`${ENTRADA} max-w-full`}>
            <option value="">Elige un alimento…</option>
            {alimentos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre} ({a.unidad}){a.contiene ? ` · ${a.contiene}` : ""}
              </option>
            ))}
          </select>
        )}
      </Campo>
      <Campo etiqueta="Cantidad" error={errores.cantidad}>
        {(props) => (
          <input
            {...props}
            name="cantidad"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={texto(v, "cantidad", "1")}
            className={NUMERO}
          />
        )}
      </Campo>
      <ErrorGeneral estado={estado} destacar="alimento_id" />
      <div>
        <button type="submit" disabled={enviando} className={BOTON_PRINCIPAL}>
          Añadir a la cesta
        </button>
      </div>
    </form>
  );
}

export type FilaCesta = {
  id: string;
  nombre: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
  /** "Contiene cerdo", si choca con las exclusiones de la cesta. */
  choque?: string;
};

/** Un alimento de la cesta: cambiar su cantidad o quitarlo (solo en preparación). */
export function FilaAlimentoCesta({
  item,
  guardar,
  quitar,
}: {
  item: FilaCesta;
  guardar?: Accion;
  quitar?: Accion;
}) {
  const [estado, enviar, guardando] = useActionState(guardar ?? SIN_ACCION, {});
  const [estadoQuitar, enviarQuitar, quitando] = useActionState(quitar ?? SIN_ACCION, {});
  const nombre = `${item.nombre} (${item.unidad})`;
  const total = formatearEuros((item.cantidad * Math.round(item.precio_unitario * 100)) / 100);

  return (
    <li className={`flex flex-col gap-2 px-4 py-3 ${item.choque ? "bg-red-50" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="font-medium">
          {guardar ? "" : `${item.cantidad} × `}
          {nombre}
        </p>
        <p className="text-sm text-stone-600">
          {formatearEuros(item.precio_unitario)} c/u · {total}
        </p>
      </div>
      {item.choque && (
        <p className="text-sm font-medium text-red-800">
          Choca con las exclusiones de la cesta: ahora el catálogo dice «{item.choque}». Quítalo.
        </p>
      )}
      {guardar && quitar && (
        <div className="flex flex-wrap items-end gap-3">
          <form action={enviar} className="flex flex-wrap items-end gap-3" noValidate aria-label={`Cantidad de ${nombre}`}>
            <Campo etiqueta="Cantidad" error={estado.errores?.cantidad}>
              {(props) => (
                <input
                  {...props}
                  name="cantidad"
                  inputMode="numeric"
                  defaultValue={texto(estado.valores, "cantidad", String(item.cantidad))}
                  className={NUMERO}
                />
              )}
            </Campo>
            <button type="submit" disabled={guardando} className={BOTON_SECUNDARIO} aria-label={`Guardar cantidad de ${nombre}`}>
              Guardar
            </button>
          </form>
          <form action={enviarQuitar}>
            <button type="submit" disabled={quitando} className={BOTON_SECUNDARIO} aria-label={`Quitar ${nombre}`}>
              Quitar
            </button>
          </form>
        </div>
      )}
      <ErrorGeneral estado={estado} />
      <ErrorGeneral estado={estadoQuitar} />
    </li>
  );
}
