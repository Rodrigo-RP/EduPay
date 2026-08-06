/**
 * Prueba de regresión: Alerta de condonación repetida — Protocolo §8.
 *
 * Escenario: si el mismo alumno recibe una condonación de saldo más de una
 * vez en 90 días, el sistema debe escribir una entrada
 * 'ALERTA_CONDONACION_REPETIDA' en audit_log con prioridad 'alta', visible
 * para administrador_general mediante GET /api/admin/alertas/condonaciones.
 *
 * Tests:
 *   CAR-01  Primera condonación sin historial previo → NO se genera alerta
 *   CAR-02  Segunda condonación del mismo alumno en <90 días → SÍ se genera alerta
 *   CAR-03  GET /api/admin/alertas/condonaciones con administrador_general → 200 + lista con alerta de CAR-02
 *   CAR-04  GET /api/admin/alertas/condonaciones con administrador_campus → 403
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

let tenantId:  number;
let campusId:  number;
let studentId: number;

// Planes de pago (reestructuracion) para CAR-01 y CAR-02
let planCar01: number;
let planCar02: number;

let tokenAdminCampus:   string;
let tokenAdminGeneral:  string;

// ── Helpers ────────────────────────────────────────────────────────────────
async function apiFetch(method: string, path: string, token: string, body?: object) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

/** Sondeo con timeout para audit_log (fire-and-forget writes pueden tardar) */
async function waitForAuditAction(
  action: string,
  filterFn: (row: any) => boolean,
  timeoutMs = 2500,
  intervalMs = 100,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await pool.query(
      `SELECT metadata FROM audit_log
       WHERE tenant_id = $1 AND action = $2
       ORDER BY created_at DESC LIMIT 20`,
      [tenantId, action],
    );
    if ((r.rows as any[]).some(filterFn)) return true;
    await new Promise(res => setTimeout(res, intervalMs));
  }
  return false;
}

const bodyCondonar = {
  motivo: "Condonacion prueba protocolo seccion 8 alerta repeticion",
  destino_saldo_pendiente: "condonar",
  motivo_condonacion: "Familia sin capacidad de pago documentada para prueba",
};

