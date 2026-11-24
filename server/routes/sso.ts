import type { Express, Response } from "express";
import { pool } from "../db";
import { MODULES, ACTIONS } from "@shared/permissions";
import jwt from "jsonwebtoken";
import { authenticateToken, requireSuperAdmin, hasPermissionForUser, JWT_SECRET } from "./shared";
import { auditLogger } from "../audit-retry";
import { loadSsoConfig, type SsoConfig } from "../lib/sso/config";
import { SsoError, verifySsoAssertion, type SsoErrorCode } from "../lib/sso/assertion";
import { checkEligibility, exchangeAssertion, renewSsoSession, linkExternalIdentity, unlinkExternalIdentity, writeAudit } from "../lib/sso/service";

const HTTP_STATUS: Record<SsoErrorCode, number> = {
  not_configured: 503,
  invalid_assertion: 401,
  replayed: 401,
  invalid_totp: 401,
  session_ended: 401,
  school_not_enabled: 403,
  not_linked: 403,
  tenant_mismatch: 403,
  account_disabled: 403,
  forbidden_role: 403,
  no_active_family: 403,
  already_linked: 409,
  invalid_request: 400,
};

const MSG_INVALID_ASSERTION = "El enlace de acceso no es válido o ya venció. Vuelve a entrar desde el Dashboard.";
const ESCUELA_RE = /^[A-Za-z0-9_-]{1,64}$/;

function sendSsoError(res: Response, err: unknown, context: string): Response {
  if (err instanceof SsoError) {
    if (err.code === "invalid_assertion") {
      // El motivo exacto se registra, pero no se devuelve al cliente.
      auditLogger.warn("sso.assertion_rejected", { context, reason: err.message });
      return res.status(401).json({ code: "SSO_INVALID_ASSERTION", message: MSG_INVALID_ASSERTION });
    }
    auditLogger.info("sso.rejected", { context, code: err.code });
    return res.status(HTTP_STATUS[err.code]).json({ code: `SSO_${err.code.toUpperCase()}`, message: err.message });
  }
  auditLogger.error("sso.unexpected_error", { context, error: err instanceof Error ? err.message : String(err) });
  return res.status(500).json({ message: "No se pudo completar la operación. Intenta de nuevo." });
}

