# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versiones según [SemVer](https://semver.org/lang/es/).
Cada versión enlaza los artefactos de la metodología que la originaron (`docs/sdlc/`).

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
