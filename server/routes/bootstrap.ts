import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { bootstrapInstitution, BootstrapError, type BootstrapPool } from "../lib/bootstrap";

export function registerBootstrapRoute(app: Express, pool: BootstrapPool): void {
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });
  app.post("/api/bootstrap", limiter, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const authorization = req.header("Authorization");
      const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
      const result = await bootstrapInstitution(pool, req.body, token);
      res.status(201).json(result);
    } catch (error) {
      const expected = error instanceof BootstrapError;
      res.status(expected ? error.status : 500).json({
        message: expected ? error.message : "No se pudo completar la inicialización.",
      });
    }
  });
}
