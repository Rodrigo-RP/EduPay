/**
 * server/tests/password-changed-at.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Regresión #138 — Invalidar sesiones JWT tras cambio de contraseña
 *
 * MECANISMO:
 *   updateUserPassword / updateGuardianProfile (con password_hash) fijan
 *   password_changed_at = NOW() en DB. Los middlewares authenticateToken,
 *   authenticateGuardian y requireAuth comparan iat del JWT (segundos Unix)
 *   contra password_changed_at; si iat < password_changed_at → 401
 *   con code:"SESSION_INVALIDATED". POST /api/auth/refresh aplica la misma
 *   verificación para que tampoco pueda renovarse un token invalidado.
 *
 * PATRÓN DE TEST (evita sleeps):
 *   Los tokens "anteriores al cambio" se firman con iat = now - 60 (un minuto
 *   antes). El endpoint de cambio de contraseña fija password_changed_at = NOW(),
 *   que siempre es > iat. El token "posterior" se firma con iat = now + 1.
 *
 * ESCENARIOS:
 *   PCA-01  PUT /api/profile/password → stale token rechazado; fresh token OK
 *   PCA-02  POST /api/admin/users/:id/reset-password → stale token de target rechazado
 *   PCA-03  POST /api/super-admin/reset-password → stale token de target rechazado
 *   PCA-04  PUT /api/guardian/profile/password → stale guardian token rechazado
 *   PCA-05  POST /api/auth/refresh no puede renovar token invalidado por cambio
 *   PCA-06  Token emitido DESPUÉS del cambio sigue funcionando — no invalida sesiones legítimas
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";
const PASS_OLD   = "OldPass123!";
const PASS_NEW   = "NewPass456!";

// ── IDs compartidos ───────────────────────────────────────────────────────────
let tenantId:    number;
let campusId:    number;
// Usuario auto-cambia contraseña (PCA-01)
let selfUserId:  number;
// Usuario objetivo del admin reset (PCA-02) y super-admin reset (PCA-03)
let targetUserId: number;
// Admin que ejecuta el reset (campus 48)
const adminUserId   = 80;   // admin.campus@jfr.edu.mx (seed demo)
// Guardian (PCA-04)
let guardianId: number;
const guardianEmail = `pca-guardian-${Date.now()}@test.invalid`;

// ── Helper: firmar token "antes del cambio" (iat = ahora − 60s) ──────────────
function staleUserToken(id: number, extra: object = {}) {
  const iat = Math.floor(Date.now() / 1000) - 60;
  return jwt.sign(
    { id, email: `user${id}@test.invalid`, role: "asistente",
      campus_id: campusId, tenant_id: tenantId, type: "user", iat },
    JWT_SECRET,
    { expiresIn: "24h" },
  );
}

function staleGuardianToken(id: number) {
  const iat = Math.floor(Date.now() / 1000) - 60;
  return jwt.sign(
    { id, email: guardianEmail, tenant_id: tenantId,
      campus_id: campusId, type: "guardian", iat },
    JWT_SECRET,
    { expiresIn: "4h" },
  );
}

// Token emitido DESPUÉS del cambio (iat = ahora + 1s)
function freshUserToken(id: number) {
  const iat = Math.floor(Date.now() / 1000) + 1;
  return jwt.sign(
    { id, email: `user${id}@test.invalid`, role: "asistente",
      campus_id: campusId, tenant_id: tenantId, type: "user", iat },
    JWT_SECRET,
    { expiresIn: "24h" },
  );
}

// Token de admin para ejecutar resets
function adminToken() {
  return jwt.sign(
    { id: adminUserId, email: "admin.campus@jfr.edu.mx",
      role: "administrador_campus", campus_id: campusId,
      tenant_id: tenantId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
}

// Token de super-admin para ejecutar super-admin reset
function superAdminToken() {
  return jwt.sign(
    { id: 1, email: "superadmin@edupay.mx",
      role: "super_admin", campus_id: campusId,
      tenant_id: tenantId, type: "user", is_super_admin: true },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
}

// Endpoint protegido sencillo para verificar que el token funciona/falla
// GET /api/users devuelve la lista de usuarios del campus — requiere authenticateToken.
async function probeProtected(token: string) {
  return fetch(`${BASE}/api/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// Endpoint protegido de guardian — GET /api/guardian/profile usa authenticateGuardian
async function probeGuardianProtected(token: string) {
  return fetch(`${BASE}/api/guardian/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  // Reutilizar campus 48 / tenant 29 del seed demo
  tenantId = 29;
  campusId = 48;

  const hash = await bcrypt.hash(PASS_OLD, 10);

  // Usuario self-change (PCA-01)
  const s = await pool.query(
    `INSERT INTO users (tenant_id, campus_id, email, password_hash, name, role, is_active)
     VALUES ($1,$2,$3,$4,'PCA SelfUser','asistente',true) RETURNING id`,
    [tenantId, campusId, `pca-self-${Date.now()}@test.invalid`, hash],
  );
  selfUserId = (s.rows[0] as any).id;

  // Usuario objetivo de admin/super-admin reset (PCA-02, PCA-03)
  const t = await pool.query(
    `INSERT INTO users (tenant_id, campus_id, email, password_hash, name, role, is_active)
     VALUES ($1,$2,$3,$4,'PCA TargetUser','asistente',true) RETURNING id`,
    [tenantId, campusId, `pca-target-${Date.now()}@test.invalid`, hash],
  );
  targetUserId = (t.rows[0] as any).id;

  // Guardian (PCA-04)
  const g = await pool.query(
    `INSERT INTO guardians
       (tenant_id, campus_id, correo_institucional_familiar, email,
        nombres, apellido_paterno, nombre_completo, password_hash, tipo_guardian)
     VALUES ($1,$2,$3,$3,'PCA','Guardian','PCA Guardian',$4,'padre') RETURNING id`,
    [tenantId, campusId, guardianEmail, hash],
  );
  guardianId = (g.rows[0] as any).id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM users    WHERE id IN ($1,$2)`, [selfUserId, targetUserId]);
  await pool.query(`DELETE FROM guardians WHERE id = $1`, [guardianId]);
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Invalidación de sesión tras cambio de contraseña (#138)", () => {

  // ── PCA-01: auto-cambio de contraseña ─────────────────────────────────────
  it("PCA-01 — PUT /api/profile/password: stale token rechazado; fresh token OK", async () => {
    const stale = staleUserToken(selfUserId);

    // Cambiar contraseña (fija password_changed_at = NOW())
    const chRes = await fetch(`${BASE}/api/profile/password`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${stale}` },
      // El stale token aún no está invalidado en este momento (no hubo cambio previo)
      body: JSON.stringify({ currentPassword: PASS_OLD, newPassword: PASS_NEW }),
    });
    expect(chRes.status, "El cambio de contraseña debería funcionar con stale token antes del primero").toBe(200);

    // Stale token debería quedar bloqueado ahora
    const probe = await probeProtected(stale);
    expect(probe.status, "Stale token rechazado tras cambio").toBe(401);
    const body = await probe.json();
    expect(body.code).toBe("SESSION_INVALIDATED");

    // Fresh token (iat > password_changed_at) debe funcionar
    const fresh = freshUserToken(selfUserId);
    const probe2 = await probeProtected(fresh);
    expect(probe2.status, "Fresh token aún funciona").not.toBe(401);
  });

  // ── PCA-02: admin force-reset ─────────────────────────────────────────────
  it("PCA-02 — POST /api/admin/users/:id/reset-password: stale token de target rechazado", async () => {
    const stale = staleUserToken(targetUserId);

    // Verificar que el stale token funciona ANTES del reset
    const before = await probeProtected(stale);
    expect(before.status, "Stale token OK antes del reset").not.toBe(401);

    // Admin ejecuta force-reset
    const resetRes = await fetch(`${BASE}/api/admin/users/${targetUserId}/reset-password`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken()}` },
      body:    JSON.stringify({}),
    });
    expect(resetRes.status, "Admin reset exitoso").toBe(200);

    // Stale token del target debe quedar bloqueado
    const after = await probeProtected(stale);
    expect(after.status, "Stale token bloqueado tras force-reset").toBe(401);
    const body = await after.json();
    expect(body.code).toBe("SESSION_INVALIDATED");
  });

  // ── PCA-03: super-admin reset ─────────────────────────────────────────────
  it("PCA-03 — POST /api/super-admin/reset-password: stale token de target rechazado", async () => {
    // Primero restaurar contraseña del target (dañada en PCA-02) para poder reusar el fixture.
    // Actualizar directamente en DB y resetear password_changed_at = null para que stale funcione.
    const freshHash = await bcrypt.hash(PASS_OLD, 10);
    await pool.query(
      `UPDATE users SET password_hash = $1, password_changed_at = NULL WHERE id = $2`,
      [freshHash, targetUserId],
    );

    const stale = staleUserToken(targetUserId);

    // Verificar que funciona antes del reset
    const before = await probeProtected(stale);
    expect(before.status, "Stale token OK antes del super-admin reset").not.toBe(401);

    // Super-admin reset
    const resetRes = await fetch(`${BASE}/api/super-admin/reset-password`, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:  `Bearer ${superAdminToken()}`,
      },
      body: JSON.stringify({ userId: targetUserId, newPassword: "SuperReset123!" }),
    });
    expect(resetRes.status, "Super-admin reset exitoso").toBe(200);

    // Stale token del target bloqueado
    const after = await probeProtected(stale);
    expect(after.status, "Stale token bloqueado tras super-admin reset").toBe(401);
    const body = await after.json();
    expect(body.code).toBe("SESSION_INVALIDATED");
  });

  // ── PCA-04: auto-cambio de contraseña de guardian ─────────────────────────
  it("PCA-04 — PUT /api/guardian/profile/password: stale guardian token rechazado", async () => {
    const stale = staleGuardianToken(guardianId);

    // Cambiar contraseña del guardian
    const chRes = await fetch(`${BASE}/api/guardian/profile/password`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${stale}` },
      body: JSON.stringify({ currentPassword: PASS_OLD, newPassword: PASS_NEW }),
    });
    // El stale token se usa para autenticarse en el momento del cambio (aún no invalidado)
    expect(chRes.status, "Cambio de contraseña de guardian OK").toBe(200);

    // Stale token bloqueado
    const probe = await probeGuardianProtected(stale);
    expect(probe.status, "Stale guardian token bloqueado").toBe(401);
    const body = await probe.json();
    expect(body.code).toBe("SESSION_INVALIDATED");
  });

  // ── PCA-05: refresh de token invalidado rechazado ─────────────────────────
  it("PCA-05 — POST /api/auth/refresh no renueva token invalidado por cambio de contraseña", async () => {
    // Asegurar que selfUserId tiene password_changed_at reciente (PCA-01 lo dejó así)
    // Firmar stale token para selfUserId
    const stale = staleUserToken(selfUserId);

    const res = await fetch(`${BASE}/api/auth/refresh`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${stale}` },
    });
    expect(res.status, "Refresh de token pre-cambio rechazado").toBe(401);
    const body = await res.json();
    expect(body.code).toBe("SESSION_INVALIDATED");
  });

  // ── PCA-06: token emitido después del cambio sigue funcionando ────────────
  it("PCA-06 — token emitido después del cambio no es invalidado (sesiones legítimas intactas)", async () => {
    // selfUserId ya tiene password_changed_at set por PCA-01
    const fresh = freshUserToken(selfUserId);

    const probe = await probeProtected(fresh);
    expect(probe.status, "Fresh token posterior al cambio funciona").not.toBe(401);
    // También debe poder refrescarse
    const refreshRes = await fetch(`${BASE}/api/auth/refresh`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${fresh}` },
    });
    expect(refreshRes.status, "Refresh de fresh token exitoso").toBe(200);
    const body = await refreshRes.json();
    expect(body).toHaveProperty("token");
  });

});
