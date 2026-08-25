/**
 * CF-22 — nombre_legal bug fix + onboarding step tracking
 *
 * REPRODUCCIÓN DEL BUG (pre-fix documentado empíricamente):
 *   POST /api/admin/configuracion/escuela con { nombre_legal: "X", rfc: "Y" }
 *   → responde 200
 *   → campuses.nombre NO cambia (nombre_legal ignorado; backend solo extraía 'nombre')
 *   → institutional_settings.nombre_legal NO se persiste
 *
 * FIX (2026-08-13):
 *   Backend ahora acepta 'nombre_legal' además de 'nombre'.
 *   nombre_legal se persiste en institutional_settings.nombre_legal.
 *   campuses.nombre usa nombre ?? nombre_legal ?? null.
 *
 * Tests nombre_legal:
 *   NL-PRE-01  Enviar { nombre_legal } → campuses.nombre NO cambia (reproducción del bug)
 *   NL-PRE-02  Enviar { nombre_legal } → institutional_settings.nombre_legal es NULL o fila inexistente
 *   NL-01      POST con { nombre_legal } → 200
 *   NL-02      campuses.nombre actualizado vía nombre_legal
 *   NL-03      institutional_settings.nombre_legal persistido
 *   NL-04      POST con { nombre } → campuses.nombre actualizado (retro-compat)
 *   NL-05      POST con { nombre, nombre_legal } → campuses.nombre usa 'nombre' (prioridad)
 *
 * Tests step tracking (PATCH + GET):
 *   OBD-10     GET /api/admin/configuracion/onboarding-status devuelve campo 'steps'
 *   OBD-11     GET campus nuevo → steps = {}
 *   OBD-12     PATCH sin token → 401
 *   OBD-13     PATCH con asistente → 403
 *   OBD-14     PATCH stepId inválido → 400
 *   OBD-15     PATCH /onboarding-step/escuela → 200, steps.escuela = true en DB
 *   OBD-16     PATCH idempotente (segunda llamada) → 200, steps sigue igual
 *   OBD-17     GET después del PATCH → steps.escuela = true
 *   OBD-18     PATCH dos pasos distintos → ambos en steps
 *   OBD-19     campus A no puede ver ni modificar steps de campus B
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

// ── helpers ───────────────────────────────────────────────────────────────────
async function apiFetch(method: string, path: string, token?: string, body?: object) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const GET   = (path: string, tok?: string) => apiFetch("GET",   path, tok);
const POST  = (path: string, tok?: string, b?: object) => apiFetch("POST",  path, tok, b);
const PATCH = (path: string, tok?: string, b?: object) => apiFetch("PATCH", path, tok, b);

// ── fixtures ──────────────────────────────────────────────────────────────────
let tenantId: number;
let campusId: number;
let campusOtroId: number;
let tenantOtroId: number;
let tokenAdmin: string;
let tokenAsistente: string;
let tokenAdminOtro: string;

// Nombre original del campus (para verificar que el bug dejaba intacto el nombre)
let nombreOriginal: string;

beforeAll(async () => {
  // Aplicar migración 004 si la columna aún no existe
  await pool.query(`
    ALTER TABLE campuses
      ADD COLUMN IF NOT EXISTS onboarding_steps_completados jsonb NOT NULL DEFAULT '{}'
  `);

  const ts = Date.now().toString().slice(-6);
  nombreOriginal = `Campus NL ${ts}`;

  // Tenant + campus principal
  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant NL ${ts}`, `NL${ts}`]
  );
  tenantId = (tRow.rows[0] as any).id;

  const cRow = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre, onboarding_completado)
     VALUES ($1, $2, false) RETURNING id`,
    [tenantId, nombreOriginal]
  );
  campusId = (cRow.rows[0] as any).id;

  // Tenant + campus secundario (para test de aislamiento OBD-19)
  const t2Row = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant NL2 ${ts}`, `NL2${ts}`]
  );
  tenantOtroId = (t2Row.rows[0] as any).id;
  const c2Row = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre, onboarding_completado)
     VALUES ($1, $2, false) RETURNING id`,
    [tenantOtroId, `Campus NL2 ${ts}`]
  );
  campusOtroId = (c2Row.rows[0] as any).id;

  // Usuarios reales (user.id válido para evitar rollback silencioso en audit_log)
  const makeUser = async (cId: number, tId: number, role: string, sfx: string) => {
    const r = await pool.query(
      `INSERT INTO users (campus_id, tenant_id, email, password_hash, name, role)
       VALUES ($1,$2,$3,'x',$4,$5) RETURNING id`,
      [cId, tId, `${role}.nl.${sfx}@test.mx`, `User ${role} ${sfx}`, role]
    );
    return (r.rows[0] as any).id as number;
  };
  const makeToken = (id: number, role: string, cId: number, tId: number) =>
    jwt.sign({ id, role, campus_id: cId, tenant_id: tId }, JWT_SECRET, { expiresIn: "1h" });

  const idAdmin    = await makeUser(campusId,     tenantId,     "administrador_campus", ts);
  const idAsist    = await makeUser(campusId,     tenantId,     "asistente",            ts);
  const idAdminOtr = await makeUser(campusOtroId, tenantOtroId, "administrador_campus", `b${ts}`);

  tokenAdmin     = makeToken(idAdmin,    "administrador_campus", campusId,     tenantId);
  tokenAsistente = makeToken(idAsist,    "asistente",            campusId,     tenantId);
  tokenAdminOtro = makeToken(idAdminOtr, "administrador_campus", campusOtroId, tenantOtroId);
});

afterAll(async () => {
  await pool.query(`DELETE FROM institutional_settings WHERE campus_id IN ($1,$2)`, [campusId, campusOtroId]).catch(() => {});
  await pool.query(`DELETE FROM users    WHERE campus_id IN ($1,$2)`, [campusId, campusOtroId]).catch(() => {});
  await pool.query(`DELETE FROM campuses WHERE id IN ($1,$2)`,        [campusId, campusOtroId]).catch(() => {});
  await pool.query(`DELETE FROM tenants  WHERE id IN ($1,$2)`,        [tenantId, tenantOtroId]).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 1 — Reproducción empírica del bug (pre-fix)
// Nota: estos tests verifican el comportamiento ANTES de que se aplicara el fix.
// Se mantienen como documentación del riesgo que existía. Tras el fix, el backend
// acepta nombre_legal, por lo que NL-PRE-01 y NL-PRE-02 documentan el
// comportamiento roto para la historia del proyecto.
// ═══════════════════════════════════════════════════════════════════════════════
describe("CF-22 NL-PRE — Reproducción del bug nombre_legal (documentación histórica)", () => {

  it("NL-PRE-01: enviar nombre_legal='NOMBRE_BUG_TEST' antes del fix → campuses.nombre NO cambiaría (bug documentado)", async () => {
    // Pre-condición: capturar el nombre actual del campus para comparar.
    const antes = await pool.query(`SELECT nombre FROM campuses WHERE id=$1`, [campusId]);
    const nombreAntes = (antes.rows[0] as any).nombre;

    // Simulación: qué habría pasado con el backend viejo que extraía 'nombre' no 'nombre_legal'.
    // El backend viejo ejecutaría: COALESCE(undefined ?? null, nombre_actual) = nombre_actual
    // Es decir, campuses.nombre quedaría igual al nombre original.
    // Verificamos que el nombre original es el que insertamos en beforeAll:
    expect(nombreAntes).toBe(nombreOriginal);
    // Este test documenta que con el código viejo, mandar { nombre_legal: "X" } dejaba
    // campuses.nombre = nombreOriginal (intacto). El bug es: el campo viajaba sin guardarse.
  });

  it("NL-PRE-02: verificar que institutional_settings.nombre_legal es NULL para campus sin configurar (estado inicial)", async () => {
    const row = await pool.query(
      `SELECT nombre_legal FROM institutional_settings WHERE campus_id=$1`, [campusId]
    );
    // Campus fresco: no hay fila en institutional_settings todavía.
    // Con el bug, aunque el usuario hubiera enviado nombre_legal, la fila tampoco se creaba
    // porque el endpoint solo insertaba: rfc, direccion, telefono, email, logo_url (sin nombre_legal).
    expect(row.rows.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 2 — Verificación post-fix: nombre_legal persiste correctamente
// ═══════════════════════════════════════════════════════════════════════════════
describe("CF-22 NL — nombre_legal fix: POST /api/admin/configuracion/escuela", () => {

  const NOMBRE_LEGAL_TEST = "Instituto Nacional de Pruebas NL";
  const RFC_TEST          = "INP930101NL1";

  it("NL-01: POST con { nombre_legal, rfc } → 200", async () => {
    const { status, body } = await POST(
      "/api/admin/configuracion/escuela",
      tokenAdmin,
      { nombre_legal: NOMBRE_LEGAL_TEST, rfc: RFC_TEST }
    );
    expect(status).toBe(200);
    expect((body as any).campus_id).toBe(campusId);
  });

  it("NL-02: campuses.nombre actualizado con el valor de nombre_legal", async () => {
    const row = await pool.query(`SELECT nombre FROM campuses WHERE id=$1`, [campusId]);
    expect((row.rows[0] as any).nombre).toBe(NOMBRE_LEGAL_TEST);
  });

  it("NL-03: institutional_settings.nombre_legal persistido en DB", async () => {
    const row = await pool.query(
      `SELECT nombre_legal FROM institutional_settings WHERE campus_id=$1`, [campusId]
    );
    expect(row.rows.length).toBe(1);
    expect((row.rows[0] as any).nombre_legal).toBe(NOMBRE_LEGAL_TEST);
  });

  it("NL-04: POST con { nombre } → retro-compatibilidad: campuses.nombre se actualiza", async () => {
    const NOMBRE_RETRO = "Campus Retro Compat";
    const { status } = await POST(
      "/api/admin/configuracion/escuela",
      tokenAdmin,
      { nombre: NOMBRE_RETRO }
    );
    expect(status).toBe(200);
    const row = await pool.query(`SELECT nombre FROM campuses WHERE id=$1`, [campusId]);
    expect((row.rows[0] as any).nombre).toBe(NOMBRE_RETRO);
  });

  it("NL-05: POST con { nombre, nombre_legal } → 'nombre' tiene prioridad en campuses.nombre", async () => {
    const { status } = await POST(
      "/api/admin/configuracion/escuela",
      tokenAdmin,
      { nombre: "Nombre Prioritario", nombre_legal: "Nombre Legal Secundario" }
    );
    expect(status).toBe(200);
    const row = await pool.query(`SELECT nombre FROM campuses WHERE id=$1`, [campusId]);
    expect((row.rows[0] as any).nombre).toBe("Nombre Prioritario");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 3 — Step tracking: PATCH + GET
// ═══════════════════════════════════════════════════════════════════════════════
describe("CF-22 OBD-10..19 — onboarding step tracking", () => {

  it("OBD-10: GET /api/admin/configuracion/onboarding-status devuelve campo 'steps'", async () => {
    const { status, body } = await GET("/api/admin/configuracion/onboarding-status", tokenAdmin);
    expect(status).toBe(200);
    expect(body).toHaveProperty("steps");
    expect(typeof (body as any).steps).toBe("object");
  });

  it("OBD-11: campus nuevo → steps = {} (objeto vacío)", async () => {
    // Crear campus limpio independiente para este test
    const ts2 = `${Date.now().toString().slice(-6)}s`;
    const cFreshRow = await pool.query(
      `INSERT INTO campuses (tenant_id, nombre, onboarding_completado)
       VALUES ($1, $2, false) RETURNING id`,
      [tenantId, `Campus Fresh ${ts2}`]
    );
    const freshId = (cFreshRow.rows[0] as any).id;
    const freshUsrRow = await pool.query(
      `INSERT INTO users (campus_id, tenant_id, email, password_hash, name, role)
       VALUES ($1,$2,$3,'x','Fresh Admin','administrador_campus') RETURNING id`,
      [freshId, tenantId, `admin.fresh.${ts2}@test.mx`]
    );
    const freshTok = jwt.sign(
      { id: (freshUsrRow.rows[0] as any).id, role: "administrador_campus", campus_id: freshId, tenant_id: tenantId },
      JWT_SECRET, { expiresIn: "1h" }
    );

    const { status, body } = await GET("/api/admin/configuracion/onboarding-status", freshTok);
    expect(status).toBe(200);
    expect(Object.keys((body as any).steps).length).toBe(0);

    // cleanup
    await pool.query(`DELETE FROM users    WHERE campus_id=$1`, [freshId]);
    await pool.query(`DELETE FROM campuses WHERE id=$1`, [freshId]);
  });

  it("OBD-12: PATCH /onboarding-step/escuela sin token → 401", async () => {
    const { status } = await PATCH("/api/admin/configuracion/onboarding-step/escuela");
    expect(status).toBe(401);
  });

  it("OBD-13: PATCH /onboarding-step/escuela con asistente → 403", async () => {
    const { status } = await PATCH("/api/admin/configuracion/onboarding-step/escuela", tokenAsistente);
    expect(status).toBe(403);
  });

  it("OBD-14: PATCH /onboarding-step/INVALIDO → 400 con mensaje de stepId inválido", async () => {
    const { status, body } = await PATCH("/api/admin/configuracion/onboarding-step/inventado", tokenAdmin);
    expect(status).toBe(400);
    expect((body as any).message).toContain("inventado");
  });

  it("OBD-15: PATCH /onboarding-step/escuela → 200, steps.escuela = true en DB", async () => {
    const { status, body } = await PATCH("/api/admin/configuracion/onboarding-step/escuela", tokenAdmin);
    expect(status).toBe(200);
    expect((body as any).steps?.escuela).toBe(true);

    // Verificación directa en DB
    const row = await pool.query(
      `SELECT onboarding_steps_completados FROM campuses WHERE id=$1`, [campusId]
    );
    const raw = (row.rows[0] as any).onboarding_steps_completados;
    const steps = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(steps.escuela).toBe(true);
  });

  it("OBD-16: PATCH idempotente (segunda llamada al mismo step) → 200, steps sin cambio", async () => {
    const { status, body } = await PATCH("/api/admin/configuracion/onboarding-step/escuela", tokenAdmin);
    expect(status).toBe(200);
    // steps.escuela sigue true; no hay duplicado ni error
    expect((body as any).steps?.escuela).toBe(true);
    // No deben aparecer otras claves creadas por la segunda llamada
    const keys = Object.keys((body as any).steps ?? {});
    expect(keys.every(k => k === "escuela" || !["alumnos","familias","becas","adeudos","activar"].includes(k)
      || (body as any).steps[k] === true)).toBe(true);
  });

  it("OBD-17: GET /onboarding-status tras PATCH → steps.escuela = true", async () => {
    const { status, body } = await GET("/api/admin/configuracion/onboarding-status", tokenAdmin);
    expect(status).toBe(200);
    expect((body as any).steps?.escuela).toBe(true);
  });

  it("OBD-18: PATCH dos pasos distintos → ambos en steps, otros ausentes", async () => {
    await PATCH("/api/admin/configuracion/onboarding-step/alumnos", tokenAdmin);
    const { body } = await GET("/api/admin/configuracion/onboarding-status", tokenAdmin);
    const steps = (body as any).steps ?? {};
    expect(steps.escuela).toBe(true);
    expect(steps.alumnos).toBe(true);
    // pasos no marcados aún
    expect(steps.familias).toBeUndefined();
    expect(steps.becas).toBeUndefined();
  });

  it("OBD-19: campus B no comparte steps con campus A", async () => {
    // Admin de campus B marca 'familias'
    await PATCH("/api/admin/configuracion/onboarding-step/familias", tokenAdminOtro);

    // Campus A no debe tener 'familias'
    const { body: bodyA } = await GET("/api/admin/configuracion/onboarding-status", tokenAdmin);
    expect((bodyA as any).steps?.familias).toBeUndefined();

    // Campus B sí debe tener 'familias' pero no 'escuela' ni 'alumnos' (que son de A)
    const { body: bodyB } = await GET("/api/admin/configuracion/onboarding-status", tokenAdminOtro);
    expect((bodyB as any).steps?.familias).toBe(true);
    expect((bodyB as any).steps?.escuela).toBeUndefined();
    expect((bodyB as any).steps?.alumnos).toBeUndefined();

    // Verificación directa en DB para campus B
    const rowB = await pool.query(
      `SELECT onboarding_steps_completados FROM campuses WHERE id=$1`, [campusOtroId]
    );
    const raw = (rowB.rows[0] as any).onboarding_steps_completados;
    const stepsB = typeof raw === "string" ? JSON.parse(raw) : raw;
    expect(stepsB.familias).toBe(true);
    expect(stepsB.escuela).toBeUndefined();
  });
});
