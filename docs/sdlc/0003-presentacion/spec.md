# Spec: Una presentación más clara

- **Intent:** [intent.md](intent.md) (aprobado el 2026-11-17, con las propuestas de sus cuatro preguntas)
- **Propuesta visual:** https://claude.ai/artifact/UhA6RRU4qQYNMidfqw6U7f
- **Estado:** aprobado (2026-11-17)
- **Fecha:** 2026-11-17

## 1. Qué se construye

Un cambio de estilos y de disposición en todas las pantallas. La app hace lo mismo que en la v1.1.0:
- sin migraciones;
- sin cambios en las reglas R1–R5, en los correos ni en la tarea diaria;
- mismos textos de botones, avisos y mensajes, para que las pruebas y la guía de uso sigan valiendo.

Decisiones del responsable sobre las preguntas del intent (2026-11-17):
1. En el seguimiento se muestran **todas** las respuestas, agrupadas. No se pliega ninguna.
2. Los pasos ya hechos se muestran **en resumen solo con la semana enviada o cerrada**. En preparación, los cuatro pasos van uno debajo de otro, como hoy, con la nueva cabecera.
3. El acceso y las páginas públicas (`/r` y `/baja`) llevan la misma **cabecera verde**.
4. El color de marca es el **verde oscuro** de la propuesta.

## 2. Aspecto común

### Colores

| Uso | Color |
|---|---|
| Fondo de página | `#eceae5`, nuevo token `fondo` en `globals.css` |
| Cabecera | `emerald-900`. Texto blanco y enlaces `emerald-100` |
| Sección actual del menú | Fondo blanco y texto `emerald-900` |
| Tarjetas | Blancas, borde `stone-300` y sombra suave |
| Franja de cabecera de una tarjeta | `stone-100`, con borde inferior `stone-300` |
| Botón principal | `emerald-700` (igual que hoy) |
| Botón secundario | Blanco, con borde `stone-400` (hoy `stone-300`, casi no se veía) |
| Texto secundario y ayudas | `stone-600` como mínimo. Se deja de usar `stone-500` sobre blanco |

### Etiquetas de estado

Pastilla con un punto de color y texto de 13 px en negrita media. Hoy son de 12 px.

| Estado | Tono |
|---|---|
| Confirmada, activo | verde (`emerald-100` / `emerald-900`) |
| Esperando respuesta, en preparación, en pausa | ámbar (`amber-100` / `amber-900`) |
| No puede, sin respuesta | rosa (`rose-100` / `rose-900`). Hoy son grises |
| Enviada | azul (`sky-100` / `sky-900`) |
| Propuesta, cerrada, de baja, desactivado | gris (`stone-200` / `stone-800`) |

El estado siempre se escribe: el color nunca va solo.

### Piezas comunes en `app/(admin)/_ui/`

- **`Tarjeta`:** una `section` con franja de cabecera (título y, opcionalmente, algo a la derecha: un total o un botón) y su contenido.
- **`Etiqueta`:** la pastilla de estado, con su tono. La usan `EstadoSemanaEtiqueta`, `EtiquetaEstado` (colaboradores) y el seguimiento.
- **`BarraProporcion`:** una barra de tramos de color con una etiqueta de texto (`role="img"` y `aria-label`). Se usa para las respuestas y para el gasto.
- **`Menu`:** componente de cliente con `usePathname`. Marca la sección actual con `aria-current="page"`, también en las subpáginas: `/semanas/…/reparto` marca «Semanas».

### Cabecera

- **Escritorio:** nombre de la app con un icono de cesta (SVG en línea), las secciones y «Salir». El correo del administrador solo se ve desde 1280 px: por debajo no cabe en la misma fila.
- **Móvil (menos de 640 px):** dos filas.
  - Arriba, el nombre y «Salir». El correo no se muestra, como hoy.
  - Debajo, las secciones en una sola fila que se desliza en horizontal dentro de la cabecera, sin que se deslice la página.
