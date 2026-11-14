# Revisión independiente — PR 1

- **Fecha:** 2026-11-14
- **Revisor:** agente que no escribió el código. Revisó contra el spec y el plan, y probó la migración en un Postgres local.
- **Veredicto inicial:** fusionar, corrigiendo antes los hallazgos 1 y 2.
- **Estado:** corregidos todos los hallazgos.

| # | Gravedad | Hallazgo | Corrección |
|---|---|---|---|
| 1 | MEDIA | `comprobar-rls.sql` no detectaba tres casos: una función `SECURITY DEFINER` en `public` ejecutable por anónimos o por usuarios, una vista materializada legible y una política `using (true)` | Tres reglas nuevas: funciones, vistas materializadas y políticas que no usan `privado.es_admin()`. Además, la migración quita el `EXECUTE` por defecto a anónimos y a `PUBLIC`. Al verificarlo apareció que hacía falta la orden global para `PUBLIC`: la orden por esquema no basta |
| 2 | MEDIA | Las pruebas con usuario sin rol leían tablas vacías, así que no demostraban nada | `beforeAll` crea una fila en cada tabla. Cada prueba comprueba primero que la tabla tiene filas |
| 3 | MENOR | El trigger de exclusiones también saltaba en un UPDATE que no cambiaba el alimento | En UPDATE solo se comprueba si cambia el alimento o la cesta. Hay una prueba de que cambiar la cantidad funciona |
| 4 | MENOR | Quitar un alimento de una cesta borraba en silencio lo ya asignado; borrar una semana borraba la auditoría | `asignacion_items.cesta_item_id` pasa a `no action`; borrar la semana entera sigue funcionando. `registro_eventos.semana_id` pasa a `set null` |
| 5 | MENOR | Una asignación `pendiente` sin plazo nunca vencería | `check (estado <> 'pendiente' or plazo is not null)` |
| 6 | MENOR | `anon` tenía uso del esquema `privado` sin necesitarlo | Solo `authenticated` y `service_role` |
| 7 | MENOR | El error 23505 del correo repetido incluye el correo en `details` | Comentario junto al índice y regla en `CLAUDE.md`: los errores se tratan por `code` y nunca se registran enteros |
| 8 | MENOR | Las tablas N:M no tienen `id` ni fechas, sin documentarlo | Se les añade `creado_en`; documentado en el CHANGELOG |
| 9 | MENOR | La prueba de `actualizado_en` no probaba nada; las pruebas "CA-04" y "CA-07" no cubren el CA completo | Se compara con `creado_en`. Los títulos llevan "(base de datos)"; el CA completo queda para el PR 2 y el PR 4 |

**Verificado en local:**
- Lint, typecheck, 17 pruebas unitarias y `version:check`.
- Migración y `seed.sql` (dos veces seguidas) en Postgres 16, sobre una capa que imita los roles y `auth.jwt()` de Supabase.
- `comprobar-rls.sql` pasa con el esquema, y detecta los siete casos negativos que se crearon a propósito.
- Comprobaciones SQL de RLS (anónimo, sin rol, administrador anónimo y administrador) y de todas las restricciones.

**Pendiente de verificar en GitHub Actions:** las pruebas de integración con supabase-js contra Supabase local (Postgres 17, PostgREST y Auth). En esta sesión no se pueden descargar las imágenes de Docker.
