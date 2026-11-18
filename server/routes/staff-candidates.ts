import type { Express, Response } from "express";
import { pool } from "../db";
import { requireSuperAdmin } from "./shared";
import { auditLogger } from "../audit-retry";
import { SsoError } from "../lib/sso/assertion";
import { writeAudit } from "../lib/sso/service";
import { revokeStaffRealtime } from "../lib/staff-realtime";
import { assignStaffCandidate, listStaffCandidates, revokeStaffCandidate } from "../lib/staff-candidates";

function sendError(res: Response, err: unknown, context: string): Response {
  if (err instanceof SsoError) {
    const status = err.code === "already_linked" ? 409 : 400;
    return res.status(status).json({ code: `STAFF_${err.code.toUpperCase()}`, message: err.message });
  }
  auditLogger.error("staff_candidates.unexpected_error", { context, error: err instanceof Error ? err.message : String(err) });
  return res.status(500).json({ message: "No se pudo completar la operación. Intenta de nuevo." });
}

/**
 * Personal del Dashboard propuesto por la sincronización del puente. Solo un superadministrador decide quién entra a
 * EduPay, con qué rol, campus y permisos. El rol del Dashboard es referencia, nunca da acceso por sí mismo.
 */
export function registerStaffCandidateRoutes(app: Express) {
  app.get("/api/super-admin/staff-candidates", requireSuperAdmin, async (req: any, res) => {
    const raw = req.query?.tenant_id;
    const tenantId = raw === undefined || raw === "" ? undefined : Number(raw);
    if (tenantId !== undefined && (!Number.isInteger(tenantId) || tenantId <= 0)) return res.status(400).json({ message: "Solicitud inválida" });
    try {
      const candidates = await listStaffCandidates(pool, tenantId);
      const campuses = (await pool.query(
        `SELECT id, tenant_id, nombre FROM campuses ${tenantId ? "WHERE tenant_id = $1" : ""} ORDER BY nombre`,
        tenantId ? [tenantId] : [],
      )).rows;
      return res.json({ candidates, campuses });
    } catch (err) {
      return sendError(res, err, "list");
    }
  });

  app.post("/api/super-admin/staff-candidates/:id/assign", requireSuperAdmin, async (req: any, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const result = await assignStaffCandidate(pool, {
        candidateId: Number(req.params.id),
        role: String(body.role ?? ""),
        campusId: Number(body.campus_id),
        email: typeof body.email === "string" ? body.email : null,
        customPermissions: Array.isArray(body.custom_permissions) ? (body.custom_permissions as unknown[]).map(String) : [],
        actorId: Number(req.user.id),
      });
      writeAudit({
        tenant_id: result.tenantId, user_id: Number(req.user.id), action: "staff_candidate.assigned", entity_type: "user",
        entity_id: result.userId, metadata: { identity_id: result.identityId, role: result.role, campus_id: result.campusId, custom_permissions: body.custom_permissions ?? [] },
      });
      return res.status(201).json(result);
    } catch (err) {
      return sendError(res, err, "assign");
    }
  });

  app.post("/api/super-admin/staff-candidates/:id/revoke", requireSuperAdmin, async (req: any, res) => {
    const candidateId = Number(req.params.id);
    if (!Number.isInteger(candidateId) || candidateId <= 0) return res.status(400).json({ message: "Solicitud inválida" });
    try {
      const result = await revokeStaffCandidate(pool, candidateId);
      if (!result) return res.status(404).json({ message: "No hay un acceso vinculado para ese candidato." });
      revokeStaffRealtime(result.userId);
      writeAudit({
        tenant_id: result.tenantId, user_id: Number(req.user.id), action: "staff_candidate.revoked", entity_type: "user",
        entity_id: result.userId, metadata: {},
      });
      return res.json({ ok: true });
    } catch (err) {
      return sendError(res, err, "revoke");
    }
  });
}
