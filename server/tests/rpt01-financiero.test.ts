/**
 * rpt01-financiero.test.ts — RPT-01 Reporte Financiero
 *
 * GET  /api/reportes/financiero          — MODULES.REPORTS / ACTIONS.READ
 * POST /api/reportes/financiero/exportar — MODULES.REPORTS / ACTIONS.EXPORT
 *
 * Fixture:
 *   tenant + campus + estudiante (nombre_completo NOT NULL)
 *   concept1 (Colegiatura FIN_TS), concept2 (Inscripcion FIN_TS)
 *
 *   Cargos:
 *     cA  concept1 / 2024-A / pagado    / venc 2099-12-31 /  200_000 ctvs
 *     cB  concept1 / 2024-A / pendiente / venc 2024-01-01 /  150_000 ctvs  ← VENCIDO
 *     cC  concept2 / 2025-B / pagado    / venc 2099-12-31 /   80_000 ctvs
 *     cE  concept1 / 2023-D / pagado    / venc 2023-12-31 /  100_000 ctvs  ← período anterior
 *     cF  concept1 / 2024-A / pagado    / venc 2099-12-31 /   50_000 ctvs
 *
 *   Pagos (estado = 'exitoso'):
 *     pA  2024-01-15  efectivo  200_000  → cA
 *     pB  2023-12-10  spei      100_000  → cE  ← período anterior
 *     pC  2024-01-20  efectivo   80_000  → cC
 *     pD  2024-01-25  efectivo   50_000  → cF
 *
 *   Totales con fecha_desde=2024-01-01, fecha_hasta=2024-01-31:
 *     total_income = 200_000 + 80_000 + 50_000 = 330_000
 *     concept1:     200_000 + 50_000 = 250_000   (pA + pD)
 *     concept2:      80_000            (pC)
 *     efectivo:     200_000 + 80_000 + 50_000 = 330_000
 *     income_growth = ((330_000 - 100_000) / 100_000) * 100 = 230.0
 *     payment_growth = ((3 - 1) / 1) * 100 = 200.0
 *
 * Tests:
 *   FIN-01  sin token GET → 401
 *   FIN-02  asistente GET → 200 (REPORTS.READ es universal)
 *   FIN-03  administrador_campus GET → 200 + estructura completa
 *   FIN-04  contador_general GET → 200 + estructura completa
 *   FIN-05  total_income = suma real de pagos exitosos (con filtro de fecha)
 *   FIN-06  income_by_concept refleja los conceptos del fixture
 *   FIN-07  payment_methods refleja el método del fixture
 *   FIN-08  monto_vencido > 0 (cB vence en 2024-01-01 < CURRENT_DATE)
 *   FIN-09  income_growth = null cuando no hay pagos en período anterior
 *   FIN-10  income_growth es número real cuando hay pagos en período anterior
 *   FIN-11  payment_growth = null cuando no hay pagos en período anterior
 *   FIN-12  payment_growth es número real cuando hay pagos en período anterior
 *   FIN-13  filtro ciclo='2024-A' excluye concepto2/ciclo-2025-B
 *   FIN-14  filtro concepto=concept1_id excluye pC (concept2)
 *   FIN-15  sin token POST exportar → 401
 *   FIN-16  asistente POST exportar → 403 (sin REPORTS.EXPORT)
 *   FIN-17  administrador_campus POST exportar excel → 200 + magic bytes .xlsx
 *   FIN-18  administrador_campus POST exportar pdf  → 200 + magic bytes %PDF
 *   FIN-19  POST exportar formato inválido → 400
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

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
    method:  "POST",
    headers,
    body:    JSON.stringify(data),
  });
}

// ── fixture state ─────────────────────────────────────────────────────────────

const TS = Date.now().toString().slice(-7);

let tenantId:  number;
let campusId:  number;
let studentId: number;
let concept1Id: number;
let concept2Id: number;
let cAId: number; // pagado, 2024-A, concept1
let cBId: number; // pendiente, VENCIDO, 2024-A, concept1
let cCId: number; // pagado, 2025-B, concept2
let cEId: number; // pagado, 2023-D, concept1 (período anterior)
let cFId: number; // pagado, 2024-A, concept1

let pAId: number;
let pBId: number;
let pCId: number;
let pDId: number;

// Tokens (sin id real — evita FK en audit_log)
const makeToken = (role: string) =>
  jwt.sign(
    { role, campus_id: campusId, tenant_id: tenantId },
    JWT_SECRET,
    { expiresIn: "1h" },
  );

let tokAsistente:   string;
let tokAdminCampus: string;
let tokContador:    string;

// ── beforeAll — fixture completo ─────────────────────────────────────────────

beforeAll(async () => {
  // Tenant
  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1, $2) RETURNING id`,
    [`Tenant FIN ${TS}`, `FIN${TS}`],
  );
  tenantId = (tRow.rows[0] as any).id;

  // Campus
  const cRow = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1, $2) RETURNING id`,
    [`Campus FIN ${TS}`, tenantId],
  );
  campusId = (cRow.rows[0] as any).id;

  // Tokens (campusId ya disponible)
  tokAsistente   = makeToken("asistente");
  tokAdminCampus = makeToken("administrador_campus");
  tokContador    = makeToken("contador_general");

  // Estudiante
  const sRow = await pool.query(
    `INSERT INTO students
       (nombres, apellido_paterno, nombre_completo,
        campus_id, tenant_id, id_referencia, status, grado)
     VALUES ($1, $2, $3, $4, $5, $6, 'activo', '1° PRIMARIA')
     RETURNING id`,
    [`Alumno`, `FIN${TS}`, `Alumno FIN${TS}`, campusId, tenantId, `FIN${TS}`],
  );
  studentId = (sRow.rows[0] as any).id;

  // Conceptos
  const co1Row = await pool.query(
    `INSERT INTO concepts
       (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1, $2, $3, 'colegiatura', 'mensual', 200000)
     RETURNING id`,
    [campusId, tenantId, `Colegiatura FIN${TS}`],
  );
  concept1Id = (co1Row.rows[0] as any).id;

  const co2Row = await pool.query(
    `INSERT INTO concepts
       (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1, $2, $3, 'inscripcion', 'anual', 80000)
     RETURNING id`,
    [campusId, tenantId, `Inscripcion FIN${TS}`],
  );
  concept2Id = (co2Row.rows[0] as any).id;

  // ── Cargos ────────────────────────────────────────────────────────────────
  const insertCharge = async (
    conceptId: number,
    ciclo: string,
    monto: number,
    estado: string,
    fechaVenc: string,
  ): Promise<number> => {
    const r = await pool.query(
      `INSERT INTO charges
         (tenant_id, student_id, concept_id,
          ciclo_escolar, fecha_emision, fecha_vencimiento,
          monto_base_centavos, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [tenantId, studentId, conceptId, ciclo,
       "2024-01-05", fechaVenc, monto, estado],
    );
    return (r.rows[0] as any).id as number;
  };

  cAId = await insertCharge(concept1Id, "2024-A", 200_000, "pagado",   "2099-12-31");
  cBId = await insertCharge(concept1Id, "2024-A", 150_000, "pendiente","2024-01-01"); // VENCIDO
  cCId = await insertCharge(concept2Id, "2025-B",  80_000, "pagado",   "2099-12-31");
  cEId = await insertCharge(concept1Id, "2023-D", 100_000, "pagado",   "2023-12-31"); // período anterior
  cFId = await insertCharge(concept1Id, "2024-A",  50_000, "pagado",   "2099-12-31");

  // ── Pagos ─────────────────────────────────────────────────────────────────
  const insertPayment = async (
    chargeId: number,
    monto: number,
    metodo: string,
    fechaPago: string,
  ): Promise<number> => {
    const r = await pool.query(
      `INSERT INTO payments
         (tenant_id, charge_id, metodo, monto_centavos, fecha_pago, estado)
       VALUES ($1, $2, $3, $4, $5, 'exitoso')
       RETURNING id`,
      [tenantId, chargeId, metodo, monto, fechaPago],
    );
    return (r.rows[0] as any).id as number;
  };

  pAId = await insertPayment(cAId, 200_000, "efectivo", "2024-01-15"); // ventana actual
  pBId = await insertPayment(cEId, 100_000, "spei",     "2023-12-10"); // período anterior
  pCId = await insertPayment(cCId,  80_000, "efectivo", "2024-01-20"); // concept2 / ciclo 2025-B
  pDId = await insertPayment(cFId,  50_000, "efectivo", "2024-01-25"); // concept1 / ciclo 2024-A
});

// ── afterAll — limpieza ───────────────────────────────────────────────────────

afterAll(async () => {
  for (const id of [pAId, pBId, pCId, pDId]) {
    if (id) await pool.query(`DELETE FROM payments WHERE id = $1`, [id]).catch(() => {});
  }
  for (const id of [cAId, cBId, cCId, cEId, cFId]) {
    if (id) await pool.query(`DELETE FROM charges WHERE id = $1`, [id]).catch(() => {});
  }
  if (concept1Id) await pool.query(`DELETE FROM concepts WHERE id = $1`, [concept1Id]).catch(() => {});
  if (concept2Id) await pool.query(`DELETE FROM concepts WHERE id = $1`, [concept2Id]).catch(() => {});
  if (studentId)  await pool.query(`DELETE FROM students WHERE id = $1`, [studentId]).catch(() => {});
  if (campusId)   await pool.query(`DELETE FROM campuses WHERE id = $1`, [campusId]).catch(() => {});
  if (tenantId)   await pool.query(`DELETE FROM tenants  WHERE id = $1`, [tenantId]).catch(() => {});
});

// ── constantes de prueba ──────────────────────────────────────────────────────

// Ventana de prueba principal (contiene pA, pC, pD)
const QCurrent = "fecha_desde=2024-01-01&fecha_hasta=2024-01-31";

// Ventana sin datos (verifica growth=null)
const QEmpty   = "fecha_desde=2024-06-01&fecha_hasta=2024-06-30";

// ═══════════════════════════════════════════════════════════════════════════════
describe("RPT-01 GET /api/reportes/financiero — autenticación y guards", () => {

  it("FIN-01: sin token → 401", async () => {
    const { status } = await get("/api/reportes/financiero");
    expect(status).toBe(401);
  });

  it("FIN-02: asistente GET → 200 (REPORTS.READ es universal)", async () => {
    const { status } = await get(`/api/reportes/financiero?${QCurrent}`, tokAsistente);
    expect(status).toBe(200);
  });

  it("FIN-03: administrador_campus → 200 + estructura completa", async () => {
    const { status, body } = await get(
      `/api/reportes/financiero?${QCurrent}`,
      tokAdminCampus,
    );
    expect(status).toBe(200);
    // summary
    expect(body).toHaveProperty("summary");
    expect(body.summary).toHaveProperty("total_income");
    expect(body.summary).toHaveProperty("payments_count");
    expect(body.summary).toHaveProperty("cuentas_por_cobrar");
    expect(body.summary).toHaveProperty("monto_vencido");
    expect(body.summary).toHaveProperty("collection_rate");
    expect(body.summary).toHaveProperty("income_growth");
    expect(body.summary).toHaveProperty("payment_growth");
    // arrays
    expect(Array.isArray(body.income_by_concept)).toBe(true);
    expect(Array.isArray(body.payment_methods)).toBe(true);
    expect(Array.isArray(body.monthly_trend)).toBe(true);
    // filters echo
    expect(body.filters.fecha_desde).toBe("2024-01-01");
    expect(body.filters.fecha_hasta).toBe("2024-01-31");
  });

  it("FIN-04: contador_general → 200 + estructura completa", async () => {
    const { status, body } = await get(
      `/api/reportes/financiero?${QCurrent}`,
      tokContador,
    );
    expect(status).toBe(200);
    expect(body).toHaveProperty("summary");
    expect(Array.isArray(body.income_by_concept)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("RPT-01 GET — métricas calculadas con datos reales del fixture", () => {

  it("FIN-05: total_income = 330_000 (pA+pC+pD con filtro de fecha)", async () => {
    const { status, body } = await get(
      `/api/reportes/financiero?${QCurrent}`,
      tokAdminCampus,
    );
    expect(status).toBe(200);
    // pA=200_000 + pC=80_000 + pD=50_000 = 330_000
    expect(body.summary.total_income).toBe(330_000);
    expect(body.summary.payments_count).toBe(3);
  });

  it("FIN-06: income_by_concept refleja concept1 (250_000) y concept2 (80_000)", async () => {
    const { status, body } = await get(
      `/api/reportes/financiero?${QCurrent}`,
      tokAdminCampus,
    );
    expect(status).toBe(200);
    const c1 = (body.income_by_concept as any[]).find(
      (c: any) => c.concept_id === concept1Id,
    );
    const c2 = (body.income_by_concept as any[]).find(
      (c: any) => c.concept_id === concept2Id,
    );
    expect(c1).toBeDefined();
    expect(c1.monto_centavos).toBe(250_000); // pA(200_000) + pD(50_000)
    expect(c2).toBeDefined();
    expect(c2.monto_centavos).toBe(80_000);  // pC
  });

  it("FIN-07: payment_methods → 'efectivo' con monto 330_000", async () => {
    const { status, body } = await get(
      `/api/reportes/financiero?${QCurrent}`,
      tokAdminCampus,
    );
    expect(status).toBe(200);
    const ef = (body.payment_methods as any[]).find(
      (m: any) => m.metodo === "efectivo",
    );
    expect(ef).toBeDefined();
    expect(ef.monto_centavos).toBe(330_000);
    expect(ef.num_pagos).toBe(3);
    // pB (spei, 2023-12-10) no está en la ventana 2024-01
    const sp = (body.payment_methods as any[]).find(
      (m: any) => m.metodo === "spei",
    );
    expect(sp).toBeUndefined();
  });

  it("FIN-08: monto_vencido >= 150_000 (cB vence en 2024-01-01, pendiente)", async () => {
    const { status, body } = await get(
      `/api/reportes/financiero`,
      tokAdminCampus,
    );
    expect(status).toBe(200);
    // cB tiene fecha_vencimiento='2024-01-01' < CURRENT_DATE y estado='pendiente'
    expect(body.summary.monto_vencido).toBeGreaterThanOrEqual(150_000);
    expect(body.summary.num_vencidos).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("RPT-01 GET — income_growth / payment_growth (null vs número real)", () => {

  it("FIN-09: income_growth = null cuando no hay pagos en el período anterior (ventana vacía)", async () => {
    // Ventana 2024-06-01..2024-06-30: sin pagos ni en esta ventana ni en la anterior
    const { status, body } = await get(
      `/api/reportes/financiero?${QEmpty}`,
      tokAdminCampus,
    );
    expect(status).toBe(200);
    // prev_income = 0 → income_growth debe ser null
    expect(body.summary.income_growth).toBeNull();
  });

  it("FIN-10: income_growth es número (230.0) cuando hay pagos en período anterior", async () => {
    // Ventana 2024-01-01..2024-01-31: current=330_000, prev(dic 2023)=100_000
    const { status, body } = await get(
      `/api/reportes/financiero?${QCurrent}`,
      tokAdminCampus,
    );
    expect(status).toBe(200);
    expect(typeof body.summary.income_growth).toBe("number");
    // ((330_000 - 100_000) / 100_000) * 100 = 230.0
    expect(body.summary.income_growth).toBeCloseTo(230.0, 0);
  });

  it("FIN-11: payment_growth = null cuando no hay pagos en período anterior (ventana vacía)", async () => {
    const { status, body } = await get(
      `/api/reportes/financiero?${QEmpty}`,
      tokAdminCampus,
    );
    expect(status).toBe(200);
    expect(body.summary.payment_growth).toBeNull();
  });

  it("FIN-12: payment_growth es número (200.0) cuando hay pagos en período anterior", async () => {
    // current=3 pagos, prev=1 pago → ((3-1)/1)*100 = 200.0
    const { status, body } = await get(
      `/api/reportes/financiero?${QCurrent}`,
      tokAdminCampus,
    );
    expect(status).toBe(200);
    expect(typeof body.summary.payment_growth).toBe("number");
    expect(body.summary.payment_growth).toBeCloseTo(200.0, 0);
  });

  it("FIN-12b: income_growth = null con filtro ciclo (sin período comparable)", async () => {
    const { status, body } = await get(
      `/api/reportes/financiero?ciclo=2024-A`,
      tokAdminCampus,
    );
    expect(status).toBe(200);
    expect(body.summary.income_growth).toBeNull();
    expect(body.summary.payment_growth).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("RPT-01 GET — filtros ciclo y concepto", () => {

  it("FIN-13: filtro ciclo='2024-A' excluye pC (ciclo='2025-B') y pB (ciclo='2023-D')", async () => {
    const { status, body } = await get(
      `/api/reportes/financiero?ciclo=2024-A`,
      tokAdminCampus,
    );
    expect(status).toBe(200);
    // pA(200_000) + pD(50_000) = 250_000 (pC y pB excluidos)
    expect(body.summary.total_income).toBe(250_000);
    expect(body.summary.payments_count).toBe(2);
  });

  it("FIN-14: filtro concepto=concept1Id excluye pC (concept2)", async () => {
    const { status, body } = await get(
      `/api/reportes/financiero?concepto=${concept1Id}`,
      tokAdminCampus,
    );
    expect(status).toBe(200);
    // pA(200_000) + pB(100_000) + pD(50_000) = 350_000 (pC concept2 excluido)
    expect(body.summary.total_income).toBe(350_000);
    expect(body.summary.payments_count).toBe(3);
    // Solo concept1 debe aparecer
    const c2 = (body.income_by_concept as any[]).find(
      (c: any) => c.concept_id === concept2Id,
    );
    expect(c2).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("RPT-01 POST /api/reportes/financiero/exportar", () => {

  it("FIN-15: sin token → 401", async () => {
    const r = await post(
      "/api/reportes/financiero/exportar",
      undefined,
      { formato: "excel" },
    );
    expect(r.status).toBe(401);
  });

  it("FIN-16: asistente → 403 (no tiene REPORTS.EXPORT)", async () => {
    const r = await post(
      "/api/reportes/financiero/exportar",
      tokAsistente,
      { formato: "excel" },
    );
    expect(r.status).toBe(403);
    const b = await r.json();
    expect(b.message).toMatch(/permiso/i);
  });

  it("FIN-17: administrador_campus exportar excel → 200 + magic bytes .xlsx", async () => {
    const r = await post(
      "/api/reportes/financiero/exportar",
      tokAdminCampus,
      { formato: "excel", fecha_desde: "2024-01-01", fecha_hasta: "2024-01-31" },
    );
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const buf = Buffer.from(await r.arrayBuffer());
    // ZIP magic bytes: PK\x03\x04
    expect(buf[0]).toBe(0x50); // 'P'
    expect(buf[1]).toBe(0x4b); // 'K'
    expect(buf[2]).toBe(0x03);
    expect(buf[3]).toBe(0x04);
    expect(buf.length).toBeGreaterThan(1000);
  }, 20_000);

  it("FIN-18: administrador_campus exportar pdf → 200 + magic bytes %PDF", async () => {
    const r = await post(
      "/api/reportes/financiero/exportar",
      tokAdminCampus,
      { formato: "pdf", fecha_desde: "2024-01-01", fecha_hasta: "2024-01-31" },
    );
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("application/pdf");
    const buf = Buffer.from(await r.arrayBuffer());
    expect(buf.slice(0, 4).toString("ascii")).toBe("%PDF");
    expect(buf.length).toBeGreaterThan(1000);
  }, 20_000);

  it("FIN-19: formato inválido → 400", async () => {
    const r = await post(
      "/api/reportes/financiero/exportar",
      tokAdminCampus,
      { formato: "csv" },
    );
    expect(r.status).toBe(400);
    const b = await r.json();
    expect(b.message).toMatch(/formato/i);
  });
});
