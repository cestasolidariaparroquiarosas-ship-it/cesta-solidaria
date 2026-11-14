# Revisión independiente — PR 0

- **Fecha:** 2026-11-14
- **Revisor:** agente que no escribió el código. Revisó contra el spec y el plan.
- **Veredicto inicial:** no fusionar hasta corregir los hallazgos 1 y 2.
- **Estado:** corregidos todos los graves y medios. Los menores, corregidos o documentados.

| # | Gravedad | Hallazgo | Corrección |
|---|---|---|---|
| 1 | GRAVE | Al republicar a mano, `ci` se salta y `produccion` también, por el `success()` implícito, así que CA-33 nunca llegaba a producción | `if` explícito en `produccion` y en `version`, que comprueba `needs.pruebas.result` |
| 2 | GRAVE | `supabase db push` sin `--yes` falla en CI cuando hay migraciones pendientes | `db push --yes --remote="$DB_URL"`. `db dump` también usa `--remote` |
| 3 | MEDIA | Cualquier cuenta de Supabase Auth contaba como administrador | `lib/rol.ts`: hace falta `app_metadata.rol = "admin"` y se rechazan sesiones anónimas. Comprobación del registro cerrado en pruebas y producción en cada despliegue (`scripts/comprobar-registro-cerrado.mjs`). Pruebas unitarias, de integración y e2e |
| 4 | MEDIA | Dos PR con la misma versión pasaban la comprobación y el segundo se publicaba sin etiqueta | `version:check` compara también con la rama destino (`BASE_REF`). El job `version` falla si la etiqueta ya existe |
| 5 | MEDIA | El despliegue manual aceptaba cualquier rama y se saltaba CI | Job `validar`: solo admite etiquetas `vX.Y.Z` que existan. Se quita el valor por defecto |
| m | MENOR | Secretos escritos dentro de `run:` | Se pasan por `env:` |
| m | MENOR | La página de Inicio no llamaba a `requerirAdmin()` | Corregido. Regla añadida a `CLAUDE.md` |
| m | MENOR | `retries: 1` dejaba pasar pruebas inestables | `retries: 0` |
| m | MENOR | Posible fallo intermitente por `signOut` global y pruebas en paralelo | `signOut({ scope: "local" })` y pruebas con credenciales solo en escritorio |
| m | MENOR | El humo de producción fallaba después de desplegar si faltaba `APP_URL` | Se comprueba en `validar`, antes de desplegar |
| m | MENOR | Restauración sin `ON_ERROR_STOP` | `docs/operacion.md`: `--single-transaction --variable ON_ERROR_STOP=1` sobre una base vacía |
| m | MENOR | `CHANGELOG` buscado en cualquier parte del texto | Solo cuentan los encabezados al principio de línea. Las notas no incluyen el encabezado |
| m | MENOR | Concurrencia: se cancelan los despliegues pendientes; avisos de la copia | Documentado en `deploy.yml` y `docs/operacion.md` (activar las notificaciones de Actions) |

**Verificado en local:** lint, typecheck, 17 pruebas unitarias, `version:check`, `next build` y 6 pruebas `@humo` (escritorio y 375 px).

**Pendiente de verificar en GitHub Actions:**
- Pruebas de integración y e2e con Supabase local.
- CA-30 a CA-33 con ejecuciones reales. CA-33 se verifica republicando `v0.1.0` después del primer despliegue.
