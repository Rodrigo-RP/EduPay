/**
 * AHG — /api/approvals/history: restricción por rol
 *
 * AHG-01: administrador_general ve historial completo del tenant (ambos usuarios).
 * AHG-02: asistente solo ve sus propias solicitudes históricas (no las de auxiliar_contable).
 * AHG-03: auxiliar_contable solo ve sus propias solicitudes históricas (no las de asistente).
 * AHG-04: super_admin ve todo (sin filtro de tenant ni de usuario).
 * AHG-05: sin token → 401.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

const TENANT  = 29;
const CAMPUS  = 48;
const USER_A  = 80;   // asistente en la DB
const USER_B  = 82;   // auxiliar_contable en la DB

function makeToken(id: number, role: string) {
  return jwt.sign({ id, role, tenant_id: TENANT, campus_id: CAMPUS }, JWT_SECRET, { expiresIn: "10m" });
}

async function getHistory(token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE}/api/approvals/history`, { headers });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// IDs de registros sembrados por este test
const seededApprovals: number[] = [];
const seededNotifs: number[] = [];

beforeAll(async () => {
  // Aprobación histórica solicitada por USER_A (asistente)
  const rA = await pool.query(`
    INSERT INTO pending_approvals
      (campus_id, tenant_id, requested_by, action_type, action_description,
       entity_type, entity_id, original_data, requested_data, reason, status)
    VALUES ($1, $2, $3, 'cancel_payment', 'AHG test A', 'payment', 9901,
            '{}', '{}', 'ahg-test', 'approved')
    RETURNING id
  `, [CAMPUS, TENANT, USER_A]);
  seededApprovals.push(rA.rows[0].id);

  // Aprobación histórica solicitada por USER_B (auxiliar_contable)
  const rB = await pool.query(`
    INSERT INTO pending_approvals
      (campus_id, tenant_id, requested_by, action_type, action_description,
       entity_type, entity_id, original_data, requested_data, reason, status)
    VALUES ($1, $2, $3, 'cancel_payment', 'AHG test B', 'payment', 9902,
            '{}', '{}', 'ahg-test', 'approved')
    RETURNING id
  `, [CAMPUS, TENANT, USER_B]);
  seededApprovals.push(rB.rows[0].id);
});

afterAll(async () => {
  if (seededNotifs.length)
    await pool.query(`DELETE FROM approval_notifications WHERE id = ANY($1)`, [seededNotifs]);
  if (seededApprovals.length)
    await pool.query(`DELETE FROM approval_workflow_logs WHERE approval_id = ANY($1)`, [seededApprovals]);
  if (seededApprovals.length)
    await pool.query(`DELETE FROM pending_approvals WHERE id = ANY($1)`, [seededApprovals]);
});

describe("AHG — GET /api/approvals/history restricción por rol", () => {

  it("AHG-01: administrador_general ve los registros de AMBOS usuarios del tenant", async () => {
    const tok = makeToken(USER_A, "administrador_general");
    const { status, body } = await getHistory(tok);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    const arr = body as any[];
    // Debe encontrar al menos las dos filas sembradas
    const seenA = arr.some(x => x.requested_by === USER_A && x.reason === "ahg-test");
    const seenB = arr.some(x => x.requested_by === USER_B && x.reason === "ahg-test");
    expect(seenA).toBe(true);
    expect(seenB).toBe(true);
  });

  it("AHG-02: asistente (USER_A) solo ve sus propias solicitudes históricas, no las de USER_B", async () => {
    const tok = makeToken(USER_A, "asistente");
    const { status, body } = await getHistory(tok);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    const arr = body as any[];
    // Todas las filas devueltas deben tener requested_by = USER_A
    const seenA = arr.some(x => x.requested_by === USER_A && x.reason === "ahg-test");
    const seenB = arr.some(x => x.requested_by === USER_B && x.reason === "ahg-test");
    expect(seenA).toBe(true);   // ve la suya propia
    expect(seenB).toBe(false);  // no ve la de USER_B
  });

  it("AHG-03: auxiliar_contable (USER_B) solo ve sus propias solicitudes históricas, no las de USER_A", async () => {
    const tok = makeToken(USER_B, "auxiliar_contable");
    const { status, body } = await getHistory(tok);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    const arr = body as any[];
    const seenA = arr.some(x => x.requested_by === USER_A && x.reason === "ahg-test");
    const seenB = arr.some(x => x.requested_by === USER_B && x.reason === "ahg-test");
    expect(seenA).toBe(false);  // no ve la de USER_A
    expect(seenB).toBe(true);   // ve la suya propia
  });

  it("AHG-04: super_admin ve los registros de AMBOS usuarios (sin filtro de tenant)", async () => {
    // super_admin tiene tenant_id undefined en el JWT — sin filtro de tenant
    const tok = jwt.sign({ id: USER_A, role: "super_admin" }, JWT_SECRET, { expiresIn: "10m" });
    const { status, body } = await getHistory(tok);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    const arr = body as any[];
    const seenA = arr.some(x => x.requested_by === USER_A && x.reason === "ahg-test");
    const seenB = arr.some(x => x.requested_by === USER_B && x.reason === "ahg-test");
    expect(seenA).toBe(true);
    expect(seenB).toBe(true);
  });

  it("AHG-05: sin token → 401", async () => {
    const { status } = await getHistory();
    expect(status).toBe(401);
  });
});
