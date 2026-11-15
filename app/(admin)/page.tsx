import type { Metadata } from "next";
import { requerirAdmin } from "@/lib/auth";
import { ProbarCorreo } from "./_inicio/probar-correo";

export const metadata: Metadata = { title: "Inicio · Cesta solidaria" };

export default async function Inicio() {
  await requerirAdmin();

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <section>
        <h1 className="mb-2 text-2xl font-semibold">Inicio</h1>
        <p className="text-stone-600">
          Aquí verás el estado de la semana en curso. El resumen llegará en una próxima versión.
        </p>
      </section>
      <section className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Correo</h2>
        <p className="text-sm text-stone-600">
          Comprueba que los correos salen bien: se envía uno de prueba a la dirección del administrador.
        </p>
        <ProbarCorreo />
      </section>
    </div>
  );
}
