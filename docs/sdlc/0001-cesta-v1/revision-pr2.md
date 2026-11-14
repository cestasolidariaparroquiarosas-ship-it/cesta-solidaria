# Revisión independiente — PR 2

- **Fecha:** 2026-11-14
- **Revisor:** agente que no escribió el código. Revisó contra el spec, el plan y `CLAUDE.md`.
- **Veredicto inicial:** fusionar, corrigiendo antes el hallazgo 1.
- **Estado:** corregidos los hallazgos 1, 2, 3, 5, 6 y 7. El 4 queda documentado para el PR 5.

| # | Gravedad | Hallazgo | Corrección |
|---|---|---|---|
| 1 | MEDIA | CA-03 tenía un hueco: dar de baja o pausar a alguien con una asignación propuesta o pendiente no evitaba que, al enviar la semana, le llegara el correo. Sin embargo, la app decía "no recibirá más correos" | `cambiarEstadoColaborador` no deja pausar ni dar de baja con una asignación propuesta o pendiente. CA-03 se marca como parcial; el resto queda anotado para el PR 6 |
| 2 | MENOR | Los mensajes de éxito no se veían nunca: el formulario que lanzaba la acción se desmontaba al cambiar la ficha | Las acciones vuelven a la ficha con `?aviso=...` y la página muestra el aviso con `role="status"`. Se quitan el campo `ok` y las `key` sobrantes. Las e2e comprueban los avisos |
| 3 | MENOR | Guardar los datos y anotar el consentimiento eran dos cambios separados | Un solo UPDATE (`actualizarDatosColaborador` con `registrarConsentimiento`). Prueba de integración |
| 4 | MENOR | La última participación lee todas las confirmadas, y PostgREST corta en 1000 filas sin avisar | Comentario en el código y nota en el CHANGELOG: en el PR 5, vista agregada para la lista y para la selección de R2.4 |
| 5 | MENOR | La ayuda y los errores estaban dentro de `<label>` y formaban parte del nombre accesible; algunos errores no estaban enlazados | Componentes `Campo` y `Casilla`: etiqueta con `htmlFor`; ayuda y error fuera, enlazados con `aria-describedby`; un único `role="alert"` por formulario |
| 6 | MENOR | Se podía eliminar a quien había confirmado para una entrega que aún no había pasado | La eliminación también se bloquea con una asignación confirmada sin entregar de una semana sin cerrar. Prueba de integración. La carrera entre comprobar y borrar queda anotada para el PR 5 |
| 7 | MENOR | La parte visible de CA-04 ("Colaborador eliminado") solo se probaba con una función que aún no usa ninguna pantalla | Títulos de prueba y CHANGELOG marcados como parciales; la e2e llegará con las pantallas de asignaciones (PR 5 y PR 8) |

**Hallazgo propio durante la verificación (antes de la revisión):**
- Las pruebas e2e de acceso del PR 0 que comprueban mensajes de error fallaban: el anunciador de rutas de Next.js también tiene `role="alert"`. Nunca se habían llegado a ejecutar con credenciales. Corregido con el ayudante `alerta()`.
- React 19 vacía el formulario tras cada envío, así que un error de validación borraba lo escrito. Las acciones devuelven lo enviado (`valores`).

**Verificado en local:**
- Lint, typecheck, 47 pruebas unitarias, `version:check` y `next build`.
- Las 14 pruebas e2e (escritorio y 375 px), incluidas las de colaboradores y las de acceso con credenciales, contra un Supabase falso en memoria que imita lo justo de Auth y de PostgREST. Ese simulador no está en el repositorio: sirve para probar las pantallas, no la base de datos.

**Pendiente de verificar en GitHub Actions:** las pruebas de integración contra Supabase local (`tests/integration/colaboradores.test.ts`) y las e2e contra Supabase local de verdad. En esta sesión no hay Docker.
