/**
 * Prueba de regresión: guard SCHOLARSHIPS.ASSIGN en endpoints de becas automáticas.
 *
 * CAMBIO DE NEGOCIO:
 *   'admisiones' TENÍA SCHOLARSHIPS.ASSIGN y fue removido — ya no puede crear
 *   ni ejecutar reglas de becas. Esta es la prueba más crítica.
 *
 * Endpoints cubiertos:
 *   POST   /api/becas-auto/reglas              (fiscal.ts)
 *   POST   /api/becas-auto/ejecutar/:campusId  (fiscal.ts)
 *   DELETE /api/becas-auto/reglas/:id          (fiscal.ts — guard añadido por simetría)
 *
 * Tests:
 *   SAG-01  admisiones → 403 en POST /api/becas-auto/reglas; sin regla creada en DB
 *   SAG-02  admisiones → 403 en POST /api/becas-auto/ejecutar/:campusId
 *   SAG-03  contador_general → 200 en POST /api/becas-auto/reglas (permiso nuevo)
 *   SAG-04  contador_general → 200 en POST /api/becas-auto/ejecutar/:campusId
 *   SAG-05  administrador_campus → 200 en POST /api/becas-auto/reglas (permiso nuevo)
 *   SAG-06  administrador_campus → 200 en POST /api/becas-auto/ejecutar/:campusId
 *   SAG-07  admisiones → 403 en DELETE /api/becas-auto/reglas/:id; regla no eliminada
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

let tenantId:  number;
let campusId:  number;

// Regla creada en beforeAll exclusivamente para el test SAG-07
let ruleForDeleteTest: number;

// Reglas creadas durante los tests positivos (para cleanup en afterAll)
const createdRuleIds: number[] = [];

let tokenAdmisiones:      string;
let tokenContadorGeneral: string;
let tokenAdminCampus:     string;

async function apiFetch(
  method: string,
  path: string,
  token: string,
  body?: object,
) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function countRules(): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*) AS n FROM scholarship_auto_rules WHERE campus_id = $1`,
    [campusId],
  );
  return Number(r.rows[0].n);
}

// ── Setup ─────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const ts = Date.now().toString().slice(-7);

  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`SAG_Guard_Test ${ts}`, `SAG${ts}`],
  );
  tenantId = tRow.rows[0].id;

  const cRow = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus SAG ${ts}`, tenantId],
  );
  campusId = cRow.rows[0].id;

  // Regla existente para probar que DELETE de admisiones falla
  const rRow = await pool.query(
    `INSERT INTO scholarship_auto_rules
       (campus_id, tenant_id, nombre, tipo, descuento_porcentaje, aplica_a)
     VALUES ($1,$2,$3,'hermanos',15,'todos') RETURNING id`,
    [campusId, tenantId, `Regla SAG delete-test ${ts}`],
  );
  ruleForDeleteTest = rRow.rows[0].id;

  // JWTs — sin 'id' para evitar rollback silencioso del audit_log FK
  const base = { campus_id: campusId, tenant_id: tenantId };
  tokenAdmisiones      = jwt.sign({ ...base, role: "admisiones"          }, JWT_SECRET, { expiresIn: "1h" });
  tokenContadorGeneral = jwt.sign({ ...base, role: "contador_general"    }, JWT_SECRET, { expiresIn: "1h" });
  tokenAdminCampus     = jwt.sign({ ...base, role: "administrador_campus"}, JWT_SECRET, { expiresIn: "1h" });
});

// ── Teardown ──────────────────────────────────────────────────────────────
afterAll(async () => {
  // Eliminar todas las reglas del campus de test (incluye la de beforeAll y las de tests positivos)
  await pool.query(
    `DELETE FROM scholarship_auto_rules WHERE campus_id = $1`,
    [campusId],
  );
  await pool.query(`DELETE FROM campuses WHERE id = $1`, [campusId]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`,  [tenantId]);
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. POST /api/becas-auto/reglas
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/becas-auto/reglas — guard SCHOLARSHIPS.ASSIGN", () => {
  it("SAG-01: admisiones → 403, sin regla creada en DB (era el rol con acceso antes del fix)", async () => {
    const nBefore = await countRules();

    const { status, body } = await apiFetch(
      "POST",
      "/api/becas-auto/reglas",
      tokenAdmisiones,
      {
        nombre: "Regla inyectada por admisiones",
        tipo: "hermanos",
        descuento_porcentaje: 10,
        aplica_a: "todos",
      },
    );

    expect(status).toBe(403);
    expect(body.message).toMatch(/sin permisos/i);

    // Verificar que no se creó ninguna regla nueva
    const nAfter = await countRules();
    expect(nAfter).toBe(nBefore);
  });

  it("SAG-03: contador_general → 200, regla creada (permiso nuevo)", async () => {
    const { status, body } = await apiFetch(
      "POST",
      "/api/becas-auto/reglas",
      tokenContadorGeneral,
      {
        nombre: "Regla SAG contador_general",
        tipo: "hermanos",
        descuento_porcentaje: 10,
        aplica_a: "todos",
      },
    );

    expect(status).toBe(200);
    expect(body.id).toBeTruthy();
    expect(body.campus_id).toBe(campusId);
    createdRuleIds.push(body.id);
  });

  it("SAG-05: administrador_campus → 200, regla creada (permiso nuevo)", async () => {
    const { status, body } = await apiFetch(
      "POST",
      "/api/becas-auto/reglas",
      tokenAdminCampus,
      {
        nombre: "Regla SAG admin_campus",
        tipo: "hermanos",
        descuento_porcentaje: 5,
        aplica_a: "todos",
      },
    );

    expect(status).toBe(200);
    expect(body.id).toBeTruthy();
    expect(body.campus_id).toBe(campusId);
    createdRuleIds.push(body.id);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. POST /api/becas-auto/ejecutar/:campusId
// ═══════════════════════════════════════════════════════════════════════════
describe("POST /api/becas-auto/ejecutar/:campusId — guard SCHOLARSHIPS.ASSIGN", () => {
  it("SAG-02: admisiones → 403", async () => {
    const { status, body } = await apiFetch(
      "POST",
      `/api/becas-auto/ejecutar/${campusId}`,
      tokenAdmisiones,
    );

    expect(status).toBe(403);
    expect(body.message).toMatch(/sin permisos/i);
  });

  it("SAG-04: contador_general → 200 (permiso nuevo)", async () => {
    const { status } = await apiFetch(
      "POST",
      `/api/becas-auto/ejecutar/${campusId}`,
      tokenContadorGeneral,
    );

    // 200 con aplicadas:0 si no hay alumnos/reglas activas en nuestro campus de test
    expect(status).toBe(200);
  });

  it("SAG-06: administrador_campus → 200 (permiso nuevo)", async () => {
    const { status } = await apiFetch(
      "POST",
      `/api/becas-auto/ejecutar/${campusId}`,
      tokenAdminCampus,
    );

    expect(status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. DELETE /api/becas-auto/reglas/:id
// ═══════════════════════════════════════════════════════════════════════════
describe("DELETE /api/becas-auto/reglas/:id — guard SCHOLARSHIPS.ASSIGN", () => {
  it("SAG-07: admisiones → 403, regla NO eliminada de DB", async () => {
    const { status, body } = await apiFetch(
      "DELETE",
      `/api/becas-auto/reglas/${ruleForDeleteTest}`,
      tokenAdmisiones,
    );

    expect(status).toBe(403);
    expect(body.message).toMatch(/sin permisos/i);

    // Verificar que la regla sigue existiendo
    const r = await pool.query(
      `SELECT id FROM scholarship_auto_rules WHERE id = $1`,
      [ruleForDeleteTest],
    );
    expect(r.rows.length).toBe(1);
  });
});
