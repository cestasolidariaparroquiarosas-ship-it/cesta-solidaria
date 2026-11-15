# Revisión independiente — PR 5

- **Fecha:** 2026-11-15
- **Revisor:** agente que no escribió el código. Revisó contra el spec, el plan, `CLAUDE.md` y los pendientes heredados. Rehízo a mano los repartos de las pruebas, reprodujo los fallos con Playwright y con un Postgres 16 desechable, y ejecutó lint, tipos, las pruebas unitarias y el script de PGlite.
- **Veredicto inicial:** fusionar después de corregir los hallazgos 1 y 2.
- **Estado:** corregidos los 6 hallazgos.

| # | Gravedad | Hallazgo | Corrección |
|---|---|---|---|
| 1 | ALTA | La e2e del reparto buscaba el formulario dentro de cada desplegable con un selector relativo a la tarjeta, y nunca lo encontraba | Selector desde la página y nombres de formulario únicos (hallazgo 6) |
| 2 | MEDIA | El disparador que descarta el reparto borraba antes de bloquear la semana. Un cambio de cesta y un `proponer_reparto` simultáneos podían dejar un reparto desfasado, o interbloquearse | El disparador bloquea la semana (`FOR SHARE`) antes de borrar |
| 3 | MENOR | `mover_en_reparto` leía el origen y el destino antes de bloquear la semana, y no comprobaba la semana de la URL | Recibe la semana, la bloquea primero y después comprueba el origen y el destino. Prueba de integración |
| 4 | MENOR | El aviso de CA-13 no tenía prueba, y salía también con la semana ya enviada | e2e con una semana de 375 colaboradores necesarios. El aviso solo sale en preparación |
| 5 | MENOR | `itemsDeSemana` leía `cesta_items` como tabla principal: con más de 1000 alimentos de cesta en una semana, PostgREST los cortaría | Se lee por cestas, con los alimentos anidados |
| 6 | MENOR | Varios formularios con el mismo nombre accesible ("Mover Aceite…" en cada tarjeta) | El nombre incluye al colaborador: "Mover Aceite (botella 1 l) de Ana" |

**Verificado en GitHub Actions:** ver el comentario de la revisión en el PR #7.
