/**
 * RPT-06 — Reporte Contable / Fiscal
 *
 * GET  /api/reportes/contable          guard FISCAL.READ
 *   → contador_general + auxiliar_contable + admin
 *   ✗ asistente, admisiones
 *
 * POST /api/reportes/contable/exportar guard REPORTS.EXPORT
 *   → contador_general + admin (no auxiliar_contable — sólo tiene READ)
 *
 * Fixture de datos (campus aislado por TS):
 *   payment1 = 40 000 ¢  |  charge1.ciclo_escolar = '2025-2026'  | p.created_at = '2025-06-15'
 *   payment2 = 30 000 ¢  |  charge2.ciclo_escolar = '2024-2025'  | p.created_at = '2024-12-15'
 *
 * Bug histórico en R9 (GET /api/fiscal/reportes-contables):
 *   El parámetro `periodo` se recibía pero se ignoraba en SQL.
 *   La query siempre devolvía los últimos 12 meses sin importar el valor.
 *   Efecto observable: GET ?periodo=2025-06 y GET ?periodo=2024-12 devolvían
 *   EXACTAMENTE los mismos datos (todos los meses del campus en las últimas 52 semanas).
 *
 *   POST-FIX (RPT-06): cada periodo devuelve distinto ingreso_centavos:
 *     ?periodo=2025-06  →  40 000 (payment1 únicamente)
 *     ?periodo=2024-12  →  30 000 (payment2 únicamente)
 *
 * Tests:
 *   CON-01  sin token → 401
 *   CON-02  asistente → 403
 *   CON-03  admisiones → 403 (no tiene FISCAL.READ)
 *   CON-04  contador_general → 200 + { reportes: Array, filters }
 *   CON-05  auxiliar_contable → 200 (tiene FISCAL.READ)
 *   CON-06  administrador_campus → 200
 *   CON-07  Bug-proof: ?periodo=2025-06 ≠ ?periodo=2024-12 (el filtro ahora restringe)
 *   CON-08  Filtro ciclo: ?ciclo=2025-2026 → sólo payment1 (40 000)
 *   CON-09  Filtro periodo 2025-06 → payment1 en reportes (ingreso = 40 000)
 *   CON-10  Filtro periodo 2024-12 → payment2 en reportes (ingreso = 30 000)
 *   CON-11  Exportar Excel: 200 + magic bytes PK (xlsx)
 *   CON-12  Exportar PDF:   200 + magic bytes %PDF
 *   CON-13  auxiliar_contable POST exportar → 403 (sin REPORTS.EXPORT)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import { pool } from "../db";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── Estado compartido ─────────────────────────────────────────────────────────

const TS = Date.now().toString().slice(-6);

let tenantId:   number;
let campusId:   number;
let conceptId:  number;
let studentId:  number;
let chargeId1:  number;
let chargeId2:  number;
let paymentId1: number;
let paymentId2: number;

let tokContador:  string;
let tokAuxiliar:  string;
let tokAdmin:     string;
let tokAsistente: string;
let tokAdmision:  string;

function makeToken(userId: number, role: string): string {
  return jwt.sign(
    { id: userId, email: `u${userId}@rpt06${TS}.test`, role,
      campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const bcrypt = await import("bcrypt");
  const hash   = await bcrypt.hash("Test2025!", 10);

  const tR = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1, $2) RETURNING id`,
    [`RPT06 Tenant ${TS}`, `R6T${TS}`],
  );
  tenantId = tR.rows[0].id;

  const cR = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1, $2) RETURNING id`,
    [tenantId, `Campus-RPT06-${TS}`],
  );
  campusId = cR.rows[0].id;

  async function createUser(name: string, role: string, pfx: string): Promise<number> {
    const r = await pool.query(
      `INSERT INTO users (tenant_id, campus_id, name, email, password_hash, role, is_active, custom_permissions)
       VALUES ($1,$2,$3,$4,$5,$6,true,'{}') RETURNING id`,
      [tenantId, campusId, name, `${pfx}.${TS}@rpt06.test`, hash, role],
    );
    return r.rows[0].id as number;
  }

  const contId = await createUser("Contador RPT06",  "contador_general",    "cnt");
  const auxId  = await createUser("Aux RPT06",        "auxiliar_contable",   "aux");
  const admId  = await createUser("Admin RPT06",      "administrador_campus","adm");
  const asiId  = await createUser("Asistente RPT06",  "asistente",           "asi");
  const admisId= await createUser("Admisiones RPT06", "admisiones",          "adms");

  tokContador  = makeToken(contId,  "contador_general");
  tokAuxiliar  = makeToken(auxId,   "auxiliar_contable");
  tokAdmin     = makeToken(admId,   "administrador_campus");
  tokAsistente = makeToken(asiId,   "asistente");
  tokAdmision  = makeToken(admisId, "admisiones");

  // Concept
  const coR = await pool.query(
    `INSERT INTO concepts (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1,$2,$3,'ingreso','mensual',50000) RETURNING id`,
    [campusId, tenantId, `Colegiatura-RPT06-${TS}`],
  );
  conceptId = coR.rows[0].id;

  // Student
  const stR = await pool.query(
    `INSERT INTO students
       (tenant_id, campus_id, nombres, apellido_paterno, apellido_materno,
        nombre_completo, grado, grupo, nivel_escolar, id_referencia, status)
     VALUES ($1,$2,'Test','RPT06','X',
             'Test RPT06 X','1','A','primaria',$3,'activo') RETURNING id`,
    [tenantId, campusId, `REF-RPT06-${TS}`],
  );
  studentId = stR.rows[0].id;

  // Charge 1 — ciclo 2025-2026
  const ch1 = await pool.query(
    `INSERT INTO charges
       (tenant_id, student_id, concept_id, ciclo_escolar,
        fecha_emision, fecha_vencimiento,
        monto_base_centavos, beca_aplicada, recargo_aplicado_centavos, estado)
     VALUES ($1,$2,$3,'2025-2026','2025-06-01','2025-06-30',
             40000,'0',0,'pagado') RETURNING id`,
    [tenantId, studentId, conceptId],
  );
  chargeId1 = ch1.rows[0].id;

  // Charge 2 — ciclo 2024-2025
  const ch2 = await pool.query(
    `INSERT INTO charges
       (tenant_id, student_id, concept_id, ciclo_escolar,
        fecha_emision, fecha_vencimiento,
        monto_base_centavos, beca_aplicada, recargo_aplicado_centavos, estado)
     VALUES ($1,$2,$3,'2024-2025','2024-12-01','2024-12-31',
             30000,'0',0,'pagado') RETURNING id`,
    [tenantId, studentId, conceptId],
  );
  chargeId2 = ch2.rows[0].id;

  // Payment 1 — 40 000 ¢, mes 2025-06 (created_at directo en INSERT)
  const p1 = await pool.query(
    `INSERT INTO payments
       (tenant_id, charge_id, metodo, monto_centavos, fecha_pago, estado, created_at)
     VALUES ($1,$2,'transferencia',40000,'2025-06-15','exitoso',
             '2025-06-15'::timestamp) RETURNING id`,
    [tenantId, chargeId1],
  );
  paymentId1 = p1.rows[0].id;

  // Payment 2 — 30 000 ¢, mes 2024-12 (created_at directo en INSERT)
  const p2 = await pool.query(
    `INSERT INTO payments
       (tenant_id, charge_id, metodo, monto_centavos, fecha_pago, estado, created_at)
     VALUES ($1,$2,'transferencia',30000,'2024-12-15','exitoso',
             '2024-12-15'::timestamp) RETURNING id`,
    [tenantId, chargeId2],
  );
  paymentId2 = p2.rows[0].id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM payments WHERE id IN ($1,$2)`,  [paymentId1, paymentId2]);
  await pool.query(`DELETE FROM charges  WHERE id IN ($1,$2)`,  [chargeId1,  chargeId2]);
  await pool.query(`DELETE FROM students WHERE id = $1`,        [studentId]);
  await pool.query(`DELETE FROM concepts WHERE id = $1`,        [conceptId]);
  await pool.query(`DELETE FROM users    WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM campuses WHERE id = $1`,        [campusId]);
  await pool.query(`DELETE FROM tenants  WHERE id = $1`,        [tenantId]);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const H = (t: string) => ({
  Authorization:  `Bearer ${t}`,
  "Content-Type": "application/json",
});

async function getContable(params: string, token: string) {
  const url = `${BASE}/api/reportes/contable${params ? `?${params}` : ""}`;
  const r   = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function postExportar(
  token:  string,
  format: "excel" | "pdf",
  extra:  Record<string, string> = {},
) {
  const r = await fetch(`${BASE}/api/reportes/contable/exportar`, {
    method:  "POST",
    headers: H(token),
    body:    JSON.stringify({ format, ...extra }),
  });
  const ct  = r.headers.get("content-type") ?? "";
  const buf = r.status === 200 ? Buffer.from(await r.arrayBuffer()) : null;
  return { status: r.status, ct, buf };
}

// ── Encuentra la fila del fixture en el array de reportes ─────────────────────

function rowForPeriod(reportes: any[], yearMonth: string): any | undefined {
  return reportes.find((r: any) => {
    const mesStr = String(r.mes);          // "2025-06-01T..." ó "2025-06-01"
    return mesStr.startsWith(yearMonth);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RPT-06 — GET /api/reportes/contable + POST exportar", () => {

  // ── Guards ─────────────────────────────────────────────────────────────────

  it("CON-01: sin token → 401", async () => {
    const r = await fetch(`${BASE}/api/reportes/contable`);
    expect(r.status).toBe(401);
  });

  it("CON-02: asistente → 403 (sin FISCAL.READ)", async () => {
    const { status } = await getContable("", tokAsistente);
    expect(status).toBe(403);
  });

  it("CON-03: admisiones → 403 (sin FISCAL.READ)", async () => {
    const { status } = await getContable("", tokAdmision);
    expect(status).toBe(403);
  });

  it("CON-04: contador_general → 200 + { reportes: Array, filters }", async () => {
    const { status, body } = await getContable("", tokContador);
    expect(status).toBe(200);
    expect(body).toHaveProperty("reportes");
    expect(Array.isArray(body.reportes)).toBe(true);
    expect(body).toHaveProperty("filters");
  });

  it("CON-05: auxiliar_contable → 200 (tiene FISCAL.READ)", async () => {
    const { status } = await getContable("", tokAuxiliar);
    expect(status).toBe(200);
  });

  it("CON-06: administrador_campus → 200", async () => {
    const { status } = await getContable("", tokAdmin);
    expect(status).toBe(200);
  });

  // ── Bug-proof: el filtro periodo ahora SÍ restringe ───────────────────────

  it("CON-07: Bug-proof — ?periodo=2025-06 y ?periodo=2024-12 dan resultados distintos", async () => {
    // Pre-fix (R9): ambas llamadas devolvían exactamente los mismos rows
    // porque el WHERE de periodo nunca se añadía al SQL.
    // Post-fix (RPT-06): cada periodo devuelve sólo sus filas → ingresos distintos.
    const { body: b1 } = await getContable("periodo=2025-06", tokContador);
    const { body: b2 } = await getContable("periodo=2024-12", tokContador);

    // Fila del campus para 2025-06
    const row2506 = rowForPeriod(b1.reportes, "2025-06");
    // Fila del campus para 2024-12
    const row2412 = rowForPeriod(b2.reportes, "2024-12");

    expect(row2506, "debe existir una fila para 2025-06").toBeDefined();
    expect(row2412, "debe existir una fila para 2024-12").toBeDefined();

    // Si el filtro se ignorase los valores serían iguales entre sí
    expect(Number(row2506!.ingreso_centavos)).not.toBe(Number(row2412!.ingreso_centavos));
  });

  // ── Filtro ciclo ───────────────────────────────────────────────────────────

  it("CON-08: ?ciclo=2025-2026 → sólo payment1 (40 000 ¢) en el campus", async () => {
    const { body } = await getContable("ciclo=2025-2026", tokContador);
    // Suma de todos los ingresos de ciclo 2025-2026 en el campus
    const total = (body.reportes as any[])
      .reduce((acc: number, r: any) => acc + Number(r.ingreso_centavos), 0);
    expect(total).toBe(40000);
    expect(body.filters.ciclo).toBe("2025-2026");
  });

  // ── Filtro periodo ─────────────────────────────────────────────────────────

  it("CON-09: ?periodo=2025-06 → payment1 en los reportes (ingreso = 40 000 ¢)", async () => {
    const { body } = await getContable("periodo=2025-06", tokContador);
    const row = rowForPeriod(body.reportes, "2025-06");
    expect(row, "debe haber fila para 2025-06").toBeDefined();
    expect(Number(row!.ingreso_centavos)).toBe(40000);
    expect(Number(row!.total_pagos)).toBe(1);
    expect(body.filters.periodo).toBe("2025-06");
  });

  it("CON-10: ?periodo=2024-12 → payment2 en los reportes (ingreso = 30 000 ¢)", async () => {
    const { body } = await getContable("periodo=2024-12", tokContador);
    const row = rowForPeriod(body.reportes, "2024-12");
    expect(row, "debe haber fila para 2024-12").toBeDefined();
    expect(Number(row!.ingreso_centavos)).toBe(30000);
    expect(Number(row!.total_pagos)).toBe(1);
    expect(body.filters.periodo).toBe("2024-12");
  });

  // ── Exportación ────────────────────────────────────────────────────────────

  it("CON-11: exportar Excel (contador_general) → 200 + magic bytes PK (xlsx)", async () => {
    const { status, buf } = await postExportar(tokContador, "excel", { periodo: "2025-06" });
    expect(status).toBe(200);
    expect(buf).not.toBeNull();
    // Magic bytes de ZIP/XLSX: 50 4B 03 04 ('PK\x03\x04')
    expect(buf!.toString("utf8", 0, 2)).toBe("PK");
  });

  it("CON-12: exportar PDF (administrador_campus) → 200 + magic bytes %PDF", async () => {
    const { status, buf } = await postExportar(tokAdmin, "pdf", { ciclo: "2025-2026" });
    expect(status).toBe(200);
    expect(buf).not.toBeNull();
    // Magic bytes PDF: 25 50 44 46 ('%PDF')
    expect(buf!.toString("utf8", 0, 4)).toBe("%PDF");
  });

  it("CON-13: auxiliar_contable POST exportar → 403 (sin REPORTS.EXPORT)", async () => {
    const { status } = await postExportar(tokAuxiliar, "excel");
    expect(status).toBe(403);
  });
});
