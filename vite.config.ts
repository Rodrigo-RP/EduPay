import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  define: {
    // Clave pública de Stripe — por diseño va en el bundle del navegador
    "import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY": JSON.stringify(
      process.env.VITE_STRIPE_PUBLISHABLE_KEY ??
      "pk_test_51U5doxCa00hYnecNGgNSBjVer6LnHCVTTuYERZl6xgK9wj8VM2LvVLGleej9yHtm28ZEMMSWlpMxrgBezQNcHgQw006mCOJHPD"
    ),
  },
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
