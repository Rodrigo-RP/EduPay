import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  test:{
    include:["email-tests/**/*.test.ts"],environment:"node",fileParallelism:false,
    setupFiles:["email-tests/no-network.ts"],
    env:{
      APP_ENV:"test",DATABASE_URL:"postgresql://127.0.0.1:1/blocked",
      NEON_DATABASE_URL:"postgresql://127.0.0.1:1/blocked",
      RESEND_API_KEY:"",EMAIL_FROM:"",EMAIL_ALLOWED_RECIPIENTS:"",
    },
  },
  resolve:{alias:{"@shared":fileURLToPath(new URL("../shared",import.meta.url))}},
});
