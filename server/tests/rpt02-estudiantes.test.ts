/**
 * rpt02-estudiantes.test.ts — RPT-02 Reporte de Estudiantes
 *
 * GET  /api/reportes/estudiantes          — MODULES.REPORTS / ACTIONS.READ
 * POST /api/reportes/estudiantes/exportar — MODULES.REPORTS / ACTIONS.EXPORT
 *
 * Fixture:
 *   tenant + campus
 *
 *   Alumnos:
 *     s1  nombre='Alumno A EST_TS'  nivel='Primaria'   grado='3° PRIMARIA'  grupo='A'  activo
 *     s2  nombre='Alumno B EST_TS'  nivel='Secundaria' grado='1° SECUND'    grupo='B'  activo
 *     s3  nombre='Alumno C EST_TS'  nivel='Primaria'   grado='3° PRIMARIA'  grupo='B'  baja
 *
 *   Cargos:
 *     cA  s1  ciclo='2025-2026'
 *     cB  s2  ciclo='2025-2026'
 *     cC  s3  ciclo='2024-2025'
 *
 *   Tutores:
 *     g1  es_responsable_pago=true   → s1   ← debe aparecer en tutor_principal
 *     g2  es_responsable_pago=false  → s1   ← NO debe aparecer (solo g1)
 *     g3  es_responsable_pago=true   → s2
 *     (s3 sin tutores)
 *
 * Tests:
 *   RES-01  sin token GET → 401
 *   RES-02  asistente GET → 200  (REPORTS.READ es universal)
 *   RES-03  administrador_campus → 200 + estructura completa
 *   RES-04  sin filtros → al menos 3 estudiantes del fixture
 *   RES-05  filtro estado='activo' → s1 y s2 (s3 excluido)
 *   RES-06  filtro estado='baja'   → solo s3
 *   RES-07  filtro nivel='Primaria' → s1 y s3
 *   RES-08  filtro grado='3° PRIMARIA' → s1 y s3
 *   RES-09  filtro grupo='A' → solo s1
 *   RES-10  filtro ciclo='2025-2026' → s1 y s2 (s3 excluido)
 *   RES-11  filtro ciclo='2024-2025' → solo s3
 *   RES-12  tutor_principal de s1 = nombre de g1 (es_responsable_pago=true)
 *   RES-13  tutor_principal de s1 ≠ nombre de g2 (es_responsable_pago=false)
 *   RES-14  tutor_principal de s3 = null (sin tutores)
 *   RES-15  ciclo_escolar de s1 (sin filtro ciclo) = '2025-2026'
 *   RES-16  ciclo_escolar de s1 (filtro ciclo='2025-2026') = '2025-2026'
 *   RES-17  sin token POST exportar → 401
 *   RES-18  asistente POST exportar → 403
 *   RES-19  administrador_campus exportar excel → 200 + magic bytes .xlsx
 *   RES-20  administrador_campus exportar pdf  → 200 + magic bytes %PDF
 *   RES-21  formato inválido → 400
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── helpers HTTP ──────────────────────────────────────────────────────────────

async function get(path: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { headers });
  const ct = r.headers.get("content-type") ?? "";
  const body = ct.includes("application/json")
    ? await r.json().catch(() => ({}))
    : await r.text();
  return { status: r.status, body };
}

async function post(path: string, token: string | undefined, data: object) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
}

// ── fixture state ─────────────────────────────────────────────────────────────

const TS = Date.now().toString().slice(-7);

let tenantId:  number;
let campusId:  number;
let s1Id: number;
let s2Id: number;
let s3Id: number;
let conceptId: number;
let cAId: number;
let cBId: number;
let cCId: number;
let g1Id: number;
let g2Id: number;
let g3Id: number;
let g1Name: string;
let g2Name: string;

// Tokens sin id real (evita FK en audit_log)
const makeToken = (role: string) =>
  jwt.sign(
    { role, campus_id: campusId, tenant_id: tenantId },
    JWT_SECRET,
    { expiresIn: "1h" },
  );

let tokAsistente:   string;
let tokAdminCampus: string;

// ── beforeAll ─────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Tenant + campus
  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant EST ${TS}`, `EST${TS}`],
  );
  tenantId = (tRow.rows[0] as any).id;

  const cRow = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus EST ${TS}`, tenantId],
  );
  campusId = (cRow.rows[0] as any).id;

  tokAsistente   = makeToken("asistente");
  tokAdminCampus = makeToken("administrador_campus");

  // Alumnos
  const insertStudent = async (
    nombres: string,
    apellido: string,
    nivel: string,
    grado: string,
    grupo: string,
    status: string,
  ): Promise<number> => {
    const r = await pool.query(
      `INSERT INTO students
         (nombres, apellido_paterno, nombre_completo,
          campus_id, tenant_id, id_referencia,
          nivel_escolar, grado, grupo, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        nombres, apellido,
        `${nombres} ${apellido}`,
        campusId, tenantId,
        `${TS}-${apellido.slice(0, 3)}`,
        nivel, grado, grupo, status,
      ],
    );
    return (r.rows[0] as any).id as number;
  };

  s1Id = await insertStudent("Alumno A",  `EST${TS}`, "Primaria",   "3° PRIMARIA", "A", "activo");
  s2Id = await insertStudent("Alumno B",  `EST${TS}`, "Secundaria", "1° SECUND",   "B", "activo");
  s3Id = await insertStudent("Alumno C",  `EST${TS}`, "Primaria",   "3° PRIMARIA", "B", "baja");

  // Concepto para los cargos
  const coRow = await pool.query(
    `INSERT INTO concepts
       (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1,$2,$3,'colegiatura','mensual',100000) RETURNING id`,
    [campusId, tenantId, `Cuota EST${TS}`],
  );
  conceptId = (coRow.rows[0] as any).id;

  // Cargos (para asignar ciclo_escolar a cada alumno)
  const insertCharge = async (
    studentId: number,
    ciclo: string,
  ): Promise<number> => {
    const r = await pool.query(
      `INSERT INTO charges
         (tenant_id, student_id, concept_id,
          ciclo_escolar, fecha_emision, fecha_vencimiento,
          monto_base_centavos, estado)
       VALUES ($1,$2,$3,$4,'2025-01-01','2099-12-31',100000,'pendiente')
       RETURNING id`,
      [tenantId, studentId, conceptId, ciclo],
    );
    return (r.rows[0] as any).id as number;
  };

  cAId = await insertCharge(s1Id, "2025-2026");
  cBId = await insertCharge(s2Id, "2025-2026");
  cCId = await insertCharge(s3Id, "2024-2025");

  // Tutores
  const insertGuardian = async (
    nombres: string,
    apellido: string,
  ): Promise<number> => {
    const r = await pool.query(
      `INSERT INTO guardians
         (nombres, apellido_paterno, nombre_completo,
          correo_institucional_familiar, email, tipo_guardian)
       VALUES ($1,$2,$3,$4,$4,'tutor') RETURNING id`,
      [
        nombres, apellido,
        `${nombres} ${apellido}`,
        `${TS}.${apellido.toLowerCase().slice(0, 4)}@est.test`,
      ],
    );
    return (r.rows[0] as any).id as number;
  };

  g1Name = `TutorResponsable${TS}`;
  g2Name = `TutorNoResponsable${TS}`;

  g1Id = await insertGuardian("TutorResponsable", TS);     // responsable de pago → s1
  g2Id = await insertGuardian("TutorNoResponsable", TS);   // NO responsable → s1
  g3Id = await insertGuardian("TutorS2", TS);              // responsable → s2

  // Relaciones student_guardian
  await pool.query(
    `INSERT INTO student_guardian (student_id, guardian_id, es_responsable_pago)
     VALUES ($1,$2,true)`,
    [s1Id, g1Id],
  );
  await pool.query(
    `INSERT INTO student_guardian (student_id, guardian_id, es_responsable_pago)
     VALUES ($1,$2,false)`,
    [s1Id, g2Id],
  );
  await pool.query(
    `INSERT INTO student_guardian (student_id, guardian_id, es_responsable_pago)
     VALUES ($1,$2,true)`,
    [s2Id, g3Id],
  );
  // s3 no tiene tutores
});

// ── afterAll ──────────────────────────────────────────────────────────────────

afterAll(async () => {
  // Relaciones
  for (const sid of [s1Id, s2Id, s3Id]) {
    if (sid) await pool.query(
      `DELETE FROM student_guardian WHERE student_id = $1`, [sid],
    ).catch(() => {});
  }
  // Pagos vacíos, charges
  for (const id of [cAId, cBId, cCId]) {
    if (id) await pool.query(`DELETE FROM charges WHERE id = $1`, [id]).catch(() => {});
  }
  // Concepto
  if (conceptId) await pool.query(`DELETE FROM concepts WHERE id = $1`, [conceptId]).catch(() => {});
  // Alumnos
  for (const id of [s1Id, s2Id, s3Id]) {
    if (id) await pool.query(`DELETE FROM students WHERE id = $1`, [id]).catch(() => {});
  }
  // Tutores
  for (const id of [g1Id, g2Id, g3Id]) {
    if (id) await pool.query(`DELETE FROM guardians WHERE id = $1`, [id]).catch(() => {});
  }
  if (campusId) await pool.query(`DELETE FROM campuses WHERE id = $1`, [campusId]).catch(() => {});
  if (tenantId) await pool.query(`DELETE FROM tenants  WHERE id = $1`, [tenantId]).catch(() => {});
});

// ── helpers de fixture ────────────────────────────────────────────────────────

/** Filtra las filas del fixture (por id_referencia que contiene TS) */
function fixtureStudents(body: any): any[] {
  return (body.students as any[]).filter(
    (s) => s.nombre_completo?.includes(TS),
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
describe("RPT-02 GET /api/reportes/estudiantes — auth y guards", () => {

  it("RES-01: sin token → 401", async () => {
    const { status } = await get("/api/reportes/estudiantes");
    expect(status).toBe(401);
  });

  it("RES-02: asistente → 200 (REPORTS.READ es universal)", async () => {
    const { status } = await get("/api/reportes/estudiantes", tokAsistente);
    expect(status).toBe(200);
  });

  it("RES-03: administrador_campus → 200 + estructura completa", async () => {
    const { status, body } = await get(
      "/api/reportes/estudiantes",
      tokAdminCampus,
    );
    expect(status).toBe(200);
    expect(typeof body.total).toBe("number");
    expect(Array.isArray(body.students)).toBe(true);
    expect(body).toHaveProperty("filters");

    // Cada fila tiene las 7 columnas
    const fst = (body.students as any[])[0];
    if (fst) {
      expect(fst).toHaveProperty("nombre_completo");
      expect(fst).toHaveProperty("nivel");
      expect(fst).toHaveProperty("grado");
      expect(fst).toHaveProperty("grupo");
      expect(fst).toHaveProperty("estado_alumno");
      expect(fst).toHaveProperty("ciclo_escolar");
      expect(fst).toHaveProperty("tutor_principal");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("RPT-02 GET — filtros con conteos exactos del fixture", () => {

  it("RES-04: sin filtros → 3 alumnos del fixture (s1, s2, s3)", async () => {
    const { body } = await get("/api/reportes/estudiantes", tokAdminCampus);
    const fs = fixtureStudents(body);
    expect(fs).toHaveLength(3);
  });

  it("RES-05: estado='activo' → 2 (s1, s2; s3 es baja)", async () => {
    const { body } = await get(
      "/api/reportes/estudiantes?estado=activo",
      tokAdminCampus,
    );
    const fs = fixtureStudents(body);
    expect(fs).toHaveLength(2);
    for (const s of fs) expect(s.estado_alumno).toBe("activo");
  });

  it("RES-06: estado='baja' → 1 (solo s3)", async () => {
    const { body } = await get(
      "/api/reportes/estudiantes?estado=baja",
      tokAdminCampus,
    );
    const fs = fixtureStudents(body);
    expect(fs).toHaveLength(1);
    expect(fs[0].estado_alumno).toBe("baja");
  });

  it("RES-07: nivel='Primaria' → 2 (s1, s3; s2 es Secundaria)", async () => {
    const { body } = await get(
      `/api/reportes/estudiantes?nivel=Primaria`,
      tokAdminCampus,
    );
    const fs = fixtureStudents(body);
    expect(fs).toHaveLength(2);
    for (const s of fs) expect(s.nivel).toBe("Primaria");
  });

  it("RES-08: grado='3° PRIMARIA' → 2 (s1, s3; s2 tiene otro grado)", async () => {
    const { body } = await get(
      `/api/reportes/estudiantes?grado=${encodeURIComponent("3° PRIMARIA")}`,
      tokAdminCampus,
    );
    const fs = fixtureStudents(body);
    expect(fs).toHaveLength(2);
    for (const s of fs) expect(s.grado).toBe("3° PRIMARIA");
  });

  it("RES-09: grupo='A' → 1 (solo s1; s2 y s3 están en grupo B)", async () => {
    const { body } = await get(
      "/api/reportes/estudiantes?grupo=A",
      tokAdminCampus,
    );
    const fs = fixtureStudents(body);
    expect(fs).toHaveLength(1);
    expect(fs[0].grupo).toBe("A");
  });

  it("RES-10: ciclo='2025-2026' → 2 (s1, s2; s3 tiene ciclo 2024-2025)", async () => {
    const { body } = await get(
      "/api/reportes/estudiantes?ciclo=2025-2026",
      tokAdminCampus,
    );
    const fs = fixtureStudents(body);
    expect(fs).toHaveLength(2);
    for (const s of fs) expect(s.ciclo_escolar).toBe("2025-2026");
  });

  it("RES-11: ciclo='2024-2025' → 1 (solo s3)", async () => {
    const { body } = await get(
      "/api/reportes/estudiantes?ciclo=2024-2025",
      tokAdminCampus,
    );
    const fs = fixtureStudents(body);
    expect(fs).toHaveLength(1);
    expect(fs[0].ciclo_escolar).toBe("2024-2025");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("RPT-02 GET — tutor_principal y ciclo_escolar correctos", () => {

  it("RES-12: tutor_principal de s1 incluye el nombre de g1 (es_responsable_pago=true)", async () => {
    const { body } = await get("/api/reportes/estudiantes", tokAdminCampus);
    const s1 = fixtureStudents(body).find((s) =>
      s.nombre_completo.startsWith("Alumno A"),
    );
    expect(s1).toBeDefined();
    // g1 se llama "TutorResponsable TS"
    expect(s1.tutor_principal).toContain("TutorResponsable");
  });

  it("RES-13: tutor_principal de s1 NO es g2 (es_responsable_pago=false)", async () => {
    const { body } = await get("/api/reportes/estudiantes", tokAdminCampus);
    const s1 = fixtureStudents(body).find((s) =>
      s.nombre_completo.startsWith("Alumno A"),
    );
    expect(s1).toBeDefined();
    // g2 se llama "TutorNoResponsable TS" — no debe aparecer
    expect(s1.tutor_principal ?? "").not.toContain("TutorNoResponsable");
  });

  it("RES-14: tutor_principal de s3 = null (sin tutores registrados)", async () => {
    const { body } = await get("/api/reportes/estudiantes", tokAdminCampus);
    const s3 = fixtureStudents(body).find((s) =>
      s.nombre_completo.startsWith("Alumno C"),
    );
    expect(s3).toBeDefined();
    expect(s3.tutor_principal).toBeNull();
  });

  it("RES-15: ciclo_escolar de s1 sin filtro ciclo = '2025-2026' (de su cargo más reciente)", async () => {
    const { body } = await get("/api/reportes/estudiantes", tokAdminCampus);
    const s1 = fixtureStudents(body).find((s) =>
      s.nombre_completo.startsWith("Alumno A"),
    );
    expect(s1).toBeDefined();
    expect(s1.ciclo_escolar).toBe("2025-2026");
  });

  it("RES-16: ciclo_escolar de s1 con filtro ciclo='2025-2026' = '2025-2026'", async () => {
    const { body } = await get(
      "/api/reportes/estudiantes?ciclo=2025-2026",
      tokAdminCampus,
    );
    const s1 = fixtureStudents(body).find((s) =>
      s.nombre_completo.startsWith("Alumno A"),
    );
    expect(s1).toBeDefined();
    expect(s1.ciclo_escolar).toBe("2025-2026");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("RPT-02 POST /api/reportes/estudiantes/exportar", () => {

  it("RES-17: sin token → 401", async () => {
    const r = await post(
      "/api/reportes/estudiantes/exportar",
      undefined,
      { formato: "excel" },
    );
    expect(r.status).toBe(401);
  });

  it("RES-18: asistente → 403 (no tiene REPORTS.EXPORT)", async () => {
    const r = await post(
      "/api/reportes/estudiantes/exportar",
      tokAsistente,
      { formato: "excel" },
    );
    expect(r.status).toBe(403);
    const b = await r.json();
    expect(b.message).toMatch(/permiso/i);
  });

  it("RES-19: administrador_campus exportar excel → 200 + magic bytes .xlsx", async () => {
    const r = await post(
      "/api/reportes/estudiantes/exportar",
      tokAdminCampus,
      { formato: "excel", estado: "activo" },
    );
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const buf = Buffer.from(await r.arrayBuffer());
    // ZIP magic bytes PK\x03\x04
    expect(buf[0]).toBe(0x50); // 'P'
    expect(buf[1]).toBe(0x4b); // 'K'
    expect(buf[2]).toBe(0x03);
    expect(buf[3]).toBe(0x04);
    expect(buf.length).toBeGreaterThan(1000);
  }, 20_000);

  it("RES-20: administrador_campus exportar pdf → 200 + magic bytes %PDF", async () => {
    const r = await post(
      "/api/reportes/estudiantes/exportar",
      tokAdminCampus,
      { formato: "pdf", estado: "activo" },
    );
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("application/pdf");
    const buf = Buffer.from(await r.arrayBuffer());
    expect(buf.slice(0, 4).toString("ascii")).toBe("%PDF");
    expect(buf.length).toBeGreaterThan(1000);
  }, 20_000);

  it("RES-21: formato inválido → 400", async () => {
    const r = await post(
      "/api/reportes/estudiantes/exportar",
      tokAdminCampus,
      { formato: "csv" },
    );
    expect(r.status).toBe(400);
    const b = await r.json();
    expect(b.message).toMatch(/formato/i);
  });
});
