import type { Metadata } from "next";
import Link from "next/link";
import { requerirAdmin } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formatearEuros } from "@/lib/dominio/catalogo";
import { formatearFecha } from "@/lib/fechas";
import { listarSemanas } from "@/lib/servicios/semanas";
import { Aviso } from "../_ui/aviso";
import { BOTON_PRINCIPAL } from "../_ui/estilos";
import { EstadoSemanaEtiqueta } from "./estado-semana";

export const metadata: Metadata = { title: "Semanas · Cesta solidaria" };

const AVISOS = { eliminada: "Semana eliminada con sus cestas." };

export default async function PaginaSemanas({ searchParams }: PageProps<"/semanas">) {
  await requerirAdmin();
  const { aviso } = await searchParams;
  const semanas = await listarSemanas(await crearClienteServidor());

  return (
    <section className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Semanas</h1>
        <Link href="/semanas/nueva" className={BOTON_PRINCIPAL}>
          Nueva semana
        </Link>
      </div>
      <p className="text-sm text-stone-600">
        Cada semana tiene su fecha de entrega, el precio base por colaborador y las cestas de las
        familias.
      </p>
      <Aviso clave={aviso} textos={AVISOS} />

      {!semanas.ok ? (
        <p role="alert" className="text-red-700">
          No se han podido cargar las semanas. Recarga la página.
        </p>
      ) : semanas.valor.length === 0 ? (
        <p className="text-stone-600">Todavía no hay semanas.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
          {semanas.valor.map((s) => (
            <li key={s.id}>
              <Link
                href={`/semanas/${s.id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-stone-50"
              >
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  Entrega del {formatearFecha(s.fecha_entrega)}
                  <EstadoSemanaEtiqueta estado={s.estado} />
                </span>
                <span className="text-sm text-stone-600">
                  {s.cestas} cesta{s.cestas === 1 ? "" : "s"} · {formatearEuros(s.precio_base)} por colaborador
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
