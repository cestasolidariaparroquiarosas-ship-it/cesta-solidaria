# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versiones según [SemVer](https://semver.org/lang/es/).
Cada versión enlaza los artefactos de la metodología que la originaron (`docs/sdlc/`).

## [0.7.0] - 2026-11-15

Origen: [intent](docs/sdlc/0001-cesta-v1/intent.md) · [spec](docs/sdlc/0001-cesta-v1/spec.md) · [plan](docs/sdlc/0001-cesta-v1/plan.md), PR 6.

### Añadido
- **Envío de la semana** (paso 4, R4.1, CA-14): un botón con confirmación pasa las asignaciones a "esperando respuesta" y envía un correo a cada colaborador. El correo lleva:
  - La fecha de entrega y lo que tiene que llevar, con cantidades y el gasto aproximado.
  - El plazo para responder y dos enlaces: "Puedo llevarlo" y "No puedo esta vez".
  - Un pie de protección de datos con el enlace de baja.
  - Como "Responder a", el administrador (R4.7).
- **Página de respuesta** `/r/[token]` (R4.2 a R4.4):
  - Abrir el enlace solo muestra el resumen; la respuesta cuenta al pulsar el botón (CA-15).
  - Solo se acepta si la asignación sigue pendiente y no ha pasado el plazo; si no, la página explica por qué (CA-16, CA-19).
  - Un enlace que no existe o está manipulado muestra un error y no cambia nada (CA-18).
  - Solo se muestran el nombre de pila, la fecha y los alimentos (CA-24).
- **Rechazo con reasignación inmediata** (R4.4, CA-17): los alimentos pasan al siguiente candidato que no tenga asignación esa semana, y su correo sale en el momento. Su plazo es el que llegue antes: 48 horas, o las 23:59 de la víspera de la entrega.
  - La función SQL bloquea la semana, así que dos rechazos casi simultáneos no eligen al mismo sustituto. Hay una prueba de integración con dos rechazos en paralelo (plan §4).
  - Si no queda nadie, o ya no hay tiempo antes de la entrega, los alimentos quedan "sin cubrir" y el administrador recibe un aviso por correo (R4.6). En la semana hay un botón "Buscar sustituto" para cuando haya alguien.
- **Baja desde el correo** `/baja/[token]` (R5.1, CA-22): tras confirmar en la página, el colaborador pasa a "de baja". Sus asignaciones pendientes se tratan como un "no puedo" para que alguien las cubra; las confirmadas se mantienen.
- **Seguimiento** en el paso 4 de la semana: el estado de cada colaborador (esperando respuesta, confirmada, no puede, sin respuesta), a quién sustituye, los correos que no salieron con "Volver a intentarlo", y lo que está sin cubrir.
- **Correo de prueba** en Inicio, para comprobar la configuración de Gmail.
- Migración `20261115200000_envio_respuestas.sql`: columna `asignaciones.envio_reservado_en` y funciones `enviar_semana`, `responder_asignacion`, `buscar_sustituto` y `dar_de_baja`.
  - Las dos de los enlaces solo las puede ejecutar el servidor con la clave secreta.
  - `enviar_semana` comprueba que el reparto esté completo, que el plazo no haya pasado y que nadie del reparto esté de baja o en pausa (CA-03).
- Correo con Nodemailer: Gmail en producción y Mailpit en local y en CI. Las pruebas de integración leen los correos de Mailpit.

### Revisión independiente
- [Informe](docs/sdlc/0001-cesta-v1/revision-pr6.md): 1 hallazgo medio y 8 menores, todos corregidos. El medio: si Vercel cortaba la función a mitad de un envío, la asignación podía quedar como enviada sin que el correo hubiera salido. Ahora la reserva del envío va en su propia columna (`envio_reservado_en`), caduca a los 5 minutos, y `enviado_en` solo se anota cuando el correo ha salido.

### Pendientes resueltos
- **De la 0.6.0:** "Enviar" bloquea la semana (`FOR UPDATE`), comprueba el reparto y no envía asignaciones sin colaborador.
- **De la 0.3.0:** CA-03 completo. Se comprueba el estado del colaborador justo antes de cada correo, y se decide qué pasa con sus asignaciones al darse de baja desde el enlace.

