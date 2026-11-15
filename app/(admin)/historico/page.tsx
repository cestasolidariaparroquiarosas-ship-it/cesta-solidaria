import type { Metadata } from "next";
import Link from "next/link";
import { requerirAdmin } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { recuento } from "@/lib/dominio/inicio";
import { formatearFecha, fechaHoraEnMadrid } from "@/lib/fechas";
import { listarCerradas } from "@/lib/servicios/historico";

export const metadata: Metadata = { title: "Histórico · Cesta solidaria" };

/** Histórico (spec §5.7, CA-29): las semanas cerradas. El detalle está en cada semana. */
export default async function PaginaHistorico() {
  await requerirAdmin();
  const cerradas = await listarCerradas(await crearClienteServidor());

  return (
    <section className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Histórico</h1>
      <p className="text-sm text-stone-600">
        Las semanas cerradas, con quién llevó qué. A los 12 meses de cerrar una semana, los identificadores de las
        familias se cambian por «Cesta n.º 1», «Cesta n.º 2»…
      </p>

      {!cerradas.ok ? (
        <p role="alert" className="text-red-700">
          No se ha podido cargar el histórico. Recarga la página.
        </p>
      ) : cerradas.valor.length === 0 ? (
        <p className="text-stone-600">Todavía no hay semanas cerradas.</p>
      ) : (
        <ul
          className="flex flex-col divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white"
          aria-label="Semanas cerradas"
        >
          {cerradas.valor.map((s) => {
            const r = recuento(s.asignaciones);
            return (
              <li key={s.id}>
                <Link href={`/semanas/${s.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-stone-50">
                  <span className="font-medium">Entrega del {formatearFecha(s.fecha_entrega)}</span>
                  <span className="text-sm text-stone-600">
                    {r.confirmadas} confirmada{r.confirmadas === 1 ? "" : "s"} · {r.entregadas} entregada
                    {r.entregadas === 1 ? "" : "s"} · {r.noPueden} no {r.noPueden === 1 ? "pudo" : "pudieron"} · cerrada
                    el {formatearFecha(fechaHoraEnMadrid(s.cerrada_en).fecha)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
