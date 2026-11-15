# Spec: Datos de prueba para que los administradores conozcan la app

- **Intent:** [intent.md](intent.md)
- **Estado:** aprobado (2026-11-15)
- **Fecha:** 2026-11-15

## 1. Qué se construye

- **Workflow manual `datos-de-prueba`** en GitHub Actions, con dos entradas:
  - `accion`: `cargar` o `borrar`;
  - `entorno`: `pruebas` o `produccion`.
- **`scripts/datos-de-prueba/`:** el conjunto de datos (TypeScript) y los programas de carga y de borrado.
- La app no cambia, y no hay migraciones.

La carga usa las mismas reglas que la app:
- las cestas se proponen con R1 (`proponerCesta`);
- los colaboradores se eligen con R2 (`seleccionar`);
- el reparto se hace con R3 (`repartir`);
- y se guarda con las mismas funciones SQL que usa la app (`guardar_cesta`, `proponer_reparto`, `cerrar_semana`).

Así, lo que vean los administradores es lo que la app produciría de verdad.

## 2. Los datos

Todas las fechas son relativas al día de la carga (D), en hora de Madrid.

### Catálogo
- Los productos de la "cesta tipo" del Excel de los administradores, unos 40, más tres especiales que se añaden a mano: leche sin lactosa, pañales y leche de continuación.
- Cada uno con su unidad y un **precio aproximado de marca blanca**: el Excel no tiene precios.
- **Etiquetas:** las de la migración inicial (cerdo, gluten, lactosa, frutos secos, huevo). Por ejemplo, el fuet y el jamón York llevan "cerdo"; la leche, los yogures y el queso, "lactosa"; el pan, la pasta, las galletas y la harina, "gluten".
- Los productos de limpieza y de aseo van en el catálogo como un alimento más: así es como los usan hoy.

### Lista base "Cesta tipo (aproximada)", predeterminada
- El Excel da cantidades por tramos. Para la comparación, cada tramo se toma como estas composiciones:

  | Tramo del Excel | Adultos + niños |
  |---|---|
  | 1-2 personas | 1+0 y 2+0 |
  | 1 adulto + 1 niño | 1+1 |
  | 3-4 personas | 2+1 y 2+2 |
  | 5 personas | 2+3 |
  | Más de 5 | 2+4 y 3+3 |

- Para cada producto se elige la pareja (por adulto, por niño), en múltiplos de 0,25 entre 0 y 3, que con la fórmula de R1 (`ceil`) más se acerca a las cantidades del Excel en esas composiciones.
- El PR incluye la tabla del Excel frente a la app, para que los administradores vean dónde difiere.

### Colaboradores: 45 personas inventadas
- Nombre y apellido inventados.
- Correo: `<usuario>+demoNN@<dominio>`, a partir del secreto `DEMO_CORREO_BASE`, que es la Gmail de la cesta.
- Estados:
  - 42 activos;
  - 2 en pausa, uno hasta D+30 y otro sin fecha;
  - 1 de baja.
- Consentimiento marcado.

### Familias: 8 identificadores genéricos
- Identificadores del tipo «Parroquia 01» o «Arciprestazgo 02». Se repiten de una semana a otra, como en la realidad.
- De 1 a 6 miembros.
- Dos con "sin cerdo", una con "sin lactosa" (lleva leche sin lactosa añadida a mano) y una con bebé (lleva pañales y leche de continuación añadidos a mano).

### Semanas (precio base 20 €)

| Semana | Entrega | Estado | Contenido |
|---|---|---|---|
| 1 | D−35 | cerrada | 3 cestas. Reparto con confirmados y entregados, uno que no pudo (con sustituto) y uno sin respuesta |
| 2 | D−21 | cerrada | 3 cestas, todo entregado |
| 3 | D−7 | cerrada | 4 cestas, un colaborador confirmado sin marcar como entregado |
| 4 | D+5 | enviada | 3 cestas. Plazo D+2 a las 20:00. La mitad confirmados, el resto esperando, y uno que no puede con su sustituto esperando respuesta |
| 5 | D+12 | en preparación | 3 cestas, sin reparto: para que los administradores preparen el reparto y prueben a enviar |

- **Las semanas pasadas** se construyen como lo haría la app y luego se fijan sus respuestas y entregas. Así el histórico y la rotación (R2) quedan coherentes.
- **Semana 4:**
  - Sus asignaciones constan como enviadas, pero no se manda ningún correo al cargar.
  - Cuando venza el plazo, la tarea diaria hará lo de siempre: pasar a "sin respuesta" a quien no conteste y escribir a los sustitutos. Esos correos llegan a la Gmail de la cesta.

## 3. Reglas

- **RD1. La carga solo se hace en una base vacía.** Si alguna tabla de la app tiene filas (salvo las etiquetas de exclusión), no hace nada y lo dice.
- **RD2. La carga es todo o nada:** va en una sola transacción.
- **RD3. El borrado** deja vacías todas las tablas de la app salvo las etiquetas de exclusión, y no toca las cuentas de administrador. No hace nada si hay algún colaborador cuyo correo no es un alias de prueba: ya habría datos reales.
- **RD4. El registro del workflow** solo muestra recuentos ("45 colaboradores, 16 cestas…"), nunca nombres ni correos.
- **RD5. Secretos:**
  - El workflow toma `DEMO_CORREO_BASE` y la cadena de conexión del entorno elegido (`SUPABASE_PROD_DB_URL` o `SUPABASE_STAGING_DB_URL`) por `env:`.
  - La Gmail de la cesta no se escribe en el repositorio.

## 4. Criterios de aceptación

- **CA-0201:** En una base vacía, la carga crea:
  - el catálogo, con al menos 3 alimentos con la etiqueta "cerdo" y 3 con "lactosa";
  - una lista base predeterminada;
  - 45 colaboradores (42 activos, 2 en pausa, 1 de baja);
  - las 5 semanas de la tabla, con sus estados.
- **CA-0202:**
  - Ninguna cesta contiene un alimento que choque con sus exclusiones.
  - En cada semana con reparto, cada unidad está asignada exactamente una vez.
  - La diferencia entre el gasto mayor y el menor no supera el precio de la pieza más cara (como CA-11 y CA-12).
- **CA-0203:** Todos los correos de colaboradores son alias `+demoNN` de `DEMO_CORREO_BASE`.
- **CA-0204:** Si la base tiene datos, la carga termina con error y no cambia nada.
- **CA-0205:**
  - El borrado deja vacías las tablas de la app salvo `etiquetas_exclusion`.
  - Con un colaborador que no es de prueba, el borrado termina con error y no cambia nada.
- **CA-0206:** Después de cargar, `scripts/comprobar-rls.sql` sigue pasando.
- **CA-0207:** Después de cargar, el histórico muestra 3 semanas cerradas, e Inicio muestra la semana 4 como semana en curso.

## 5. Fuera de alcance

- Trabajar por grupos, por lotes fijos o por tramos de familia: depende de lo que digan los administradores tras probar la app (intent, preguntas abiertas).
- Crear las cuentas de los administradores: las crea el responsable (paso 7 de la puesta en marcha).
