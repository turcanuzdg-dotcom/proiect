import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Testele bazei de date pornesc un Postgres în memorie (PGlite); le dăm timp.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
