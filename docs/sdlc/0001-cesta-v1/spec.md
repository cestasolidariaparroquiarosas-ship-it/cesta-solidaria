# Spec: Cesta solidaria — versión 1 (fase 1)

- **Origen:** `intent.md` (aprobado el 2026-11-14)
- **Estado:** aprobado (2026-11-14). Las propuestas de la sección 10 se aceptan; los ajustes irán en iteraciones posteriores.
- **Fecha:** 2026-11-14

Este documento define qué se construye en la fase 1 y cómo se comprueba que está bien hecho. Cada criterio de aceptación (CA) se puede probar y tendrá al menos una prueba automática. La única excepción es CA-28, que se revisa a mano porque depende del aspecto visual.

---

## 1. Alcance

**Entra en la versión 1:**
- La gestión completa del administrador: colaboradores, alimentos, listas base, semanas, cestas, reparto, correos, confirmaciones e histórico.
- Las páginas públicas que responden a los enlaces del correo.

**No entra, pero queda preparado:**
- El perfil de colaborador (fase 2). El modelo de datos ya relaciona a cada colaborador con sus asignaciones, así que la fase 2 solo añade acceso y pantallas.

## 2. Decisiones técnicas

| Pieza | Elección | Motivo |
|---|---|---|
| Aplicación | Next.js (App Router) + TypeScript | Un solo proyecto para pantallas y lógica de servidor; es el estándar de Vercel |
| Estilos | Tailwind CSS | Diseño adaptable a móvil sin mantener CSS a mano |
| Base de datos y acceso | Supabase (Postgres + Auth) con Row Level Security | Ya tienes cuenta; el plan gratuito sobra para este volumen |
| Alojamiento | Vercel (plan Hobby) | Ya tienes cuenta; despliegue desde GitHub |
| Correo | SMTP de una cuenta de Gmail creada para la cesta, con contraseña de aplicación, mediante Nodemailer. Con esa misma cuenta se crean Supabase y Vercel | Gratis y sin dominio propio. Resend gratuito solo envía a tu propio correo si no tienes un dominio verificado |
| Tareas programadas | Un cron diario de Vercel | El plan Hobby solo permite crons diarios, y para esto basta |
| Pruebas | Vitest (lógica e integración con Supabase local) + Playwright (recorridos completos) | Una prueba por cada CA |
| Migraciones | Carpeta `supabase/migrations`, aplicadas con la CLI de Supabase | Cambios de base de datos versionados en git |

## 3. Modelo de datos

Todas las tablas tienen `id` (uuid), `creado_en` y `actualizado_en`.

- **colaboradores:**
  - `nombre`, `email` (único) y `telefono` (opcional; solo si se decide que hace falta).
  - `estado`: `activo` | `pausado` | `baja`.
  - `pausado_hasta` (fecha, opcional).
  - `fecha_consentimiento` y `notas`.
- **etiquetas_exclusion:** `codigo` y `nombre`. Por ejemplo: sin cerdo, sin gluten, sin lactosa, sin frutos secos, sin huevo. El administrador puede gestionarlas.
- **alimentos:**
  - `nombre` y `unidad` (paquete 1 kg, litro, lata…).
  - `precio_aprox` (euros).
  - `activo` (booleano).
  - `contiene` (relación N:M con etiquetas_exclusion).
- **listas_base:** `nombre` (por ejemplo, "Familia estándar") y `predeterminada` (booleano).
- **lista_base_items:** `lista_base_id`, `alimento_id`, `cantidad_por_adulto` y `cantidad_por_nino` (unidades al mes, con decimales).
- **semanas:**
  - `fecha_entrega` (el fin de semana en que los colaboradores llevan los alimentos).
  - `precio_base` (euros por colaborador).
  - `plazo_confirmacion` (fecha y hora).
  - `estado`: `borrador` | `enviada` | `cerrada`.
- **cestas:**
  - `semana_id` e `identificador_receptor` (texto libre, mínimo).
  - `adultos` y `ninos`.
  - `exclusiones` (relación N:M con etiquetas_exclusion).
  - `lista_base_id`.
- **cesta_items:** `cesta_id`, `alimento_id`, `cantidad` (unidades enteras) y `precio_unitario` (copiado del catálogo al crear la cesta, para que el histórico no cambie si cambia el precio).
- **asignaciones:**
  - `semana_id` y `colaborador_id`.
  - `estado`: `propuesta` | `pendiente` | `confirmada` | `rechazada` | `sin_respuesta`.
  - `token` (aleatorio, 32 bytes) y `plazo`.
  - `enviado_en`, `respondido_en` y `entregado` (booleano).
  - `sustituye_a` (asignación anterior, si viene de una reasignación).
