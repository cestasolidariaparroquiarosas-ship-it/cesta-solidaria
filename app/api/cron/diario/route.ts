import { cronAutorizado } from "@/lib/cron";
import { conCorreo } from "@/lib/correo/transporte";
import { urlApp } from "@/lib/env";
import { tareaDiaria } from "@/lib/servicios/cron";
import { crearClienteServicio } from "@/lib/supabase/servicio";

// Cron diario de Vercel (vercel.json). Puede reasignar y enviar varios correos.
export const maxDuration = 60;

/**
 * CA-26: sin la cabecera "Authorization: Bearer <CRON_SECRET>" que envía Vercel, no hace
 * nada. La ruta es pública para el proxy (lib/rutas.ts) porque no hay sesión.
 */
export async function GET(request: Request) {
  if (!cronAutorizado(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const resumen = await conCorreo((correo) => tareaDiaria(crearClienteServicio(), correo, urlApp()));
    return Response.json(resumen);
  } catch {
    // Sin el detalle del error: puede llevar datos personales. Vercel marca el fallo.
    console.error("La tarea diaria ha fallado");
    return Response.json({ error: "La tarea diaria ha fallado" }, { status: 500 });
  }
}
