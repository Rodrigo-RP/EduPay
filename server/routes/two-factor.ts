import type { Express, Request, Response } from "express";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { pool } from "../db";
import { storage } from "../storage";
import { authenticateToken, esmRequire, JWT_SECRET, hasPermissionForUser } from "./shared";
import { MODULES, ACTIONS, canEditUser, type UserRole } from "@shared/permissions";
import { userInSessionScope } from "../lib/user-authorization";
import { pendingTotp, confirmTotp, TotpError, withTotpEnrollmentLock } from "../lib/totp-service";
import { signStaffSession } from "../lib/staff-session";
import { revokeStaffRealtime } from "../lib/staff-realtime";

// Request.user es enriquecido por authenticateToken, no por el body.
type StaffRequest = Request & { user: {
  id: number; role: UserRole; campus_id: number | null; tenant_id: number | null;
  custom_permissions?: string[]; session_started_at?: number; iat: number; password_version: number;
} };
const staffClaims = z.object({
  id: z.number().int(), role: z.enum(["super_admin", "administrador_general", "administrador_campus", "contador_general", "auxiliar_contable", "asistente", "admisiones"]),
  campus_id: z.number().int().nullable(), tenant_id: z.number().int().nullable(),
  custom_permissions: z.array(z.string()).optional(), session_started_at: z.number().optional(),
  iat: z.number(), password_version: z.number().int().nonnegative(),
});
const withStaff = (handler: (req: StaffRequest, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    const parsed = staffClaims.safeParse("user" in req ? req.user : undefined);
    if (!parsed.success) { res.status(403).json({ message: "Sesión de personal no válida." }); return; }
    await withTotpEnrollmentLock(parsed.data.id, () => handler(Object.assign(req, { user: parsed.data }), res));
  };
const resetChallenges = new Map<string, { actor: number; target: number; reason: string; version: string; expires: number }>();
const resetInput = z.object({ reason: z.string().trim().min(1, "Escribe el motivo.").max(1000), confirmation: z.literal(true) });
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
function failure(res: Response, error: unknown) {
  if (error instanceof TotpError) return res.status(error.status).json({ message: error.message });
  return res.status(500).json({ message: "No se pudo completar la operación de dos factores. Intenta de nuevo." });
}

export function registerTwoFactorRoutes(app: Express): void {
  app.post("/api/auth/2fa/setup", authenticateToken, withStaff(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const user = await storage.getUser(req.user.id);
      if (!userInSessionScope(req.user, user)) return res.status(404).json({ message: "Usuario no encontrado." });
      if (user!.twofa_secret) return res.status(409).json({ message: "La cuenta ya tiene dos factores configurados." });
      const pending = pendingTotp.begin(user!);
      const qr = esmRequire("qrcode") as typeof import("qrcode");
      const qrDataUrl = await qr.toDataURL(pending.otpauth_url);
      res.json({ qr_data_url: qrDataUrl, manual_code: pending.manual_code, expires_in: pending.expires_in });
    } catch (error) { failure(res, error); }
  }));
  app.post("/api/auth/2fa/confirm", authenticateToken, withStaff(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const user = await storage.getUser(req.user.id);
      if (!userInSessionScope(req.user, user)) return res.status(404).json({ message: "Usuario no encontrado." });
      const codes = await confirmTotp(pool, { id: user!.id, tenantId: user!.tenant_id, campusId: user!.campus_id,
        passwordVersion: req.user.password_version }, req.body.totp_code);
      res.json({ message: "Dos factores activados. Guarda tus códigos de respaldo.", backup_codes: codes,
        token: signStaffSession(user!, JWT_SECRET, true, req.user.session_started_at ?? req.user.iat) });
    } catch (error) { failure(res, error); }
  }));
  // La 2FA es obligatoria: no existe desactivación propia. El restablecimiento requiere otro administrador.
  app.delete("/api/auth/2fa", authenticateToken, (_req, res) =>
    res.status(403).json({ message: "La autenticación de dos factores es obligatoria. Solicita un restablecimiento a tu administrador." }));

  const targetForReset = async (req: StaffRequest) => {
    const target = await storage.getUser(Number(req.params.id));
    if (!userInSessionScope(req.user, target)) throw new TotpError(404, "Usuario no encontrado.");
    if (req.user.role !== "administrador_general" || req.user.id === target!.id ||
      !hasPermissionForUser(req.user, MODULES.USERS, ACTIONS.UPDATE) ||
      !canEditUser(req.user.role, (target!.is_super_admin ? "super_admin" : target!.role) as UserRole)) {
      throw new TotpError(403, "Sólo un administrador general puede restablecer dos factores de un rol inferior.");
    }
    return target!;
  };
  app.post("/api/admin/users/:id/2fa/reset-preview", authenticateToken, withStaff(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const parsed = resetInput.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Escribe el motivo y confirma el primer aviso." });
      const target = await targetForReset(req);
      if (!target.twofa_secret) throw new TotpError(409, "La cuenta no tiene dos factores configurados.");
      resetChallenges.forEach((item, key) => { if (item.expires <= Date.now()) resetChallenges.delete(key); });
      const token = randomBytes(32).toString("hex");
      resetChallenges.set(digest(token), { actor: req.user.id, target: target.id, reason: parsed.data.reason,
        version: digest(target.twofa_secret + String(target.password_changed_at)), expires: Date.now() + 5 * 60_000 });
      res.json({ confirmation_token: token, message: "Se cerrarán sus sesiones y deberá configurar dos factores de nuevo. Confirma una segunda vez." });
    } catch (error) { failure(res, error); }
  }));
  app.post("/api/admin/users/:id/2fa/reset", authenticateToken, withStaff(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const target = await targetForReset(req);
      if (!userInSessionScope(req.user, target)) throw new TotpError(404, "Usuario no encontrado.");
      const input = z.object({ confirmation_token: z.string().length(64), confirmation: z.literal(true) }).safeParse(req.body);
      if (!input.success) throw new TotpError(400, "Confirma el segundo aviso.");
      const key = digest(input.data.confirmation_token);
      const challenge = resetChallenges.get(key);
      if (!challenge || challenge.expires <= Date.now() || challenge.actor !== req.user.id || challenge.target !== target.id) {
        throw new TotpError(409, "La confirmación venció o ya se utilizó.");
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const locked = await client.query("SELECT twofa_secret, password_changed_at, role, is_super_admin FROM users WHERE id=$1 AND tenant_id=$2 AND campus_id=$3 FOR UPDATE",
          [target.id, req.user.tenant_id, req.user.campus_id]);
        const row = locked.rows[0];
        if (!row || !canEditUser(req.user.role, (row.is_super_admin ? "super_admin" : row.role) as UserRole)) throw new TotpError(403, "No puedes restablecer esta cuenta.");
        if (!row?.twofa_secret || digest(row.twofa_secret + String(row.password_changed_at)) !== challenge.version) throw new TotpError(409, "La cuenta cambió; inicia de nuevo la confirmación.");
        await client.query(`UPDATE users SET twofa_secret=NULL, twofa_backup_hashes=NULL,
          password_changed_at=GREATEST(NOW(), COALESCE(password_changed_at,'epoch'::timestamptz)+interval '1 millisecond'),
          updated_at=NOW() WHERE id=$1`, [target.id]);
        await client.query("INSERT INTO audit_retry_queue (payload) VALUES ($1::jsonb)", [JSON.stringify({
          tenant_id: req.user.tenant_id, user_id: req.user.id, action: "twofa_reset", entity_type: "user", entity_id: target.id,
          metadata: { campus_id: req.user.campus_id, reason: challenge.reason },
        })]);
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
      resetChallenges.delete(key);
      pendingTotp.clear(target.id);
      revokeStaffRealtime(target.id);
      res.json({ message: "Dos factores restablecidos. La cuenta debe registrarlos de nuevo." });
    } catch (error) { failure(res, error); }
  }));
}