- **asignacion_items:** `asignacion_id`, `cesta_item_id` y `cantidad`.
- **registro_eventos:** `tipo`, `asignacion_id`, `detalle` y `fecha`. Sirve para auditar envíos, respuestas y reasignaciones.
- **administradores:** son los usuarios de Supabase Auth. El registro público está desactivado y los administradores se dan de alta a mano.

**Última participación** de un colaborador: la `fecha_entrega` más reciente de una semana en la que tuvo una asignación `confirmada`.

## 4. Reglas de negocio

### R1 — Propuesta de cesta

1. Para cada elemento de la lista base elegida: `cantidad = redondeo hacia arriba(adultos × cantidad_por_adulto + niños × cantidad_por_nino)`. Si el resultado es 0, el alimento no se incluye.
2. Se eliminan los alimentos que contienen alguna de las exclusiones de la cesta. La app muestra un aviso con los alimentos quitados para que el administrador añada sustitutos si quiere.
3. La cesta resultante se puede editar: añadir y quitar alimentos y cambiar cantidades. Al añadir un alimento a mano, la app no deja guardar si choca con las exclusiones de la cesta.

### R2 — Selección de colaboradores

1. `coste_total` = suma de cantidad × precio_unitario de todas las cestas de la semana.
2. `N` = redondeo hacia arriba(coste_total / precio_base).
3. Son candidatos los colaboradores con estado `activo`, más los `pausado` cuyo `pausado_hasta` sea anterior a `fecha_entrega`.
4. El orden es este: primero quienes nunca han participado; después, de última participación más antigua a más reciente; a igualdad, el que se dio de alta antes.
5. Se eligen los N primeros. Si hay menos candidatos que N, se usan todos y la app avisa de que su gasto superará el precio base.

### R3 — Reparto equilibrado

1. Cada unidad de cada `cesta_item` es una pieza con su precio.
2. Las piezas se ordenan de mayor a menor precio.
3. Cada pieza va al colaborador elegido que lleva menos gasto acumulado. Si hay empate, se prefiere al que ya lleva ese mismo alimento, para que "3 paquetes de arroz" no se partan entre tres personas sin necesidad.
4. Garantía: entre el colaborador que más gasta y el que menos, la diferencia no supera el precio de la pieza más cara de la semana.
5. El administrador puede mover alimentos de un colaborador a otro y cambiar un colaborador por otro antes de enviar. Si mover algo deja a un colaborador por encima del precio base, la app lo avisa pero lo permite.

### R4 — Correos y confirmaciones

1. Al pulsar "Enviar", cada asignación `propuesta` pasa a `pendiente` y su colaborador recibe un correo con:
   - La fecha de entrega y la lista de lo que tiene que llevar, con cantidades.
   - El plazo para responder.
   - Dos enlaces: "Puedo llevarlo" y "No puedo esta vez".
   - Un pie con información sobre protección de datos y un enlace para darse de baja.
2. Los enlaces abren una página de la app que muestra el resumen y un botón para confirmar la respuesta. Abrir el enlace no registra nada; solo cuenta pulsar el botón. Así se evita que los antivirus del correo, que abren los enlaces automáticamente, confirmen o rechacen por error.
3. Una respuesta solo se acepta si la asignación sigue `pendiente` y no ha pasado su plazo. En cualquier otro caso, la página explica la situación y no cambia nada.
4. **Rechazo:** la asignación pasa a `rechazada` y sus alimentos van a una asignación nueva:
   - Es para el siguiente candidato según R2, sin contar a quien ya tenga asignación esa semana.
   - Su correo se envía al momento.
   - Su plazo es el que llegue antes de estos dos: 48 horas desde el envío o las 23:59 del día anterior a la entrega.
5. **Sin respuesta:** el cron diario (8:00, hora de Madrid) pasa a `sin_respuesta` las asignaciones `pendiente` cuyo plazo ha vencido, y las reasigna igual que en un rechazo.
6. **Sin candidatos:** si no queda ningún candidato, la app envía un correo de aviso al administrador y lo marca en el panel.
7. El correo lleva como "Responder a" la dirección del administrador, por si alguien prefiere contestar escribiendo.

### R5 — Baja y borrado de colaboradores

