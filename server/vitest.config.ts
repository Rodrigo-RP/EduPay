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
    // Paths are relative to this config file's location (server/).
    // Running: cd server && npx vitest run  OR  npm test from root via package.json
    include: [
      "tests/family-ledger.test.ts",
      "tests/state-machines.test.ts",
      "tests/assistant-knowledge.test.ts",
      "tests/tenant-isolation.test.ts",
      "tests/tenant-http.test.ts",
      "tests/excepciones-conciliacion.test.ts",
      "tests/bug-audit-log-rollback.test.ts",
      "tests/audit-retry.test.ts",
      "tests/audit-catch-sites.test.ts",
      "tests/pagar-manual.test.ts",
      "tests/caja-onerror.test.ts",
      "tests/planes-pago.test.ts",
      "tests/payment-concurrency.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
});
