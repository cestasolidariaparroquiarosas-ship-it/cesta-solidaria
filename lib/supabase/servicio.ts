import "server-only";
import { createClient } from "@supabase/supabase-js";
import { claveSecretaSupabase, supabasePublico } from "@/lib/env";

// Cliente con la clave secreta: salta la Row Level Security.
// Solo para las páginas públicas de los enlaces del correo (/r y /baja), que no tienen
// sesión de administrador. Cada consulta que se haga con él tiene que limitarse a la
// asignación del token (CA-24), y las funciones SQL que usa solo las puede ejecutar
// service_role.
export function crearClienteServicio() {
  return createClient(supabasePublico().url, claveSecretaSupabase(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
