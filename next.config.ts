import type { NextConfig } from "next";

// Decisión (PR 0): sin Cache Components. Es una app de gestión donde casi todo
// depende de la sesión del administrador; el renderizado dinámico clásico es más
// sencillo de mantener por una sola persona. Ver CLAUDE.md.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
