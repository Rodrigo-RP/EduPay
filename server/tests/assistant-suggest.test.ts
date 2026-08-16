/**
 * assistant-suggest.test.ts — N4/N5: acciones con confirmación desde el asistente
 *
 * SAC-01..SAC-06  detectSuggestTrigger (unit — Forma A, sin DB, sin servidor)
 * SAC-07          integración: pagar_manual genera señal con chargeId resuelto
 * SAC-08          integración: ambigüedad (alumno con ≥2 cargos) → clarification
 * SAC-09          integración: confirmar → DB charge.estado = 'pagado' + payment
 * SAC-10          integración: NO confirmar → DB sin cambios
 * SAC-11          integración: rol sin permiso en endpoint real → 403
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { detectSuggestTrigger }                        from "../assistant-knowledge";
import { pool }                                        from "../db";
import jwt                                             from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ─── Credenciales ─────────────────────────────────────────────────────────────
let adminToken   : string;   // administrador_campus con CHARGES.UPDATE
let asistenteToken: string;  // asistente (sin CHARGES.UPDATE)

// ─── Fixtures ─────────────────────────────────────────────────────────────────
let campusId : number;
let tenantId : number;
let studentId: number;
let chargeId1: number;   // cargo pendiente único (para SAC-07, SAC-09, SAC-10)
let chargeId2: number;   // segundo cargo pendiente del mismo alumno (para SAC-08)

const TEST_NOMBRE = "Sac Testigo";  // nombre único para no colisionar con seed demo
const TEST_CONCEPT_NOMBRE = "Cuota SAC-Test";

beforeAll(async () => {
  // Obtener un campus y tenant existentes
  const { rows } = await pool.query(
    "SELECT id, tenant_id FROM campuses WHERE tenant_id IS NOT NULL LIMIT 1"
  );
  campusId = rows[0].id;
  tenantId = rows[0].tenant_id;

  adminToken = jwt.sign(
    { role: "administrador_campus", tenant_id: tenantId, campus_id: campusId,
      permissions: [] },
    JWT_SECRET
  );
  asistenteToken = jwt.sign(
    { role: "asistente", tenant_id: tenantId, campus_id: campusId,
      permissions: [] },
    JWT_SECRET
  );

  // Crear concept de test (buscar si ya existe, crear si no)
  let conceptId: number;
  const existing = await pool.query(
    "SELECT id FROM concepts WHERE campus_id=$1 AND nombre=$2 LIMIT 1",
    [campusId, TEST_CONCEPT_NOMBRE]
  );
  if (existing.rows.length) {
    conceptId = existing.rows[0].id;
  } else {
    const conRow = await pool.query(
      `INSERT INTO concepts (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos)
       VALUES ($1, $2, $3, 'Cuota', 'mensual', 120000)
       RETURNING id`,
      [campusId, tenantId, TEST_CONCEPT_NOMBRE]
    );
    conceptId = conRow.rows[0].id;
  }

  // Crear alumno de test (SELECT-then-INSERT — no hay UNIQUE en id_referencia)
  const existSt = await pool.query(
    "SELECT id FROM students WHERE campus_id=$1 AND id_referencia='SAC-001' LIMIT 1",
    [campusId]
  );
  if (existSt.rows.length) {
    studentId = existSt.rows[0].id;
  } else {
    const stRow = await pool.query(
      `INSERT INTO students (tenant_id, campus_id, nombres, apellido_paterno,
                             nombre_completo, grado, grupo, nivel_escolar, status, id_referencia)
       VALUES ($1,$2,'Sac','Testigo',$3,1,'A','Primaria','activo','SAC-001')
       RETURNING id`,
      [tenantId, campusId, TEST_NOMBRE]
    );
    studentId = stRow.rows[0].id;
  }

  // Limpiar cargos anteriores del alumno de test
  await pool.query(
    "DELETE FROM charges WHERE student_id=$1 AND tenant_id=$2",
    [studentId, tenantId]
  );

  // Cargo 1 — pendiente (para SAC-07, SAC-09, SAC-10)
  const c1 = await pool.query(
    `INSERT INTO charges (tenant_id, student_id, concept_id, monto_base_centavos,
                          fecha_emision, fecha_vencimiento, estado, ciclo_escolar)
     VALUES ($1,$2,$3,120000, CURRENT_DATE, CURRENT_DATE + 30, 'pendiente','2025-2026')
     RETURNING id`,
    [tenantId, studentId, conceptId]
  );
  chargeId1 = c1.rows[0].id;

  // Cargo 2 — segundo cargo pendiente (para SAC-08 — ambigüedad)
  const c2 = await pool.query(
    `INSERT INTO charges (tenant_id, student_id, concept_id, monto_base_centavos,
                          fecha_emision, fecha_vencimiento, estado, ciclo_escolar)
     VALUES ($1,$2,$3,240000, CURRENT_DATE, CURRENT_DATE + 60, 'pendiente','2025-2026')
     RETURNING id`,
    [tenantId, studentId, conceptId]
  );
  chargeId2 = c2.rows[0].id;
});

afterAll(async () => {
  // Limpiar en orden (FK: payment_applications → payments → charges → students)
  await pool.query(
    `DELETE FROM payment_applications
     WHERE charge_id IN (SELECT id FROM charges WHERE student_id=$1)`,
    [studentId]
  );
  await pool.query(
    "DELETE FROM payments WHERE charge_id IN (SELECT id FROM charges WHERE student_id=$1)",
    [studentId]
  );
  await pool.query("DELETE FROM charges WHERE student_id=$1", [studentId]);
  await pool.query("DELETE FROM students WHERE id=$1", [studentId]);
});

// ══════════════════════════════════════════════════════════════════════════════
// Bloque 1 — Unit tests: detectSuggestTrigger (Forma A, sin DB)
// ══════════════════════════════════════════════════════════════════════════════

describe("detectSuggestTrigger — Forma A puro", () => {

  it("SAC-01: 'marcar como pagado a García' → pagar_manual", () => {
    const t = detectSuggestTrigger("marcar como pagado a García");
    expect(t).not.toBeNull();
    expect(t!.action).toBe("pagar_manual");
    // El nombre se extrae del mensaje original (con acento) para que ILIKE lo encuentre en DB
    expect(t!.nombre).toMatch(/garc/i);
  });

  it("SAC-02: 'ya pagó Rodríguez' → pagar_manual", () => {
    const t = detectSuggestTrigger("ya pagó Rodríguez");
    expect(t).not.toBeNull();
    expect(t!.action).toBe("pagar_manual");
    expect(t!.nombre).toMatch(/rodr/i);
  });

  it("SAC-03: 'concilia la excepción de $3,500' → resolver_excepcion con monto", () => {
    const t = detectSuggestTrigger("concilia la excepción de $3,500");
    expect(t).not.toBeNull();
    expect(t!.action).toBe("resolver_excepcion");
    expect(t!.monto_centavos).toBe(350000);
  });

  it("SAC-04: 'aplica el SPEI de $1,200' → resolver_excepcion con monto", () => {
    const t = detectSuggestTrigger("aplica el SPEI de $1,200");
    expect(t).not.toBeNull();
    expect(t!.action).toBe("resolver_excepcion");
    expect(t!.monto_centavos).toBe(120000);
  });

  it("SAC-05: mensaje sin trigger → null (no confunde con navegación)", () => {
    expect(detectSuggestTrigger("quiero ver los reportes")).toBeNull();
  });

  it("SAC-06: mensaje de exportación no dispara suggest", () => {
    // El trigger de exportación tiene su propio detector; suggest no debe capturarlo
    expect(detectSuggestTrigger("exportar reporte financiero")).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Bloque 2 — Tests de integración (requieren servidor vivo)
// ══════════════════════════════════════════════════════════════════════════════

async function chatPost(message: string, token: string) {
  return fetch(`${BASE}/api/assistant/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message }),
  });
}

describe("detectSuggestTrigger — integración con servidor", () => {

  it("SAC-07: pagar_manual con alumno de test → señal con chargeId resuelto", async () => {
    // Alumno tiene 2 cargos pendientes → ambigüedad → clarification, no señal
    // Primero marcamos chargeId2 como pagado para dejar solo 1 pendiente
    await pool.query("UPDATE charges SET estado='pagado' WHERE id=$1", [chargeId2]);

    const res  = await chatPost(`pago manual de ${TEST_NOMBRE}`, adminToken);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.suggest).toBeDefined();
    expect(data.suggest.action).toBe("pagar_manual");
    expect(data.suggest.endpoint).toContain(`/api/admin/charges/${chargeId1}/pagar-manual`);
    expect(data.suggest.contexto.alumno).toMatch(/Sac/i);
    expect(data.suggest.contexto.cargo_id).toBe(chargeId1);

    // Restaurar chargeId2 para SAC-08
    await pool.query("UPDATE charges SET estado='pendiente' WHERE id=$1", [chargeId2]);
  });

  it("SAC-08: alumno con ≥2 cargos pendientes → clarification, sin señal", async () => {
    // chargeId1 y chargeId2 están ambos 'pendiente' aquí
    const res  = await chatPost(`marcar como pagado a ${TEST_NOMBRE}`, adminToken);
    expect(res.status).toBe(200);
    const data = await res.json();
    // No debe devolver una señal ejecutable — eso sería adivinar
    expect(data.suggest).toBeUndefined();
    // La respuesta debe mencionar las opciones disponibles
    expect(data.reply).toMatch(/carg/i);
  });

  it("SAC-09: confirmar pago → DB actualiza charge a pagado y crea payment", async () => {
    // Asegurar que solo hay 1 cargo pendiente
    await pool.query("UPDATE charges SET estado='pagado' WHERE id=$1", [chargeId2]);

    // 1. Obtener la señal del asistente
    const chatRes  = await chatPost(`pago manual de ${TEST_NOMBRE}`, adminToken);
    const chatData = await chatRes.json();
    expect(chatData.suggest?.endpoint).toBeTruthy();

    // 2. Confirmar — llamar directamente al endpoint del signal
    const token   = adminToken;
    const confRes = await fetch(`${BASE}${chatData.suggest.endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(chatData.suggest.body),
    });
    expect(confRes.status).toBe(200);

    // 3. Verificar en DB
    const { rows: cRows } = await pool.query(
      "SELECT estado FROM charges WHERE id=$1", [chargeId1]
    );
    expect(cRows[0].estado).toBe("pagado");

    const { rows: pRows } = await pool.query(
      "SELECT id FROM payments WHERE charge_id=$1 AND estado='exitoso'", [chargeId1]
    );
    expect(pRows.length).toBeGreaterThan(0);

    // Restaurar para el siguiente test
    await pool.query("UPDATE charges SET estado='pendiente' WHERE id=$1", [chargeId1]);
    await pool.query("DELETE FROM payment_applications WHERE charge_id=$1", [chargeId1]);
    await pool.query("DELETE FROM payments WHERE charge_id=$1", [chargeId1]);
    await pool.query("UPDATE charges SET estado='pendiente' WHERE id=$1", [chargeId2]);
  });

  it("SAC-10: NO confirmar → DB sin cambios (la señal por sí sola no ejecuta nada)", async () => {
    await pool.query("UPDATE charges SET estado='pendiente' WHERE id=$1", [chargeId1]);
    await pool.query("UPDATE charges SET estado='pagado' WHERE id=$1", [chargeId2]);

    // Obtener la señal — esto no debe modificar nada en DB
    const res = await chatPost(`pago manual de ${TEST_NOMBRE}`, adminToken);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.suggest).toBeDefined();

    // Verificar que el cargo sigue pendiente sin que hayamos llamado al endpoint
    const { rows } = await pool.query(
      "SELECT estado FROM charges WHERE id=$1", [chargeId1]
    );
    expect(rows[0].estado).toBe("pendiente");

    await pool.query("UPDATE charges SET estado='pendiente' WHERE id=$1", [chargeId2]);
  });

  it("SAC-11: rol sin permiso en el endpoint real → 403 (la sugerencia no otorga permisos)", async () => {
    await pool.query("UPDATE charges SET estado='pagado' WHERE id=$1", [chargeId2]);

    // 1. Obtener señal con token admin
    const chatRes  = await chatPost(`pago manual de ${TEST_NOMBRE}`, adminToken);
    const chatData = await chatRes.json();
    const endpoint = chatData.suggest?.endpoint;
    expect(endpoint).toBeTruthy();

    // 2. Intentar confirmar con token de asistente (sin CHARGES.UPDATE)
    const confRes = await fetch(`${BASE}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${asistenteToken}` },
      body: JSON.stringify({ metodo: "efectivo" }),
    });
    // El guard del endpoint real debe bloquear
    expect(confRes.status).toBe(403);

    await pool.query("UPDATE charges SET estado='pendiente' WHERE id=$1", [chargeId2]);
  });
});
