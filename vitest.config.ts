import { defineConfig } from "vitest/config";
import path from "node:path";

// Dos proyectos:
// - unit: lógica pura, sin red ni base de datos. Se ejecuta en cualquier sitio.
// - integration: contra el Supabase local (supabase start). Solo en CI o en local con Docker.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          setupFiles: ["tests/integration/setup.ts"],
          // Las pruebas de integración comparten base de datos: en serie.
          fileParallelism: false,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
