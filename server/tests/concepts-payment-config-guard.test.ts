/**
 * CF-02, CF-03, CF-04, CF-11, CF-12, CF-17
 * Guards de acceso al catálogo de conceptos y configuración de pagos
 *
 * MÓDULOS ELEGIDOS (con justificación del mapa real en permissions.ts):
 *
 *   CF-02/03/04/17  → MODULES.CONCEPTS, ACTIONS.CONFIGURE
 *     Gestión del catálogo de conceptos de cobro (CREATE/UPDATE/DELETE).
 *     "Configurar conceptos en cualquier campus" / "Configurar conceptos del campus".
 *     Roles que lo tienen: super_admin, administrador_general.
 *     administrador_campus tiene solo CONCEPTS.READ; CONCEPTS.CONFIGURE es
 *     una operación de nivel superior (define qué cargos existen, no solo
 *     los administra). Rol positivo en tests: administrador_general.
 *
 *   CF-11 GET       → MODULES.SETTINGS, ACTIONS.READ
 *     Lectura de configuración de fechas de vencimiento. Roles con SETTINGS.READ:
 *     administrador_campus, administrador_general. contador_general no tiene
 *     SETTINGS en su mapa, así que tampoco puede leer esta configuración.
 *     Rol positivo en tests: administrador_campus.
 *
 *   CF-11 POST/PUT/DELETE + CF-12 POST → MODULES.SETTINGS, ACTIONS.CONFIGURE
 *     Mutaciones de fechas de vencimiento y reglas de recargo.
 *     administrador_campus tiene SETTINGS.CONFIGURE con descripción exacta
 *     "Configurar reglas de pago y recargo del campus" (permissions.ts línea 217).
 *     Consistente con los guards ya existentes en el resto de payment-config
 *     (líneas 995, 1044, 1084 de guardian.ts).
 *     Rol positivo en tests: administrador_campus.
 *
 * Estructura de cada CF: bloqueo (rol sin permiso → 403, DB sin efecto) +
 * control positivo (rol con permiso → 2xx, DB con efecto).
 *
 * CFC-01/02   CF-02: POST /api/concepts
 * CFC-03/04   CF-03: PUT  /api/concepts/:id
 * CFC-05/06   CF-04: DELETE /api/concepts/:id
 * CFC-07/08   CF-11 GET:    GET  /api/payment-config/due-dates-complete
 * CFC-09/10   CF-11 POST:   POST /api/payment-config/due-dates-complete
 * CFC-11/12   CF-11 PUT:    PUT  /api/payment-config/due-dates-complete/:id
 * CFC-13/14   CF-11 DELETE: DELETE /api/payment-config/due-dates-complete/:id
 * CFC-15/16   CF-12: POST /api/payment-config/surcharge-rules-complete
 * CFC-17/18   CF-17: POST /api/admin/concepts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool, db } from "../db";
import { concepts, payment_due_dates, payment_surcharge_rules } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import jwt from "jsonwebtoken";

const BASE = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── helpers ──────────────────────────────────────────────────────────────────
async function apiFetch(
  method: string,
  path: string,
  token: string,
  body?: object,
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

// ── fixtures ──────────────────────────────────────────────────────────────────
let tenantId: number;
let campusId: number;

// Roles:
//   tokenAsistente        → bloqueado en todo (no tiene CONCEPTS ni SETTINGS)
//   tokenAdminCampus      → bloqueado en CF-02/03/04/17 (solo CONCEPTS.READ),
//                           permitido en CF-11/CF-12 (SETTINGS.READ + CONFIGURE)
//   tokenAdminGeneral     → permitido en CF-02/03/04/17 (CONCEPTS.CONFIGURE)
let tokenAsistente: string;
let tokenAdminCampus: string;
let tokenAdminGeneral: string;

// IDs inter-test
let conceptoBaseId: number;   // para PUT/DELETE concepts y referencia en due-dates
let conceptoDeleteId: number; // temporal para CFC-05/06
let dueDateBaseId: number;    // para PUT/DELETE due-dates
let dueDateDeleteId: number;  // temporal para CFC-13/14
let surchargeCreatedId: number;

beforeAll(async () => {
  const ts = Date.now().toString().slice(-6);

  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant CFC ${ts}`, `CFC${ts}`],
  );
  tenantId = (tRow.rows[0] as any).id;

  const cRow = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus CFC ${ts}`, tenantId],
  );
  campusId = (cRow.rows[0] as any).id;

  const makeUser = async (role: string) => {
    const r = await pool.query(
      `INSERT INTO users (campus_id,tenant_id,email,password_hash,name,role)
       VALUES ($1,$2,$3,'x',$4,$5) RETURNING id`,
      [campusId, tenantId, `${role}.cfc.${ts}@test.mx`, `User ${role}`, role],
    );
    return (r.rows[0] as any).id as number;
  };

  const idAsistente    = await makeUser("asistente");
  const idAdminCampus  = await makeUser("administrador_campus");
  const idAdminGeneral = await makeUser("administrador_general");

  const makeToken = (id: number, role: string) =>
    jwt.sign(
      { id, role, campus_id: campusId, tenant_id: tenantId },
      JWT_SECRET,
      { expiresIn: "1h" },
    );

  tokenAsistente    = makeToken(idAsistente,    "asistente");
  tokenAdminCampus  = makeToken(idAdminCampus,  "administrador_campus");
  tokenAdminGeneral = makeToken(idAdminGeneral, "administrador_general");

  // Concepto base (para PUT/DELETE y como referencia en due-dates/surcharge)
  const [c] = await db
    .insert(concepts)
    .values({
      campus_id:     campusId,
      tenant_id:     tenantId,
      nombre:        `Concepto Base CFC ${ts}`,
      tipo:          "mensualidad",
      periodicidad:  "mensual",
      monto_centavos: 50000,
      iva:           false,
    })
    .returning();
  conceptoBaseId = c.id;

  // Due date base (para PUT/DELETE)
  const [dd] = await db
    .insert(payment_due_dates)
    .values({
      campus_id:       campusId,
      concepto:        c.nombre,
      dia_vencimiento: 10,
      mes_aplicacion:  "todos",
      activo:          true,
    })
    .returning();
  dueDateBaseId = dd.id;
});

afterAll(async () => {
  if (surchargeCreatedId)
    await pool.query(`DELETE FROM payment_surcharge_rules WHERE id=$1`, [surchargeCreatedId]);
  await pool.query(`DELETE FROM payment_due_dates      WHERE campus_id=$1`, [campusId]);
  await pool.query(`DELETE FROM payment_surcharge_rules WHERE campus_id=$1`, [campusId]);
  await pool.query(`DELETE FROM concepts               WHERE campus_id=$1`, [campusId]);
  await pool.query(`DELETE FROM users                  WHERE campus_id=$1`, [campusId]);
  await pool.query(`DELETE FROM campuses               WHERE id=$1`,        [campusId]);
  await pool.query(`DELETE FROM tenants                WHERE id=$1`,        [tenantId]);
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("CF-02/03/04 — /api/concepts (POST / PUT / DELETE) [CONCEPTS.CONFIGURE]", () => {

  // ── CF-02 ──────────────────────────────────────────────────────────────────
  it("CFC-01: asistente → 403 en POST /api/concepts, sin fila nueva en DB", async () => {
    const antes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM concepts WHERE campus_id=$1`, [campusId],
    );
    const { status } = await apiFetch("POST", "/api/concepts", tokenAsistente, {
      nombre: "NO DEBE EXISTIR", tipo: "mensualidad",
      periodicidad: "mensual", monto_centavos: 1000,
    });
    expect(status).toBe(403);
    const despues = await pool.query(
      `SELECT COUNT(*)::int AS n FROM concepts WHERE campus_id=$1`, [campusId],
    );
    expect((despues.rows[0] as any).n).toBe((antes.rows[0] as any).n);
  });

  it("CFC-02: administrador_general → 201 en POST /api/concepts, concepto en DB", async () => {
    const ts2 = Date.now().toString().slice(-4);
    const { status, body } = await apiFetch("POST", "/api/concepts", tokenAdminGeneral, {
      nombre: `Concepto CF02 ${ts2}`, tipo: "mensualidad",
      periodicidad: "mensual", monto_centavos: 20000,
    });
    expect(status).toBe(201);
    const id = (body as any).id;
    expect(id).toBeGreaterThan(0);
    const row = await pool.query(`SELECT id FROM concepts WHERE id=$1`, [id]);
    expect(row.rows.length).toBe(1);
  });

  // ── CF-03 ──────────────────────────────────────────────────────────────────
  it("CFC-03: asistente → 403 en PUT /api/concepts/:id, nombre intacto en DB", async () => {
    const { status } = await apiFetch(
      "PUT", `/api/concepts/${conceptoBaseId}`, tokenAsistente,
      { nombre: "NOMBRE ALTERADO", monto_centavos: 99999 },
    );
    expect(status).toBe(403);
    const row = await pool.query(`SELECT nombre FROM concepts WHERE id=$1`, [conceptoBaseId]);
    expect((row.rows[0] as any).nombre).not.toBe("NOMBRE ALTERADO");
  });

  it("CFC-04: administrador_general → 200 en PUT /api/concepts/:id, nombre actualizado", async () => {
    const { status } = await apiFetch(
      "PUT", `/api/concepts/${conceptoBaseId}`, tokenAdminGeneral,
      { nombre: "Concepto Actualizado CFC-04", monto_centavos: 55000,
        tipo: "mensualidad", periodicidad: "mensual", iva: false },
    );
    expect(status).toBe(200);
    const row = await pool.query(`SELECT nombre FROM concepts WHERE id=$1`, [conceptoBaseId]);
    expect((row.rows[0] as any).nombre).toBe("Concepto Actualizado CFC-04");
  });

  // ── CF-04 ──────────────────────────────────────────────────────────────────
  it("CFC-05: asistente → 403 en DELETE /api/concepts/:id, fila aún en DB", async () => {
    const [tmp] = await db.insert(concepts).values({
      campus_id: campusId, tenant_id: tenantId,
      nombre: `Temporal CFC05 ${Date.now()}`, tipo: "otro",
      periodicidad: "anual", monto_centavos: 1, iva: false,
    }).returning();
    conceptoDeleteId = tmp.id;

    const { status } = await apiFetch(
      "DELETE", `/api/concepts/${conceptoDeleteId}`, tokenAsistente,
    );
    expect(status).toBe(403);
    const row = await pool.query(`SELECT id FROM concepts WHERE id=$1`, [conceptoDeleteId]);
    expect(row.rows.length).toBe(1);
  });

  it("CFC-06: administrador_general → 200 en DELETE /api/concepts/:id, fila eliminada", async () => {
    const { status } = await apiFetch(
      "DELETE", `/api/concepts/${conceptoDeleteId}`, tokenAdminGeneral,
    );
    expect(status).toBe(200);
    const row = await pool.query(`SELECT id FROM concepts WHERE id=$1`, [conceptoDeleteId]);
    expect(row.rows.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("CF-11 — /api/payment-config/due-dates-complete (GET/POST/PUT/DELETE) [SETTINGS.*]", () => {

  // ── CF-11 GET  (SETTINGS.READ) ─────────────────────────────────────────────
  it("CFC-07: asistente → 403 en GET /api/payment-config/due-dates-complete", async () => {
    const { status } = await apiFetch(
      "GET", "/api/payment-config/due-dates-complete", tokenAsistente,
    );
    expect(status).toBe(403);
  });

  it("CFC-08: administrador_campus (SETTINGS.READ) → 200 en GET /api/payment-config/due-dates-complete", async () => {
    const { status } = await apiFetch(
      "GET", "/api/payment-config/due-dates-complete", tokenAdminCampus,
    );
    expect(status).toBe(200);
  });

  // ── CF-11 POST  (SETTINGS.CONFIGURE) ──────────────────────────────────────
  it("CFC-09: asistente → 403 en POST /api/payment-config/due-dates-complete, sin fila nueva", async () => {
    const antes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM payment_due_dates WHERE campus_id=$1`, [campusId],
    );
    const { status } = await apiFetch(
      "POST", "/api/payment-config/due-dates-complete", tokenAsistente,
      { concepto_id: conceptoBaseId, dia_vencimiento: 15, meses_aplicacion: ["enero"] },
    );
    expect(status).toBe(403);
    const despues = await pool.query(
      `SELECT COUNT(*)::int AS n FROM payment_due_dates WHERE campus_id=$1`, [campusId],
    );
    expect((despues.rows[0] as any).n).toBe((antes.rows[0] as any).n);
  });

  it("CFC-10: administrador_campus → 201 en POST /api/payment-config/due-dates-complete, fila en DB", async () => {
    const { status, body } = await apiFetch(
      "POST", "/api/payment-config/due-dates-complete", tokenAdminCampus,
      { concepto_id: conceptoBaseId, dia_vencimiento: 20,
        meses_aplicacion: ["enero", "febrero", "marzo"], activo: true },
    );
    expect(status).toBe(201);
    const id = (body as any).id;
    expect(id).toBeGreaterThan(0);
    const row = await pool.query(`SELECT id FROM payment_due_dates WHERE id=$1`, [id]);
    expect(row.rows.length).toBe(1);
  });

  // ── CF-11 PUT  (SETTINGS.CONFIGURE) ───────────────────────────────────────
  it("CFC-11: asistente → 403 en PUT /api/payment-config/due-dates-complete/:id, día intacto", async () => {
    const { status } = await apiFetch(
      "PUT", `/api/payment-config/due-dates-complete/${dueDateBaseId}`, tokenAsistente,
      { dia_vencimiento: 99 },
    );
    expect(status).toBe(403);
    const row = await pool.query(
      `SELECT dia_vencimiento FROM payment_due_dates WHERE id=$1`, [dueDateBaseId],
    );
    expect((row.rows[0] as any).dia_vencimiento).not.toBe(99);
  });

  it("CFC-12: administrador_campus → 200 en PUT /api/payment-config/due-dates-complete/:id, día actualizado", async () => {
    const { status } = await apiFetch(
      "PUT", `/api/payment-config/due-dates-complete/${dueDateBaseId}`, tokenAdminCampus,
      { dia_vencimiento: 28 },
    );
    expect(status).toBe(200);
    const row = await pool.query(
      `SELECT dia_vencimiento FROM payment_due_dates WHERE id=$1`, [dueDateBaseId],
    );
    expect((row.rows[0] as any).dia_vencimiento).toBe(28);
  });

  // ── CF-11 DELETE  (SETTINGS.CONFIGURE) ────────────────────────────────────
  it("CFC-13: asistente → 403 en DELETE /api/payment-config/due-dates-complete/:id, fila intacta", async () => {
    const [tmp] = await db.insert(payment_due_dates).values({
      campus_id:       campusId,
      concepto:        "Concepto Actualizado CFC-04",
      dia_vencimiento: 5,
      mes_aplicacion:  "todos",
      activo:          true,
    }).returning();
    dueDateDeleteId = tmp.id;

    const { status } = await apiFetch(
      "DELETE", `/api/payment-config/due-dates-complete/${dueDateDeleteId}`, tokenAsistente,
    );
    expect(status).toBe(403);
    const row = await pool.query(`SELECT id FROM payment_due_dates WHERE id=$1`, [dueDateDeleteId]);
    expect(row.rows.length).toBe(1);
  });

  it("CFC-14: administrador_campus → 200 en DELETE /api/payment-config/due-dates-complete/:id, fila eliminada", async () => {
    const { status } = await apiFetch(
      "DELETE", `/api/payment-config/due-dates-complete/${dueDateDeleteId}`, tokenAdminCampus,
    );
    expect(status).toBe(200);
    const row = await pool.query(`SELECT id FROM payment_due_dates WHERE id=$1`, [dueDateDeleteId]);
    expect(row.rows.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("CF-12 — POST /api/payment-config/surcharge-rules-complete [SETTINGS.CONFIGURE]", () => {

  it("CFC-15: asistente → 403, sin fila nueva en payment_surcharge_rules", async () => {
    const antes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM payment_surcharge_rules WHERE campus_id=$1`, [campusId],
    );
    const { status } = await apiFetch(
      "POST", "/api/payment-config/surcharge-rules-complete", tokenAsistente,
      { concepto_id: conceptoBaseId, dias_gracia: 5, porcentaje_recargo: 10,
        tipo_calculo: "porcentaje_fijo" },
    );
    expect(status).toBe(403);
    const despues = await pool.query(
      `SELECT COUNT(*)::int AS n FROM payment_surcharge_rules WHERE campus_id=$1`, [campusId],
    );
    expect((despues.rows[0] as any).n).toBe((antes.rows[0] as any).n);
  });

  it("CFC-16: administrador_campus → 201, regla persistida en DB", async () => {
    const { status, body } = await apiFetch(
      "POST", "/api/payment-config/surcharge-rules-complete", tokenAdminCampus,
      { concepto_id: conceptoBaseId, dias_gracia: 3,
        porcentaje_recargo: 5, tipo_calculo: "porcentaje_fijo", activo: true },
    );
    expect(status).toBe(201);
    surchargeCreatedId = (body as any).id;
    expect(surchargeCreatedId).toBeGreaterThan(0);
    const row = await pool.query(`SELECT id FROM payment_surcharge_rules WHERE id=$1`, [surchargeCreatedId]);
    expect(row.rows.length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe("CF-17 — POST /api/admin/concepts [CONCEPTS.CONFIGURE]", () => {

  it("CFC-17: asistente → 403, sin fila nueva en concepts", async () => {
    const antes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM concepts WHERE campus_id=$1`, [campusId],
    );
    const { status } = await apiFetch("POST", "/api/admin/concepts", tokenAsistente, {
      nombre: "NO DEBE CREARSE", tipo: "mensualidad",
      periodicidad: "mensual", monto_centavos: 999,
    });
    expect(status).toBe(403);
    const despues = await pool.query(
      `SELECT COUNT(*)::int AS n FROM concepts WHERE campus_id=$1`, [campusId],
    );
    expect((despues.rows[0] as any).n).toBe((antes.rows[0] as any).n);
  });

  it("CFC-18: administrador_general → 201 en POST /api/admin/concepts, concepto en DB", async () => {
    const ts3 = Date.now().toString().slice(-4);
    const { status, body } = await apiFetch("POST", "/api/admin/concepts", tokenAdminGeneral, {
      nombre: `Concepto Admin CF17 ${ts3}`, tipo: "mensualidad",
      periodicidad: "mensual", monto_centavos: 30000, iva: false,
    });
    expect(status).toBe(201);
    const id = (body as any).id;
    expect(id).toBeGreaterThan(0);
    const row = await pool.query(`SELECT id FROM concepts WHERE id=$1`, [id]);
    expect(row.rows.length).toBe(1);
  });
});
