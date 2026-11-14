# Revisión independiente — PR 3

- **Fecha:** 2026-11-15
- **Revisor:** agente que no escribió el código. Revisó contra el spec, el plan y `CLAUDE.md`.
- **Veredicto inicial:** fusionar, corrigiendo antes el hallazgo 1.
- **Estado:** corregidos los hallazgos 1, 2, 5, 6, 7, 8, 9 y 10. Los 3 y 4 quedan como requisitos del PR 4.

| # | Gravedad | Hallazgo | Corrección |
|---|---|---|---|
| 1 | MEDIA | El nombre de una etiqueta no era único: renombrando, podía haber dos "cerdo" (una en la cesta y otra en el chorizo) y el chorizo entraría en una cesta "sin cerdo" | Índice único `lower(nombre)` en la migración del PR (aún no desplegada) y aviso al renombrar o crear. Prueba de integración |
| 2 | MENOR | Eliminar una etiqueta no pedía confirmación; botones sin nombre accesible por fila | Casilla "Confirmar" y `aria-label` con el nombre de la etiqueta o del alimento |
| 3 | MENOR | Añadir una etiqueta a un alimento que ya está en una cesta con esa exclusión no se bloquea (decisión del PR 1) | Requisito del PR 4: aviso de choque en la cesta y prueba de CA-06. Texto del formulario matizado |
| 4 | MENOR | Cambiar la unidad de un alimento cambia lo que se pide en cestas ya creadas | Requisito del PR 4 (avisar, bloquear o copiar la unidad en `cesta_items`) |
| 5 | MENOR | Algunos errores no devolvían lo escrito; "Está en uso" confuso si se borraba una etiqueta mientras se editaba | `valores` en todos los errores y mensaje propio |
| 6 | MENOR | `Aviso` aceptaba claves heredadas (`?aviso=constructor`) | `Object.hasOwn` |
| 7 | MENOR | Faltaba la prueba de guardar con la lista de etiquetas vacía | Añadida |
| 8 | MENOR | CA-28 no miraba la ficha del alimento ni una lista con filas | Añadido a la e2e del móvil |
| 9 | MENOR | La prueba de la predeterminada no restauraba la de `seed.sql` si fallaba | `try/finally` |
| 10 | MENOR | Dos administradores cambiando la predeterminada a la vez: mensaje "Ya existe." | Mensaje propio |

**Verificado en GitHub Actions:** CI completo en verde (lint, tipos, 72 unitarias, RLS, 86 de integración contra Supabase local y 18 e2e en escritorio y 375 px).
