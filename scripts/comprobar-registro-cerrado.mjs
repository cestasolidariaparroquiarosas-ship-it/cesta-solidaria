#!/usr/bin/env node
// CA-25 en los entornos alojados: comprueba que el proyecto de Supabase NO acepta
// registros nuevos. Lo ejecuta deploy.yml después de `vercel pull`, leyendo la URL y la
// clave pública del entorno que se va a desplegar.
// Uso: node scripts/comprobar-registro-cerrado.mjs .vercel/.env.preview.local
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const archivo = process.argv[2];
if (!archivo) {
  console.error("Uso: comprobar-registro-cerrado.mjs <archivo .env>");
  process.exit(2);
}

const variables = Object.fromEntries(
  readFileSync(archivo, "utf8")
    .split("\n")
    .map((linea) => linea.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map(([, clave, valor]) => [clave, valor.replace(/^"(.*)"$/, "$1")]),
);

const url = variables.NEXT_PUBLIC_SUPABASE_URL;
const clave = variables.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !clave) {
  console.error("✗ Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en", archivo);
  process.exit(1);
}

// Correo en un dominio reservado (.invalid): nunca se envía nada real.
const respuesta = await fetch(`${url}/auth/v1/signup`, {
  method: "POST",
  headers: { apikey: clave, "Content-Type": "application/json" },
  body: JSON.stringify({
    email: `comprobacion-${randomUUID()}@registro-cerrado.invalid`,
    password: `No-${randomUUID()}`,
  }),
});
const cuerpo = await respuesta.text();

if (respuesta.ok) {
  console.error("✗ El registro público está ABIERTO en este proyecto de Supabase.");
  console.error("  Desactiva 'Allow new users to sign up' (docs/operacion.md) y borra el usuario creado.");
  process.exit(1);
}
if (!/signup.*disabled|signups not allowed/i.test(cuerpo)) {
  console.error(`✗ Respuesta inesperada al intentar registrarse (${respuesta.status}): ${cuerpo.slice(0, 200)}`);
  process.exit(1);
}
console.log("✓ Registro público cerrado (CA-25)");
