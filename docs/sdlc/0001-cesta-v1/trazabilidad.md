# Trazabilidad de los criterios de aceptación (v1.0.0)

Para cada CA del spec: dónde se comprueba. Las pruebas nombran el CA en su título (`"CA-NN: ..."`), así que `grep -rn "CA-NN" tests` las encuentra todas. Tipos de prueba:

- **U:** unitaria (`tests/unit`), lógica pura.
- **I:** integración (`tests/integration`), contra Supabase local en CI.
- **E:** e2e (`tests/e2e`), con Playwright en escritorio y en móvil.
- **O:** operación, comprobada en los entornos reales.

| CA | Qué | Dónde se comprueba |
|---|---|---|
| CA-01 | Correo repetido | E `colaboradores`; I `colaboradores`, `esquema` |
| CA-02 | Pausa y fecha de vuelta | U `colaboradores`, `seleccion`; I `reparto` |
| CA-03 | Baja: ni candidato ni correos | U `colaboradores`, `seleccion`; I `colaboradores`, `envio` |
| CA-04 | Eliminar definitivamente | U `colaboradores`; E `colaboradores`; I `colaboradores`, `esquema` |
| CA-05 | Propuesta R1 (4 paquetes de arroz) | U `cesta`; E `semanas`; I `semanas` |
| CA-06 | Exclusiones quitan alimentos y avisan | U `cesta`; E `semanas`; I `semanas` |
| CA-07 | No se guarda un alimento que choca | E `semanas`; I `semanas`, `esquema` |
| CA-08 | Las cestas conservan el precio | I `semanas` |
| CA-09 | 95 € / 20 € → 5 colaboradores | U `seleccion`; E `reparto`; I `reparto` |
| CA-10 | Orden por última participación | U `seleccion`; E `reparto`; I `reparto` |
| CA-11 | Diferencia de gasto ≤ pieza más cara (datos al azar) | U `reparto` (fast-check); E `reparto`; I `reparto` |
| CA-12 | Cada unidad asignada exactamente una vez | U `reparto`; E `reparto`; I `reparto` |
| CA-13 | Menos candidatos que N: aviso de exceso | U `seleccion`; E `reparto`; I `reparto` |
| CA-14 | Un correo por colaborador con lista, plazo, enlaces y pie | U `respuestas`; E `envio`; I `envio` (Mailpit) |
| CA-15 | GET no cambia nada | E `envio`; I `envio` |
| CA-16 | Confirmar | E `envio`; I `envio` |
| CA-17 | "No puedo" → reasignación y correo inmediato | I `envio` |
| CA-18 | Token inexistente o manipulado | U `respuestas`; E `envio`; I `envio` |
| CA-19 | Fuera de plazo o ya respondida | U `respuestas`; E `envio`; I `envio` |
| CA-20 | El cron vence y reasigna solo las pendientes vencidas | I `cron` |
| CA-21 | Sin candidatos: aviso al administrador | I `cron`, `envio` |
| CA-22 | Baja desde el enlace | E `envio`; I `envio` |
| CA-23 | Sin sesión de administrador no hay datos (RLS con anónimo) | U `rol`, `rutas`; E `acceso`; I `catalogo`, `colaboradores`, `envio`, `esquema`, `reparto`, `semanas` (lecturas y escrituras con un usuario anónimo y con uno autenticado sin rol). `cerrar_semana` y `conservar_doce_meses` (PR 8) no tienen una prueba propia con anónimo: los cubre la regla 7 de `scripts/comprobar-rls.sql` (anon no ejecuta ninguna función de `public`); O `scripts/comprobar-rls.sql` en CI, en cada despliegue y en cada copia restaurada |
| CA-24 | Páginas públicas: nombre de pila, fecha y alimentos | U `respuestas`; E `envio`; I `envio` |
| CA-25 | Registro público desactivado | U `config-supabase`, `rol`; E `acceso`; I `auth`; O paso "Registro público cerrado" de `deploy.yml` en pruebas y en producción |
| CA-26 | El cron exige `CRON_SECRET` | U `cron`; E `acceso` (también `@humo` en los entornos desplegados); I `cron` |
| CA-27 | El cron consulta la base de datos | I `cron` |
| CA-28 | Móvil de 375 px sin desplazamiento horizontal | E en todos los archivos (proyecto `movil`) |
| CA-29 | Histórico de una semana cerrada | E `historico`; I `historico` |
| CA-30 | Un PR con pruebas fallidas no se fusiona | O `main` protegida: PR obligatorio y check `comprobaciones`, también para administradores. Comprobado por API el 2026-11-15 (`enforce_admins` activado). Varios PR tuvieron ejecuciones de CI fallidas y solo se fusionaron cuando pasaron |
| CA-31 | Humo fallido en pruebas → producción intacta | O en `deploy.yml`, el job `produccion` (migraciones y despliegue) depende de `pruebas` y solo corre si este termina bien. Revisado en la revisión del PR 0. No se ha provocado un fallo real de humo a propósito |
| CA-32 | Etiqueta, release y CHANGELOG por despliegue | O etiquetas y releases `v0.1.0` a `v0.9.0`; `scripts/comprobar-version.mjs` en CI |
| CA-33 | Republicar una etiqueta anterior | O el 2026-11-15 se republicó `v0.9.0` a mano (deploy → Run workflow), primero en pruebas y después en producción |
| CA-34 | Copia diaria cifrada y restauración comprobada | O repositorio privado `cesta-copias`, workflow `copia`: cada ejecución restaura la copia cifrada en un Supabase desechable y compara las filas de cada tabla (ver la nota) |

## Nota sobre CA-34

El spec dice "restaurarla en el entorno de pruebas". La restauración se comprueba en un Supabase **desechable**, que se crea vacío en la misma ejecución, y no en `cesta-pruebas`, por dos motivos:

- **Datos personales:** restaurar producción en pruebas dejaría nombres y correos reales en el proyecto al que llegan las vistas previas.
- **Más comprobaciones:** se comprueba **cada día** y no una sola vez.

Qué comprueba cada ejecución:
- que la copia cifrada se descifra;
- que se restaura sin errores en una sola transacción;
- que `scripts/comprobar-rls.sql` pasa contra la base restaurada;
- que los permisos, la RLS y las políticas (`scripts/huella-permisos.sql`) son idénticos a los de producción;
- que cada tabla tiene las mismas filas que el volcado.

Los pasos de restauración son los mismos que los de `docs/operacion.md`. La pila local de Supabase no es idéntica a la alojada (versiones de `auth`), así que un cambio de la plataforma puede hacer fallar la comprobación: `docs/operacion.md` explica qué hacer.

Primera ejecución correcta: 2026-11-15. Las anteriores encontraron dos problemas del procedimiento de restauración, ya corregidos:
- Una tabla interna de Storage no se podía restaurar. La app no usa Storage, y desde entonces no se copia.
- Supabase daba permisos por defecto de más a `anon` y `authenticated` sobre lo restaurado. Ahora se quitan antes con `scripts/preparar-restauracion.sql`. El cambio respecto al spec está anotado en su §7.
