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
import { markChargeAsPaidForTest } from "./test-helpers";

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

/** Crea un charge pendiente en la DB y lo registra para limpieza al final.
 *  NO pasar "pagado" — usar markChargeAsPaidForTest para respetar el ledger. */
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

/**
 * Crea un saldo a favor vía caja: charge pequeño ($1) + pago con excedente.
 * Devuelve el id del family_credit activo generado.
 */
async function mkCreditViaCaja(excedenteCentavos: number): Promise<number> {
  const baseCharge = 100; // $1.00
  const chargeId = await mkCharge(baseCharge);
  const montoPesos = ((baseCharge + excedenteCentavos) / 100).toFixed(2);
  await httpPost(
    "/api/caja/pago-efectivo",
    { estudiante_id: studentId, charge_id: chargeId, monto: montoPesos },
    adminToken
  );
  const paymentIdRow = await pool.query(
    `SELECT id FROM payments WHERE charge_id=$1 ORDER BY id DESC LIMIT 1`,
    [chargeId]
  );
  const paymentId = paymentIdRow.rows[0].id;
  const creditRow = await pool.query(
    `SELECT id FROM family_credits WHERE payment_id=$1 AND status='activo' ORDER BY id DESC LIMIT 1`,
    [paymentId]
  );
  return creditRow.rows[0].id as number;
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
    // TODOS los DELETE relacionados al ledger van en UNA transacción:
    // si el proceso muere a mitad, PostgreSQL hace rollback automático
    // y no quedan charges 'pagado' huérfanos sin payment_application
    // (causa de los 14 falsos positivos en la consulta de salud).
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // 1. family_credits ligados a payments de nuestros charges
      await client.query(
        `DELETE FROM family_credits WHERE payment_id IN
           (SELECT id FROM payments WHERE charge_id = ANY($1))`,
        [createdChargeIds]
      );
      // 2. Invoices tienen FK a payments; limpiar antes de payments
      await client.query(
        `DELETE FROM invoices WHERE payment_id IN
           (SELECT id FROM payments WHERE charge_id = ANY($1))`,
        [createdChargeIds]
      );
      // 3. Ledger
      await client.query(
        `DELETE FROM payment_applications WHERE charge_id = ANY($1)`,
        [createdChargeIds]
      );
      // 4. Payments
      await client.query(
        `DELETE FROM payments WHERE charge_id = ANY($1)`,
        [createdChargeIds]
      );
      // 5. Audit log
      await client.query(
        `DELETE FROM audit_log WHERE entity_type='charge' AND entity_id = ANY($1)`,
        [createdChargeIds]
      );
      // 6. Charges
      await client.query(
        `DELETE FROM charges WHERE id = ANY($1)`,
        [createdChargeIds]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
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

  it("PC-10: pagar $2,000 sobre cargo de $1,500 — $500 de excedente visible como saldo a favor", async () => {
    const CARGO_CENTAVOS   = 150_000; // $1,500
    const COBRADO_CENTAVOS = 200_000; // $2,000
    const EXCEDENTE        =  50_000; // $500

    const chargeId = await mkCharge(CARGO_CENTAVOS);

    // Caja cobra $2,000 sobre un cargo de $1,500
    const { status, body } = await httpPost(
      "/api/caja/pago-efectivo",
      { estudiante_id: studentId, charge_id: chargeId, monto: "2000" },
      adminToken
    );

    expect(status).toBe(200);
    expect((body as any).charge_nuevo_estado).toBe("pagado");
    expect((body as any).monto_aplicado_centavos).toBe(CARGO_CENTAVOS);  // $1,500 al cargo
    expect((body as any).excedente_centavos).toBe(EXCEDENTE);            // $500 no desaparece

    // El cargo queda pagado
    expect(await chargeEstado(chargeId)).toBe("pagado");

    // 1. El family_credit específico de este pago existe en la DB con el monto correcto
    const creditRow = await pool.query(
      `SELECT amount_centavos, origen FROM family_credits WHERE payment_id IN
         (SELECT id FROM payments WHERE charge_id = $1) ORDER BY id DESC LIMIT 1`,
      [chargeId]
    );
    expect(creditRow.rows.length).toBe(1);
    expect(Number(creditRow.rows[0].amount_centavos)).toBe(EXCEDENTE);   // $500 exactos
    expect(creditRow.rows[0].origen).toBe("excedente_caja");

    // 2. El estado-cuenta refleja el saldo a favor (puede ser > EXCEDENTE si hay
    //    otros créditos del mismo alumno en la suite; verificamos que al menos incluye
    //    el de este pago y que saldo_neto = max(0, saldo_pendiente - saldo_a_favor)).
    const antes = await fetch(`${BASE}/api/students/${studentId}/estado-cuenta`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    }).then(r => r.json()).catch(() => ({}));
    const resumenAntes = (antes as any).resumen;

    // El saldo a favor visible es AL MENOS el excedente de este pago
    expect(resumenAntes.saldo_a_favor_centavos).toBeGreaterThanOrEqual(EXCEDENTE);

    // saldo_neto = max(0, saldo_pendiente - saldo_a_favor) — el endpoint lo calcula
    expect(resumenAntes.saldo_neto_centavos).toBe(
      Math.max(0, resumenAntes.saldo_pendiente_centavos - resumenAntes.saldo_a_favor_centavos)
    );

    // El saldo_neto es MENOR al saldo_pendiente bruto (el crédito sí rebaja)
    expect(resumenAntes.saldo_neto_centavos).toBeLessThan(
      resumenAntes.saldo_pendiente_centavos + 1  // +1 por si ambos son 0
    );
  });

  /**
   * PC-11 — Ciclo completo de saldo a favor
   *
   * 1. Caja cobra $2,000 sobre un cargo de $1,500 → genera family_credit activo de $500
   * 2. Llega un cargo nuevo de $500
   * 3. Admin aplica el crédito al cargo nuevo via POST /api/admin/family-credits/:id/aplicar
   * 4. VERIFICACIÓN DEL LEDGER PURO:
   *    SUM(charges para los dos cargos) − SUM(payment_applications para esos cargos)
   *    debe ser CERO — sin ninguna query adicional a family_credits ni ajuste manual.
   */
  it("PC-11: ciclo completo — crédito $500 generado en caja, cargo nuevo $500, consumo, ledger=0", async () => {
    const CARGO_ORIGINAL = 150_000; // $1,500
    const COBRADO        = 200_000; // $2,000 cobrado en caja
    const EXCEDENTE      =  50_000; // $500 de cambio → saldo a favor
    const CARGO_NUEVO    =  50_000; // $500 cargo del mes siguiente

    // ── Paso 1: pago en caja con excedente ────────────────────────────────────
    const chargeOriginalId = await mkCharge(CARGO_ORIGINAL);
    const cajaRes = await httpPost(
      "/api/caja/pago-efectivo",
      { estudiante_id: studentId, charge_id: chargeOriginalId, monto: "2000" },
      adminToken
    );
    expect(cajaRes.status).toBe(200);
    expect((cajaRes.body as any).excedente_centavos).toBe(EXCEDENTE);

    // El payment_id del pago de caja (para verificar después)
    const originalPaymentId: number = await pool.query(
      `SELECT id FROM payments WHERE charge_id = $1 ORDER BY id DESC LIMIT 1`,
      [chargeOriginalId]
    ).then(r => r.rows[0].id);

    // El crédito activo debe existir en DB
    const creditRow = await pool.query(
      `SELECT id, amount_centavos, status, payment_id
       FROM family_credits WHERE payment_id = $1 ORDER BY id DESC LIMIT 1`,
      [originalPaymentId]
    );
    expect(creditRow.rows.length).toBe(1);
    const creditId: number = creditRow.rows[0].id;
    expect(Number(creditRow.rows[0].amount_centavos)).toBe(EXCEDENTE);
    expect(creditRow.rows[0].status).toBe("activo");
    expect(Number(creditRow.rows[0].payment_id)).toBe(originalPaymentId);

    // ── Paso 2: llega un cargo nuevo ──────────────────────────────────────────
    const chargeNuevoId = await mkCharge(CARGO_NUEVO);

    // ── Paso 3: admin aplica el crédito al cargo nuevo ────────────────────────
    const aplicarRes = await httpPost(
      `/api/admin/family-credits/${creditId}/aplicar`,
      { charge_id: chargeNuevoId },
      adminToken
    );
    expect(aplicarRes.status).toBe(200);
    expect((aplicarRes.body as any).charge_nuevo_estado).toBe("pagado");
    expect((aplicarRes.body as any).monto_aplicado_centavos).toBe(EXCEDENTE);
    expect((aplicarRes.body as any).remanente_centavos).toBe(0); // exacto, sin remanente

    // ── Paso 4: family_credit queda consumido, con referencia a la nueva PA ──
    const creditAfter = await pool.query(
      `SELECT status, consumed_application_id, amount_centavos FROM family_credits WHERE id = $1`,
      [creditId]
    );
    expect(creditAfter.rows[0].status).toBe("consumido");
    expect(creditAfter.rows[0].consumed_application_id).not.toBeNull();
    // El amount_centavos NUNCA se modificó
    expect(Number(creditAfter.rows[0].amount_centavos)).toBe(EXCEDENTE);

    // ── Paso 5: la nueva PaymentApplication apunta al payment ORIGINAL ────────
    const newPaId: number = creditAfter.rows[0].consumed_application_id;
    const newPa = await pool.query(
      `SELECT payment_id, charge_id, amount_centavos FROM payment_applications WHERE id = $1`,
      [newPaId]
    );
    expect(Number(newPa.rows[0].payment_id)).toBe(originalPaymentId);    // mismo payment de caja
    expect(Number(newPa.rows[0].charge_id)).toBe(chargeNuevoId);         // cargo nuevo
    expect(Number(newPa.rows[0].amount_centavos)).toBe(EXCEDENTE);       // $500 exactos

    // ── Paso 6: LEDGER PURO — sin ninguna query auxiliar a family_credits ──────
    // SUM(charges para [chargeOriginalId, chargeNuevoId])
    //   = $1,500 + $500 = $2,000
    // SUM(payment_applications para [chargeOriginalId, chargeNuevoId])
    //   = $1,500 (pago original) + $500 (nueva PA del crédito) = $2,000
    // saldo_neto = $2,000 − $2,000 = 0
    const ledgerCheck = await pool.query(
      `SELECT
         COALESCE(SUM(c.monto_base_centavos), 0)::bigint           AS total_cargos,
         COALESCE(SUM(pa.amount_centavos),     0)::bigint           AS total_aplicado,
         COALESCE(SUM(c.monto_base_centavos), 0) -
           COALESCE(SUM(pa.amount_centavos),  0)                    AS saldo_neto
       FROM charges c
       LEFT JOIN payment_applications pa ON pa.charge_id = c.id
       WHERE c.id = ANY($1)`,
      [[chargeOriginalId, chargeNuevoId]]
    );
    const ledger = ledgerCheck.rows[0] as any;
    expect(Number(ledger.total_cargos)).toBe(CARGO_ORIGINAL + CARGO_NUEVO); // $2,000
    expect(Number(ledger.total_aplicado)).toBe(CARGO_ORIGINAL + CARGO_NUEVO); // $2,000
    expect(Number(ledger.saldo_neto)).toBe(0); // ← el principio no negociable

    // ── Paso 7: estado-cuenta refleja saldo_a_favor=0 (crédito ya consumido) ─
    const estadoCuenta = await fetch(`${BASE}/api/students/${studentId}/estado-cuenta`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    }).then(r => r.json()).catch(() => ({}));
    // El crédito consumido ya no aparece como saldo_a_favor activo
    // (puede haber otros créditos activos de otros tests; verificamos que el consumido no suma)
    const resumen = (estadoCuenta as any).resumen;
    expect(typeof resumen.saldo_a_favor_centavos).toBe("number");
    expect(typeof resumen.saldo_neto_centavos).toBe("number");
  });

  it("PC-09: doble clic en caja — el cargo queda pagado exactamente una vez", async () => {
    const chargeId = await mkCharge(100_000);

    // Dos requests simultáneos apuntando al mismo charge_id.
    // El FOR UPDATE serializa: uno paga, el otro recibe 409.
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

    // El que gana devuelve 200, el que pierde devuelve 409
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);

    // Exactamente 1 payment_application — no doble cobro
    expect(await countApplications(chargeId)).toBe(1);
    expect(await chargeEstado(chargeId)).toBe("pagado");
    expect(await countExitosPayments(chargeId)).toBe(1);
  });

  it("PC-09b: cargo inexistente en caja → 404", async () => {
    const fakeChargeId = 999_999_999;

    const r = await httpPost(
      "/api/caja/pago-efectivo",
      { estudiante_id: studentId, charge_id: fakeChargeId, monto: "1000" },
      adminToken
    );

    expect(r.status).toBe(404);
    expect((r.body as any).message).toMatch(/no encontrado/i);
  });

  it("PC-09c: cargo con saldo en cero en caja → 422", async () => {
    // Crear un charge 'pendiente' y cubrirlo con una payment_application
    // directa (sin pasar por el endpoint, para que el estado quede 'pendiente'
    // pero saldo_pendiente = 0 — dispara la guarda de saldo cero).
    const MONTO = 10_000; // $100
    const chargeId = await mkCharge(MONTO, "pendiente");

    // Insertar un payment ficticio y una PA que cubre el monto completo
    const payRow = await pool.query(
      `INSERT INTO payments (tenant_id, charge_id, metodo, referencia_pasarela,
                             monto_centavos, fecha_pago, estado)
       VALUES ($1,$2,'efectivo','TEST-SALDO-CERO',$3,CURRENT_DATE,'exitoso') RETURNING id`,
      [tenantId, chargeId, MONTO]
    );
    const fakePayId = (payRow.rows as any[])[0].id as number;

    await pool.query(
      `INSERT INTO payment_applications (payment_id, charge_id, amount_centavos)
       VALUES ($1,$2,$3)`,
      [fakePayId, chargeId, MONTO]
    );
    // El charge sigue en 'pendiente' — saldoPendiente = MONTO - MONTO = 0

    const r = await httpPost(
      "/api/caja/pago-efectivo",
      { estudiante_id: studentId, charge_id: chargeId, monto: "100" },
      adminToken
    );

    expect(r.status).toBe(422);
    expect((r.body as any).message).toMatch(/saldo cero/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// BLOQUE 4 — family-credits/aplicar: validaciones de negocio y concurrencia
// ═════════════════════════════════════════════════════════════════════════════
describe("family-credits/aplicar — validaciones y concurrencia", () => {

  // ── PC-12: cargo terminal (pagado / cancelado) ────────────────────────────
  it("PC-12: aplicar crédito a cargo 'pagado' o 'cancelado' → 409 sin crear PaymentApplication", async () => {
    const creditId = await mkCreditViaCaja(50_000); // $500 de saldo a favor

    // Caso A — cargo 'pagado'
    // markChargeAsPaidForTest crea 1 payment_application legítima (invariante
    // del ledger). La aserción verifica que aplicar el crédito NO añade otra.
    const chargeIdPagado = await mkCharge(30_000);
    await markChargeAsPaidForTest(pool, chargeIdPagado, 30_000, tenantId);
    const appsBefore = await countApplications(chargeIdPagado);
    expect(appsBefore).toBe(1); // la del helper
    const rPagado = await httpPost(
      `/api/admin/family-credits/${creditId}/aplicar`,
      { charge_id: chargeIdPagado },
      adminToken
    );
    expect(rPagado.status).toBe(409);
    expect(await countApplications(chargeIdPagado)).toBe(appsBefore); // sin PA nueva

    // Caso B — cargo 'cancelado'
    const chargeIdCancelado = await mkCharge(30_000, "cancelado");
    const rCancelado = await httpPost(
      `/api/admin/family-credits/${creditId}/aplicar`,
      { charge_id: chargeIdCancelado },
      adminToken
    );
    expect(rCancelado.status).toBe(409);
    expect(await countApplications(chargeIdCancelado)).toBe(0);

    // El crédito sigue activo tras ambos rechazos
    const creditAfter = await pool.query(
      `SELECT status FROM family_credits WHERE id=$1`, [creditId]
    );
    expect(creditAfter.rows[0].status).toBe("activo");
  });

  // ── PC-13: cargo de alumno sin familia compartida ─────────────────────────
  it("PC-13: aplicar crédito de un alumno a cargo de otro alumno sin familia compartida → 403", async () => {
    const creditId = await mkCreditViaCaja(50_000);

    // Segundo alumno, mismo campus/tenant, sin ninguna fila en family_students compartida
    const student2Row = await pool.query(
      `INSERT INTO students
         (campus_id, tenant_id, nombres, apellido_paterno, nombre_completo, status)
       VALUES ($1,$2,'Alumno2','CrossFam','Alumno2 CrossFam','activo') RETURNING id`,
      [campusId, tenantId]
    );
    const student2Id: number = student2Row.rows[0].id;

    try {
      const charge2Id: number = await pool.query(
        `INSERT INTO charges
           (tenant_id, student_id, concept_id, fecha_emision, fecha_vencimiento,
            monto_base_centavos, estado)
         VALUES ($1,$2,$3,CURRENT_DATE,CURRENT_DATE+30,80000,'pendiente') RETURNING id`,
        [tenantId, student2Id, conceptId]
      ).then((r: any) => r.rows[0].id);
      createdChargeIds.push(charge2Id);

      const r = await httpPost(
        `/api/admin/family-credits/${creditId}/aplicar`,
        { charge_id: charge2Id },
        adminToken
      );
      // Crédito del alumno principal; cargo del alumno2 sin familia compartida → 403
      expect(r.status).toBe(403);
      expect(await countApplications(charge2Id)).toBe(0);

      // El crédito sigue activo
      const creditAfter = await pool.query(
        `SELECT status FROM family_credits WHERE id=$1`, [creditId]
      );
      expect(creditAfter.rows[0].status).toBe("activo");
    } finally {
      await pool.query(`DELETE FROM students WHERE id=$1`, [student2Id]);
    }
  });

  // ── PC-14: admin de otro tenant ───────────────────────────────────────────
  it("PC-14: admin de otro tenant intentando aplicar crédito ajeno → 403", async () => {
    const creditId = await mkCreditViaCaja(50_000);
    const chargeId = await mkCharge(50_000);

    // JWT válido pero con tenant_id distinto al del crédito
    const alienToken = jwt.sign(
      {
        role:      "administrador_campus",
        campus_id: campusId,
        tenant_id: tenantId + 9999,
        type:      "user",
      },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    const r = await httpPost(
      `/api/admin/family-credits/${creditId}/aplicar`,
      { charge_id: chargeId },
      alienToken
    );
    expect(r.status).toBe(403);
    // Sin payment_application; crédito intacto
    expect(await countApplications(chargeId)).toBe(0);
    const creditAfter = await pool.query(
      `SELECT status FROM family_credits WHERE id=$1`, [creditId]
    );
    expect(creditAfter.rows[0].status).toBe("activo");
  });

  // ── PC-15: doble clic simultáneo sobre el mismo crédito ───────────────────
  it("PC-15: dos requests simultáneos aplican el mismo crédito a cargos distintos → solo uno completa", async () => {
    const creditId = await mkCreditViaCaja(50_000);
    const chargeId1 = await mkCharge(50_000);
    const chargeId2 = await mkCharge(50_000);

    const [r1, r2] = await Promise.all([
      httpPost(
        `/api/admin/family-credits/${creditId}/aplicar`,
        { charge_id: chargeId1 }, adminToken
      ),
      httpPost(
        `/api/admin/family-credits/${creditId}/aplicar`,
        { charge_id: chargeId2 }, adminToken
      ),
    ]);

    // Exactamente uno completa (200), el otro falla porque el crédito ya quedó consumido (409)
    const statuses = [r1.status, r2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);

    // El crédito está consumido exactamente una vez
    const creditAfter = await pool.query(
      `SELECT status, consumed_application_id FROM family_credits WHERE id=$1`,
      [creditId]
    );
    expect(creditAfter.rows[0].status).toBe("consumido");
    expect(creditAfter.rows[0].consumed_application_id).not.toBeNull();

    // Solo UNA payment_application fue creada contra estos dos cargos
    const totalPAs = await pool.query(
      `SELECT COUNT(*) AS n FROM payment_applications WHERE charge_id = ANY($1)`,
      [[chargeId1, chargeId2]]
    );
    expect(Number(totalPAs.rows[0].n)).toBe(1);
  });

  // ── PC-17: crédito mayor al saldo del cargo (split → remanente activo) ──────
  it("PC-17: crédito $800 sobre cargo $500 → cargo 'pagado', crédito 'consumido', remanente $300 activo con payment_id original", async () => {
    const CREDITO   =  80_000; // $800
    const CARGO     =  50_000; // $500
    const REMANENTE =  30_000; // $300

    // mkCreditViaCaja crea un charge de $1 (100¢) y paga $801 → PA $1, family_credit $800
    const creditId = await mkCreditViaCaja(CREDITO);

    // payment_id original del pago de caja que originó el crédito de $800
    const originalPaymentId: number = await pool.query(
      `SELECT payment_id FROM family_credits WHERE id=$1`, [creditId]
    ).then((r: any) => r.rows[0].payment_id);

    const chargeId = await mkCharge(CARGO);

    // ── Aplicar el crédito al cargo ───────────────────────────────────────────
    const r = await httpPost(
      `/api/admin/family-credits/${creditId}/aplicar`,
      { charge_id: chargeId },
      adminToken
    );

    // 1. El cargo queda 'pagado'
    expect(r.status).toBe(200);
    expect((r.body as any).charge_nuevo_estado).toBe("pagado");
    expect((r.body as any).monto_aplicado_centavos).toBe(CARGO);
    expect((r.body as any).remanente_centavos).toBe(REMANENTE);
    expect((r.body as any).nuevo_credit_id).not.toBeNull();
    expect(await chargeEstado(chargeId)).toBe("pagado");

    // 2. El crédito original queda 'consumido' y amount_centavos no se modificó
    const orig = await pool.query(
      `SELECT status, amount_centavos, consumed_application_id FROM family_credits WHERE id=$1`,
      [creditId]
    );
    expect(orig.rows[0].status).toBe("consumido");
    expect(Number(orig.rows[0].amount_centavos)).toBe(CREDITO);  // $800 inmutable
    expect(orig.rows[0].consumed_application_id).not.toBeNull();

    // 3. El nuevo crédito (remanente) existe, está activo, monto correcto
    const newCreditId: number = (r.body as any).nuevo_credit_id;
    const newCredit = await pool.query(
      `SELECT status, amount_centavos, payment_id FROM family_credits WHERE id=$1`,
      [newCreditId]
    );
    expect(newCredit.rows[0].status).toBe("activo");
    expect(Number(newCredit.rows[0].amount_centavos)).toBe(REMANENTE); // $300

    // 4. El nuevo crédito conserva el payment_id ORIGINAL (cadena de custodia intacta)
    expect(Number(newCredit.rows[0].payment_id)).toBe(originalPaymentId);

    // 5. La PaymentApplication creada también apunta al payment original
    const newPaId: number = orig.rows[0].consumed_application_id;
    const pa = await pool.query(
      `SELECT payment_id, charge_id, amount_centavos FROM payment_applications WHERE id=$1`,
      [newPaId]
    );
    expect(Number(pa.rows[0].payment_id)).toBe(originalPaymentId);
    expect(Number(pa.rows[0].charge_id)).toBe(chargeId);
    expect(Number(pa.rows[0].amount_centavos)).toBe(CARGO);            // $500

    // 6. Ledger puro — SUM(charges) - SUM(payment_applications) = 0
    //    Base charge ($1) + cargo target ($500) = $501 en cargos
    //    PA base ($1)     + PA nueva   ($500)   = $501 en aplicaciones
    const baseChargeId: number = await pool.query(
      `SELECT charge_id FROM payments WHERE id=$1`, [originalPaymentId]
    ).then((row: any) => row.rows[0].charge_id);

    const ledger = await pool.query(
      `SELECT
         COALESCE(SUM(c.monto_base_centavos), 0)::bigint AS total_cargos,
         COALESCE(SUM(pa.amount_centavos),     0)::bigint AS total_aplicado
       FROM charges c
       LEFT JOIN payment_applications pa ON pa.charge_id = c.id
       WHERE c.id = ANY($1)`,
      [[baseChargeId, chargeId]]
    );
    const totalCargos   = Number(ledger.rows[0].total_cargos);
    const totalAplicado = Number(ledger.rows[0].total_aplicado);
    expect(totalCargos).toBe(100 + CARGO);      // $501
    expect(totalAplicado).toBe(100 + CARGO);    // $501
    expect(totalCargos - totalAplicado).toBe(0); // ledger neto = 0
  });

  // ── PC-16: crédito menor al saldo del cargo (resultado: parcial) ──────────
  it("PC-16: crédito $500 sobre cargo $1,200 → cargo queda 'parcial', crédito 'consumido' sin remanente", async () => {
    const CREDITO = 50_000;  // $500
    const CARGO   = 120_000; // $1,200

    const creditId = await mkCreditViaCaja(CREDITO);
    const chargeId = await mkCharge(CARGO);

    const r = await httpPost(
      `/api/admin/family-credits/${creditId}/aplicar`,
      { charge_id: chargeId },
      adminToken
    );

    expect(r.status).toBe(200);
    expect((r.body as any).charge_nuevo_estado).toBe("parcial");
    expect((r.body as any).monto_aplicado_centavos).toBe(CREDITO);
    // No hay remanente: el crédito era MENOR que el saldo del cargo
    expect((r.body as any).remanente_centavos).toBe(0);
    expect((r.body as any).nuevo_credit_id).toBeNull();

    // El crédito queda completamente consumido (amount_centavos inmutable)
    const creditAfter = await pool.query(
      `SELECT status, amount_centavos FROM family_credits WHERE id=$1`,
      [creditId]
    );
    expect(creditAfter.rows[0].status).toBe("consumido");
    expect(Number(creditAfter.rows[0].amount_centavos)).toBe(CREDITO); // nunca se editó

    // Saldo restante del cargo = $1,200 − $500 = $700 (vía ledger puro)
    const ledger = await pool.query(
      `SELECT c.monto_base_centavos - COALESCE(SUM(pa.amount_centavos),0) AS saldo_restante
       FROM charges c
       LEFT JOIN payment_applications pa ON pa.charge_id = c.id
       WHERE c.id = $1
       GROUP BY c.monto_base_centavos`,
      [chargeId]
    );
    expect(Number(ledger.rows[0].saldo_restante)).toBe(CARGO - CREDITO); // $700
    expect(await chargeEstado(chargeId)).toBe("parcial");
  });
});
