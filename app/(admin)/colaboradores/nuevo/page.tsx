import type { Metadata } from "next";
import Link from "next/link";
import { requerirAdmin } from "@/lib/auth";
import { crearColaboradorAccion } from "../acciones";
import { FormularioColaborador } from "../formularios";

export const metadata: Metadata = { title: "Nuevo colaborador · Cesta solidaria" };

export default async function PaginaNuevoColaborador() {
  await requerirAdmin();

  return (
    <section className="flex max-w-xl flex-col gap-4">
      <Link href="/colaboradores" className="text-sm text-emerald-800 hover:underline">
        ← Colaboradores
      </Link>
      <h1 className="text-2xl font-semibold">Nuevo colaborador</h1>
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <FormularioColaborador
          accion={crearColaboradorAccion}
          pedirConsentimiento
          textoBoton="Dar de alta"
        />
      </div>
    </section>
  );
}
