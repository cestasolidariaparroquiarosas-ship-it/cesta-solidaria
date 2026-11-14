import { config } from "dotenv";
import { asegurarUsuariosPruebas } from "../utilidades/supabase";

// Contra Supabase local, crea el administrador de pruebas antes de empezar.
// Contra entornos desplegados (BASE_URL definida) no se toca ningún dato.
export default async function preparacionGlobal() {
  if (process.env.BASE_URL) return;
  config({ path: ".env.local", quiet: true });
  await asegurarUsuariosPruebas();
}
