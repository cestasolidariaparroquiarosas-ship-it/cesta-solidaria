# Intent: Datos de prueba para que los administradores conozcan la app

- **Autor:** responsable de la cesta solidaria
- **Estado:** aprobado (2026-11-15)
- **Fecha:** 2026-11-15

## Problema

En palabras del responsable:

> No quiero que subamos aún datos reales, pero me gustaría que pobláramos la bbdd con datos de prueba para que los administradores actuales realmente se puedan hacer una idea de cómo se va a ver esto.

Hoy producción está vacía. Los administradores que hoy llevan la cesta con un Excel no pueden hacerse una idea de la app sin catálogo, colaboradores ni semanas.

## Resultado propuesto

- Los administradores entran en la app de producción y ven una cesta "viva", con datos inventados pero parecidos a los suyos:
  - un catálogo con los productos de su cesta tipo;
  - unos 45 colaboradores;
  - semanas pasadas en el histórico;
  - una semana enviada esperando respuestas;
  - una semana en preparación para probar el reparto y el envío ellos mismos.
- Si prueban a enviar correos, llegan a la bandeja de la cesta y se pueden contestar.
- Antes de cargar los datos reales, todo lo de prueba se borra con una orden.

## Usuarios y sistemas afectados

- Los administradores actuales, que probarán la app.
- La base de datos de producción. Pruebas solo para ensayar la carga.
- El correo de la cesta, que recibirá los correos de prueba.
- La tarea diaria, que tratará la semana de prueba como cualquier otra.
- La app no cambia.

## Restricciones

- **Ningún dato real.**
  - Nombres de colaboradores inventados.
  - Familias con identificadores genéricos.
  - Del Excel de los administradores solo se toma la estructura (productos, cantidades por tramo, tamaños de familia). El Excel no entra en el repositorio.
- **Correos.** Los correos de prueba son alias de la Gmail de la cesta (`usuario+demoNN@…`). La dirección no se escribe en el repositorio, que es público: se guarda en un secreto de GitHub.
- **No mezclar datos de prueba y reales.**
  - La carga se niega si la base ya tiene datos.
  - El borrado se niega si hay algún colaborador que no sea de prueba.

## Preguntas abiertas

Respondidas por el responsable el 2026-11-15:
- Dónde: producción.
- Correos: alias de la Gmail de la cesta.
- Colaboradores: personas sueltas. En el Excel van por grupos; queda como tema para después.
- Cesta tipo: se aproxima por adulto y por niño. En el Excel va por tramos; los administradores dirán si les vale.

Pendientes, para después de que los administradores la prueben:
- ¿Hace falta cambiar la app para trabajar por grupos, lotes fijos o tramos?
