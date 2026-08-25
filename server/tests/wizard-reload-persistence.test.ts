/**
 * CF-23 — Persistencia del wizard ante recarga de página
 *
 * Prueba definitiva de que el progreso del wizard NO depende del estado local
 * del navegador (useState). El progreso vive en DB (onboarding_steps_completados).
 *
 * Escenario: admin completa pasos "escuela" y "alumnos" vía PATCH.
 * Al "recargar" (nueva llamada GET /api/admin/configuracion/onboarding-status)
 * el servidor devuelve exactamente esos dos pasos marcados, y el paso
 * derivado correctamente es "familias" (índice 2), no 0.
 *
 * Tests:
 *   WRP-01  Campus nuevo → GET devuelve steps={} y deriveInitialStep→0 (escuela)
 *   WRP-02  PATCH escuela → steps.escuela=true en DB (verificación directa)
 *   WRP-03  PATCH alumnos → steps.alumnos=true en DB (verificación directa)
 *   WRP-04  GET "simulando recarga" → steps contiene escuela+alumnos, nada más
 *   WRP-05  deriveInitialStep(steps) → 2 (familias, primer paso sin completar)
 *   WRP-06  steps.familias está ausente → wizard abriría en familias, no en 0
 *   WRP-07  Aislamiento: campus B no hereda steps de campus A
 *   WRP-08  PATCH con stepId inválido → 400, DB sin cambios
 *   WRP-09  Completar todos los pasos → deriveInitialStep → último paso (activar)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

// Orden canónico de pasos del wizard (debe coincidir con WIZARD_STEPS en configuracion-inicial.tsx)
const WIZARD_STEP_IDS = [
  "escuela", "alumnos", "familias", "becas",
  "adeudos", "validar", "simular", "activar",
] as const;
type StepId = (typeof WIZARD_STEP_IDS)[number];

/** Réplica exacta de la función deriveInitialStep del frontend — debe mantenerse en sync */
function deriveInitialStep(steps: Record<string, boolean>): number {
  const first = WIZARD_STEP_IDS.findIndex((id) => !steps[id]);
  return first === -1 ? WIZARD_STEP_IDS.length - 1 : first;
}

// ── helpers HTTP ──────────────────────────────────────────────────────────────
async function apiFetch(method: string, path: string, token?: string, body?: object) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const GET   = (p: string, tok?: string) => apiFetch("GET",   p, tok);
const PATCH = (p: string, tok?: string) => apiFetch("PATCH", p, tok, {});

// ── fixtures ──────────────────────────────────────────────────────────────────
let tenantId:     number;
let campusId:     number;   // campus principal (escenario principal)
let campusBId:    number;   // campus secundario (aislamiento WRP-07)
let tenantBId:    number;
let tokenAdmin:   string;   // admin del campus principal
let tokenAdminB:  string;   // admin del campus B

beforeAll(async () => {
  // Asegurar que la columna existe (idempotente)
  await pool.query(`
    ALTER TABLE campuses
      ADD COLUMN IF NOT EXISTS onboarding_steps_completados jsonb NOT NULL DEFAULT '{}'
  `);

  const ts = Date.now().toString().slice(-6);

  // Tenant + campus A
  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant WRP ${ts}`, `WRP${ts}`]
  );
  tenantId = (tRow.rows[0] as any).id;

  const cRow = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre, onboarding_completado,
                           onboarding_steps_completados)
     VALUES ($1,$2,false,'{}') RETURNING id`,
    [tenantId, `Campus WRP ${ts}`]
  );
  campusId = (cRow.rows[0] as any).id;

  // Tenant + campus B
  const tBRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant WRP-B ${ts}`, `WRPB${ts}`]
  );
  tenantBId = (tBRow.rows[0] as any).id;

  const cBRow = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre, onboarding_completado,
                           onboarding_steps_completados)
     VALUES ($1,$2,false,'{}') RETURNING id`,
    [tenantBId, `Campus WRP-B ${ts}`]
  );
  campusBId = (cBRow.rows[0] as any).id;

  // Usuarios reales con IDs válidos (evita rollback silencioso en audit_log)
  const mkUser = async (cId: number, tId: number, sfx: string) => {
    const r = await pool.query(
      `INSERT INTO users (campus_id, tenant_id, email, password_hash, name, role)
       VALUES ($1,$2,$3,'x','Admin WRP','administrador_campus') RETURNING id`,
      [cId, tId, `admin.wrp.${sfx}@test.mx`]
    );
    return (r.rows[0] as any).id as number;
  };
  const mkToken = (id: number, cId: number, tId: number) =>
    jwt.sign({ id, role: "administrador_campus", campus_id: cId, tenant_id: tId },
             JWT_SECRET, { expiresIn: "1h" });

  const idA = await mkUser(campusId,  tenantId,  ts);
  const idB = await mkUser(campusBId, tenantBId, `b${ts}`);

  tokenAdmin  = mkToken(idA, campusId,  tenantId);
  tokenAdminB = mkToken(idB, campusBId, tenantBId);
});