- **Acceso y páginas públicas:** la misma franja verde con el nombre, sin secciones.

### Anchura

La cabecera y el contenido usan el mismo ancho máximo (`max-w-6xl`). Las fichas y los formularios mantienen su ancho de hoy (`max-w-xl` o `max-w-3xl`).

## 3. Pantallas

- **Inicio:**
  - La semana en curso es una tarjeta con la fecha, el estado y el plazo en la franja de cabecera.
  - Los recuentos son cifras grandes con icono. «No pueden» pasa de gris a rosa.
  - Debajo, una `BarraProporcion` de confirmadas, esperando y no pueden.
  - Los avisos llevan un icono según su tipo (error, atención o información).
  - «Correo» va en una columna lateral en el escritorio y debajo en el móvil.
- **Detalle de semana:**
  - **Barra de pasos** debajo del título: una lista ordenada con Datos, Cestas, Reparto y Envío y respuestas. Cada paso lleva un resumen corto y enlaza a su sección.
    - Los hechos llevan una marca.
    - El actual se resalta con `aria-current="step"`.
    - Cuál está hecho y cuál es el actual lo decide la regla P1.
  - **Enviada o cerrada:** Datos, Cestas y Reparto en una fila de tres tarjetas en resumen. Debajo, Envío y respuestas a todo el ancho.
  - **En preparación:** las cuatro tarjetas una debajo de otra, como hoy.
  - «Eliminar» va en una tarjeta con franja roja suave, separada del resto.
- **Envío y respuestas:**
  - La franja de cabecera lleva el recuento y la barra de respuestas.
  - Las respuestas se agrupan según la regla P2. Cada grupo tiene una cabecera de color con su nombre y su número.
  - Lo que lleva cada colaborador va en una lista de pastillas («2 × Arroz»), no en un párrafo.
  - El total va a la derecha del nombre.
  - El estado, la sustitución, el plazo, la casilla de entregado y «Buscar sustituto» siguen como hoy.
- **Reparto:**
  - Los cuatro datos de arriba (coste, precio base, hacen falta, disponibles) van en cuatro recuadros con cifras grandes.
  - Las tarjetas de colaborador van en dos columnas a partir de 1024 px y en una por debajo.
  - Cada tarjeta lleva su franja de cabecera con el nombre, el gasto y una `BarraProporcion` de gasto sobre el precio base. La barra se pone ámbar si lo supera, y sigue el texto de hoy «supera el precio base».
  - Mover alimentos y cambiar de colaborador siguen igual.
- **Listas de Colaboradores, Alimentos, Listas base, Semanas e Histórico:**
  - Tarjeta con filas alternas, y la fila entera como enlace, como hoy.
  - Colaboradores y Alimentos, que tienen columnas, llevan además una franja con sus nombres, visible desde 640 px (por ejemplo, «Alimento · Precio aprox. · Contiene»). Las otras tres no tienen columnas que nombrar.
  - En el móvil, cada fila se apila como ahora.
- **Fichas y formularios:** la nueva `Tarjeta`, campos con borde `stone-400` y ayudas en `stone-600`.
- **Acceso, respuesta (`/r`) y baja (`/baja`):** la franja verde arriba y la tarjeta blanca sobre el nuevo fondo.

## 4. Reglas

- **P1. Pasos de la semana.**
  - Datos siempre está hecho.
  - Cestas está hecho si hay al menos una cesta.
  - Reparto está hecho si hay alguna asignación propuesta, pendiente o confirmada.
  - Envío está hecho si la semana está cerrada.
  - El paso actual es el primero que no está hecho, salvo que la semana esté enviada: entonces es Envío. Con la semana cerrada, ninguno es el actual.
  - Va en una función pura de `lib/dominio/semanas.ts`.
