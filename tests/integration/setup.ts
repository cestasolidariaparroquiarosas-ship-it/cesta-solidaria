import { config } from "dotenv";

// Las pruebas de integración leen la conexión al Supabase local de .env.local,
// que genera scripts/entorno-local.mjs.
config({ path: ".env.local", quiet: true });

for (const nombre of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
]) {
  if (!process.env[nombre]) {
    throw new Error(
      `Falta ${nombre}. Arranca Supabase local (npx supabase start) y ejecuta node scripts/entorno-local.mjs`,
    );
  }
}
