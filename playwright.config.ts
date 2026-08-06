import { defineConfig, devices } from "@playwright/test";

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
        // Usar el chromium del sistema NixOS (instalado via nix)
        // en lugar del binario descargado por playwright que requiere libs del sistema no disponibles.
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium",
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        },
      },
    },
  ],
  // La app ya debe estar corriendo (npm run dev); no la levantamos aquí.
  // En CI usar: webServer: { command: 'npm run dev', port: 5000, reuseExistingServer: true }
});
