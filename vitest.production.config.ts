import { defineConfig } from "vitest/config";
import { randomBytes } from "node:crypto";
import path from "node:path";

// Pruebas aisladas: no cargan globalSetup, fixtures ni el servidor de la app.
export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["server/tests/{migration-environment,production-startup,bootstrap,schema-comparison,audit-retry-initialization,totp-crypto}.test.ts"],
    env: { JWT_SECRET: randomBytes(32).toString("hex") },
  },
  resolve: { alias: { "@shared": path.resolve(import.meta.dirname, "shared") } },
});
