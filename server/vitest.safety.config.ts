import { defineConfig } from "vitest/config";
import path from "node:path";

// Sólo pruebas aisladas: db y storage se sustituyen por mocks en cada archivo.
// Nunca incluye las suites de integración ni sus setupFiles con fixtures reales.
export default defineConfig({
  test: {
    include: ["safety-tests/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    env: { JWT_SECRET: "isolated-safety-tests-not-a-real-secret" },
  },
  resolve: {
    alias: { "@shared": path.resolve(__dirname, "../shared") },
  },
});