### Notas de diseño
- Primero se guarda y después se envía (plan §4). Antes de enviar, cada correo se "reserva" (`envio_reservado_en`) si no hay otra reserva reciente, para que dos envíos a la vez no manden dos correos (CA-14). Si falla, se quita la reserva y se anota `error_envio`, solo con el código. El envío de una semana se para al primer error de conexión o cerca del límite de tiempo: lo que queda se reintenta.
- El enlace de baja usa el token de la asignación: identifica al colaborador sin añadir otro dato.
- En las vistas previas de Vercel, los enlaces usan la dirección que pone Vercel (`VERCEL_URL`) si no hay `APP_URL`.
- El reparto marca a quien ya no está disponible (por ejemplo, porque se dio de baja desde un correo de otra semana) para cambiarlo antes de enviar.

### Pendiente para el PR 7
- Cron diario: pasar a "sin respuesta" las asignaciones con el plazo vencido y reasignarlas con `privado.reasignar` (que ya bloquea la semana), reintentar los correos sin `enviado_en` con `enviarPendientes` y avisar al administrador (CA-20, CA-21, CA-26, CA-27). Necesita `CRON_SECRET`.
- No reasignar en semanas cuya entrega ya ha pasado.

## [0.6.0] - 2026-11-15

Origen: [intent](docs/sdlc/0001-cesta-v1/intent.md) · [spec](docs/sdlc/0001-cesta-v1/spec.md) · [plan](docs/sdlc/0001-cesta-v1/plan.md), PR 5.

### Añadido
- **Selección de colaboradores (R2)**, en `lib/dominio/seleccion.ts`:
  - Hacen falta N = coste total / precio base, redondeado hacia arriba y contando en céntimos (CA-09).
  - Son candidatos los activos y los pausados cuya pausa termina antes de la entrega (CA-02, CA-03).
  - Se eligen primero quienes nunca han participado, después los que llevan más tiempo sin hacerlo y, a igualdad, quien se dio de alta antes (CA-10).
  - Si hay menos candidatos que N, se usan todos y la pantalla avisa de que su gasto superará el precio base (CA-13).
- **Reparto equilibrado (R3)**, en `lib/dominio/reparto.ts`: cada unidad es una pieza; de la más cara a la más barata, cada pieza va a quien menos lleva y, si hay empate, a quien ya lleva ese alimento.
  - Pruebas de propiedades con 500 semanas al azar: la diferencia de gasto nunca supera la pieza más cara (CA-11) y cada unidad se asigna exactamente una vez (CA-12).
  - Quien no recibe nada no entra en el reparto, para no mandarle un correo vacío.
- **Pantalla de reparto** (`/semanas/[id]/reparto`, paso 3):
  - Resumen con el coste, el precio base, cuántos colaboradores hacen falta y cuántos hay disponibles.
  - Lo que lleva cada colaborador, con el mismo alimento de distintas cestas sumado, y su gasto. Si supera el precio base, se avisa pero se permite (R3.5).
  - Mover unidades de un alimento a otro colaborador. Quien se queda sin nada sale del reparto.
  - Cambiar un colaborador por otro candidato, con su última participación a la vista.
  - Volver a proponer el reparto, con confirmación porque se pierden los cambios hechos a mano.
- Migración `20261115180000_reparto.sql`:
  - Vista `ultimas_participaciones` (`security_invoker`): la última participación agregada en la base de datos. La usan la selección y la lista de colaboradores.
  - `proponer_reparto` y `mover_en_reparto`: guardan los cambios de una vez, bloquean la semana (`FOR UPDATE`) y comprueban al final que cada unidad de cada cesta está asignada exactamente una vez (CA-12). Si no, no se guarda nada.

### Revisión independiente
- [Informe](docs/sdlc/0001-cesta-v1/revision-pr5.md): 1 hallazgo alto (en las pruebas e2e), 1 medio y 4 menores, todos corregidos. El medio: el disparador que descarta el reparto no bloqueaba la semana antes de borrar, y un cambio de cesta simultáneo a una propuesta podía dejar el reparto desfasado.
- En la pantalla del móvil, los desplegables con nombres largos ensanchaban la página; ahora se recortan (CA-28).

