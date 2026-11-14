#!/usr/bin/env node
// Genera .env.local a partir del Supabase local (`supabase status -o json`).
// Uso: node scripts/entorno-local.mjs
// Lo usan CI y cualquiera que trabaje en local con Docker.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const salida = execFileSync("npx", ["supabase", "status", "-o", "json"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
});
// La CLI puede escribir avisos antes del JSON: nos quedamos con el objeto.
const estado = JSON.parse(salida.slice(salida.indexOf("{"), salida.lastIndexOf("}") + 1));

const primero = (...claves) => {
  for (const c of claves) if (estado[c]) return estado[c];
  throw new Error(`No encuentro ninguna de ${claves.join(", ")} en supabase status`);
};

const variables = {
  NEXT_PUBLIC_SUPABASE_URL: primero("API_URL"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: primero("PUBLISHABLE_KEY", "ANON_KEY"),
  SUPABASE_SECRET_KEY: primero("SECRET_KEY", "SERVICE_ROLE_KEY"),
  SUPABASE_DB_URL: primero("DB_URL"),
  // Correo: Mailpit local (puerto SMTP 54325, API web 54324).
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "54325",
  SMTP_SECURE: "false",
  SMTP_USER: "",
  SMTP_PASS: "",
  MAILPIT_URL: primero("MAILPIT_URL", "INBUCKET_URL"),
  APP_URL: "http://localhost:3000",
  ADMIN_EMAIL: "admin@cesta.test",
  CRON_SECRET: "secreto-cron-local",
};

writeFileSync(
  ".env.local",
  Object.entries(variables)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n",
);
console.log("Escrito .env.local con", Object.keys(variables).length, "variables");