afterAll(async () => {
  await pool.query(`DELETE FROM users    WHERE campus_id IN ($1,$2)`,
                   [campusId, campusBId]).catch(() => {});
  await pool.query(`DELETE FROM campuses WHERE id IN ($1,$2)`,
                   [campusId, campusBId]).catch(() => {});
  await pool.query(`DELETE FROM tenants  WHERE id IN ($1,$2)`,
                   [tenantId, tenantBId]).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("CF-23 — Persistencia del wizard ante recarga de página", () => {

  // ── Estado inicial ──────────────────────────────────────────────────────────

  it("WRP-01: campus nuevo → steps={}, deriveInitialStep=0 (escuela)", async () => {
    const { status, body } = await GET("/api/admin/configuracion/onboarding-status", tokenAdmin);
    expect(status).toBe(200);

    const steps = (body as any).steps as Record<string, boolean>;
    expect(Object.keys(steps).length).toBe(0);

    // El frontend abriría en el paso 0 (escuela)
    expect(deriveInitialStep(steps)).toBe(0);
  });

  // ── Completar dos pasos ─────────────────────────────────────────────────────

  it("WRP-02: PATCH escuela → steps.escuela=true en DB (verificación directa)", async () => {
    const { status, body } = await PATCH(
      "/api/admin/configuracion/onboarding-step/escuela", tokenAdmin
    );
    expect(status).toBe(200);
    expect((body as any).steps?.escuela).toBe(true);

    // Verificación directa en PostgreSQL
    const row = await pool.query(
      `SELECT onboarding_steps_completados FROM campuses WHERE id=$1`, [campusId]
    );
    const raw = (row.rows[0] as any).onboarding_steps_completados;
    const dbSteps = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(dbSteps.escuela).toBe(true);
    expect(dbSteps.alumnos).toBeUndefined();   // aún no marcado
  });

  it("WRP-03: PATCH alumnos → steps.alumnos=true en DB (verificación directa)", async () => {
    const { status, body } = await PATCH(
      "/api/admin/configuracion/onboarding-step/alumnos", tokenAdmin
    );
    expect(status).toBe(200);
    expect((body as any).steps?.alumnos).toBe(true);

    // Verificación directa en PostgreSQL
    const row = await pool.query(
      `SELECT onboarding_steps_completados FROM campuses WHERE id=$1`, [campusId]
    );
    const raw = (row.rows[0] as any).onboarding_steps_completados;
    const dbSteps = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(dbSteps.escuela).toBe(true);
    expect(dbSteps.alumnos).toBe(true);
  });

  // ── Simulación de recarga ───────────────────────────────────────────────────

  it("WRP-04: GET 'simulando recarga' → steps tiene exactamente escuela+alumnos", async () => {
    // Esta es la llamada que el frontend hace al montar (componentDidMount / useEffect).
    // Simula que el usuario cerró el browser y volvió — el servidor recuerda el progreso.
    const { status, body } = await GET("/api/admin/configuracion/onboarding-status", tokenAdmin);
    expect(status).toBe(200);

    const steps = (body as any).steps as Record<string, boolean>;
    expect(steps.escuela).toBe(true);
    expect(steps.alumnos).toBe(true);
    // Todos los demás pasos deben estar ausentes (no como false, sino undefined/ausentes)
    for (const id of WIZARD_STEP_IDS) {
      if (id !== "escuela" && id !== "alumnos") {
        expect(steps[id]).toBeUndefined();
      }
    }
  });

  it("WRP-05: deriveInitialStep con {escuela,alumnos} → 2 (familias)", async () => {
    const { body } = await GET("/api/admin/configuracion/onboarding-status", tokenAdmin);
    const steps = (body as any).steps as Record<string, boolean>;

    const derivedIndex = deriveInitialStep(steps);
    expect(derivedIndex).toBe(2);                        // índice de "familias"
    expect(WIZARD_STEP_IDS[derivedIndex]).toBe("familias");
  });

  it("WRP-06: steps.familias ausente → wizard abriría en familias, no en escuela ni alumnos", async () => {
    const { body } = await GET("/api/admin/configuracion/onboarding-status", tokenAdmin);
    const steps = (body as any).steps as Record<string, boolean>;

    // Confirmación explícita: familias no está en el objeto
    expect(Object.prototype.hasOwnProperty.call(steps, "familias")).toBe(false);
    // Confirmación del comportamiento del wizard: sin useState(0), el paso sería familias
    expect(deriveInitialStep(steps)).not.toBe(0);
    expect(deriveInitialStep(steps)).not.toBe(1);
  });

  // ── Aislamiento entre campus ────────────────────────────────────────────────

  it("WRP-07: campus B no hereda los steps de campus A", async () => {
    // Campus B: admin no ha marcado ningún paso
    const { status, body } = await GET("/api/admin/configuracion/onboarding-status", tokenAdminB);
    expect(status).toBe(200);

    const stepsB = (body as any).steps as Record<string, boolean>;
    expect(stepsB.escuela).toBeUndefined();
    expect(stepsB.alumnos).toBeUndefined();
    expect(Object.keys(stepsB).length).toBe(0);

    // Verificación cruzada directa en DB
    const rowA = await pool.query(
      `SELECT onboarding_steps_completados FROM campuses WHERE id=$1`, [campusId]
    );
    const rowB = await pool.query(
      `SELECT onboarding_steps_completados FROM campuses WHERE id=$1`, [campusBId]
    );
    const rawA = (rowA.rows[0] as any).onboarding_steps_completados;
    const rawB = (rowB.rows[0] as any).onboarding_steps_completados;
    const dbA = typeof rawA === "string" ? JSON.parse(rawA) : rawA;
    const dbB = typeof rawB === "string" ? JSON.parse(rawB) : rawB;

    expect(Object.keys(dbA).length).toBeGreaterThanOrEqual(2); // escuela + alumnos
    expect(Object.keys(dbB).length).toBe(0);                   // campus B intacto
  });

  // ── Guards de validación ────────────────────────────────────────────────────

  it("WRP-08: PATCH stepId inválido → 400, DB sin cambios para campus A", async () => {
    const before = await pool.query(
      `SELECT onboarding_steps_completados FROM campuses WHERE id=$1`, [campusId]
    );
    const rawBefore = (before.rows[0] as any).onboarding_steps_completados;
    const stepsBefore = typeof rawBefore === "string" ? JSON.parse(rawBefore) : rawBefore;

    const { status } = await PATCH(
      "/api/admin/configuracion/onboarding-step/paso_que_no_existe", tokenAdmin
    );
    expect(status).toBe(400);

    const after = await pool.query(
      `SELECT onboarding_steps_completados FROM campuses WHERE id=$1`, [campusId]
    );
    const rawAfter = (after.rows[0] as any).onboarding_steps_completados;
    const stepsAfter = typeof rawAfter === "string" ? JSON.parse(rawAfter) : rawAfter;

    // DB no cambió
    expect(JSON.stringify(stepsAfter)).toBe(JSON.stringify(stepsBefore));
  });

  // ── Completar todos los pasos ───────────────────────────────────────────────

  it("WRP-09: completar todos los pasos → deriveInitialStep apunta al último (activar)", async () => {
    // Marcar los 6 pasos restantes (escuela y alumnos ya están)
    for (const id of ["familias", "becas", "adeudos", "validar", "simular", "activar"] as StepId[]) {
      const { status } = await PATCH(
        `/api/admin/configuracion/onboarding-step/${id}`, tokenAdmin
      );
      expect(status).toBe(200);
    }

    const { body } = await GET("/api/admin/configuracion/onboarding-status", tokenAdmin);
    const steps = (body as any).steps as Record<string, boolean>;

    // Todos los pasos marcados
    for (const id of WIZARD_STEP_IDS) {
      expect(steps[id]).toBe(true);
    }

    // deriveInitialStep cuando todo está completo → último índice (activar = 7)
    const derived = deriveInitialStep(steps);
    expect(derived).toBe(WIZARD_STEP_IDS.length - 1);
    expect(WIZARD_STEP_IDS[derived]).toBe("activar");

    // Verificación directa en DB: todos los pasos están en el objeto jsonb
    const row = await pool.query(
      `SELECT onboarding_steps_completados FROM campuses WHERE id=$1`, [campusId]
    );
    const raw = (row.rows[0] as any).onboarding_steps_completados;
    const dbSteps = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(Object.keys(dbSteps).length).toBe(WIZARD_STEP_IDS.length);
    for (const id of WIZARD_STEP_IDS) {
      expect(dbSteps[id]).toBe(true);
    }
  });
});
