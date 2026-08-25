import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const nixChromium = "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
// En Replit usamos Chromium del sistema NixOS; en GitHub se omite esta opción
// para que Playwright use el navegador descargado por el job.
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (existsSync(nixChromium) ? nixChromium : undefined);

/**
 * Playwright — configuración E2E para EduPay
 *
 * §4 del Protocolo de Auditoría Real:
 *   - Capa 1: Vitest (lógica aislada)  →  npm test
 *   - Capa 2: Playwright (flujos reales) →  npm run test:e2e
 *
 * Un módulo se considera PROBADO solo cuando pasa ambas capas.
 */

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,   // los tests comparten sesión de DB de demo; correr en serie
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "playwright-report/results.json" }],
  ],
  use: {
    baseURL: "http://localhost:5000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          ...(chromiumExecutable ? { executablePath: chromiumExecutable } : {}),
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        },
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
