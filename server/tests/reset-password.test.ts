/**
 * server/tests/reset-password.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/admin/users/:id/reset-password — Reset de contraseña administrativo
 *
 * ESCENARIOS:
 *   RPW-01  Reset exitoso: nueva contraseña en respuesta, hash en DB cambió,
 *           audit_log registra la acción (action = 'password_reset').
 *   RPW-02  Login con contraseña VIEJA falla (401) después del reset.
 *   RPW-03  Login con contraseña NUEVA funciona (200).
 *   RPW-04  Rol sin permiso USERS.UPDATE (admisiones) → 403.
 *   RPW-05  Jerarquía: asistente (nivel 2) → administrador_campus (nivel 5) → 403.
 *   RPW-06  Auto-reset: actor intenta resetear su propia contraseña → 400.
 *
 * LIMITACIÓN DOCUMENTADA (JWT stateless):
 *   El reset cambia el hash en DB y bloquea futuros logins con la contraseña
 *   vieja. Sin embargo, cualquier JWT ya emitido para esa cuenta sigue siendo
 *   válido hasta que expire (máx. 24 h). No existe mecanismo de force-logout.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

// ── Estado compartido ──────────────────────────────────────────────────────
let tenantId:    number;
let campusId:    number;

// Actores
let adminId:         number;   // administrador_campus (puede resetear hacia abajo)
let asistenteId:     number;   // asistente (puede resetear admisiones pero no admin)
let admisionesId:    number;   // admisiones (sin permiso USERS.UPDATE)

// Objetivo del reset
let targetId:        number;   // auxiliar_contable (nivel < 5, reseteable por admin)

const OLD_PASSWORD  = "OldPass123!";
const targetEmail   = () => `target.rpw.${tenantId}@test.internal`;

// JWT helpers — sin llamar al endpoint de login (rate-limited)
function makeToken(userId: number, email: string, role: string) {
  return jwt.sign(
    { id: userId, email, role, campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

let tokenAdmin:      string;
let tokenAsistente:  string;
let tokenAdmisiones: string;

// ── Setup ──────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const ts = Date.now().toString().slice(-7);

  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`ResetPwdTest ${ts}`, `RPW${ts}`]
  );
  tenantId = (tRow.rows[0] as any).id;

  const cRow = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1,$2) RETURNING id`,
    [tenantId, `Campus RPW ${ts}`]
  );
  campusId = (cRow.rows[0] as any).id;

  const hash = await bcrypt.hash(OLD_PASSWORD, 10);

  // administrador_campus — actor principal de los tests exitosos
  const aRow = await pool.query(
    `INSERT INTO users (tenant_id,campus_id,name,email,password_hash,role,is_active)
     VALUES ($1,$2,$3,$4,$5,'administrador_campus',true) RETURNING id`,
    [tenantId, campusId, "Admin RPW", `admin.rpw.${ts}@test.internal`, hash]
  );
  adminId = (aRow.rows[0] as any).id;

  // asistente — actor para test de jerarquía (RPW-05)
  const sRow = await pool.query(
    `INSERT INTO users (tenant_id,campus_id,name,email,password_hash,role,is_active)
     VALUES ($1,$2,$3,$4,$5,'asistente',true) RETURNING id`,
    [tenantId, campusId, "Asistente RPW", `asistente.rpw.${ts}@test.internal`, hash]
  );
  asistenteId = (sRow.rows[0] as any).id;

  // admisiones — actor para test de permiso (RPW-04)
  const mRow = await pool.query(
    `INSERT INTO users (tenant_id,campus_id,name,email,password_hash,role,is_active)
     VALUES ($1,$2,$3,$4,$5,'admisiones',true) RETURNING id`,
    [tenantId, campusId, "Admisiones RPW", `admisiones.rpw.${ts}@test.internal`, hash]
  );
  admisionesId = (mRow.rows[0] as any).id;

  // auxiliar_contable (nivel 3) — objetivo del reset; reseteable por admin (nivel 5)
  const xRow = await pool.query(
    `INSERT INTO users (tenant_id,campus_id,name,email,password_hash,role,is_active)
     VALUES ($1,$2,$3,$4,$5,'auxiliar_contable',true) RETURNING id`,
    [tenantId, campusId, "Target RPW", `target.rpw.${ts}@test.internal`, hash]
  );
  targetId = (xRow.rows[0] as any).id;

  tokenAdmin      = makeToken(adminId,      `admin.rpw.${ts}@test.internal`,      "administrador_campus");
  tokenAsistente  = makeToken(asistenteId,  `asistente.rpw.${ts}@test.internal`,  "asistente");
  tokenAdmisiones = makeToken(admisionesId, `admisiones.rpw.${ts}@test.internal`, "admisiones");
});

// ── Teardown ───────────────────────────────────────────────────────────────
afterAll(async () => {
  if (!tenantId) return;
  await pool.query(`DELETE FROM users    WHERE tenant_id = $1`, [tenantId]).catch(() => {});
  await pool.query(`DELETE FROM campuses WHERE tenant_id = $1`, [tenantId]).catch(() => {});
  await pool.query(`DELETE FROM tenants  WHERE id = $1`,        [tenantId]).catch(() => {});
});

// ── Helpers ────────────────────────────────────────────────────────────────
async function resetPassword(targetUserId: number, token: string) {
  const r = await fetch(`${BASE}/api/admin/users/${targetUserId}/reset-password`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  return { status: r.status, body: await r.json().catch(() => ({})) as any };
}

async function loginAttempt(email: string, password: string) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ email, password }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) as any };
}

async function getPasswordHashFromDB(userId: number): Promise<string | null> {
  const r = await pool.query(`SELECT password_hash FROM users WHERE id = $1`, [userId]);
  return r.rows[0]?.password_hash ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/users/:id/reset-password", () => {

  // Guardamos la nueva contraseña del RPW-01 para usarla en RPW-02 y RPW-03
  let newPasswordFromReset = "";
  let targetEmailValue     = "";

  // ─────────────────────────────────────────────────────────────────────────
  it("RPW-01: Reset exitoso — nueva contraseña en respuesta, hash en DB cambió, audit_log registrado", async () => {
    const hashBefore = await getPasswordHashFromDB(targetId);
    expect(hashBefore, "Hash inicial debe existir").toBeTruthy();

    const { status, body } = await resetPassword(targetId, tokenAdmin);

    expect(status, `Esperado 200, recibido ${status}: ${JSON.stringify(body)}`).toBe(200);

    // La respuesta contiene la nueva contraseña en texto plano
    expect(typeof body.password, "body.password debe ser string").toBe("string");
    expect(body.password.length, "Contraseña debe tener al menos 12 chars").toBeGreaterThanOrEqual(12);
    expect(body.email, "body.email debe coincidir con el target").toBeTruthy();
    expect(body.nombre_completo, "body.nombre_completo debe estar presente").toBeTruthy();
    expect(body.role, "body.role debe estar presente").toBeTruthy();

    newPasswordFromReset = body.password;
    targetEmailValue     = body.email;

    // El hash en DB debe haber cambiado
    const hashAfter = await getPasswordHashFromDB(targetId);
    expect(hashAfter, "Hash debe existir después del reset").toBeTruthy();
    expect(hashAfter, "El hash debe haber cambiado").not.toBe(hashBefore);

    // La nueva contraseña en texto plano NO es el hash (nunca se almacena en claro)
    expect(hashAfter, "El hash no debe ser igual al plaintext").not.toBe(newPasswordFromReset);

    // El nuevo hash debe validar contra la contraseña recibida
    const valid = await bcrypt.compare(newPasswordFromReset, hashAfter!);
    expect(valid, "bcrypt.compare(newPassword, newHash) debe ser true").toBe(true);

    // Verificar audit_log (fire-and-forget — esperar para que el INSERT asíncrono termine)
    await new Promise(r => setTimeout(r, 500));
    const auditRow = await pool.query(
      // Traemos metadata como JSONB (parsed) y como text para comparaciones robustas
      `SELECT metadata, metadata::text AS meta_text
       FROM audit_log
       WHERE entity_id = $1 AND action = 'password_reset' AND tenant_id = $2
       ORDER BY id DESC LIMIT 1`,
      [targetId, tenantId]
    );
    expect(auditRow.rows.length, "audit_log debe tener al menos 1 fila para password_reset").toBeGreaterThan(0);

    const metaText: string = auditRow.rows[0].meta_text ?? JSON.stringify(auditRow.rows[0].metadata);
    // Verificar campos clave en el texto crudo (independiente de cómo pg parsee el JSONB)
    expect(metaText, "metadata debe contener target_user_id").toContain(`"target_user_id"`);
    expect(metaText, "metadata debe contener el entity_id correcto").toContain(String(targetId));
    expect(metaText, "metadata debe contener actor_role").toContain(`"administrador_campus"`);
    // La contraseña NUNCA debe aparecer en el audit_log
    expect(metaText, "audit_log NO debe contener la contraseña en texto plano").not.toContain(newPasswordFromReset);
  });

  // ─────────────────────────────────────────────────────────────────────────
  it("RPW-02: Login con contraseña VIEJA falla (401) después del reset", async () => {
    expect(newPasswordFromReset, "RPW-01 debe haber corrido primero").toBeTruthy();
    expect(targetEmailValue).toBeTruthy();

    const { status } = await loginAttempt(targetEmailValue, OLD_PASSWORD);
    expect(
      status,
      `Login con contraseña vieja debe devolver 401, recibido ${status}`
    ).toBe(401);
  });

  // ─────────────────────────────────────────────────────────────────────────
  it("RPW-03: Login con contraseña NUEVA funciona (200) después del reset", async () => {
    expect(newPasswordFromReset, "RPW-01 debe haber corrido primero").toBeTruthy();
    expect(targetEmailValue).toBeTruthy();

    const { status, body } = await loginAttempt(targetEmailValue, newPasswordFromReset);
    expect(
      status,
      `Login con contraseña nueva debe devolver 200, recibido ${status}: ${JSON.stringify(body)}`
    ).toBe(200);
    expect(body.token, "Respuesta debe incluir token JWT").toBeTruthy();
  });

  // ─────────────────────────────────────────────────────────────────────────
  it("RPW-04: Rol sin permiso USERS.UPDATE (admisiones, nivel 1) → 403", async () => {
    const { status, body } = await resetPassword(targetId, tokenAdmisiones);
    expect(
      status,
      `admisiones debe recibir 403, recibido ${status}: ${JSON.stringify(body)}`
    ).toBe(403);

    // El hash en DB no debe haber cambiado respecto al final de RPW-01/03
    const hashCheck = await getPasswordHashFromDB(targetId);
    const unchanged = await bcrypt.compare(newPasswordFromReset, hashCheck!);
    expect(unchanged, "Hash no debe cambiar cuando el request es rechazado").toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  it("RPW-05: Jerarquía — asistente (nivel 2) intenta resetear administrador_campus (nivel 5) → 403", async () => {
    // Intentar resetear al admin con el token del asistente
    const { status, body } = await resetPassword(adminId, tokenAsistente);
    expect(
      status,
      `asistente → administrador_campus debe devolver 403, recibido ${status}: ${JSON.stringify(body)}`
    ).toBe(403);

    // El hash del admin no debe haber cambiado
    const adminHash = await getPasswordHashFromDB(adminId);
    const adminUnchanged = await bcrypt.compare(OLD_PASSWORD, adminHash!);
    expect(adminUnchanged, "Hash del admin no debe cambiar cuando el request es rechazado").toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────
  it("RPW-06: Auto-reset — actor intenta resetear su propia contraseña → 400", async () => {
    const { status, body } = await resetPassword(adminId, tokenAdmin);
    expect(
      status,
      `Auto-reset debe devolver 400, recibido ${status}: ${JSON.stringify(body)}`
    ).toBe(400);
  });

});
