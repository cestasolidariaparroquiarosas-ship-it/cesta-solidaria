# Plan: Cesta solidaria — versión 1.0.0

- **Origen:** `intent.md` y `spec.md` (aprobados el 2026-11-14)
- **Estado:** borrador, pendiente de aprobación. Claude no escribe código hasta que este plan esté aprobado.
- **Fecha:** 2026-11-14

## 1. Estructura del repositorio

```
cesta-solidaria/
├── CLAUDE.md                     # Reglas del proyecto para Claude: metodología, comandos, convenciones
├── CHANGELOG.md
├── docs/sdlc/                    # Artefactos de la metodología
│   ├── 0001-cesta-v1/            # intent.md, spec.md, plan.md de esta iteración
│   └── PLANTILLA-intent.md       # Plantilla para futuros cambios
├── app/
│   ├── (admin)/                  # Pantallas protegidas: inicio, colaboradores, alimentos,
│   │                             #   listas, semanas/[id], historico
│   ├── login/
│   ├── r/[token]/                # Respuesta pública a una asignación (R4)
│   ├── baja/[token]/             # Baja pública (R5)
│   └── api/cron/diario/route.ts  # Cron: plazos vencidos + keep-alive (R4.5, CA-27)
├── lib/
│   ├── dominio/                  # Lógica pura, sin E/S; la más probada
│   │   ├── cesta.ts              # R1
│   │   ├── seleccion.ts          # R2
│   │   ├── reparto.ts            # R3
│   │   └── plazos.ts             # Cálculo de plazos de reasignación
│   ├── servicios/                # Orquestación con base de datos y correo
│   │   ├── envio.ts              # Enviar semana, reintentos
│   │   ├── respuestas.ts         # Confirmar o rechazar con token
│   │   └── reasignacion.ts       # Llama a la función SQL de reasignación
│   ├── correo/                   # Nodemailer + plantillas
│   └── supabase/                 # Clientes: navegador, servidor, servicio
├── supabase/
│   ├── migrations/               # Esquema, RLS, funciones SQL
│   └── seed.sql                  # Etiquetas, lista "estándar" de ejemplo, datos de prueba
├── tests/
│   ├── unit/                     # Vitest + fast-check (dominio)
│   ├── integration/              # Vitest contra Supabase local + Mailpit (servicios, RLS)
│   └── e2e/                      # Playwright (recorridos y humo)
├── .github/workflows/
│   ├── ci.yml                    # PR: lint, tipos, unit, integración, e2e
│   ├── deploy.yml                # main o manual con ref: pruebas → humo → producción → etiqueta
│   └── backup.yml                # Diario: dump cifrado + consulta al proyecto de pruebas
└── vercel.json                   # Cron diario 07:00 UTC
```

## 2. Orden de trabajo

Cada paso es un PR que se publica solo al pasar las pruebas. Cada PR deja la app en un estado que funciona.

| PR | Contenido | CA que cubre | Versión |
|---|---|---|---|
| 0 | Esqueleto (Next.js, TS, Tailwind, ESLint, Vitest, Playwright), `CLAUDE.md`, workflows `ci`, `deploy` y `backup`, acceso del administrador, página de inicio vacía | 23, 25, 30–34 | 0.1.0 |
| 1 | Migraciones: todas las tablas, RLS, `seed.sql` | 23 | 0.2.0 |
| 2 | Colaboradores: lista, alta, edición, pausa, baja, eliminar | 01–04 | 0.3.0 |
| 3 | Etiquetas, alimentos y listas base | — (base para R1) | 0.4.0 |
| 4 | Semanas y cestas con R1 | 05–08 | 0.5.0 |
| 5 | Selección y reparto (R2 y R3) con edición manual | 09–13 | 0.6.0 |
| 6 | Correo, tokens, páginas `/r` y `/baja`, rechazo con reasignación inmediata | 14–19, 22, 24 | 0.7.0 |
| 7 | Cron diario: plazos vencidos, reasignación, aviso sin candidatos, keep-alive | 20, 21, 26, 27 | 0.8.0 |
| 8 | Inicio con resumen, histórico, casilla "entregado", conservación a 12 meses, repaso móvil | 28, 29 | 0.9.0 |
| 9 | Prueba de restauración de la copia, repaso final y documentación de uso | 34 (restauración) | **1.0.0** |

