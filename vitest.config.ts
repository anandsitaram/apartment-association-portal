import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Tests run the real API handler against an in-memory Postgres (PGlite): the Neon driver is swapped for a shim.
export default defineConfig({
  esbuild: { jsx: "automatic" }, // lets tests render the .tsx components (tests/render.test.ts)
  resolve: {
    alias: {
      "@neondatabase/serverless": fileURLToPath(
        new URL("./tests/neon-shim.ts", import.meta.url),
      ),
    },
  },
  test: { include: ["tests/**/*.test.ts"] },
});
