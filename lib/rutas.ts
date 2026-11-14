// Rutas a las que se puede entrar sin sesión de administrador.
// - /login: acceso del administrador.
// - /r/...: respuesta de un colaborador desde el enlace del correo (R4).
// - /baja/...: baja de un colaborador desde el enlace del correo (R5).
// - /api/cron/...: protegido con CRON_SECRET, no con sesión (CA-26).
const PREFIJOS_PUBLICOS = ["/login/", "/r/", "/baja/", "/api/cron/"];

export function esRutaPublica(ruta: string): boolean {
  return PREFIJOS_PUBLICOS.some(
    (prefijo) => ruta === prefijo.slice(0, -1) || ruta.startsWith(prefijo),
  );
}
