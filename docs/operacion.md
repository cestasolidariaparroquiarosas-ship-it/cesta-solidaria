# Operación

## Puesta en marcha (una sola vez)

1. **Gmail de la cesta:**
   - Activar la verificación en dos pasos.
   - Crear una contraseña de aplicación (Cuenta de Google → Seguridad → Contraseñas de aplicación).
2. **Supabase** (con la cuenta de Gmail):
   - Crear dos proyectos en región UE: `cesta-produccion` y `cesta-pruebas`.
   - En cada uno, en Authentication → Sign In / Providers, desactivar "Allow new users to sign up" (CA-25).
3. **Vercel** (con la cuenta de Gmail):
   - Crear un proyecto vacío, sin enlazarlo a GitHub.
   - En Settings → Deployment Protection: desactivar la protección de las vistas previas o crear un "Protection Bypass for Automation" y guardarlo como `VERCEL_AUTOMATION_BYPASS_SECRET`.
   - Crear un token en Account Settings → Tokens.
4. **Variables de entorno en Vercel:**

   | Variable | Production | Preview |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | producción | pruebas |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | producción | pruebas |
   | `SUPABASE_SECRET_KEY` | producción | pruebas |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | `smtp.gmail.com`, `465`, `true` | igual |
   | `SMTP_USER`, `SMTP_PASS` | Gmail y contraseña de aplicación | igual |
   | `APP_URL` | URL de producción | URL de la vista previa |
   | `ADMIN_EMAIL` | correo del administrador | igual |
   | `CRON_SECRET` | cadena aleatoria larga | otra distinta |

5. **GitHub → Settings → Secrets and variables → Actions:**
   - Secretos:
     - `VERCEL_TOKEN`, `VERCEL_ORG_ID` y `VERCEL_PROJECT_ID`. Los dos últimos están en `.vercel/project.json` tras `vercel link`, o en los ajustes del proyecto.
     - `SUPABASE_PROD_DB_URL` y `SUPABASE_STAGING_DB_URL`: Connect → "Session pooler", con la contraseña de la base de datos.
     - `BACKUP_PASSPHRASE`: frase larga. **Guárdala también fuera de GitHub**; sin ella, las copias no se pueden abrir.
     - `VERCEL_AUTOMATION_BYPASS_SECRET` (opcional, ver paso 3).
   - Variable: `APP_URL` = URL de producción.
6. **GitHub → Settings → Branches:** proteger `main` y exigir que pase el check `comprobaciones`.
7. **Primer administrador** (en producción, y otro en pruebas si quieres entrar allí):
   1. En Supabase, Authentication → Users → Add user, con "Auto confirm user".
   2. Darle el rol en SQL Editor. Sin este paso, la cuenta existe pero **no puede entrar**; esto es intencionado:

      ```sql
      update auth.users
      set raw_app_meta_data = raw_app_meta_data || '{"rol": "admin"}'
      where email = 'correo-del-administrador@ejemplo.com';
      ```

   El rol vive en `app_metadata`, que el usuario no puede modificar. Para quitar el acceso, se borra la clave `rol` o el usuario.
8. **Avisos de fallos:** en GitHub → Settings → Notifications, activar los avisos de "Actions" por correo. Así te enterarás si falla un despliegue o la copia diaria.

## Volver a una versión anterior

- **La última publicación falla:** en Vercel, Instant Rollback (o `vercel rollback`). El plan gratuito solo permite volver a la versión inmediatamente anterior.
- **Volver a una versión más antigua:** GitHub → Actions → deploy → Run workflow con `etiqueta: vX.Y.Z`. Solo acepta etiquetas de versión existentes. Reconstruye y publica esa versión, primero en pruebas y después en producción, sin tocar las migraciones: gracias a la regla de compatibilidad no hace falta deshacerlas.
- **Fusiones muy seguidas:** GitHub solo ejecuta el despliegue más reciente y cancela los que estaban esperando. El código no se pierde, pero esas versiones intermedias se quedan sin etiqueta.

## Restaurar una copia de seguridad

1. Descargar el artefacto `copia-AAAA-MM-DD` desde GitHub → Actions → backup.
2. Descifrar y descomprimir:

   ```bash
   gpg --decrypt copia-AAAA-MM-DD.tar.gz.gpg > copia.tar.gz
   tar -xzf copia.tar.gz
   ```

3. Restaurar **primero en pruebas, sobre una base vacía**. En Supabase → pruebas → Database → Settings → "Reset database", o usando un proyecto nuevo. Si la base ya tiene el esquema, aparecen errores de "already exists" y la restauración queda a medias.

   ```bash
   psql --single-transaction --variable ON_ERROR_STOP=1 \
        --file copia/roles.sql --file copia/esquema.sql \
        --command 'SET session_replication_role = replica' --file copia/datos.sql \
        --dbname "$SUPABASE_STAGING_DB_URL"
   ```

   Con `ON_ERROR_STOP` y `--single-transaction`, o se restaura todo o no se cambia nada.
4. Comprobar en la app de pruebas que los datos están bien. Solo entonces, y si hace falta, repetir en producción.
