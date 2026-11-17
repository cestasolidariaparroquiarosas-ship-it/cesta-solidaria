import type { Metadata } from "next";
import { requerirAdmin } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/server";
import { formatearCantidad } from "@/lib/dominio/catalogo";
import { hoyEnMadrid } from "@/lib/fechas";
import { ultimoPrecioBase } from "@/lib/servicios/semanas";
import { guardarSemanaAccion } from "../acciones";
import { FormularioSemana } from "../formularios";
import { Volver } from "../../_ui/aviso";

export const metadata: Metadata = { title: "Nueva semana · Cesta solidaria" };

export default async function PaginaNuevaSemana() {
  await requerirAdmin();
  const precio = await ultimoPrecioBase(await crearClienteServidor());

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Volver href="/semanas" texto="Semanas" />
      <h1 className="text-3xl font-bold">Nueva semana</h1>
      <section className="rounded-xl border border-stone-300 bg-white p-4 shadow-sm">
        <FormularioSemana
          accion={guardarSemanaAccion.bind(null, null)}
          hoy={hoyEnMadrid()}
          inicial={{
            fecha_entrega: "",
            precio_base: precio === null ? "" : formatearCantidad(precio),
            plazo_fecha: "",
            plazo_hora: "20:00",
          }}
          textoBoton="Crear semana"
        />
      </section>
    </div>
  );
}