### Pendientes resueltos
- **De la 0.5.0, cambiar una cesta después de proponer el reparto:** el reparto propuesto se descarta (disparador en `cesta_items` y `cestas`). La cesta y el alta de cestas avisan antes de que pase, y volver a proponerlo es un clic.
- **De la 0.3.0, última participación con más de 1000 asignaciones:** ahora sale de la vista agregada.

### Notas de diseño
- Se mueve por alimento y unidad, como se muestra, tomando de las cestas en orden: al colaborador le da igual de qué cesta sale cada paquete.
- Las cestas siguen ligadas a cada unidad repartida (`asignacion_items` apunta a `cesta_items`), así que el histórico sabe de qué cesta salió cada cosa.
- Si un colaborador se elimina definitivamente con un reparto propuesto, su asignación aparece como "Colaborador eliminado" y se puede cambiar por otro. La app ya no deja eliminarlo en ese caso (versión 0.3.0); solo pasaría si se hace a la vez desde dos pestañas.

### Pendiente para el PR 6
- "Enviar" pasa la semana a `enviada` con `SELECT ... FOR UPDATE` (las funciones del reparto ya bloquean igual), llama a `privado.comprobar_reparto_completo` antes de enviar y no envía asignaciones sin colaborador.

## [0.5.0] - 2026-11-15

Origen: [intent](docs/sdlc/0001-cesta-v1/intent.md) · [spec](docs/sdlc/0001-cesta-v1/spec.md) · [plan](docs/sdlc/0001-cesta-v1/plan.md), PR 4.

### Añadido
- **Semanas** (spec §5.6): lista, alta, datos (paso 1: fecha de entrega, precio base y plazo) y eliminación mientras está en preparación. Los pasos 3 y 4 (reparto y envío) llegan en los PR 5 y 6.
  - El plazo se escribe en hora de Madrid y se guarda en UTC; tiene que ser futuro y anterior al día de la entrega. Se prueban los cambios de hora de marzo (la hora que no existe se rechaza) y de octubre (en la hora repetida se toma la primera vez).
  - El precio base se rellena con el de la semana anterior.
- **Cestas** (paso 2) con la propuesta automática de R1 (`lib/dominio/cesta.ts`):
  - Cantidad = adultos × por adulto + niños × por niño, redondeado hacia arriba, contando en centésimas para que 2 × 1,5 + 1 sean 4 y no 5 (CA-05).
  - Se quitan los alimentos que chocan con las exclusiones y la cesta lo avisa, para añadir sustitutos (CA-06). También avisa de los desactivados en el catálogo, que no se proponen.
  - Se pueden añadir alimentos a mano, cambiar cantidades y quitarlos. Si el alimento choca con las exclusiones no se guarda (CA-07).
  - Cambiar los datos de la cesta conserva sus alimentos, salvo los que choquen con una exclusión nueva. Una casilla permite volver a proponerlos con la lista base.
  - Del receptor solo se pide un identificador ("Familia 12").
- La semana muestra cada cesta con sus unidades, su coste y el coste total.
- Migración `20261115120000_semanas_cestas.sql`:
  - `cesta_items.unidad`: la unidad se copia al añadir el alimento, igual que el precio (CA-08). Un disparador copia los dos del catálogo si no se indican.
  - Las cestas, sus alimentos y sus exclusiones solo se cambian con la semana en preparación (`borrador`). El identificador del receptor sí se puede cambiar siempre (conservación a 12 meses, PR 8).
  - `guardar_cesta`: guarda la cesta, sus exclusiones y sus alimentos de una vez.

### Requisitos de la revisión del PR 3
- **Choque posterior (CA-06):** si después de crear una cesta se marca en el catálogo que un alimento contiene algo que la cesta excluye, la cesta lo muestra en rojo y la semana dice "Revisar". Prueba de integración que añade la etiqueta después.
- **Unidad cambiada:** se copia en `cesta_items`, así que las cestas ya creadas siguen pidiendo lo mismo.

### Revisión independiente
- [Informe](docs/sdlc/0001-cesta-v1/revision-pr4.md): 1 hallazgo medio y 7 menores, todos corregidos. El principal: borrar una lista base usada en una semana ya enviada fallaba por el disparador nuevo.

