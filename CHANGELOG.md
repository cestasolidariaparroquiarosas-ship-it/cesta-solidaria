# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versiones según [SemVer](https://semver.org/lang/es/).
Cada versión enlaza los artefactos de la metodología que la originaron (`docs/sdlc/`).

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
