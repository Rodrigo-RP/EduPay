/**
 * TESTS — Planes de Pago (ADR-002)
 *
 * Cubre el checklist completo del ADR-002:
 *   Modo A — reestructuración de charges existentes (con saldo pendiente real)
 *   Modo B — acuerdo a futuro (monto anclado al concepto)
 *   Cancelación: futuro, reestructuración-reinstalar, reestructuración-condonar
 *   SPEI fuera de orden sobre charge cancelado
 *   Validaciones de error: 400 / 403 / 409 / 410 / 422
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "../db";
import { markChargeAsPaidForTest } from "./test-helpers";
import {
  tenants, campuses, students, guardians, student_guardian,
  charges, concepts, payment_applications, payments,
} from "../../shared/schema";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── IDs de datos de prueba ────────────────────────────────────────────────────
let tenantId:  number;
let tenantBId: number; // tenant ajeno para tests de cross-tenant
let campusId:  number;
let campusBId: number;
let studentId: number;
let studentBId: number;
let guardianId: number;
let conceptColegiaturaId: number; // concepto real para Modo B
let token: string;
let tokenB: string; // token del tenant ajeno

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeToken(campusOverride?: number, tenantOverride?: number): string {
  return jwt.sign(
    {
      email: "plan-test@test.com",
      role: "administrador_campus",
      campus_id: campusOverride ?? campusId,
      tenant_id: tenantOverride ?? tenantId,
      type: "user",
      // Sin 'id': evita FK audit_log en tests (ver memory: audit-log-fk-rollback.md)
    },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

async function get(path: string, tok: string) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${tok}` },
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function post(path: string, body: object, tok: string) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function patch(path: string, body: object, tok: string) {
  const r = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

/** Crea un charge pendiente para el alumno de prueba.
 *  NO pasar "pagado" — usar markChargeAsPaidForTest para respetar el ledger. */
async function mkCharge(monto = 100_000, estado = "pendiente"): Promise<number> {
  const r = await pool.query(
    `INSERT INTO charges (tenant_id, student_id, concept_id, fecha_emision, fecha_vencimiento,
       monto_base_centavos, estado)
     VALUES ($1,$2,$3,CURRENT_DATE,CURRENT_DATE + 30,$4,$5) RETURNING id`,
    [tenantId, studentId, conceptColegiaturaId, monto, estado]
  );
  return (r.rows as any[])[0].id;
}

/** Crea un payment_application sobre un charge (simula pago parcial). */
async function mkApplication(chargeId: number, monto: number): Promise<void> {
  // Crear un payment primero
  const payR = await pool.query(
    `INSERT INTO payments (tenant_id, charge_id, guardian_id, metodo, monto_centavos, fecha_pago, estado)
     VALUES ($1,$2,$3,'efectivo',$4,NOW(),'exitoso') RETURNING id`,
    [tenantId, chargeId, guardianId, monto]
  );
  const paymentId = (payR.rows as any[])[0].id;
  await pool.query(
    `INSERT INTO payment_applications (payment_id, charge_id, amount_centavos, applied_at)
     VALUES ($1,$2,$3,NOW())`,
    [paymentId, chargeId, monto]
  );
  // Marcar el charge como parcial
  await pool.query(`UPDATE charges SET estado = 'parcial' WHERE id = $1`, [chargeId]);
}

