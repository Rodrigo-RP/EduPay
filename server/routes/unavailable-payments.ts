import type { Express, RequestHandler } from "express";

export function registerUnavailablePaymentRoutes(app: Express, authenticateGuardian: RequestHandler): void {
  for (const path of ["/api/payments/create-intent", "/api/payments/process"]) {
    app.post(path, authenticateGuardian, (_req, res) => {
      return res.status(501).json({
        code: "NO_DISPONIBLE",
        message: "Esta función no está disponible todavía. Usa el portal de pagos seguro.",
      });
    });
  }
}
