import { defineConfig } from "vitest/config";

// Pruebas aisladas: no cargan globalSetup, fixtures ni el servidor de la app.
export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["server/tests/{migration-environment,production-startup,bootstrap,schema-comparison,audit-retry-initialization}.test.ts"],
  },
});
