import type { Express } from "express";
import { requireSuperAdmin } from "./shared";
import { seedDemoData } from "../seed-demo";

export function registerDemoSeedRoute(app: Express): void {
  app.post("/api/demo/seed", requireSuperAdmin, async (_req, res) => {
    if (process.env.ALLOW_DEMO_SEED !== "true") {
      return res.status(403).json({
        message: "Seed demo deshabilitado: requiere ALLOW_DEMO_SEED=true.",
      });
    }
    try {
      const result = await seedDemoData();
      return res.status(result.success ? 200 : 500).json(result);
    } catch {
      return res.status(403).json({
        message: "Seed bloqueado: entorno o marcador de base no autorizado.",
      });
    }
  });
}
