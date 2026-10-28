import type { Express, RequestHandler } from "express";

interface ChargeListDependencies {
  authenticate: RequestHandler;
  canRead: (user: any) => boolean;
  query: (sql: string, params: any[]) => Promise<{ rows: any[] }>;
}

/** Filtrar antes de LIMIT evita perder cargos de ciclos o niveles menos recientes. */
export function registerOperationalChargesRoute(app: Express, deps: ChargeListDependencies) {
  app.get("/api/admin/charges", deps.authenticate, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!deps.canRead(user)) {
        return res.status(403).json({ message: "Sin permisos para ver cargos" });
      }
      if (!user?.campus_id || !user?.tenant_id) {
        return res.status(400).json({ message: "Campus e institución requeridos" });
      }
      const ciclo = typeof req.query.ciclo === "string" ? req.query.ciclo : null;
      const nivel = typeof req.query.nivel === "string" && req.query.nivel !== "all" ? req.query.nivel : null;
      const rows = await deps.query(`
        SELECT c.*, s.nivel_escolar,
               COALESCE(NULLIF(s.nombre_completo, ''), TRIM(CONCAT_WS(' ', s.nombres, s.apellido_paterno))) AS estudiante
          FROM charges c
          JOIN students s ON s.id = c.student_id
         WHERE s.campus_id = $1
           AND c.tenant_id = $2
           AND ($3::text IS NULL OR c.ciclo_escolar = $3)
           AND ($4::text IS NULL OR UPPER(TRIM(s.nivel_escolar)) = UPPER(TRIM($4)))
         ORDER BY c.created_at DESC
         LIMIT 500
      `, [user.campus_id, user.tenant_id, ciclo, nivel]);
      res.json(rows.rows);
    } catch {
      res.status(500).json({ message: "No se pudieron cargar los cargos. Intenta nuevamente." });
    }
  });
}
