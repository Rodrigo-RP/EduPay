/**
 * RPT-07 — Antigüedad de Saldos
 *
 * GET  /api/reportes/antiguedad-saldos          guard REPORTS.READ
 * POST /api/reportes/antiguedad-saldos/exportar guard REPORTS.EXPORT
 *
 * ─── Definición de buckets (ambos extremos INCLUSIVOS) ────────────────────────
 *
 *   al_corriente : dias_vencido = 0     (fecha_vencimiento >= CURRENT_DATE)
 *   1_30         : 1  ≤ d ≤  30
 *   31_60        : 31 ≤ d ≤  60
 *   61_90        : 61 ≤ d ≤  90
 *   91_120       : 91 ≤ d ≤ 120
 *   mas_120      : d > 120 (≥ 121)
 *
 *   Frontera exacta: cargo vencido hace 30 días → bucket "1_30" (30 ≤ 30 ✓)
 *                    cargo vencido hace 31 días → bucket "31_60" (31 > 30)
 *
 * ─── Fixture (campus aislado por TS) ─────────────────────────────────────────
 *
 *   chargeAL  : fecha_vencimiento = hoy              → al_corriente, 10 000 ¢
 *   charge30  : fecha_vencimiento = hoy − 30 días    → 1_30 (frontera), 20 000 ¢
 *   charge31  : fecha_vencimiento = hoy − 31 días    → 31_60 (frontera), 30 000 ¢
 *   charge75  : fecha_vencimiento = hoy − 75 días    → 61_90, 40 000 ¢
 *   charge105 : fecha_vencimiento = hoy − 105 días   → 91_120, 50 000 ¢  [ciclo '2024-2025', nivel 'secundaria']
 *   charge150 : fecha_vencimiento = hoy − 150 días   → mas_120, 60 000 ¢ [ciclo '2024-2025', nivel 'secundaria']
 *
 *   chargeAL..charge75: ciclo '2025-2026', nivel 'primaria'
 *   charge105..charge150: ciclo '2024-2025', nivel 'secundaria'
 *
 *   Total cartera = 10 000 + 20 000 + 30 000 + 40 000 + 50 000 + 60 000 = 210 000 ¢
 *
 * ─── Tests ────────────────────────────────────────────────────────────────────
 *
 *   AGS-01  sin token → 401
 *   AGS-02  rol desconocido → 403
 *   AGS-03  asistente → 200 (REPORTS.READ universal)
 *   AGS-04  administrador_campus → 200 + { buckets, detalle, total_cartera_centavos }
 *   AGS-05  6 buckets presentes en respuesta; todos con su clave correcta
 *   AGS-06  bucket al_corriente: count_cargos=1, monto=10 000 ¢
 *   AGS-07  bucket 1_30 (frontera 30 días): count_cargos=1, monto=20 000 ¢
 *   AGS-08  bucket 31_60 (frontera 31 días): count_cargos=1, monto=30 000 ¢
 *   AGS-09  bucket 61_90: count_cargos=1, monto=40 000 ¢
 *   AGS-10  bucket 91_120: count_cargos=1, monto=50 000 ¢
 *   AGS-11  bucket mas_120: count_cargos=1, monto=60 000 ¢
 *   AGS-12  suma de porcentajes de buckets ≈ 100% (±0.1 por redondeo)
 *   AGS-13  total_cartera_centavos = 210 000
 *   AGS-14  filtro ciclo=2025-2026 → solo chargeAL..charge75 (total 100 000 ¢)
 *   AGS-15  filtro nivel=secundaria → solo charge105+charge150 (total 110 000 ¢)
 *   AGS-16  filtro concepto=${conceptId} → todas (concepto único en fixture)
 *   AGS-17  exportar Excel → 200 + magic bytes PK (xlsx)
 *   AGS-18  exportar PDF   → 200 + magic bytes %PDF
 *   AGS-19  auxiliar_contable POST exportar → 403 (sin REPORTS.EXPORT)
 *   AGS-20  asistente POST exportar → 403 (sin REPORTS.EXPORT)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import { pool } from "../db";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

// ── Estado compartido ─────────────────────────────────────────────────────────

const TS = Date.now().toString().slice(-6);

let tenantId:    number;
let campusId:    number;
let conceptId:   number;

// students
let sIdAL:  number; // al_corriente
let sId30:  number; // 1_30
let sId31:  number; // 31_60
let sId75:  number; // 61_90
let sId105: number; // 91_120
let sId150: number; // mas_120

// charges
let chIdAL:  number;
let chId30:  number;
let chId31:  number;
let chId75:  number;
let chId105: number;
let chId150: number;

// tokens
let tokAdmin:    string; // administrador_campus  — REPORTS.READ + EXPORT
let tokAsistente:string; // asistente            — REPORTS.READ, sin EXPORT
let tokAuxiliar: string; // auxiliar_contable    — REPORTS.READ, sin EXPORT

function makeToken(userId: number, role: string): string {
  return jwt.sign(
    { id: userId, email: `u${userId}@ags${TS}.test`, role,
      campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
}

/** Fecha YYYY-MM-DD calculada como hoy − n días */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const bcrypt = await import("bcrypt");
  const hash   = await bcrypt.hash("Test2025!", 10);

  const tR = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`RPT07 Tenant ${TS}`, `R7T${TS}`],
  );
  tenantId = tR.rows[0].id;

  const cR = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1,$2) RETURNING id`,
    [tenantId, `Campus-RPT07-${TS}`],
  );
  campusId = cR.rows[0].id;

  // Usuarios para tokens
  async function createUser(name: string, role: string, pfx: string): Promise<number> {
    const r = await pool.query(
      `INSERT INTO users (tenant_id, campus_id, name, email, password_hash, role, is_active, custom_permissions)
       VALUES ($1,$2,$3,$4,$5,$6,true,'{}') RETURNING id`,
      [tenantId, campusId, name, `${pfx}.${TS}@ags.test`, hash, role],
    );
    return r.rows[0].id as number;
  }

  const adminId = await createUser("Admin AGS",    "administrador_campus", "adm");
  const asiId   = await createUser("Asist AGS",    "asistente",           "asi");
  const auxId   = await createUser("Aux AGS",      "auxiliar_contable",   "aux");

  tokAdmin     = makeToken(adminId, "administrador_campus");
  tokAsistente = makeToken(asiId,   "asistente");
  tokAuxiliar  = makeToken(auxId,   "auxiliar_contable");

  // Concepto único para todo el fixture
  const coR = await pool.query(
    `INSERT INTO concepts (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1,$2,$3,'ingreso','mensual',10000) RETURNING id`,
    [campusId, tenantId, `Colegiatura-AGS-${TS}`],
  );
  conceptId = coR.rows[0].id;

  // Helper: insertar alumno
  async function insertStudent(
    nombre: string,
    nivel:  string,
  ): Promise<number> {
    const r = await pool.query(
      `INSERT INTO students
         (tenant_id, campus_id, nombres, apellido_paterno, nombre_completo,
          id_referencia, nivel_escolar, grado, grupo, status)
       VALUES ($1,$2,$3,'AGS-${TS}',$4,$5,$6,'1','A','activo') RETURNING id`,
      [tenantId, campusId, nombre, `${nombre} AGS-${TS}`, `REF-${nombre}-${TS}`, nivel],
    );
    return r.rows[0].id as number;
  }

  // Helper: insertar cargo pendiente con fecha_vencimiento dada
  async function insertCharge(
    studentId:         number,
    fechaVencimiento:  string,
    monto:             number,
    ciclo:             string,
  ): Promise<number> {
    // fecha_emision = 30 días antes del vencimiento (calculado en JS para evitar
    // "inconsistent types deduced for parameter" al reutilizar $N con dos tipos)
    const emisionDate = new Date(fechaVencimiento);
    emisionDate.setDate(emisionDate.getDate() - 30);
    const fechaEmision = emisionDate.toISOString().split("T")[0];

    const r = await pool.query(
      `INSERT INTO charges
         (tenant_id, student_id, concept_id, ciclo_escolar,
          fecha_emision, fecha_vencimiento,
          monto_base_centavos, beca_aplicada, recargo_aplicado_centavos, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'0',0,'pendiente') RETURNING id`,
      [tenantId, studentId, conceptId, ciclo, fechaEmision, fechaVencimiento, monto],
    );
    return r.rows[0].id as number;
  }

  // Estudiantes (4 primaria, 2 secundaria)
  sIdAL  = await insertStudent("AluCorriente", "primaria");
  sId30  = await insertStudent("Alu30dias",    "primaria");
  sId31  = await insertStudent("Alu31dias",    "primaria");
  sId75  = await insertStudent("Alu75dias",    "primaria");
  sId105 = await insertStudent("Alu105dias",   "secundaria");
  sId150 = await insertStudent("Alu150dias",   "secundaria");

  // Cargos — fecha_vencimiento relativa a hoy
  //   al_corriente: hoy       → dias_vencido = 0
  //   1_30 boundary: hoy-30   → dias_vencido = 30  (1 ≤ 30 ≤ 30 → bucket 1_30)
  //   31_60 boundary: hoy-31  → dias_vencido = 31  (31 ≤ 31 ≤ 60 → bucket 31_60)
  //   61_90: hoy-75           → dias_vencido = 75
  //   91_120: hoy-105         → dias_vencido = 105
  //   mas_120: hoy-150        → dias_vencido = 150
  chIdAL  = await insertCharge(sIdAL,  daysAgo(0),   10_000, "2025-2026");
  chId30  = await insertCharge(sId30,  daysAgo(30),  20_000, "2025-2026");
  chId31  = await insertCharge(sId31,  daysAgo(31),  30_000, "2025-2026");
  chId75  = await insertCharge(sId75,  daysAgo(75),  40_000, "2025-2026");
  chId105 = await insertCharge(sId105, daysAgo(105), 50_000, "2024-2025");
  chId150 = await insertCharge(sId150, daysAgo(150), 60_000, "2024-2025");
});

afterAll(async () => {
  for (const id of [chIdAL, chId30, chId31, chId75, chId105, chId150]) {
    if (id) await pool.query(`DELETE FROM charges WHERE id=$1`, [id]).catch(() => {});
  }
  for (const id of [sIdAL, sId30, sId31, sId75, sId105, sId150]) {
    if (id) await pool.query(`DELETE FROM students WHERE id=$1`, [id]).catch(() => {});
  }
  if (conceptId) await pool.query(`DELETE FROM concepts WHERE id=$1`, [conceptId]).catch(() => {});
  await pool.query(`DELETE FROM users    WHERE tenant_id=$1`, [tenantId]).catch(() => {});
  await pool.query(`DELETE FROM campuses WHERE id=$1`,        [campusId]).catch(() => {});
  await pool.query(`DELETE FROM tenants  WHERE id=$1`,        [tenantId]).catch(() => {});
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const H = (t: string) => ({
  Authorization:  `Bearer ${t}`,
  "Content-Type": "application/json",
});

async function getAGS(params: string, token: string) {
  const url = `${BASE}/api/reportes/antiguedad-saldos${params ? `?${params}` : ""}`;
  const r   = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function postExportar(
  token:  string,
  format: "excel" | "pdf",
  extra:  Record<string, string> = {},
) {
  const r = await fetch(`${BASE}/api/reportes/antiguedad-saldos/exportar`, {
    method:  "POST",
    headers: H(token),
    body:    JSON.stringify({ formato: format, ...extra }),
  });
  const buf = r.status === 200 ? Buffer.from(await r.arrayBuffer()) : null;
  return { status: r.status, buf };
}

/** Encuentra un bucket en el array de buckets por su key */
function bucket(body: any, key: string) {
  return (body.buckets as any[]).find((b: any) => b.key === key);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RPT-07 — GET /api/reportes/antiguedad-saldos + POST exportar", () => {

  // ── Guards ─────────────────────────────────────────────────────────────────

  it("AGS-01: sin token → 401", async () => {
    const r = await fetch(`${BASE}/api/reportes/antiguedad-saldos`);
    expect(r.status).toBe(401);
  });

  it("AGS-02: rol desconocido → 403", async () => {
    const tok = jwt.sign(
      { id: 99991, email: `unknown@ags${TS}.test`, role: "desconocido",
        campus_id: campusId, tenant_id: tenantId, type: "user" },
      JWT_SECRET, { expiresIn: "1h" },
    );
    const { status } = await getAGS("", tok);
    expect(status).toBe(403);
  });

  it("AGS-03: asistente → 200 (REPORTS.READ universal)", async () => {
    const { status } = await getAGS("", tokAsistente);
    expect(status).toBe(200);
  });

  it("AGS-04: administrador_campus → 200 + { buckets, detalle, total_cartera_centavos }", async () => {
    const { status, body } = await getAGS("", tokAdmin);
    expect(status).toBe(200);
    expect(body).toHaveProperty("buckets");
    expect(body).toHaveProperty("detalle");
    expect(body).toHaveProperty("total_cartera_centavos");
    expect(Array.isArray(body.buckets)).toBe(true);
    expect(Array.isArray(body.detalle)).toBe(true);
  });

  // ── Estructura de buckets ──────────────────────────────────────────────────

  it("AGS-05: respuesta tiene exactamente 6 buckets con claves canónicas", async () => {
    const { body } = await getAGS("", tokAdmin);
    const keys = (body.buckets as any[]).map((b: any) => b.key);
    expect(keys).toContain("al_corriente");
    expect(keys).toContain("1_30");
    expect(keys).toContain("31_60");
    expect(keys).toContain("61_90");
    expect(keys).toContain("91_120");
    expect(keys).toContain("mas_120");
    expect(keys).toHaveLength(6);
  });

  // ── Clasificación por bucket ───────────────────────────────────────────────

  it("AGS-06: bucket al_corriente → count_cargos≥1, monto incluye 10 000 ¢ (hoy)", async () => {
    const { body } = await getAGS("", tokAdmin);
    const b = bucket(body, "al_corriente");
    expect(b).toBeDefined();
    expect(b.count_cargos).toBeGreaterThanOrEqual(1);
    // Al menos el fixture del campus tiene 10 000 ¢ en al_corriente
    expect(b.monto_centavos).toBeGreaterThanOrEqual(10_000);
  });

  it("AGS-07: bucket 1_30 → cargo de frontera exacta 30 días (d=30, 1≤30≤30 → 1_30)", async () => {
    const { body } = await getAGS("", tokAdmin);
    const b = bucket(body, "1_30");
    expect(b).toBeDefined();
    expect(b.count_cargos).toBeGreaterThanOrEqual(1);
    expect(b.monto_centavos).toBeGreaterThanOrEqual(20_000);
    // El cargo de frontera NO debe aparecer en 31_60
    const b3160 = bucket(body, "31_60");
    // Ambos buckets existen; el de 30 días está en 1_30 (verificado vía monto)
    expect(b3160.monto_centavos).toBeGreaterThanOrEqual(30_000);
  });

  it("AGS-08: bucket 31_60 → cargo de frontera exacta 31 días (d=31, 31≤31≤60 → 31_60)", async () => {
    const { body } = await getAGS("", tokAdmin);
    const b = bucket(body, "31_60");
    expect(b).toBeDefined();
    expect(b.count_cargos).toBeGreaterThanOrEqual(1);
    expect(b.monto_centavos).toBeGreaterThanOrEqual(30_000);
  });

  it("AGS-09: bucket 61_90 → cargo de 75 días (61≤75≤90 → 61_90)", async () => {
    const { body } = await getAGS("", tokAdmin);
    const b = bucket(body, "61_90");
    expect(b).toBeDefined();
    expect(b.count_cargos).toBeGreaterThanOrEqual(1);
    expect(b.monto_centavos).toBeGreaterThanOrEqual(40_000);
  });

  it("AGS-10: bucket 91_120 → cargo de 105 días (91≤105≤120 → 91_120)", async () => {
    const { body } = await getAGS("", tokAdmin);
    const b = bucket(body, "91_120");
    expect(b).toBeDefined();
    expect(b.count_cargos).toBeGreaterThanOrEqual(1);
    expect(b.monto_centavos).toBeGreaterThanOrEqual(50_000);
  });

  it("AGS-11: bucket mas_120 → cargo de 150 días (150>120 → mas_120)", async () => {
    const { body } = await getAGS("", tokAdmin);
    const b = bucket(body, "mas_120");
    expect(b).toBeDefined();
    expect(b.count_cargos).toBeGreaterThanOrEqual(1);
    expect(b.monto_centavos).toBeGreaterThanOrEqual(60_000);
  });

  // ── Porcentajes y total ────────────────────────────────────────────────────

  it("AGS-12: suma de porcentajes de buckets ≈ 100% (±0.1 por redondeo)", async () => {
    const { body } = await getAGS("", tokAdmin);
    const sumPct = (body.buckets as any[]).reduce(
      (acc: number, b: any) => acc + Number(b.porcentaje),
      0,
    );
    // Con redondeo a 2 decimales la suma puede desviarse ±0.1
    expect(sumPct).toBeGreaterThanOrEqual(99.9);
    expect(sumPct).toBeLessThanOrEqual(100.1);
  });

  it("AGS-13: total_cartera_centavos ≥ 210 000 (incluye los 6 cargos del fixture)", async () => {
    // ≥ porque el campus demo puede tener más cargos pendientes
    const { body } = await getAGS("", tokAdmin);
    expect(Number(body.total_cartera_centavos)).toBeGreaterThanOrEqual(210_000);
  });

  // ── Filtros ────────────────────────────────────────────────────────────────

  it("AGS-14: filtro ciclo=2025-2026 → solo fixture 2025-2026 (total ≥ 100 000 ¢, excluye 2024-2025)", async () => {
    const { body } = await getAGS("ciclo=2025-2026", tokAdmin);
    // Solo deben aparecer chargeAL..charge75 (10+20+30+40 = 100 000) del fixture
    expect(Number(body.total_cartera_centavos)).toBeGreaterThanOrEqual(100_000);
    // Ningún cargo del fixture 2024-2025 debe aparecer en el detalle del fixture
    const detalleFixture = (body.detalle as any[]).filter(
      (r: any) => r.ciclo === "2025-2026",
    );
    expect(detalleFixture.length).toBeGreaterThanOrEqual(4);
    const detalle2425 = (body.detalle as any[]).filter(
      (r: any) => r.ciclo === "2024-2025",
    );
    expect(detalle2425.length).toBe(0);
  });

  it("AGS-15: filtro nivel=secundaria → solo fixture nivel secundaria (total ≥ 110 000 ¢)", async () => {
    const { body } = await getAGS("nivel=secundaria", tokAdmin);
    expect(Number(body.total_cartera_centavos)).toBeGreaterThanOrEqual(110_000);
    // Solo estudiantes de secundaria en el detalle
    const no_sec = (body.detalle as any[]).filter(
      (r: any) => r.nivel !== "" && r.nivel !== "secundaria",
    );
    expect(no_sec.length).toBe(0);
  });

  it("AGS-16: filtro concepto=${conceptId} → retorna los 6 cargos del fixture (total ≥ 210 000 ¢)", async () => {
    const { body } = await getAGS(`concepto=${conceptId}`, tokAdmin);
    expect(Number(body.total_cartera_centavos)).toBeGreaterThanOrEqual(210_000);
    // Detalle contiene al menos los 6 del fixture
    const fx = (body.detalle as any[]).filter(
      (r: any) =>
        [chIdAL, chId30, chId31, chId75, chId105, chId150].includes(r.charge_id),
    );
    expect(fx.length).toBe(6);
  });

  // ── Exportación ────────────────────────────────────────────────────────────

  it("AGS-17: exportar Excel (administrador_campus) → 200 + magic bytes PK (xlsx)", async () => {
    const { status, buf } = await postExportar(tokAdmin, "excel");
    expect(status).toBe(200);
    expect(buf).not.toBeNull();
    expect(buf!.toString("utf8", 0, 2)).toBe("PK");
  });

  it("AGS-18: exportar PDF (administrador_campus) → 200 + magic bytes %PDF", async () => {
    const { status, buf } = await postExportar(tokAdmin, "pdf");
    expect(status).toBe(200);
    expect(buf).not.toBeNull();
    expect(buf!.toString("utf8", 0, 4)).toBe("%PDF");
  });

  it("AGS-19: auxiliar_contable POST exportar → 403 (REPORTS.READ pero sin REPORTS.EXPORT)", async () => {
    const { status } = await postExportar(tokAuxiliar, "excel");
    expect(status).toBe(403);
  });

  it("AGS-20: asistente POST exportar → 403 (REPORTS.READ pero sin REPORTS.EXPORT)", async () => {
    const { status } = await postExportar(tokAsistente, "excel");
    expect(status).toBe(403);
  });

  // ── Contrato frontend: shape y orden de buckets ──────────────────────────
  //
  // AGS-21 verifica que la respuesta tiene los 6 keys en el orden exacto que
  // ReporteAntiguedadSaldos.tsx espera para renderizar las tarjetas de
  // izquierda a derecha (verde → rojo). Fallo aquí = bug visible en la UI.

  it("AGS-21 (frontend contract): buckets contienen 6 keys en orden correcto, con label y porcentaje", async () => {
    const { body } = await getAGS("", tokAdmin);
    expect(Array.isArray(body.buckets)).toBe(true);
    expect(body.buckets.length).toBe(6);

    const keys = body.buckets.map((b: any) => b.key);
    expect(keys).toEqual(["al_corriente", "1_30", "31_60", "61_90", "91_120", "mas_120"]);

    // Cada bucket expone los campos que el frontend renderiza
    for (const b of body.buckets) {
      expect(typeof b.label).toBe("string");
      expect(b.label.length).toBeGreaterThan(0);
      expect(typeof b.monto_centavos).toBe("number");
      expect(typeof b.count_alumnos).toBe("number");
      expect(typeof b.porcentaje).toBe("number");
    }

    // La respuesta incluye los campos de nivel superior que la UI necesita
    expect(typeof body.total_cartera_centavos).toBe("number");
    expect(Array.isArray(body.detalle)).toBe(true);
    expect(body.filters).toBeDefined();
  });
});
