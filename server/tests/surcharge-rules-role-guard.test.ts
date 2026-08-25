/**
 * Prueba de regresión: endpoints de configuración de reglas de recargo —
 * guard hasPermission(MODULES.SETTINGS, ACTIONS.CONFIGURE)
 *
 * VULNERABILIDAD ORIGINAL (confirmada empíricamente antes del fix):
 *   PUT  /api/payment-config/surcharge-rules/:id         → 200 con JWT de asistente
 *   PUT  /api/payment-config/surcharge-rules-complete/:id → 200 con JWT de asistente
 *   POST /api/payment-config/late-fee-rules               → 201 con JWT de asistente
 *
 *   Un JWT de rol 'asistente' podía desactivar (activo:false) o poner a cero
 *   el porcentaje de recargo de todo el campus sin ningún guard de rol.
 *   El cambio persistía en payment_surcharge_rules de inmediato.
 *
 * DESPUÉS del fix:
 *   hasPermission(role, MODULES.SETTINGS, ACTIONS.CONFIGURE) es la PRIMERA
 *   verificación en los 6 endpoints de escritura sobre payment_surcharge_rules.
 *   Roles autorizados: super_admin, administrador_general, administrador_campus.
 *
 * Tests:
 *   SRG-01  asistente → 403 en PUT /api/payment-config/surcharge-rules/:id
 *   SRG-02  asistente → 403 en PUT /api/payment-config/surcharge-rules-complete/:id
 *   SRG-03  asistente → 403 en POST /api/payment-config/late-fee-rules
 *   SRG-04  administrador_general → 200 en PUT /api/payment-config/surcharge-rules/:id (control positivo)
 *   SRG-05  SRG-01 no persistió: la regla conserva sus valores originales en DB
 *   SRG-06  administrador_campus → 200 en PUT /api/payment-config/surcharge-rules/:id (control positivo)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

let tenantId: number;
let campusId: number;
let ruleId: number;
let tokenAsistente: string;
let tokenAdminGeneral: string;
let tokenAdminCampus: string;

async function apiFetch(
  method: string,
  path: string,
  token: string,
  body?: object
) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// ── Setup ──────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const ts = Date.now().toString().slice(-7);

  // Tenant y campus propios del test
  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`SurchargeRulesGuardTest ${ts}`, `SRG${ts}`]
  );
  tenantId = tRow.rows[0].id;

  const cRow = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus SRG ${ts}`, tenantId]
  );
  campusId = cRow.rows[0].id;

  // Regla de recargo real en la DB — fixture del test
  const rRow = await pool.query(
    `INSERT INTO payment_surcharge_rules
       (campus_id, tenant_id, nombre, concepto, tipo, porcentaje, dias_gracia, activo)
     VALUES ($1,$2,$3,$4,'porcentaje','5.00',3,true) RETURNING id`,
    [campusId, tenantId, `Recargo SRG ${ts}`, `Recargo SRG ${ts}`]
  );
  ruleId = rRow.rows[0].id;

  // JWTs — sin 'id' para evitar rollback silencioso del audit_log FK
  tokenAsistente = jwt.sign(
    { role: "asistente", campus_id: campusId, tenant_id: tenantId },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
  tokenAdminGeneral = jwt.sign(
    { role: "administrador_general", campus_id: campusId, tenant_id: tenantId },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
  tokenAdminCampus = jwt.sign(
    { role: "administrador_campus", campus_id: campusId, tenant_id: tenantId },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
});

// ── Teardown ───────────────────────────────────────────────────────────────
afterAll(async () => {
  await pool.query(
    `DELETE FROM payment_surcharge_rules WHERE campus_id = $1`,
    [campusId]
  );
  await pool.query(`DELETE FROM campuses WHERE id = $1`, [campusId]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
});

// ── Tests ──────────────────────────────────────────────────────────────────
describe("Reglas de recargo — guard SETTINGS.CONFIGURE", () => {
  it("SRG-01: asistente recibe 403 en PUT /api/payment-config/surcharge-rules/:id", async () => {
    const { status, body } = await apiFetch(
      "PUT",
      `/api/payment-config/surcharge-rules/${ruleId}`,
      tokenAsistente,
      {
        nombre: "Intento de sabotaje",
        tipo: "porcentaje",
        dias_gracia: 0,
        porcentaje: "0",
        activo: false,
      }
    );

    expect(status).toBe(403);
    expect(body.message).toMatch(/sin permisos/i);
  });

  it("SRG-02: asistente recibe 403 en PUT /api/payment-config/surcharge-rules-complete/:id", async () => {
    const { status, body } = await apiFetch(
      "PUT",
      `/api/payment-config/surcharge-rules-complete/${ruleId}`,
      tokenAsistente,
      {
        porcentaje_recargo: 0,
        activo: false,
        dias_gracia: 0,
        tipo_calculo: "porcentaje_fijo",
      }
    );

    expect(status).toBe(403);
    expect(body.message).toMatch(/sin permisos/i);
  });

  it("SRG-03: asistente recibe 403 en POST /api/payment-config/late-fee-rules", async () => {
    const { status, body } = await apiFetch(
      "POST",
      `/api/payment-config/late-fee-rules`,
      tokenAsistente,
      {
        nombre: "Regla inyectada por asistente",
        tipo: "porcentaje",
        dias_gracia: 0,
        porcentaje: "0.1",
      }
    );

    expect(status).toBe(403);
    expect(body.message).toMatch(/sin permisos/i);
  });

  it("SRG-04: administrador_general recibe 200 en PUT /api/payment-config/surcharge-rules/:id (control positivo)", async () => {
    const { status, body } = await apiFetch(
      "PUT",
      `/api/payment-config/surcharge-rules/${ruleId}`,
      tokenAdminGeneral,
      {
        nombre: "Recargo SRG actualizado por admin_general",
        tipo: "porcentaje",
        dias_gracia: 5,
        porcentaje: "7",
        activo: true,
      }
    );

    expect(status).toBe(200);
    const rule = body.updatedRule || body;
    expect(rule.activo).toBe(true);
  });

  it("SRG-05: SRG-01 no persistió — la regla NO tiene activo:false ni porcentaje:0 en DB", async () => {
    const res = await pool.query(
      `SELECT porcentaje, activo FROM payment_surcharge_rules WHERE id = $1`,
      [ruleId]
    );
    expect(res.rows.length).toBe(1);
    // El intento de SRG-01 no debió persistir
    expect(res.rows[0].activo).toBe(true);
    // El porcentaje no debió quedar en 0 (puede ser '5.00' o '7.00' tras SRG-04, ambos > 0)
    expect(parseFloat(res.rows[0].porcentaje)).toBeGreaterThan(0);
  });

  it("SRG-06: administrador_campus recibe 200 en PUT /api/payment-config/surcharge-rules/:id (control positivo)", async () => {
    const { status, body } = await apiFetch(
      "PUT",
      `/api/payment-config/surcharge-rules/${ruleId}`,
      tokenAdminCampus,
      {
        nombre: "Recargo SRG actualizado por admin_campus",
        tipo: "porcentaje",
        dias_gracia: 3,
        porcentaje: "6",
        activo: true,
      }
    );

    expect(status).toBe(200);
    const rule = body.updatedRule || body;
    expect(rule.activo).toBe(true);
  });
});
