import type { Metadata } from "next";
import Link from "next/link";
import { requerirAdmin } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formatearFecha } from "@/lib/fechas";
import { ESTADOS_COLABORADOR, NOMBRE_ESTADO, esEstadoColaborador } from "@/lib/dominio/colaboradores";
import { listarColaboradores } from "@/lib/servicios/colaboradores";
import { BOTON_PRINCIPAL } from "./estilos";
import { EtiquetaEstado } from "./etiqueta-estado";

export const metadata: Metadata = { title: "Colaboradores · Cesta solidaria" };

const AVISOS: Record<string, string> = {
  creado: "Colaborador dado de alta.",
  eliminado: "Colaborador eliminado. Su nombre y su correo se han borrado.",
};

const FILTROS = [
  { valor: undefined, nombre: "Todos" },
  ...ESTADOS_COLABORADOR.map((e) => ({ valor: e, nombre: NOMBRE_ESTADO[e] })),
];

export default async function PaginaColaboradores({ searchParams }: PageProps<"/colaboradores">) {
  await requerirAdmin();
  const { estado: estadoParam, aviso } = await searchParams;
  const estado = esEstadoColaborador(estadoParam) ? estadoParam : undefined;

  const resultado = await listarColaboradores(await crearClienteServidor(), estado);
  const avisoTexto = typeof aviso === "string" ? AVISOS[aviso] : undefined;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Colaboradores</h1>
        <Link href="/colaboradores/nuevo" className={BOTON_PRINCIPAL}>
          Nuevo colaborador
        </Link>
      </div>

      {avisoTexto && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {avisoTexto}
        </p>
      )}

      <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-2 text-sm">
        {FILTROS.map((f) => {
          const actual = f.valor === estado;
          return (
            <Link
              key={f.nombre}
              href={f.valor ? `/colaboradores?estado=${f.valor}` : "/colaboradores"}
              aria-current={actual ? "page" : undefined}
              className={`rounded-full border px-3 py-1 ${
                actual ? "border-emerald-700 bg-emerald-700 text-white" : "border-stone-300 bg-white hover:bg-stone-100"
              }`}
            >
              {f.nombre}
            </Link>
          );
        })}
      </nav>

      {!resultado.ok ? (
        <p role="alert" className="text-red-700">
          No se ha podido cargar la lista. Recarga la página.
        </p>
      ) : resultado.valor.length === 0 ? (
        <p className="text-stone-600">
          {estado ? "No hay colaboradores con este estado." : "Todavía no hay colaboradores."}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
          {resultado.valor.map((c) => (
            <li key={c.id}>
              <Link
                href={`/colaboradores/${c.id}`}
                className="flex flex-col gap-1 px-4 py-3 hover:bg-stone-50 sm:flex-row sm:items-center sm:gap-4"
              >
                <span className="min-w-0 sm:w-1/3">
                  <span className="block truncate font-medium">{c.nombre}</span>
                  <span className="block truncate text-sm text-stone-600">{c.email}</span>
                </span>
                <span className="sm:w-1/3">
                  <EtiquetaEstado colaborador={c} />
                </span>
                <span className="text-sm text-stone-600 sm:w-1/3 sm:text-right">
                  {c.ultima_participacion
                    ? `Última vez: ${formatearFecha(c.ultima_participacion)}`
                    : "Aún no ha participado"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
