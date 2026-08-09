/**
 * CF-04 — Integridad referencial en DELETE /api/concepts/:id
 *
 * Problema original: el endpoint borraba el concepto sin verificar
 * si había registros dependientes, causando dos fallos distintos:
 *
 *   1. charges.concept_id es una FK real (nullable, NO ACTION).
 *      Si existía algún charge con concept_id = id, la DB lanzaba
 *      FK violation → el catch la convertía en 500 opaco sin contexto.
 *
 *   2. payment_due_dates.concepto y payment_surcharge_rules.concepto
 *      son campos de texto libre (sin FK) que almacenan el NOMBRE del
 *      concepto. El DELETE procedía sin error, pero esos registros
 *      quedaban huérfanos apuntando a un nombre que ya no existía
 *      (corrupción silenciosa; el JOIN del GET devolvía concepto_nombre null).
 *
 * Fix: pre-verificar los tres conteos en paralelo. Si el total > 0,
 * devolver 409 con desglose antes de ejecutar el DELETE.
 *
 * CDI-01: concepto con charge (FK real) → 409, desglose correcto, fila intacta
 * CDI-02: concepto con payment_due_date (texto) → 409, desglose correcto, fila intacta
 * CDI-03: concepto con surcharge_rule (texto) → 409, desglose correcto, fila intacta
 * CDI-04: concepto con los tres a la vez → 409, total = suma de los tres
 * CDI-05: concepto sin ningún dependiente → 200, fila eliminada (regresión)
 * CDI-06: id que no existe → 404 (no devuelve 500)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool, db } from "../db";
import { concepts, charges, payment_due_dates, payment_surcharge_rules } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import jwt from "jsonwebtoken";

const BASE = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── helpers ───────────────────────────────────────────────────────────────────
async function apiFetch(method: string, path: string, token: string, body?: object) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// ── fixtures ──────────────────────────────────────────────────────────────────
let tenantId: number;
let campusId: number;
let studentId: number;
let tokenAdmin: string;

beforeAll(async () => {
  const ts = Date.now().toString().slice(-6);

  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant CDI ${ts}`, `CDI${ts}`],
  );
  tenantId = (tRow.rows[0] as any).id;

  const cRow = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus CDI ${ts}`, tenantId],
  );
  campusId = (cRow.rows[0] as any).id;

  // usuario administrador_general (CONCEPTS.CONFIGURE garantizado)
  const uRow = await pool.query(
    `INSERT INTO users (campus_id,tenant_id,email,password_hash,name,role)
     VALUES ($1,$2,$3,'x',$4,'administrador_general') RETURNING id`,
    [campusId, tenantId, `admin.cdi.${ts}@test.mx`, `Admin CDI ${ts}`],
  );
  const userId = (uRow.rows[0] as any).id;

  tokenAdmin = jwt.sign(
    { id: userId, role: "administrador_general", campus_id: campusId, tenant_id: tenantId },
    JWT_SECRET,
    { expiresIn: "1h" },
  );

  // estudiante mínimo para poder crear charges
  const sRow = await pool.query(
    `INSERT INTO students (campus_id, tenant_id, nombres, apellido_paterno, grado, grupo, id_referencia, nombre_completo)
     VALUES ($1,$2,'Test','CDI','1','A',$3,'Test CDI') RETURNING id`,
    [campusId, tenantId, `CDI${ts}`],
  );
  studentId = (sRow.rows[0] as any).id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM charges                WHERE campus_id=$1`, [campusId]).catch(() => {});
  await pool.query(`DELETE FROM payment_due_dates      WHERE campus_id=$1`, [campusId]).catch(() => {});
  await pool.query(`DELETE FROM payment_surcharge_rules WHERE campus_id=$1`, [campusId]).catch(() => {});
  await pool.query(`DELETE FROM concepts               WHERE campus_id=$1`, [campusId]).catch(() => {});
  await pool.query(`DELETE FROM students               WHERE campus_id=$1`, [campusId]).catch(() => {});
  await pool.query(`DELETE FROM users                  WHERE campus_id=$1`, [campusId]).catch(() => {});
  await pool.query(`DELETE FROM campuses               WHERE id=$1`,        [campusId]).catch(() => {});
  await pool.query(`DELETE FROM tenants                WHERE id=$1`,        [tenantId]).catch(() => {});
});

// ── helper: crea un concepto limpio para cada test ────────────────────────────
async function crearConcepto(sufijo: string) {
  const [c] = await db.insert(concepts).values({
    campus_id: campusId, tenant_id: tenantId,
    nombre: `Concepto CDI ${sufijo}`, tipo: "mensualidad",
    periodicidad: "mensual", monto_centavos: 10000, iva: false,
  }).returning();
  return c;
}

// ═══════════════════════════════════════════════════════════════════════════════
describe("CF-04 — Integridad referencial en DELETE /api/concepts/:id", () => {

  // ── CDI-01: FK real (charges.concept_id) ─────────────────────────────────
  it("CDI-01: concepto con 1 charge (FK) → 409 con cargos=1, concepto intacto en DB", async () => {
    const c = await crearConcepto("01");

    // charge con concept_id apuntando al concepto
    await db.insert(charges).values({
      campus_id: campusId, tenant_id: tenantId, student_id: studentId,
      concept_id: c.id,
      fecha_emision: "2026-01-01", fecha_vencimiento: "2026-01-31",
      monto_base_centavos: 10000, estado: "pendiente",
    });

    const { status, body } = await apiFetch("DELETE", `/api/concepts/${c.id}`, tokenAdmin);

    expect(status).toBe(409);
    expect((body as any).dependientes.cargos).toBe(1);
    expect((body as any).dependientes.total).toBe(1);
    expect((body as any).message).toMatch(/1 registro/);

    // concepto sigue en DB
    const row = await pool.query(`SELECT id FROM concepts WHERE id=$1`, [c.id]);
    expect(row.rows.length).toBe(1);
  });

  // ── CDI-02: texto libre (payment_due_dates.concepto) ─────────────────────
  it("CDI-02: concepto con 1 payment_due_date (texto) → 409 con fechas_vencimiento=1, sin huérfanos", async () => {
    const c = await crearConcepto("02");

    await db.insert(payment_due_dates).values({
      campus_id: campusId, concepto: c.nombre,
      dia_vencimiento: 10, mes_aplicacion: "todos", activo: true,
    });

    const { status, body } = await apiFetch("DELETE", `/api/concepts/${c.id}`, tokenAdmin);

    expect(status).toBe(409);
    expect((body as any).dependientes.fechas_vencimiento).toBe(1);
    expect((body as any).dependientes.cargos).toBe(0);
    expect((body as any).dependientes.total).toBe(1);

    // payment_due_date NO quedó huérfana (el concepto sigue existiendo)
    const row = await pool.query(`SELECT id FROM concepts WHERE id=$1`, [c.id]);
    expect(row.rows.length).toBe(1);
    const ddRow = await pool.query(
      `SELECT id FROM payment_due_dates WHERE concepto=$1 AND campus_id=$2`,
      [c.nombre, campusId],
    );
    expect(ddRow.rows.length).toBe(1);
  });

  // ── CDI-03: texto libre (payment_surcharge_rules.concepto) ───────────────
  it("CDI-03: concepto con 1 surcharge_rule (texto) → 409 con reglas_recargo=1", async () => {
    const c = await crearConcepto("03");

    await db.insert(payment_surcharge_rules).values({
      campus_id: campusId, concepto: c.nombre,
      nombre: "Recargo CDI-03", tipo: "porcentaje",
      dias_gracia: 0, porcentaje: "5.00",
      aplica_fines_semana: false, aplica_festivos: false, activo: true,
    });

    const { status, body } = await apiFetch("DELETE", `/api/concepts/${c.id}`, tokenAdmin);

    expect(status).toBe(409);
    expect((body as any).dependientes.reglas_recargo).toBe(1);
    expect((body as any).dependientes.cargos).toBe(0);
    expect((body as any).dependientes.fechas_vencimiento).toBe(0);
    expect((body as any).dependientes.total).toBe(1);

    const row = await pool.query(`SELECT id FROM concepts WHERE id=$1`, [c.id]);
    expect(row.rows.length).toBe(1);
  });

  // ── CDI-04: los tres a la vez ─────────────────────────────────────────────
  it("CDI-04: concepto con charge + due_date + surcharge → 409, total = 3", async () => {
    const c = await crearConcepto("04");

    await Promise.all([
      db.insert(charges).values({
        campus_id: campusId, tenant_id: tenantId, student_id: studentId,
        concept_id: c.id,
        fecha_emision: "2026-01-01", fecha_vencimiento: "2026-01-31",
        monto_base_centavos: 10000, estado: "pendiente",
      }),
      db.insert(payment_due_dates).values({
        campus_id: campusId, concepto: c.nombre,
        dia_vencimiento: 15, mes_aplicacion: "todos", activo: true,
      }),
      db.insert(payment_surcharge_rules).values({
        campus_id: campusId, concepto: c.nombre,
        nombre: "Recargo CDI-04", tipo: "porcentaje",
        dias_gracia: 5, porcentaje: "10.00",
        aplica_fines_semana: false, aplica_festivos: false, activo: true,
      }),
    ]);

    const { status, body } = await apiFetch("DELETE", `/api/concepts/${c.id}`, tokenAdmin);

    expect(status).toBe(409);
    expect((body as any).dependientes.cargos).toBe(1);
    expect((body as any).dependientes.fechas_vencimiento).toBe(1);
    expect((body as any).dependientes.reglas_recargo).toBe(1);
    expect((body as any).dependientes.total).toBe(3);
    expect((body as any).message).toMatch(/3 registro/);

    const row = await pool.query(`SELECT id FROM concepts WHERE id=$1`, [c.id]);
    expect(row.rows.length).toBe(1);
  });

  // ── CDI-05: sin dependientes → 200 (regresión) ───────────────────────────
  it("CDI-05: concepto sin dependientes → 200, fila eliminada de DB", async () => {
    const c = await crearConcepto("05");

    const { status, body } = await apiFetch("DELETE", `/api/concepts/${c.id}`, tokenAdmin);

    expect(status).toBe(200);
    expect((body as any).message).toBe("Concepto eliminado");

    const row = await pool.query(`SELECT id FROM concepts WHERE id=$1`, [c.id]);
    expect(row.rows.length).toBe(0);
  });

  // ── CDI-06: id inexistente → 404 ─────────────────────────────────────────
  it("CDI-06: id que no existe → 404, no devuelve 500", async () => {
    const { status } = await apiFetch("DELETE", `/api/concepts/999999999`, tokenAdmin);
    expect(status).toBe(404);
  });
});
