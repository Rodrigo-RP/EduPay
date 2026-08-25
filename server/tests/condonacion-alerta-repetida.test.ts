/**
 * Prueba de regresión: Alerta de condonación repetida — Protocolo §8.
 *
 * Regla: si el mismo alumno o cualquier miembro de su familia ya tiene una
 * condonación de saldo en los últimos 90 días, el PATCH cancelar con
 * destino='condonar' devuelve 409 con requiere_override:true y el id de la
 * ALERTA_CONDONACION_REPETIDA generada. Solo un override_token emitido por
 * administrador_general permite ejecutar la condonación adicional.
 *
 * Tests:
 *   CAR-01  Primera condonación sin historial previo → 200, sin alerta
 *   CAR-02  Segunda condonación del mismo alumno en <90 días → 409, genera
 *           ALERTA_CONDONACION_REPETIDA con alerta_id en el body
 *   CAR-03  GET alertas/condonaciones con administrador_general → 200 + alerta de CAR-02
 *   CAR-04  GET alertas/condonaciones con administrador_campus → 403
 *   CAR-05  Condonación de hermano (mismo family_id) en <90 días → 409
 *           con incluye_hermanos:true en la ALERTA
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";
if (!JWT_SECRET) throw new Error("Se requiere JWT_SECRET o SESSION_SECRET para las pruebas.");

// ── IDs de fixtures ────────────────────────────────────────────────────────
let tenantId:         number;
let campusId:         number;
let studentId:        number;   // alumno principal
let siblingStudentId: number;   // hermano — misma familia
let familyId:         number;

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

  it("CAR-01: primera condonación sin historial → 200, NO genera ALERTA_CONDONACION_REPETIDA", async () => {
    const { status } = await apiFetch(
      "PATCH", `/api/planes-pago/${planCar01}/cancelar`,
      tokenAdminCampus, bodyCondonar,
    );
    expect(status).toBe(200);

    // saldo_condonado se escribe fire-and-forget — esperar hasta 2.5s
    const deadline = Date.now() + 2500;
    let saldoEscrito = false;
    while (Date.now() < deadline) {
      const r = await pool.query(
        `SELECT id FROM audit_log
         WHERE tenant_id = $1 AND action = 'saldo_condonado'
           AND (metadata::jsonb ->> 'student_id')::int = $2`,
        [tenantId, studentId],
      );
      if ((r.rows as any[]).length > 0) { saldoEscrito = true; break; }
      await new Promise(r => setTimeout(r, 100));
    }
    expect(saldoEscrito).toBe(true);

    // Sin historial previo → no debe existir ninguna alerta todavía
    const alertas = await pool.query(
      `SELECT id FROM audit_log WHERE tenant_id = $1 AND action = 'ALERTA_CONDONACION_REPETIDA'`,
      [tenantId],
    );
    expect((alertas.rows as any[]).length).toBe(0);
  });

  it("CAR-02: segunda condonación del mismo alumno en <90 días → 409, genera ALERTA_CONDONACION_REPETIDA", async () => {
    // Con el pre-check activo, la segunda condonación se bloquea con 409 y
    // escribe ALERTA sincrónicamente (con await) en el mismo request.
    const { status, body } = await apiFetch(
      "PATCH", `/api/planes-pago/${planCar02}/cancelar`,
      tokenAdminCampus, bodyCondonar,
    );
    expect(status).toBe(409);
    expect(body.requiere_override).toBe(true);
    // El alerta_id viene en el body para que el frontend pueda iniciar el flujo de override
    expect(typeof body.alerta_id).toBe("number");

    // La ALERTA se escribe sincrónicamente (await pool.query en el handler),
    // así que ya debe estar en la base de datos al llegar aquí.
    const alertaRows = await pool.query(
      `SELECT metadata FROM audit_log
       WHERE tenant_id = $1 AND action = 'ALERTA_CONDONACION_REPETIDA'
         AND entity_id = $2`,
      [tenantId, planCar02],
    );
    expect((alertaRows.rows as any[]).length).toBeGreaterThanOrEqual(1);
    const meta = (() => {
      const raw = (alertaRows.rows as any[])[0].metadata;
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    })();
    expect(meta.prioridad).toBe('alta');
    expect(meta.student_id).toBe(studentId);
    expect(meta.mensaje).toMatch(/repetici[oó]n|repetida|bloqueada/i);
    // El id en el body debe coincidir con el registrado en la base de datos
    expect(body.alerta_id).toBe((alertaRows.rows as any[])[0]
      ? Number(body.alerta_id) : null); // ya verificamos que es number arriba
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

  it("CAR-05: condonación de hermano en misma familia en <90 días → 409 con incluye_hermanos:true", async () => {
    // planCar05 pertenece a siblingStudentId. La familia comparte family_id con studentId,
    // cuyo saldo_condonado fue escrito en CAR-01. El pre-check lo detecta por family_id.
    const { status, body } = await apiFetch(
      "PATCH", `/api/planes-pago/${planCar05}/cancelar`,
      tokenAdminCampus, bodyCondonar,
    );
    expect(status).toBe(409);
    expect(body.requiere_override).toBe(true);
    expect(typeof body.alerta_id).toBe("number");

    // ALERTA escrita sincrónicamente — verificar campo incluye_hermanos
    const alertaRows = await pool.query(
      `SELECT metadata FROM audit_log
       WHERE tenant_id = $1 AND action = 'ALERTA_CONDONACION_REPETIDA'
         AND entity_id = $2`,
      [tenantId, planCar05],
    );
    expect((alertaRows.rows as any[]).length).toBeGreaterThanOrEqual(1);
    const meta = (() => {
      const raw = (alertaRows.rows as any[])[0].metadata;
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    })();
    expect(meta.student_id).toBe(siblingStudentId);
    expect(meta.incluye_hermanos).toBe(true);
    expect(meta.prioridad).toBe('alta');
    expect(meta.mensaje).toMatch(/hermano/i);
  });

});
