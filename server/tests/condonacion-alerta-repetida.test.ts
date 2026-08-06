/**
 * Prueba de regresión: Alerta de condonación repetida — Protocolo §8.
 *
 * Regla: si el mismo alumno o cualquier miembro de su familia recibe una
 * condonación de saldo más de una vez en 90 días, el sistema escribe
 * 'ALERTA_CONDONACION_REPETIDA' en audit_log con prioridad 'alta'.
 * La alerta es visible para administrador_general mediante
 * GET /api/admin/alertas/condonaciones.
 *
 * Escrituras críticas ('saldo_condonado' y 'ALERTA_CONDONACION_REPETIDA')
 * usan pool.query(...).catch(err => enqueueAuditLog(...)) — misma red de
 * seguridad que el resto de auditoría financiera.
 *
 * Tests:
 *   CAR-01  Primera condonación sin historial previo → NO genera alerta
 *   CAR-02  Segunda condonación del mismo alumno en <90 días → SÍ genera alerta
 *   CAR-03  GET alertas/condonaciones con administrador_general → 200 + alerta de CAR-02
 *   CAR-04  GET alertas/condonaciones con administrador_campus → 403
 *   CAR-05  Condonación de un hermano (mismo family_id) → SÍ genera alerta con incluye_hermanos:true
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── IDs de fixtures ────────────────────────────────────────────────────────
let tenantId:        number;
let campusId:        number;
let studentId:       number;   // alumno principal
let siblingStudentId: number;  // hermano — misma familia
let familyId:        number;

// Planes de pago (reestructuración) para cada test
let planCar01: number;
let planCar02: number;
let planCar05: number;  // para el hermano

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

/** Sondeo con timeout — para escrituras fire-and-forget en audit_log */
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

async function mkPlanReestructuracion(sid: number): Promise<number> {
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

  siblingStudentId = (await pool.query(
    `INSERT INTO students (tenant_id, campus_id, nombres, apellido_paterno,
                           nombre_completo, status)
     VALUES ($1,$2,'Hermano','CAR','Hermano CAR ${ts}','activo') RETURNING id`,
    [tenantId, campusId],
  )).rows[0].id;

  // Familia con ambos alumnos — necesario para la detección por family_id (CAR-05)
  familyId = (await pool.query(
    `INSERT INTO families (tenant_id, campus_id, nombre) VALUES ($1,$2,$3) RETURNING id`,
    [tenantId, campusId, `Familia CAR ${ts}`],
  )).rows[0].id;

  await pool.query(
    `INSERT INTO family_students (family_id, student_id) VALUES ($1,$2), ($1,$3)`,
    [familyId, studentId, siblingStudentId],
  );

  // Planes de reestructuración para cada test
  planCar01 = await mkPlanReestructuracion(studentId);
  planCar02 = await mkPlanReestructuracion(studentId);
  planCar05 = await mkPlanReestructuracion(siblingStudentId);

  const base = { campus_id: campusId, tenant_id: tenantId };
  tokenAdminCampus  = jwt.sign({ ...base, role: "administrador_campus"  }, JWT_SECRET, { expiresIn: "1h" });
  tokenAdminGeneral = jwt.sign({ ...base, role: "administrador_general" }, JWT_SECRET, { expiresIn: "1h" });
});

// ── Teardown ──────────────────────────────────────────────────────────────
afterAll(async () => {
  await pool.query(`DELETE FROM family_students WHERE family_id = $1`, [familyId]);
  await pool.query(`DELETE FROM families WHERE id = $1`, [familyId]);
  await pool.query(`DELETE FROM audit_log WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM payment_plans WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM students WHERE id IN ($1,$2)`, [studentId, siblingStudentId]);
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

    // Esperar a que 'saldo_condonado' aparezca — confirma que el bloque de alerta se ejecutó
    const saldoEscrito = await waitForAuditAction(
      'saldo_condonado',
      row => {
        try {
          const m = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
          return m.student_id === studentId;
        } catch { return false; }
      },
    );
    expect(saldoEscrito).toBe(true);

    // Sin historial previo → no debe haber alerta
    const alertas = await pool.query(
      `SELECT id FROM audit_log WHERE tenant_id = $1 AND action = 'ALERTA_CONDONACION_REPETIDA'`,
      [tenantId],
    );
    expect((alertas.rows as any[]).length).toBe(0);
  });

  it("CAR-02: segunda condonación del mismo alumno en <90 días → SÍ genera ALERTA_CONDONACION_REPETIDA", async () => {
    const { status } = await apiFetch(
      "PATCH", `/api/planes-pago/${planCar02}/cancelar`,
      tokenAdminCampus, bodyCondonar,
    );
    expect(status).toBe(200);

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

    // Verificar contenido de la alerta
    const alertaRows = await pool.query(
      `SELECT metadata FROM audit_log
       WHERE tenant_id = $1 AND action = 'ALERTA_CONDONACION_REPETIDA'
         AND metadata::text LIKE $2`,
      [tenantId, `%"student_id":${studentId}%`],
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

  it("CAR-03: GET /api/admin/alertas/condonaciones con administrador_general → 200 + lista con alerta de CAR-02", async () => {
    const { status, body } = await apiFetch(
      "GET", "/api/admin/alertas/condonaciones",
      tokenAdminGeneral,
    );
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);

    const conAlerta = (body as any[]).some(entry => {
      try {
        const m = typeof entry.metadata === 'string' ? JSON.parse(entry.metadata) : entry.metadata;
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

  it("CAR-05: condonación de hermano en misma familia en <90 días → alerta con incluye_hermanos:true", async () => {
    // planCar05 pertenece a siblingStudentId. En audit_log ya existe una entrada
    // 'saldo_condonado' para studentId (hermano) escrita en CAR-01.
    // La detección por family_id debe encontrar esa entrada y disparar la alerta.
    const { status } = await apiFetch(
      "PATCH", `/api/planes-pago/${planCar05}/cancelar`,
      tokenAdminCampus, bodyCondonar,
    );
    expect(status).toBe(200);

    // Sondear: ALERTA_CONDONACION_REPETIDA para siblingStudentId con incluye_hermanos:true
    const alertaHermano = await waitForAuditAction(
      'ALERTA_CONDONACION_REPETIDA',
      row => {
        try {
          const m = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
          return m.student_id === siblingStudentId && m.incluye_hermanos === true;
        } catch { return false; }
      },
    );
    expect(alertaHermano).toBe(true);

    // Verificar que el mensaje menciona hermanos
    const alertaRows = await pool.query(
      `SELECT metadata FROM audit_log
       WHERE tenant_id = $1 AND action = 'ALERTA_CONDONACION_REPETIDA'
         AND metadata::text LIKE $2`,
      [tenantId, `%"student_id":${siblingStudentId}%`],
    );
    expect((alertaRows.rows as any[]).length).toBeGreaterThanOrEqual(1);
    const meta = (() => {
      const raw = (alertaRows.rows as any[])[0].metadata;
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    })();
    expect(meta.incluye_hermanos).toBe(true);
    expect(meta.prioridad).toBe('alta');
    expect(meta.mensaje).toMatch(/hermano/i);
  });

});
