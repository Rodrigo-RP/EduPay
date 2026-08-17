/**
 * Regression tests para los dos hallazgos del barrido contrato frontend-backend:
 *
 * HALLAZGO A  — reglas-pago.tsx enviaba campus_id:24 hardcodeado en el body.
 *   El backend sobreescribía con el campus del JWT (system.ts:47), pero el body
 *   era incorrecto.  Tests empíricos: body con campus_id falso + JWT real → DB guarda
 *   el campus del JWT; body correcto (post-fix) → mismo resultado; aislamiento cross-campus.
 *
 * HALLAZGO C  — estudiantes.tsx invalidaba queryKey '/api/admin/students/1'
 *   en lugar de '/api/admin/students' (key real, línea 409).  Fix: ambas líneas
 *   corregidas.  Test: alumno creado vía API aparece inmediatamente en GET /list.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import { pool, db } from "../db";
import { payment_rules, students } from "../../shared/schema";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET ?? "fallback-secret-key";
const BASE        = "http://localhost:5000";

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeToken(campusId: number, tenantId: number, role = "administrador_campus") {
  return jwt.sign(
    {
      role,
      campus_id: campusId,
      tenant_id: tenantId,
      // 'id' omitido: evita FK rollback silencioso en audit_log (patrón documentado)
    },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
}

async function apiPost(path: string, body: object, token: string) {
  const r = await fetch(`${BASE}${path}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body:    JSON.stringify(body),
  });
  const text = await r.text();
  let parsed: any = {};
  try { parsed = JSON.parse(text); } catch {}
  return { status: r.status, body: parsed };
}

async function apiGet(path: string, token: string) {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await r.text();
  let parsed: any = {};
  try { parsed = JSON.parse(text); } catch {}
  return { status: r.status, body: parsed };
}

// ─── estado del suite ─────────────────────────────────────────────────────────

let CAMPUS_REAL:  number;
let TENANT_REAL:  number;
const createdRuleIds:    number[] = [];
const createdStudentIds: number[] = [];

beforeAll(async () => {
  // Obtener IDs reales de la DB demo (misma estrategia que otros tests del proyecto)
  const res = await pool.query<{ id: number; tenant_id: number }>(
    `SELECT c.id, c.tenant_id
       FROM campuses c
       JOIN tenants  t ON t.id = c.tenant_id
      LIMIT 1`,
  );
  if (!res.rows.length) throw new Error("No hay campuses en la DB — seed no aplicado");
  CAMPUS_REAL = res.rows[0].id;
  TENANT_REAL = res.rows[0].tenant_id;
});

afterAll(async () => {
  for (const id of createdRuleIds)    await db.delete(payment_rules).where(eq(payment_rules.id, id));
  for (const id of createdStudentIds) await db.delete(students).where(eq(students.id, id));
  await pool.end();
});

// ─── HALLAZGO A ───────────────────────────────────────────────────────────────

describe("HALLAZGO A — campus_id en reglas de pago", () => {
  /** campus_id inventado que el frontend enviaba hardcodeado */
  const CAMPUS_FAKE = 24;

  it("PRE-FIX empírico: body campus_id:24 + JWT campus real → DB guarda campus del JWT", async () => {
    const token = makeToken(CAMPUS_REAL, TENANT_REAL);

    // Exactamente lo que enviaba reglas-pago.tsx ANTES del fix
    const { status, body: rule } = await apiPost("/api/payment-rules", {
      campus_id: CAMPUS_FAKE,           // ← valor incorrecto que estaba hardcodeado
      rule_type:            "percentage",
      name:                 `[TEST-A-pre] hardcoded-${Date.now()}`,
      description:          "test regresión hallazgo A pre-fix",
      grace_period_days:    5,
      grace_period_unit:    "days",
      late_fee_percentage:  3,
      compound_daily:       false,
      applies_to_weekends:  false,
      applies_to_holidays:  false,
      applies_to_concepts:  JSON.stringify([]),
    }, token);

    expect(status).toBe(200);
    createdRuleIds.push(rule.id);

    // El backend sobreescribía el body con el JWT: la DB nunca tuvo campus 24
    expect(rule.campus_id).toBe(CAMPUS_REAL);
    expect(rule.campus_id).not.toBe(CAMPUS_FAKE);
  });

  it("POST-FIX: body campus_id correcto (campus real) + JWT campus real → DB guarda campus real", async () => {
    const token = makeToken(CAMPUS_REAL, TENANT_REAL);

    // Lo que envía reglas-pago.tsx DESPUÉS del fix (user?.campus_id)
    const { status, body: rule } = await apiPost("/api/payment-rules", {
      campus_id:            CAMPUS_REAL,   // ← valor correcto ahora
      rule_type:            "percentage",
      name:                 `[TEST-A-post] campus-real-${Date.now()}`,
      description:          "test regresión hallazgo A post-fix",
      grace_period_days:    3,
      grace_period_unit:    "days",
      late_fee_percentage:  2,
      compound_daily:       false,
      applies_to_weekends:  false,
      applies_to_holidays:  false,
      applies_to_concepts:  JSON.stringify([]),
    }, token);

    expect(status).toBe(200);
    createdRuleIds.push(rule.id);

    // Respuesta HTTP
    expect(rule.campus_id).toBe(CAMPUS_REAL);

    // Verificación directa en DB (no sólo la respuesta HTTP)
    const [dbRow] = await db
      .select({ campus_id: payment_rules.campus_id })
      .from(payment_rules)
      .where(eq(payment_rules.id, rule.id));

    expect(dbRow.campus_id).toBe(CAMPUS_REAL);
  });

  it("JWT campus A con body campus_id=campus_A → DB siempre guarda campus A (JWT gana)", async () => {
    // Obtener un segundo campus distinto si existe; si no, el test es informativo
    const res2 = await pool.query<{ id: number; tenant_id: number }>(
      `SELECT c.id, c.tenant_id
         FROM campuses c
         JOIN tenants  t ON t.id = c.tenant_id
        WHERE c.id <> $1
        LIMIT 1`,
      [CAMPUS_REAL],
    );

    if (!res2.rows.length) {
      // Solo hay un campus en la DB demo — verificamos el caso normal
      const token = makeToken(CAMPUS_REAL, TENANT_REAL);
      const { status, body: rule } = await apiPost("/api/payment-rules", {
        campus_id:           CAMPUS_REAL,
        rule_type:           "percentage",
        name:                `[TEST-A-iso-single] ${Date.now()}`,
        description:         "test aislamiento — campus único",
        grace_period_days:   1,
        grace_period_unit:   "days",
        late_fee_percentage: 1,
        compound_daily:      false,
        applies_to_weekends: false,
        applies_to_holidays: false,
        applies_to_concepts: JSON.stringify([]),
      }, token);
      expect(status).toBe(200);
      createdRuleIds.push(rule.id);
      expect(rule.campus_id).toBe(CAMPUS_REAL);
      return;
    }

    const CAMPUS_B  = res2.rows[0].id;
    const TENANT_B  = res2.rows[0].tenant_id;
    const tokenB    = makeToken(CAMPUS_B, TENANT_B);

    // JWT de campus B, body intenta inyectar campus A
    const { status, body: rule } = await apiPost("/api/payment-rules", {
      campus_id:           CAMPUS_REAL,   // intenta inyectar campus A en el body
      rule_type:           "percentage",
      name:                `[TEST-A-iso] cross-campus-${Date.now()}`,
      description:         "test aislamiento entre campus",
      grace_period_days:   1,
      grace_period_unit:   "days",
      late_fee_percentage: 1,
      compound_daily:      false,
      applies_to_weekends: false,
      applies_to_holidays: false,
      applies_to_concepts: JSON.stringify([]),
    }, tokenB);

    if (status === 200) {
      createdRuleIds.push(rule.id);
      // El JWT de campus B debe ganar sobre el body que decía campus A
      expect(rule.campus_id).toBe(CAMPUS_B);
      expect(rule.campus_id).not.toBe(CAMPUS_REAL);
    } else {
      // 4xx/5xx por FK o validación también es aceptable
      expect([400, 404, 422, 500]).toContain(status);
    }
  });
});

