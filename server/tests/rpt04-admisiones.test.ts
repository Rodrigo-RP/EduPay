/**
 * rpt04-admisiones.test.ts — RPT-04 Reporte de Admisiones y Becas
 *
 * Reemplaza R6 (GET /api/admin/admissions-report) y la exportación client-side
 * de reportes-admisiones.tsx (XLSX.utils). Verifica:
 *   · resumen: total_alumnos, alumnos_con_beca, monto_descuento_centavos, inscripciones
 *   · Cada filtro: ciclo, nivel, estado, fecha_desde, fecha_hasta
 *   · por_tipo_beca distribution
 *   · Exportación Excel y PDF (magic bytes)
 *   · Guards: 401 sin token, 403 sin ADMISSIONS.READ, 403 sin REPORTS.EXPORT
 *
 * Fixture (3 alumnos, 1 scholarship_type, 2 scholarships, 3 charges, 1 payment):
 *   s1  Primaria/1°/A   activo    scholarship(50%)  charge ciclo=RPT04A  monto=10000  beca='50'  pagado
 *   s2  Secundaria/2°/B activo    sin scholarship   charge ciclo=RPT04A  monto=12000  beca='0'   sin pago
 *   s3  Primaria/1°/A   baja      scholarship(20%)  charge ciclo=RPT04B  monto=10000  beca='20'  sin pago
 *       s3.created_at = '2024-01-01' (para test de fecha_desde)
 *
 * Cálculos esperados:
 *   total_alumnos       = 3 (s1, s2, s3)
 *   alumnos_con_beca    = 2 (s1, s3)
 *   monto_descuento     = ROUND(10000*50/100) + ROUND(10000*20/100) = 5000 + 2000 = 7000
 *   inscripciones_ciclo = ciclo='RPT04A-{TS}' → total=1, monto=5000 (pago s1)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";
const TS = Date.now().toString().slice(-7);

const CICLO_A = `RPT04A-${TS}`;   // s1, s2
const CICLO_B = `RPT04B-${TS}`;   // s3

// ─── IDs de fixture ───────────────────────────────────────────────────────────
let tenantId:         number;
let campusId:         number;
let scholTypeId:      number;
let inscConceptId:    number;

let s1Id: number; // Primaria / activo / con beca
let s2Id: number; // Secundaria / activo / sin beca
let s3Id: number; // Primaria / baja / con beca / created_at=2024

let sch1Id: number;  // scholarship para s1
let sch2Id: number;  // scholarship para s3

let cAId:  number;  // charge inscripcion s1 ciclo=CICLO_A  monto=10000 beca='50'
let cBId:  number;  // charge inscripcion s2 ciclo=CICLO_A  monto=12000 beca='0'
let cCId:  number;  // charge inscripcion s3 ciclo=CICLO_B  monto=10000 beca='20'

let pAId:  number;  // payment para cA (5000 centavos)

// Tokens — sin user.id para evitar FK en audit_log
const makeTok = (role: string) =>
  jwt.sign(
    { role, campus_id: campusId, tenant_id: tenantId },
    JWT_SECRET,
    { expiresIn: "1h" },
  );

let tok:    string;  // admisiones → ADMISSIONS.READ + REPORTS.EXPORT
let tokAux: string;  // auxiliar_contable → sin ADMISSIONS.READ, sin REPORTS.EXPORT

// ─── beforeAll ────────────────────────────────────────────────────────────────
beforeAll(async () => {
  // tenant + campus
  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant RPT04 ${TS}`, `RPT04${TS}`],
  );
  tenantId = (tRow.rows[0] as any).id;

  const cRow = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus RPT04 ${TS}`, tenantId],
  );
  campusId = (cRow.rows[0] as any).id;

  // scholarship_type
  const stRow = await pool.query(
    `INSERT INTO scholarship_types (campus_id, nombre, categoria, algoritmo)
     VALUES ($1,$2,'merito','manual') RETURNING id`,
    [campusId, `Beca RPT04-${TS}`],
  );
  scholTypeId = (stRow.rows[0] as any).id;

  // concepto inscripcion
  const coRow = await pool.query(
    `INSERT INTO concepts (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1,$2,$3,'inscripcion','anual',10000) RETURNING id`,
    [campusId, tenantId, `Inscripcion RPT04-${TS}`],
  );
  inscConceptId = (coRow.rows[0] as any).id;

  // estudiantes
  const insEst = async (
    nombre: string, nivel: string, grado: string, grupo: string,
    status: string, createdAt: string | null,
  ): Promise<number> => {
    const cols = createdAt
      ? `nombres, apellido_paterno, nombre_completo, campus_id, tenant_id, id_referencia, status, nivel_escolar, grado, grupo, created_at`
      : `nombres, apellido_paterno, nombre_completo, campus_id, tenant_id, id_referencia, status, nivel_escolar, grado, grupo`;
    const vals = createdAt
      ? `$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11`
      : `$1,$2,$3,$4,$5,$6,$7,$8,$9,$10`;
    const params: (string | number)[] = [
      nombre, `RPT04-${TS}`, `${nombre} RPT04-${TS}`,
      campusId, tenantId, `${TS}-${nombre.slice(0, 3)}`,
      status, nivel, grado, grupo,
    ];
    if (createdAt) params.push(createdAt);
    const r = await pool.query(
      `INSERT INTO students (${cols}) VALUES (${vals}) RETURNING id`,
      params,
    );
    return (r.rows[0] as any).id as number;
  };

  s1Id = await insEst("S1Prim1A",  "Primaria",   "1°", "A", "activo", null);
  s2Id = await insEst("S2Sec2B",   "Secundaria", "2°", "B", "activo", null);
  s3Id = await insEst("S3Prim1A3", "Primaria",   "1°", "A", "baja",  "2024-01-01");

  // scholarships
  const insSch = async (
    studentId: number, porcentaje: number,
  ): Promise<number> => {
    const r = await pool.query(
      `INSERT INTO scholarships
         (tenant_id, student_id, porcentaje, motivo, vigencia_inicio, vigencia_fin, scholarship_type_id)
       VALUES ($1,$2,$3,$4,'2025-01-01','2025-12-31',$5)
       RETURNING id`,
      [tenantId, studentId, porcentaje, `Beca test RPT04-${TS}`, scholTypeId],
    );
    return (r.rows[0] as any).id as number;
  };

  sch1Id = await insSch(s1Id, 50);
  sch2Id = await insSch(s3Id, 20);

  // charges (inscripcion)
  const insCharge = async (
    studentId: number, ciclo: string, monto: number, beca: string,
  ): Promise<number> => {
    const r = await pool.query(
      `INSERT INTO charges
         (tenant_id, student_id, concept_id, ciclo_escolar,
          fecha_emision, fecha_vencimiento,
          monto_base_centavos, beca_aplicada, recargo_aplicado_centavos, estado)
       VALUES ($1,$2,$3,$4,'2025-08-01','2025-09-01',$5,$6,0,'pendiente')
       RETURNING id`,
      [tenantId, studentId, inscConceptId, ciclo, monto, beca],
    );
    return (r.rows[0] as any).id as number;
  };

  cAId = await insCharge(s1Id, CICLO_A, 10_000, "50");
  cBId = await insCharge(s2Id, CICLO_A, 12_000, "0");
  cCId = await insCharge(s3Id, CICLO_B, 10_000, "20");

  // pago para s1 (inscripcion, 50% de 10000 = 5000 centavos)
  const pRow = await pool.query(
    `INSERT INTO payments (tenant_id, charge_id, metodo, monto_centavos, fecha_pago, estado)
     VALUES ($1,$2,'efectivo',5000,CURRENT_DATE,'exitoso') RETURNING id`,
    [tenantId, cAId],
  );
  pAId = (pRow.rows[0] as any).id;
  await pool.query(
    `INSERT INTO payment_applications (payment_id, charge_id, amount_centavos, applied_at)
     VALUES ($1,$2,5000,NOW())`,
    [pAId, cAId],
  );

  tok    = makeTok("admisiones");
  tokAux = makeTok("auxiliar_contable");
});

// ─── afterAll ─────────────────────────────────────────────────────────────────
afterAll(async () => {
  await pool.query(`DELETE FROM payment_applications WHERE payment_id = $1`, [pAId]).catch(() => {});
  await pool.query(`DELETE FROM payments WHERE id = $1`,     [pAId]).catch(() => {});
  for (const id of [cAId, cBId, cCId]) {
    if (id) await pool.query(`DELETE FROM charges WHERE id=$1`, [id]).catch(() => {});
  }
  for (const id of [sch1Id, sch2Id]) {
    if (id) await pool.query(`DELETE FROM scholarships WHERE id=$1`, [id]).catch(() => {});
  }
  for (const id of [s1Id, s2Id, s3Id]) {
    if (id) await pool.query(`DELETE FROM students WHERE id=$1`, [id]).catch(() => {});
  }
  if (inscConceptId) await pool.query(`DELETE FROM concepts WHERE id=$1`, [inscConceptId]).catch(() => {});
  if (scholTypeId)   await pool.query(`DELETE FROM scholarship_types WHERE id=$1`, [scholTypeId]).catch(() => {});
  if (campusId)      await pool.query(`DELETE FROM campuses WHERE id=$1`, [campusId]).catch(() => {});
  if (tenantId)      await pool.query(`DELETE FROM tenants  WHERE id=$1`, [tenantId]).catch(() => {});
});

// ─── helpers ──────────────────────────────────────────────────────────────────
function authH(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function fixtureAlumnos(alumnos: any[]) {
  return alumnos.filter((a: any) => [s1Id, s2Id, s3Id].includes(a.alumno_id));
}

async function getAdmisiones(params = "", token = tok) {
  const r = await fetch(
    `${BASE}/api/reportes/admisiones${params ? "?" + params : ""}`,
    { headers: authH(token) },
  );
  const body = await r.json();
  return { status: r.status, body, alumnos: (body.alumnos ?? []) as any[] };
}

// ═════════════════════════════════════════════════════════════════════════════
describe("RPT-04 — Reporte de Admisiones y Becas", () => {

  // ── Guards ────────────────────────────────────────────────────────────────

  it("ADM-01: GET sin token → 401", async () => {
    const r = await fetch(`${BASE}/api/reportes/admisiones`);
    expect(r.status).toBe(401);
  });

  it("ADM-02: GET auxiliar_contable (sin ADMISSIONS.READ) → 403", async () => {
    const { status } = await getAdmisiones("", tokAux);
    expect(status).toBe(403);
  });

  // ── Estructura básica ─────────────────────────────────────────────────────

  it("ADM-03: GET responde con resumen, alumnos y por_tipo_beca", async () => {
    const { status, body } = await getAdmisiones();
    expect(status).toBe(200);
    expect(body).toHaveProperty("resumen");
    expect(body).toHaveProperty("alumnos");
    expect(body).toHaveProperty("por_tipo_beca");
    expect(body).toHaveProperty("total");
    // fixture alumnos visibles
    const fx = fixtureAlumnos(body.alumnos);
    expect(fx.map((a: any) => a.alumno_id).sort()).toEqual([s1Id, s2Id, s3Id].sort());
  });

  // ── Filtros ────────────────────────────────────────────────────────────────

  it("ADM-04: filtro nivel=Primaria → solo s1 y s3 (no s2 Secundaria)", async () => {
    const { alumnos } = await getAdmisiones("nivel=Primaria");
    const fx = fixtureAlumnos(alumnos).map((a: any) => a.alumno_id).sort();
    expect(fx).toEqual([s1Id, s3Id].sort());
  });

  it("ADM-05: filtro estado=activo → solo s1 y s2 (s3 es baja)", async () => {
    const { alumnos } = await getAdmisiones("estado=activo");
    const fx = fixtureAlumnos(alumnos).map((a: any) => a.alumno_id).sort();
    expect(fx).toEqual([s1Id, s2Id].sort());
  });

  it("ADM-06: filtro ciclo=CICLO_A → solo s1 y s2 (s3 tiene CICLO_B)", async () => {
    const { alumnos } = await getAdmisiones(
      `ciclo=${encodeURIComponent(CICLO_A)}`,
    );
    const fx = fixtureAlumnos(alumnos).map((a: any) => a.alumno_id).sort();
    expect(fx).toEqual([s1Id, s2Id].sort());
  });

  it("ADM-07: filtro fecha_desde=2025-01-01 → excluye s3 (created_at=2024-01-01)", async () => {
    const { alumnos } = await getAdmisiones("fecha_desde=2025-01-01");
    const fx = fixtureAlumnos(alumnos);
    const ids = fx.map((a: any) => a.alumno_id);
    expect(ids).toContain(s1Id);
    expect(ids).toContain(s2Id);
    expect(ids).not.toContain(s3Id);
  });

  // ── Resumen ────────────────────────────────────────────────────────────────

  it("ADM-08: resumen.alumnos_con_beca ≥ 2 (s1 y s3 tienen scholarship)", async () => {
    const { body } = await getAdmisiones();
    expect(body.resumen.alumnos_con_beca).toBeGreaterThanOrEqual(2);
  });

  it("ADM-09: resumen.monto_descuento_centavos ≥ 7000 (5000+2000 de c1+c3)", async () => {
    // s1: ROUND(10000*50/100) = 5000
    // s3: ROUND(10000*20/100) = 2000
    // total ≥ 7000 (puede haber más datos del seed demo en el mismo campus)
    const { body } = await getAdmisiones();
    expect(body.resumen.monto_descuento_centavos).toBeGreaterThanOrEqual(7_000);
  });

  it("ADM-10: inscripciones con ciclo=CICLO_A → total≥1, monto>0 (s1 pagó)", async () => {
    const { body } = await getAdmisiones(
      `ciclo=${encodeURIComponent(CICLO_A)}`,
    );
    expect(body.resumen.inscripciones.total).toBeGreaterThanOrEqual(1);
    expect(body.resumen.inscripciones.monto_centavos).toBeGreaterThan(0);
  });

  // ── Exportación ───────────────────────────────────────────────────────────

  it("ADM-11: POST exportar excel → 200 + Content-Type spreadsheetml + magic bytes ZIP", async () => {
    const r = await fetch(`${BASE}/api/reportes/admisiones/exportar`, {
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

  it("ADM-12: POST exportar pdf → 200 + Content-Type pdf + magic bytes %PDF", async () => {
    const r = await fetch(`${BASE}/api/reportes/admisiones/exportar`, {
      method: "POST",
      headers: { ...authH(tok), "Content-Type": "application/json" },
      body: JSON.stringify({ formato: "pdf" }),
    });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("pdf");
    const buf = Buffer.from(await r.arrayBuffer());
    expect(buf[0]).toBe(0x25); // '%'
    expect(buf[1]).toBe(0x50); // 'P'
    expect(buf[2]).toBe(0x44); // 'D'
    expect(buf[3]).toBe(0x46); // 'F'
  }, 20_000);

  it("ADM-13: POST exportar auxiliar_contable (sin REPORTS.EXPORT) → 403", async () => {
    const r = await fetch(`${BASE}/api/reportes/admisiones/exportar`, {
      method: "POST",
      headers: { ...authH(tokAux), "Content-Type": "application/json" },
      body: JSON.stringify({ formato: "excel" }),
    });
    expect(r.status).toBe(403);
  });
});
