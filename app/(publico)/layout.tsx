import type { Metadata } from "next";
import { Franja } from "@/app/_comun/franja";

// Páginas públicas de los enlaces del correo (R4.2, R5.1). Sin sesión: lo que se ve lo
// decide el token. Sin menú de gestión y sin enviar la dirección (con el token) a
// ninguna otra web.
export const metadata: Metadata = { referrer: "no-referrer" };

export default function LayoutPublico({ children }: LayoutProps<"/">) {
  return (
    <>
      <Franja />
      <main className="flex flex-1 items-start justify-center p-4 sm:items-center">
        <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-stone-300 bg-white p-6 shadow-sm">
          {children}
        </div>
      </main>
    </>
  );
}
