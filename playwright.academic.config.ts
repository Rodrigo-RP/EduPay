import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/isolated",
  testMatch: "academic-filters.spec.ts",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5173",
    launchOptions: { executablePath: process.env.CHROMIUM_PATH },
  },
  webServer: {
    command: "npx vite --config e2e/isolated/vite.config.ts",
    url: "http://127.0.0.1:5173/e2e/isolated/academic-filters.html",
    reuseExistingServer: true,
  },
});
