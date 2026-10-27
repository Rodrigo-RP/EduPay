import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const nixChromium = "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (existsSync(nixChromium) ? nixChromium : undefined);

// No globalSetup, Express, credentials or database fixtures.
export default defineConfig({
  testDir: "./e2e/isolated",
  testMatch: "exception-badge.spec.ts",
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  },
  webServer: {
    command: "npx vite --config e2e/isolated/vite.config.ts",
    url: "http://127.0.0.1:5173/e2e/isolated/exception-badge.html",
    reuseExistingServer: false,
  },
});
