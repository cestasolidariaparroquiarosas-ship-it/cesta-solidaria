// Lectura centralizada de variables de entorno. Falla pronto y con un mensaje claro
// si falta alguna, en lugar de producir errores confusos más adelante.

function requerida(nombre: string, valor: string | undefined): string {
  if (!valor) {
    throw new Error(`Falta la variable de entorno ${nombre}`);
  }
  return valor;
}

// Las variables NEXT_PUBLIC_* deben leerse de forma literal para que Next.js
// las incluya en el código del navegador.
export function supabasePublico() {
  return {
    url: requerida("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    clave: requerida(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  };
}
