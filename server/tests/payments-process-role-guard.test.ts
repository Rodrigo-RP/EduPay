/**
 * Prueba de regresión: guard PAYMENTS.PROCESS en 4 endpoints de pago/caja
 *
 * Endpoints cubiertos:
 *   POST /api/caja/pago-efectivo          (conciliacion.ts)
 *   POST /api/caja/transferencia-manual    (conciliacion.ts)
 *   POST /api/admin/family-credits/:id/aplicar (admin.ts)
 *   POST /api/admin/cargos/aplicar-recargos   (charges.ts)
 *
 * Por cada endpoint:
 *   403-test  — asistente o admisiones → 403, sin efecto en DB
 *   200-cg    — contador_general → 200/20x (permiso nuevo)
 *   200-ac    — administrador_campus → 200/20x (control de regresión)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

// ── IDs creados en setup ───────────────────────────────────────────────────
let tenantId:  number;
let campusId:  number;
let studentId: number;
let conceptId: number;

// Charges para pago-efectivo (uno por test para no reutilizar pagados)
let chargeFor403:   number;
let chargeForCG:    number;  // contador_general
let chargeForAC:    number;  // administrador_campus

// Credits + target-charges para family-credits/aplicar
let creditFor403:   number;
let creditForCG:    number;
let creditForAC:    number;
let targetChargeFor403: number;
let targetChargeForCG:  number;
let targetChargeForAC:  number;

// Todos los charges creados (para teardown)
const allChargeIds: number[] = [];

// ── JWTs ──────────────────────────────────────────────────────────────────
let tokenAsistente:       string;
let tokenAdmisiones:      string;
let tokenContadorGeneral: string;
let tokenAdminCampus:     string;

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
  const id = (r.rows as any[])[0].id as number;
  allChargeIds.push(id);
  return id;
}

/**
 * Crea un family_credit de $X con un payment stub para tener payment_id válido.
 * El "setup charge" se marca pagado manualmente (no via HTTP) para aislar el test.
 */
async function mkCredit(amountCentavos: number): Promise<{ creditId: number; setupChargeId: number }> {
  // 1. Charge de apoyo (ya pagado)
  const setupChargeRes = await pool.query(
    `INSERT INTO charges (tenant_id, student_id, concept_id, fecha_emision,
                          fecha_vencimiento, monto_base_centavos, estado)
     VALUES ($1,$2,$3,CURRENT_DATE,CURRENT_DATE+30,$4,'pagado') RETURNING id`,
    [tenantId, studentId, conceptId, amountCentavos],
  );
  const setupChargeId = (setupChargeRes.rows as any[])[0].id as number;
  allChargeIds.push(setupChargeId);

  // 2. Payment stub (exitoso)
  const payRes = await pool.query(
    `INSERT INTO payments (tenant_id, charge_id, metodo, monto_centavos, fecha_pago, estado)
     VALUES ($1,$2,'efectivo',$3,CURRENT_DATE,'exitoso') RETURNING id`,
    [tenantId, setupChargeId, amountCentavos],
  );
  const paymentId = (payRes.rows as any[])[0].id as number;

  // 3. Payment application para el charge de apoyo
  await pool.query(
    `INSERT INTO payment_applications (payment_id, charge_id, amount_centavos)
     VALUES ($1,$2,$3)`,
    [paymentId, setupChargeId, amountCentavos],
  );

  // 4. Family credit activo
  const creditRes = await pool.query(
    `INSERT INTO family_credits
       (payment_id, student_id, amount_centavos, status, tenant_id, campus_id)
     VALUES ($1,$2,$3,'activo',$4,$5) RETURNING id`,
    [paymentId, studentId, amountCentavos, tenantId, campusId],
  );
  const creditId = (creditRes.rows as any[])[0].id as number;

  return { creditId, setupChargeId };
}

