import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { wsManager } from "./websocket-manager";
import { initAuditRetryQueue, startAuditRetryWorker } from "./audit-retry";
import { resendWebhookRateLimit, resendWebhookBodyError } from "./routes/email-webhooks";
import { requestMetadataLogger } from "./lib/request-log";
import { apiNotFound } from "./lib/api-not-found";

// Global error handling
process.on('unhandledRejection', () => {
  console.error('Unhandled rejection');
  // Don't exit process, just log the error
});

process.on('uncaughtException', () => {
  console.error('Uncaught exception');
  // Exit process for uncaught exceptions
  process.exit(1);
});

const app = express();
app.use(requestMetadataLogger(log));

// Stripe webhook — raw body ANTES de express.json().
// stripe.webhooks.constructEvent necesita el Buffer original para verificar HMAC.
// Si express.json() lo parsea primero, la firma fallaría (cuerpo mutado).
app.use("/api/webhooks/stripe", express.raw({ type: "application/json" }));
app.use("/api/notifications/webhooks/resend", resendWebhookRateLimit(), express.raw({type:()=>true,limit:"64kb",inflate:false}), resendWebhookBodyError);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

(async () => {
  // ── Cola de reintentos de audit_log (tabla + worker) ─────────────────────
  // Debe inicializarse antes de que lleguen requests para que la tabla exista.
  await initAuditRetryQueue();
  startAuditRetryWorker();

  const server = await registerRoutes(app);
  app.use("/api", apiNotFound);

  // Initialize WebSocket manager
  wsManager.initialize(server);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    log(`WebSocket server ready for real-time updates`);
  });
})();
