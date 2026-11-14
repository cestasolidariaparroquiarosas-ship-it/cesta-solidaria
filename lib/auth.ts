import "server-only";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { esAdmin } from "@/lib/rol";

export type Administrador = {
  id: string;
  email: string;
};

// Capa de acceso: toda pantalla y toda acción de gestión llama a esta función,
// también las páginas (los layouts no se vuelven a ejecutar al navegar).
// No se confía solo en el proxy (ver guía de autenticación de Next.js).
export async function requerirAdmin(): Promise<Administrador> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims || !esAdmin(claims)) {
    redirect("/login");
  }

  return { id: claims.sub, email: String(claims.email ?? "") };
}
