import type { Metadata } from "next";
import Link from "next/link";
import { requerirAdmin } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formatearEuros, textoContiene } from "@/lib/dominio/catalogo";
import { listarAlimentos, listarEtiquetas } from "@/lib/servicios/catalogo";
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO } from "../_ui/estilos";
import { Aviso } from "../_ui/aviso";

export const metadata: Metadata = { title: "Alimentos · Cesta solidaria" };

const AVISOS = {
  creado: "Alimento dado de alta.",
  eliminado: "Alimento eliminado.",
};

export default async function PaginaAlimentos({ searchParams }: PageProps<"/alimentos">) {
  await requerirAdmin();
  const { ver, aviso } = await searchParams;
  const todos = ver === "todos";

  const cliente = await crearClienteServidor();
  const [alimentos, etiquetas] = await Promise.all([
    listarAlimentos(cliente, { incluirInactivos: todos }),
    listarEtiquetas(cliente),
  ]);
  const nombreEtiqueta = new Map(etiquetas.ok ? etiquetas.valor.map((e) => [e.id, e.nombre]) : []);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Alimentos</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/alimentos/etiquetas" className={BOTON_SECUNDARIO}>
            Etiquetas
          </Link>
          <Link href="/alimentos/nuevo" className={BOTON_PRINCIPAL}>
            Nuevo alimento
          </Link>
        </div>
      </div>

      <Aviso clave={aviso} textos={AVISOS} />

      <p className="text-sm">
        {todos ? (
          <Link href="/alimentos" className="text-emerald-800 hover:underline">
            Ver solo los activos
          </Link>
        ) : (
          <Link href="/alimentos?ver=todos" className="text-emerald-800 hover:underline">
            Ver también los desactivados
          </Link>
        )}
      </p>

      {!alimentos.ok ? (
        <p role="alert" className="text-red-700">
          No se ha podido cargar el catálogo. Recarga la página.
        </p>
      ) : alimentos.valor.length === 0 ? (
        <p className="text-stone-600">Todavía no hay alimentos en el catálogo.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
          {alimentos.valor.map((a) => {
            const contiene = textoContiene(a.etiquetas.map((id) => nombreEtiqueta.get(id) ?? "?"));
            return (
              <li key={a.id}>
                <Link
                  href={`/alimentos/${a.id}`}
                  className="flex flex-col gap-1 px-4 py-3 hover:bg-stone-50 sm:flex-row sm:items-center sm:gap-4"
                >
                  <span className="min-w-0 sm:w-2/5">
                    <span className="block truncate font-medium">
                      {a.nombre}
                      {!a.activo && (
                        <span className="ml-2 rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-700">
                          Desactivado
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-sm text-stone-600">{a.unidad}</span>
                  </span>
                  <span className="text-sm sm:w-1/5">{formatearEuros(a.precio_aprox)}</span>
                  <span className="text-sm text-stone-600 sm:w-2/5">{contiene}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