1. El enlace de baja del correo lleva a una página de confirmación. Al confirmar, el colaborador pasa a `baja` y deja de recibir correos.
2. "Eliminar definitivamente" (solo el administrador): borra el nombre y el correo. El histórico se conserva, pero con el colaborador como "Colaborador eliminado".

## 5. Pantallas

1. **Acceso:** correo y contraseña del administrador.
2. **Inicio:** estado de la semana en curso (cuántas confirmadas, pendientes y rechazadas) y avisos.
3. **Colaboradores:** lista con filtros por estado; alta, edición, pausa con fecha de vuelta, baja y eliminación.
4. **Alimentos y etiquetas:** catálogo con precio y exclusiones.
5. **Listas base:** plantillas por tipo de familia, con cantidades por adulto y por niño.
6. **Semanas → detalle de semana**, en cuatro pasos:
   1. Datos: fecha de entrega, precio base y plazo.
   2. Cestas: alta y propuesta automática.
   3. Reparto: propuesta automática y edición.
   4. Envío y seguimiento: estado de cada asignación, reasignaciones y casilla de "entregado".
7. **Histórico:** semanas cerradas, con quién llevó qué.
8. **Páginas públicas** (sin acceso de administrador): respuesta a la asignación y baja.

## 6. Criterios de aceptación

**Colaboradores**
- **CA-01:** Al dar de alta un colaborador con un correo que ya existe, la app no lo guarda y muestra un aviso.
- **CA-02:** Un colaborador `pausado` con `pausado_hasta` igual o posterior a la fecha de entrega no aparece como candidato. Si `pausado_hasta` es anterior, sí aparece.
- **CA-03:** Un colaborador `baja` nunca es candidato y nunca recibe correos.
- **CA-04:** Tras "Eliminar definitivamente", su nombre y correo ya no están en ninguna tabla. Sus asignaciones antiguas aparecen como "Colaborador eliminado".

**Cestas**
- **CA-05:** Lista base con arroz (cantidad_por_adulto 1,5, cantidad_por_nino 1) y una familia de 2 adultos y 1 niño: la cesta propone 4 paquetes de arroz.
- **CA-06:** Una cesta con exclusión "sin cerdo" no contiene ningún alimento con la etiqueta "contiene cerdo", y la app muestra el aviso de los alimentos quitados.
- **CA-07:** Al intentar añadir a mano un alimento que choca con las exclusiones de la cesta, la app no deja guardar.
- **CA-08:** Si cambia el precio de un alimento en el catálogo, las cestas que ya existen conservan el precio que tenían.

**Selección y reparto**
- **CA-09:** Con coste total de 95 € y precio base de 20 €, se eligen 5 colaboradores.
- **CA-10:** Con 3 colaboradores activos (A nunca ha participado, B participó hace 3 semanas, C la semana pasada) y N = 2, se eligen A y B.
- **CA-11:** En cualquier reparto, la diferencia entre el gasto mayor y el menor no supera el precio de la pieza más cara de la semana. Se prueba con conjuntos de datos generados al azar.
- **CA-12:** Todas las unidades de todas las cestas quedan asignadas exactamente una vez: ni falta ninguna ni se repite.
- **CA-13:** Si hay menos candidatos que N, se asigna todo entre los disponibles y aparece el aviso de exceso sobre el precio base.

**Correos y respuestas**
- **CA-14:** Al pulsar "Enviar", cada colaborador asignado recibe un solo correo con su lista, el plazo, los dos enlaces y el pie de protección de datos.
- **CA-15:** Abrir un enlace del correo (una petición GET) no cambia el estado de la asignación.
- **CA-16:** Pulsar "Confirmar" en la página del enlace deja la asignación `confirmada` y anota la fecha de respuesta.
- **CA-17:** Al pulsar "No puedo", se crea una asignación nueva con los mismos alimentos para el siguiente candidato que no estaba asignado esa semana, y su correo sale en el mismo momento.
- **CA-18:** Un token inexistente o manipulado muestra una página de error y no cambia nada.
- **CA-19:** Responder después del plazo, o a una asignación que ya no está `pendiente`, no cambia nada y la página lo explica.
- **CA-20:** El cron marca como `sin_respuesta` y reasigna todas las asignaciones `pendiente` con plazo vencido, y solo esas.
- **CA-21:** Si no quedan candidatos para reasignar, el administrador recibe un correo de aviso.
- **CA-22:** El enlace de baja deja al colaborador en `baja` después de confirmar en la página.

