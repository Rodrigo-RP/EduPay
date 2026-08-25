/**
 * rpt02-campus-isolation.test.ts — #181 campus isolation (empírico + regresión)
 *
 * VULNERABILIDAD ANTES DEL FIX (frontend):
 *   La página de Estudiantes llamaba a:
 *     GET /api/admin/students/1/export?format=xlsx
 *   campusId=1 estaba HARDCODEADO en la URL.
 *   El backend (R4) extraía el campusId de req.params, no del JWT:
 *     const campusId = parseInt(req.params.campusId);
 *   checkCampusTenant(campusId, req.user.tenant_id) PASA si ambos campus
 *   pertenecen al mismo tenant → un admin de campus 2 recibía el padrón
 *   de campus 1.
 *
 * ESTADO ACTUAL (post RPT-02):
 *   R4 fue eliminado del servidor en el commit e489745.
 *   La URL /api/admin/students/:id/export ya no tiene handler → SPA fallback.
 *
 * FIX (frontend, #181):
 *   handleExport ahora llama a POST /api/reportes/estudiantes/exportar.
 *   campus_id tomado SIEMPRE del JWT; no hay parámetro de campus en la URL.
 *
 * Tests:
 *   ISO-01  R4 dead: GET /api/admin/students/CAMPUS1/export no devuelve xlsx
 *           con token de campus2 (ruta vulnerable ya no existe)
 *   ISO-02  Nuevo GET: admin campus2 recibe solo sus alumnos (JSON)
 *   ISO-03  Nuevo GET: admin campus2 NO recibe alumnos de campus1
 *   ISO-04  Nuevo POST export: campus2 token → xlsx válido (magic bytes)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

const TS = Date.now().toString().slice(-7);

let tenantId:  number;
let campus1Id: number;
let campus2Id: number;
let s1aId: number; // alumno en campus1  (marker C1)
let s1bId: number; // alumno en campus1  (marker C1)
let s2aId: number; // alumno en campus2  (marker C2)
let s2bId: number; // alumno en campus2  (marker C2)

// Token sin user.id para no disparar FK en audit_log
const makeTok = (campusId: number) =>
  jwt.sign(
    { role: "administrador_campus", campus_id: campusId, tenant_id: tenantId },
    JWT_SECRET,
    { expiresIn: "1h" },
  );

let tokCampus1: string;
let tokCampus2: string;

// ── beforeAll ─────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant ISO ${TS}`, `ISO${TS}`],
  );
  tenantId = (tRow.rows[0] as any).id;

  const c1Row = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus1 ISO${TS}`, tenantId],
  );
  campus1Id = (c1Row.rows[0] as any).id;

  const c2Row = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus2 ISO${TS}`, tenantId],
  );
  campus2Id = (c2Row.rows[0] as any).id;

  // Tokens disponibles DESPUÉS de conocer los IDs
  tokCampus1 = makeTok(campus1Id);
  tokCampus2 = makeTok(campus2Id);

  const insertStudent = async (
    campusId: number,
    marker: string,
  ): Promise<number> => {
    const r = await pool.query(
      `INSERT INTO students
         (nombres, apellido_paterno, nombre_completo,
          campus_id, tenant_id, id_referencia, status, grado)
       VALUES ($1,$2,$3,$4,$5,$6,'activo','1°')
       RETURNING id`,
      [
        marker, `ISO${TS}`, `${marker} ISO${TS}`,
        campusId, tenantId, `${TS}-${marker.slice(0, 4)}`,
      ],
    );
    return (r.rows[0] as any).id as number;
  };

  s1aId = await insertStudent(campus1Id, "C1Alumno1");
  s1bId = await insertStudent(campus1Id, "C1Alumno2");
  s2aId = await insertStudent(campus2Id, "C2Alumno1");
  s2bId = await insertStudent(campus2Id, "C2Alumno2");
});

// ── afterAll ──────────────────────────────────────────────────────────────────

afterAll(async () => {
  for (const id of [s1aId, s1bId, s2aId, s2bId]) {
    if (id) await pool.query(`DELETE FROM students WHERE id=$1`, [id]).catch(() => {});
  }
  if (campus1Id) await pool.query(`DELETE FROM campuses WHERE id=$1`, [campus1Id]).catch(() => {});
  if (campus2Id) await pool.query(`DELETE FROM campuses WHERE id=$1`, [campus2Id]).catch(() => {});
  if (tenantId)  await pool.query(`DELETE FROM tenants  WHERE id=$1`, [tenantId]).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("#181 campus isolation — ANTES (R4 eliminado) + DESPUÉS (RPT-02 aislado)", () => {

  // ── ANTES: ruta vulnerable ya no existe ──────────────────────────────────────

  it("ISO-01: ANTES — GET /api/admin/students/:campus1Id/export NO devuelve xlsx (R4 eliminado)", async () => {
    /**
     * En el sistema anterior, un admin de campus2 podía llamar:
     *   GET /api/admin/students/<campus1Id>/export
     * y recibir el padrón de campus1 (mismo tenant, R4 no filtraba por JWT).
     *
     * Ahora el endpoint R4 no existe; Express devuelve el HTML del SPA.
     * La garantía: la respuesta NO es xlsx ni octet-stream.
     */
    const r = await fetch(
      `${BASE}/api/admin/students/${campus1Id}/export`,
      { headers: { Authorization: `Bearer ${tokCampus2}` } },
    );
    const ct = r.headers.get("content-type") ?? "";
    // Si fuera xlsx, el Content-Type contendría spreadsheetml
    expect(ct).not.toContain("spreadsheetml");
    expect(ct).not.toContain("octet-stream");
  });

  // ── DESPUÉS: nuevo endpoint aislado por JWT ───────────────────────────────────

  it("ISO-02: DESPUÉS — admin campus2 recibe sus 2 alumnos y solo ellos (GET JSON)", async () => {
    const r = await fetch(`${BASE}/api/reportes/estudiantes`, {
      headers: { Authorization: `Bearer ${tokCampus2}` },
    });
    expect(r.status).toBe(200);
    const body = await r.json();

    // Solo alumnos de campus2 que creamos en este fixture
    const fixtureC2 = (body.students as any[]).filter(
      (s) => s.nombre_completo?.includes(`ISO${TS}`) && s.nombre_completo?.includes("C2"),
    );
    expect(fixtureC2).toHaveLength(2);
  });

  it("ISO-03: DESPUÉS — admin campus2 NO recibe alumnos de campus1 (aislamiento confirmado)", async () => {
    const r = await fetch(`${BASE}/api/reportes/estudiantes`, {
      headers: { Authorization: `Bearer ${tokCampus2}` },
    });
    expect(r.status).toBe(200);
    const body = await r.json();

    // Alumnos C1 del fixture NO deben aparecer con token de campus2
    const leakedC1 = (body.students as any[]).filter(
      (s) => s.nombre_completo?.includes(`ISO${TS}`) && s.nombre_completo?.includes("C1"),
    );
    expect(leakedC1).toHaveLength(0);
  });

  it("ISO-04: DESPUÉS — export xlsx campus2 → 200 + magic bytes ZIP válidos", async () => {
    const r = await fetch(`${BASE}/api/reportes/estudiantes/exportar`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokCampus2}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ formato: "excel" }),
    });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("spreadsheetml");
    const buf = Buffer.from(await r.arrayBuffer());
    expect(buf[0]).toBe(0x50); // 'P'
    expect(buf[1]).toBe(0x4b); // 'K'
    expect(buf[2]).toBe(0x03);
    expect(buf[3]).toBe(0x04);
    expect(buf.length).toBeGreaterThan(1000);
  }, 20_000);
});
