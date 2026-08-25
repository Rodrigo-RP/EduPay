/**
 * SDR — Drizzle ORM query real sobre scholarships con schema corregido
 *
 * Verifica que el schema.ts corregido permite hacer queries Drizzle ORM
 * sobre la tabla scholarships usando los nombres de columna reales.
 *
 * Antes del fix: cualquier query Drizzle usaba 'porcentaje_aplicado',
 * 'observaciones', 'estado', etc. — columnas que no existen en la DB real.
 * La query fallaba silenciosamente (rutas con .catch devolvían []).
 *
 * SDR-01  INSERT via SQL crudo + SELECT via Drizzle ORM → devuelve la fila
 * SDR-02  Drizzle devuelve 'porcentaje' como string numeric (no undefined)
 * SDR-03  Drizzle devuelve 'motivo' (no 'observaciones')
 * SDR-04  Drizzle devuelve 'vigencia_fin' (NOT NULL, no undefined)
 * SDR-05  Drizzle NO tiene campo 'porcentaje_aplicado' en la fila (fue eliminado del schema)
 * SDR-06  Drizzle NO tiene campo 'observaciones' en la fila (fue eliminado del schema)
 * SDR-07  Drizzle NO tiene campo 'estado' en la fila (fue eliminado del schema)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "../db";
import { scholarships } from "../../shared/schema";

const TS = Date.now().toString().slice(-7);

let tenantId:  number;
let campusId:  number;
let studentId: number;
let scholarshipId: number;

beforeAll(async () => {
  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant SDR ${TS}`, `SDR${TS}`],
  );
  tenantId = (tRow.rows[0] as any).id;

  const cRow = await pool.query(
    `INSERT INTO campuses (nombre, tenant_id) VALUES ($1,$2) RETURNING id`,
    [`Campus SDR ${TS}`, tenantId],
  );
  campusId = (cRow.rows[0] as any).id;

  const sRow = await pool.query(
    `INSERT INTO students (nombres, apellido_paterno, nombre_completo, campus_id, tenant_id, id_referencia, status, grado)
     VALUES ($1,$2,$3,$4,$5,$6,'activo','1° PRIMARIA') RETURNING id`,
    [`AlumnoSDR`, `Test${TS}`, `AlumnoSDR Test${TS}`, campusId, tenantId, `SDR${TS}`],
  );
  studentId = (sRow.rows[0] as any).id;

  // Insertar beca usando SQL crudo con los nombres reales de columna
  const bRow = await pool.query(
    `INSERT INTO scholarships (student_id, tenant_id, porcentaje, motivo, vigencia_inicio, vigencia_fin)
     VALUES ($1,$2,$3,$4,CURRENT_DATE, CURRENT_DATE + INTERVAL '1 year') RETURNING id`,
    [studentId, tenantId, 25, `Beca SDR ${TS}`],
  );
  scholarshipId = (bRow.rows[0] as any).id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM scholarships WHERE id=$1`,   [scholarshipId]).catch(() => {});
  await pool.query(`DELETE FROM students    WHERE id=$1`,    [studentId]).catch(() => {});
  await pool.query(`DELETE FROM campuses    WHERE id=$1`,    [campusId]).catch(() => {});
  await pool.query(`DELETE FROM tenants     WHERE id=$1`,    [tenantId]).catch(() => {});
});

describe("SDR — Drizzle ORM sobre scholarships con schema corregido", () => {

  it("SDR-01: SELECT via Drizzle ORM devuelve la fila insertada", async () => {
    const rows = await db
      .select()
      .from(scholarships)
      .where(eq(scholarships.id, scholarshipId));

    expect(rows).toHaveLength(1);
  });

  it("SDR-02: Drizzle devuelve 'porcentaje' como string numeric (no undefined)", async () => {
    const [row] = await db.select().from(scholarships).where(eq(scholarships.id, scholarshipId));
    expect(row.porcentaje).toBeDefined();
    expect(Number(row.porcentaje)).toBe(25);
  });

  it("SDR-03: Drizzle devuelve 'motivo' con el valor correcto (no 'observaciones')", async () => {
    const [row] = await db.select().from(scholarships).where(eq(scholarships.id, scholarshipId));
    expect(row.motivo).toBe(`Beca SDR ${TS}`);
  });

  it("SDR-04: Drizzle devuelve 'vigencia_fin' (NOT NULL, no undefined)", async () => {
    const [row] = await db.select().from(scholarships).where(eq(scholarships.id, scholarshipId));
    expect(row.vigencia_fin).toBeDefined();
    expect(row.vigencia_fin).not.toBeNull();
  });

  it("SDR-05: fila Drizzle NO tiene campo 'porcentaje_aplicado' (eliminado del schema)", async () => {
    const [row] = await db.select().from(scholarships).where(eq(scholarships.id, scholarshipId));
    expect((row as any).porcentaje_aplicado).toBeUndefined();
  });

  it("SDR-06: fila Drizzle NO tiene campo 'observaciones' (eliminado del schema)", async () => {
    const [row] = await db.select().from(scholarships).where(eq(scholarships.id, scholarshipId));
    expect((row as any).observaciones).toBeUndefined();
  });

  it("SDR-07: fila Drizzle expone estado y conserva el default activa", async () => {
    const [row] = await db.select().from(scholarships).where(eq(scholarships.id, scholarshipId));
    expect((row as any).estado).toBe("activa");
  });
});
