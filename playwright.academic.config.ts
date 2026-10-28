import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

// UI aislada: sólo Vite y respuestas HTTP de prueba, sin servidor ni fixtures de DB.
const nixChromium = "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync(nixChromium) ? nixChromium : undefined);

export default defineConfig({
  testDir: "./e2e/isolated",
  testMatch: "academic-filters.browser.ts",
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5000",
    launchOptions: { executablePath, args: ["--no-sandbox"] },
  },
  webServer: {
    command: "npx vite --host 0.0.0.0 --port 5000",
    url: "http://127.0.0.1:5000",
    reuseExistingServer: !process.env.CI,
  },
});