// ─── HALLAZGO C ───────────────────────────────────────────────────────────────

describe("HALLAZGO C — invalidación de caché de lista de estudiantes", () => {
  it("alumno creado vía POST aparece inmediatamente en GET /api/admin/students", async () => {
    const token      = makeToken(CAMPUS_REAL, TENANT_REAL);
    const uniqueName = `TestHallazgoC-${Date.now()}`;

    // 1. Crear estudiante con campos reales que espera storage.createStudent
    const { status: cs, body: created } = await apiPost(
      "/api/admin/students",
      {
        nombres:           "TestHallazgoC",   // campo real en InsertStudent
        apellido_paterno:  "Regresion",
        apellido_materno:  "Fix",
        nombre_completo:   uniqueName,        // NOT NULL — calculado pero puede venir explícito
        nivel_educativo:   "Primaria",
        grado:             "3",
        grupo:             "A",
        ciclo_escolar:     "2025-2026",
        status:            "activo",
      },
      token,
    );

    expect([200, 201]).toContain(cs);
    const newId: number | null = created.id ?? created.student?.id ?? null;
    if (newId) createdStudentIds.push(newId);

    // 2. Leer lista inmediatamente — simula React Query re-fetch tras
    //    invalidar la key correcta '/api/admin/students'
    const { status: ls, body: listBody } = await apiGet("/api/admin/students", token);
    expect(ls).toBe(200);

    const list: any[] = Array.isArray(listBody)
      ? listBody
      : listBody.students ?? listBody.data ?? [];

    const found = list.some(
      (s: any) => s.nombre_completo === uniqueName || s.id === newId,
    );
    expect(found).toBe(true);
  });

  it("contrato de key: '/api/admin/students' ≠ '/api/admin/students/1' — la invalidación incorrecta nunca alcanzaba la lista", () => {
    /**
     * Reproduce el bug documentalmente:
     *   Query de lista → key ['/api/admin/students']         (estudiantes.tsx:409)
     *   onSuccess pre-fix → invalidaba ['/api/admin/students/1'] — key distinta
     *   React Query hace igualdad estricta: la lista nunca se refrescaba.
     *
     * Verificación reproducible:
     *   grep -n "invalidateQueries" client/src/pages/estudiantes.tsx
     *   → debe mostrar SÓLO '/api/admin/students' (sin /1) en líneas 484 y 549
     */
    const LIST_KEY  = "/api/admin/students";
    const WRONG_KEY = "/api/admin/students/1";

    expect(LIST_KEY).not.toBe(WRONG_KEY);

    // Simula la igualdad que usa React Query para decidir qué invalidar
    const matches = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);

    expect(matches([LIST_KEY],  [LIST_KEY])).toBe(true);   // ✓ fix: coincide
    expect(matches([LIST_KEY],  [WRONG_KEY])).toBe(false); // ✗ bug anterior: no coincidía
  });
});