**Seguridad y datos**
- **CA-23:** Sin sesión de administrador, ninguna pantalla de gestión ni ninguna API devuelve datos. Las pruebas comprueban la Row Level Security con un usuario anónimo.
- **CA-24:** Las páginas públicas solo muestran los datos de la asignación del token: nombre de pila del colaborador, fecha y alimentos. Nunca muestran identificadores de receptores.
- **CA-25:** El registro público de usuarios en Supabase está desactivado.
- **CA-26:** El endpoint del cron rechaza las llamadas que no traen el secreto `CRON_SECRET`.

**Operación**
- **CA-27:** El cron diario también hace una consulta a la base de datos, para que Supabase no pause el proyecto por inactividad.
- **CA-28:** Todas las pantallas se pueden usar en un móvil de 375 px de ancho sin desplazamiento horizontal.
- **CA-29:** El histórico muestra, para una semana cerrada, cada colaborador con sus alimentos y su estado final.

**Despliegue y versiones**
- **CA-30:** Un PR con alguna prueba fallida no se fusiona ni se despliega.
- **CA-31:** Si la prueba de humo en el entorno de pruebas falla, producción no se toca: ni migraciones ni despliegue.
- **CA-32:** Cada despliegue a producción que sale bien crea una etiqueta `vX.Y.Z`, una GitHub Release y una entrada en `CHANGELOG.md`.
- **CA-33:** Ejecutar el workflow de despliegue indicando una etiqueta anterior vuelve a publicar exactamente esa versión del código.
- **CA-34:** Cada día se genera una copia cifrada de la base de datos de producción. Se ha comprobado al menos una vez que restaurarla en el entorno de pruebas funciona.

## 7. Despliegue (lo hace Claude)

### Flujo de cada cambio (publicación automática)

1. Claude trabaja en una rama y abre un pull request en GitHub.
2. GitHub Actions (`ci.yml`) ejecuta lint, comprobación de tipos y todas las pruebas, con un Supabase local en Docker.
3. Un agente revisor independiente, que no ha escrito el código, revisa el PR contra el spec y el plan, y deja sus conclusiones en el PR.
4. Si CI pasa y la revisión no tiene objeciones graves, Claude hace el merge (squash) a `main`. No hay puerta humana: es tu decisión del 2026-11-14.
5. Al llegar a `main`, `deploy.yml`:
   1. Aplica las migraciones en **pruebas** y despliega una versión de vista previa en Vercel conectada a pruebas.
   2. Ejecuta las pruebas de humo de Playwright contra esa vista previa. **Si fallan, se detiene** y no toca producción (CA-31).
   3. Aplica las migraciones en **producción** y despliega en Vercel producción.
   4. Ejecuta una prueba de humo contra producción.
   5. Calcula la versión, crea la etiqueta `vX.Y.Z` y la GitHub Release y actualiza `CHANGELOG.md` (CA-32).
6. Vercel no está enlazado directamente a GitHub: solo se despliega desde Actions con la CLI. Así un despliegue nunca se salta las pruebas.

### Política de versiones

- **Numeración (SemVer):** `MAJOR.MINOR.PATCH`. PATCH para correcciones, MINOR para funcionalidad nueva (normalmente, un intent nuevo), MAJOR para cambios incompatibles en los datos. La versión sale de los mensajes de commit (Conventional Commits: `fix:`, `feat:`, `feat!:`).
- **Trazabilidad:** cada versión enlaza al intent, spec y plan que la originaron, que están en `docs/sdlc/`.
- **Migraciones solo hacia delante y compatibles con la versión anterior** (expandir y luego contraer): una columna se añade en una versión y la antigua se elimina en una posterior. Así el código de la versión N−1 sigue funcionando con la base de datos de la versión N.

### Volver a una versión anterior

| Situación | Acción (la hace Claude) |
|---|---|
| La última publicación falla | `vercel rollback`: vuelve en segundos a la versión anterior. En el plan gratuito solo se puede volver a la inmediatamente anterior |
| Hay que volver a una versión más antigua | Ejecutar `deploy.yml` a mano con `ref: vX.Y.Z`. Reconstruye y publica esa etiqueta (CA-33). Las migraciones no se deshacen: gracias a la regla de compatibilidad, no hace falta |
| Datos dañados | Restaurar la copia cifrada del día anterior, primero en pruebas y después en producción |

### Copias de seguridad

- `backup.yml` se ejecuta cada día:
  1. Hace `supabase db dump` de producción.
  2. Lo cifra con una clave guardada como secreto.
  3. Lo guarda como artefacto de GitHub Actions durante 30 días.
- La misma ejecución hace una consulta al proyecto de pruebas para que no se pause.

### Puesta en marcha (una sola vez)

