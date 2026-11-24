import jwt from "jsonwebtoken";
import { pool } from "../../db";
import { JWT_SECRET } from "../../routes/shared";
import { enqueueAuditLog, auditLogger, type AuditLogPayload } from "../../audit-retry";
import { guardianHasActiveFamily } from "../family-access";
import { passwordVersion, isSessionInvalidated } from "../session-version";
import { validTotp, consumeBackupCode } from "../totp-service";
import { SsoError, FIREBASE_UID_RE, type SsoClaims } from "./assertion";
import type { SsoConfig } from "./config";
import { ssoTokenSeconds } from "./session";

const PROVIDER = "firebase";

interface StaffIdentity {
  kind: "user";
  identityId: number;
  tenantId: number;
  user: { id: number; email: string; name: string | null; role: string; campus_id: number | null; tenant_id: number | null; is_super_admin: boolean; twofa_secret: string | null; password_changed_at: Date | string | null };
}
interface GuardianIdentity {
  kind: "guardian";
  identityId: number;
  tenantId: number;
  guardian: { id: number; email: string; nombre_completo: string; tenant_id: number; campus_id: number | null; password_changed_at: Date | string | null };
}
export type ResolvedIdentity = StaffIdentity | GuardianIdentity;

/**
 * Resuelve a qué persona de EduPay corresponde una aserción: escuela habilitada, identidad vinculada,
 * cuenta activa y mismo tenant. Nunca crea nada: vincular a alguien es una decisión de un administrador
 * de EduPay (ver `linkExternalIdentity`), no algo que otorgue por sí solo un uid válido de Firebase.
 */
export async function resolveIdentity(claims: SsoClaims): Promise<ResolvedIdentity> {
  const tenantRes = await pool.query(
    `SELECT id FROM tenants WHERE firebase_id_escuela = $1 LIMIT 1`,
    [claims.idEscuela],
  );
  const tenantId = Number((tenantRes.rows[0] as any)?.id);
  if (!tenantId) throw new SsoError("school_not_enabled", "Tu escuela aún no está activada en EduPay.");

  const identRes = await pool.query(
    `SELECT id, tenant_id, user_id, guardian_id
       FROM external_identities WHERE provider = $1 AND subject = $2 LIMIT 1`,
    [PROVIDER, claims.sub],
  );
  const ident = identRes.rows[0] as any;
  if (!ident) throw new SsoError("not_linked", "Tu cuenta todavía no está vinculada a EduPay. Pide a tu escuela que la active.");
  if (Number(ident.tenant_id) !== tenantId) throw new SsoError("tenant_mismatch", "Tu cuenta pertenece a otra escuela.");

  if (ident.user_id) {
    const u = (await pool.query(
      `SELECT id, email, name, role, campus_id, tenant_id, is_active, is_super_admin, twofa_secret, password_changed_at
         FROM users WHERE id = $1 LIMIT 1`,
      [ident.user_id],
    )).rows[0] as any;
    if (!u) throw new SsoError("not_linked", "Tu cuenta todavía no está vinculada a EduPay. Pide a tu escuela que la active.");
    if (u.is_active === false) throw new SsoError("account_disabled", "Tu cuenta está desactivada. Contacta al administrador de tu escuela.");
    // Todos los roles de personal pueden entrar por SSO, también el administrador de la plataforma. Este último
    // no pertenece a una escuela (su tenant_id suele ser nulo): la escuela sale de la identidad vinculada, y quién
    // puede vincular su cuenta se restringe en `linkExternalIdentity`.
    const isPlatformAdmin = Boolean(u.is_super_admin || u.role === "super_admin");
    if (!isPlatformAdmin && Number(u.tenant_id) !== tenantId) throw new SsoError("tenant_mismatch", "Tu cuenta pertenece a otra escuela.");
    return { kind: "user", identityId: Number(ident.id), tenantId, user: { ...u, is_super_admin: isPlatformAdmin } };
  }

  const g = (await pool.query(
    `SELECT id, email, nombre_completo, tenant_id, campus_id, password_changed_at FROM guardians WHERE id = $1 LIMIT 1`,
    [ident.guardian_id],
  )).rows[0] as any;
  if (!g) throw new SsoError("not_linked", "Tu cuenta todavía no está vinculada a EduPay. Pide a tu escuela que la active.");
  if (Number(g.tenant_id) !== tenantId) throw new SsoError("tenant_mismatch", "Tu cuenta pertenece a otra escuela.");
  if (!(await guardianHasActiveFamily(Number(g.id), tenantId))) {
    throw new SsoError("no_active_family", "Tu acceso está suspendido porque no perteneces a una familia activa.");
  }
  return { kind: "guardian", identityId: Number(ident.id), tenantId, guardian: g };
}

