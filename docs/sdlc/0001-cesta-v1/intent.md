# Intent: Gestión de la cesta solidaria parroquial

- **Autor:** [nombre del responsable] — administración de la cesta solidaria
- **Estado:** aprobado (2026-11-14), con las correcciones del responsable
- **Fecha:** 2026-11-14

## Problema

En palabras del solicitante:

> Hay un administrador que acuerda con el arciprestazgo y con Cáritas el número de cestas que toca en la semana que se va a trabajar. Le dicen un nombre para identificar a quien va a recoger la cesta y las características de la familia, el número de adultos, de niños, si hay intolerancias, la religión por si son musulmanes no meter cerdo, etc. El administrador en función de estos datos diseña una cesta con una serie de alimentos que vienen a cubrir aproximadamente un mes del consumo limitado de la familia utilizando una lista de alimentos base que tiene. Luego toma la lista de colaboradores y va asignando alimentos a cada colaborador hasta que se llenan las cestas. No es necesario que les toque todas las semanas a todos los colaboradores. Se establece un precio base aproximado para cada colaborador y se van asignando alimentos de manera que todos los colaboradores que participen en esa semana hagan un gasto similar, aunque no es posible que sea igual. Los colaboradores que no han participado esa semana participarán en las semanas posteriores. Posteriormente el administrador envía un correo a los colaboradores asignados para que confirmen si van a poder llevar los alimentos ese fin de semana y si alguno no confirma se corre la lista para avisar al siguiente.

Hoy todo este proceso es manual: diseñar cada cesta, repartir los alimentos para que el gasto quede equilibrado, llevar la rotación de colaboradores, enviar los correos y seguir las confirmaciones.

## Resultado propuesto

### Fase 1 — Herramienta del administrador

1. **Colaboradores:** añadirlos y darlos de baja, y ponerlos en pausa (vacaciones, etc.). Guardar nombre y correo.
2. **Catálogo de alimentos:** añadir y quitar alimentos. Cada uno lleva un precio aproximado y unas etiquetas de exclusión (contiene cerdo, gluten, lactosa…).
3. **Listas base por tipo de familia:** plantillas de cesta que se ajustan según el número de adultos y de niños.
4. **Cestas de la semana:** dar de alta cada cesta con el identificador del receptor, el número de adultos y de niños y las exclusiones alimentarias.
5. **Propuesta automática de cesta:** a partir de la lista base, la composición familiar y las exclusiones. El administrador puede editarla.
6. **Reparto automático entre colaboradores:**
   - Tienen prioridad los colaboradores activos que llevan más tiempo sin participar.
   - El gasto de cada uno se equilibra alrededor del precio base semanal, una cantidad fija que fija el administrador.
   - El administrador puede editar el reparto.
7. **Confirmaciones desde el propio correo:**
   - Cada colaborador asignado recibe un correo y confirma o rechaza desde él.
   - Si alguien rechaza o no responde a tiempo, sus alimentos pasan automáticamente al siguiente de la lista.
8. **Histórico:** qué semanas hubo, qué cestas, quién llevó qué.
9. **Uso desde PC**, con un diseño que también funcione en el móvil.

### Fase 2 — Perfil de colaborador (si no complica la fase 1)

- Consultar si le toca esa semana y qué tiene que llevar.
- Confirmar o rechazar desde la propia app, además de por correo.
- Ver el histórico de sus colaboraciones.

## Usuarios y sistemas afectados

- **Administrador:** es el usuario principal de la fase 1.
- **Colaboradores:** en la fase 1 reciben correos y responden desde ellos. En la fase 2 tienen acceso propio.
- **Arciprestazgo y Cáritas:** facilitan los datos de las cestas. No usan la app.
- **Familias receptoras:** no usan la app. Solo constan con un identificador.
- **Sistemas:**
  - GitHub para el código y los artefactos.
  - Vercel para alojar la app.
  - Supabase para la base de datos y el acceso del administrador.
  - Un servicio de correo para los envíos.

## Restricciones

- **Mínimos datos personales (RGPD):**
  - Del receptor solo se guarda un nombre o identificador.
  - Las necesidades de la familia se guardan como exclusiones alimentarias ("sin cerdo", "sin gluten"), nunca como religión ni como diagnóstico. Religión y salud son categorías especiales de datos (art. 9 RGPD).
  - Los nombres y correos de los colaboradores también son datos personales. Hay que informarles, contar con su consentimiento y poder borrarlos si lo piden.
- **Dispositivos:** se usará principalmente desde un PC, pero debe poder usarse en el móvil.
- **Coste:** preferiblemente cero. Se usarán las cuentas gratuitas de GitHub, Vercel y Supabase. Cualquier servicio adicional se valora caso a caso.
- **Despliegues:** los hace Claude. El responsable no tiene que desplegar nada a mano.
- **Mantenimiento:**
  - Se hará con esta misma metodología (intent → spec → plan → código).
  - El código y los documentos se guardan en git y se trabaja por versiones.
  - Cada cambio futuro entra con su propio intent.md.
- **Tecnología:** la elige Claude, priorizando que sea sencilla de mantener por una sola persona.

## Criterios de éxito

- Preparar una semana completa (cestas, reparto y correos) lleva bastante menos tiempo que ahora.
- Ninguna cesta incluye un alimento que choque con sus exclusiones.
- En una misma semana, el gasto de los colaboradores es similar y está cerca del precio base.
- La rotación es justa: nadie repite mientras haya colaboradores activos que llevan más tiempo sin participar.

## Decisiones tomadas sobre las preguntas abiertas

| # | Pregunta | Decisión |
|---|---|---|
| 1 | Precio base | Cantidad fija por colaborador y semana, la establece el administrador |
| 3 | Confirmación | Desde el propio correo |
| 4 | Envío de correos | Automático desde la app (detalle en spec.md) |
| 8 | Alojamiento y coste | Gratis: GitHub + Vercel + Supabase |
| 9 | Tecnología | La decide Claude (ver spec.md) |

## Preguntas abiertas que pasan a la fase de diseño

Estas preguntas tienen una propuesta por defecto en `spec.md`, pendiente de validar:

- 2: Colaboradores por cesta.
- 5: Listas base.
- 6: Marcar entregas.
- 7: Número de administradores.
- 10: Conservación de datos.
- 11: Entrada de datos.