// ── Setup ─────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const ts = Date.now().toString().slice(-7);

  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`PPG_Guard_Test ${ts}`, `PPG${ts}`],
  );
  tenantId = tRow.rows[0].id;

  const cRow = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus PPG ${ts}`, tenantId],
  );
  campusId = cRow.rows[0].id;

  const sRow = await pool.query(
    `INSERT INTO students (tenant_id, campus_id, nombres, apellido_paterno,
                           nombre_completo, status)
     VALUES ($1,$2,'Alumno','PPG','Alumno PPG ${ts}','activo') RETURNING id`,
    [tenantId, campusId],
  );
  studentId = sRow.rows[0].id;

  const conRow = await pool.query(
    `INSERT INTO concepts (tenant_id, campus_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1,$2,'Cuota PPG Test','colegiatura','mensual',100000) RETURNING id`,
    [tenantId, campusId],
  );
  conceptId = conRow.rows[0].id;

  // Charges para pago-efectivo
  chargeFor403 = await mkCharge(50_000);
  chargeForCG  = await mkCharge(50_000);
  chargeForAC  = await mkCharge(50_000);

  // Credits + target-charges para family-credits/aplicar
  const cr403 = await mkCredit(80_000);
  creditFor403      = cr403.creditId;
  targetChargeFor403 = await mkCharge(80_000);

  const crCG = await mkCredit(80_000);
  creditForCG       = crCG.creditId;
  targetChargeForCG  = await mkCharge(80_000);

  const crAC = await mkCredit(80_000);
  creditForAC       = crAC.creditId;
  targetChargeForAC  = await mkCharge(80_000);

  // JWTs — sin 'id' para evitar rollback silencioso del audit_log FK
  const base = { campus_id: campusId, tenant_id: tenantId };
  tokenAsistente       = jwt.sign({ ...base, role: "asistente"          }, JWT_SECRET, { expiresIn: "1h" });
  tokenAdmisiones      = jwt.sign({ ...base, role: "admisiones"         }, JWT_SECRET, { expiresIn: "1h" });
  tokenContadorGeneral = jwt.sign({ ...base, role: "contador_general"   }, JWT_SECRET, { expiresIn: "1h" });
  tokenAdminCampus     = jwt.sign({ ...base, role: "administrador_campus"}, JWT_SECRET, { expiresIn: "1h" });
});

// ── Teardown ──────────────────────────────────────────────────────────────
afterAll(async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. family_credits del tenant
    await client.query(
      `DELETE FROM family_credits
       WHERE tenant_id = $1`,
      [tenantId],
    );

    // 2. Invoices ligadas a payments de nuestros charges
    if (allChargeIds.length) {
      await client.query(
        `DELETE FROM invoices WHERE payment_id IN
           (SELECT id FROM payments WHERE charge_id = ANY($1))`,
        [allChargeIds],
      );
      // 3. Ledger
      await client.query(
        `DELETE FROM payment_applications WHERE charge_id = ANY($1)`,
        [allChargeIds],
      );
      // 4. Payments
      await client.query(
        `DELETE FROM payments WHERE charge_id = ANY($1)`,
        [allChargeIds],
      );
      // 5. Charges
      await client.query(
        `DELETE FROM charges WHERE id = ANY($1)`,
        [allChargeIds],
      );
    }

    // 6. Bank transactions del campus
    await client.query(
      `DELETE FROM bank_transactions WHERE campus_id = $1`,
      [campusId],
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
  await pool.query(`DELETE FROM students WHERE id=$1`,  [studentId]);
  await pool.query(`DELETE FROM concepts WHERE id=$1`,  [conceptId]);
  await pool.query(`DELETE FROM campuses WHERE id=$1`,  [campusId]);
  await pool.query(`DELETE FROM tenants WHERE id=$1`,   [tenantId]);
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. POST /api/caja/pago-efectivo
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/caja/pago-efectivo — guard PAYMENTS.PROCESS", () => {
  it("PPG-01: asistente → 403, charge permanece 'pendiente', sin payment creado", async () => {
    const { status, body } = await apiFetch(
      "POST",
      "/api/caja/pago-efectivo",
      tokenAsistente,
      { estudiante_id: studentId, charge_id: chargeFor403, monto: "500" },
    );

    expect(status).toBe(403);
    expect(body.message).toMatch(/sin permisos/i);

    // Verificar que el charge NO fue tocado
    const r = await pool.query(
      `SELECT estado FROM charges WHERE id = $1`,
      [chargeFor403],
    );
    expect(r.rows[0].estado).toBe("pendiente");

    // Verificar que no se creó ningún payment para ese charge
    const pRow = await pool.query(
      `SELECT COUNT(*) AS n FROM payments WHERE charge_id = $1`,
      [chargeFor403],
    );
    expect(Number(pRow.rows[0].n)).toBe(0);
  });

  it("PPG-02: contador_general → 200, pago procesado (permiso nuevo)", async () => {
    const { status } = await apiFetch(
      "POST",
      "/api/caja/pago-efectivo",
      tokenContadorGeneral,
      { estudiante_id: studentId, charge_id: chargeForCG, monto: "500" },
    );

    expect(status).toBe(200);

    // Verificar que el charge quedó pagado o parcial (cualquier estado terminal)
    const r = await pool.query(
      `SELECT estado FROM charges WHERE id = $1`,
      [chargeForCG],
    );
    expect(["pagado", "parcial"]).toContain(r.rows[0].estado);
  });

  it("PPG-03: administrador_campus → 200, sigue funcionando (regresión)", async () => {
    const { status } = await apiFetch(
      "POST",
      "/api/caja/pago-efectivo",
      tokenAdminCampus,
      { estudiante_id: studentId, charge_id: chargeForAC, monto: "500" },
    );

    expect(status).toBe(200);

    const r = await pool.query(
      `SELECT estado FROM charges WHERE id = $1`,
      [chargeForAC],
    );
    expect(["pagado", "parcial"]).toContain(r.rows[0].estado);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. POST /api/caja/transferencia-manual
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/caja/transferencia-manual — guard PAYMENTS.PROCESS", () => {
  it("PPG-04: admisiones → 403, sin bank_transaction creada", async () => {
    const countBefore = await pool.query(
      `SELECT COUNT(*) AS n FROM bank_transactions WHERE campus_id = $1`,
      [campusId],
    );
    const nBefore = Number(countBefore.rows[0].n);

    const { status, body } = await apiFetch(
      "POST",
      "/api/caja/transferencia-manual",
      tokenAdmisiones,
      { monto: "1000", descripcion: "Intento no autorizado", tipo: "credito" },
    );

    expect(status).toBe(403);
    expect(body.message).toMatch(/sin permisos/i);

    const countAfter = await pool.query(
      `SELECT COUNT(*) AS n FROM bank_transactions WHERE campus_id = $1`,
      [campusId],
    );
    expect(Number(countAfter.rows[0].n)).toBe(nBefore);
  });

  it("PPG-05: contador_general → 200, bank_transaction creada (permiso nuevo)", async () => {
    const { status, body } = await apiFetch(
      "POST",
      "/api/caja/transferencia-manual",
      tokenContadorGeneral,
      { monto: "500", descripcion: "Transferencia test CG", tipo: "credito" },
    );

    expect(status).toBe(200);
    expect(body.transaccion).toBeDefined();
    expect(body.transaccion.campus_id).toBe(campusId);
  });

  it("PPG-06: administrador_campus → 200, sigue funcionando (regresión)", async () => {
    const { status, body } = await apiFetch(
      "POST",
      "/api/caja/transferencia-manual",
      tokenAdminCampus,
      { monto: "500", descripcion: "Transferencia test AC", tipo: "credito" },
    );

    expect(status).toBe(200);
    expect(body.transaccion).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. POST /api/admin/family-credits/:creditId/aplicar
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/family-credits/:creditId/aplicar — guard PAYMENTS.PROCESS", () => {
  it("PPG-07: asistente → 403, credit sigue 'activo', sin payment_application creada", async () => {
    const { status, body } = await apiFetch(
      "POST",
      `/api/admin/family-credits/${creditFor403}/aplicar`,
      tokenAsistente,
      { charge_id: targetChargeFor403 },
    );

    expect(status).toBe(403);
    expect(body.message).toMatch(/sin permisos/i);

    // Credit sigue activo
    const cr = await pool.query(
      `SELECT status FROM family_credits WHERE id = $1`,
      [creditFor403],
    );
    expect(cr.rows[0].status).toBe("activo");

    // No se creó payment_application para el target charge
    const pa = await pool.query(
      `SELECT COUNT(*) AS n FROM payment_applications WHERE charge_id = $1`,
      [targetChargeFor403],
    );
    expect(Number(pa.rows[0].n)).toBe(0);
  });

  it("PPG-08: contador_general → 200, crédito consumido, cargo afectado (permiso nuevo)", async () => {
    const { status, body } = await apiFetch(
      "POST",
      `/api/admin/family-credits/${creditForCG}/aplicar`,
      tokenContadorGeneral,
      { charge_id: targetChargeForCG },
    );

    expect(status).toBe(200);
    expect(body.payment_application_id ?? body.paymentApplicationId ?? body.id).toBeTruthy();

    // El credit ya no está activo
    const cr = await pool.query(
      `SELECT status FROM family_credits WHERE id = $1`,
      [creditForCG],
    );
    expect(cr.rows[0].status).not.toBe("activo");

    // El cargo tiene al menos 1 payment_application
    const pa = await pool.query(
      `SELECT COUNT(*) AS n FROM payment_applications WHERE charge_id = $1`,
      [targetChargeForCG],
    );
    expect(Number(pa.rows[0].n)).toBeGreaterThanOrEqual(1);
  });

  it("PPG-09: administrador_campus → 200, sigue funcionando (regresión)", async () => {
    const { status, body } = await apiFetch(
      "POST",
      `/api/admin/family-credits/${creditForAC}/aplicar`,
      tokenAdminCampus,
      { charge_id: targetChargeForAC },
    );

    expect(status).toBe(200);
    expect(body.payment_application_id ?? body.paymentApplicationId ?? body.id).toBeTruthy();

    const cr = await pool.query(
      `SELECT status FROM family_credits WHERE id = $1`,
      [creditForAC],
    );
    expect(cr.rows[0].status).not.toBe("activo");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. POST /api/admin/cargos/aplicar-recargos
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/cargos/aplicar-recargos — guard PAYMENTS.PROCESS", () => {
  it("PPG-10: admisiones → 403, sin recargo aplicado", async () => {
    const { status, body } = await apiFetch(
      "POST",
      "/api/admin/cargos/aplicar-recargos",
      tokenAdmisiones,
    );

    expect(status).toBe(403);
    expect(body.message).toMatch(/sin permisos/i);
  });

  it("PPG-11: contador_general → 200 (permiso nuevo)", async () => {
    const { status } = await apiFetch(
      "POST",
      "/api/admin/cargos/aplicar-recargos",
      tokenContadorGeneral,
    );

    // 200 ya sea con actualizados:0 (sin reglas/sin vencidos en nuestro campus) o con datos reales
    expect(status).toBe(200);
  });

  it("PPG-12: administrador_campus → 200, sigue funcionando (regresión)", async () => {
    const { status } = await apiFetch(
      "POST",
      "/api/admin/cargos/aplicar-recargos",
      tokenAdminCampus,
    );

    expect(status).toBe(200);
  });
});