export type EligibilityResult =
  | { eligible: true; kind: "user" | "guardian" }
  | { eligible: false; reason: string };

/** Para que el Dashboard decida si muestra el botón. Solo responde sí o no (y por qué no) al servidor del Dashboard. */
export async function checkEligibility(claims: SsoClaims): Promise<EligibilityResult> {
  try {
    const r = await resolveIdentity(claims);
    return { eligible: true, kind: r.kind };
  } catch (err) {
    if (err instanceof SsoError) return { eligible: false, reason: err.code };
    throw err;
  }
}

export type ExchangeOutcome =
  | { requiresTotp: true }
  | {
      requiresTotp: false;
      token: string;
      expiresInSeconds: number;
      kind: "user";
      user: { id: number; email: string; name: string; role: string; campus_id: number | null; tenant_id: number | null; requires_twofa_setup: boolean };
    }
  | {
      requiresTotp: false;
      token: string;
      expiresInSeconds: number;
      kind: "guardian";
      guardian: { id: number; email: string; nombre_completo: string; tenant_id: number; campus_id: number | null };
    };

export function writeAudit(payload: AuditLogPayload): void {
  pool
    .query(
      `INSERT INTO audit_log (tenant_id, user_id, guardian_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [payload.tenant_id, payload.user_id, payload.guardian_id ?? null, payload.action, payload.entity_type, payload.entity_id, JSON.stringify(payload.metadata)],
    )
    .catch((err) => enqueueAuditLog(payload, err));
}

/**
 * Canjea una aserción ya verificada por una sesión de EduPay.
 * Orden deliberado: identidad y TOTP primero, y el `jti` se consume al final y de forma atómica,
 * de modo que una aserción solo produce una sesión aunque lleguen dos solicitudes a la vez.
 */
export async function exchangeAssertion(
  claims: SsoClaims,
  cfg: SsoConfig,
  totpCode?: string,
): Promise<ExchangeOutcome> {
  const resolved = await resolveIdentity(claims);

  if (resolved.kind === "user" && resolved.user.twofa_secret) {
    // El SSO no sustituye el 2FA de EduPay: quien lo tiene activado debe seguir presentándolo.
    // El secreto está cifrado en la base (TOTP_ENCRYPTION_KEY); se verifica con el mismo servicio que el inicio de sesión.
    if (!totpCode) return { requiresTotp: true };
    const verified = validTotp(resolved.user.twofa_secret, resolved.user.id, totpCode) ||
      await consumeBackupCode(pool, { id: resolved.user.id, twofa_secret: resolved.user.twofa_secret }, totpCode);
    if (!verified) throw new SsoError("invalid_totp", "Código de verificación incorrecto. Intenta de nuevo.");
  }

  const consumed = await pool.query(
    `INSERT INTO sso_assertions_used (jti, expires_at) VALUES ($1, to_timestamp($2))
     ON CONFLICT (jti) DO NOTHING RETURNING jti`,
    [claims.jti, claims.exp],
  );
  if (consumed.rows.length === 0) throw new SsoError("replayed", "Este enlace ya se usó. Vuelve a entrar desde el Dashboard.");

  // Limpieza oportunista de aserciones vencidas; nunca bloquea el inicio de sesión.
  pool.query(`DELETE FROM sso_assertions_used WHERE expires_at < now() - interval '1 day'`).catch(() => undefined);
  pool.query(`UPDATE external_identities SET last_login_at = now() WHERE id = $1`, [resolved.identityId])
    .catch((err) => auditLogger.warn("sso.last_login_update_failed", { identity_id: resolved.identityId, error: String(err) }));

  const sessionStartedAt = Math.floor(Date.now() / 1000);

  if (resolved.kind === "user") {
    const u = resolved.user;
    // Misma forma de claims que `signStaffSession` (staff-session.ts) más `sso: true`: el middleware exige
    // password_version y session_started_at, y solo da acceso a datos de negocio con twofa_verified.
    // Cada token dura lo que tolera la inactividad y se renueva con uso (ver `renewSsoSession`);
    // el tope absoluto desde la entrada lo da `session_started_at`.
    const expiresInSeconds = ssoTokenSeconds("user", sessionStartedAt, cfg, sessionStartedAt);
    const token = jwt.sign(
      { id: u.id, email: u.email, role: u.role, campus_id: u.campus_id, tenant_id: u.tenant_id, is_super_admin: u.is_super_admin, type: "user", sso: true,
        password_version: passwordVersion(u.password_changed_at ? new Date(u.password_changed_at) : null),
        twofa_verified: !!u.twofa_secret, session_started_at: sessionStartedAt, iat: sessionStartedAt },
      JWT_SECRET,
      { expiresIn: expiresInSeconds },
    );
    writeAudit({
      tenant_id: resolved.tenantId, user_id: u.id, action: "sso.login", entity_type: "external_identity",
      entity_id: resolved.identityId, metadata: { kind: "user", provider: PROVIDER, subject: claims.sub, jti: claims.jti },
    });
    return {
      requiresTotp: false, token, expiresInSeconds, kind: "user",
      user: { id: u.id, email: u.email, name: u.name ?? "", role: u.role, campus_id: u.campus_id, tenant_id: u.tenant_id, requires_twofa_setup: !u.twofa_secret },
    };
  }

  const g = resolved.guardian;
  const expiresInSeconds = ssoTokenSeconds("guardian", sessionStartedAt, cfg, sessionStartedAt);
  const token = jwt.sign(
    { id: g.id, email: g.email, tenant_id: g.tenant_id, campus_id: g.campus_id, type: "guardian", sso: true,
      password_version: passwordVersion(g.password_changed_at), session_started_at: sessionStartedAt },
    JWT_SECRET,
    { expiresIn: expiresInSeconds },
  );
  writeAudit({
    tenant_id: resolved.tenantId, user_id: null, guardian_id: g.id, action: "sso.login", entity_type: "external_identity",
    entity_id: resolved.identityId, metadata: { kind: "guardian", provider: PROVIDER, subject: claims.sub, jti: claims.jti },
  });
  const { password_changed_at: _omit, ...guardianPublic } = g;
  return { requiresTotp: false, token, expiresInSeconds, kind: "guardian", guardian: guardianPublic };
}

/**
 * Renueva una sesión SSO que sigue vigente: el token todavía no vence, es decir, hubo uso dentro de la
 * ventana de inactividad. Un token vencido nunca llega aquí (el endpoint lo rechaza), así que la
 * inactividad cierra la sesión sin que el cliente tenga que cooperar.
 *
 * Reglas de cada renovación:
 *  - nunca pasa del tope absoluto contado desde la entrada (`session_started_at`);
 *  - la identidad sigue vinculada y la cuenta sigue activa (quitar el acceso en EduPay corta la sesión);
 *  - el rol, el campus y la escuela se releen de la base, así un cambio de rol aplica en la siguiente renovación;
 *  - el 2FA ya verificado se conserva (no se vuelve a pedir dentro de la misma sesión).
 */
export async function renewSsoSession(
  decoded: Record<string, any>,
  cfg: SsoConfig,
): Promise<{ token: string; expiresInSeconds: number }> {
  const kind = decoded?.type === "guardian" ? "guardian" : "user";
  const startedAt = Number(decoded?.session_started_at);
  const expiresInSeconds = ssoTokenSeconds(kind, startedAt, cfg);
  if (expiresInSeconds <= 0) throw new SsoError("session_ended", "Tu sesión terminó. Vuelve a entrar desde el Dashboard.");

  const ident = (await pool.query(
    kind === "user"
      ? `SELECT id, tenant_id FROM external_identities WHERE provider = $1 AND user_id = $2 LIMIT 1`
      : `SELECT id, tenant_id FROM external_identities WHERE provider = $1 AND guardian_id = $2 LIMIT 1`,
    [PROVIDER, decoded.id],
  )).rows[0] as any;
  if (!ident) throw new SsoError("not_linked", "Tu cuenta ya no está vinculada a EduPay.");

  if (kind === "user") {
    const u = (await pool.query(
      `SELECT id, email, role, campus_id, tenant_id, is_active, is_super_admin, password_changed_at
         FROM users WHERE id = $1 LIMIT 1`,
      [decoded.id],
    )).rows[0] as any;
    if (!u || u.is_active === false) throw new SsoError("account_disabled", "Tu cuenta está desactivada. Contacta al administrador de tu escuela.");
    if (isSessionInvalidated(decoded.password_version, u.password_changed_at ?? null)) {
      throw new SsoError("session_ended", "Tu sesión terminó. Vuelve a entrar desde el Dashboard.");
    }
    const isPlatformAdmin = Boolean(u.is_super_admin || u.role === "super_admin");
    if (!isPlatformAdmin && Number(u.tenant_id) !== Number(ident.tenant_id)) throw new SsoError("tenant_mismatch", "Tu cuenta pertenece a otra escuela.");
    const token = jwt.sign(
      { id: u.id, email: u.email, role: u.role, campus_id: u.campus_id, tenant_id: u.tenant_id, is_super_admin: isPlatformAdmin, type: "user", sso: true,
        password_version: passwordVersion(u.password_changed_at ? new Date(u.password_changed_at) : null),
        twofa_verified: decoded.twofa_verified === true, session_started_at: startedAt },
      JWT_SECRET,
      { expiresIn: expiresInSeconds },
    );
    return { token, expiresInSeconds };
  }

  const g = (await pool.query(
    `SELECT id, email, nombre_completo, tenant_id, campus_id, password_changed_at FROM guardians WHERE id = $1 LIMIT 1`,
    [decoded.id],
  )).rows[0] as any;
  if (!g) throw new SsoError("not_linked", "Tu cuenta ya no está vinculada a EduPay.");
  if (Number(g.tenant_id) !== Number(ident.tenant_id)) throw new SsoError("tenant_mismatch", "Tu cuenta pertenece a otra escuela.");
  if (isSessionInvalidated(decoded.password_version, g.password_changed_at ?? null)) {
    throw new SsoError("session_ended", "Tu sesión terminó. Vuelve a entrar desde el Dashboard.");
  }
  if (!(await guardianHasActiveFamily(Number(g.id), Number(g.tenant_id)))) {
    throw new SsoError("no_active_family", "Tu acceso está suspendido porque no perteneces a una familia activa.");
  }
  const token = jwt.sign(
    { id: g.id, email: g.email, tenant_id: g.tenant_id, campus_id: g.campus_id, type: "guardian", sso: true,
      password_version: passwordVersion(g.password_changed_at), session_started_at: startedAt },
    JWT_SECRET,
    { expiresIn: expiresInSeconds },
  );
  return { token, expiresInSeconds };
}

// ── Vincular / desvincular identidades (lo hace un administrador de EduPay) ─────────────────────

export interface LinkInput {
  tenantId: number;
  subject: string;
  userId?: number | null;
  guardianId?: number | null;
  linkedBy: number | null;
  /** Solo un superadministrador puede vincular la cuenta de un administrador de la plataforma. */
  actorIsSuperAdmin?: boolean;
}

/** Une un uid de Firebase con un usuario de personal o un tutor del mismo tenant. Nunca se vincula por correo. */
export async function linkExternalIdentity(input: LinkInput): Promise<{ id: number }> {
  const { tenantId, subject, userId, guardianId, linkedBy, actorIsSuperAdmin } = input;
  if (!FIREBASE_UID_RE.test(subject)) throw new SsoError("invalid_request", "uid de Firebase inválido.");
  if (Boolean(userId) === Boolean(guardianId)) throw new SsoError("invalid_request", "Indica un usuario o un tutor, no ambos.");

  const target = userId
    ? (await pool.query(`SELECT tenant_id, is_super_admin, role FROM users WHERE id = $1 LIMIT 1`, [userId])).rows[0] as any
    : (await pool.query(`SELECT tenant_id FROM guardians WHERE id = $1 LIMIT 1`, [guardianId]) ).rows[0] as any;
  if (!target) throw new SsoError("invalid_request", "La persona no existe en tu escuela.");
  const targetIsPlatformAdmin = Boolean(userId && (target.is_super_admin || target.role === "super_admin"));
  if (targetIsPlatformAdmin) {
    // Sin esta restricción, un administrador de escuela vincularía su propio uid a la cuenta de la plataforma.
    if (!actorIsSuperAdmin) throw new SsoError("forbidden_role", "Solo un superadministrador puede vincular la cuenta de un administrador de la plataforma.");
  } else if (Number(target.tenant_id) !== tenantId) {
    throw new SsoError("invalid_request", "La persona no existe en tu escuela.");
  }

  try {
    const res = await pool.query(
      `INSERT INTO external_identities (provider, subject, tenant_id, user_id, guardian_id, linked_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [PROVIDER, subject, tenantId, userId ?? null, guardianId ?? null, linkedBy],
    );
    return { id: Number((res.rows[0] as any).id) };
  } catch (err: any) {
    if (err?.code === "23505") throw new SsoError("already_linked", "Ese uid o esa persona ya están vinculados.");
    throw err;
  }
}

export async function unlinkExternalIdentity(identityId: number, tenantId: number): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM external_identities WHERE id = $1 AND tenant_id = $2 RETURNING id`,
    [identityId, tenantId],
  );
  return res.rows.length > 0;
}