Esto no lo puede hacer Claude solo, porque son tus cuentas. Puedo guiarte paso a paso o hacerlo en el navegador con tu sesión iniciada.

1. **Gmail:** crear una cuenta de Gmail para la cesta, activar la verificación en dos pasos y crear una contraseña de aplicación.
2. **GitHub:** crear un repositorio privado `cesta-solidaria`, vacío, y darle acceso a esta sesión.
3. **Supabase:** con la cuenta de Gmail, crear dos proyectos en región UE: `cesta-produccion` y `cesta-pruebas`.
4. **Vercel:** con la cuenta de Gmail, crear un proyecto vacío y un token de acceso.
5. **Secretos de GitHub:**
   - Vercel: `VERCEL_TOKEN`, `VERCEL_ORG_ID` y `VERCEL_PROJECT_ID`.
   - Supabase: `SUPABASE_ACCESS_TOKEN` y la referencia y contraseña de la base de datos de cada proyecto.
   - Copias: `BACKUP_PASSPHRASE`.
6. **Variables de entorno en Vercel:**
   - Supabase (producción para Production, pruebas para Preview).
   - SMTP: usuario y contraseña de aplicación.
   - `CRON_SECRET`, `APP_URL` y `ADMIN_EMAIL`.
7. **Primer administrador:** crear su cuenta.

## 8. Políticas aplicadas

- **RGPD — minimización:**
  - De los receptores, solo un identificador.
  - Las exclusiones se guardan como restricciones alimentarias, nunca como religión ni como salud.
  - Los colaboradores reciben información en cada correo y pueden darse de baja.
  - El administrador puede borrar definitivamente a un colaborador.
- **Seguridad:**
  - Row Level Security en todas las tablas.
  - Las claves de servicio solo se usan en el servidor.
  - Los tokens son aleatorios y de un solo uso por acción.
  - Los secretos nunca se guardan en el repositorio.

## 9. Riesgos y preocupaciones señalados

1. **Límite de Supabase gratuito:** permite 2 proyectos activos, y este diseño usa los dos (producción y pruebas). **Resuelto:** la cuenta es nueva y solo para la cesta.
2. **Pausa del proyecto de pruebas:** se pausaría si pasa una semana sin uso. **Mitigado:** la Action diaria de copia de seguridad también hace una consulta al proyecto de pruebas.
3. **Publicación sin revisión humana:** se publica en cuanto pasan las pruebas, así que el control depende de la calidad de esas pruebas. **Mitigación:**
   - Cada CA tiene su prueba.
   - Cada PR lleva una revisión independiente.
   - Antes de tocar producción se hace una prueba de humo en el entorno de pruebas.
   - Hay versiones etiquetadas para volver atrás.
4. **Copias de seguridad:** el plan gratuito de Supabase no incluye copias automáticas que se puedan restaurar. **Mitigación:** copia propia diaria (CA-34).
5. **Volver atrás en Vercel gratuito:** solo permite volver al despliegue inmediatamente anterior. **Mitigación:** cualquier versión anterior se recupera volviendo a desplegar su etiqueta (CA-33).
6. **Precisión del cron:** en Vercel Hobby, el cron diario se ejecuta en algún momento dentro de la hora programada. Los plazos se cumplen con precisión de un día, no de minutos.
7. **Correo desde Gmail:** el límite (unos 500 envíos al día) sobra para este uso. Con un dominio propio de la parroquia se podría usar Resend, con mejor entrega.
8. **Condiciones de Vercel Hobby:** el plan es para uso personal y no comercial. Un proyecto parroquial sin ánimo de lucro encaja en el espíritu, pero conviene tenerlo presente.

## 10. Respuestas a las preguntas abiertas (aceptadas el 2026-11-14)

| # | Pregunta | Propuesta |
|---|---|---|
| 2 | Colaboradores por cesta | No hay relación fija. Los colaboradores aportan al conjunto de la semana y el administrador monta las cestas con lo que llega |
| 5 | Listas base | Cantidades por adulto y por niño, en unidades al mes. Se empieza con una lista "estándar" y se añaden más según haga falta |
| 6 | Entregas | Casilla "entregado" por asignación. No se registra la recogida por parte de la familia |
| 7 | Administradores | Puede haber varios, todos con los mismos permisos |
| 10 | Conservación | A los 12 meses de cerrar una semana, el identificador del receptor se sustituye por "Cesta n.º X" |
| 11 | Entrada de datos | A mano. Importar desde Excel queda para un intent futuro si hace falta |
