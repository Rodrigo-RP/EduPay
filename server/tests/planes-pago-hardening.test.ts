/**
 * Hardening de Planes de Pago.
 *
 * Protege invariantes de servidor que no dependen de la UI:
 * - pago manual serializable, con recargo y ledger completo;
 * - aislamiento de campus dentro de un mismo tenant;
 * - condonación fail-closed si el pre-check no puede evaluarse;
 * - alerta de override ligada al plan exacto;
 * - enganche no negativo.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { pool } from "../db";
import { JWT_SECRET } from "../routes/shared";

const BASE = "http://localhost:5000";

let tenantId: number;
let campusAId: number;
let campusBId: number;
let studentAId: number;
let studentBId: number;
let conceptAId: number;
let conceptBId: number;
let tokenCampusA: string;
let tokenGeneralA: string;

async function apiFetch(method: "POST" | "PATCH", path: string, token: string, body: object) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function createPlan(campusId: number, studentId: number): Promise<number> {
  const result = await pool.query(
    `INSERT INTO payment_plans
       (campus_id, tenant_id, student_id, total_adeudo_centavos,
        monto_inicial_centavos, numero_pagos, frecuencia, fecha_inicio,
        tipo_origen, charge_ids_origen)
     VALUES ($1,$2,$3,10000,0,1,'mensual',CURRENT_DATE,'reestructuracion','[]')
     RETURNING id`,
    [campusId, tenantId, studentId],
  );
  return Number((result.rows[0] as any).id);
}

describe("Planes de Pago — hardening de concurrencia y aislamiento", () => {
  beforeAll(async () => {
    const suffix = Date.now().toString().slice(-8);
    tenantId = Number((await pool.query(
      `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
      [`Hardening Planes ${suffix}`, `HP${suffix}`],
    )).rows[0].id);

    campusAId = Number((await pool.query(
      `INSERT INTO campuses (tenant_id, nombre) VALUES ($1,$2) RETURNING id`,
      [tenantId, `Campus A Hardening ${suffix}`],
    )).rows[0].id);
    campusBId = Number((await pool.query(
      `INSERT INTO campuses (tenant_id, nombre) VALUES ($1,$2) RETURNING id`,
      [tenantId, `Campus B Hardening ${suffix}`],
    )).rows[0].id);

    studentAId = Number((await pool.query(
      `INSERT INTO students (tenant_id, campus_id, nombres, apellido_paterno, nombre_completo, status)
       VALUES ($1,$2,'Alumno','Hardening','Alumno A ${suffix}','activo') RETURNING id`,
      [tenantId, campusAId],
    )).rows[0].id);
    studentBId = Number((await pool.query(
      `INSERT INTO students (tenant_id, campus_id, nombres, apellido_paterno, nombre_completo, status)
       VALUES ($1,$2,'Alumna','Hardening','Alumna B ${suffix}','activo') RETURNING id`,
      [tenantId, campusBId],
    )).rows[0].id);

    conceptAId = Number((await pool.query(
      `INSERT INTO concepts (tenant_id, campus_id, nombre, tipo, periodicidad, monto_centavos)
       VALUES ($1,$2,'Concepto A Hardening','colegiatura','mensual',10000) RETURNING id`,
      [tenantId, campusAId],
    )).rows[0].id);
    conceptBId = Number((await pool.query(
      `INSERT INTO concepts (tenant_id, campus_id, nombre, tipo, periodicidad, monto_centavos)
       VALUES ($1,$2,'Concepto B Hardening','colegiatura','mensual',10000) RETURNING id`,
      [tenantId, campusBId],
    )).rows[0].id);

    const baseClaims = {
      tenant_id: tenantId,
      campus_id: campusAId,
      type: "user",
    };
    tokenCampusA = jwt.sign({ ...baseClaims, role: "administrador_campus" }, JWT_SECRET, { expiresIn: "1h" });
    tokenGeneralA = jwt.sign({ ...baseClaims, role: "administrador_general" }, JWT_SECRET, { expiresIn: "1h" });
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM audit_log WHERE tenant_id = $1`, [tenantId]);
      await client.query(
        `DELETE FROM payment_applications
          WHERE charge_id IN (SELECT id FROM charges WHERE tenant_id = $1)`,
        [tenantId],
      );
      await client.query(`DELETE FROM payments WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM charges WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM payment_plans WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM concepts WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM students WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM campuses WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });

  it("H-01: dos pagos manuales simultáneos cobran una sola vez e incluyen el recargo", async () => {
    const chargeId = Number((await pool.query(
      `INSERT INTO charges
         (tenant_id, student_id, concept_id, fecha_emision, fecha_vencimiento,
          monto_base_centavos, recargo_aplicado_centavos, estado)
       VALUES ($1,$2,$3,CURRENT_DATE,CURRENT_DATE + 30,10000,2500,'pendiente')
       RETURNING id`,
      [tenantId, studentAId, conceptAId],
    )).rows[0].id);

    const [first, second] = await Promise.all([
      apiFetch("POST", `/api/admin/charges/${chargeId}/pagar-manual`, tokenCampusA, { metodo: "efectivo" }),
      apiFetch("POST", `/api/admin/charges/${chargeId}/pagar-manual`, tokenCampusA, { metodo: "efectivo" }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);

    const ledger = await pool.query(
      `SELECT c.estado, COUNT(DISTINCT p.id)::int AS payments,
              COUNT(pa.id)::int AS applications,
              COALESCE(SUM(pa.amount_centavos), 0)::int AS applied
         FROM charges c
         LEFT JOIN payments p ON p.charge_id = c.id
         LEFT JOIN payment_applications pa ON pa.charge_id = c.id
        WHERE c.id = $1
        GROUP BY c.id`,
      [chargeId],
    );
    expect((ledger.rows[0] as any).estado).toBe("pagado");
    expect(Number((ledger.rows[0] as any).payments)).toBe(1);
    expect(Number((ledger.rows[0] as any).applications)).toBe(1);
    expect(Number((ledger.rows[0] as any).applied)).toBe(12_500);
  });

  it("H-02: un administrador de Campus A no puede reestructurar ni pagar cargos de Campus B", async () => {
    const chargeId = Number((await pool.query(
      `INSERT INTO charges
         (tenant_id, student_id, concept_id, fecha_emision, fecha_vencimiento, monto_base_centavos, estado)
       VALUES ($1,$2,$3,CURRENT_DATE,CURRENT_DATE + 30,10000,'pendiente') RETURNING id`,
      [tenantId, studentBId, conceptBId],
    )).rows[0].id);

    const reestructurar = await apiFetch("POST", "/api/planes-pago", tokenCampusA, {
      charge_ids: [chargeId],
      numero_pagos: 2,
      frecuencia: "mensual",
      fecha_inicio: "2026-09-01",
    });
    expect(reestructurar.status).toBe(403);

    const pagar = await apiFetch("POST", `/api/admin/charges/${chargeId}/pagar-manual`, tokenCampusA, {
      metodo: "efectivo",
    });
    expect(pagar.status).toBe(403);
  });

  it("H-03: la creación Modo B rechaza alumno o concepto de otro campus y enganche negativo", async () => {
    const studentAjeno = await apiFetch("POST", "/api/planes-pago", tokenCampusA, {
      concept_id: conceptAId,
      student_id: studentBId,
      numero_pagos: 2,
      frecuencia: "mensual",
      fecha_inicio: "2026-09-01",
    });
    expect(studentAjeno.status).toBe(403);

    const conceptAjeno = await apiFetch("POST", "/api/planes-pago", tokenCampusA, {
      concept_id: conceptBId,
      student_id: studentAId,
      numero_pagos: 2,
      frecuencia: "mensual",
      fecha_inicio: "2026-09-01",
    });
    expect(conceptAjeno.status).toBe(403);

    const engancheNegativo = await apiFetch("POST", "/api/planes-pago", tokenCampusA, {
      concept_id: conceptAId,
      student_id: studentAId,
      monto_inicial_centavos: -1,
      numero_pagos: 2,
      frecuencia: "mensual",
      fecha_inicio: "2026-09-01",
    });
    expect(engancheNegativo.status).toBe(400);
  });

  it("H-04: un administrador de Campus A no puede cancelar ni reinstalar un plan de Campus B", async () => {
    const planBId = await createPlan(campusBId, studentBId);
    const response = await apiFetch("PATCH", `/api/planes-pago/${planBId}/cancelar`, tokenCampusA, {
      motivo: "Intento de cancelar un plan de otro campus",
      destino_saldo_pendiente: "reinstalar",
    });
    expect(response.status).toBe(403);
  });

  it("H-05: una falla técnica al revisar condonaciones bloquea la operación", async () => {
    const planId = await createPlan(campusAId, studentAId);
    await pool.query(
      `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
       VALUES ($1,NULL,'saldo_condonado','payment_plan',$2,$3)`,
      [tenantId, planId, JSON.stringify({ student_id: "no-es-entero" })],
    );

    const response = await apiFetch("PATCH", `/api/planes-pago/${planId}/cancelar`, tokenCampusA, {
      motivo: "Cancelación que debe bloquearse ante fallo de pre-check",
      destino_saldo_pendiente: "condonar",
      motivo_condonacion: "Justificación válida que no debe aplicarse por revisión manual",
    });
    expect(response.status).toBe(503);
    expect(response.body.requiere_revision_manual).toBe(true);

    const plan = await pool.query(`SELECT estado FROM payment_plans WHERE id = $1`, [planId]);
    expect((plan.rows[0] as any).estado).toBe("activo");
  });

  it("H-06: el override no acepta una alerta perteneciente a otro plan", async () => {
    const targetPlanId = await createPlan(campusAId, studentAId);
    const otherPlanId = await createPlan(campusAId, studentAId);
    const alertId = Number((await pool.query(
      `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
       VALUES ($1,NULL,'ALERTA_CONDONACION_REPETIDA','payment_plan',$2,'{}') RETURNING id`,
      [tenantId, otherPlanId],
    )).rows[0].id);

    const response = await apiFetch(
      "POST",
      `/api/admin/alertas/condonaciones/${targetPlanId}/override-token`,
      tokenGeneralA,
      { motivo: "Intento de vincular una alerta de otro plan", alerta_id: alertId },
    );
    expect(response.status).toBe(404);
  });

  it("H-07: reestructurar y pagar el mismo cargo simultáneamente nunca usan un saldo obsoleto", async () => {
    const chargeId = Number((await pool.query(
      `INSERT INTO charges
         (tenant_id, student_id, concept_id, fecha_emision, fecha_vencimiento, monto_base_centavos, estado)
       VALUES ($1,$2,$3,CURRENT_DATE,CURRENT_DATE + 30,20000,'pendiente') RETURNING id`,
      [tenantId, studentAId, conceptAId],
    )).rows[0].id);

    const [reestructurar, pagar] = await Promise.all([
      apiFetch("POST", "/api/planes-pago", tokenCampusA, {
        charge_ids: [chargeId], numero_pagos: 2, frecuencia: "mensual", fecha_inicio: "2026-09-01",
      }),
      apiFetch("POST", `/api/admin/charges/${chargeId}/pagar-manual`, tokenCampusA, { metodo: "efectivo" }),
    ]);
    expect([reestructurar.status, pagar.status]).not.toEqual([200, 200]);

    const charge = await pool.query(`SELECT estado FROM charges WHERE id = $1`, [chargeId]);
    if (reestructurar.status === 200) {
      expect((charge.rows[0] as any).estado).toBe("cancelado");
      expect(pagar.status).toBe(422);
    } else {
      expect(reestructurar.status).toBe(422);
      expect(pagar.status).toBe(200);
      expect((charge.rows[0] as any).estado).toBe("pagado");
    }
  });

  it("H-08: cancelar/reinstalar y pagar una cuota simultáneamente no reinstala deuda ya pagada", async () => {
    const planId = await createPlan(campusAId, studentAId);
    const cuotaId = Number((await pool.query(
      `INSERT INTO charges
         (tenant_id, student_id, concept_id, plan_id, fecha_emision, fecha_vencimiento, monto_base_centavos, estado)
       VALUES ($1,$2,$3,$4,CURRENT_DATE,CURRENT_DATE + 30,15000,'pendiente') RETURNING id`,
      [tenantId, studentAId, conceptAId, planId],
    )).rows[0].id);

    const [cancelar, pagar] = await Promise.all([
      apiFetch("PATCH", `/api/planes-pago/${planId}/cancelar`, tokenCampusA, {
        motivo: "Cancelación concurrente con un pago de cuota", destino_saldo_pendiente: "reinstalar",
      }),
      apiFetch("POST", `/api/admin/charges/${cuotaId}/pagar-manual`, tokenCampusA, { metodo: "efectivo" }),
    ]);
    expect(cancelar.status).toBe(200);
    expect([200, 422]).toContain(pagar.status);

    const cuota = await pool.query(`SELECT estado FROM charges WHERE id = $1`, [cuotaId]);
    const reinstalados = await pool.query(
      `SELECT id FROM charges
        WHERE tenant_id = $1 AND student_id = $2 AND plan_id IS NULL
          AND estado = 'pendiente' AND monto_base_centavos = 15000`,
      [tenantId, studentAId],
    );
    if (pagar.status === 200) {
      expect((cuota.rows[0] as any).estado).toBe("pagado");
      expect(reinstalados.rows).toHaveLength(0);
    } else {
      expect((cuota.rows[0] as any).estado).toBe("cancelado");
      expect(reinstalados.rows).toHaveLength(1);
    }
  });

  it("H-09: un plan con campus inconsistente también se rechaza", async () => {
    const inconsistentPlanId = await createPlan(campusBId, studentAId);
    const response = await apiFetch("PATCH", `/api/planes-pago/${inconsistentPlanId}/cancelar`, tokenCampusA, {
      motivo: "El plan tiene un campus distinto al de su alumno",
      destino_saldo_pendiente: "reinstalar",
    });
    expect(response.status).toBe(403);
  });
});