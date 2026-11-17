import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirAdmin } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formatearDia, hoyEnMadrid } from "@/lib/fechas";
import { obtenerColaborador } from "@/lib/servicios/colaboradores";
import {
  darDeBajaAccion,
  eliminarAccion,
  guardarDatosAccion,
  pausarAccion,
  reactivarAccion,
} from "../acciones";
import { BotonAccion, FormularioColaborador, FormularioEliminar, FormularioPausa } from "../formularios";
import { EtiquetaEstado } from "../etiqueta-estado";
import { Tarjeta } from "../../_ui/tarjeta";

export const metadata: Metadata = { title: "Colaborador · Cesta solidaria" };

const AVISOS: Record<string, string> = {
  guardado: "Datos guardados.",
  pausado: "Colaborador en pausa.",
  activo: "Colaborador activo.",
  baja: "Colaborador dado de baja. No se le asignará nada ni recibirá más correos.",
};

export default async function PaginaColaborador({ params, searchParams }: PageProps<"/colaboradores/[id]">) {
  await requerirAdmin();
  const { id } = await params;
  const { aviso } = await searchParams;
  const avisoTexto = typeof aviso === "string" ? AVISOS[aviso] : undefined;

  const resultado = await obtenerColaborador(await crearClienteServidor(), id);
  if (!resultado.ok) {
    if (resultado.error === "no_encontrado") notFound();
    throw new Error("No se ha podido cargar el colaborador");
  }
  const c = resultado.valor;

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Link href="/colaboradores" className="text-sm font-medium text-emerald-800 hover:underline">
        ← Colaboradores
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="break-words text-3xl font-bold">{c.nombre}</h1>
        <div>
          <EtiquetaEstado colaborador={c} />
        </div>
        <p className="text-sm text-stone-600">
          {c.fecha_consentimiento
            ? `Consentimiento registrado el ${formatearDia(c.fecha_consentimiento)}.`
            : "Sin consentimiento registrado."}
        </p>
      </div>

      {avisoTexto && (
        <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-950">
          {avisoTexto}
        </p>
      )}

      <Tarjeta titulo="Datos">
        {/* key: al guardar, el formulario se vuelve a montar con los datos nuevos. */}
        <FormularioColaborador
          key={`${c.nombre}|${c.email}|${c.notas ?? ""}|${c.fecha_consentimiento ?? ""}`}
          accion={guardarDatosAccion.bind(null, c.id)}
          colaborador={c}
          pedirConsentimiento={!c.fecha_consentimiento}
          textoBoton="Guardar cambios"
        />
      </Tarjeta>

      <Tarjeta titulo="Estado">
        {c.estado === "activo" && (
          <>
            <p className="text-sm text-stone-600">
              Recibe alimentos cuando le toca. Si se va de vacaciones o no puede durante un
              tiempo, ponlo en pausa.
            </p>
            <FormularioPausa accion={pausarAccion.bind(null, c.id)} hoy={hoyEnMadrid()} />
          </>
        )}
        {c.estado === "pausado" && (
          <>
            <p className="text-sm text-stone-600">
              Mientras está en pausa no se le asigna nada. Puedes reactivarlo ya o cambiar la
              fecha de vuelta.
            </p>
            <BotonAccion accion={reactivarAccion.bind(null, c.id)} texto="Reactivar ya" />
            <FormularioPausa accion={pausarAccion.bind(null, c.id)} hoy={hoyEnMadrid()} />
          </>
        )}
        {c.estado === "baja" ? (
          <>
            <p className="text-sm text-stone-600">
              Está de baja: no se le asigna nada y no recibe correos. Reactívalo solo si te ha
              pedido volver.
            </p>
            <BotonAccion accion={reactivarAccion.bind(null, c.id)} texto="Reactivar" />
          </>
        ) : (
          <div className="border-t border-stone-200 pt-3">
            <p className="mb-2 text-sm text-stone-600">
              Si ya no quiere colaborar, dale de baja: deja de recibir correos y se conserva su
              historial.
            </p>
            <BotonAccion accion={darDeBajaAccion.bind(null, c.id)} texto="Dar de baja" />
          </div>
        )}
      </Tarjeta>

      <Tarjeta titulo="Eliminar definitivamente">
        <p className="text-sm text-stone-600">
          Si te pide que borres sus datos, elimínalo: se borran su nombre y su correo. Las
          semanas en que participó se conservan, a nombre de «Colaborador eliminado».
        </p>
        <FormularioEliminar accion={eliminarAccion.bind(null, c.id)} />
      </Tarjeta>
    </div>
  );
}
