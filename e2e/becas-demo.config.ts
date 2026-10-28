import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const chromium = "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";

// Focused run against the existing workflow, without legacy HTTP reset helpers.
export default defineConfig({
  testDir: ".",
  testMatch: "becas-demo.spec.ts",
  workers: 1,
  timeout: 60_000,
  reporter: "list",
  outputDir: "../generated-artifacts/becas-e2e",
  use: {
    baseURL: process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://127.0.0.1:5000",
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : existsSync(chromium) ? { executablePath: chromium } : {}),
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  },
});
