import express, { type Request, Response, NextFunction } from "express";
import { Pool } from "pg";
import { validateProductionStartup, ProductionStartupError } from "./lib/production-startup";
import { DATABASE_MARKER_SQL } from "./lib/database-safety";

async function main() {
// Primero guardas, después módulos de aplicación, workers y servidor.
// Los imports dinámicos impiden que un import estático con efectos se adelante.
await validateProductionStartup(process.env, async () => {
  const reader = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await reader.query(DATABASE_MARKER_SQL);
    return result.rows[0]?.environment_marker;
  } finally {
    await reader.end();
  }
});
const [
  { registerRoutes }, { setupVite, serveStatic, log }, { wsManager },
  { initAuditRetryQueue, startAuditRetryWorker },
  { resendWebhookRateLimit, resendWebhookBodyError },
  { requestMetadataLogger }, { apiNotFound },
] = await Promise.all([
  import("./routes"), import("./vite"), import("./websocket-manager"),
  import("./audit-retry"), import("./routes/email-webhooks"),
  import("./lib/request-log"), import("./lib/api-not-found"),
]);

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

  // ── Verificar cola migrada antes de iniciar su worker ──────────────────
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
}
void main().catch(error => {
  console.error(error instanceof ProductionStartupError ? error.message : "No se pudo iniciar EduPay. Revisa la configuración y el esquema de la base.");
  process.exitCode = 1;
});
