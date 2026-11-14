// Quién es administrador. No basta con tener una cuenta en Supabase Auth: si alguien
// consiguiera registrarse (por ejemplo, porque se olvidó cerrar el registro en un
// proyecto), no podría entrar. El rol vive en app_metadata, que solo se puede escribir
// con la clave secreta o desde SQL; el usuario no puede cambiárselo.
// Las políticas RLS usan la misma regla: (auth.jwt() -> 'app_metadata' ->> 'rol') = 'admin'.

export const ROL_ADMIN = "admin";

type ClaimsMinimos = {
  sub?: string;
  is_anonymous?: boolean;
  app_metadata?: Record<string, unknown> | null;
};

export function esAdmin(claims: ClaimsMinimos | null | undefined): boolean {
  return (
    Boolean(claims?.sub) &&
    claims?.is_anonymous !== true &&
    claims?.app_metadata?.rol === ROL_ADMIN
  );
}