### Notas de diseño
- Al borrar una lista base, las cestas que la usaron se quedan sin lista y conservan sus alimentos, también en semanas enviadas.
- La comprobación de "semana en preparación" bloquea la fila de la semana (`FOR SHARE`) hasta el final del cambio.
- Al añadir una exclusión, la cesta dice qué alimentos se han quitado, también los añadidos a mano.
- Los avisos de "no entran por las exclusiones" se calculan al mostrar la cesta con la lista base actual; no se guardan.
- "Volver a proponer" toma los precios actuales del catálogo: es una cesta nueva.
- Sin lista base, la cesta empieza vacía y se llena a mano.

### Pendiente para los siguientes PR
- **PR 5:** cambiar una cesta después de proponer el reparto. Los alimentos ya repartidos no se pueden quitar (clave ajena) y el mensaje actual es genérico. Decidir si cambiar una cesta descarta el reparto propuesto.
- **PR 6:** "Enviar" debe pasar la semana a `enviada` con `SELECT ... FOR UPDATE`, para esperar a los cambios de cestas en curso.

## [0.4.0] - 2026-11-15

Origen: [intent](docs/sdlc/0001-cesta-v1/intent.md) · [spec](docs/sdlc/0001-cesta-v1/spec.md) · [plan](docs/sdlc/0001-cesta-v1/plan.md), PR 3.

### Añadido
- **Alimentos** (spec §5.4): catálogo con nombre, unidad, precio aproximado y lo que "contiene" (etiquetas). Alta, edición, desactivación y eliminación. Por defecto la lista muestra solo los activos.
- **Etiquetas de exclusión**: alta, cambio de nombre y eliminación. No se puede eliminar una etiqueta que lleva algún alimento o que usa alguna cesta.
- **Listas base** (spec §5.5): plantillas con las unidades al mes por adulto y por niño de cada alimento, con decimales (R1.1). Una sola predeterminada.
- Migración `20261115000000_catalogo.sql` con dos funciones SQL (con los permisos de quien llama, así que la RLS se aplica):
  - `guardar_alimento`: guarda el alimento y sus etiquetas de una vez. Si fallaran las etiquetas después de guardar el alimento, podría quedar un "chorizo" sin la etiqueta "cerdo" y acabar en una cesta "sin cerdo".
  - `marcar_lista_predeterminada`: cambia la predeterminada de una vez.
- Piezas de formulario compartidas en `app/(admin)/_ui/` (campos accesibles, avisos y estilos).

### Notas de diseño
- Los precios y cantidades admiten coma o punto decimal, con dos decimales como mucho.
- Un alimento de una lista base no puede tener 0 por adulto y 0 por niño: nunca entraría en una cesta.
- No se puede eliminar un alimento que esté en una lista base o en una cesta; se desactiva. Así el histórico no cambia (CA-08).
- Un alimento desactivado que sigue en una lista base se marca en la lista: no se propondrá en las cestas (lo aplicará R1 en el PR 4).
- La etiqueta se nombra por lo que se excluye ("cerdo"); su código interno se genera del nombre y no cambia al renombrarla. El nombre es único sin distinguir mayúsculas: dos "cerdo" (una en la cesta y otra en el alimento) dejarían pasar el alimento.
- Eliminar una etiqueta pide confirmación.

### Pendiente para el PR 4 (revisión independiente)
- Añadir una etiqueta a un alimento que ya está en una cesta con esa exclusión no se bloquea (decisión del PR 1): la cesta debe avisar del choque, con una prueba de CA-06 que añada la etiqueta después de crear la cesta.
- Cambiar la unidad de un alimento que ya está en cestas sin cerrar cambia lo que se pide a los colaboradores: avisar o bloquear, o copiar la unidad en `cesta_items` como el precio.

## [0.3.1] - 2026-11-14

Origen: puesta en marcha ([spec](docs/sdlc/0001-cesta-v1/spec.md) §7, [plan](docs/sdlc/0001-cesta-v1/plan.md)) y revisión de seguridad antes de cargar datos reales.

