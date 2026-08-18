/**
 * server/tests/rpt05-consejo.test.ts — RPT-05 Reporte Consejo Directivo
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  /api/reportes/consejo          guard FINANCIAL.READ
 * POST /api/reportes/consejo/exportar guard REPORTS.EXPORT
 *
 * Fixture
 * ───────
 *   1 tenant + campus aislado (TS único)
 *   1 concepto de mensualidad
 *   1 alumno activo
 *   charge1: ciclo='2025-2026', monto_base=60000, estado='pendiente'
 *   payment1: charge1, monto=40000, created_at='2025-06-15'  (año 2025)
 *   charge2: ciclo='2024-2025', monto_base=50000, estado='pendiente'
 *   payment2: charge2, monto=30000, created_at='2024-12-15'  (año 2024)
 *
 * Tests de filtro
 * ───────────────
 *   CSJ-06  ?ciclo=2025-2026       → ingresos_mes = 40000 (payment1 solo)
 *   CSJ-07  ?ciclo=2024-2025       → ingresos_mes = 30000 (payment2 solo)
 *   CSJ-08  ?fecha_desde/hasta 2025 → ingresos_mes = 40000
 *   CSJ-09  ?fecha_desde/hasta 2024 → ingresos_mes = 30000
 *
 * Tests de exportación
 * ─────────────────────
 *   CSJ-10  POST excel → 200, magic bytes PK (xlsx)
 *   CSJ-11  POST pdf   → 200, magic bytes %PDF
 *   CSJ-12  POST sin REPORTS.EXPORT → 403
 *
 * RBAC FINANCIAL.READ
 * ────────────────────
 *   CON permiso:  administrador_campus, contador_general, administrador_general
 *   SIN permiso:  asistente, admisiones, auxiliar_contable
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";
const TS         = Date.now().toString().slice(-7);

// ─── variables de fixture ─────────────────────────────────────────────────────

let tenantId:   number;
let campusId:   number;
let studentId:  number;
let conceptId:  number;
let charge1Id:  number;
let charge2Id:  number;
let charge3Id:  number;  // creado este mes → aparece en tendencias del mes actual
let payment1Id: number;
let payment2Id: number;
let payment3Id: number;  // 55000 ¢ este mes → verifica valor en tendencias

let tokAdmin:      string;  // administrador_campus  — FINANCIAL.READ + REPORTS.EXPORT
let tokContador:   string;  // contador_general      — FINANCIAL.READ
let tokAsistente:  string;  // asistente             — SIN FINANCIAL.READ
let tokAdmisiones: string;  // admisiones            — SIN FINANCIAL.READ

const makeToken = (id: number, role: string) =>
  jwt.sign({ id, role, campus_id: campusId, tenant_id: tenantId }, JWT_SECRET, { expiresIn: "1h" });

// ─── helpers de petición ──────────────────────────────────────────────────────

const get = async (path: string, token?: string) => {
  const h: Record<string, string> = {};
  if (token) h["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
};

const post = async (path: string, token: string, body: unknown) => {
  const r = await fetch(`${BASE}${path}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body:    JSON.stringify(body),
  });
  return { status: r.status, r };
};

// ─── fixtures ─────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant CSJ ${TS}`, `CSJ${TS}`],
  );
  tenantId = (tRow.rows[0] as any).id;

  const cRow = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus CSJ ${TS}`, tenantId],
  );
  campusId = (cRow.rows[0] as any).id;

  // concepto
  const coRow = await pool.query(
    `INSERT INTO concepts (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1,$2,$3,'mensualidad','mensual',10000) RETURNING id`,
    [campusId, tenantId, `Mensualidad CSJ ${TS}`],
  );
  conceptId = (coRow.rows[0] as any).id;

  // alumno
  const sRow = await pool.query(
    `INSERT INTO students
       (nombres, apellido_paterno, nombre_completo, campus_id, tenant_id,
        id_referencia, status, grado, nivel_escolar)
     VALUES ($1,$2,$3,$4,$5,$6,'activo','1° PRIMARIA','Primaria') RETURNING id`,
    [`AlumnoCSJ`, `Test${TS}`, `AlumnoCSJ Test${TS}`, campusId, tenantId, `CSJ${TS}`],
  );
  studentId = (sRow.rows[0] as any).id;

  // charge1 — ciclo 2025-2026, pendiente; created_at explícito para que quede
  //            fuera de la ventana de 12 meses (septiembre 2025 en adelante).
  const c1Row = await pool.query(
    `INSERT INTO charges
       (tenant_id, student_id, concept_id, ciclo_escolar,
        fecha_emision, fecha_vencimiento,
        monto_base_centavos, beca_aplicada, recargo_aplicado_centavos, estado,
        created_at)
     VALUES ($1,$2,$3,'2025-2026','2025-08-01','2025-01-31',60000,'0',0,'pendiente',
             '2025-08-01'::timestamp)
     RETURNING id`,
    [tenantId, studentId, conceptId],
  );
  charge1Id = (c1Row.rows[0] as any).id;

  // payment1 — para charge1, creado en 2025-06-15
  const p1Row = await pool.query(
    `INSERT INTO payments
       (tenant_id, charge_id, metodo, monto_centavos, fecha_pago, estado, created_at)
     VALUES ($1,$2,'efectivo',40000,'2025-06-15','exitoso','2025-06-15'::timestamp)
     RETURNING id`,
    [tenantId, charge1Id],
  );
  payment1Id = (p1Row.rows[0] as any).id;

  // charge2 — ciclo 2024-2025; created_at explícito (fuera de los 12 meses)
  const c2Row = await pool.query(
    `INSERT INTO charges
       (tenant_id, student_id, concept_id, ciclo_escolar,
        fecha_emision, fecha_vencimiento,
        monto_base_centavos, beca_aplicada, recargo_aplicado_centavos, estado,
        created_at)
     VALUES ($1,$2,$3,'2024-2025','2024-08-01','2024-06-30',50000,'0',0,'pendiente',
             '2024-08-01'::timestamp)
     RETURNING id`,
    [tenantId, studentId, conceptId],
  );
  charge2Id = (c2Row.rows[0] as any).id;

  // payment2 — para charge2, creado en 2024-12-15
  const p2Row = await pool.query(
    `INSERT INTO payments
       (tenant_id, charge_id, metodo, monto_centavos, fecha_pago, estado, created_at)
     VALUES ($1,$2,'efectivo',30000,'2024-12-15','exitoso','2024-12-15'::timestamp)
     RETURNING id`,
    [tenantId, charge2Id],
  );
  payment2Id = (p2Row.rows[0] as any).id;

  // charge3 — ciclo actual, fecha de este mes → queda dentro de los últimos 12 meses
  const c3Row = await pool.query(
    `INSERT INTO charges
       (tenant_id, student_id, concept_id, ciclo_escolar,
        fecha_emision, fecha_vencimiento,
        monto_base_centavos, beca_aplicada, recargo_aplicado_centavos, estado)
     VALUES ($1,$2,$3,'2026-2027',CURRENT_DATE,CURRENT_DATE + INTERVAL '30 days',
             80000,'0',0,'pendiente')
     RETURNING id`,
    [tenantId, studentId, conceptId],
  );
  charge3Id = (c3Row.rows[0] as any).id;

  // payment3 — para charge3, 55000 ¢ este mes → lo vemos en tendencias del mes actual
  const p3Row = await pool.query(
    `INSERT INTO payments
       (tenant_id, charge_id, metodo, monto_centavos, fecha_pago, estado, created_at)
     VALUES ($1,$2,'efectivo',55000,CURRENT_DATE,'exitoso',NOW())
     RETURNING id`,
    [tenantId, charge3Id],
  );
  payment3Id = (p3Row.rows[0] as any).id;

  // usuarios para tokens
  const hash = "x"; // password_hash ficticia (no se usa en los tests)
  const insertUser = async (role: string) => {
    const r = await pool.query(
      `INSERT INTO users (campus_id, tenant_id, email, password_hash, name, role)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [campusId, tenantId, `${role}.csj.${TS}@test.mx`, hash, `User CSJ ${role}`, role],
    );
    return (r.rows[0] as any).id as number;
  };

  tokAdmin      = makeToken(await insertUser("administrador_campus"), "administrador_campus");
  tokContador   = makeToken(await insertUser("contador_general"),     "contador_general");
  tokAsistente  = makeToken(await insertUser("asistente"),            "asistente");
  tokAdmisiones = makeToken(await insertUser("admisiones"),           "admisiones");
});

afterAll(async () => {
  await pool.query(`DELETE FROM payments WHERE id = ANY($1::int[])`, [[payment1Id, payment2Id, payment3Id]]).catch(() => {});
  await pool.query(`DELETE FROM charges  WHERE id = ANY($1::int[])`, [[charge1Id,  charge2Id,  charge3Id]]).catch(() => {});
  await pool.query(`DELETE FROM users    WHERE campus_id = $1`,       [campusId]).catch(() => {});
  await pool.query(`DELETE FROM concepts WHERE campus_id = $1`,       [campusId]).catch(() => {});
  await pool.query(`DELETE FROM students WHERE campus_id = $1`,       [campusId]).catch(() => {});
  await pool.query(`DELETE FROM campuses WHERE id = $1`,              [campusId]).catch(() => {});
  await pool.query(`DELETE FROM tenants  WHERE id = $1`,              [tenantId]).catch(() => {});
});

// ─── tests ────────────────────────────────────────────────────────────────────

describe("CSJ — RPT-05 Reporte Consejo Directivo", () => {

  // ── Guard FINANCIAL.READ ─────────────────────────────────────────────────────

  it("CSJ-01: sin token → 401", async () => {
    const { status } = await get("/api/reportes/consejo");
    expect(status).toBe(401);
  });

  it("CSJ-02: asistente (sin FINANCIAL.READ) → 403", async () => {
    const { status, body } = await get("/api/reportes/consejo", tokAsistente);
    expect(status).toBe(403);
    expect(body.message).toMatch(/permiso/i);
  });

  it("CSJ-03: admisiones (sin FINANCIAL.READ) → 403", async () => {
    const { status } = await get("/api/reportes/consejo", tokAdmisiones);
    expect(status).toBe(403);
  });

  it("CSJ-04: administrador_campus → 200 + estructura kpis + top_deudores + por_nivel", async () => {
    const { status, body } = await get("/api/reportes/consejo", tokAdmin);
    expect(status).toBe(200);
    expect(body).toHaveProperty("kpis");
    expect(body).toHaveProperty("top_deudores");
    expect(body).toHaveProperty("por_nivel");
    expect(body).toHaveProperty("tendencias");
    expect(body).toHaveProperty("filters");
    // KPIs numéricos presentes
    for (const k of ["ingresos_mes", "total_facturado", "pendiente", "tasa_cobro", "mora", "estudiantes_activos"]) {
      expect(typeof body.kpis[k], `kpis.${k} debe ser number`).toBe("number");
    }
    expect(Array.isArray(body.top_deudores)).toBe(true);
    expect(Array.isArray(body.por_nivel)).toBe(true);
  });

  it("CSJ-05: contador_general → 200 + kpis", async () => {
    const { status, body } = await get("/api/reportes/consejo", tokContador);
    expect(status).toBe(200);
    expect(body).toHaveProperty("kpis");
    expect(typeof body.kpis.tasa_cobro).toBe("number");
  });

  // ── Filtros con resultados concretos ─────────────────────────────────────────
  //
  // Fixture: payment1=40000 (charge1, ciclo=2025-2026, fecha=2025-06-15)
  //          payment2=30000 (charge2, ciclo=2024-2025, fecha=2024-12-15)
  // Campus aislado → solo mis pagos contribuyen a los KPIs.

  it("CSJ-06: filtro ciclo=2025-2026 → ingresos_mes contiene solo payment1 (40000)", async () => {
    const { status, body } = await get(
      `/api/reportes/consejo?ciclo=2025-2026`,
      tokAdmin,
    );
    expect(status).toBe(200);
    // Solo payment1 pertenece al ciclo 2025-2026 → ingresos_mes = 40000
    expect(body.kpis.ingresos_mes).toBe(40000);
  });

  it("CSJ-07: filtro ciclo=2024-2025 → ingresos_mes contiene solo payment2 (30000)", async () => {
    const { status, body } = await get(
      `/api/reportes/consejo?ciclo=2024-2025`,
      tokAdmin,
    );
    expect(status).toBe(200);
    expect(body.kpis.ingresos_mes).toBe(30000);
  });

  it("CSJ-08: filtro fecha_desde/hasta 2025 → ingresos_mes = 40000 (payment1)", async () => {
    const { status, body } = await get(
      `/api/reportes/consejo?fecha_desde=2025-01-01&fecha_hasta=2025-12-31`,
      tokAdmin,
    );
    expect(status).toBe(200);
    expect(body.kpis.ingresos_mes).toBe(40000);
  });

  it("CSJ-09: filtro fecha_desde/hasta 2024 → ingresos_mes = 30000 (payment2)", async () => {
    const { status, body } = await get(
      `/api/reportes/consejo?fecha_desde=2024-01-01&fecha_hasta=2024-12-31`,
      tokAdmin,
    );
    expect(status).toBe(200);
    expect(body.kpis.ingresos_mes).toBe(30000);
  });

  // ── Exportación ──────────────────────────────────────────────────────────────

  it("CSJ-10: POST exportar excel → 200 + magic bytes PK (xlsx)", async () => {
    const { status, r } = await post(
      "/api/reportes/consejo/exportar",
      tokAdmin,
      { formato: "excel" },
    );
    expect(status).toBe(200);
    expect(r.headers.get("content-type")).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const buf  = Buffer.from(await r.arrayBuffer());
    // XLSX magic bytes: PK\x03\x04 (ZIP header)
    expect(buf[0]).toBe(0x50); // P
    expect(buf[1]).toBe(0x4b); // K
  });

  it("CSJ-11: POST exportar pdf → 200 + magic bytes %PDF", async () => {
    const { status, r } = await post(
      "/api/reportes/consejo/exportar",
      tokAdmin,
      { formato: "pdf" },
    );
    expect(status).toBe(200);
    expect(r.headers.get("content-type")).toContain("application/pdf");
    const buf = Buffer.from(await r.arrayBuffer());
    // PDF magic bytes: %PDF
    expect(buf.slice(0, 4).toString()).toBe("%PDF");
  });

  it("CSJ-12: POST exportar sin REPORTS.EXPORT (asistente) → 403", async () => {
    const { status } = await post(
      "/api/reportes/consejo/exportar",
      tokAsistente,
      { formato: "excel" },
    );
    expect(status).toBe(403);
  });

  // ── Tendencias ────────────────────────────────────────────────────────────────

  it("CSJ-13: tendencias → 12 entradas ordenadas, shape correcto, mes actual = payment3 (55000)", async () => {
    const { status, body } = await get("/api/reportes/consejo", tokAdmin);
    expect(status).toBe(200);

    const t: any[] = body.tendencias;
    expect(Array.isArray(t)).toBe(true);
    expect(t).toHaveLength(12);

    // Shape y rangos válidos en cada entrada
    for (const entry of t) {
      expect(typeof entry.mes,               `mes debe ser string`).toBe("string");
      expect(entry.mes,                      `mes debe tener formato YYYY-MM`).toMatch(/^\d{4}-\d{2}$/);
      expect(typeof entry.ingresos_centavos, `ingresos_centavos debe ser number`).toBe("number");
      expect(typeof entry.tasa_cobro,        `tasa_cobro debe ser number`).toBe("number");
      expect(typeof entry.mora,              `mora debe ser number`).toBe("number");
      expect(entry.ingresos_centavos).toBeGreaterThanOrEqual(0);
      expect(entry.tasa_cobro).toBeGreaterThanOrEqual(0);
      expect(entry.tasa_cobro).toBeLessThanOrEqual(100);
      expect(entry.mora).toBeGreaterThanOrEqual(0);
      expect(entry.mora).toBeLessThanOrEqual(100);
    }

    // Orden cronológico estricto
    for (let i = 1; i < t.length; i++) {
      expect(t[i].mes > t[i - 1].mes,
        `t[${i}].mes (${t[i].mes}) debe ser mayor que t[${i-1}].mes (${t[i-1].mes})`
      ).toBe(true);
    }

    // El último elemento = mes actual
    const mesActual = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    expect(t[11].mes).toBe(mesActual);

    // El mes actual debe contener payment3 (55000 ¢) como ingresos
    expect(t[11].ingresos_centavos).toBe(55000);

    // Con facturado=80000 y cobrado=55000: tasa=round(55000/80000×100)=69%, mora=31%
    expect(t[11].tasa_cobro).toBe(69);
    expect(t[11].mora).toBe(31);
  });
});
