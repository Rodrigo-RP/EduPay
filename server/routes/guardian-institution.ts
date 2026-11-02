import type { Express, Request } from "express";
import { pool } from "../db";
import { authenticateGuardian } from "./shared";

export function registerGuardianInstitutionRoute(app: Express) {
  app.get("/api/guardian/institutional-info", authenticateGuardian, async (
    req: Request & { guardian?: { id: number; tenant_id?: number } }, res,
  ) => {
    const guardian = req.guardian;
    if (!guardian?.tenant_id) return res.status(403).json({ message: "Tu cuenta no tiene una institución vinculada. Comunícate con la escuela." });
    try {
      // El campus proviene del tutor guardado, nunca del cliente ni del texto.
      // Sin configuración de ese campus no se inventa un logo.
      const result = await pool.query<{ nombre_legal: string; logo_url: string | null }>(
        `SELECT COALESCE(i.nombre_legal,t.nombre_legal) AS nombre_legal,i.logo_url
         FROM guardians g JOIN tenants t ON t.id=g.tenant_id
         LEFT JOIN institutional_settings i ON i.tenant_id=g.tenant_id AND i.campus_id=g.campus_id
         WHERE g.id=$1 AND g.tenant_id=$2 LIMIT 1`, [guardian.id, guardian.tenant_id]);
      if (!result.rows.length) return res.status(404).json({ message: "No encontramos la institución de tu cuenta. Comunícate con la escuela." });
      const row = result.rows[0];
      res.set("Cache-Control", "private, no-store");
      return res.json({ nombre_legal: row.nombre_legal, logo_url: row.logo_url });
    } catch {
      return res.status(500).json({ message: "No pudimos cargar la información de tu escuela. Intenta de nuevo." });
    }
  });
}
