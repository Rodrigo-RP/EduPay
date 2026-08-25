/**
 * Prueba de regresión: IDOR en PUT /api/payment-config/surcharge-rules-complete/:id
 *
 * VULNERABILIDAD CONFIRMADA (antes del fix, guardian.ts:1537):
 *   La cláusula WHERE del UPDATE filtra solo por `id`:
 *     .where(eq(payment_surcharge_rules.id, ruleId))
 *   Sin campus_id ni tenant_id, un administrador_campus de cualquier plantel
 *   podía sobrescribir la regla de recargo de otro plantel si conocía su ID.
 *
 * Casos probados:
 *   CRS-01  admin_campus de campus B (mismo tenant) PUT regla del campus A → 404
 *   CRS-02  admin_campus de campus B (tenant distinto) PUT regla del campus A → 404
 *   CRS-03  Persistencia — regla A sin cambios tras CRS-01
 *   CRS-04  Persistencia — regla A sin cambios tras CRS-02
 *   CRS-05  Control positivo — admin_campus de campus A actualiza su propia regla → 200
 *   CRS-06  Persistencia — cambio de CRS-05 sí llegó a la DB
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

// ── Fixtures ──────────────────────────────────────────────────────────────────
let tenantA: number;
let campusA: number;
let ruleAId: number;
let originalPorcentaje: string;
let tokenAdminCampusA: string;

let tenantB_same: number; // mismo tenant que A → caso mismo tenant
let campusB_same: number;
let tokenAdminCampusB_same: string;

let tenantB_diff: number; // tenant distinto → caso cross-tenant
let campusB_diff: number;
let tokenAdminCampusB_diff: string;

async function apiFetch(method: string, path: string, token: string, body?: object) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const ts = Date.now().toString().slice(-7);

  // ── Tenant / Campus A ──────────────────────────────────────────────────────
  const tA = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`TenantA CRS ${ts}`, `CRSA${ts}`]
  );
  tenantA = tA.rows[0].id;

  const cA = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`CampusA CRS ${ts}`, tenantA]
  );
  campusA = cA.rows[0].id;

  // Regla de recargo en campus A — objetivo del ataque
  originalPorcentaje = "8.50";
  const rA = await pool.query(
    `INSERT INTO payment_surcharge_rules
       (campus_id, tenant_id, nombre, concepto, tipo, porcentaje, dias_gracia, activo)
     VALUES ($1,$2,$3,$4,'porcentaje',$5,5,true) RETURNING id`,
    [campusA, tenantA, `Recargo CRS ${ts}`, `Recargo CRS ${ts}`, originalPorcentaje]
  );
  ruleAId = rA.rows[0].id;

  tokenAdminCampusA = jwt.sign(
    { role: "administrador_campus", campus_id: campusA, tenant_id: tenantA },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // ── Campus B — mismo tenant que A ─────────────────────────────────────────
  tenantB_same = tenantA; // mismo tenant
  const cB_same = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`CampusB_same CRS ${ts}`, tenantB_same]
  );
  campusB_same = cB_same.rows[0].id;

  tokenAdminCampusB_same = jwt.sign(
    { role: "administrador_campus", campus_id: campusB_same, tenant_id: tenantB_same },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // ── Tenant / Campus B — tenant distinto ────────────────────────────────────
  const tB_diff = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`TenantB CRS ${ts}`, `CRSB${ts}`]
  );
  tenantB_diff = tB_diff.rows[0].id;

  const cB_diff = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`CampusB_diff CRS ${ts}`, tenantB_diff]
  );
  campusB_diff = cB_diff.rows[0].id;

  tokenAdminCampusB_diff = jwt.sign(
    { role: "administrador_campus", campus_id: campusB_diff, tenant_id: tenantB_diff },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
});

// ── Teardown ──────────────────────────────────────────────────────────────────
afterAll(async () => {
  await pool.query(`DELETE FROM payment_surcharge_rules WHERE campus_id = ANY($1::int[])`, [
    [campusA, campusB_same, campusB_diff].filter(Boolean),
  ]);
  await pool.query(`DELETE FROM campuses WHERE id = ANY($1::int[])`, [
    [campusA, campusB_same, campusB_diff].filter(Boolean),
  ]);
  // tenantA y tenantB_diff son distintos; tenantB_same === tenantA
  const tenantsToDelete = [...new Set([tenantA, tenantB_diff].filter(Boolean))];
  await pool.query(`DELETE FROM tenants WHERE id = ANY($1::int[])`, [tenantsToDelete]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("CF-12 PUT surcharge-rules-complete — IDOR cross-campus", () => {

  it(
    "CRS-01: admin_campus de campus B (mismo tenant) intenta PUT regla de campus A → 404",
    async () => {
      const { status, body } = await apiFetch(
        "PUT",
        `/api/payment-config/surcharge-rules-complete/${ruleAId}`,
        tokenAdminCampusB_same,
        {
          porcentaje_recargo: 0.01,
          activo: false,
          dias_gracia: 0,
          tipo_calculo: "porcentaje_fijo",
        }
      );

      // Antes del fix: status 200 (IDOR confirmado)
      // Después del fix: status 404 (regla no encontrada para el campus del solicitante)
      expect(status).toBe(404);
    }
  );

  it(
    "CRS-02: admin_campus de campus B (tenant distinto) intenta PUT regla de campus A → 404",
    async () => {
      const { status, body } = await apiFetch(
        "PUT",
        `/api/payment-config/surcharge-rules-complete/${ruleAId}`,
        tokenAdminCampusB_diff,
        {
          porcentaje_recargo: 0.01,
          activo: false,
          dias_gracia: 0,
          tipo_calculo: "porcentaje_fijo",
        }
      );

      expect(status).toBe(404);
    }
  );

  it(
    "CRS-03: regla A sin cambios en DB tras intento de CRS-01 (mismo tenant)",
    async () => {
      const res = await pool.query(
        `SELECT porcentaje, activo, dias_gracia FROM payment_surcharge_rules WHERE id = $1`,
        [ruleAId]
      );
      expect(res.rows.length).toBe(1);
      const r = res.rows[0];
      // porcentaje sigue siendo el original
      expect(parseFloat(r.porcentaje)).toBeCloseTo(parseFloat(originalPorcentaje), 1);
      // activo sigue siendo true
      expect(r.activo).toBe(true);
      // dias_gracia sigue siendo 5
      expect(r.dias_gracia).toBe(5);
    }
  );

  it(
    "CRS-04: regla A sin cambios en DB tras intento de CRS-02 (tenant distinto)",
    async () => {
      const res = await pool.query(
        `SELECT porcentaje, activo, dias_gracia FROM payment_surcharge_rules WHERE id = $1`,
        [ruleAId]
      );
      expect(res.rows.length).toBe(1);
      const r = res.rows[0];
      expect(parseFloat(r.porcentaje)).toBeCloseTo(parseFloat(originalPorcentaje), 1);
      expect(r.activo).toBe(true);
      expect(r.dias_gracia).toBe(5);
    }
  );

  it(
    "CRS-05: admin_campus de campus A actualiza su propia regla → 200 (control positivo)",
    async () => {
      const { status, body } = await apiFetch(
        "PUT",
        `/api/payment-config/surcharge-rules-complete/${ruleAId}`,
        tokenAdminCampusA,
        {
          porcentaje_recargo: 9.0,
          activo: true,
          dias_gracia: 7,
          tipo_calculo: "porcentaje_fijo",
        }
      );

      expect(status).toBe(200);
      expect(body.activo).toBe(true);
      expect(body.dias_gracia).toBe(7);
    }
  );

  it(
    "CRS-06: cambio de CRS-05 sí llegó a la DB",
    async () => {
      const res = await pool.query(
        `SELECT porcentaje, activo, dias_gracia FROM payment_surcharge_rules WHERE id = $1`,
        [ruleAId]
      );
      expect(res.rows.length).toBe(1);
      const r = res.rows[0];
      expect(parseFloat(r.porcentaje)).toBeCloseTo(9.0, 1);
      expect(r.activo).toBe(true);
      expect(r.dias_gracia).toBe(7);
    }
  );

});
