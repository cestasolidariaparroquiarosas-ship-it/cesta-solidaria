# Cesta solidaria — instrucciones para Claude

Aplicación para gestionar la cesta solidaria de la parroquia: colaboradores, alimentos,
cestas semanales, reparto equilibrado y confirmaciones por correo.

Lee también `AGENTS.md`: esta versión de Next.js (16) tiene cambios que no están en tu
formación. Antes de usar una API de Next.js, consulta `node_modules/next/dist/docs/`.

## Metodología (AI-native SDLC de Anthropic)

Todo cambio sigue esta cadena, y cada paso deja un artefacto en `docs/sdlc/NNNN-nombre/`:

1. **intent.md:** qué problema hay y qué se quiere conseguir. Lo aprueba el responsable de la cesta. Plantilla: `docs/sdlc/PLANTILLA-intent.md`.
2. **spec.md:** reglas, modelo de datos y criterios de aceptación (CA-NN) que se puedan probar. Lo aprueba el responsable.
3. **plan.md:** archivos, orden de trabajo (un PR por paso), pruebas y riesgos. Lo aprueba el responsable. **No se escribe código antes de que el plan esté aprobado.**
4. **PR:** código y pruebas. Cada CA tiene al menos una prueba que lo nombra (por ejemplo, `"CA-11: ..."`).
5. **Despliegue:** automático al fusionar en `main` si todo pasa. No hay puerta humana: es decisión del responsable (2026-11-14).

Iteración vigente: `docs/sdlc/0001-cesta-v1/`.

## Reglas de trabajo

- **Ramas y PR:** rama `tipo/descripcion-corta` y PR contra `main` con fusión squash. Título en formato Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).
- **Versiones:** cada PR sube `version` en `package.json` (SemVer) y añade su sección `## [X.Y.Z] - AAAA-MM-DD` en `CHANGELOG.md`, enlazando el intent/spec/plan. CI lo comprueba.
- **Revisión:** antes de fusionar, un agente revisor que no haya escrito el código revisa el PR contra el spec y el plan. Sus conclusiones se pegan como comentario en el PR. Solo se fusiona si CI pasa y no hay objeciones graves sin resolver.
- **Migraciones:**
  - En `supabase/migrations/`, solo hacia delante.
  - Siempre compatibles con la versión anterior del código (expandir y luego contraer): nunca se renombra ni se borra una columna en el mismo PR que deja de usarla.
  - Toda tabla nueva de `public`: `enable row level security`, `revoke all ... from anon` y política `to authenticated` con `(select privado.es_admin())`. `scripts/comprobar-rls.sql` lo comprueba en CI y en cada despliegue.
  - Las funciones auxiliares van en el esquema `privado`, que la API no expone. Las vistas, con `security_invoker = true`.
  - Estados como `text` con `CHECK`, no `ENUM`.
  - `seed.sql` solo se carga en local y en CI. Los datos que necesita producción van en una migración.
- **Datos personales (RGPD):**
  - De los receptores, solo un identificador.
  - Las exclusiones son alimentarias ("sin cerdo"), nunca religión ni salud.
  - Nunca se escriben nombres ni correos en los logs.
  - Tampoco objetos de error de Supabase completos: un 23505 de correo repetido lleva el correo en `details`. Los errores se tratan por `code`.
- **Seguridad:**
  - Row Level Security en todas las tablas.
  - La clave secreta de Supabase solo se usa en el servidor (`lib/supabase/`).
  - Toda pantalla y acción de gestión llama a `requerirAdmin()`, también las páginas y no solo el layout.
  - Administrador = `app_metadata.rol === "admin"` (`lib/rol.ts`). Las políticas RLS usan la misma regla: `(auth.jwt() -> 'app_metadata' ->> 'rol') = 'admin'`. Tener una cuenta de Supabase no basta.
  - En los workflows, los secretos se pasan por `env:` y nunca escritos dentro de `run:`.
- **Sencillez:** la va a mantener una sola persona. Prefiere código claro a abstracciones. El código, los comentarios y la interfaz van en español.
- **Cache Components desactivado** (`next.config.ts`): casi todo depende de la sesión, y el renderizado dinámico clásico es más simple.

## Comandos

```bash
npm run dev               # app en local (necesita .env.local)
npm run lint
npm run typecheck         # genera los tipos de rutas y ejecuta tsc
npm run test:unit         # lógica pura, sin Docker
npx supabase start        # Supabase local (necesita Docker)
npx supabase db reset     # aplica migraciones y seed
npm run supabase:env      # escribe .env.local a partir del Supabase local
npm run test:integration  # contra Supabase local
npm run build && npm run test:e2e
npm run version:check     # política de versiones
```

## Estructura

- `app/(admin)/`: pantallas protegidas.
- `app/login`, `app/r/[token]` y `app/baja/[token]`: rutas públicas.
- `lib/dominio/`: lógica pura (R1–R3).
- `lib/servicios/`: base de datos y correo.
- `tests/unit`, `tests/integration` y `tests/e2e`. Las pruebas `@humo` se ejecutan contra los entornos desplegados.
  - En e2e, los mensajes de error se buscan con `alerta(page, texto)` de `tests/e2e/utilidades.ts`: Next.js añade un anunciador de rutas que también tiene `role="alert"`.
  - Los formularios con `useActionState` devuelven lo enviado en el estado (`valores`) cuando hay un error, porque React vacía el formulario tras cada envío.
- `.github/workflows/`: `ci.yml` (PR), `deploy.yml` (main y republicación) y `backup.yml` (diario).
- `docs/operacion.md`: puesta en marcha, cómo volver a una versión anterior y cómo restaurar copias.
