import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    hookTimeout: 30000,
    testTimeout: 30000,
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
    ],
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
});
