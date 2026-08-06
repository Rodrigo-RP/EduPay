/**
 * TESTS — Concurrencia y Ledger: guardian/pagar, payments/process, caja/pago-efectivo
 *
 * Reproduce EXACTAMENTE el escenario confirmado en diagnóstico:
 *   Dos requests simultáneos al mismo charge → antes: ambos devolvían 200 + dos payments
 *   Después del fix: uno devuelve 200, el otro 409, exactamente 1 payment_application.
 *
 * También verifica:
 *   - El ledger (payment_applications) se escribe correctamente
 *   - El saldo en estado-cuenta desciende tras el pago
 *   - Pagos parciales vía caja/pago-efectivo funcionan y completan el cargo
 *   - Un segundo pago legítimo sobre un cargo 'parcial' lo completa
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool, db } from "../db";
import { charges, concepts, tenants, campuses, students, guardians, student_guardian, payment_applications, payments } from "../../shared/schema";
import { eq, inArray } from "drizzle-orm";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── IDs de datos creados en beforeAll ────────────────────────────────────────
let tenantId:    number;
let campusId:    number;
let studentId:   number;
let guardianId:  number;
let conceptId:   number;
let adminToken:  string;  // JWT de usuario admin
let guardianJwt: string;  // JWT de guardián (para authenticateGuardian)

// Charges creados para cada grupo de tests
const createdChargeIds: number[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeAdminToken(): string {
  return jwt.sign(
    {
      email:     "concurrency-test@test.com",
      role:      "administrador_campus",
      campus_id: campusId,
      tenant_id: tenantId,
      type:      "user",
      // Sin 'id': evita FK en audit_log (ver memory: audit-log-fk-rollback.md)
    },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

function makeGuardianToken(): string {
  return jwt.sign(
    {
      id:        guardianId,
      email:     "concurrency-guardian@test.com",
      type:      "guardian",
      campus_id: campusId,
      tenant_id: tenantId,
    },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

async function httpPost(path: string, body: object, token: string, authHeader = "Authorization") {
  const r = await fetch(`${BASE}${path}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", [authHeader]: `Bearer ${token}` },
    body:    JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

/** Crea un charge pendiente en la DB y lo registra para limpieza al final. */
async function mkCharge(monto = 100_000, estado = "pendiente"): Promise<number> {
  const r = await pool.query(
    `INSERT INTO charges (tenant_id, student_id, concept_id, fecha_emision, fecha_vencimiento,
                          monto_base_centavos, estado)
     VALUES ($1,$2,$3,CURRENT_DATE,CURRENT_DATE+30,$4,$5) RETURNING id`,
    [tenantId, studentId, conceptId, monto, estado]
  );
  const id = (r.rows as any[])[0].id as number;
  createdChargeIds.push(id);
  return id;
}

/** Lee el número de payment_applications para un charge. */
async function countApplications(chargeId: number): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*) AS n FROM payment_applications WHERE charge_id=$1`,
    [chargeId]
  );
  return Number(r.rows[0].n);
}

/** Lee el número de payments en estado exitoso para un charge. */
async function countExitosPayments(chargeId: number): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*) AS n FROM payments WHERE charge_id=$1 AND estado='exitoso'`,
    [chargeId]
  );
  return Number(r.rows[0].n);
}

/** Lee el estado del charge desde la DB. */
async function chargeEstado(chargeId: number): Promise<string> {
  const r = await pool.query(`SELECT estado FROM charges WHERE id=$1`, [chargeId]);
  return r.rows[0]?.estado;
}