- **P2. Grupos del seguimiento**, en este orden, y sin mostrar los vacíos:
  1. Esperando respuesta (`pendiente`).
  2. Confirmadas.
  3. No pueden o no respondieron (`rechazada` y `sin_respuesta`).

  Dentro de cada grupo, el orden de hoy. Si quedara alguna asignación propuesta sin enviar (no debería, con la semana enviada), va en un grupo «Sin enviar» al principio, para que no desaparezca. Va en una función pura de `lib/dominio/inicio.ts`, junto a `recuento`.
  - Los títulos de los grupos («Esperan respuesta», «Confirmadas», «No pueden o no respondieron») no repiten el texto de las etiquetas de estado, para no confundirse con ellas.
- **P3. Sin cambios de comportamiento.**
  - Se mantienen todos los textos, nombres accesibles y roles que usan las pruebas actuales. Por ejemplo, la lista «Respuestas» con un elemento por colaborador, o la lista «Colaboradores del reparto».
  - Si hace falta anidar listas, la lista exterior conserva su nombre.

## 5. Criterios de aceptación

- **CA-0301:** En cada sección (Inicio, Semanas, Histórico, Colaboradores, Alimentos y Listas base) y en sus subpáginas, el enlace de esa sección en el menú tiene `aria-current="page"`, y ningún otro lo tiene.
- **CA-0302:** La barra de pasos marca como hechos y como actual los pasos que dice P1:
  - semana sin cestas: actual Cestas;
  - con cestas y sin reparto: actual Reparto;
  - con reparto en preparación: actual Envío;
  - enviada: actual Envío, con 1–3 hechos;
  - cerrada: los cuatro hechos.
- **CA-0303:** El seguimiento muestra los grupos de P2 en su orden, con su número, y omite los vacíos. Cada colaborador sigue siendo un elemento de la lista «Respuestas».
- **CA-0304:** Sin fallos de contraste (regla `color-contrast` de axe-core) en estas pantallas, con datos:
  - Inicio, Semanas, detalle de semana en preparación y enviada, Reparto, Colaboradores, Alimentos, Listas base e Histórico;
  - acceso, respuesta y baja.
- **CA-0305:** A 375 px de ancho, la cabecera mide como mucho 130 px de alto. Las seis secciones del menú se alcanzan deslizando su fila y la página no tiene desplazamiento horizontal. CA-28 se amplía a Inicio, Alimentos, Listas base y la semana enviada.
- **CA-0306:** En el reparto, cada tarjeta tiene una barra de gasto con el texto «X € de Y €». La que supera el precio base sigue mostrando «supera el precio base».
- **CA-0307:** Todas las pruebas de la v1.1.0 (CA-01 a CA-34, CA-0201 a CA-0207) siguen pasando. Solo cambian si la prueba dependía de una clase de estilo o de la posición en la página; nunca porque cambie un texto o una regla.

## 6. Fuera de alcance

- Cambios en las plantillas de correo.
- Modo oscuro.
- Plegar o filtrar respuestas: decisión 1.
- Funciones nuevas de cualquier tipo.

## 7. Pruebas nuevas

- **Unitarias:** P1 y P2.
- **E2E:** CA-0301, CA-0302, CA-0303, CA-0305 y CA-0306.
- **CA-0304:** con `@axe-core/playwright`, nueva dependencia de desarrollo. La app no lleva dependencias nuevas.

## 8. Ajustes durante la implementación (2026-11-17)

- **Anchura:** `max-w-6xl` en lugar de `max-w-5xl`, y el correo del administrador solo desde 1280 px. Con `max-w-5xl`, el correo y «Salir» bajaban a una segunda fila en el escritorio.
- **Encabezados de columna** solo en Colaboradores y Alimentos (§3).
- **P2:** grupo «Sin enviar» por si quedara alguna propuesta, y títulos de grupo distintos de las etiquetas (§4).
- **Aviso de exceso en el reparto:** ahora es una línea propia, «Su gasto supera el precio base (20,00 €)», debajo de la barra. Conserva el texto que buscan las pruebas.
