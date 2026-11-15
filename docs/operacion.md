# Operación

## Puesta en marcha (una sola vez)

1. **Gmail de la cesta:**
   - Activar la verificación en dos pasos.
   - Crear una contraseña de aplicación en https://myaccount.google.com/apppasswords (Google no siempre la muestra en el menú de Seguridad). No funciona si la verificación en dos pasos es solo con llaves de seguridad.
   - Si se cambia la contraseña de la cuenta, Google revoca las contraseñas de aplicación: hay que crear otra y actualizar `SMTP_PASS`.
2. **Supabase** (con la cuenta de Gmail):
   - Crear dos proyectos en región UE: `cesta-produccion` y `cesta-pruebas`.
   - En cada uno, en Authentication → Sign In / Providers, desactivar "Allow new users to sign up" (CA-25).
3. **Vercel** (con la cuenta de Gmail):
   - Crear un proyecto vacío, sin enlazarlo a GitHub. El framework (Next.js) y la región de las funciones (Fráncfort, `fra1`, junto a la base de datos) los fija `vercel.json`.
   - En Security → Deployment Protection: dejar protegidas las vistas previas (van contra Supabase de pruebas y sus direcciones salen en los logs públicos de Actions) y crear un "Protection Bypass for Automation", guardado como `VERCEL_AUTOMATION_BYPASS_SECRET`.
   - Crear un token en Account Settings → Tokens.
4. **Variables de entorno en Vercel:**

   | Variable | Production | Preview |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | producción | pruebas |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | producción | pruebas |
   | `SUPABASE_SECRET_KEY` | producción | pruebas |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | `smtp.gmail.com`, `465`, `true` | igual |
   | `SMTP_USER`, `SMTP_PASS` | Gmail y contraseña de aplicación | igual |
   | `APP_URL` | URL de producción | sin poner: se usa la que pone Vercel (`VERCEL_URL`) |
   | `ADMIN_EMAIL` | correo del administrador: recibe los avisos y es el "Responder a" de los correos | igual |
   | `CRON_SECRET` | cadena aleatoria larga | otra distinta |

   - Las dos `NEXT_PUBLIC_*` deben ser de tipo **Config**, no "Secret": la app las lee al construirse, y una variable "Secret" llega vacía. Son públicas por diseño (la RLS es la que protege los datos).
   - Las demás, de tipo **Secret**.

5. **GitHub → Settings → Secrets and variables → Actions:**
   - Secretos:
     - `VERCEL_TOKEN`, `VERCEL_ORG_ID` y `VERCEL_PROJECT_ID`. Los dos últimos están en `.vercel/project.json` tras `vercel link`, o en los ajustes del proyecto.
     - `SUPABASE_PROD_DB_URL` y `SUPABASE_STAGING_DB_URL`: Connect → "Session pooler", con la contraseña de la base de datos.
     - `BACKUP_PASSPHRASE`: frase larga. **Guárdala también fuera de GitHub**; sin ella, las copias no se pueden abrir.
     - `VERCEL_AUTOMATION_BYPASS_SECRET` (ver paso 3).
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
8. **Verificación en dos pasos** en la cuenta de Google de la cesta y en GitHub. Con la cuenta de Google se entra en GitHub, y con GitHub en Supabase y Vercel: es la llave de todo.
9. **Avisos de fallos:** en GitHub → Settings → Notifications, activar los avisos de "Actions" por correo. Así te enterarás si falla un despliegue o la consulta diaria a Supabase.

### Consejos de la puesta en marcha

- En el navegador integrado de Claude, los botones de "copiar" de Supabase y Vercel no llegan al portapapeles. Copia con el teclado (clic en el valor, Ctrl+A, Ctrl+C).
- Si el despliegue falla en "Migraciones" con `password authentication failed`, la contraseña de la cadena `SUPABASE_*_DB_URL` no es la buena: se cambia en Supabase → Database → Settings → "Reset password" y se actualiza el secreto.
- Si al pulsar "Entrar" justo después de un despliegue no pasa nada, recarga la página: la pantalla era de la versión anterior.

### Estado actual (2026-11-14)

| Pieza | Valor |
|---|---|
| Supabase | `cesta-produccion` y `cesta-pruebas`, Central EU (Frankfurt), registro público desactivado |
| Vercel | proyecto `cesta-solidaria`, equipo `cesta`, producción en https://cesta-solidaria-rosas.vercel.app |
| GitHub | repositorio **público** (decisión del responsable, 2026-11-14): con GitHub gratuito, un repositorio privado no permite proteger `main` (CA-30). En el repositorio no hay datos ni claves. `main` protegida: PR obligatorio y check `comprobaciones`, también para administradores |
| Copias | **ninguna por ahora**: desactivadas hasta trasladarlas a un repositorio privado (ver abajo) |
| Supabase despierto | `mantener-activo.yml`: `select 1` diario en los dos proyectos |

## Copias de seguridad