export function registerSsoRoutes(app: Express, env: NodeJS.ProcessEnv = process.env): void {
  let cached: { key: string; result: ReturnType<typeof loadSsoConfig> } | null = null;
  const getConfig = () => {
    const key = [env.SSO_ENABLED, env.SSO_PUBLIC_KEY, env.SSO_ISSUER, env.SSO_AUDIENCE, env.SSO_SESSION_TTL_MINUTES, env.SSO_IDLE_MINUTES, env.SSO_ASSERTION_MAX_AGE_SECONDS].join("|");
    if (!cached || cached.key !== key) cached = { key, result: loadSsoConfig(env) };
    return cached.result;
  };

  const boot = getConfig();
  if (!boot.ok && boot.reason === "misconfigured") {
    auditLogger.error("sso.misconfigured", { detail: boot.detail });
  }

  const requireConfig = (res: Response): SsoConfig | null => {
    const result = getConfig();
    if (result.ok) return result.config;
    res.status(503).json({ code: "SSO_NOT_CONFIGURED", message: "El inicio de sesión único no está disponible." });
    return null;
  };

  // ── Configuración pública mínima para la página /sso (no revela llaves ni emisor) ───────────────────
  app.get("/api/auth/sso/config", (_req, res) => {
    const result = getConfig();
    res.set("Cache-Control", "no-store");
    res.json({ enabled: result.ok, dashboard_url: result.ok ? result.config.dashboardUrl : null });
  });

  // ── Canje de la aserción por una sesión de EduPay ─────────────────────────────────────────────
  // Lo llama el navegador desde la página /sso de EduPay con la aserción que firmó el Dashboard.
  app.post("/api/auth/sso/exchange", async (req, res) => {
    const cfg = requireConfig(res);
    if (!cfg) return;
    res.set("Cache-Control", "no-store");
    try {
      const { assertion, totp_code } = (req.body ?? {}) as { assertion?: unknown; totp_code?: unknown };
      const claims = verifySsoAssertion(String(assertion ?? ""), cfg, "sso_login");
      const out = await exchangeAssertion(claims, cfg, totp_code === undefined ? undefined : String(totp_code));
      if (out.requiresTotp) return res.json({ requires_totp: true });
      const { requiresTotp: _unused, expiresInSeconds, ...session } = out;
      return res.json({ ...session, expires_in: expiresInSeconds });
    } catch (err) {
      return sendSsoError(res, err, "exchange");
    }
  });

  // ── Renovación de una sesión SSO con uso ──────────────────────────────────────────────────────
  // El cliente la pide mientras la persona usa EduPay. Solo renueva un token que NO ha vencido: pasada la
  // ventana de inactividad el token vence solo y no hay forma de revivirlo; hay que entrar desde el Dashboard.
  // Nunca pasa del tope absoluto de la sesión (ver `renewSsoSession`).
  app.post("/api/auth/sso/renew", async (req, res) => {
    const cfg = requireConfig(res);
    if (!cfg) return;
    res.set("Cache-Control", "no-store");
    try {
      const header = String(req.headers.authorization ?? "");
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";
      let decoded: any;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch {
        throw new SsoError("session_ended", "Tu sesión terminó. Vuelve a entrar desde el Dashboard.");
      }
      if (decoded?.sso !== true) throw new SsoError("invalid_request", "Esta sesión no se inició desde el Dashboard.");
      const { token: renewed, expiresInSeconds } = await renewSsoSession(decoded, cfg);
      return res.json({ token: renewed, expires_in: expiresInSeconds });
    } catch (err) {
      return sendSsoError(res, err, "renew");
    }
  });

  // ── ¿Puede esta persona entrar a EduPay? (lo consulta el servidor del Dashboard) ────────────────
  // Autenticación servidor a servidor: la aserción de propósito "sso_eligibility" la firma el Dashboard.
  app.post("/api/sso/eligibility", async (req, res) => {
    const cfg = requireConfig(res);
    if (!cfg) return;
    res.set("Cache-Control", "no-store");
    try {
      const header = String(req.headers.authorization ?? "");
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";
      const claims = verifySsoAssertion(token, cfg, "sso_eligibility");
      return res.json(await checkEligibility(claims));
    } catch (err) {
      return sendSsoError(res, err, "eligibility");
    }
  });

  // ── Administración de identidades vinculadas (personal de EduPay con permiso) ─────────────────────
  app.get("/api/admin/external-identities", authenticateToken, async (req: any, res) => {
    if (!hasPermissionForUser(req.user, MODULES.USERS, ACTIONS.READ)) {
      return res.status(403).json({ message: "Sin permiso para ver las identidades vinculadas" });
    }
    const tenantId = Number(req.user?.tenant_id);
    if (!tenantId) return res.status(403).json({ message: "Se requiere una escuela (tenant) en la sesión" });
    try {
      const rows = await pool.query(
        `SELECT id, subject, user_id, guardian_id, created_at, last_login_at
           FROM external_identities WHERE tenant_id = $1 ORDER BY id DESC LIMIT 500`,
        [tenantId],
      );
      return res.json({ identities: rows.rows });
    } catch (err) {
      return sendSsoError(res, err, "list");
    }
  });

  app.post("/api/admin/external-identities", authenticateToken, async (req: any, res) => {
    if (!hasPermissionForUser(req.user, MODULES.USERS, ACTIONS.CREATE)) {
      return res.status(403).json({ message: "Sin permiso para vincular cuentas" });
    }
    // Un superadministrador no tiene escuela en la sesión: indica a qué escuela pertenece la identidad en `tenant_id`.
    const actorIsSuperAdmin = req.user?.is_super_admin === true;
    const tenantId = Number(req.user?.tenant_id ?? (actorIsSuperAdmin ? (req.body ?? {}).tenant_id : undefined));
    if (!tenantId) return res.status(403).json({ message: "Se requiere una escuela (tenant) en la sesión" });
    try {
      const { subject, user_id, guardian_id } = (req.body ?? {}) as Record<string, unknown>;
      const { id } = await linkExternalIdentity({
        tenantId,
        subject: String(subject ?? ""),
        userId: user_id ? Number(user_id) : null,
        guardianId: guardian_id ? Number(guardian_id) : null,
        linkedBy: Number(req.user.id),
        actorIsSuperAdmin,
      });
      writeAudit({
        tenant_id: tenantId, user_id: Number(req.user.id), action: "sso.identity_linked", entity_type: "external_identity",
        entity_id: id, metadata: { subject: String(subject), user_id: user_id ?? null, guardian_id: guardian_id ?? null },
      });
      return res.status(201).json({ id });
    } catch (err) {
      return sendSsoError(res, err, "link");
    }
  });

  app.delete("/api/admin/external-identities/:id", authenticateToken, async (req: any, res) => {
    if (!hasPermissionForUser(req.user, MODULES.USERS, ACTIONS.DELETE)) {
      return res.status(403).json({ message: "Sin permiso para desvincular cuentas" });
    }
    const tenantId = Number(req.user?.tenant_id);
    const identityId = Number(req.params.id);
    if (!tenantId || !Number.isInteger(identityId) || identityId <= 0) return res.status(400).json({ message: "Solicitud inválida" });
    try {
      if (!(await unlinkExternalIdentity(identityId, tenantId))) return res.status(404).json({ message: "Identidad no encontrada" });
      writeAudit({
        tenant_id: tenantId, user_id: Number(req.user.id), action: "sso.identity_unlinked", entity_type: "external_identity",
        entity_id: identityId, metadata: {},
      });
      return res.json({ ok: true });
    } catch (err) {
      return sendSsoError(res, err, "unlink");
    }
  });

  // ── Asociar una escuela de Firebase (idEscuela) con un tenant de EduPay: solo superadmin ────────────
  app.put("/api/super-admin/tenants/:id/firebase-escuela", requireSuperAdmin, async (req: any, res) => {
    const tenantId = Number(req.params.id);
    const raw = (req.body ?? {}).firebase_id_escuela;
    const value = raw === null || raw === "" ? null : String(raw);
    if (!Number.isInteger(tenantId) || tenantId <= 0 || (value !== null && !ESCUELA_RE.test(value))) {
      return res.status(400).json({ message: "Solicitud inválida" });
    }
    try {
      const updated = await pool.query(
        `UPDATE tenants SET firebase_id_escuela = $1, updated_at = now() WHERE id = $2 RETURNING id`,
        [value, tenantId],
      );
      if (updated.rows.length === 0) return res.status(404).json({ message: "Tenant no encontrado" });
      writeAudit({
        tenant_id: tenantId, user_id: Number(req.user.id), action: "sso.tenant_school_mapped", entity_type: "tenant",
        entity_id: tenantId, metadata: { firebase_id_escuela: value },
      });
      return res.json({ id: tenantId, firebase_id_escuela: value });
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ message: "Esa escuela de Firebase ya está asociada a otro tenant." });
      return sendSsoError(res, err, "map-tenant");
    }
  });
}
