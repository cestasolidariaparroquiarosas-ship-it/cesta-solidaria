import Link from "next/link";
import { requerirAdmin } from "@/lib/auth";
import { cerrarSesion } from "@/app/login/acciones";
import { IconoCesta } from "./_ui/iconos";
import { Menu } from "./_ui/menu";

export default async function LayoutAdmin({ children }: LayoutProps<"/">) {
  const admin = await requerirAdmin();

  return (
    <div className="flex flex-1 flex-col">
      {/* Escritorio: nombre, secciones y Salir en una fila. Móvil: nombre y Salir arriba, y
          las secciones debajo en una fila que se desliza (spec 0003 §2). */}
      <header className="bg-emerald-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2">
          <Link href="/" className="order-1 flex items-center gap-2 py-1 text-lg font-bold text-white">
            <IconoCesta className="size-6 text-emerald-300" />
            Cesta solidaria
          </Link>
          <form action={cerrarSesion} className="order-2 ml-auto flex items-center gap-3 text-sm sm:order-3">
            <span className="hidden text-emerald-100 xl:inline">{admin.email}</span>
            <button
              type="submit"
              className="min-h-10 rounded-lg border border-emerald-300 px-3 text-white hover:bg-emerald-800"
            >
              Salir
            </button>
          </form>
          <div className="order-3 -mx-4 w-[calc(100%+2rem)] sm:order-2 sm:mx-0 sm:w-auto">
            <Menu />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
