/**
 * server/tests/families-guard.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AUDITORÍA SEGURIDAD — U09: Gestión de Usuarios
 * CONTROL: FAM — Guards de módulo FAMILIES/CHARGES en endpoints de tutores
 *
 * Endpoints protegidos por este CF:
 *   GET  /api/admin/guardians/:campusId              → FAMILIES.READ
 *   GET  /api/admin/students/:id/guardians           → FAMILIES.READ
 *   PATCH /api/admin/students/:id/guardians/:gid     → FAMILIES.UPDATE
 *   GET  /api/students/:id/estado-cuenta             → CHARGES.READ
 *
 * VULNERABILIDAD REPRODUCIDA (antes del fix):
 *   - Cualquier usuario autenticado podía leer y modificar tutores/responsabilidades
 *     sin restricción de módulo (contador podía reasignar quién paga).
 *
 * DECISIÓN DE ROLES (permissions.ts ROLE_PERMISSIONS):
 *   FAMILIES.READ    → todos los roles estándar (admin_general, admin_campus,
 *                       admisiones, asistente, contador_general, auxiliar_contable)
 *   FAMILIES.UPDATE  → admin_general, admin_campus, admisiones, asistente
 *                       BLOQUEADOS: contador_general, auxiliar_contable
 *   CHARGES.READ     → todos los roles estándar
 *   CHARGES.READ bloqueado por rol no registrado: role = "rol_sin_permisos"
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import { pool } from "../db";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── Estado compartido ─────────────────────────────────────────────────────────

let tenantId     = 0;
let campusId     = 0;
let adminId      = 0;
let contadorId   = 0;
let auxiliarId   = 0;
let admisionesId = 0;
let asistenteId  = 0;

const TS = Date.now().toString().slice(-7);

let tokenAdmin      = "";
let tokenContador   = "";
let tokenAuxiliar   = "";
let tokenAdmisiones = "";
let tokenAsistente  = "";
let tokenSinPermisos = "";   // rol no registrado → guard retorna false

const FAKE_STUDENT_ID  = 999999;
const FAKE_GUARDIAN_ID = 999999;

function makeToken(userId: number, role: string): string {
  return jwt.sign(
    { id: userId, email: `u${userId}@fam${TS}.test`, role,
      campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const bcrypt = await import("bcrypt");
  const hash   = await bcrypt.hash("TestFAM2025!", 10);

  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`FAMGuard ${TS}`, `FAM${TS}`]
  );
  tenantId = tRow.rows[0].id;

  const cRow = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1,$2) RETURNING id`,
    [tenantId, `Campus-FAM-${TS}`]
  );
  campusId = cRow.rows[0].id;

  async function createUser(name: string, role: string, prefix: string): Promise<number> {
    const r = await pool.query(
      `INSERT INTO users
         (tenant_id, campus_id, name, email, password_hash, role, is_active, custom_permissions)
       VALUES ($1,$2,$3,$4,$5,$6,true,'{}') RETURNING id`,
      [tenantId, campusId, name, `${prefix}.${TS}@fam.test`, hash, role]
    );
    return r.rows[0].id as number;
  }

  adminId      = await createUser("Admin FAM",      "administrador_campus", "admin");
  contadorId   = await createUser("Contador FAM",   "contador_general",     "cont");
  auxiliarId   = await createUser("Auxiliar FAM",   "auxiliar_contable",    "aux");
  admisionesId = await createUser("Admis FAM",      "admisiones",           "admis");
  asistenteId  = await createUser("Asist FAM",      "asistente",            "asist");

  tokenAdmin       = makeToken(adminId,      "administrador_campus");
  tokenContador    = makeToken(contadorId,   "contador_general");
  tokenAuxiliar    = makeToken(auxiliarId,   "auxiliar_contable");
  tokenAdmisiones  = makeToken(admisionesId, "admisiones");
  tokenAsistente   = makeToken(asistenteId,  "asistente");
  // rol no registrado en ROLE_PERMISSIONS → hasPermission siempre false
  tokenSinPermisos = makeToken(adminId, "rol_sin_permisos_inventado");
});

// ── Teardown ──────────────────────────────────────────────────────────────────

afterAll(async () => {
  if (!tenantId) return;
  await pool.query(`DELETE FROM users    WHERE tenant_id = $1`, [tenantId]).catch(() => {});
  await pool.query(`DELETE FROM campuses WHERE tenant_id = $1`, [tenantId]).catch(() => {});
  await pool.query(`DELETE FROM tenants  WHERE id = $1`,        [tenantId]).catch(() => {});
});

// ── Helpers HTTP ──────────────────────────────────────────────────────────────

function getGuardians(token: string) {
  return fetch(`${BASE}/api/admin/guardians/${campusId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

function getStudentGuardians(token: string, studentId = FAKE_STUDENT_ID) {
  return fetch(`${BASE}/api/admin/students/${studentId}/guardians`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

function patchStudentGuardian(
  token: string,
  studentId = FAKE_STUDENT_ID,
  guardianId = FAKE_GUARDIAN_ID,
) {
  return fetch(`${BASE}/api/admin/students/${studentId}/guardians/${guardianId}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body   : JSON.stringify({ es_responsable_pago: true }),
  });
}

function getEstadoCuenta(token: string, studentId = FAKE_STUDENT_ID) {
  return fetch(`${BASE}/api/students/${studentId}/estado-cuenta`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FAM — Guards FAMILIES/CHARGES en endpoints de tutores", () => {

  // ──────────────────────────────────────────────────────────────────────────
  describe("BLOQUEO (403) — FAMILIES.UPDATE requerido para PATCH", () => {

    it("FAM-01: contador_general PATCH student-guardian → 403 (tiene READ, no UPDATE)", async () => {
      const resp = await patchStudentGuardian(tokenContador);
      expect(resp.status).toBe(403);
      const body = await resp.json();
      expect(body.message).toContain("permisos");
    });

    it("FAM-02: auxiliar_contable PATCH student-guardian → 403 (tiene READ, no UPDATE)", async () => {
      const resp = await patchStudentGuardian(tokenAuxiliar);
      expect(resp.status).toBe(403);
      const body = await resp.json();
      expect(body.message).toContain("permisos");
    });

    it("FAM-03: sin token PATCH → 401", async () => {
      const resp = await fetch(
        `${BASE}/api/admin/students/${FAKE_STUDENT_ID}/guardians/${FAKE_GUARDIAN_ID}`,
        { method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ es_responsable_pago: true }) }
      );
      expect(resp.status).toBe(401);
    });

  });

  // ──────────────────────────────────────────────────────────────────────────
  describe("BLOQUEO (403) — rol no registrado → sin FAMILIES.READ ni CHARGES.READ", () => {

    it("FAM-04: rol_sin_permisos GET /api/admin/guardians/:campusId → 403", async () => {
      const resp = await getGuardians(tokenSinPermisos);
      expect(resp.status).toBe(403);
    });

    it("FAM-05: rol_sin_permisos GET /api/admin/students/:id/guardians → 403", async () => {
      const resp = await getStudentGuardians(tokenSinPermisos);
      expect(resp.status).toBe(403);
    });

    it("FAM-06: rol_sin_permisos GET /api/students/:id/estado-cuenta → 403", async () => {
      const resp = await getEstadoCuenta(tokenSinPermisos);
      expect(resp.status).toBe(403);
    });

    it("FAM-07: rol_sin_permisos PATCH student-guardian → 403", async () => {
      const resp = await patchStudentGuardian(tokenSinPermisos);
      expect(resp.status).toBe(403);
    });

  });

  // ──────────────────────────────────────────────────────────────────────────
  describe("CONTROL POSITIVO (2xx/404) — guard pasa para roles con permiso", () => {

    it("FAM-08: administrador_campus GET /api/admin/guardians/:campusId → 200 (FAMILIES.READ)", async () => {
      const resp = await getGuardians(tokenAdmin);
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it("FAM-09: admisiones GET /api/admin/guardians/:campusId → 403 (FAMILIES.READ eliminado)", async () => {
      const resp = await getGuardians(tokenAdmisiones);
      expect(resp.status).toBe(403);
    });

    it("FAM-10: asistente GET /api/admin/guardians/:campusId → 200 (FAMILIES.READ)", async () => {
      const resp = await getGuardians(tokenAsistente);
      expect(resp.status).toBe(200);
    });

    it("FAM-11: contador_general GET /api/admin/students/:id/guardians → 200/404 (FAMILIES.READ)", async () => {
      const resp = await getStudentGuardians(tokenContador);
      // 200 si el alumno existe, 404 si no — ambos prueban que el guard pasó
      expect([200, 404]).toContain(resp.status);
    });

    it("FAM-12: auxiliar_contable GET /api/admin/students/:id/guardians → 200/404 (FAMILIES.READ)", async () => {
      const resp = await getStudentGuardians(tokenAuxiliar);
      expect([200, 404]).toContain(resp.status);
    });

    it("FAM-13: admisiones GET /api/students/:id/estado-cuenta → 200/404 (CHARGES.READ)", async () => {
      const resp = await getEstadoCuenta(tokenAdmisiones);
      expect([200, 404]).toContain(resp.status);
    });

    it("FAM-14: asistente GET /api/students/:id/estado-cuenta → 200/404 (CHARGES.READ)", async () => {
      const resp = await getEstadoCuenta(tokenAsistente);
      expect([200, 404]).toContain(resp.status);
    });

    it("FAM-15: admisiones PATCH student-guardian → 404 (FAMILIES.UPDATE pasa, alumno ficticio)", async () => {
      const resp = await patchStudentGuardian(tokenAdmisiones);
      // Guard pasa → handler busca el alumno → 404 (ID ficticio)
      expect(resp.status).toBe(404);
      expect(resp.status).not.toBe(403);
    });

    it("FAM-16: asistente PATCH student-guardian → 404 (FAMILIES.UPDATE pasa)", async () => {
      const resp = await patchStudentGuardian(tokenAsistente);
      expect(resp.status).toBe(404);
      expect(resp.status).not.toBe(403);
    });

    it("FAM-17: administrador_campus PATCH student-guardian → 404 (guard pasa)", async () => {
      const resp = await patchStudentGuardian(tokenAdmin);
      expect(resp.status).toBe(404);
      expect(resp.status).not.toBe(403);
    });

  });

  // ──────────────────────────────────────────────────────────────────────────
  describe("REPRODUCCIÓN CERRADA — antes era 200, ahora es 403", () => {

    it("FAM-18: contador_general podía antes hacer PATCH de responsable_pago — ahora 403", async () => {
      const resp = await patchStudentGuardian(tokenContador);
      expect(resp.status).toBe(403);
    });

    it("FAM-19: auxiliar_contable podía antes hacer PATCH de responsable_pago — ahora 403", async () => {
      const resp = await patchStudentGuardian(tokenAuxiliar);
      expect(resp.status).toBe(403);
    });

  });

});
