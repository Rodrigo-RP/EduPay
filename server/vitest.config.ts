import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    hookTimeout: 30000,
    testTimeout: 30000,
    // Los archivos comparten una base de datos real → serializar para evitar
    // contaminación de audit_retry_queue y otras tablas de estado global.
    fileParallelism: false,
    // Glob: recoge automáticamente cualquier *.test.ts bajo tests/,
    // igual que Playwright recoge e2e/**/*.spec.ts con testDir.
    include: ["tests/**/*.test.ts"],
    // Resetea los tres stores de rate-limiting antes de cada archivo de test
    // para evitar 429 cuando la suite se corre múltiples veces seguidas.
    setupFiles: ["tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
});
