import type { Express } from "express";
import { pool } from "../db";
import { authenticateToken } from "./shared";

const MAX_PAGE_SIZE = 100;

function parseBoundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Read-only, tenant-scoped audit history for administrative staff.
 *
 * The audit table is immutable and records a normalized action plus JSON
 * metadata. This endpoint intentionally does not expose a write route.
 */
export function registerAuditLogRoutes(app: Express): void {
  app.get("/api/audit-log", authenticateToken, async (req: any, res) => {
    try {
      const jwtUser = req.user;
      if (jwtUser?.type === "guardian" || !jwtUser?.role || !jwtUser?.id) {
        return res.status(403).json({ message: "Acceso exclusivo para personal administrativo" });
      }

      // Privilege and tenant scope are read from the DB, not trusted from the JWT.
      const currentUser = await pool.query(
        `SELECT id, tenant_id, is_super_admin
           FROM users
          WHERE id = $1
          LIMIT 1`,
        [jwtUser.id],
      );
      const actor = currentUser.rows[0] as {
        tenant_id: number | null;
        is_super_admin: boolean;
      } | undefined;

      if (!actor) return res.status(401).json({ message: "Usuario no encontrado" });
      if (!actor.is_super_admin && !actor.tenant_id) {
        return res.status(403).json({ message: "Usuario sin tenant asignado" });
      }

      const limit = parseBoundedInteger(req.query.limit, 50, 1, MAX_PAGE_SIZE);
      const offset = parseBoundedInteger(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
      const clauses: string[] = [];
      const values: unknown[] = [];
      const bind = (value: unknown) => {
        values.push(value);
        return `$${values.length}`;
      };

      if (!actor.is_super_admin) {
        clauses.push(`al.tenant_id = ${bind(actor.tenant_id)}`);
      }

      if (isIsoDate(req.query.desde)) {
        clauses.push(`al.created_at >= ${bind(`${req.query.desde}T00:00:00.000Z`)}`);
      }
      if (isIsoDate(req.query.hasta)) {
        clauses.push(`al.created_at < ${bind(`${req.query.hasta}T00:00:00.000Z`)}::timestamptz + INTERVAL '1 day'`);
      }

      const action = typeof req.query.action === "string" ? req.query.action.trim() : "";
      if (action && action.length <= 100) {
        clauses.push(`al.action = ${bind(action)}`);
      }

      const userFilter = typeof req.query.user === "string" ? req.query.user.trim().slice(0, 200) : "";
      if (userFilter) {
        const pattern = `%${userFilter}%`;
        const p1 = bind(pattern);
        const p2 = bind(pattern);
        clauses.push(`(u.name ILIKE ${p1} OR u.email ILIKE ${p2})`);
      }

      const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 200) : "";
      if (search) {
        const pattern = `%${search}%`;
        const p1 = bind(pattern);
        const p2 = bind(pattern);
        const p3 = bind(pattern);
        const p4 = bind(pattern);
        clauses.push(
          `(al.action ILIKE ${p1} OR al.entity_type ILIKE ${p2} OR al.metadata ILIKE ${p3} OR u.name ILIKE ${p4})`,
        );
      }

      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const dataValues = [...values, limit, offset];
      const result = await pool.query(
        `SELECT al.id, al.user_id, al.guardian_id, al.action, al.entity_type, al.entity_id,
                al.previous_value, al.new_value, al.ip_address, al.metadata, al.created_at,
                u.name AS user_name, u.email AS user_email,
                g.nombre_completo AS guardian_name
           FROM audit_log al
           LEFT JOIN users u ON u.id = al.user_id
           LEFT JOIN guardians g ON g.id = al.guardian_id
           ${where}
          ORDER BY al.created_at DESC, al.id DESC
          LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        dataValues,
      );

      const totalResult = await pool.query(
        `SELECT COUNT(*)::int AS total
           FROM audit_log al
           LEFT JOIN users u ON u.id = al.user_id
           ${where}`,
        values,
      );

      return res.json({
        entries: result.rows,
        total: totalResult.rows[0]?.total ?? 0,
        limit,
        offset,
      });
    } catch (error: any) {
      console.error("[audit-log] Error reading history:", error.message);
      return res.status(500).json({ message: "No se pudo cargar el historial de movimientos" });
    }
  });
}