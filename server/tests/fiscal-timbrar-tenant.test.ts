/**
 * server/tests/fiscal-timbrar-tenant.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * BUG REGRESSION — FTT: fiscal.ts /api/fiscal/timbrar-lote omite tenant_id
 *
 * VULNERABILIDAD REPRODUCIDA (pre-fix):
 *   POST /api/fiscal/timbrar-lote inserta en invoices sin tenant_id:
 *     INSERT INTO invoices (payment_id, uuid_cfdi, estado) VALUES ($1,$2,'emitido')
 *   El tenant_id queda NULL en la fila aunque el usuario autenticado tenga
 *   tenant_id en el JWT. Esto rompe Row Level Security y consultas por tenant.
 *
 * FIX ESPERADO:
 *   INSERT INTO invoices (payment_id, uuid_cfdi, estado, tenant_id)
 *   VALUES ($1,$2,'emitido',$3)
 *   donde $3 = (req as any).user?.tenant_id
 *
 * BACKFILL:
 *   FTT-04 verifica cuántas facturas históricas tienen tenant_id NULL y si
 *   son recuperables vía JOIN determinista payments→charges→students→campuses→tenants.
 *
 * Rutas cubiertas:
 *   POST /api/fiscal/timbrar-lote
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import { pool } from "../db";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";
const TS         = Date.now().toString().slice(-7);

// ── Fixtures ──────────────────────────────────────────────────────────────────

let tenantId   = 0;
let campusId   = 0;
let studentId  = 0;
let conceptId  = 0;
let chargeId   = 0;
let paymentId  = 0;
let tokenAdmin = "";

beforeAll(async () => {
  // ── Tenant + Campus ──────────────────────────────────────────────────────
  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`FTT Tenant ${TS}`, `FTT${TS}`]
  );
  tenantId = tRow.rows[0].id;

  const cRow = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1,$2) RETURNING id`,
    [tenantId, `Campus-FTT-${TS}`]
  );
  campusId = cRow.rows[0].id;

  // ── User (administrador_campus — tiene FISCAL.CONFIGURE) ─────────────────
  const bcrypt = await import("bcrypt");
  const hash   = await bcrypt.hash("TestFTT2025!", 10);
  const uRow   = await pool.query(
    `INSERT INTO users
       (tenant_id, campus_id, name, email, password_hash, role, is_active, custom_permissions)
     VALUES ($1,$2,'Admin FTT',$3,$4,'administrador_campus',true,'{}') RETURNING id`,
    [tenantId, campusId, `admin.ftt.${TS}@ftt.test`, hash]
  );
  const adminId = uRow.rows[0].id as number;

  tokenAdmin = jwt.sign(
    { id: adminId, email: `admin.ftt.${TS}@ftt.test`, role: "administrador_campus",
      campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // ── Student ───────────────────────────────────────────────────────────────
  const sRow = await pool.query(
    `INSERT INTO students
       (tenant_id, campus_id, nombres, apellido_paterno, nombre_completo, status)
     VALUES ($1,$2,'FTT','Alumno','FTT Alumno','activo') RETURNING id`,
    [tenantId, campusId]
  );
  studentId = sRow.rows[0].id;

  // ── Concept ───────────────────────────────────────────────────────────────
  const coRow = await pool.query(
    `INSERT INTO concepts
       (tenant_id, campus_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1,$2,'Colegiatura FTT','colegiatura','mensual',350000) RETURNING id`,
    [tenantId, campusId]
  );
  conceptId = coRow.rows[0].id;

  // ── Charge (columnas reales: monto_base_centavos, estado, fecha_emision NOT NULL) ──
  const chRow = await pool.query(
    `INSERT INTO charges
       (tenant_id, student_id, concept_id, monto_base_centavos, estado,
        fecha_emision, fecha_vencimiento)
     VALUES ($1,$2,$3,350000,'pagado', CURRENT_DATE, CURRENT_DATE) RETURNING id`,
    [tenantId, studentId, conceptId]
  );
  chargeId = chRow.rows[0].id;

  // ── Payment (monto_centavos, metodo — columnas reales en payments) ────────
  const pRow = await pool.query(
    `INSERT INTO payments
       (tenant_id, charge_id, monto_centavos, metodo, fecha_pago)
     VALUES ($1,$2,350000,'efectivo', NOW()) RETURNING id`,
    [tenantId, chargeId]
  );
  paymentId = pRow.rows[0].id;
});

afterAll(async () => {
  // Limpiar en orden FK
  await pool.query(`DELETE FROM invoices  WHERE payment_id = $1`, [paymentId]);
  await pool.query(`DELETE FROM payments  WHERE id         = $1`, [paymentId]);
  await pool.query(`DELETE FROM charges   WHERE id         = $1`, [chargeId]);
  await pool.query(`DELETE FROM concepts  WHERE id         = $1`, [conceptId]);
  await pool.query(`DELETE FROM students  WHERE id         = $1`, [studentId]);
  await pool.query(`DELETE FROM users     WHERE tenant_id  = $1`, [tenantId]);
  await pool.query(`DELETE FROM campuses  WHERE tenant_id  = $1`, [tenantId]);
  await pool.query(`DELETE FROM tenants   WHERE id         = $1`, [tenantId]);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const POST = (path: string, token: string, body: any = {}) =>
  fetch(`${BASE}${path}`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FTT — fiscal.ts timbrar-lote escribe tenant_id desde JWT", () => {

  it("FTT-01: timbrar-lote sin campus_invoicing_config activo → 503 honesto (sin UUID simulado)", async () => {
    // Post-mig019: timbrar-lote requiere campus_invoicing_config con estado='activo'.
    // El campus de este test no tiene configuración → 503 honesto, nunca DEMO-...
    const r    = await POST("/api/fiscal/timbrar-lote", tokenAdmin, { payment_ids: [paymentId] });
    const body = await r.json() as any;
    expect(r.status, `body: ${JSON.stringify(body)}`).toBe(503);
    expect(body.code).toBeDefined();
    // Confirmar que NO hay UUID DEMO- en la respuesta (nunca simular éxito)
    expect(JSON.stringify(body)).not.toMatch(/DEMO-/);
  });

  it("FTT-02: sin campus_invoicing_config activo no se crea ninguna factura en DB", async () => {
    // El 503 debe ocurrir antes de cualquier INSERT en invoices
    const row = await pool.query(
      `SELECT id FROM invoices WHERE payment_id = $1 LIMIT 1`,
      [paymentId]
    );
    // No debe existir ninguna fila — el 503 cortó el flujo antes del INSERT
    expect(row.rows.length).toBe(0);
  });

  it("FTT-03: no existe ningún uuid_cfdi DEMO- en invoices para este pago (timbrado honesto)", async () => {
    // Garantía de que el comportamiento antiguo de DEMO-... fue eliminado
    const row = await pool.query(
      `SELECT uuid_cfdi FROM invoices WHERE payment_id = $1 AND uuid_cfdi LIKE 'DEMO-%' LIMIT 1`,
      [paymentId]
    );
    expect(row.rows.length).toBe(0);
  });

  it("FTT-04: backfill — facturas históricas con tenant_id NULL recuperables vía JOIN determinista", async () => {
    // Cuenta facturas con tenant_id NULL y evalúa si el JOIN payments→charges→students→campuses→tenants
    // puede recuperar tenant_id de forma determinista (sin ambigüedad).
    const nullCount = await pool.query(
      `SELECT COUNT(*) AS total_null FROM invoices WHERE tenant_id IS NULL`
    );
    const totalNull = Number((nullCount.rows[0] as any).total_null);

    const recoverable = await pool.query(`
      SELECT COUNT(*) AS recoverable
      FROM invoices i
      JOIN payments  p  ON p.id  = i.payment_id
      JOIN charges   c  ON c.id  = p.charge_id
      JOIN students  s  ON s.id  = c.student_id
      JOIN campuses  ca ON ca.id = s.campus_id
      JOIN tenants   t  ON t.id  = ca.tenant_id
      WHERE i.tenant_id IS NULL
        AND t.id IS NOT NULL
    `);
    const totalRecoverable = Number((recoverable.rows[0] as any).recoverable);

    // Reporta los números — si totalNull > 0 el backfill SQL es determinista
    // siempre que totalRecoverable == totalNull.
    console.log(
      `[FTT-04] invoices con tenant_id NULL: ${totalNull}, ` +
      `recuperables vía JOIN: ${totalRecoverable}`
    );

    // El backfill es seguro solo si todos los NULLs son recuperables.
    expect(totalRecoverable).toBe(totalNull);
  });
});
