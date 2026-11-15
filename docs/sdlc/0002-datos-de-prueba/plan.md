# Plan: Datos de prueba

- **Spec:** [spec.md](spec.md)
- **Estado:** aprobado (2026-11-15)
- **Fecha:** 2026-11-15
- **Versión resultante:** 1.1.0 (un solo PR)

## 1. Archivos

```
scripts/datos-de-prueba/
├── datos.ts        # Catálogo, lista base, colaboradores inventados, familias y semanas (puro)
├── ajuste.ts       # Elige (por adulto, por niño) que mejor reproduce los tramos del Excel (puro)
├── cargar.ts       # Comprueba RD1 y carga todo en una transacción con las reglas R1–R3
├── borrar.ts       # Comprueba RD3 y borra
└── ejecutar.ts     # Programa que lanza el workflow: conexión con pg y solo recuentos en el registro
.github/workflows/datos-de-prueba.yml   # Manual: accion (cargar|borrar) × entorno (pruebas|produccion)
tests/unit/datos-de-prueba.test.ts      # ajuste.ts y coherencia de datos.ts
tests/datos-de-prueba/carga.test.ts     # CA-0201 a CA-0207 contra el Supabase local de CI. Proyecto
                                        # de Vitest aparte: necesita la base sin el seed, y CI lo
                                        # ejecuta al final con `supabase db reset --no-seed`
docs/sdlc/0002-datos-de-prueba/cesta-tipo.md  # Excel frente a la app, producto a producto
docs/sdlc/0002-datos-de-prueba/{intent,spec,plan}.md
docs/operacion.md        # Sección "Datos de prueba": cómo cargarlos y borrarlos
```

- **Conexión:** la carga se conecta a Postgres con la cadena de conexión, usando el paquete `pg` (nueva dependencia de desarrollo).
- **Permisos:** dentro de la transacción simula una sesión de administrador (`request.jwt.claims` con `rol: admin`), para que las funciones SQL de la app comprueben los permisos como siempre.
- **Ejecución:** con `tsx`, también nueva dependencia de desarrollo.

## 2. Orden de trabajo

1. `datos.ts` y `ajuste.ts` con sus pruebas unitarias, y la tabla del Excel frente a la app en la descripción del PR.
2. `cargar.ts` y `borrar.ts`, con pruebas de integración en CI. CI ejecuta la carga y el borrado contra el Supabase local, con `DEMO_CORREO_BASE=cesta@example.com`.
3. El workflow, `docs/operacion.md`, la versión 1.1.0 y el CHANGELOG.
4. Revisión independiente, CI, fusión y despliegue (la app no cambia).
5. **Ensayo:** cargar y borrar en **pruebas**. Después, cargar en **producción**.

## 3. Pruebas

| CA | Prueba |
|---|---|
| CA-0201, CA-0203, CA-0207 | Integración: recuentos y estados tras cargar. Semana en curso y semanas cerradas con las funciones de `lib/dominio/inicio.ts` |
| CA-0202 | Integración: exclusiones de cada cesta; unidades y equilibrio de cada reparto, como CA-11 y CA-12 |
| CA-0204 | Integración: cargar dos veces; la segunda falla y los recuentos no cambian |
| CA-0205 | Integración: borrar; y con un colaborador ajeno, el borrado falla sin cambiar nada |
| CA-0206 | CI: `comprobar-rls.sql` después de la carga |

## 4. Riesgos

| Riesgo | Tratamiento |
|---|---|
| Mezclar datos de prueba con reales | RD1 y RD3: la carga solo en una base vacía, y el borrado se niega si hay colaboradores reales |
| La tarea diaria envía correos de la semana 4 | Es lo que se quiere ver. Llegan a la Gmail de la cesta (unos 10 como mucho) |
| Un administrador envía la semana 5 | Unos 20 correos a la Gmail de la cesta. Muy lejos del límite de Gmail |
| Las funciones SQL rechazan fechas pasadas | Las semanas pasadas se preparan como en la app y luego se fijan sus estados con sentencias directas, dentro de la misma transacción y comprobando las restricciones |
| Precios inventados | Se dice en la lista base y en la guía: son aproximados |

## 5. Qué necesita Claude

- Que el responsable apruebe el intent, el spec y el plan.
- Que el responsable cree el secreto **`DEMO_CORREO_BASE`** en `cesta-solidaria` (GitHub → Settings → Secrets and variables → Actions) con la dirección de Gmail de la cesta.
