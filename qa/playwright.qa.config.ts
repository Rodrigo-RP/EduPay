import { defineConfig } from "@playwright/test";

/**
 * Configuración de la suite de QA. No es la configuración del CI (esa es playwright.config.ts y solo corre e2e/).
 * Uso: ver qa/README.md.
 */
export default defineConfig({
  testDir: ".",
  testMatch: /.*.spec.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [["list"], ["json", { outputFile: "resultados.json" }]],
  use: { baseURL: "http://localhost:5000", actionTimeout: 15_000, navigationTimeout: 30_000 },
});
