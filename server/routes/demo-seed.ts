import type { Express } from "express";
import { requireSuperAdmin } from "./shared";
import { seedDemoData } from "../seed-demo";
import { DatabaseSafetyError } from "../lib/database-safety";

export function registerDemoSeedRoute(app: Express): void {
  app.post("/api/demo/seed", requireSuperAdmin, async (_req, res) => {
    if (process.env.ALLOW_DEMO_SEED !== "true") {
      return res.status(403).json({
        message: "Seed demo deshabilitado: requiere ALLOW_DEMO_SEED=true.",
      });
    }
    try {
      const result = await seedDemoData();
      if (!result.success) {
        return res.status(500).json({ message: "No se pudo completar el seed." });
      }
      return res.status(200).json(result);
    } catch (error) {
      const blocked = error instanceof DatabaseSafetyError;
      return res.status(blocked ? 403 : 500).json({
        message: blocked
          ? "Seed bloqueado: entorno o marcador de base no autorizado."
          : "No se pudo completar el seed.",
      });
    }
  });
}
