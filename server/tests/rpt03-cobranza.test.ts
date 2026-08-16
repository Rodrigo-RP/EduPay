/**
 * rpt03-cobranza.test.ts — RPT-03 Reporte de Cargos y Cobranza
 *
 * Reemplaza R5 (GET /api/charges/export). Verifica:
 *   · Las 15 columnas de salida
 *   · Cada filtro (ciclo, nivel, grado, grupo, fecha_desde/hasta, concepto, estado)
 *   · saldo_pendiente = total - monto_pagado usando payment_applications
 *     (no solo el campo estado del cargo)
 *   · dias_vencido con 3 casos: vencido sin pagar, futuro, pagado
 *   · Exportación Excel y PDF (magic bytes)
 *   · Guards de autenticación y autorización
 *
 * Fixture (5 cargos, 4 alumnos, 2 conceptos):
 *   cA  student s1  Primaria/1°/A  colegiatura  ciclo=RPT03A  venc=2025-09-01  estado=pagado    pago=100%
 *   cB  student s1  Primaria/1°/A  colegiatura  ciclo=RPT03A  venc=2025-10-01  estado=parcial   pago=30k/85k
 *   cC  student s2  Primaria/2°/B  inscripcion  ciclo=RPT03B  venc=2024-09-01  estado=vencido   sin pago
 *   cD  student s3  Secundaria/1°/A colegiatura ciclo=RPT03A  venc=2026-09-30  estado=pendiente sin pago (futuro)
 *   cE  student s4  Secundaria/2°/B colegiatura ciclo=RPT03A  venc=2025-09-01  estado=cancelado → excluido
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";
const TS = Date.now().toString().slice(-7);

// ─── IDs de fixture ───────────────────────────────────────────────────────────
let tenantId: number;
let campusId: number;

let colegiaturaId: number;
let inscripcionId: number;

let s1Id: number; // Primaria / 1° / A
let s2Id: number; // Primaria / 2° / B
let s3Id: number; // Secundaria / 1° / A
let s4Id: number; // Secundaria / 2° / B

let cAId: number; // pagado, pago completo
let cBId: number; // parcial, pago parcial
let cCId: number; // vencido, sin pago
let cDId: number; // pendiente, futuro, sin pago
let cEId: number; // cancelado → siempre excluido

let pAId: number; // payment para cA (100%)
let pBId: number; // payment para cB (parcial)

// ciclos únicos para evitar colisión con seed de demo
const CICLO_A = `RPT03A-${TS}`; // cA, cB, cD, cE
const CICLO_B = `RPT03B-${TS}`; // cC

// Token sin user.id (evita FK en audit_log)
const makeTok = (role = "administrador_campus") =>
  jwt.sign(
    { role, campus_id: campusId, tenant_id: tenantId },
    JWT_SECRET,
    { expiresIn: "1h" },
  );

let tok: string;
let tokAsistente: string;

// ─── beforeAll ────────────────────────────────────────────────────────────────
beforeAll(async () => {
  // tenant + campus
  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant RPT03 ${TS}`, `RPT03${TS}`],
  );
  tenantId = (tRow.rows[0] as any).id;

  const cRow = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus RPT03 ${TS}`, tenantId],
  );
  campusId = (cRow.rows[0] as any).id;

  // conceptos
  const con1 = await pool.query(
    `INSERT INTO concepts (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1,$2,$3,'mensual','mensual',100000) RETURNING id`,
    [campusId, tenantId, `Colegiatura RPT03-${TS}`],
  );
  colegiaturaId = (con1.rows[0] as any).id;

  const con2 = await pool.query(
    `INSERT INTO concepts (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1,$2,$3,'inscripcion','anual',50000) RETURNING id`,
    [campusId, tenantId, `Inscripcion RPT03-${TS}`],
  );
  inscripcionId = (con2.rows[0] as any).id;

  // estudiantes — 4 con distinto nivel/grado/grupo
  const insertStudent = async (
    nombre: string,
    nivel: string,
    grado: string,
    grupo: string,
  ): Promise<number> => {
    const r = await pool.query(
      `INSERT INTO students
         (nombres, apellido_paterno, nombre_completo,
          campus_id, tenant_id, id_referencia, status,
          nivel_escolar, grado, grupo)
       VALUES ($1,$2,$3,$4,$5,$6,'activo',$7,$8,$9)
       RETURNING id`,
      [
        nombre, `RPT03-${TS}`, `${nombre} RPT03-${TS}`,
        campusId, tenantId, `${TS}-${nombre.slice(0,4)}`,
        nivel, grado, grupo,
      ],
    );
    return (r.rows[0] as any).id as number;
  };

  s1Id = await insertStudent("S1Primaria1A",  "Primaria",    "1°", "A");
  s2Id = await insertStudent("S2Primaria2B",  "Primaria",    "2°", "B");
  s3Id = await insertStudent("S3Secundaria1A","Secundaria",  "1°", "A");
  s4Id = await insertStudent("S4Secundaria2B","Secundaria",  "2°", "B");

  // cargos
  const insertCharge = async (
    studentId: number,
    conceptId: number,
    ciclo: string,
    fechaEmision: string,
    fechaVencimiento: string,
    monto: number,
    beca: string,   // texto, p.ej. '0' o '20'
    recargo: number,
    estado: string,
  ): Promise<number> => {
    const r = await pool.query(
      `INSERT INTO charges
         (tenant_id, student_id, concept_id, ciclo_escolar,
          fecha_emision, fecha_vencimiento,
          monto_base_centavos, beca_aplicada, recargo_aplicado_centavos,
          estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        tenantId, studentId, conceptId, ciclo,
        fechaEmision, fechaVencimiento,
        monto, beca, recargo,
        estado,
      ],
    );
    return (r.rows[0] as any).id as number;
  };

  cAId = await insertCharge(s1Id, colegiaturaId, CICLO_A, "2025-08-01", "2025-09-01", 100_000, "0",  0,    "pagado");
  cBId = await insertCharge(s1Id, colegiaturaId, CICLO_A, "2025-09-01", "2025-10-01", 100_000, "20", 5_000, "parcial");
  cCId = await insertCharge(s2Id, inscripcionId, CICLO_B, "2024-08-01", "2024-09-01",  50_000, "0",  0,    "vencido");
  cDId = await insertCharge(s3Id, colegiaturaId, CICLO_A, "2026-08-01", "2026-09-30", 120_000, "0",  0,    "pendiente");
  cEId = await insertCharge(s4Id, colegiaturaId, CICLO_A, "2025-08-01", "2025-09-01",  80_000, "0",  0,    "cancelado");

  // pagos + payment_applications
  const insertPayment = async (chargeId: number, monto: number): Promise<number> => {
    const r = await pool.query(
      `INSERT INTO payments
         (tenant_id, charge_id, metodo, monto_centavos, fecha_pago, estado)
       VALUES ($1,$2,'efectivo',$3,CURRENT_DATE,'exitoso')
       RETURNING id`,
      [tenantId, chargeId, monto],
    );
    return (r.rows[0] as any).id as number;
  };

  pAId = await insertPayment(cAId, 100_000);
  pBId = await insertPayment(cBId,  30_000);

  // payment_applications — fuente de verdad para saldo_pendiente
  await pool.query(
    `INSERT INTO payment_applications (payment_id, charge_id, amount_centavos, applied_at)
     VALUES ($1,$2,$3,NOW())`,
    [pAId, cAId, 100_000],
  );
  await pool.query(
    `INSERT INTO payment_applications (payment_id, charge_id, amount_centavos, applied_at)
     VALUES ($1,$2,$3,NOW())`,
    [pBId, cBId, 30_000],
  );

  tok           = makeTok("administrador_campus");
  tokAsistente  = makeTok("asistente");
});

// ─── afterAll ─────────────────────────────────────────────────────────────────
afterAll(async () => {
  await pool.query(`DELETE FROM payment_applications WHERE payment_id IN ($1,$2)`, [pAId, pBId]).catch(() => {});
  await pool.query(`DELETE FROM payments WHERE id IN ($1,$2)`,  [pAId, pBId]).catch(() => {});
  for (const id of [cAId, cBId, cCId, cDId, cEId]) {
    if (id) await pool.query(`DELETE FROM charges WHERE id=$1`, [id]).catch(() => {});
  }
  for (const id of [s1Id, s2Id, s3Id, s4Id]) {
    if (id) await pool.query(`DELETE FROM students WHERE id=$1`, [id]).catch(() => {});
  }
  for (const id of [colegiaturaId, inscripcionId]) {
    if (id) await pool.query(`DELETE FROM concepts WHERE id=$1`, [id]).catch(() => {});
  }
  if (campusId) await pool.query(`DELETE FROM campuses WHERE id=$1`, [campusId]).catch(() => {});
  if (tenantId) await pool.query(`DELETE FROM tenants  WHERE id=$1`, [tenantId]).catch(() => {});
});

// ─── helpers ──────────────────────────────────────────────────────────────────
function authH(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function fixtureCharges(charges: any[]) {
  return charges.filter((c: any) =>
    [cAId, cBId, cCId, cDId, cEId].includes(c.charge_id)
  );
}

async function getCobranza(params = "", token = tok) {
  const r = await fetch(`${BASE}/api/reportes/cobranza${params ? "?" + params : ""}`, {
    headers: authH(token),
  });
  const body = await r.json();
  return { status: r.status, charges: (body.charges ?? []) as any[], body };
}

// ═════════════════════════════════════════════════════════════════════════════
describe("RPT-03 — Reporte de Cargos y Cobranza", () => {

  // ── Autenticación / autorización ───────────────────────────────────────────

  it("COB-01: GET sin token → 401", async () => {
    const r = await fetch(`${BASE}/api/reportes/cobranza`);
    expect(r.status).toBe(401);
  });

  it("COB-02: GET rol asistente → 200 (todos los roles tienen REPORTS.READ)", async () => {
    // REPORTS.READ está asignado a todos los roles admin (asistente inclusive).
    // Solo REPORTS.EXPORT tiene roles restringidos → probado en COB-19.
    const { status } = await getCobranza("", tokAsistente);
    expect(status).toBe(200);
  });

  // ── Columnas y exclusión de cancelados ────────────────────────────────────

  it("COB-03: GET sin filtros → 4 fixture visible (cA/cB/cC/cD); cE cancelado excluido", async () => {
    const { status, charges } = await getCobranza();
    expect(status).toBe(200);
    const fx = fixtureCharges(charges);
    expect(fx.map((c: any) => c.charge_id).sort()).toEqual([cAId, cBId, cCId, cDId].sort());
    const cE = charges.find((c: any) => c.charge_id === cEId);
    expect(cE).toBeUndefined();
  });

  it("COB-04: respuesta contiene las 15 columnas esperadas", async () => {
    const { charges } = await getCobranza();
    const row = fixtureCharges(charges)[0];
    expect(row).toBeDefined();
    for (const col of [
      "charge_id","alumno","nivel","grado","concepto","ciclo",
      "fecha_emision","fecha_vencimiento",
      "monto_base","descuento_beca","recargo","total",
      "monto_pagado","saldo_pendiente","estado","dias_vencido",
    ]) {
      expect(row).toHaveProperty(col);
    }
  });

  // ── Filtros ────────────────────────────────────────────────────────────────

  it("COB-05: filtro ciclo → solo cA/cB/cD (no cC cuyo ciclo es CICLO_B)", async () => {
    const { charges } = await getCobranza(`ciclo=${encodeURIComponent(CICLO_A)}`);
    const fx = fixtureCharges(charges).map((c: any) => c.charge_id).sort();
    expect(fx).toEqual([cAId, cBId, cDId].sort());
  });

  it("COB-06: filtro nivel=Secundaria → solo cD (s3); cA/cB/cC son Primaria", async () => {
    const { charges } = await getCobranza("nivel=Secundaria");
    const fx = fixtureCharges(charges);
    const ids = fx.map((c: any) => c.charge_id);
    expect(ids).toContain(cDId);
    expect(ids).not.toContain(cAId);
    expect(ids).not.toContain(cBId);
    expect(ids).not.toContain(cCId);
  });

  it("COB-07: filtro grado=2° → solo cC (s2 grado=2°)", async () => {
    const { charges } = await getCobranza("grado=2%C2%B0");   // "2°" URL-encoded
    const fx = fixtureCharges(charges);
    const ids = fx.map((c: any) => c.charge_id);
    expect(ids).toContain(cCId);
    expect(ids).not.toContain(cAId);
    expect(ids).not.toContain(cBId);
    expect(ids).not.toContain(cDId);
  });

  it("COB-08: filtro grupo=B → solo cC (s2 grupo=B; s4 tiene cancelado → excluido)", async () => {
    const { charges } = await getCobranza("grupo=B");
    const fx = fixtureCharges(charges);
    const ids = fx.map((c: any) => c.charge_id);
    expect(ids).toContain(cCId);
    expect(ids).not.toContain(cAId);
    expect(ids).not.toContain(cBId);
    expect(ids).not.toContain(cDId);
  });

  it("COB-09: filtro fecha_desde/fecha_hasta → cA y cB (emitidos en ago-sep 2025)", async () => {
    const { charges } = await getCobranza(
      "fecha_desde=2025-08-01&fecha_hasta=2025-09-30",
    );
    const fx = fixtureCharges(charges).map((c: any) => c.charge_id).sort();
    expect(fx).toEqual([cAId, cBId].sort());
  });

  it("COB-10: filtro concepto → solo cC (inscripcion)", async () => {
    const { charges } = await getCobranza(`concepto=${inscripcionId}`);
    const fx = fixtureCharges(charges);
    const ids = fx.map((c: any) => c.charge_id);
    expect(ids).toContain(cCId);
    expect(ids).not.toContain(cAId);
    expect(ids).not.toContain(cBId);
    expect(ids).not.toContain(cDId);
  });

  it("COB-11: filtro estado=vencido → solo cC", async () => {
    const { charges } = await getCobranza("estado=vencido");
    const fx = fixtureCharges(charges);
    const ids = fx.map((c: any) => c.charge_id);
    expect(ids).toContain(cCId);
    expect(ids.filter((id: number) => id !== cCId)).toHaveLength(0);
  });

  // ── saldo_pendiente (vía payment_applications) ────────────────────────────

  it("COB-12: cB parcial — total=85000, monto_pagado=30000, saldo_pendiente=55000", async () => {
    // total = ROUND(100000 * (1-20/100)) + 5000 = 80000 + 5000 = 85000
    const { charges } = await getCobranza();
    const cB = charges.find((c: any) => c.charge_id === cBId);
    expect(cB).toBeDefined();
    expect(cB.total).toBe(85_000);
    expect(cB.monto_pagado).toBe(30_000);
    expect(cB.saldo_pendiente).toBe(55_000);
    // descuento_beca = ROUND(100000 * 20/100) = 20000
    expect(cB.descuento_beca).toBe(20_000);
  });

  it("COB-13: cA pagado — saldo_pendiente=0, monto_pagado=100000", async () => {
    const { charges } = await getCobranza();
    const cA = charges.find((c: any) => c.charge_id === cAId);
    expect(cA).toBeDefined();
    expect(cA.monto_pagado).toBe(100_000);
    expect(cA.saldo_pendiente).toBe(0);
  });

  // ── dias_vencido ──────────────────────────────────────────────────────────

  it("COB-14: cC vencido sin pago → dias_vencido > 0 (venc 2024-09-01)", async () => {
    const { charges } = await getCobranza();
    const cC = charges.find((c: any) => c.charge_id === cCId);
    expect(cC).toBeDefined();
    expect(cC.dias_vencido).toBeGreaterThan(0);
  });

  it("COB-15: cD pendiente con vencimiento futuro → dias_vencido = 0", async () => {
    const { charges } = await getCobranza();
    const cD = charges.find((c: any) => c.charge_id === cDId);
    expect(cD).toBeDefined();
    expect(cD.dias_vencido).toBe(0);
  });

  it("COB-16: cA estado=pagado → dias_vencido = 0 aunque fecha_vencimiento pasada", async () => {
    const { charges } = await getCobranza();
    const cA = charges.find((c: any) => c.charge_id === cAId);
    expect(cA).toBeDefined();
    // fecha_vencimiento='2025-09-01' (pasada), pero estado='pagado' → dias_vencido=0
    expect(cA.dias_vencido).toBe(0);
  });

  // ── Exportación ───────────────────────────────────────────────────────────

  it("COB-17: POST exportar excel → 200 + Content-Type spreadsheetml + magic bytes ZIP", async () => {
    const r = await fetch(`${BASE}/api/reportes/cobranza/exportar`, {
      method: "POST",
      headers: { ...authH(tok), "Content-Type": "application/json" },
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

  it("COB-18: POST exportar pdf → 200 + Content-Type pdf + magic bytes %PDF", async () => {
    const r = await fetch(`${BASE}/api/reportes/cobranza/exportar`, {
      method: "POST",
      headers: { ...authH(tok), "Content-Type": "application/json" },
      body: JSON.stringify({ formato: "pdf" }),
    });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("pdf");
    const buf = Buffer.from(await r.arrayBuffer());
    // %PDF
    expect(buf[0]).toBe(0x25); // '%'
    expect(buf[1]).toBe(0x50); // 'P'
    expect(buf[2]).toBe(0x44); // 'D'
    expect(buf[3]).toBe(0x46); // 'F'
  }, 20_000);

  it("COB-19: POST exportar sin permiso (asistente) → 403", async () => {
    const r = await fetch(`${BASE}/api/reportes/cobranza/exportar`, {
      method: "POST",
      headers: { ...authH(tokAsistente), "Content-Type": "application/json" },
      body: JSON.stringify({ formato: "excel" }),
    });
    expect(r.status).toBe(403);
  });
});
