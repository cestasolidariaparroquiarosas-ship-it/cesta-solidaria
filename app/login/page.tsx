import type { Metadata } from "next";
import { Franja } from "@/app/_comun/franja";
import { FormularioLogin } from "./formulario";

export const metadata: Metadata = { title: "Entrar · Cesta solidaria" };

export default function PaginaLogin() {
  return (
    <>
      <Franja />
      <main className="flex flex-1 items-start justify-center p-4 sm:items-center">
        <div className="w-full max-w-sm overflow-hidden rounded-xl border border-stone-300 bg-white shadow-sm">
          <div className="border-b border-stone-300 bg-stone-100 px-6 py-4">
            <h1 className="text-2xl font-bold">Cesta solidaria</h1>
            <p className="text-stone-700">Acceso para administradores</p>
          </div>
          <div className="p-6">
            <FormularioLogin />
          </div>
        </div>
      </main>
    </>
  );
}
