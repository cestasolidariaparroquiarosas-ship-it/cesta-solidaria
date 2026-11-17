# Plan: Una presentación más clara

- **Spec:** [spec.md](spec.md)
- **Estado:** aprobado (2026-11-17)
- **Fecha:** 2026-11-17
- **Versión resultante:** 1.2.0, en un solo PR. Un despliegue a medias dejaría pantallas con dos estilos mientras los administradores prueban la app.

## 1. Archivos

```
app/globals.css                           # Token `fondo` y fondo de página
app/(admin)/_ui/estilos.ts                # Botones, entradas y ayudas con los colores nuevos
app/(admin)/_ui/tarjeta.tsx               # Tarjeta con franja de cabecera (nuevo)
app/(admin)/_ui/etiqueta.tsx              # Pastilla de estado con tono y punto (nuevo)
app/(admin)/_ui/barra.tsx                 # BarraProporcion (nuevo)
app/(admin)/_ui/menu.tsx                  # Menú de cliente con aria-current (nuevo)
app/(admin)/_ui/campos.tsx, aviso.tsx     # Colores de ayudas, errores y avisos
app/(admin)/layout.tsx                    # Cabecera verde de dos filas en el móvil
app/(admin)/page.tsx                      # Inicio
app/(admin)/semanas/[id]/page.tsx         # Barra de pasos y disposición según el estado
app/(admin)/semanas/[id]/pasos.tsx        # Barra de pasos (nuevo)
app/(admin)/semanas/[id]/_envio/seguimiento.tsx   # Grupos y pastillas de alimentos
app/(admin)/semanas/[id]/reparto/page.tsx         # Recuadros, dos columnas y barra de gasto
app/(admin)/semanas/estado-semana.tsx, colaboradores/etiqueta-estado.tsx  # Usan Etiqueta
app/(admin)/{semanas,historico,colaboradores,alimentos,listas}/page.tsx   # Listas con cabecera de columnas
app/(admin)/**/[id]/page.tsx, nuevo/page.tsx, cestas/**   # Tarjeta en fichas y formularios
app/login/page.tsx, app/(publico)/layout.tsx              # Franja verde
lib/dominio/semanas.ts                    # pasosSemana (P1)
lib/dominio/inicio.ts                     # gruposSeguimiento (P2)
tests/unit/presentacion.test.ts           # P1 y P2
tests/e2e/presentacion.spec.ts            # CA-0301 a CA-0306
tests/e2e/capturas.spec.ts                # Capturas de las pantallas principales a 1280 y 375 px
tests/e2e/*.spec.ts                       # Ajustes de CA-0307 si alguna prueba dependía del aspecto
package.json, CHANGELOG.md                # 1.2.0 y @axe-core/playwright (desarrollo)
docs/sdlc/0003-presentacion/{intent,spec,plan}.md
docs/sdlc/0001-cesta-v1/trazabilidad.md   # CA-0301 a CA-0307
```

## 2. Orden de trabajo

1. **Base:** el token de fondo, `estilos.ts`, las piezas nuevas de `_ui/` y la cabecera con el menú. Con eso, todas las pantallas cambian de fondo, de cabecera y de botones.
2. **P1 y P2** en `lib/dominio/`, con sus pruebas unitarias.
3. **Pantallas de trabajo:** Inicio, detalle de semana (pasos, seguimiento) y Reparto.
4. **Resto:** listas, fichas, formularios, acceso y páginas públicas.
5. **Pruebas e2e:** las nuevas, más los ajustes de CA-0307.
6. **Capturas:** `capturas.spec.ts` toma imágenes de las pantallas principales en CI, con los datos de prueba (iteración 0002) recién cargados. Van en el artefacto `capturas` del PR y, en base64, en el registro de CI, de donde Claude las recupera para revisarlas contra la propuesta antes de fusionar. Es la única forma de verlas antes del despliegue, porque en la sesión de Claude no arranca Supabase local (ver spec §8).
7. Versión 1.2.0, CHANGELOG y trazabilidad. Revisión independiente con las capturas, CI, fusión y despliegue.
8. **Después del despliegue:** Claude revisa producción (con los datos de prueba) en el navegador, a 1280 y a 375 px, y te pasa unas capturas para enseñarlas a los administradores.

## 3. Pruebas

| CA | Prueba |
|---|---|
| CA-0301 | E2E: abre cada sección y una subpágina de cada una, y comprueba el enlace con `aria-current="page"` |
| CA-0302 | Unitaria: P1 con los cinco casos. E2E: la barra de pasos en una semana sin cestas, en una con reparto y en una enviada |
| CA-0303 | Unitaria: P2 (orden, recuentos, grupos vacíos). E2E: en una semana enviada con una respuesta de cada tipo, los grupos en orden y cada colaborador como elemento de «Respuestas» |
| CA-0304 | E2E con `@axe-core/playwright`, solo la regla `color-contrast`, en las pantallas del CA |
| CA-0305 | E2E a 375 px: alto de la cabecera, la última sección alcanzable y sin desplazamiento horizontal. Se amplían las pruebas de CA-28 |
| CA-0306 | E2E: barra de gasto en el reparto; con un alimento movido para pasarse del precio base, el aviso sigue |
| CA-0307 | CI completo, sin quitar ninguna prueba |

## 4. Riesgos

| Riesgo | Tratamiento |
|---|---|
| No se pueden ver las pantallas antes de fusionar | Capturas de CI (paso 6). Si algo queda mal tras el despliegue, un PR de corrección (1.2.1) |
| Alguna prueba e2e depende del orden de la lista de respuestas | P3: se mantienen los nombres. Si una prueba buscaba por posición, se cambia a búsqueda por nombre |
| El menú deslizable del móvil esconde secciones | La sección actual se desplaza a la vista al cargar (`scrollIntoView` en el menú). CA-0305 comprueba que se alcanzan todas |
| Contraste del ámbar y del rosa | CA-0304 con axe-core; los tonos `-900` sobre `-100` superan 4,5:1 |
| La guía de uso describe la pantalla de semana | La guía no habla de colores ni de posiciones (revisado). Se añade una línea sobre la barra de pasos |

## 5. Qué necesita Claude

- Que el responsable apruebe el spec y el plan.