// ── Setup ─────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const ts = Date.now().toString().slice(-6);

  tenantId = (await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`CAR_Guard_Test ${ts}`, `CAR${ts}`],
  )).rows[0].id;

  campusId = (await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus CAR ${ts}`, tenantId],
  )).rows[0].id;

  studentId = (await pool.query(
    `INSERT INTO students (tenant_id, campus_id, nombres, apellido_paterno,
                           nombre_completo, status)
     VALUES ($1,$2,'Alumno','CAR','Alumno CAR ${ts}','activo') RETURNING id`,
    [tenantId, campusId],
  )).rows[0].id;

  // Dos planes de reestructuración para el mismo alumno
  planCar01 = (await pool.query(
    `INSERT INTO payment_plans
       (campus_id, tenant_id, student_id, total_adeudo_centavos,
        monto_inicial_centavos, numero_pagos, frecuencia, fecha_inicio,
        tipo_origen, charge_ids_origen)
     VALUES ($1,$2,$3,0,0,1,'mensual',CURRENT_DATE,'reestructuracion','[]') RETURNING id`,
    [campusId, tenantId, studentId],
  )).rows[0].id;

  planCar02 = (await pool.query(
    `INSERT INTO payment_plans
       (campus_id, tenant_id, student_id, total_adeudo_centavos,
        monto_inicial_centavos, numero_pagos, frecuencia, fecha_inicio,
        tipo_origen, charge_ids_origen)
     VALUES ($1,$2,$3,0,0,1,'mensual',CURRENT_DATE,'reestructuracion','[]') RETURNING id`,
    [campusId, tenantId, studentId],
  )).rows[0].id;

  // JWTs — sin 'id' para evitar rollback silencioso del audit_log FK
  const base = { campus_id: campusId, tenant_id: tenantId };
  tokenAdminCampus  = jwt.sign({ ...base, role: "administrador_campus"  }, JWT_SECRET, { expiresIn: "1h" });
  tokenAdminGeneral = jwt.sign({ ...base, role: "administrador_general" }, JWT_SECRET, { expiresIn: "1h" });
});

// ── Teardown ──────────────────────────────────────────────────────────────
afterAll(async () => {
  await pool.query(
    `DELETE FROM audit_log WHERE tenant_id = $1`, [tenantId],
  );
  await pool.query(
    `DELETE FROM payment_plans WHERE tenant_id = $1`, [tenantId],
  );
  await pool.query(`DELETE FROM students WHERE id = $1`, [studentId]);
  await pool.query(`DELETE FROM campuses WHERE id = $1`, [campusId]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`,  [tenantId]);
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Alerta de condonación repetida — Protocolo §8", () => {

  it("CAR-01: primera condonación sin historial → NO genera ALERTA_CONDONACION_REPETIDA", async () => {
    const { status } = await apiFetch(
      "PATCH", `/api/planes-pago/${planCar01}/cancelar`,
      tokenAdminCampus, bodyCondonar,
    );
    expect(status).toBe(200);

    // Esperar a que 'saldo_condonado' aparezca (confirma que el flujo llegó al bloque de alerta)
    const saldoCondonadoEscrito = await waitForAuditAction(
      'saldo_condonado',
      row => {
        try {
          const m = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
          return m.student_id === studentId;
        } catch { return false; }
      },
    );
    expect(saldoCondonadoEscrito).toBe(true); // confirma que el bloque de alerta se ejecutó

    // No debe haber alerta porque era la primera condonación
    const alertas = await pool.query(
      `SELECT id FROM audit_log
       WHERE tenant_id = $1 AND action = 'ALERTA_CONDONACION_REPETIDA'`,
      [tenantId],
    );
    expect((alertas.rows as any[]).length).toBe(0);
  });

  it("CAR-02: segunda condonación del mismo alumno en <90 días → SÍ genera ALERTA_CONDONACION_REPETIDA", async () => {
    // planCar01 ya fue cancelado en CAR-01 y tiene 'saldo_condonado' en audit_log.
    // Cancelamos planCar02 del mismo alumno → debe disparar la alerta.
    const { status } = await apiFetch(
      "PATCH", `/api/planes-pago/${planCar02}/cancelar`,
      tokenAdminCampus, bodyCondonar,
    );
    expect(status).toBe(200);

    // Sondear hasta que ALERTA_CONDONACION_REPETIDA aparezca en audit_log
    const alertaGenerada = await waitForAuditAction(
      'ALERTA_CONDONACION_REPETIDA',
      row => {
        try {
          const m = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
          return m.student_id === studentId && m.prioridad === 'alta';
        } catch { return false; }
      },
    );
    expect(alertaGenerada).toBe(true);

    // Verificar el contenido de la alerta en DB
    const alertaRows = await pool.query(
      `SELECT metadata FROM audit_log
       WHERE tenant_id = $1 AND action = 'ALERTA_CONDONACION_REPETIDA'`,
      [tenantId],
    );
    expect((alertaRows.rows as any[]).length).toBeGreaterThanOrEqual(1);
    const meta = (() => {
      const raw = (alertaRows.rows as any[])[0].metadata;
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    })();
    expect(meta.prioridad).toBe('alta');
    expect(meta.student_id).toBe(studentId);
    expect(meta.mensaje).toMatch(/repetida/i);
  });

  it("CAR-03: GET /api/admin/alertas/condonaciones con administrador_general → 200 + alerta de CAR-02 en lista", async () => {
    const { status, body } = await apiFetch(
      "GET", "/api/admin/alertas/condonaciones",
      tokenAdminGeneral,
    );
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);

    // Debe contener al menos la alerta generada en CAR-02
    const conAlerta = (body as any[]).some(entry => {
      try {
        const m = typeof entry.metadata === 'string'
          ? JSON.parse(entry.metadata)
          : entry.metadata;
        return m.student_id === studentId && m.prioridad === 'alta';
      } catch { return false; }
    });
    expect(conAlerta).toBe(true);
  });

  it("CAR-04: GET /api/admin/alertas/condonaciones con administrador_campus → 403", async () => {
    const { status, body } = await apiFetch(
      "GET", "/api/admin/alertas/condonaciones",
      tokenAdminCampus,
    );
    expect(status).toBe(403);
    expect(body.message).toMatch(/sin permisos/i);
  });

});
