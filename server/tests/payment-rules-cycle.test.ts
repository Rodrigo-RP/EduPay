/**
 * Prueba de ciclo completo: POST /api/payment-rules → GET /api/payment-rules
 *
 * BUGS CONFIRMADOS ANTES DEL FIX:
 *
 *   1. Tabla payment_rules NO EXISTÍA en la DB real.
 *      - to_regclass('public.payment_rules') → null
 *      - POST → 500 "Error creando regla de pago" (relation does not exist)
 *      FIX: migration 002_create_payment_rules.sql crea la tabla.
 *
 *   2. Validación en system.ts:34-35 usaba nombres incorrectos:
 *        const { type, value, gracePeriodDays, description } = req.body;
 *        if (!type || value === undefined) → 400 siempre
 *      El frontend (reglas-pago.tsx:173-189) envía los nombres reales:
 *        rule_type, late_fee_percentage, grace_period_days, name…
 *      Con el nombre incorrecto 'type', la validación devolvía 400 antes
 *      del INSERT (que también fallaría por tabla inexistente).
 *      FIX: validación usa rule_type + name — los nombres de columna reales.
 *
 *   3. GET no tenía problema de traducción: el frontend usa PaymentRule con
 *      los mismos nombres snake_case que Drizzle retorna (rule_type, etc.).
 *
 * Tests:
 *   PRC-01  POST con rule_type correcto → 200, registro en DB sin NULLs
 *   PRC-02  GET devuelve la regla creada con todos los campos correctos
 *   PRC-03  DB directa: ningún campo clave es NULL en el registro creado
 *   PRC-04  POST sin rule_type → 400 (validación correcta)
 *   PRC-05  POST sin name → 400 (validación correcta)
 *   PRC-06  POST de usuario sin campus → 400 (guard JWT)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── Fixtures ──────────────────────────────────────────────────────────────────
let tenantId: number;
let campusId: number;
let createdRuleId: number;
let token: string;

async function apiFetch(method: string, path: string, token: string, body?: object) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// ── Payload que envía el frontend (reglas-pago.tsx:173-189) ───────────────────
const RULE_PAYLOAD = {
  name: "Recargo por mora 3%",
  description: "Aplica 3% mensual después de 5 días de vencimiento",
  rule_type: "percentage",
  grace_period_days: 5,
  grace_period_unit: "days",
  late_fee_percentage: 3.0,
  late_fee_fixed_amount_centavos: null,
  max_late_fee_centavos: null,
  min_late_fee_centavos: null,
  compound_daily: false,
  applies_to_weekends: false,
  applies_to_holidays: false,
  applies_to_concepts: JSON.stringify([]),
  is_active: true,
};

beforeAll(async () => {
  const ts = Date.now().toString().slice(-6);

  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant PRC ${ts}`, `TPRC${ts}`]
  );
  tenantId = tRow.rows[0].id;

  const cRow = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus PRC ${ts}`, tenantId]
  );
  campusId = cRow.rows[0].id;

  // JWT sin 'id' — el endpoint no necesita getUserById
  token = jwt.sign(
    { role: "administrador_campus", campus_id: campusId, tenant_id: tenantId },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
});

afterAll(async () => {
  if (createdRuleId) {
    await pool.query(`DELETE FROM payment_rules WHERE id = $1`, [createdRuleId]);
  }
  await pool.query(`DELETE FROM campuses WHERE id = $1`, [campusId]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("Payment rules — ciclo completo POST → DB → GET", () => {

  it("PRC-01: POST con payload completo del frontend → 200 y devuelve la regla", async () => {
    const { status, body } = await apiFetch(
      "POST",
      "/api/payment-rules",
      token,
      // El frontend hardcodea campus_id:24 — el backend lo sobreescribe con el JWT
      { ...RULE_PAYLOAD, campus_id: 24 }
    );
    // Antes del fix: 400 (validación errónea) o 500 (tabla inexistente)
    // Después del fix: 200
    expect(status).toBe(200);
    expect(body.id).toBeDefined();
    expect(body.rule_type).toBe("percentage");
    expect(body.name).toBe("Recargo por mora 3%");
    expect(body.grace_period_days).toBe(5);
    expect(Number(body.late_fee_percentage)).toBeCloseTo(3.0, 1);
    // El backend debe haber sobreescrito campus_id:24 con el del JWT
    expect(body.campus_id).toBe(campusId);

    createdRuleId = body.id;
  });

  it("PRC-02: GET /api/payment-rules devuelve la regla recién creada con campos correctos", async () => {
    const { status, body } = await apiFetch("GET", "/api/payment-rules", token);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);

    const rule = (body as any[]).find((r: any) => r.id === createdRuleId);
    expect(rule).toBeDefined();

    // Los nombres de columna que el frontend espera (PaymentRule interface):
    expect(rule.rule_type).toBe("percentage");
    expect(rule.name).toBe("Recargo por mora 3%");
    expect(rule.grace_period_days).toBe(5);
    expect(Number(rule.late_fee_percentage)).toBeCloseTo(3.0, 1);
    expect(rule.is_active).toBe(true);
    expect(rule.campus_id).toBe(campusId);
  });

  it("PRC-03: consulta directa a DB — ningún campo clave es NULL", async () => {
    const res = await pool.query(
      `SELECT rule_type, name, grace_period_days, late_fee_percentage,
              is_active, campus_id, tenant_id
       FROM payment_rules WHERE id = $1`,
      [createdRuleId]
    );
    expect(res.rows.length).toBe(1);
    const row = res.rows[0];

    // Ninguno de estos campos debe ser NULL (bug original: eran NULL porque
    // Drizzle ignoraba los campos con nombres incorrectos del body)
    expect(row.rule_type).toBe("percentage");
    expect(row.name).toBe("Recargo por mora 3%");
    expect(row.grace_period_days).toBe(5);
    expect(Number(row.late_fee_percentage)).toBeCloseTo(3.0, 1);
    expect(row.is_active).toBe(true);
    expect(row.campus_id).toBe(campusId);
    expect(row.tenant_id).toBe(tenantId);
  });

  it("PRC-04: POST sin rule_type → 400 con mensaje claro", async () => {
    const { status, body } = await apiFetch(
      "POST",
      "/api/payment-rules",
      token,
      { name: "Sin tipo", grace_period_days: 5 } // falta rule_type
    );
    expect(status).toBe(400);
    expect(body.error).toMatch(/rule_type/i);
  });

  it("PRC-05: POST sin name → 400 con mensaje claro", async () => {
    const { status, body } = await apiFetch(
      "POST",
      "/api/payment-rules",
      token,
      { rule_type: "percentage", grace_period_days: 5 } // falta name
    );
    expect(status).toBe(400);
    expect(body.error).toMatch(/name/i);
  });

  it("PRC-06: POST sin campus en JWT → 400", async () => {
    const tokenNoCampus = jwt.sign(
      { role: "administrador_campus" }, // sin campus_id ni tenant_id
      JWT_SECRET,
      { expiresIn: "1h" }
    );
    const { status } = await apiFetch(
      "POST",
      "/api/payment-rules",
      tokenNoCampus,
      { ...RULE_PAYLOAD }
    );
    expect(status).toBe(400);
  });

});
