import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublico } from "@/lib/env";

// Cliente de Supabase para Server Components, Server Actions y Route Handlers.
// Actúa con la sesión del administrador que hace la petición, de modo que la
// Row Level Security de la base de datos se aplica siempre.
export async function crearClienteServidor() {
  const almacen = await cookies();
  const { url, clave } = supabasePublico();

  return createServerClient(url, clave, {
    cookies: {
      getAll() {
        return almacen.getAll();
      },
      setAll(cookiesAEscribir) {
        try {
          for (const { name, value, options } of cookiesAEscribir) {
            almacen.set(name, value, options);
          }
        } catch {
          // Desde un Server Component no se pueden escribir cookies. No pasa nada:
          // el proxy ya ha refrescado la sesión antes de llegar aquí.
        }
      },
    },
  });
}
