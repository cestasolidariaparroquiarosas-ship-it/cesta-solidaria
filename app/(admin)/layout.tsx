import Link from "next/link";
import { requerirAdmin } from "@/lib/auth";
import { cerrarSesion } from "@/app/login/acciones";

// Las secciones se irán activando en los siguientes PR del plan.
const SECCIONES = [{ href: "/", nombre: "Inicio" }];

export default async function LayoutAdmin({ children }: LayoutProps<"/">) {
  const admin = await requerirAdmin();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="font-semibold text-emerald-800">Cesta solidaria</span>
          <nav className="flex flex-wrap gap-4 text-sm">
            {SECCIONES.map((s) => (
              <Link key={s.href} href={s.href} className="hover:underline">
                {s.nombre}
              </Link>
            ))}
          </nav>
          <form action={cerrarSesion} className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-stone-500 sm:inline">{admin.email}</span>
            <button type="submit" className="rounded-md border border-stone-300 px-3 py-1 hover:bg-stone-100">
              Salir
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4">{children}</main>
    </div>
  );
}
