import type { Express, Request, RequestHandler, Response } from "express";

type ScopeRequest = Request & { user?: { campus_id?: number; tenant_id?: number } };
type InvoicingConfig = { proveedor: string; ambiente: string; organizacion_id?: string | null };

export interface SatStatisticsDependencies {
  authenticate: RequestHandler;
  canRead: (req: Request) => boolean;
  checkScope: (campus: number, tenant: number, res: Response) => Promise<boolean>;
  query: (sql: string, values: number[]) => Promise<{ rows: Record<string, unknown>[] }>;
  loadConfig: (campus: number, tenant: number) => Promise<InvoicingConfig | null>;
  providerStatus: (config: InvoicingConfig | null) => {
    pac: string | null;
    modo: "sandbox" | "produccion" | "sin configurar";
    conexion_verificada: false;
    operacion_habilitada: boolean;
  };
}

export function registerSatStatisticsRoute(app: Express, deps: SatStatisticsDependencies): void {
  app.get("/api/fiscal/estadisticas-sat", deps.authenticate, async (req: ScopeRequest, res) => {
    if (!deps.canRead(req)) return res.status(403).json({ message: "Sin permisos para acceder a información fiscal" });
    const campus = req.user?.campus_id;
    const tenant = req.user?.tenant_id;
    if (!campus || !tenant) return res.status(403).json({ message: "Campus y tenant requeridos" });
    try {
      if (!await deps.checkScope(campus, tenant, res)) return;
      const rows = await deps.query(
        `SELECT
           COUNT(*) FILTER (WHERE i.estado = 'emitido') AS emitidos,
           COUNT(*) FILTER (WHERE i.estado = 'cancelado') AS cancelados,
           COUNT(*) FILTER (WHERE i.estado = 'pendiente') AS pendientes,
           COUNT(*) AS total_cfdis
         FROM invoices i
         JOIN payments p ON p.id = i.payment_id
         JOIN charges c ON c.id = p.charge_id
         JOIN students s ON s.id = c.student_id
         WHERE s.campus_id = $1 AND s.tenant_id = $2
           AND p.tenant_id = $2 AND c.tenant_id = $2`,
        [campus, tenant],
      );
      const r = rows.rows[0];
      const config = await deps.loadConfig(campus, tenant);
      return res.json({
        total_cfdis: Number(r.total_cfdis),
        emitidos: Number(r.emitidos),
        cancelados: Number(r.cancelados),
        pendientes: Number(r.pendientes),
        ...deps.providerStatus(config),
      });
    } catch {
      return res.status(500).json({ message: "No se pudieron obtener las estadísticas SAT" });
    }
  });
}
