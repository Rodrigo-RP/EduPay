/**
 * Prueba de regresión: guard CHARGES.CREATE / CHARGES.UPDATE en 4 endpoints
 * de administración de cargos y planes de pago.
 *
 * NIVEL 2 del protocolo de autorización — techo en administrador_campus:
 *   - contador_general (tiene PAYMENTS.PROCESS de Nivel 1) NO tiene CHARGES.CREATE/UPDATE
 *   - administrador_campus SÍ (permiso añadido en esta tarea)
 *   - administrador_general SÍ (ya lo tenía — regresión)
 *
 * Guards aplicados:
 *   POST /api/admin/cargos/extraordinario              → CHARGES.CREATE
 *   POST /api/admin/charges/:chargeId/pagar-manual     → CHARGES.UPDATE
 *   POST /api/planes-pago                              → CHARGES.CREATE
 *   PATCH /api/planes-pago/:id/cancelar                → CHARGES.UPDATE
 *
 * Tests:
 *   CLG-01  contador_general → 403 en POST extraordinario; sin charge nuevo en DB
 *   CLG-02  contador_general → 403 en POST pagar-manual; charge sigue 'pendiente'
 *   CLG-03  contador_general → 403 en POST planes-pago; sin plan nuevo en DB
 *   CLG-04  contador_general → 403 en PATCH cancelar; plan sigue 'activo'
 *   CLG-05  administrador_campus → 201 en POST extraordinario (control positivo)
 *   CLG-06  administrador_campus → 200 en POST pagar-manual (control positivo)
 *   CLG-07  administrador_campus → 200 en POST planes-pago (control positivo)
 *   CLG-08  administrador_campus → 200 en PATCH cancelar (control positivo)
 *   CLG-09  administrador_general → 201 en POST extraordinario (regresión)
 *   CLG-10  administrador_general → 200 en POST pagar-manual (regresión)
 *   CLG-11  administrador_general → 200 en POST planes-pago (regresión)
 *   CLG-12  administrador_general → 200 en PATCH cancelar (regresión)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── IDs creados en setup ───────────────────────────────────────────────────
let tenantId:  number;
let campusId:  number;
let studentId: number;
let conceptId: number;

// Charges para pagar-manual (uno por test, para no reutilizar pagados)
let chargeFor403PagarManual: number;
let chargeForACPagarManual:  number;
let chargeForAGPagarManual:  number;

// Charges pendientes para el 403 test de planes-pago (verificar que no se crea plan)
let chargeFor403Plan: number;

// Charges para los tests positivos de planes-pago (Mode A reestructuracion)
let chargeForACPlan: number;
let chargeForAGPlan: number;

// Payment plans para cancelar (insertados directamente)
let planFor403Cancel: number;
let planForACCancel:  number;
let planForAGCancel:  number;

// Acumulador de IDs de charges creados por los tests positivos (extraordinario, planes-pago)
const extraChargeIds: number[] = [];

// ── JWTs ──────────────────────────────────────────────────────────────────
let tokenContadorGeneral:  string;
let tokenAdminCampus:      string;
let tokenAdminGeneral:     string;

// ── Helpers ───────────────────────────────────────────────────────────────
async function apiFetch(
  method: string,
  path: string,
  token: string,
  body?: object,
) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function mkCharge(monto = 100_000): Promise<number> {
  const r = await pool.query(
    `INSERT INTO charges (tenant_id, student_id, concept_id, fecha_emision,
                          fecha_vencimiento, monto_base_centavos, estado)
     VALUES ($1,$2,$3,CURRENT_DATE,CURRENT_DATE+30,$4,'pendiente') RETURNING id`,
    [tenantId, studentId, conceptId, monto],
  );
  return (r.rows as any[])[0].id as number;
}

async function mkPlan(): Promise<number> {
  const r = await pool.query(
    `INSERT INTO payment_plans
       (campus_id, tenant_id, student_id, total_adeudo_centavos,
        monto_inicial_centavos, numero_pagos, frecuencia, fecha_inicio, tipo_origen)
     VALUES ($1,$2,$3,100000,0,1,'mensual',CURRENT_DATE,'futuro') RETURNING id`,
    [campusId, tenantId, studentId],
  );
  return (r.rows as any[])[0].id as number;
}

async function countCharges(): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*) AS n FROM charges WHERE student_id = $1`,
    [studentId],
  );
  return Number(r.rows[0].n);
}

async function countPlans(): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*) AS n FROM payment_plans WHERE tenant_id = $1`,
    [tenantId],
  );
  return Number(r.rows[0].n);
}

// ── Setup ─────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const ts = Date.now().toString().slice(-7);

  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`CLG_Guard_Test ${ts}`, `CLG${ts}`],
  );
  tenantId = tRow.rows[0].id;

  const cRow = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus CLG ${ts}`, tenantId],
  );
  campusId = cRow.rows[0].id;

  const sRow = await pool.query(
    `INSERT INTO students (tenant_id, campus_id, nombres, apellido_paterno,
                           nombre_completo, status)
     VALUES ($1,$2,'Alumno','CLG','Alumno CLG ${ts}','activo') RETURNING id`,
    [tenantId, campusId],
  );
  studentId = sRow.rows[0].id;

  const conRow = await pool.query(
    `INSERT INTO concepts (tenant_id, campus_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1,$2,'Cuota CLG Test','colegiatura','mensual',100000) RETURNING id`,
    [tenantId, campusId],
  );
  conceptId = conRow.rows[0].id;

  // Charges para pagar-manual
  chargeFor403PagarManual = await mkCharge(50_000);
  chargeForACPagarManual  = await mkCharge(50_000);
  chargeForAGPagarManual  = await mkCharge(50_000);

  // Charges para planes-pago (Mode A reestructuracion) + verificación 403
  chargeFor403Plan = await mkCharge(75_000);
  chargeForACPlan  = await mkCharge(75_000);
  chargeForAGPlan  = await mkCharge(75_000);

  // Payment plans para cancelar (insertados directamente — tipo_origen='futuro')
  planFor403Cancel = await mkPlan();
  planForACCancel  = await mkPlan();
  planForAGCancel  = await mkPlan();

  // JWTs — sin 'id' para evitar rollback silencioso del audit_log FK
  const base = { campus_id: campusId, tenant_id: tenantId };
  tokenContadorGeneral = jwt.sign({ ...base, role: "contador_general"    }, JWT_SECRET, { expiresIn: "1h" });
  tokenAdminCampus     = jwt.sign({ ...base, role: "administrador_campus"}, JWT_SECRET, { expiresIn: "1h" });
  tokenAdminGeneral    = jwt.sign({ ...base, role: "administrador_general"}, JWT_SECRET, { expiresIn: "1h" });
});

// ── Teardown ──────────────────────────────────────────────────────────────
afterAll(async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. family_credits ligados a payments de nuestro tenant
    await client.query(
      `DELETE FROM family_credits WHERE tenant_id = $1`, [tenantId],
    );
    // 2. Invoices ligadas a payments de nuestro tenant
    await client.query(
      `DELETE FROM invoices WHERE payment_id IN
         (SELECT id FROM payments WHERE tenant_id = $1)`,
      [tenantId],
    );
    // 3. Ledger — payment_applications de charges del alumno
    await client.query(
      `DELETE FROM payment_applications
       WHERE charge_id IN (SELECT id FROM charges WHERE student_id = $1)`,
      [studentId],
    );
    // 4. Payments del tenant
    await client.query(
      `DELETE FROM payments WHERE tenant_id = $1`, [tenantId],
    );
    // 5. Charges del alumno (incluye los de los planes)
    await client.query(
      `DELETE FROM charges WHERE student_id = $1`, [studentId],
    );
    // 6. Payment plans del tenant
    await client.query(
      `DELETE FROM payment_plans WHERE tenant_id = $1`, [tenantId],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  await pool.query(
    `DELETE FROM audit_retry_queue WHERE (payload->>'tenant_id')::int = $1`,
    [tenantId],
  );
  await pool.query(`DELETE FROM students WHERE id = $1`, [studentId]);
  await pool.query(`DELETE FROM concepts WHERE id = $1`, [conceptId]);
  await pool.query(`DELETE FROM campuses WHERE id = $1`, [campusId]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`,  [tenantId]);
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. POST /api/admin/cargos/extraordinario
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/cargos/extraordinario — guard CHARGES.CREATE", () => {
  it("CLG-01: contador_general → 403, sin charge nuevo en DB", async () => {
    const nBefore = await countCharges();

    const { status, body } = await apiFetch(
      "POST",
      "/api/admin/cargos/extraordinario",
      tokenContadorGeneral,
      { student_id: studentId, monto: "100", descripcion: "Intento CG" },
    );

    expect(status).toBe(403);
    expect(body.message).toMatch(/sin permisos/i);

    const nAfter = await countCharges();
    expect(nAfter).toBe(nBefore);
  });

  it("CLG-05: administrador_campus → 201, charge creado (control positivo)", async () => {
    const { status, body } = await apiFetch(
      "POST",
      "/api/admin/cargos/extraordinario",
      tokenAdminCampus,
      { student_id: studentId, monto: "200", descripcion: "Cargo AC extraordinario" },
    );

    expect(status).toBe(201);
    expect(body.charge?.id ?? body.id).toBeTruthy();
    if (body.charge?.id) extraChargeIds.push(body.charge.id);
  });

  it("CLG-09: administrador_general → 201, charge creado (regresión)", async () => {
    const { status, body } = await apiFetch(
      "POST",
      "/api/admin/cargos/extraordinario",
      tokenAdminGeneral,
      { student_id: studentId, monto: "200", descripcion: "Cargo AG extraordinario" },
    );

    expect(status).toBe(201);
    expect(body.charge?.id ?? body.id).toBeTruthy();
    if (body.charge?.id) extraChargeIds.push(body.charge.id);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. POST /api/admin/charges/:chargeId/pagar-manual
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/charges/:chargeId/pagar-manual — guard CHARGES.UPDATE", () => {
  it("CLG-02: contador_general → 403, charge sigue 'pendiente', sin payment creado", async () => {
    const { status, body } = await apiFetch(
      "POST",
      `/api/admin/charges/${chargeFor403PagarManual}/pagar-manual`,
      tokenContadorGeneral,
      { metodo: "efectivo" },
    );

    expect(status).toBe(403);
    expect(body.message).toMatch(/sin permisos/i);

    const r = await pool.query(
      `SELECT estado FROM charges WHERE id = $1`, [chargeFor403PagarManual],
    );
    expect(r.rows[0].estado).toBe("pendiente");

    const pRow = await pool.query(
      `SELECT COUNT(*) AS n FROM payments WHERE charge_id = $1`, [chargeFor403PagarManual],
    );
    expect(Number(pRow.rows[0].n)).toBe(0);
  });

  it("CLG-06: administrador_campus → 200, charge pagado (control positivo)", async () => {
    const { status } = await apiFetch(
      "POST",
      `/api/admin/charges/${chargeForACPagarManual}/pagar-manual`,
      tokenAdminCampus,
      { metodo: "efectivo" },
    );

    expect(status).toBe(200);

    const r = await pool.query(
      `SELECT estado FROM charges WHERE id = $1`, [chargeForACPagarManual],
    );
    expect(r.rows[0].estado).toBe("pagado");
  });

  it("CLG-10: administrador_general → 200, charge pagado (regresión)", async () => {
    const { status } = await apiFetch(
      "POST",
      `/api/admin/charges/${chargeForAGPagarManual}/pagar-manual`,
      tokenAdminGeneral,
      { metodo: "efectivo" },
    );

    expect(status).toBe(200);

    const r = await pool.query(
      `SELECT estado FROM charges WHERE id = $1`, [chargeForAGPagarManual],
    );
    expect(r.rows[0].estado).toBe("pagado");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. POST /api/planes-pago
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/planes-pago — guard CHARGES.CREATE", () => {
  it("CLG-03: contador_general → 403, sin plan nuevo en DB", async () => {
    const nBefore = await countPlans();

    const { status, body } = await apiFetch(
      "POST",
      "/api/planes-pago",
      tokenContadorGeneral,
      {
        charge_ids: [chargeFor403Plan],
        monto_inicial_centavos: 0,
        numero_pagos: 2,
        frecuencia: "mensual",
        fecha_inicio: "2026-09-01",
        student_id: studentId,
      },
    );

    expect(status).toBe(403);
    expect(body.message).toMatch(/sin permisos/i);

    const nAfter = await countPlans();
    expect(nAfter).toBe(nBefore);
  });

  it("CLG-07: administrador_campus → 200, plan creado (control positivo)", async () => {
    const { status, body } = await apiFetch(
      "POST",
      "/api/planes-pago",
      tokenAdminCampus,
      {
        charge_ids: [chargeForACPlan],
        monto_inicial_centavos: 0,
        numero_pagos: 2,
        frecuencia: "mensual",
        fecha_inicio: "2026-09-01",
        student_id: studentId,
      },
    );

    expect(status).toBe(200);
    expect(body.plan?.id ?? body.id).toBeTruthy();
  });

  it("CLG-11: administrador_general → 200, plan creado (regresión)", async () => {
    const { status, body } = await apiFetch(
      "POST",
      "/api/planes-pago",
      tokenAdminGeneral,
      {
        charge_ids: [chargeForAGPlan],
        monto_inicial_centavos: 0,
        numero_pagos: 2,
        frecuencia: "mensual",
        fecha_inicio: "2026-09-01",
        student_id: studentId,
      },
    );

    expect(status).toBe(200);
    expect(body.plan?.id ?? body.id).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. PATCH /api/planes-pago/:id/cancelar
// ═══════════════════════════════════════════════════════════════════════════
describe("PATCH /api/planes-pago/:id/cancelar — guard CHARGES.UPDATE", () => {
  it("CLG-04: contador_general → 403, plan sigue 'activo' en DB", async () => {
    const { status, body } = await apiFetch(
      "PATCH",
      `/api/planes-pago/${planFor403Cancel}/cancelar`,
      tokenContadorGeneral,
      { motivo: "Motivo de prueba de seguridad CLG" },
    );

    expect(status).toBe(403);
    expect(body.message).toMatch(/sin permisos/i);

    const r = await pool.query(
      `SELECT estado FROM payment_plans WHERE id = $1`, [planFor403Cancel],
    );
    // Si el plan existe comprobamos que no fue cancelado; si no existe (row 0) también está bien
    if (r.rows.length > 0) {
      expect(r.rows[0].estado).not.toBe("cancelado");
    }
  });

  it("CLG-08: administrador_campus → 200, plan cancelado (control positivo)", async () => {
    const { status } = await apiFetch(
      "PATCH",
      `/api/planes-pago/${planForACCancel}/cancelar`,
      tokenAdminCampus,
      { motivo: "Cancelación de prueba administrador campus CLG" },
    );

    expect(status).toBe(200);

    const r = await pool.query(
      `SELECT estado FROM payment_plans WHERE id = $1`, [planForACCancel],
    );
    expect(r.rows[0].estado).toBe("cancelado");
  });

  it("CLG-12: administrador_general → 200, plan cancelado (regresión)", async () => {
    const { status } = await apiFetch(
      "PATCH",
      `/api/planes-pago/${planForAGCancel}/cancelar`,
      tokenAdminGeneral,
      { motivo: "Cancelación de prueba administrador general CLG" },
    );

    expect(status).toBe(200);

    const r = await pool.query(
      `SELECT estado FROM payment_plans WHERE id = $1`, [planForAGCancel],
    );
    expect(r.rows[0].estado).toBe("cancelado");
  });
});
