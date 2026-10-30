import type { Express } from "express";
import { requireSuperAdmin } from "./shared";
import { seedDemoData } from "../seed-demo";
import { DatabaseSafetyError } from "../lib/database-safety";

export function registerDemoSeedRoute(app: Express): void {
  // En producción no se registra la ruta, ni siquiera para superadministrador.
  if (process.env.APP_ENV === "production") return;
  // ÚNICA excepción autorizada al no borrado de familias/tutores/alumnos:
  // reemplaza datos demo sólo para superadministrador, ALLOW_DEMO_SEED=true,
  // APP_ENV distinto de producción y marcador edupay:test o edupay:demo.
  // Las guardas de entorno/marcador viven en seedDemoData, antes de cualquier SQL destructivo.
  // ÚNICA excepción autorizada también a la jerarquía de usuarios: este reemplazo
  // de fixtures crea super_admin. Se excluye por nombre (POST /api/demo/seed) de
  // esa regla sólo bajo las mismas guardas anteriores, sin modificar comportamiento.
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