### Cambiado
- `vercel.json`: framework Next.js y funciones en Fráncfort (`fra1`), junto a la base de datos. Antes se ejecutaban en Washington (`iad1`).
- La copia de seguridad se desactiva por completo hasta trasladarla a un repositorio privado: el repositorio ahora es público y sus artefactos de Actions se pueden descargar. **CA-34 queda pendiente.**
- La consulta diaria que evita que Supabase pause los proyectos pasa a `mantener-activo.yml`, ahora para pruebas y producción.
- Los workflows declaran `permissions: contents: read` por defecto.
- `docs/operacion.md`: estado real de la puesta en marcha, tipo de las variables de Vercel, verificación en dos pasos y consejos.

## [0.3.0] - 2026-11-14

Origen: [intent](docs/sdlc/0001-cesta-v1/intent.md) · [spec](docs/sdlc/0001-cesta-v1/spec.md) · [plan](docs/sdlc/0001-cesta-v1/plan.md), PR 2.

### Añadido
- Pantalla **Colaboradores** (spec §5.3):
  - Lista con filtros por estado (todos, activos, en pausa, de baja) y la fecha de la última participación de cada uno.
  - Alta con nombre, correo, notas y consentimiento. Sin la casilla de consentimiento no se guarda.
  - Ficha de cada colaborador para editar sus datos, ponerlo en pausa con fecha de vuelta (o sin ella), reactivarlo, darlo de baja y eliminarlo definitivamente.
- Con un correo que ya existe, sin distinguir mayúsculas, no se guarda y se avisa junto al campo (CA-01).
- Regla de candidatos de R2.3 en `lib/dominio/colaboradores.ts`, lista para la selección del PR 5: un colaborador en pausa no es candidato si su pausa llega hasta la fecha de entrega o más allá; uno de baja, nunca (CA-02; CA-03 en parte).
- "Eliminar definitivamente" borra el nombre y el correo de todas las tablas, y sus asignaciones se conservan sin colaborador (CA-04). El texto "Colaborador eliminado" ya está preparado; se verá en pantalla cuando haya pantallas con asignaciones (PR 5 y PR 8).
- `docs/operacion.md`: cómo borrar los datos de un colaborador y qué hacer con los borrados al restaurar una copia.

### Notas de diseño (respecto al spec)
- **Pausa sin fecha:** es indefinida; el colaborador no es candidato hasta que se reactive. `pausado_hasta` es el último día de la pausa, incluido.
- **Consentimiento obligatorio en el alta:** se guarda la fecha en `fecha_consentimiento`. A los colaboradores que no lo tengan registrado, la ficha permite anotarlo después.
- **Asignaciones en curso:** primero hay que cambiar al colaborador por otro en el reparto de esa semana (PR 5).
  - No se puede **pausar ni dar de baja** a quien tiene una asignación propuesta o pendiente de respuesta: al enviar la semana le llegaría el correo igualmente (CA-03).
  - No se puede **eliminar** a quien tiene una asignación propuesta, pendiente o confirmada sin entregar en una semana sin cerrar: quedaría sin nadie que la lleve, o no se sabría a quién llamar.
- **Correo en minúsculas:** se guarda así para que el aviso de repetido y los envíos sean coherentes.
- **Teléfono:** no se pide. El spec lo deja para cuando se decida que hace falta.
- Si un formulario tiene un error, se conserva lo escrito (React vacía los formularios tras cada envío). Los cambios que salen bien vuelven a la ficha con un aviso.

### Pendiente para los siguientes PR
- **PR 5:** la última participación se calcula leyendo todas las asignaciones confirmadas, y PostgREST corta en 1000 filas. Para la lista basta durante años, pero la selección de R2.4 debe usar una vista agregada, y esta lista también. Comprobar y borrar un colaborador son dos pasos: con el reparto ya existente, valorar hacerlo en una función SQL con bloqueo.
- **PR 6:** CA-03 completo. Comprobar el estado del colaborador justo antes de enviar cada correo, y decidir qué pasa con sus asignaciones en curso cuando se da de baja desde el enlace del correo (R5.1).
- Los errores de la base de datos se tratan por su código y nunca se registran enteros, porque el de correo repetido incluye el correo.

## [0.2.0] - 2026-11-14

Origen: [intent](docs/sdlc/0001-cesta-v1/intent.md) · [spec](docs/sdlc/0001-cesta-v1/spec.md) · [plan](docs/sdlc/0001-cesta-v1/plan.md), PR 1.

