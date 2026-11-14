# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versiones según [SemVer](https://semver.org/lang/es/).
Cada versión enlaza los artefactos de la metodología que la originaron (`docs/sdlc/`).

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
