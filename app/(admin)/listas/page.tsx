import type { Metadata } from "next";
import Link from "next/link";
import { requerirAdmin } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { listarListas } from "@/lib/servicios/catalogo";
import { crearListaAccion } from "./acciones";
import { FormularioNombreLista } from "./formularios";
import { Aviso } from "../_ui/aviso";
import { Etiqueta } from "../_ui/etiqueta";

export const metadata: Metadata = { title: "Listas base · Cesta solidaria" };

const AVISOS = { eliminada: "Lista eliminada." };

export default async function PaginaListas({ searchParams }: PageProps<"/listas">) {
  await requerirAdmin();
  const { aviso } = await searchParams;
  const listas = await listarListas(await crearClienteServidor());

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">Listas base</h1>
      <p className="text-sm text-stone-600">
        Plantillas para proponer cada cesta: qué alimentos y cuántas unidades al mes por adulto y por
        niño. La predeterminada es la que se usa si no eliges otra.
      </p>
      <Aviso clave={aviso} textos={AVISOS} />

      {!listas.ok ? (
        <p role="alert" className="text-red-700">
          No se han podido cargar las listas. Recarga la página.
        </p>
      ) : listas.valor.length === 0 ? (
        <p className="text-stone-600">Todavía no hay listas base.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-300 bg-white shadow-sm [&>li:nth-child(even)]:bg-stone-50">
          {listas.valor.map((l) => (
            <li key={l.id}>
              <Link
                href={`/listas/${l.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-emerald-50"
              >
                <span className="min-w-0 font-medium">
                  {l.nombre}
                  {l.predeterminada && (
                    <span className="ml-2">
                      <Etiqueta tono="verde">Predeterminada</Etiqueta>
                    </span>
                  )}
                </span>
                <span className="text-sm text-stone-600">
                  {l.alimentos} alimento{l.alimentos === 1 ? "" : "s"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-xl border border-stone-300 bg-white p-4 shadow-sm">
        <FormularioNombreLista accion={crearListaAccion} etiqueta="Nueva lista" textoBoton="Crear lista" />
      </div>
    </section>
  );
}
