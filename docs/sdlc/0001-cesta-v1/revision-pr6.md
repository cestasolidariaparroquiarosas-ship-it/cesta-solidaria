# Revisión independiente — PR 6

- **Fecha:** 2026-11-15
- **Revisor:** agente que no escribió el código. Revisó contra el spec, el plan, `CLAUDE.md` y los pendientes heredados. Reprodujo los tiempos de espera de Nodemailer 10.5 con un SMTP local que no responde, rehízo a mano el orden de R2.4 entre las pruebas y ejecutó lint, tipos, las pruebas unitarias y el script de PGlite.
- **Veredicto inicial:** fusionar tras corregir el hallazgo 1 (y los pequeños 2, 5 y 6). No encontró ningún hallazgo alto.
- **Revisado sin hallazgos:** seguridad de las páginas públicas (token, CA-24, permisos de las funciones, POST con comprobación de origen, GET solo lee), orden de los bloqueos, CA-12 en la reasignación, plazo de R4.4, equivalencia de `privado.es_candidato` con `esCandidato`, compatibilidad de la migración y escapado del HTML.
- **Estado:** corregidos los 9 hallazgos.

| # | Gravedad | Hallazgo | Corrección |
|---|---|---|---|
| 1 | MEDIA | La reserva del envío usaba `enviado_en`: si Vercel cortaba la función a mitad (por `maxDuration`), la asignación quedaba como enviada sin correo, y ni el reintento ni el cron la recogerían. Con los tiempos de espera de 15 y 30 s, bastaban unos pocos fallos para llegar al límite | Columna `envio_reservado_en`, separada de `enviado_en` (que solo se anota cuando el correo ha salido). Una reserva de más de 5 minutos caduca. Tiempos de espera de 8, 8 y 15 s. El envío se corta al primer error de conexión o cuando se acerca el límite. Prueba de integración con una reserva reciente y otra caducada |
| 2 | MENOR | Si fallaba la lectura de candidatos, un «no puedo» se guardaba sin buscar sustituto y el aviso decía «no hay tiempo» | Se lanza un error antes de guardar nada: la persona puede volver a pulsar |
| 3 | MENOR | Una baja simultánea a una reasignación podía dejar como sustituto a alguien que se acababa de dar de baja | El sustituto se elige bloqueando su fila (`FOR SHARE`): espera a la baja y lo salta |
| 4 | MENOR | `privado.reasignar` dependía de que quien la llama hubiera bloqueado la semana (el cron del PR 7 podría olvidarlo) | Bloquea la semana ella misma |
| 5 | MENOR | «Volver a intentarlo» escribía también a asignaciones con el plazo vencido | Solo reenvía las que tienen el plazo por delante. Prueba de integración |
| 6 | MENOR | Sin página de error en las rutas públicas: un fallo mostraba la de Next.js, en inglés | `app/(publico)/error.tsx` con un texto claro |
| 7 | MENOR | Concordancia en el seguimiento («2 colaboradores que ya no está», «1 no pueden») | Singular y plural según el número |
| 8 | MENOR | Ninguna prueba nombraba CA-21 | La prueba se llama «CA-21 (R4.6, al rechazar)»; el cron del PR 7 lo completa |
| 9 | MENOR | `CLAUDE.md` seguía con las rutas públicas antiguas | Actualizado, con el cliente de servicio y el correo |

**Verificado en GitHub Actions:** ver el comentario de la revisión en el PR #8.
