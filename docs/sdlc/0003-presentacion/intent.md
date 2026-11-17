# Intent: Una presentación más clara antes de enseñar la app

- **Autor:** responsable de la cesta solidaria
- **Estado:** aprobado (2026-11-17), con las propuestas de las cuatro preguntas
- **Fecha:** 2026-11-17

## Problema

En palabras del responsable:

> Creo que la versión 1 ha quedado genial. Solo le daría una vuelta a la presentación antes de dársela al usuario para que me la valide. Me da la sensación de que es todo un poco del mismo color y cuesta distinguir las partes de las ventanas y se me hace poco usable.

Revisión de la v1.1.0 en producción (17/11/2026):

- **Todo es blanco sobre casi blanco.** El fondo (`stone-50`) y las tarjetas (blancas) apenas se distinguen. Los bordes (`stone-200`) casi no se ven.
- **El menú no dice dónde estás.** Son enlaces de texto sin sección activa. En el móvil ocupa tres líneas y «Salir» queda solo en otra.
- **Los títulos de sección parecen texto normal.** En el detalle de semana, «1. Datos», «2. Cestas»… no se leen como pasos, ni se ve cuál toca.
- **Las listas largas son filas iguales.** En «Envío y respuestas» hay 19 filas con el mismo aspecto, y lo que lleva cada uno va en un párrafo corrido («1 × Cacao soluble, 1 × Cereales…»).
- **El reparto no tiene cabeceras visibles.** Cada colaborador es una lista larga, y no se ve de un vistazo cuánto gasta respecto al precio base.
- **Las tablas no tienen encabezados.** En Alimentos, las columnas de precio y «Contiene» flotan sin nombre.
- **Etiquetas de estado y ayudas pequeñas y pálidas** (12 px, gris claro).
- En el escritorio, el contenido usa la mitad de la pantalla.

## Resultado propuesto

La app hace lo mismo que ahora, pero se lee mejor:

- **Cabecera en verde oscuro** con la sección actual resaltada. En el móvil, una sola fila de secciones que se desliza.
- **Fondo más oscuro y tarjetas con borde y sombra**, para que cada parte se vea separada.
- **Cada tarjeta con una franja de cabecera** donde va su título y, si lo hay, su total o su botón.
- **Detalle de semana con una barra de pasos** (Datos, Cestas, Reparto, Envío), con los pasos hechos marcados y el actual resaltado. Los pasos ya hechos se muestran en resumen, uno junto a otro.
- **Estados con color y forma propios**, con un punto y texto más grande: confirmada (verde), esperando (ámbar), no puede o sin respuesta (rosa), enviada (azul), en preparación (ámbar), cerrada (gris).
- **Seguimiento agrupado por estado**: primero «Esperando respuesta», después «Confirmadas» y al final «No pueden». Cada grupo tiene su cabecera de color y su número, y los alimentos van en etiquetas sueltas.
- **Reparto en tarjetas** de dos columnas, con el total y una barra de gasto respecto al precio base.
- **Tablas con encabezados** y filas alternas.
- **Inicio** con números grandes, una barra de progreso de respuestas y avisos con icono.

Propuesta visual (antes y después): https://claude.ai/artifact/UhA6RRU4qQYNMidfqw6U7f

## Usuarios y sistemas afectados

- Los administradores: todas las pantallas de gestión.
- Las páginas públicas de los enlaces del correo (`/r` y `/baja`) y el acceso: solo heredan los colores, si se aprueba (pregunta 3).
- Solo cambian los estilos y la disposición de las pantallas. No cambian la base de datos, las reglas R1–R5, los correos ni la tarea diaria.

## Restricciones

- **Sin cambios de comportamiento.** Mismos textos, botones y pasos. Las pruebas existentes deben seguir pasando; si alguna busca un texto que cambia, se ajusta la prueba, no la regla.
- **CA-28 sigue en pie:** ninguna pantalla con desplazamiento horizontal a 375 px. La fila de secciones del móvil se desliza dentro de la cabecera, no la página.
- **Accesibilidad:** contraste de texto de al menos 4,5:1. Los estados no se distinguen solo por el color, también por el texto y el icono. Botones y enlaces de al menos 44 px de alto en el móvil.
- **Sencillez:** estilos de Tailwind en `app/(admin)/_ui/estilos.ts` y piezas comunes (tarjeta, etiqueta de estado, cabecera) en `app/(admin)/_ui/`. Sin librerías nuevas ni tipografías externas.
- Mientras estén los datos de prueba en producción, las capturas para enseñar a los administradores pueden salir de ahí.

## Preguntas abiertas

Respondidas por el responsable el 2026-11-17: se aceptan las cuatro propuestas, y el verde oscuro vale como color de marca.

1. **Confirmadas plegadas:** en una semana con muchas confirmaciones, ¿se muestran todas o las 3 primeras con «Ver las N restantes»? Plegarlas es un pequeño cambio de comportamiento. Propuesta: mostrarlas todas, agrupadas.
2. **Pasos hechos en resumen:** con la semana en preparación, el paso 1 tiene un formulario. Propuesta: el resumen compacto solo cuando la semana ya está enviada o cerrada; en preparación, los pasos uno debajo de otro, como hoy, pero con la nueva cabecera.
3. **Páginas públicas y acceso:** ¿se les aplican los mismos colores (cabecera verde)? Propuesta: sí, para que el colaborador reconozca la cesta.
4. **Color de marca:** ¿vale el verde oscuro de la cabecera o la parroquia tiene unos colores propios?