// ── Setup / Teardown ──────────────────────────────────────────────────────────
beforeAll(async () => {
  const ts = Date.now().toString().slice(-7);

  // Tenant aislado para no contaminar datos de demo
  const [ten] = await db.insert(tenants).values({
    nombre_legal: `Concurrency Test ${ts}`,
    rfc:          `CONC${ts}`,
  }).returning();
  tenantId = ten.id;

  const [cam] = await db.insert(campuses).values({
    tenant_id: tenantId,
    nombre:    `Campus Conc ${ts}`,
  }).returning();
  campusId = cam.id;

  const [stu] = await db.insert(students).values({
    tenant_id:       tenantId,
    campus_id:       campusId,
    nombres:         "Alumno",
    apellido_paterno:"Concurrencia",
    nombre_completo: `Alumno Concurrencia ${ts}`,
    status:          "activo",
  }).returning();
  studentId = stu.id;

  const [grd] = await db.insert(guardians).values({
    tenant_id:                    tenantId,
    campus_id:                    campusId,
    nombres:                      "Tutor",
    nombre_completo:              `Tutor Concurrencia ${ts}`,
    email:                        `guardian-conc-${ts}@test.com`,
    correo_institucional_familiar:`guardian-conc-${ts}@test.com`,
  }).returning();
  guardianId = grd.id;

  await db.insert(student_guardian).values({
    student_id:  studentId,
    guardian_id: guardianId,
  });

  const conRow = await pool.query(
    `INSERT INTO concepts (tenant_id, campus_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1,$2,'Cuota Concurrencia Test','colegiatura','mensual',100000) RETURNING id`,
    [tenantId, campusId]
  );
  conceptId = (conRow.rows as any[])[0].id;

  adminToken  = makeAdminToken();
  guardianJwt = makeGuardianToken();
});

afterAll(async () => {
  if (createdChargeIds.length) {
    // 1. Invoices tienen FK a payments; limpiar primero
    await pool.query(
      `DELETE FROM invoices WHERE payment_id IN
         (SELECT id FROM payments WHERE charge_id = ANY($1))`,
      [createdChargeIds]
    );
    // 2. Ledger
    await pool.query(
      `DELETE FROM payment_applications WHERE charge_id = ANY($1)`,
      [createdChargeIds]
    );
    // 3. Payments
    await pool.query(
      `DELETE FROM payments WHERE charge_id = ANY($1)`,
      [createdChargeIds]
    );
    // 4. Audit log
    await pool.query(
      `DELETE FROM audit_log WHERE entity_type='charge' AND entity_id = ANY($1)`,
      [createdChargeIds]
    );
    // 5. Charges
    await pool.query(
      `DELETE FROM charges WHERE id = ANY($1)`,
      [createdChargeIds]
    );
  }
  // Limpiar audit_retry_queue del tenant de prueba para no contaminar audit-retry tests
  await pool.query(
    `DELETE FROM audit_retry_queue WHERE (payload->>'tenant_id')::int = $1`,
    [tenantId]
  );
  await pool.query(`DELETE FROM student_guardian WHERE student_id=$1`, [studentId]);
  await pool.query(`DELETE FROM students WHERE id=$1`,   [studentId]);
  await pool.query(`DELETE FROM guardians WHERE id=$1`,  [guardianId]);
  await pool.query(`DELETE FROM concepts WHERE id=$1`,   [conceptId]);
  await pool.query(`DELETE FROM campuses WHERE id=$1`,   [campusId]);
  await pool.query(`DELETE FROM tenants WHERE id=$1`,    [tenantId]);
});