### Añadido
- Migración inicial con todas las tablas del modelo de datos (spec §3): colaboradores, etiquetas de exclusión, alimentos, listas base, semanas, cestas, asignaciones y registro de eventos.
- Row Level Security en todas las tablas: solo los administradores (`app_metadata.rol = "admin"`, sesión no anónima) leen o escriben. El rol anónimo no tiene ningún permiso sobre las tablas (CA-23).
- `scripts/comprobar-rls.sql`: falla si alguna tabla queda sin RLS o sin una política que exija ser administrador, si los anónimos tienen permisos sobre tablas o funciones, si una vista o vista materializada se salta la RLS, o si una función `SECURITY DEFINER` es ejecutable por usuarios. Se ejecuta en CI y después de cada migración en pruebas y producción.
- Restricciones en la base de datos:
  - Correo de colaborador único sin distinguir mayúsculas (CA-01).
  - Ningún alimento de una cesta choca con sus exclusiones, ni al añadir el alimento ni al añadir la exclusión (CA-07).
  - Un colaborador tiene como mucho una asignación por semana; también evita que dos rechazos simultáneos elijan al mismo sustituto.
  - Al borrar un colaborador, sus asignaciones se conservan sin él, como "Colaborador eliminado" (CA-04).
  - Como mucho una lista base predeterminada.
- Las cinco etiquetas de exclusión iniciales (cerdo, gluten, lactosa, frutos secos, huevo) van en la migración, para que existan también en producción.
- `supabase/seed.sql` (solo local y CI): catálogo de ejemplo y lista "Familia estándar". Sin colaboradores de ejemplo, para que las pruebas de selección sean deterministas.
- Pruebas de integración del esquema: acceso anónimo, usuario sin rol y administrador sobre cada tabla, y las restricciones anteriores.

### Notas de diseño (respecto al spec §3)
- Los estados se guardan como texto con `CHECK`, no como `ENUM`, para poder ampliarlos sin romper la versión anterior.
- `semanas.cerrada_en`: fecha de cierre, para la conservación a 12 meses (spec §10). `semanas.fecha_entrega` es única.
- `registro_eventos.semana_id`: para avisos que no son de una asignación concreta, como "sin candidatos" (R4.6).
- Las relaciones N:M se llaman `alimento_etiquetas` y `cesta_exclusiones`. Su clave es la pareja de ids y solo tienen `creado_en`: no se editan, se crean o se borran.
- `asignaciones`: una asignación `pendiente` debe tener plazo, para que el cron pueda vencerla (R4.5).
- Quitar de una cesta un alimento que ya tiene colaborador falla a propósito, para que el histórico no cambie en silencio. Borrar la semana entera sí funciona.
- El registro de eventos se conserva aunque se borre la semana.
- Las funciones nuevas de `public` no se pueden ejecutar como anónimo por defecto. Las `SECURITY DEFINER` (como la futura reasignación, PR 6) las llama solo el servidor.
- Añadir una etiqueta a un alimento del catálogo nunca se bloquea: si choca con una cesta ya creada, avisará la pantalla de la cesta (PR 4).

## [0.1.0] - 2026-11-14

Origen: [intent](docs/sdlc/0001-cesta-v1/intent.md) · [spec](docs/sdlc/0001-cesta-v1/spec.md) · [plan](docs/sdlc/0001-cesta-v1/plan.md), PR 0.

### Añadido
- Esqueleto de la aplicación: Next.js 16, TypeScript y Tailwind.
- Acceso de administradores con Supabase Auth, con el registro público desactivado (CA-25). Además, solo entran las cuentas con `app_metadata.rol = "admin"`.
- Sin sesión de administrador, todas las rutas de gestión redirigen a `/login` (CA-23).
- Cada despliegue comprueba que el registro público está cerrado en pruebas y en producción (CA-25).
- Pruebas unitarias (Vitest), de integración contra Supabase local y e2e (Playwright), con el subconjunto `@humo` para los entornos desplegados.
- CI en cada PR (CA-30).
- Despliegue automático: pruebas → humo → producción, con etiqueta y release (CA-31, CA-32).
- Republicación de versiones anteriores (CA-33).
- Copia de seguridad diaria cifrada (CA-34).
- `CLAUDE.md` con la metodología y las reglas del proyecto, y `docs/operacion.md`.