El PR 0 incluye los workflows desde el principio. Así, desde la primera línea de código, todo se publica por el mismo camino.

## 3. Pruebas que demuestran que funciona

- **Dominio (unitarias):** una prueba por cada CA de R1–R3, con los datos exactos del spec (CA-05, 09, 10).
- **Propiedades (fast-check):** para CA-11 y CA-12 se generan cientos de semanas al azar. Se comprueba que la diferencia de gasto ≤ la pieza más cara, y que cada unidad se asigna exactamente una vez.
- **Integración:** contra Supabase local y Mailpit, el buzón de pruebas que trae Supabase local.
  - RLS con usuario anónimo (CA-23).
  - Tokens (CA-15–19).
  - Reasignación (CA-17, 20, 21).
  - Borrado (CA-04).
  - Los correos se comprueban leyendo Mailpit.
- **e2e (Playwright):**
  - Recorrido completo: crear semana → cestas → reparto → enviar → responder desde el enlace del correo.
  - Vista de 375 px (CA-28).
  - El subconjunto `@humo` es el que `deploy.yml` ejecuta contra pruebas y producción.
- **Despliegue:**
  - CA-30: protección de rama, CI obligatorio.
  - CA-31: paso de humo antes de producción.
  - CA-32 y CA-33: se verifican a mano una vez en el PR 0, y la evidencia queda en el PR.

## 4. Riesgos y cómo se tratan

| Riesgo | Paso | Tratamiento |
|---|---|---|
| **El más arriesgado:** dos rechazos casi simultáneos eligen al mismo sustituto | PR 6 | La reasignación se hace en una función SQL (`reasignar_asignacion`) dentro de una transacción que bloquea la fila de la semana (`SELECT … FOR UPDATE`). Prueba de integración con dos rechazos en paralelo |
| El correo falla después de guardar la reasignación | PR 6–7 | Se guarda primero y se envía después. Si el envío falla, se marca `error_envio` y el cron lo reintenta. El panel lo muestra |
| Antivirus del correo que abren los enlaces | PR 6 | GET solo muestra; POST registra (CA-15) |
| La migración rompe la versión en producción | Todos | Regla de compatibilidad con la versión anterior, migración y humo primero en pruebas (CA-31) |
| Horas: Vercel usa UTC; España, CET/CEST | PR 4, 7 | Fechas guardadas en UTC y mostradas en `Europe/Madrid`. Pruebas en el cambio de hora de octubre y marzo. El cron a las 07:00 UTC cae entre las 8 y las 10 hora local, y es suficiente |
| Gmail bloquea el envío desde Vercel | PR 6 | Prueba manual en el PR 6 contra la cuenta real. Alternativa preparada: puerto 465 frente a 587; en último caso, Brevo gratuito (300 correos al día) |
| Datos personales en los registros o en las copias | PR 0, 9 | No se registran correos ni nombres en los logs. Copias cifradas, guardadas 30 días |

## 5. Alternativas descartadas

- **Supabase Edge Functions para la lógica de servidor:** se descartan porque obligarían a mantener dos entornos de ejecución. Las rutas de Next.js en Vercel bastan.
- **pg_cron de Supabase para los plazos:** daría precisión de minutos, pero se descarta para la v1 por dos motivos. Repartiría la lógica entre la base de datos y la app, y el cron de Vercel también sirve para mantener Supabase despierto. Queda como mejora si algún día se necesita más precisión.
- **Vercel enlazado directamente a GitHub:** se descarta porque publicaría sin pasar por la prueba de humo en el entorno de pruebas. Se despliega solo desde Actions.
- **Resend para el correo:** se descarta porque exige un dominio propio. Se reconsiderará si la parroquia tiene dominio algún día.
- **Optimización exacta del reparto (programación entera):** se descarta porque añade una dependencia pesada para una mejora mínima. El algoritmo voraz ya garantiza la cota de CA-11.

## 6. Qué necesita Claude para empezar

La puesta en marcha de la sección 7 del spec: cuenta de Gmail, repositorio, Supabase, Vercel, secretos y variables. Sin el repositorio no se puede abrir el PR 0. Sin los secretos, el PR 0 se puede preparar pero no publicar.
