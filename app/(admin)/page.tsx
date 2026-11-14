import type { Metadata } from "next";
import { requerirAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Inicio · Cesta solidaria" };

export default async function Inicio() {
  await requerirAdmin();

  return (
    <section>
      <h1 className="mb-2 text-2xl font-semibold">Inicio</h1>
      <p className="text-stone-600">
        Aquí verás el estado de la semana en curso. Las secciones de gestión se irán
        añadiendo en las próximas versiones.
      </p>
    </section>
  );
}
