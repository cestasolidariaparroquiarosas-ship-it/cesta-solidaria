import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabasePublico } from "@/lib/env";
import { esRutaPublica } from "@/lib/rutas";
import { esAdmin } from "@/lib/rol";

// El proxy hace dos cosas:
// 1. Refresca la sesión de Supabase y devuelve las cookies actualizadas.
// 2. Comprobación rápida: sin sesión de administrador, cualquier ruta de gestión redirige a /login.
// La autorización real se vuelve a comprobar cerca de los datos (requerirAdmin y RLS).
export async function proxy(request: NextRequest) {
  let respuesta = NextResponse.next({ request });
  const { url, clave } = supabasePublico();

  const supabase = createServerClient(url, clave, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesAEscribir, cabeceras) {
        for (const { name, value } of cookiesAEscribir) {
          request.cookies.set(name, value);
        }
        respuesta = NextResponse.next({ request });
        for (const { name, value, options } of cookiesAEscribir) {
          respuesta.cookies.set(name, value, options);
        }
        for (const [clave, valor] of Object.entries(cabeceras ?? {})) {
          respuesta.headers.set(clave, valor);
        }
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const admin = esAdmin(data?.claims);
  const ruta = request.nextUrl.pathname;

  if (!admin && !esRutaPublica(ruta)) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    destino.search = "";
    return NextResponse.redirect(destino);
  }

  return respuesta;
}

export const config = {
  matcher: [
    // Todo excepto los recursos estáticos de Next.js y el favicon.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
