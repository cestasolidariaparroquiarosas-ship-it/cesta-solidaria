// Uso: DB_URL=… DEMO_CORREO_BASE=… npx tsx scripts/datos-de-prueba/ejecutar.ts cargar|borrar
// Lo lanza el workflow "datos-de-prueba" (docs/operacion.md). Solo escribe recuentos.

import { Client } from "pg";
import { cargar, ErrorDatosDePrueba } from "./cargar";
import { borrar } from "./borrar";

async function main() {
  const accion = process.argv[2];
  const url = process.env.DB_URL;
  const correoBase = process.env.DEMO_CORREO_BASE;
  if (accion !== "cargar" && accion !== "borrar") throw new ErrorDatosDePrueba("Uso: ejecutar.ts cargar|borrar");
  if (!url) throw new ErrorDatosDePrueba("Falta DB_URL");
  if (!correoBase) throw new ErrorDatosDePrueba("Falta DEMO_CORREO_BASE");

  const local = /@(127\.0\.0\.1|localhost)[:/]/.test(url);
  // Siempre cifrado fuera de local, sin validar el certificado (Supabase lo firma con su
  // propia autoridad). Es más estricto que psql con su sslmode=prefer por defecto. Si la
  // cadena trae ?sslmode=…, pg lo trata como verify-full y fallaría: se quita.
  const cadena = new URL(url);
  cadena.searchParams.delete("sslmode");
  const bd = new Client({ connectionString: cadena.toString(), ssl: local ? false : { rejectUnauthorized: false } });
  await bd.connect();
  try {
    const resumen = accion === "cargar" ? await cargar(bd, { correoBase }) : await borrar(bd, { correoBase });
    console.log(`✓ ${accion === "cargar" ? "Datos de prueba cargados" : "Datos de prueba borrados"}. Filas por tabla:`);
    for (const [tabla, n] of Object.entries(resumen)) console.log(`  ${tabla}: ${n}`);
  } finally {
    await bd.end();
  }
}

main().catch((e: unknown) => {
  // RGPD: un error de Postgres puede llevar datos en `detail`; solo se muestran el código
  // y el mensaje de los errores previstos.
  if (e instanceof ErrorDatosDePrueba) console.error(`✗ ${e.message}`);
  else {
    const codigo = (e as { code?: string })?.code ?? "desconocido";
    const pista = (e as { hint?: string })?.hint;
    console.error(
      `✗ Error inesperado (código ${codigo}${pista ? `, ${pista}` : ""}). La transacción no debería haberse aplicado, ` +
        "pero si el error fue al confirmarla, comprueba los recuentos (otra carga se negaría si hay datos) antes de repetir.",
    );
  }
  process.exit(1);
});
