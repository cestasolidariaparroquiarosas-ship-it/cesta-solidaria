# Revisión independiente — PR 4

- **Fecha:** 2026-11-15
- **Revisor:** agente que no escribió el código. Revisó contra el spec, el plan, `CLAUDE.md` y los requisitos heredados de la revisión del PR 3. Probó las migraciones en un Postgres 16 desechable.
- **Veredicto inicial:** fusionar, corrigiendo antes el hallazgo 1.
- **Estado:** corregidos los 8 hallazgos.

| # | Gravedad | Hallazgo | Corrección |
|---|---|---|---|
| 1 | MEDIA | El disparador de "solo en preparación" saltaba al cambiar `lista_base_id`. Al borrar una lista base usada en una semana ya enviada, el `on delete set null` daba el error 55000 y la lista no se podía borrar nunca | `lista_base_id` fuera del disparador (los alimentos ya están copiados). Prueba de integración que borra una lista usada en una semana enviada |
| 2 | MENOR | La comprobación de la semana no la bloqueaba: un cambio de cesta y el futuro "Enviar" (PR 6) podían confirmarse a la vez | `SELECT ... FOR SHARE` sobre la semana. Requisito para el PR 6: "Enviar" cambia el estado con `FOR UPDATE` |
| 3 | MENOR | Añadir un alimento que ya no existe daba "precio vacío" (23502) y un error desconocido en el log | El disparador lanza 23503, como la clave ajena. Prueba de integración |
| 4 | MENOR | El aviso de cesta creada hablaba de la lista base también sin lista | Aviso propio `creada_vacia` |
| 5 | MENOR | Al añadir una exclusión, los alimentos añadidos a mano que se quitaban no se nombraban (R1.2) | `guardar_cesta` devuelve los ids quitados; la página los muestra con los nombres del catálogo |
| 6 | MENOR | Las acciones no comprobaban que la cesta fuera de la semana de la URL | Filtros por semana y cesta en el servicio y en `guardar_cesta`. Prueba de integración |
| 7 | MENOR | CA-28 no miraba la semana con cestas a 375 px | Añadido a la e2e del móvil |
| 8 | MENOR | La e2e compartía prefijo con la del catálogo y no comprobaba los errores al preparar datos | Prefijo propio y comprobación de cada insert |

**Verificado en GitHub Actions:** ver el comentario de la revisión en el PR #6.