Pendiente: los artefactos de Actions de un repositorio público los puede descargar cualquiera, así que la copia diaria no puede vivir aquí aunque vaya cifrada. Plan: un repositorio **privado** `cesta-copias` con el mismo `backup.yml` y sus propios secretos (`SUPABASE_PROD_DB_URL`, `SUPABASE_STAGING_DB_URL`, `BACKUP_PASSPHRASE`). Mientras tanto **no hay copias**: el job de `backup.yml` está desactivado (`if: false`) y CA-34 queda pendiente. Los pasos de restauración de abajo valdrán igual cuando las copias vivan en `cesta-copias`.

## Volver a una versión anterior

- **La última publicación falla:** en Vercel, Instant Rollback (o `vercel rollback`). El plan gratuito solo permite volver a la versión inmediatamente anterior.
- **Volver a una versión más antigua:** GitHub → Actions → deploy → Run workflow con `etiqueta: vX.Y.Z`. Solo acepta etiquetas de versión existentes. Reconstruye y publica esa versión, primero en pruebas y después en producción, sin tocar las migraciones: gracias a la regla de compatibilidad no hace falta deshacerlas.
- **Fusiones muy seguidas:** GitHub solo ejecuta el despliegue más reciente y cancela los que estaban esperando. El código no se pierde, pero esas versiones intermedias se quedan sin etiqueta.

## Restaurar una copia de seguridad

1. Descargar el artefacto `copia-AAAA-MM-DD` desde GitHub → Actions → backup, en el repositorio privado de copias.
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
5. **Datos borrados después de la copia (RGPD):** si alguien pidió que se borraran sus datos después de la fecha de la copia, la restauración los vuelve a traer. Antes de usar la app con normalidad, vuelve a eliminarlo desde su ficha ("Eliminar definitivamente").

## Borrar los datos de un colaborador

Si un colaborador pide que se borren sus datos, en Colaboradores → su ficha → "Eliminar definitivamente". Se borran su nombre y su correo de la base de datos; las semanas en que participó se conservan a nombre de "Colaborador eliminado".

- Si tiene alimentos asignados en una semana que aún no ha terminado (propuesta o pendiente de respuesta), la app no deja eliminarlo: primero hay que cambiarlo por otro colaborador en el reparto de esa semana.
- Las copias de seguridad, cuando estén activas, se guardan 30 días. Sus datos desaparecen de ellas cuando caducan las copias anteriores al borrado.

## Correo

- **Comprobar que funciona:** en Inicio → Correo → "Enviar un correo de prueba". Llega a `ADMIN_EMAIL`. Si falla con el código `535`, Gmail no acepta el usuario o la contraseña: revisa `SMTP_USER` y `SMTP_PASS` (la contraseña de aplicación, sin espacios).
- **Si un correo de una semana no sale:** la asignación se queda "Correo no enviado" en el paso 4 de la semana, con el botón "Volver a intentarlo". El cron diario (PR 7) también lo reintentará. En `registro_eventos` queda un `error_envio` con el código del error (nunca la dirección).
- **Límite de Gmail:** unos 500 correos al día; para esta cesta sobra.
- **Alimentos sin cubrir:** si alguien no puede y no queda nadie disponible (o ya no hay tiempo antes de la entrega), llega un aviso a `ADMIN_EMAIL` y la semana lo muestra como "Sin cubrir", con el botón "Buscar sustituto" para cuando haya alguien (por ejemplo, tras dar de alta a un colaborador).

## Tarea diaria (cron)

- Vercel llama cada día a `/api/cron/diario` (`vercel.json`: 07:00 UTC, que son las 8:00 en Madrid en invierno y las 9:00 en verano; en el plan gratuito puede llegar en cualquier momento de esa hora). Solo se lanza en producción.
- Lo que hace:
  1. Una consulta a la base de datos, para que Supabase no pause el proyecto (CA-27).
  2. Las asignaciones pendientes con el plazo vencido pasan a "sin respuesta" y sus alimentos van al siguiente colaborador disponible, que recibe su correo. Si no queda nadie, avisa a `ADMIN_EMAIL` (CA-20, CA-21). Si la entrega ya pasó, solo lo anota.
  3. Reintenta los correos que no salieron.
  4. Cierra las semanas enviadas a los 7 días de la entrega, si nadie lo ha hecho (lo que siguiera esperando respuesta queda "sin respuesta").
  5. Conservación (spec §10): en las semanas cerradas hace más de 12 meses, el identificador de cada familia pasa a "Cesta n.º 1", "Cesta n.º 2"…
- Sin la cabecera `Authorization: Bearer <CRON_SECRET>`, que Vercel añade sola, responde 401 y no hace nada (CA-26). Si se cambia `CRON_SECRET`, vale con cambiarlo en Vercel y volver a desplegar.
- **Ver si ha funcionado:** Vercel → proyecto → Settings → Cron Jobs (botón "Run" para lanzarlo a mano) y los logs de la función. La respuesta es un resumen con números, sin nombres ni correos.
