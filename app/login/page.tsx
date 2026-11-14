import type { Metadata } from "next";
import { FormularioLogin } from "./formulario";

export const metadata: Metadata = { title: "Entrar · Cesta solidaria" };

export default function PaginaLogin() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold">Cesta solidaria</h1>
        <p className="mb-6 text-sm text-stone-600">Acceso para administradores</p>
        <FormularioLogin />
      </div>
    </main>
  );
}
