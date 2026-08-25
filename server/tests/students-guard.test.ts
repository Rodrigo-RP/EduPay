/**
 * server/tests/students-guard.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AUDITORÍA SEGURIDAD — U09: Gestión de Usuarios
 * CONTROL: STU — Guard de módulo STUDENTS en endpoints de alumnos
 *
 * Patrón: reproduce → bloqueo (403) → control positivo (2xx) → verificación DB
 *
 * VULNERABILIDAD REPRODUCIDA (antes del fix):
 *   - GET  /api/students              → 200 para cualquier rol autenticado (sin guard)
 *   - POST /api/admin/students        → handler alcanzado sin permiso check (500/storage)
 *   - PATCH /api/admin/students/:id   → 200 para cualquier rol autenticado (sin guard)
 *   - POST /api/admin/students/import → 400 "sin archivo" (handler alcanzado, no 403)
 *
 * DECISIÓN DE ROLES (permissions.ts ROLE_PERMISSIONS, confirmada y extendida):
 *   administrador_general   → CREATE, READ, UPDATE, DELETE, IMPORT (+IMPORT añadido)
 *   administrador_campus    → CREATE, READ, UPDATE, IMPORT (+IMPORT añadido)
 *   admisiones              → CREATE, READ, UPDATE, IMPORT (ya tenía todos)
 *   asistente               → READ, UPDATE (secretaría: edita datos básicos; no crea)
 *   contador_general        → READ (necesita ver alumnos para reconciliar cargos)
 *   auxiliar_contable       → READ (ídem contador)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import { pool } from "../db";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

// ── Estado compartido ─────────────────────────────────────────────────────────

let tenantId    = 0;
let campusId    = 0;
let adminId     = 0;
let admisionesId = 0;
let asistenteId = 0;
let contadorId  = 0;
let auxiliarId  = 0;
let baseStudentId = 0;   // alumno pre-creado en DB para tests de PATCH
let createdByAdminId = 0;
let createdByAdmisionesId = 0;

const TS = Date.now().toString().slice(-7);

let tokenAdmin      = "";
let tokenAdmisiones = "";
let tokenAsistente  = "";
let tokenContador   = "";
let tokenAuxiliar   = "";

function makeToken(userId: number, role: string): string {
  return jwt.sign(
    { id: userId, email: `u${userId}@stu${TS}.test`, role,
      campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

const STUDENT_BODY = {
  nombres         : "AlumnoSTU",
  apellido_paterno: "Guard",
  apellido_materno: "Test",
  nivel_escolar   : "primaria",
  grado           : "1",
  grupo           : "A",
  turno           : "matutino",
  status          : "activo",
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const bcrypt = await import("bcrypt");
  const hash = await bcrypt.hash("TestGuard2025!", 10);

  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`STUGuard ${TS}`, `STG${TS}`]
  );
  tenantId = tRow.rows[0].id;

  const cRow = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1,$2) RETURNING id`,
    [tenantId, `Campus-STU-${TS}`]
  );
  campusId = cRow.rows[0].id;

  async function createUser(name: string, role: string, emailPrefix: string): Promise<number> {
    const r = await pool.query(
      `INSERT INTO users
         (tenant_id, campus_id, name, email, password_hash, role, is_active, custom_permissions)
       VALUES ($1,$2,$3,$4,$5,$6,true,'{}') RETURNING id`,
      [tenantId, campusId, name,
       `${emailPrefix}.${TS}@stu.test`, hash, role]
    );
    return r.rows[0].id as number;
  }

  adminId      = await createUser("Admin STU",      "administrador_campus", "admin");
  admisionesId = await createUser("Admisiones STU", "admisiones",           "admis");
  asistenteId  = await createUser("Asistente STU",  "asistente",            "asist");
  contadorId   = await createUser("Contador STU",   "contador_general",     "cont");
  auxiliarId   = await createUser("Auxiliar STU",   "auxiliar_contable",    "aux");

  tokenAdmin      = makeToken(adminId,      "administrador_campus");
  tokenAdmisiones = makeToken(admisionesId, "admisiones");
  tokenAsistente  = makeToken(asistenteId,  "asistente");
  tokenContador   = makeToken(contadorId,   "contador_general");
  tokenAuxiliar   = makeToken(auxiliarId,   "auxiliar_contable");

  // Alumno base para tests de PATCH y GET — creado vía API para que Drizzle
  // resuelva el orden real de columnas (INSERT SQL directo falla si la DB tiene
  // columnas NOT NULL que no refleja el schema TypeScript).
  const sResp = await fetch(`${BASE}/api/admin/students`, {
    method : "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenAdmin}` },
    body   : JSON.stringify({
      nombres          : "Base",
      apellido_paterno : "Alumno",
      apellido_materno : "STUTest",
      nivel_escolar    : "primaria",
      grado            : "1",
      grupo            : "A",
      turno            : "matutino",
      status           : "activo",
    }),
  });
  if (!sResp.ok) {
    const txt = await sResp.text();
    throw new Error(`beforeAll: no se pudo crear alumno base (${sResp.status}): ${txt}`);
  }
  const sJson = await sResp.json();
  baseStudentId = sJson.id;
});

// ── Teardown ──────────────────────────────────────────────────────────────────

afterAll(async () => {
  if (!tenantId) return;
  await pool.query(`DELETE FROM students WHERE tenant_id = $1`, [tenantId]).catch(() => {});
  await pool.query(`DELETE FROM users    WHERE tenant_id = $1`, [tenantId]).catch(() => {});
  await pool.query(`DELETE FROM campuses WHERE tenant_id = $1`, [tenantId]).catch(() => {});
  await pool.query(`DELETE FROM tenants  WHERE id = $1`,        [tenantId]).catch(() => {});
});

// ── Helpers HTTP ──────────────────────────────────────────────────────────────

async function postStudent(token: string) {
  return fetch(`${BASE}/api/admin/students`, {
    method : "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body   : JSON.stringify(STUDENT_BODY),
  });
}

async function patchStudent(token: string, id: number, body = { grupo: "B" }) {
  return fetch(`${BASE}/api/admin/students/${id}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body   : JSON.stringify(body),
  });
}

async function getStudents(token: string, path = "/api/students") {
  return fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function importStudents(token: string, withFile = false) {
  const fd = new FormData();
  if (withFile) {
    const csv = [
      "Nombre Completo,Nombres,Apellido Paterno,Apellido Materno,Nivel,Grado,Grupo,Turno",
      "Test Import,Import,Prueba,STU,primaria,1,A,matutino",
    ].join("\n");
    fd.append("file", new Blob([csv], { type: "text/csv" }), "students.csv");
  }
  return fetch(`${BASE}/api/admin/students/import`, {
    method : "POST",
    headers: { Authorization: `Bearer ${token}` },
    body   : fd,
  });
}

async function countStudents(): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*) AS n FROM students WHERE tenant_id = $1`, [tenantId]
  );
  return Number(r.rows[0].n);
}

// ═══════════════════════════════════════════════════════════════════════════════
describe("STU — Guard MODULES.STUDENTS en endpoints de alumnos", () => {

  // ────────────────────────────────────────────────────────────────────────────
  describe("BLOQUEO (403) — roles sin el permiso de módulo requerido", () => {

    it("STU-01: contador_general POST create → 403, DB sin cambio", async () => {
      const before = await countStudents();
      const resp   = await postStudent(tokenContador);
      expect(resp.status, `got ${resp.status}: ${await resp.clone().text()}`).toBe(403);
      const body = await resp.json();
      expect(body.message).toMatch(/permiso/i);
      expect(await countStudents()).toBe(before);  // DB intacta
    });

    it("STU-02: contador_general PATCH update → 403, DB sin cambio", async () => {
      const before = await pool.query(
        `SELECT grupo FROM students WHERE id = $1`, [baseStudentId]
      );
      const resp = await patchStudent(tokenContador, baseStudentId);
      expect(resp.status, `got ${resp.status}`).toBe(403);
      // DB sin cambio
      const after = await pool.query(
        `SELECT grupo FROM students WHERE id = $1`, [baseStudentId]
      );
      expect(after.rows[0].grupo).toBe(before.rows[0].grupo);
    });

    it("STU-03: contador_general IMPORT → 403 (guard antes del check de archivo)", async () => {
      const resp = await importStudents(tokenContador); // sin archivo
      expect(resp.status, `got ${resp.status}`).toBe(403);
      // Confirmar que no es el error "sin archivo" (400) — el guard disparó antes
      const body = await resp.json();
      expect(body.message).not.toContain("No se proporcionó archivo");
    });

    it("STU-04: auxiliar_contable POST create → 403 (tiene READ, no CREATE)", async () => {
      const resp = await postStudent(tokenAuxiliar);
      expect(resp.status).toBe(403);
    });

    it("STU-05: auxiliar_contable PATCH update → 403 (tiene READ, no UPDATE)", async () => {
      const resp = await patchStudent(tokenAuxiliar, baseStudentId);
      expect(resp.status).toBe(403);
    });

    it("STU-06: auxiliar_contable IMPORT → 403", async () => {
      const resp = await importStudents(tokenAuxiliar);
      expect(resp.status).toBe(403);
    });

    it("STU-07: asistente POST create → 403 (tiene READ+UPDATE, no CREATE)", async () => {
      const resp = await postStudent(tokenAsistente);
      expect(resp.status).toBe(403);
    });

    it("STU-08: asistente IMPORT → 403 (tiene READ+UPDATE, no IMPORT)", async () => {
      const resp = await importStudents(tokenAsistente);
      expect(resp.status).toBe(403);
    });

  });

  // ────────────────────────────────────────────────────────────────────────────
  describe("CONTROL POSITIVO (2xx) — roles con el permiso correcto", () => {

    it("STU-09: administrador_campus GET /api/students → 200, array", async () => {
      const resp = await getStudents(tokenAdmin);
      expect(resp.status).toBe(200);
      expect(Array.isArray(await resp.json())).toBe(true);
    });

    it("STU-10: administrador_campus GET /api/admin/students → 200", async () => {
      const resp = await getStudents(tokenAdmin, "/api/admin/students");
      expect(resp.status).toBe(200);
    });

    it("STU-11: administrador_campus POST create → 201, alumno existe en DB", async () => {
      const before = await countStudents();
      const resp   = await postStudent(tokenAdmin);
      expect(resp.status, `got ${resp.status}: ${await resp.clone().text()}`).toBe(201);
      const body = await resp.json();
      createdByAdminId = body.id;
      // Verificación DB: alumno realmente creado
      expect(await countStudents()).toBe(before + 1);
      const row = await pool.query(
        `SELECT tenant_id FROM students WHERE id = $1`, [createdByAdminId]
      );
      expect(Number(row.rows[0].tenant_id)).toBe(tenantId);
    });

    it("STU-12: administrador_campus PATCH update → 200, cambio refleja en DB", async () => {
      const resp = await patchStudent(tokenAdmin, baseStudentId, { grupo: "C" });
      expect(resp.status, `got ${resp.status}: ${await resp.clone().text()}`).toBe(200);
      const row = await pool.query(
        `SELECT grupo FROM students WHERE id = $1`, [baseStudentId]
      );
      expect(row.rows[0].grupo).toBe("C");
    });

    it("STU-12A: PATCH rechaza explícitamente campos fuera del schema estricto", async () => {
      const before = await pool.query(
        `SELECT campus_id, tenant_id, grupo FROM students WHERE id = $1`,
        [baseStudentId]
      );

      const resp = await patchStudent(tokenAdmin, baseStudentId, {
        campus_id: 999999,
        tenant_id: 999999,
        role: "administrador_general",
      });
      const body = await resp.json();

      expect(resp.status, `got ${resp.status}: ${JSON.stringify(body)}`).toBe(400);
      expect(body.message).toMatch(/campus_id/);
      expect(body.message).toMatch(/tenant_id/);
      expect(body.message).toMatch(/role/);

      const after = await pool.query(
        `SELECT campus_id, tenant_id, grupo FROM students WHERE id = $1`,
        [baseStudentId]
      );
      expect(after.rows[0]).toEqual(before.rows[0]);
    });

    it("STU-13: administrador_campus IMPORT con CSV → NO 403 (guard pasa, resultado variable)", async () => {
      const resp = await importStudents(tokenAdmin, true);
      const status = resp.status;
      expect(status, `guard bloqueó con 403`).not.toBe(403);
      // 200 = éxito; 400 = CSV malformado; 500 = error de storage — todos son aceptables
    });

    it("STU-14: admisiones GET /api/students → 200", async () => {
      const resp = await getStudents(tokenAdmisiones);
      expect(resp.status).toBe(200);
    });

    it("STU-15: admisiones POST create → 201, alumno existe en DB", async () => {
      const before = await countStudents();
      const resp   = await postStudent(tokenAdmisiones);
      expect(resp.status, `got ${resp.status}: ${await resp.clone().text()}`).toBe(201);
      const body = await resp.json();
      createdByAdmisionesId = body.id;
      expect(await countStudents()).toBe(before + 1);
      const row = await pool.query(
        `SELECT id FROM students WHERE id = $1`, [createdByAdmisionesId]
      );
      expect(row.rows[0]).toBeDefined();
    });

    it("STU-16: admisiones PATCH update → 200", async () => {
      const resp = await patchStudent(tokenAdmisiones, baseStudentId, { grupo: "D" });
      expect(resp.status, `got ${resp.status}: ${await resp.clone().text()}`).toBe(200);
    });

    it("STU-17: admisiones IMPORT → NO 403 (tiene STUDENTS.IMPORT)", async () => {
      const resp = await importStudents(tokenAdmisiones, true);
      expect(resp.status).not.toBe(403);
    });

    it("STU-18: asistente GET /api/students → 200 (tiene READ)", async () => {
      const resp = await getStudents(tokenAsistente);
      expect(resp.status).toBe(200);
    });

    it("STU-19: asistente PATCH update → 200 (tiene UPDATE — secretaría corrige datos)", async () => {
      const resp = await patchStudent(tokenAsistente, baseStudentId, { grupo: "E" });
      expect(resp.status, `got ${resp.status}: ${await resp.clone().text()}`).toBe(200);
    });

    it("STU-20: auxiliar_contable GET /api/students → 200 (tiene READ)", async () => {
      const resp = await getStudents(tokenAuxiliar);
      expect(resp.status).toBe(200);
    });

    it("STU-21: contador_general GET /api/students → 200 (tiene READ)", async () => {
      const resp = await getStudents(tokenContador);
      expect(resp.status).toBe(200);
    });

  });

  // ────────────────────────────────────────────────────────────────────────────
  describe("REPRODUCCIÓN CERRADA — antes era 2xx/500, ahora es 403", () => {

    it("STU-22: contador_general POST → 403 (era 500 sin guard — handler alcanzado sin permiso)", async () => {
      const resp = await postStudent(tokenContador);
      expect(resp.status).toBe(403);
    });

    it("STU-23: contador_general IMPORT sin archivo → 403 (era 400 — handler alcanzado sin permiso)", async () => {
      const resp = await importStudents(tokenContador);
      expect(resp.status).toBe(403);
      const body = await resp.json();
      // El guard dispara antes del check de archivo
      expect(body.message).not.toContain("No se proporcionó archivo");
    });

    it("STU-24: auxiliar_contable PATCH → 403 (era 200/sin guard)", async () => {
      const resp = await patchStudent(tokenAuxiliar, baseStudentId);
      expect(resp.status).toBe(403);
    });

  });

});
