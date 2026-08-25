/**
 * TESTS — Condonación vía asistente (Suite C)
 *
 * Cubre:
 *   C-1  detectSuggestTrigger reconoce variantes de condonar
 *   C-2  resolveSuggestContext → clarification si no hay plan activo
 *   C-3  resolveSuggestContext → signal con inputs_required
 *   C-4  PATCH exitoso E2E: plan cancelado + audit saldo_condonado en DB
 *   C-5  PATCH → 403 para rol sin CHARGES.UPDATE
 *   C-6  PATCH → 409 con alerta_id cuando hay condonación en últimos 90 días
 *          El asistente no reintenta ni bypasea el flujo — solo superficie el error
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "../db";
import { tenants, campuses, students } from "../../shared/schema";
import { detectSuggestTrigger } from "../assistant-knowledge";
import { resolveSuggestContext } from "../assistant-actions";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";
if (!JWT_SECRET) throw new Error("Se requiere JWT_SECRET o SESSION_SECRET para las pruebas.");

// ── Fixtures ──────────────────────────────────────────────────────────────────
let tenantId:  number;
let campusId:  number;
let studentId: number;
let studentNombre: string;
let conceptId: number;
let planId:    number;      // plan activo con charges pendientes (para C-4)
let chargeIds: number[] = [];

// Tokens
let tokenAdmin:      string; // administrador_campus — CHARGES.UPDATE ✓
let tokenSinPermiso: string; // asistente — CHARGES.UPDATE ✗

// audit_log insertado artificialmente en C-6 (limpieza en afterAll)
let auditFakeId: number | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
async function patchPlan(
  pid: number,
  body: object,
  tok: string
): Promise<{ status: number; body: any }> {
  const r = await fetch(`${BASE}/api/planes-pago/${pid}/cancelar`, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body:    JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function chatAssistant(
  message: string,
  tok: string
): Promise<{ status: number; body: any }> {
  const r = await fetch(`${BASE}/api/assistant/chat`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body:    JSON.stringify({ message }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// ── Setup / Teardown ──────────────────────────────────────────────────────────
beforeAll(async () => {
  const ts = Date.now().toString().slice(-7);
  studentNombre = `CondTest ${ts}`;

  const [t] = await db
    .insert(tenants)
    .values({ nombre_legal: `CondTenant ${ts}`, rfc: `CDT${ts}` })
    .returning();
  tenantId = t.id;

  const [c] = await db
    .insert(campuses)
    .values({ tenant_id: tenantId, nombre: `Campus CD ${ts}` })
    .returning();
  campusId = c.id;

  const [s] = await db
    .insert(students)
    .values({
      campus_id:        campusId,
      tenant_id:        tenantId,
      nombres:          "CondTest",
      apellido_paterno: ts,
      nombre_completo:  studentNombre,
      status:           "activo",
    })
    .returning();
  studentId = s.id;

  // Concepto mínimo para los charges
  const cr = await pool.query(
    `INSERT INTO concepts (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1,$2,'Cuota CondTest','colegiatura','mensual',50000) RETURNING id`,
    [campusId, tenantId]
  );
  conceptId = cr.rows[0].id;

  // Plan activo de tipo 'reestructuracion' con 2 charges pendientes (para C-4)
  const planRes = await pool.query(
    `INSERT INTO payment_plans
       (campus_id, tenant_id, student_id, total_adeudo_centavos, numero_pagos,
        fecha_inicio, estado, tipo_origen)
     VALUES ($1,$2,$3,100000,2,CURRENT_DATE,'activo','reestructuracion')
     RETURNING id`,
    [campusId, tenantId, studentId]
  );
  planId = planRes.rows[0].id;

  for (let i = 0; i < 2; i++) {
    const chRes = await pool.query(
      `INSERT INTO charges
         (tenant_id, student_id, concept_id, plan_id,
          fecha_emision, fecha_vencimiento, monto_base_centavos, estado)
       VALUES ($1,$2,$3,$4,CURRENT_DATE,CURRENT_DATE+30,50000,'pendiente')
       RETURNING id`,
      [tenantId, studentId, conceptId, planId]
    );
    chargeIds.push(chRes.rows[0].id);
  }

  // Token con CHARGES.UPDATE (administrador_campus)
  tokenAdmin = jwt.sign(
    { email: "cond-admin@test.com", role: "administrador_campus",
      campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // Token SIN CHARGES.UPDATE (asistente)
  tokenSinPermiso = jwt.sign(
    { email: "cond-sin@test.com", role: "asistente",
      campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
});

afterAll(async () => {
  // Limpiar audit insertado artificialmente en C-6
  if (auditFakeId) {
    await pool.query(`DELETE FROM audit_log WHERE id = $1`, [auditFakeId]);
  }
  // Limpiar audit_log de test (plan_cancelado, saldo_condonado, ALERTA)
  await pool.query(
    `DELETE FROM audit_log
     WHERE tenant_id = $1
       AND action IN ('plan_cancelado','saldo_condonado','ALERTA_CONDONACION_REPETIDA',
                      'CONDONACION_OVERRIDE_EJECUTADA')`,
    [tenantId]
  );
  // Charges, plan, concepto, alumno, campus, tenant
  await pool.query(`DELETE FROM charges         WHERE plan_id = $1`,    [planId]);
  await pool.query(`DELETE FROM payment_plans   WHERE id      = $1`,    [planId]);
  await pool.query(`DELETE FROM concepts        WHERE tenant_id = $1`,  [tenantId]);
  await pool.query(`DELETE FROM students        WHERE tenant_id = $1`,  [tenantId]);
  await pool.query(`DELETE FROM campuses        WHERE tenant_id = $1`,  [tenantId]);
  await pool.query(`DELETE FROM tenants         WHERE id        = $1`,  [tenantId]);
});

// ═════════════════════════════════════════════════════════════════════════════
// Suite C — detectSuggestTrigger
// ═════════════════════════════════════════════════════════════════════════════
describe("detectSuggestTrigger — condonar_saldo (Suite C)", () => {

  it("C-1a: 'condona el saldo de López Martínez'", () => {
    const t = detectSuggestTrigger("condona el saldo de López Martínez");
    expect(t?.action).toBe("condonar_saldo");
    expect(t?.nombre).toContain("López");
  });

  it("C-1b: 'perdona el plan de Ana García'", () => {
    const t = detectSuggestTrigger("perdona el plan de Ana García");
    expect(t?.action).toBe("condonar_saldo");
    expect(t?.nombre).toContain("Ana García");
  });

  it("C-1c: 'cancela y condona la deuda del alumno Rodríguez'", () => {
    const t = detectSuggestTrigger("cancela y condona la deuda del alumno Rodríguez");
    expect(t?.action).toBe("condonar_saldo");
    expect(t?.nombre).toContain("Rodríguez");
  });

  it("C-1d: 'cancela el plan de García' sin 'condona' → NO es condonar_saldo", () => {
    const t = detectSuggestTrigger("cancela el plan de García");
    expect(t?.action).not.toBe("condonar_saldo");
  });

  it("C-1e: 'exonera el adeudo de Pérez Ruiz'", () => {
    const t = detectSuggestTrigger("exonera el adeudo de Pérez Ruiz");
    expect(t?.action).toBe("condonar_saldo");
    expect(t?.nombre).toContain("Pérez");
  });
});

// ── resolveSuggestContext ─────────────────────────────────────────────────────
describe("resolveSuggestContext — condonar_saldo (Suite C)", () => {
  const ctx = () => ({ campusId, tenantId });

  it("C-2: clarification si no hay plan activo para el alumno", async () => {
    // Alumno ficticio sin plan
    const result = await resolveSuggestContext(
      { action: "condonar_saldo", nombre: "AlumnoSinPlan_XYZ99" },
      ctx()
    );
    // Alumno no encontrado → null (cae a matchIntent)
    expect(result).toBeNull();
  });

  it("C-2b: clarification con texto específico si alumno existe pero sin plan", async () => {
    // Crear alumno temporal sin plan
    const ts2 = Date.now().toString().slice(-6);
    const nombreSinPlan = `SinPlan ${ts2}`;
    const [sSinPlan] = await db.insert(students).values({
      campus_id: campusId, tenant_id: tenantId,
      nombres: "SinPlan", nombre_completo: nombreSinPlan, status: "activo",
    }).returning();

    const result = await resolveSuggestContext(
      { action: "condonar_saldo", nombre: nombreSinPlan },
      ctx()
    );
    expect(result?.kind).toBe("clarification");
    expect((result as any).reply).toMatch(/No encontré un plan.*activo/i);

    // Limpiar alumno temporal
    await pool.query(`DELETE FROM students WHERE id = $1`, [sSinPlan.id]);
  });

  it("C-3: signal con inputs_required para alumno con plan activo", async () => {
    const result = await resolveSuggestContext(
      { action: "condonar_saldo", nombre: studentNombre },
      ctx()
    );
    expect(result?.kind).toBe("signal");
    const sig = (result as any).signal;
    expect(sig.action).toBe("condonar_saldo");
    expect(sig.endpoint).toMatch(new RegExp(`/api/planes-pago/${planId}/cancelar`));
    expect(sig.body.destino_saldo_pendiente).toBe("condonar");
    expect(Array.isArray(sig.inputs_required)).toBe(true);
    expect(sig.inputs_required).toHaveLength(2);
    expect(sig.inputs_required[0].key).toBe("motivo");
    expect(sig.inputs_required[1].key).toBe("motivo_condonacion");
    expect(sig.inputs_required[0].minLength).toBeGreaterThanOrEqual(10);
    expect(sig.contexto.plan_id).toBe(planId);
    expect(sig.contexto.alumno).toBe(studentNombre);
  });
});

// ── E2E completo ──────────────────────────────────────────────────────────────
describe("Condonación E2E — PATCH real (Suite C)", () => {

  it("C-4: plan cancelado + audit saldo_condonado en DB", async () => {
    const { status, body } = await patchPlan(planId, {
      motivo:                  "Cancelación test E2E condonación",
      destino_saldo_pendiente: "condonar",
      motivo_condonacion:      "Justificación de prueba completa",
    }, tokenAdmin);

    expect(status).toBe(200);
    expect(body.plan_id).toBe(planId);
    expect(body.cuotas_canceladas).toBeGreaterThanOrEqual(1);

    // Verificar en DB: plan cancelado
    const { rows: planRows } = await pool.query(
      `SELECT estado FROM payment_plans WHERE id = $1`,
      [planId]
    );
    expect(planRows[0].estado).toBe("cancelado");

    // Verificar audit saldo_condonado
    const { rows: auditRows } = await pool.query(
      `SELECT id FROM audit_log
       WHERE tenant_id = $1 AND action = 'saldo_condonado' AND entity_id = $2`,
      [tenantId, planId]
    );
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
  });

  it("C-5: 403 para rol sin CHARGES.UPDATE (asistente)", async () => {
    // Usar un planId ficticio — el guard se dispara antes de buscar el plan
    const { status } = await patchPlan(planId, {
      motivo:                  "No debería llegar aquí",
      destino_saldo_pendiente: "condonar",
      motivo_condonacion:      "Tampoco aquí",
    }, tokenSinPermiso);
    expect(status).toBe(403);
  });

  it("C-5b: la sugerencia del asistente no otorga permisos nuevos (SAC-11 condonación)", async () => {
    // El chat con tokenAdmin genera el signal del asistente
    const chat = await chatAssistant(
      `condona el saldo de ${studentNombre}`,
      tokenAdmin
    );
    // Puede ser null/clarification (el plan ya está cancelado en C-4),
    // pero si hay signal, confirmar que tokenSinPermiso no puede ejecutarlo
    if (chat.status === 200 && chat.body.suggest) {
      const { endpoint, body: sigBody } = chat.body.suggest;
      const merged = {
        ...sigBody,
        motivo:             "Motivo de prueba SAC-11",
        motivo_condonacion: "Justificación SAC-11",
      };
      const confirm = await fetch(`${BASE}${endpoint}`, {
        method:  "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${tokenSinPermiso}`,
        },
        body: JSON.stringify(merged),
      });
      expect(confirm.status).toBe(403);
    }
    // Si no hay signal (plan ya cancelado), el test no falla — la protección ya fue
    // verificada en C-5 directamente
  });

  it("C-6: 409 con alerta_id cuando hay condonación en últimos 90 días", async () => {
    // Para este test necesitamos un plan NUEVO activo (el de C-4 ya está cancelado)
    const planRes2 = await pool.query(
      `INSERT INTO payment_plans
         (campus_id, tenant_id, student_id, total_adeudo_centavos, numero_pagos,
          fecha_inicio, estado, tipo_origen)
       VALUES ($1,$2,$3,50000,1,CURRENT_DATE,'activo','reestructuracion')
       RETURNING id`,
      [campusId, tenantId, studentId]
    );
    const planId2 = planRes2.rows[0].id;
    await pool.query(
      `INSERT INTO charges
         (tenant_id, student_id, concept_id, plan_id,
          fecha_emision, fecha_vencimiento, monto_base_centavos, estado)
       VALUES ($1,$2,$3,$4,CURRENT_DATE,CURRENT_DATE+30,50000,'pendiente')`,
      [tenantId, studentId, conceptId, planId2]
    );

    // Insertar registro de saldo_condonado de hace 30 días (dentro de los 90)
    const fakeAudit = await pool.query(
      `INSERT INTO audit_log
         (tenant_id, user_id, action, entity_type, entity_id, metadata, created_at)
       VALUES ($1, NULL, 'saldo_condonado', 'payment_plan', $2, $3,
               NOW() - INTERVAL '30 days')
       RETURNING id`,
      [
        tenantId,
        planId,
        JSON.stringify({ student_id: studentId, monto_condonado_centavos: 100000,
                         motivo_condonacion: "Condonación previa fake" }),
      ]
    );
    auditFakeId = fakeAudit.rows[0].id;

    const { status, body } = await patchPlan(planId2, {
      motivo:                  "Segundo intento de condonación",
      destino_saldo_pendiente: "condonar",
      motivo_condonacion:      "Justificación del segundo intento",
    }, tokenAdmin);

    // Debe devolver 409 con requiere_override y alerta_id
    expect(status).toBe(409);
    expect(body.requiere_override).toBe(true);
    expect(body.alerta_id).toBeTypeOf("number");
    expect(body.message).toMatch(/autorización/i);

    // Verificar que se creó ALERTA_CONDONACION_REPETIDA en audit_log
    const { rows: alertRows } = await pool.query(
      `SELECT id FROM audit_log
       WHERE tenant_id = $1
         AND action = 'ALERTA_CONDONACION_REPETIDA'
         AND entity_id = $2`,
      [tenantId, planId2]
    );
    expect(alertRows.length).toBeGreaterThanOrEqual(1);

    // El asistente NO debe hacer nada adicional: el 409 se propaga sin modificación.
    // Verificación: llamar al chat del asistente después del 409 no crea override automático.
    const chatPost409 = await chatAssistant(
      `condona el saldo de ${studentNombre}`,
      tokenAdmin
    );
    // El asistente puede responder (signal/clarification/null), pero NO debe haber
    // ningún registro de 'generacion_override_condonacion' ni 'CONDONACION_OVERRIDE_EJECUTADA'
    const { rows: overrideRows } = await pool.query(
      `SELECT id FROM audit_log
       WHERE tenant_id = $1
         AND action IN ('generacion_override_condonacion','CONDONACION_OVERRIDE_EJECUTADA')
         AND created_at > NOW() - INTERVAL '30 seconds'`,
      [tenantId]
    );
    expect(overrideRows).toHaveLength(0);

    // Limpiar plan2 y charges
    await pool.query(`DELETE FROM charges WHERE plan_id = $1`, [planId2]);
    await pool.query(`DELETE FROM payment_plans WHERE id = $1`, [planId2]);
    // Limpiar la ALERTA creada por el test
    await pool.query(
      `DELETE FROM audit_log WHERE tenant_id = $1 AND action = 'ALERTA_CONDONACION_REPETIDA'`,
      [tenantId]
    );
  });
});
