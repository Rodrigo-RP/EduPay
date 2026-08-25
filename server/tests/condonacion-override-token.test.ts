/**
 * Prueba de regresión: Override token de condonación repetida.
 *
 * Cuando un plan con destino='condonar' recibe un 409 por condonación repetida,
 * solo un override_token emitido por administrador_general permite ejecutarla.
 * El token incluye tenant_id y campus_id para que no pueda usarse en otro plantel.
 * El endpoint de generación exige un campo motivo (≥10 chars) que queda en audit_log.
 * El token contiene alerta_id para que el historial sea legible como cadena completa.
 *
 * Diseño:
 *   override-token endpoint: POST /api/admin/alertas/condonaciones/:planId/override-token
 *   override-token validation: en PATCH /api/planes-pago/:id/cancelar (destino=condonar)
 *
 * Tests (secuenciales — el estado del DB entre ellos importa):
 *   COT-01  Condonación sin token cuando ya hay historial previo → 409, alerta_id en body
 *   COT-02  Misma condonación con override_token válido de admin_general → 200
 *   COT-03  administrador_campus intenta generar override_token → 403
 *   COT-04  Token expirado → 409 "token ha expirado"
 *   COT-05  Token con tenant_id/campus_id de otro plantel → 403
 *   COT-06  Generar token sin motivo, o motivo < 10 chars → 400
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";
if (!JWT_SECRET) throw new Error("Se requiere JWT_SECRET o SESSION_SECRET para las pruebas.");

// ── Fixtures ───────────────────────────────────────────────────────────────
let tenantId:  number;
let campusId:  number;
let studentId: number;

// planSetup: se condona en beforeAll para crear el historial de saldo_condonado
let planSetup: number;
// planCot: usado en COT-01 (409) y COT-02 (200 con token válido)
let planCot:   number;
// planCot2: en estado 'activo', para COT-04 y COT-05 (token inválido — no se cancela)
let planCot2:  number;
// planCotConc: en estado 'activo', para COT-08 (test de concurrencia real)
let planCotConc: number;

// alerta_id capturada en COT-01 y usada en COT-02
let alertaIdCot01: number;
// token válido usado en COT-02, reutilizado en COT-07 para confirmar que el plan
// ya cancelado es lo que bloquea el segundo intento (no un mecanismo de single-use en el token)
let cotValidToken: string;

let tokenAdminCampus:  string;
let tokenAdminGeneral: string;

// ── Helpers ────────────────────────────────────────────────────────────────
async function apiFetch(method: string, path: string, token: string, body?: object) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function mkPlan(sid: number): Promise<number> {
  const r = await pool.query(
    `INSERT INTO payment_plans
       (campus_id, tenant_id, student_id, total_adeudo_centavos,
        monto_inicial_centavos, numero_pagos, frecuencia, fecha_inicio,
        tipo_origen, charge_ids_origen)
     VALUES ($1,$2,$3,0,0,1,'mensual',CURRENT_DATE,'reestructuracion','[]') RETURNING id`,
    [campusId, tenantId, sid],
  );
  return (r.rows as any[])[0].id as number;
}

const bodyCondonar = {
  motivo: "Condonacion override token prueba de integracion completa",
  destino_saldo_pendiente: "condonar",
  motivo_condonacion: "Familia acreditada sin capacidad de pago para test de override",
};

// ── Setup ─────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const ts = Date.now().toString().slice(-6);

  tenantId = (await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`COT_Test ${ts}`, `COT${ts}`],
  )).rows[0].id;

  campusId = (await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus COT ${ts}`, tenantId],
  )).rows[0].id;

  studentId = (await pool.query(
    `INSERT INTO students (tenant_id, campus_id, nombres, apellido_paterno,
                           nombre_completo, status)
     VALUES ($1,$2,'Override','Test','Override Test ${ts}','activo') RETURNING id`,
    [tenantId, campusId],
  )).rows[0].id;

  planSetup   = await mkPlan(studentId);
  planCot     = await mkPlan(studentId);
  planCot2    = await mkPlan(studentId);
  planCotConc = await mkPlan(studentId);

  const base = { campus_id: campusId, tenant_id: tenantId };
  tokenAdminCampus  = jwt.sign({ ...base, role: "administrador_campus"  }, JWT_SECRET, { expiresIn: "1h" });
  tokenAdminGeneral = jwt.sign({ ...base, role: "administrador_general" }, JWT_SECRET, { expiresIn: "1h" });

  // Ejecutar la primera condonación para crear el historial de saldo_condonado.
  // Esta condonación NO tiene historial previo, así que pasa directo a 200.
  const setupRes = await fetch(`${BASE}/api/planes-pago/${planSetup}/cancelar`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenAdminCampus}`, "Content-Type": "application/json" },
    body: JSON.stringify(bodyCondonar),
  });
  if (setupRes.status !== 200) {
    throw new Error(`Setup planSetup falló con ${setupRes.status}`);
  }

  // Esperar a que saldo_condonado quede escrito en la DB (fire-and-forget)
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const r = await pool.query(
      `SELECT id FROM audit_log
       WHERE tenant_id = $1 AND action = 'saldo_condonado'
         AND (metadata::jsonb ->> 'student_id')::int = $2`,
      [tenantId, studentId],
    );
    if ((r.rows as any[]).length > 0) break;
    await new Promise(r => setTimeout(r, 100));
  }
});

// ── Teardown ──────────────────────────────────────────────────────────────
afterAll(async () => {
  await pool.query(`DELETE FROM audit_log WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM payment_plans WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM students WHERE id = $1`, [studentId]);
  await pool.query(`DELETE FROM campuses WHERE id = $1`, [campusId]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Override token de condonación repetida", () => {

  // ── COT-01 ────────────────────────────────────────────────────────────────
  it("COT-01: segunda condonación sin token → 409 con requiere_override:true y alerta_id", async () => {
    // planCot es el segundo intento: ya existe saldo_condonado de planSetup.
    const { status, body } = await apiFetch(
      "PATCH", `/api/planes-pago/${planCot}/cancelar`,
      tokenAdminCampus, bodyCondonar,
    );
    expect(status).toBe(409);
    expect(body.requiere_override).toBe(true);
    expect(typeof body.alerta_id).toBe("number");
    expect(body.alerta_id).toBeGreaterThan(0);

    // Verificar que ALERTA_CONDONACION_REPETIDA fue escrita en la DB (síncronamente)
    const alertaRows = await pool.query(
      `SELECT id, metadata FROM audit_log
       WHERE tenant_id = $1 AND action = 'ALERTA_CONDONACION_REPETIDA'
         AND id = $2`,
      [tenantId, body.alerta_id],
    );
    expect((alertaRows.rows as any[]).length).toBe(1);
    const meta = (() => {
      const raw = (alertaRows.rows as any[])[0].metadata;
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    })();
    expect(meta.student_id).toBe(studentId);
    expect(meta.prioridad).toBe('alta');

    // Guardar alerta_id para COT-02
    alertaIdCot01 = body.alerta_id;

    // planCot debe seguir en estado 'activo' (el 409 no ejecutó la cancelación)
    const planRow = await pool.query(
      `SELECT estado FROM payment_plans WHERE id = $1`, [planCot]
    );
    expect((planRow.rows as any[])[0].estado).toBe('activo');
  });

  // ── COT-02 ────────────────────────────────────────────────────────────────
  it("COT-02: misma condonación con override_token válido de admin_general → 200", async () => {
    // Generar el token de autorización con motivo y alerta_id de COT-01
    const tokenRes = await apiFetch(
      "POST", `/api/admin/alertas/condonaciones/${planCot}/override-token`,
      tokenAdminGeneral,
      {
        motivo: "Caso excepcional aprobado por dirección académica para prueba",
        alerta_id: alertaIdCot01,
      },
    );
    expect(tokenRes.status).toBe(200);
    expect(typeof tokenRes.body.token).toBe("string");
    expect(tokenRes.body.plan_id).toBe(planCot);
    expect(tokenRes.body.alerta_id).toBe(alertaIdCot01);

    // Verificar que generacion_override_condonacion quedó en audit_log.
    // Se escribe fire-and-forget en el endpoint de generación → sondeo hasta 2.5 s.
    const deadlineGen = Date.now() + 2500;
    let genMeta: any = null;
    while (Date.now() < deadlineGen) {
      const genRows = await pool.query(
        `SELECT metadata FROM audit_log
         WHERE tenant_id = $1 AND action = 'generacion_override_condonacion'
           AND entity_id = $2`,
        [tenantId, planCot],
      );
      if ((genRows.rows as any[]).length > 0) {
        const raw = (genRows.rows as any[])[0].metadata;
        genMeta = typeof raw === 'string' ? JSON.parse(raw) : raw;
        break;
      }
      await new Promise(r => setTimeout(r, 100));
    }
    expect(genMeta).not.toBeNull();
    expect(genMeta.alerta_id).toBe(alertaIdCot01);
    expect(genMeta.motivo).toMatch(/excepcional|direcci[oó]n|acad[eé]mica/i);

    // Guardar el token para reutilizarlo en COT-07
    cotValidToken = tokenRes.body.token;

    // Ejecutar la condonación con el override_token → debe ser 200
    const cancelRes = await apiFetch(
      "PATCH", `/api/planes-pago/${planCot}/cancelar`,
      tokenAdminCampus,
      { ...bodyCondonar, override_token: cotValidToken },
    );
    expect(cancelRes.status).toBe(200);

    // planCot debe estar ahora en 'cancelado'
    const planRow = await pool.query(
      `SELECT estado FROM payment_plans WHERE id = $1`, [planCot]
    );
    expect((planRow.rows as any[])[0].estado).toBe('cancelado');

    // Esperar a que CONDONACION_OVERRIDE_EJECUTADA quede escrito (fire-and-forget)
    const deadline = Date.now() + 2500;
    let overrideEjecutado = false;
    while (Date.now() < deadline) {
      const r = await pool.query(
        `SELECT metadata FROM audit_log
         WHERE tenant_id = $1 AND action = 'CONDONACION_OVERRIDE_EJECUTADA'
           AND entity_id = $2`,
        [tenantId, planCot],
      );
      if ((r.rows as any[]).length > 0) {
        const m = (() => {
          const raw = (r.rows as any[])[0].metadata;
          return typeof raw === 'string' ? JSON.parse(raw) : raw;
        })();
        if (m.alerta_id === alertaIdCot01) { overrideEjecutado = true; break; }
      }
      await new Promise(r => setTimeout(r, 100));
    }
    expect(overrideEjecutado).toBe(true);
  });

  // ── COT-03 ────────────────────────────────────────────────────────────────
  it("COT-03: administrador_campus intenta generar override_token → 403", async () => {
    const { status, body } = await apiFetch(
      "POST", `/api/admin/alertas/condonaciones/${planCot}/override-token`,
      tokenAdminCampus,
      { motivo: "Intento no autorizado de generar override", alerta_id: alertaIdCot01 },
    );
    expect(status).toBe(403);
    expect(body.message).toMatch(/sin permisos/i);
  });

  // ── COT-04 ────────────────────────────────────────────────────────────────
  it("COT-04: token expirado → 409 con mensaje de expiración", async () => {
    // Generar un token con expiración de 1 segundo y esperar 1.1 s
    const expiredToken = jwt.sign(
      {
        action:     'override_condonacion',
        plan_id:    planCot2,
        student_id: studentId,
        tenant_id:  tenantId,
        campus_id:  campusId,
        alerta_id:  alertaIdCot01,
      },
      JWT_SECRET,
      { expiresIn: 1 },   // 1 segundo
    );
    await new Promise(r => setTimeout(r, 1100));

    const { status, body } = await apiFetch(
      "PATCH", `/api/planes-pago/${planCot2}/cancelar`,
      tokenAdminCampus,
      { ...bodyCondonar, override_token: expiredToken },
    );
    expect(status).toBe(409);
    expect(body.message).toMatch(/expir/i);

    // planCot2 sigue activo
    const planRow = await pool.query(
      `SELECT estado FROM payment_plans WHERE id = $1`, [planCot2]
    );
    expect((planRow.rows as any[])[0].estado).toBe('activo');
  });

  // ── COT-05 ────────────────────────────────────────────────────────────────
  it("COT-05: token con campus_id de otro plantel → 403, no ejecuta la condonación", async () => {
    // Token sintético con el mismo tenant_id pero un campus_id diferente
    const wrongCampusToken = jwt.sign(
      {
        action:     'override_condonacion',
        plan_id:    planCot2,
        student_id: studentId,
        tenant_id:  tenantId,
        campus_id:  campusId + 9999,   // campus inexistente / equivocado
        alerta_id:  alertaIdCot01,
      },
      JWT_SECRET,
      { expiresIn: '30m' },
    );

    const { status, body } = await apiFetch(
      "PATCH", `/api/planes-pago/${planCot2}/cancelar`,
      tokenAdminCampus,
      { ...bodyCondonar, override_token: wrongCampusToken },
    );
    expect(status).toBe(403);
    expect(body.message).toMatch(/plantel|plan|v[aá]lido/i);

    // planCot2 sigue activo — el token inválido no ejecutó la condonación
    const planRow = await pool.query(
      `SELECT estado FROM payment_plans WHERE id = $1`, [planCot2]
    );
    expect((planRow.rows as any[])[0].estado).toBe('activo');
  });

  // ── COT-07 ────────────────────────────────────────────────────────────────
  it("COT-07: doble envío del mismo token → 409 por plan ya cancelado (el token no tiene single-use)", async () => {
    // El token de COT-02 sigue siendo criptográficamente válido (dentro de los 30 min).
    // El diseño es stateless: el token no se invalida tras el primer uso.
    // Lo que impide el segundo intento es que planCot ya está en estado 'cancelado',
    // y el handler rechaza cualquier intento de cancelar un plan no-activo con 409
    // ANTES de llegar siquiera al pre-check o a la validación del token.
    const { status, body } = await apiFetch(
      "PATCH", `/api/planes-pago/${planCot}/cancelar`,
      tokenAdminCampus,
      { ...bodyCondonar, override_token: cotValidToken },
    );
    expect(status).toBe(409);
    expect(body.message).toMatch(/ya está cancelado/i);
    // Confirmar que sigue cancelado (no se reactivó por error)
    const planRow = await pool.query(
      `SELECT estado FROM payment_plans WHERE id = $1`, [planCot]
    );
    expect((planRow.rows as any[])[0].estado).toBe('cancelado');
  });

  // ── COT-06 ────────────────────────────────────────────────────────────────
  it("COT-06: generar token sin motivo, o con motivo < 10 chars → 400", async () => {
    // Sin motivo
    const r1 = await apiFetch(
      "POST", `/api/admin/alertas/condonaciones/${planCot}/override-token`,
      tokenAdminGeneral,
      { alerta_id: alertaIdCot01 },
    );
    expect(r1.status).toBe(400);
    expect(r1.body.message).toMatch(/motivo/i);

    // Motivo demasiado corto (< 10 chars)
    const r2 = await apiFetch(
      "POST", `/api/admin/alertas/condonaciones/${planCot}/override-token`,
      tokenAdminGeneral,
      { motivo: "Corto", alerta_id: alertaIdCot01 },
    );
    expect(r2.status).toBe(400);
    expect(r2.body.message).toMatch(/motivo/i);

    // Motivo exactamente de 9 chars (un char menos del mínimo)
    const r3 = await apiFetch(
      "POST", `/api/admin/alertas/condonaciones/${planCot}/override-token`,
      tokenAdminGeneral,
      { motivo: "123456789", alerta_id: alertaIdCot01 },
    );
    expect(r3.status).toBe(400);
    expect(r3.body.message).toMatch(/motivo/i);
  });

  // ── COT-08 ────────────────────────────────────────────────────────────────
  it("COT-08: doble request simultáneo con el mismo token → exactamente 1 éxito y 1 rechazo", async () => {
    // El handler usa UPDATE ... WHERE estado='activo' RETURNING id dentro del BEGIN,
    // NO SELECT FOR UPDATE. El UPDATE adquiere el lock de fila implícitamente:
    // el segundo UPDATE espera a que el primero haga COMMIT, luego ve estado='cancelado'
    // y devuelve 0 filas → el handler retorna 409. El resultado esperado es 1×200 + 1×409.
    //
    // Este test confirma empíricamente que no es posible que ambas requests completen
    // con 200 (doble condonación del mismo plan) incluso si el token es stateless.

    // Paso 1: obtener alerta_id (planCotConc no ha sido tocado aún → 409 porque hay
    // saldo_condonado de planSetup en el mismo tenant/alumno)
    const step1 = await apiFetch(
      "PATCH", `/api/planes-pago/${planCotConc}/cancelar`,
      tokenAdminCampus, bodyCondonar,
    );
    expect(step1.status).toBe(409);
    const alertaIdConc = step1.body.alerta_id as number;
    expect(typeof alertaIdConc).toBe("number");

    // Paso 2: admin_general genera el override_token para planCotConc
    const tokenRes = await apiFetch(
      "POST", `/api/admin/alertas/condonaciones/${planCotConc}/override-token`,
      tokenAdminGeneral,
      { motivo: "Prueba de concurrencia doble envio simultaneo de token", alerta_id: alertaIdConc },
    );
    expect(tokenRes.status).toBe(200);
    const concToken = tokenRes.body.token as string;

    // Paso 3: dos requests simultáneos con el mismo token (mismo plan, mismo token)
    const [r1, r2] = await Promise.all([
      apiFetch("PATCH", `/api/planes-pago/${planCotConc}/cancelar`,
        tokenAdminCampus, { ...bodyCondonar, override_token: concToken }),
      apiFetch("PATCH", `/api/planes-pago/${planCotConc}/cancelar`,
        tokenAdminCampus, { ...bodyCondonar, override_token: concToken }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    // Nunca pueden ser ambos 200 — el UPDATE dentro del BEGIN garantiza exclusividad
    expect(statuses.filter(s => s === 200).length).toBeLessThanOrEqual(1);
    // Al menos uno debe rechazarse
    expect(statuses.filter(s => s !== 200).length).toBeGreaterThanOrEqual(1);
    // El caso normal es exactamente [200, 409]
    expect(statuses).toEqual([200, 409]);

    // El plan debe estar cancelado exactamente una vez
    const planRow = await pool.query(
      `SELECT estado FROM payment_plans WHERE id = $1`, [planCotConc]
    );
    expect((planRow.rows as any[])[0].estado).toBe('cancelado');

    // Esperar y contar las entradas saldo_condonado — debe ser exactamente 1
    const deadline = Date.now() + 2500;
    let saldoCount = 0;
    while (Date.now() < deadline) {
      const r = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM audit_log
         WHERE tenant_id = $1 AND action = 'saldo_condonado' AND entity_id = $2`,
        [tenantId, planCotConc],
      );
      saldoCount = (r.rows as any[])[0].cnt;
      if (saldoCount >= 1) break;
      await new Promise(r => setTimeout(r, 100));
    }
    expect(saldoCount).toBe(1);
  });

});
