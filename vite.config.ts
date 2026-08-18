import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  define: {
    // Clave pública de Stripe — por diseño va en el bundle del navegador.
    // VITE_STRIPE_PUBLISHABLE_KEY debe estar definida en el entorno.
    // Si no existe, el build falla aquí de forma explícita.
    "import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY": (() => {
      const key = process.env.VITE_STRIPE_PUBLISHABLE_KEY;
      if (!key) {
        throw new Error(
          "[vite.config] VITE_STRIPE_PUBLISHABLE_KEY no está definida en el entorno. " +
          "Agrégala como variable de entorno antes de iniciar el servidor."
        );
      }
      return JSON.stringify(key);
    })(),
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
    // HMR en Replit: el proxy termina TLS en 443. Sin esto, el cliente HMR de Vite
    // construye la URL como wss://localhost:undefined, que es inválida y llena la
    // consola del navegador con SyntaxError en cada carga — aunque el WebSocket
    // real de la app (RealTimeProvider, puerto 5000) funciona correctamente.
    hmr: {
      clientPort: 443,
      protocol: "wss",
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