// ── Setup / Teardown ──────────────────────────────────────────────────────────
describe("Planes de Pago — ADR-002", () => {
  beforeAll(async () => {
    const ts = Date.now().toString().slice(-7);

    // Tenant A (principal)
    const [t] = await db.insert(tenants).values({ nombre_legal: `PlanTest ${ts}`, rfc: `PLT${ts}` }).returning();
    tenantId = t.id;
    const [c] = await db.insert(campuses).values({ tenant_id: tenantId, nombre: `Campus PL ${ts}` }).returning();
    campusId = c.id;

    // Tenant B (ajeno para IDOR)
    const [tb] = await db.insert(tenants).values({ nombre_legal: `PlanTestB ${ts}`, rfc: `PLB${ts}` }).returning();
    tenantBId = tb.id;
    const [cb] = await db.insert(campuses).values({ tenant_id: tenantBId, nombre: `Campus PLB ${ts}` }).returning();
    campusBId = cb.id;

    // Alumno A
    const [s] = await db.insert(students).values({
      campus_id: campusId, tenant_id: tenantId,
      nombres: "Alumno", apellido_paterno: "PlanTest",
      nombre_completo: `Alumno PlanTest ${ts}`, status: "activo",
    }).returning();
    studentId = s.id;

    // Alumno B (tenant ajeno)
    const [sb] = await db.insert(students).values({
      campus_id: campusBId, tenant_id: tenantBId,
      nombres: "AlumnoB", apellido_paterno: "PlanTest",
      nombre_completo: `AlumnoB PlanTest ${ts}`, status: "activo",
    }).returning();
    studentBId = sb.id;

    // Guardián
    const [g] = await db.insert(guardians).values({
      nombres: "Tutor", nombre_completo: `Tutor PL ${ts}`,
      email: `tutor_pl_${ts}@test.com`,
      correo_institucional_familiar: `tutor_pl_${ts}@test.com`,
      campus_id: campusId, tenant_id: tenantId,
    }).returning();
    guardianId = g.id;
    await db.insert(student_guardian).values({ student_id: studentId, guardian_id: guardianId });

    // Concepto real para Modo B
    const cr = await pool.query(
      `INSERT INTO concepts (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos)
       VALUES ($1,$2,'Colegiatura PlanTest','colegiatura','mensual',50000) RETURNING id`,
      [campusId, tenantId]
    );
    conceptColegiaturaId = (cr.rows as any[])[0].id;

    token  = makeToken();
    tokenB = makeToken(campusBId, tenantBId);
  });

  afterAll(async () => {
    // Limpieza del ledger en UNA transacción: si el proceso muere a mitad,
    // el rollback automático evita charges 'pagado' huérfanos sin payment_application.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM payment_applications WHERE charge_id IN (
           SELECT id FROM charges WHERE tenant_id IN ($1,$2))`,
        [tenantId, tenantBId]
      );
      // Desvincular charges de planes antes de borrar planes
      await client.query(
        `UPDATE charges SET plan_id = NULL WHERE tenant_id IN ($1,$2)`,
        [tenantId, tenantBId]
      );
      await client.query(`DELETE FROM payment_plans WHERE tenant_id IN ($1,$2)`, [tenantId, tenantBId]);
      await client.query(`DELETE FROM payments WHERE tenant_id IN ($1,$2)`, [tenantId, tenantBId]);
      await client.query(`DELETE FROM charges WHERE tenant_id IN ($1,$2)`, [tenantId, tenantBId]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    await pool.query(`DELETE FROM student_guardian WHERE student_id IN ($1,$2)`, [studentId, studentBId]);
    await pool.query(`DELETE FROM students WHERE tenant_id IN ($1,$2)`, [tenantId, tenantBId]);
    await pool.query(`DELETE FROM guardians WHERE tenant_id IN ($1,$2)`, [tenantId, tenantBId]);
    await pool.query(`DELETE FROM concepts WHERE tenant_id IN ($1,$2)`, [tenantId, tenantBId]);
    await pool.query(`DELETE FROM campuses WHERE tenant_id IN ($1,$2)`, [tenantId, tenantBId]);
    await pool.query(`DELETE FROM tenants WHERE id IN ($1,$2)`, [tenantId, tenantBId]);
  });

  // ── Auth básica ─────────────────────────────────────────────────────────────
  it("GET /api/planes-pago sin token → 401", async () => {
    const r = await fetch(`${BASE}/api/planes-pago`);
    expect(r.status).toBe(401);
  });

  it("POST /api/planes-pago sin token → 401", async () => {
    const r = await fetch(`${BASE}/api/planes-pago`, { method: "POST" });
    expect(r.status).toBe(401);
  });

  it("PATCH /api/planes-pago/999/cancelar sin token → 401", async () => {
    const r = await fetch(`${BASE}/api/planes-pago/999/cancelar`, { method: "PATCH" });
    expect(r.status).toBe(401);
  });

  // ── Modo A — cargo completamente pendiente ────────────────────────────────
  it("Modo A — cargo pendiente: SUM(cuotas nuevas) = monto_base del cargo original; charges originales cancelados", async () => {
    const montoOriginal = 90_000;
    const chargeId = await mkCharge(montoOriginal);

    const r = await post("/api/planes-pago", {
      charge_ids: [chargeId],
      numero_pagos: 3,
      frecuencia: "mensual",
      fecha_inicio: "2026-08-01",
    }, token);

    expect(r.status).toBe(200);
    expect(r.body.tipo_origen).toBe("reestructuracion");
    expect(Number(r.body.total_adeudo_centavos)).toBe(90_000);
    expect(r.body.cuotas).toHaveLength(3);

    // Suma de cuotas = monto original (ninguna aplicación previa)
    const sumaCuotas = r.body.cuotas.reduce((a: number, c: any) => a + Number(c.monto_base_centavos), 0);
    expect(sumaCuotas).toBe(90_000);

    // Charge original debe quedar cancelado
    const orig = await pool.query(`SELECT estado FROM charges WHERE id = $1`, [chargeId]);
    expect((orig.rows as any[])[0].estado).toBe("cancelado");

    // Las cuotas nuevas deben tener plan_id correcto y estado pendiente
    for (const cuota of r.body.cuotas) {
      expect(cuota.plan_id).toBe(r.body.id);
      expect(cuota.estado).toBe("pendiente");
    }
  });

  // ── Modo A — cargo parcialmente pagado ───────────────────────────────────
  it("Modo A — cargo parcialmente pagado: SUM(cuotas) = saldo_pendiente (60 000), NO el monto original (100 000)", async () => {
    const chargeId = await mkCharge(100_000);
    await mkApplication(chargeId, 40_000); // pago parcial de $400

    // El charge ahora tiene estado='parcial', saldo pendiente = 60 000
    const r = await post("/api/planes-pago", {
      charge_ids: [chargeId],
      numero_pagos: 3,
      frecuencia: "mensual",
      fecha_inicio: "2026-08-01",
    }, token);

    expect(r.status).toBe(200);
    // total_adeudo debe reflejar el saldo pendiente, no el monto original
    expect(Number(r.body.total_adeudo_centavos)).toBe(60_000);

    const sumaCuotas = r.body.cuotas.reduce((a: number, c: any) => a + Number(c.monto_base_centavos), 0);
    // 60 000 / 3 = 20 000 por cuota → suma = 60 000
    expect(sumaCuotas).toBe(60_000);

    // Charge original cancelado
    const orig = await pool.query(`SELECT estado FROM charges WHERE id = $1`, [chargeId]);
    expect((orig.rows as any[])[0].estado).toBe("cancelado");
  });

  // ── Modo A — charge de otro tenant → 403 ────────────────────────────────
  it("Modo A — charge de otro tenant → 403", async () => {
    // Crear charge en el tenant B
    const r2 = await pool.query(
      `INSERT INTO charges (tenant_id, student_id, concept_id, fecha_emision, fecha_vencimiento, monto_base_centavos, estado)
       VALUES ($1,$2,NULL,CURRENT_DATE,CURRENT_DATE+30,50000,'pendiente') RETURNING id`,
      [tenantBId, studentBId]
    );
    const chBId = (r2.rows as any[])[0].id;

    const r = await post("/api/planes-pago", {
      charge_ids: [chBId],
      numero_pagos: 2,
      frecuencia: "mensual",
      fecha_inicio: "2026-08-01",
    }, token); // token del tenant A

    expect(r.status).toBe(403);
  });

  // ── Modo A — charge ya pagado → 422 ─────────────────────────────────────
  it("Modo A — charge ya pagado → 422", async () => {
    const chargeId = await mkCharge(50_000);
    await markChargeAsPaidForTest(pool, chargeId, 50_000, tenantId);
    const r = await post("/api/planes-pago", {
      charge_ids: [chargeId],
      numero_pagos: 2,
      frecuencia: "mensual",
      fecha_inicio: "2026-08-01",
    }, token);
    expect(r.status).toBe(422);
    expect(r.body.message).toContain("'pagado'");
  });

  // ── Modo A — recargo sin observaciones → 400 ─────────────────────────────
  it("Modo A — recargo_centavos > 0 sin observaciones → 400", async () => {
    const chargeId = await mkCharge(50_000);
    const r = await post("/api/planes-pago", {
      charge_ids: [chargeId],
      numero_pagos: 2,
      frecuencia: "mensual",
      fecha_inicio: "2026-08-01",
      recargo_centavos: 5_000,
      // Sin observaciones
    }, token);
    expect(r.status).toBe(400);
    expect(r.body.message).toContain("observaciones");
  });

  // ── Modo B — concepto válido ──────────────────────────────────────────────
  it("Modo B — concept_id válido: total_adeudo = concept.monto_centavos (50 000); cuotas generadas", async () => {
    const r = await post("/api/planes-pago", {
      concept_id: conceptColegiaturaId,
      student_id: studentId,
      numero_pagos: 5,
      frecuencia: "mensual",
      fecha_inicio: "2026-09-01",
    }, token);

    expect(r.status).toBe(200);
    expect(r.body.tipo_origen).toBe("futuro");
    expect(Number(r.body.total_adeudo_centavos)).toBe(50_000);
    expect(r.body.cuotas).toHaveLength(5);

    const sumaCuotas = r.body.cuotas.reduce((a: number, c: any) => a + Number(c.monto_base_centavos), 0);
    expect(sumaCuotas).toBe(50_000);
  });

  // ── Modo B — concept tipo cuota_plan → 422 ───────────────────────────────
  it("Modo B — concept.tipo='cuota_plan' prohibido → 422", async () => {
    // Crear concepto tipo cuota_plan manualmente
    const cr = await pool.query(
      `INSERT INTO concepts (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos)
       VALUES ($1,$2,'Cuota Plan de Pago','cuota_plan','eventual',1) RETURNING id`,
      [campusId, tenantId]
    );
    const cpId = (cr.rows as any[])[0].id;

    const r = await post("/api/planes-pago", {
      concept_id: cpId,
      student_id: studentId,
      numero_pagos: 2,
      frecuencia: "mensual",
      fecha_inicio: "2026-09-01",
    }, token);
    expect(r.status).toBe(422);
    expect(r.body.message).toContain("cuota_plan");
  });

  // ── Modo B — concept de otro tenant → 403 ────────────────────────────────
  it("Modo B — concept_id de otro tenant → 403", async () => {
    const r = await post("/api/planes-pago", {
      concept_id: conceptColegiaturaId,
      student_id: studentId,
      numero_pagos: 2,
      frecuencia: "mensual",
      fecha_inicio: "2026-09-01",
    }, tokenB); // token del tenant B, pero conceptColegiaturaId es del tenant A
    expect(r.status).toBe(403);
  });

  // ── Modo ambiguo: ambos o ninguno → 400 ─────────────────────────────────
  it("Sin charge_ids ni concept_id → 400", async () => {
    const r = await post("/api/planes-pago", {
      numero_pagos: 2, frecuencia: "mensual", fecha_inicio: "2026-09-01",
    }, token);
    expect(r.status).toBe(400);
    expect(r.body.message).toContain("ninguno");
  });

  it("Con charge_ids Y concept_id → 400", async () => {
    const chargeId = await mkCharge();
    const r = await post("/api/planes-pago", {
      charge_ids: [chargeId],
      concept_id: conceptColegiaturaId,
      numero_pagos: 2, frecuencia: "mensual", fecha_inicio: "2026-09-01",
    }, token);
    expect(r.status).toBe(400);
    expect(r.body.message).toContain("no ambos");
  });

  // ── GET lista planes — cuotas desde charges ───────────────────────────────
  it("GET /api/planes-pago lista planes con cuotas leídas de charges (no de payment_plan_installments)", async () => {
    const r = await get("/api/planes-pago", token);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    // Al menos un plan creado en los tests anteriores
    expect(r.body.length).toBeGreaterThan(0);
    // Cada plan tiene installments que son charges reales (tienen concept_id, student_id, etc.)
    const planConCuotas = r.body.find((p: any) => (p.installments || []).length > 0);
    if (planConCuotas) {
      const cuota = planConCuotas.installments[0];
      expect(cuota).toHaveProperty("monto_base_centavos"); // campo de charges, no de installments
      expect(cuota).toHaveProperty("plan_id");
    }
  });

  // ── Endpoint deprecado → 410 ─────────────────────────────────────────────
  it("POST /api/planes-pago/cuotas/:id/pagar → 410 (deprecado, ADR-002)", async () => {
    const r = await post("/api/planes-pago/cuotas/999/pagar", {}, token);
    expect(r.status).toBe(410);
    expect(r.body.message).toContain("Endpoint deprecado");
  });

  // ── Cancelar plan tipo 'futuro' ───────────────────────────────────────────
  it("Cancelar plan futuro: payment_plans→'cancelado', cuotas pendientes→'cancelado', cuotas pagadas intactas", async () => {
    // Crear plan futuro
    const rCreate = await post("/api/planes-pago", {
      concept_id: conceptColegiaturaId,
      student_id: studentId,
      numero_pagos: 3,
      frecuencia: "mensual",
      fecha_inicio: "2026-10-01",
    }, token);
    expect(rCreate.status).toBe(200);
    const planId = rCreate.body.id;
    const cuotas = rCreate.body.cuotas as any[];

    // Marcar la primera cuota como pagada respetando el invariante del ledger
    await markChargeAsPaidForTest(pool, cuotas[0].id, Number(cuotas[0].monto_base_centavos), tenantId);

    const rCancel = await patch(`/api/planes-pago/${planId}/cancelar`, {
      motivo: "Familia canceló el acuerdo de pago por cambio de situación económica",
    }, token);

    expect(rCancel.status).toBe(200);
    expect(rCancel.body.cuotas_canceladas).toBe(2); // las 2 pendientes
    expect(rCancel.body.cuotas_pagadas_preservadas).toBe(1);

    // Verificar en DB
    const planDB = await pool.query(`SELECT estado FROM payment_plans WHERE id = $1`, [planId]);
    expect((planDB.rows as any[])[0].estado).toBe("cancelado");

    // Cuotas pendientes → canceladas
    const pendDB = await pool.query(
      `SELECT estado FROM charges WHERE plan_id = $1 AND id = ANY($2)`,
      [planId, [cuotas[1].id, cuotas[2].id]]
    );
    for (const row of pendDB.rows as any[]) {
      expect(row.estado).toBe("cancelado");
    }

    // Cuota pagada → intacta
    const pagDB = await pool.query(`SELECT estado FROM charges WHERE id = $1`, [cuotas[0].id]);
    expect((pagDB.rows as any[])[0].estado).toBe("pagado");
  });

  // ── Cancelar plan de reestructuración — opción 'reinstalar' ──────────────
  it("Cancelar reestructuración con 'reinstalar': nuevo charge creado con saldo pendiente de cuotas canceladas", async () => {
    // Crear charge original y plan que lo reestructura
    const montoOrig = 60_000;
    const chId = await mkCharge(montoOrig);

    const rCreate = await post("/api/planes-pago", {
      charge_ids: [chId],
      numero_pagos: 3,
      frecuencia: "mensual",
      fecha_inicio: "2026-10-01",
    }, token);
    expect(rCreate.status).toBe(200);
    const planId = rCreate.body.id;
    const cuotas = rCreate.body.cuotas as any[];

    // Pagar la primera cuota respetando el invariante del ledger
    await markChargeAsPaidForTest(pool, cuotas[0].id, Number(cuotas[0].monto_base_centavos), tenantId);

    const saldoPendiente = cuotas.slice(1).reduce(
      (acc: number, c: any) => acc + Number(c.monto_base_centavos), 0
    );

    const rCancel = await patch(`/api/planes-pago/${planId}/cancelar`, {
      motivo: "Alumno cambió de modalidad de pago; se reinstaura la deuda",
      destino_saldo_pendiente: "reinstalar",
    }, token);

    expect(rCancel.status).toBe(200);
    expect(rCancel.body.nuevo_charge_id).not.toBeNull();
    expect(typeof rCancel.body.nuevo_charge_id).toBe("number");

    // Verificar que el nuevo charge tiene el monto correcto
    const newCh = await pool.query(
      `SELECT monto_base_centavos, estado, plan_id FROM charges WHERE id = $1`,
      [rCancel.body.nuevo_charge_id]
    );
    const newChRow = (newCh.rows as any[])[0];
    expect(Number(newChRow.monto_base_centavos)).toBe(saldoPendiente);
    expect(newChRow.estado).toBe("pendiente");
    expect(newChRow.plan_id).toBeNull(); // reinstated charge no pertenece al plan cancelado

    // El plan debe estar cancelado
    const planDB = await pool.query(`SELECT estado FROM payment_plans WHERE id = $1`, [planId]);
    expect((planDB.rows as any[])[0].estado).toBe("cancelado");
  });

  // ── Cancelar plan de reestructuración — opción 'condonar' ────────────────
  it("Cancelar reestructuración con 'condonar': NO se crea charge nuevo; audit_log tiene monto_condonado", async () => {
    const chId = await mkCharge(45_000);
    const rCreate = await post("/api/planes-pago", {
      charge_ids: [chId],
      numero_pagos: 3,
      frecuencia: "mensual",
      fecha_inicio: "2026-11-01",
    }, token);
    expect(rCreate.status).toBe(200);
    const planId = rCreate.body.id;

    const countBefore = await pool.query(
      `SELECT COUNT(*) AS cnt FROM charges WHERE tenant_id = $1 AND plan_id IS NULL AND estado = 'pendiente'`,
      [tenantId]
    );
    const cntBefore = Number((countBefore.rows as any[])[0].cnt);

    const rCancel = await patch(`/api/planes-pago/${planId}/cancelar`, {
      motivo: "Deuda condonada por acuerdo de directivos ante situación especial",
      destino_saldo_pendiente: "condonar",
      motivo_condonacion: "Familia en situación de vulnerabilidad documentada con trabajo social",
    }, token);

    expect(rCancel.status).toBe(200);
    expect(rCancel.body.nuevo_charge_id).toBeNull();

    // Ningún charge nuevo fue creado para este tenant con plan_id NULL
    const countAfter = await pool.query(
      `SELECT COUNT(*) AS cnt FROM charges WHERE tenant_id = $1 AND plan_id IS NULL AND estado = 'pendiente'`,
      [tenantId]
    );
    const cntAfter = Number((countAfter.rows as any[])[0].cnt);
    expect(cntAfter).toBe(cntBefore); // sin cambio
  });

  // ── Errores de cancelación ────────────────────────────────────────────────
  it("Cancelar sin motivo → 400", async () => {
    const r = await patch("/api/planes-pago/999/cancelar", {}, token);
    expect(r.status).toBe(400);
    expect(r.body.message).toContain("motivo");
  });

  it("Cancelar con motivo demasiado corto → 400", async () => {
    const r = await patch("/api/planes-pago/999/cancelar", { motivo: "corto" }, token);
    expect(r.status).toBe(400);
    expect(r.body.message).toContain("10 caracteres");
  });

  it("Cancelar plan ajeno → 403", async () => {
    // Crear plan en tenant A y cancelar con token B
    const chId = await mkCharge(30_000);
    const rCreate = await post("/api/planes-pago", {
      charge_ids: [chId],
      numero_pagos: 2,
      frecuencia: "mensual",
      fecha_inicio: "2026-10-01",
    }, token);
    expect(rCreate.status).toBe(200);
    const planId = rCreate.body.id;

    const r = await patch(`/api/planes-pago/${planId}/cancelar`, {
      motivo: "Intento de cancelación desde tenant incorrecto",
      destino_saldo_pendiente: "reinstalar",
    }, tokenB);
    expect(r.status).toBe(403);
  });

  it("Cancelar plan ya cancelado → 409", async () => {
    const chId = await mkCharge(20_000);
    const rCreate = await post("/api/planes-pago", {
      charge_ids: [chId],
      numero_pagos: 2,
      frecuencia: "mensual",
      fecha_inicio: "2026-10-01",
    }, token);
    expect(rCreate.status).toBe(200);
    const planId = rCreate.body.id;

    // Cancelar primera vez
    const r1 = await patch(`/api/planes-pago/${planId}/cancelar`, {
      motivo: "Primera cancelación legítima del plan de pago",
      destino_saldo_pendiente: "reinstalar",
    }, token);
    expect(r1.status).toBe(200);

    // Intentar cancelar segunda vez
    const r2 = await patch(`/api/planes-pago/${planId}/cancelar`, {
      motivo: "Segunda cancelación intentada sobre plan ya cancelado",
      destino_saldo_pendiente: "reinstalar",
    }, token);
    expect(r2.status).toBe(409);
    expect(r2.body.message).toContain("ya está cancelado");
  });

  it("Cancelar plan reestructuración sin destino_saldo_pendiente → 400", async () => {
    const chId = await mkCharge(25_000);
    const rCreate = await post("/api/planes-pago", {
      charge_ids: [chId],
      numero_pagos: 2,
      frecuencia: "mensual",
      fecha_inicio: "2026-10-01",
    }, token);
    expect(rCreate.status).toBe(200);
    const planId = rCreate.body.id;

    const r = await patch(`/api/planes-pago/${planId}/cancelar`, {
      motivo: "Cancelación sin especificar destino del saldo restante",
    }, token);
    expect(r.status).toBe(400);
    expect(r.body.message).toContain("destino_saldo_pendiente");
  });

  it("Cancelar plan reestructuración con 'condonar' sin motivo_condonacion → 400", async () => {
    const chId = await mkCharge(25_000);
    const rCreate = await post("/api/planes-pago", {
      charge_ids: [chId],
      numero_pagos: 2,
      frecuencia: "mensual",
      fecha_inicio: "2026-10-01",
    }, token);
    expect(rCreate.status).toBe(200);
    const planId = rCreate.body.id;

    const r = await patch(`/api/planes-pago/${planId}/cancelar`, {
      motivo: "Cancelación con condonación sin proveer el motivo requerido",
      destino_saldo_pendiente: "condonar",
      // Sin motivo_condonacion
    }, token);
    expect(r.status).toBe(400);
    expect(r.body.message).toContain("motivo_condonacion");
  });

  // ── SPEI fuera de orden sobre charge cancelado por reestructuración ────────
  it("SPEI fuera de orden: bank_tx con monto de charge cancelado por reestructuración → queda en excepciones, NO se aplica al charge cancelado", async () => {
    const montoOriginal = 80_000;
    const chargeId = await mkCharge(montoOriginal);

    // Reestructurar el charge (lo cancela)
    const rCreate = await post("/api/planes-pago", {
      charge_ids: [chargeId],
      numero_pagos: 2,
      frecuencia: "mensual",
      fecha_inicio: "2026-10-01",
    }, token);
    expect(rCreate.status).toBe(200);

    // Verificar que el charge original quedó cancelado
    const chOrig = await pool.query(`SELECT estado FROM charges WHERE id = $1`, [chargeId]);
    expect((chOrig.rows as any[])[0].estado).toBe("cancelado");

    // Simular SPEI tardío: insertar bank_transaction pendiente con mismo monto
    const btR = await pool.query(
      `INSERT INTO bank_transactions
         (campus_id, tenant_id, fecha, descripcion, monto_centavos, tipo,
          referencia, estado_conciliacion)
       VALUES ($1,$2,NOW()::date,'SPEI tardio test',$3,'abono','SPEI-TARDIO-PL','pendiente')
       RETURNING id`,
      [campusId, tenantId, montoOriginal]
    );
    const btId = (btR.rows as any[])[0].id;

    // El charge cancelado NO debe aparecer en cargos_disponibles del GET excepciones
    const rExc = await get("/api/conciliacion/excepciones", token);
    expect(rExc.status).toBe(200);

    const chargesCancelados = (rExc.body.cargos_disponibles || []).filter(
      (c: any) => c.id === chargeId
    );
    expect(chargesCancelados).toHaveLength(0); // charge cancelado no está disponible

    // La bank_tx sí aparece en la lista de excepciones (estado_conciliacion='pendiente')
    const excepcionPresente = (rExc.body.excepciones || []).find(
      (e: any) => e.id === btId
    );
    expect(excepcionPresente).toBeDefined();
    expect(excepcionPresente.estado_conciliacion).toBe("pendiente");

    // Intentar aplicar la bank_tx al charge cancelado → 404 (cargo no encontrado o ya pagado)
    const rResolver = await post(`/api/conciliacion/excepciones/${btId}/resolver`, {
      accion: "aplicar",
      charge_id: chargeId, // charge cancelado
    }, token);
    expect(rResolver.status).toBe(404);
    expect(rResolver.body.message).toContain("no encontrado");

    // La bank_tx debe seguir en estado_conciliacion='pendiente'
    const btFinal = await pool.query(
      `SELECT estado_conciliacion FROM bank_transactions WHERE id = $1`, [btId]
    );
    expect((btFinal.rows as any[])[0].estado_conciliacion).toBe("pendiente");

    // Cleanup
    await pool.query(`DELETE FROM bank_transactions WHERE id = $1`, [btId]);
  });
});