// ═════════════════════════════════════════════════════════════════════════════
// BLOQUE 1 — guardian/pagar: concurrencia
// ═════════════════════════════════════════════════════════════════════════════
describe("guardian/pagar — concurrencia y ledger", () => {
  it("PC-01: pago normal crea exactamente 1 payment y 1 payment_application", async () => {
    const chargeId = await mkCharge(50_000);

    const { status, body } = await httpPost(
      "/api/guardian/pagar",
      { charge_ids: [chargeId], metodo_pago: "tarjeta" },
      guardianJwt
    );

    expect(status).toBe(200);
    expect(await chargeEstado(chargeId)).toBe("pagado");
    expect(await countExitosPayments(chargeId)).toBe(1);
    expect(await countApplications(chargeId)).toBe(1);

    // Verificar monto en payment_application
    const paRow = await pool.query(
      `SELECT amount_centavos FROM payment_applications WHERE charge_id=$1`,
      [chargeId]
    );
    expect(Number(paRow.rows[0].amount_centavos)).toBe(50_000);
  });

  it("PC-02: doble clic simultáneo — uno devuelve 200, el otro 409, exactamente 1 payment", async () => {
    const chargeId = await mkCharge(75_000);

    // Dos requests en paralelo sobre el MISMO charge (reproduce el bug original)
    const [r1, r2] = await Promise.all([
      httpPost("/api/guardian/pagar", { charge_ids: [chargeId], metodo_pago: "tarjeta" }, guardianJwt),
      httpPost("/api/guardian/pagar", { charge_ids: [chargeId], metodo_pago: "tarjeta" }, guardianJwt),
    ]);

    const statuses = [r1.status, r2.status].sort(); // [200, 409]
    expect(statuses).toEqual([200, 409]);

    // Un solo pago exitoso — no dos
    expect(await countExitosPayments(chargeId)).toBe(1);
    // Una sola payment_application — no dos
    expect(await countApplications(chargeId)).toBe(1);
    // Estado final correcto
    expect(await chargeEstado(chargeId)).toBe("pagado");
  });

  it("PC-03: intentar pagar un cargo ya pagado devuelve 409 inmediatamente", async () => {
    const chargeId = await mkCharge(30_000);

    // Primer pago
    await httpPost("/api/guardian/pagar", { charge_ids: [chargeId], metodo_pago: "tarjeta" }, guardianJwt);

    // Segundo intento secuencial
    const { status } = await httpPost(
      "/api/guardian/pagar",
      { charge_ids: [chargeId], metodo_pago: "tarjeta" },
      guardianJwt
    );
    expect(status).toBe(409);

    // Sigue habiendo exactamente 1 payment
    expect(await countExitosPayments(chargeId)).toBe(1);
    expect(await countApplications(chargeId)).toBe(1);
  });

  it("PC-04: el estado-cuenta del alumno refleja el pago en saldo_pendiente (ledger correcto)", async () => {
    const MONTO = 60_000;
    const chargeId = await mkCharge(MONTO);

    // Consultar saldo ANTES
    const antes = await fetch(`${BASE}/api/students/${studentId}/estado-cuenta`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    }).then(r => r.json()).catch(() => ({}));
    const saldoAntes = (antes as any).resumen?.saldo_pendiente_centavos ?? 0;

    // Pagar
    await httpPost("/api/guardian/pagar", { charge_ids: [chargeId], metodo_pago: "tarjeta" }, guardianJwt);

    // Consultar saldo DESPUÉS
    const despues = await fetch(`${BASE}/api/students/${studentId}/estado-cuenta`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    }).then(r => r.json()).catch(() => ({}));
    const saldoDespues = (despues as any).resumen?.saldo_pendiente_centavos ?? 0;

    // El saldo debe haber bajado exactamente MONTO
    expect(saldoAntes - saldoDespues).toBe(MONTO);

    // El cargo en el estado-cuenta debe mostrar pagado_centavos = MONTO
    const cargoRow = (despues as any).cargos?.find((c: any) => c.id === chargeId);
    expect(Number(cargoRow?.pagado_centavos)).toBe(MONTO);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// BLOQUE 2 — payments/process: concurrencia
// ═════════════════════════════════════════════════════════════════════════════
describe("payments/process — concurrencia y ledger", () => {
  it("PC-05: doble clic simultáneo en payments/process — uno 200, el otro 409, 1 payment", async () => {
    const chargeId = await mkCharge(80_000);

    const [r1, r2] = await Promise.all([
      httpPost("/api/payments/process", { charge_id: chargeId, payment_method: "tarjeta" }, guardianJwt),
      httpPost("/api/payments/process", { charge_id: chargeId, payment_method: "tarjeta" }, guardianJwt),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect(await countExitosPayments(chargeId)).toBe(1);
    expect(await countApplications(chargeId)).toBe(1);
    expect(await chargeEstado(chargeId)).toBe("pagado");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// BLOQUE 3 — caja/pago-efectivo: parcialidad y concurrencia
// ═════════════════════════════════════════════════════════════════════════════
describe("caja/pago-efectivo — pago parcial y completion", () => {
  it("PC-06: pago parcial (monto < saldo) deja el cargo en estado 'parcial'", async () => {
    const chargeId = await mkCharge(120_000); // $1,200 total

    // charge_id explícito evita que caja seleccione otro cargo del mismo alumno
    const { status, body } = await httpPost(
      "/api/caja/pago-efectivo",
      { estudiante_id: studentId, charge_id: chargeId, monto: "400" }, // $400 de $1,200
      adminToken
    );

    expect(status).toBe(200);
    expect((body as any).charge_nuevo_estado).toBe("parcial");
    expect((body as any).monto_aplicado_centavos).toBe(40_000);

    expect(await chargeEstado(chargeId)).toBe("parcial");
    expect(await countApplications(chargeId)).toBe(1);

    // El ledger refleja el pago parcial
    const paRow = await pool.query(
      `SELECT SUM(amount_centavos)::bigint AS total FROM payment_applications WHERE charge_id=$1`,
      [chargeId]
    );
    expect(Number(paRow.rows[0].total)).toBe(40_000);
  });

  it("PC-07: segundo pago legítimo sobre cargo 'parcial' lo completa y queda 'pagado'", async () => {
    const chargeId = await mkCharge(120_000); // $1,200 total

    // Primer pago: $400 (parcial)
    await httpPost(
      "/api/caja/pago-efectivo",
      { estudiante_id: studentId, charge_id: chargeId, monto: "400" },
      adminToken
    );
    expect(await chargeEstado(chargeId)).toBe("parcial");

    // Segundo pago: $800 restantes (completa)
    const { status, body } = await httpPost(
      "/api/caja/pago-efectivo",
      { estudiante_id: studentId, charge_id: chargeId, monto: "800" },
      adminToken
    );

    expect(status).toBe(200);
    expect((body as any).charge_nuevo_estado).toBe("pagado");
    expect(await chargeEstado(chargeId)).toBe("pagado");
    expect(await countApplications(chargeId)).toBe(2);

    // Suma de applications == monto_base completo
    const paRow = await pool.query(
      `SELECT SUM(amount_centavos)::bigint AS total FROM payment_applications WHERE charge_id=$1`,
      [chargeId]
    );
    expect(Number(paRow.rows[0].total)).toBe(120_000);
  });

  it("PC-08: monto mayor al saldo queda cappado al saldo, charge queda 'pagado'", async () => {
    const chargeId = await mkCharge(50_000); // $500

    // Operador cobra $600 (más de lo debido) — se aplica solo $500
    const { body } = await httpPost(
      "/api/caja/pago-efectivo",
      { estudiante_id: studentId, charge_id: chargeId, monto: "600" },
      adminToken
    );

    expect((body as any).monto_aplicado_centavos).toBe(50_000); // cap
    expect((body as any).charge_nuevo_estado).toBe("pagado");
    expect(await chargeEstado(chargeId)).toBe("pagado");

    const paRow = await pool.query(
      `SELECT SUM(amount_centavos)::bigint AS total FROM payment_applications WHERE charge_id=$1`,
      [chargeId]
    );
    expect(Number(paRow.rows[0].total)).toBe(50_000);
  });

  it("PC-09: doble clic en caja — el cargo queda pagado exactamente una vez", async () => {
    const chargeId = await mkCharge(100_000);

    // Dos requests simultáneos apuntando al mismo charge_id.
    // El FOR UPDATE serializa: uno paga, el otro recibe "ya fue pagado o cancelado".
    const [r1, r2] = await Promise.all([
      httpPost(
        "/api/caja/pago-efectivo",
        { estudiante_id: studentId, charge_id: chargeId, monto: "1000" },
        adminToken
      ),
      httpPost(
        "/api/caja/pago-efectivo",
        { estudiante_id: studentId, charge_id: chargeId, monto: "1000" },
        adminToken
      ),
    ]);

    // Exactamente 1 payment_application — no doble cobro
    expect(await countApplications(chargeId)).toBe(1);
    expect(await chargeEstado(chargeId)).toBe("pagado");
    // Ambos devuelven 200 (el segundo indica "ya fue pagado") — no doble payment
    expect(await countExitosPayments(chargeId)).toBe(1);
  });
});
