import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db";
import {
  DueDateResolutionError,
  resolveConfiguredDueDate,
} from "../lib/due-date-resolver";

let tenantId: number;
let campusId: number;
let monthlyConceptId: number;
let annualConceptId: number;

beforeAll(async () => {
  const suffix = Date.now().toString().slice(-7);
  tenantId = Number((await pool.query(
    `INSERT INTO tenants (nombre_legal,rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant Due ${suffix}`, `DUE${suffix}`],
  )).rows[0].id);
  campusId = Number((await pool.query(
    `INSERT INTO campuses (tenant_id,nombre) VALUES ($1,$2) RETURNING id`,
    [tenantId, `Campus Due ${suffix}`],
  )).rows[0].id);
  monthlyConceptId = Number((await pool.query(
    `INSERT INTO concepts (tenant_id,campus_id,nombre,tipo,periodicidad,monto_centavos)
     VALUES ($1,$2,'Colegiatura Due','colegiatura','mensual',100000) RETURNING id`,
    [tenantId, campusId],
  )).rows[0].id);
  annualConceptId = Number((await pool.query(
    `INSERT INTO concepts (tenant_id,campus_id,nombre,tipo,periodicidad,monto_centavos)
     VALUES ($1,$2,'Inscripción Due','inscripcion','anual',200000) RETURNING id`,
    [tenantId, campusId],
  )).rows[0].id);
  await pool.query(
    `INSERT INTO payment_due_dates
      (tenant_id,campus_id,concept_id,concepto,dia_vencimiento,mes_aplicacion,activo)
     VALUES ($1,$2,$3,'Colegiatura Due',10,'todos',true)`,
    [tenantId, campusId, monthlyConceptId],
  );
  await pool.query(
    `INSERT INTO payment_due_date_periods
      (tenant_id,campus_id,concept_id,ciclo_escolar,periodo_clave,fecha_inicio,fecha_fin,fecha_vencimiento)
     VALUES ($1,$2,$3,'2026-2027','ANUAL','2026-08-01','2027-07-31','2026-08-20')`,
    [tenantId, campusId, annualConceptId],
  );
});

afterAll(async () => {
  await pool.query(`DELETE FROM payment_due_date_periods WHERE tenant_id=$1`, [tenantId]);
  await pool.query(`DELETE FROM payment_due_dates WHERE tenant_id=$1`, [tenantId]);
  await pool.query(`DELETE FROM concepts WHERE tenant_id=$1`, [tenantId]);
  await pool.query(`DELETE FROM campuses WHERE id=$1`, [campusId]);
  await pool.query(`DELETE FROM tenants WHERE id=$1`, [tenantId]);
});

describe("resolveConfiguredDueDate", () => {
  it("resuelve el día mensual configurado", async () => {
    const result = await resolveConfiguredDueDate(pool, {
      tenantId,
      campusId,
      conceptId: monthlyConceptId,
      issueDate: "2026-08-01",
      billingPeriod: { kind: "monthly", month: "2026-08" },
    });
    expect(result).toMatchObject({
      dueDate: "2026-08-10",
      source: "monthly_rule",
      periodKey: "2026-08",
    });
  });

  it("resuelve ANUAL por ciclo y periodo exactos", async () => {
    const result = await resolveConfiguredDueDate(pool, {
      tenantId,
      campusId,
      conceptId: annualConceptId,
      issueDate: "2026-08-01",
      billingPeriod: { kind: "long", schoolCycle: "2026-2027", periodKey: "ANUAL" },
    });
    expect(result).toMatchObject({
      dueDate: "2026-08-20",
      source: "explicit_period",
      periodKey: "ANUAL",
    });
  });

  it("falla explícitamente si falta el periodo anual", async () => {
    await expect(resolveConfiguredDueDate(pool, {
      tenantId,
      campusId,
      conceptId: annualConceptId,
      issueDate: "2027-08-01",
      billingPeriod: { kind: "long", schoolCycle: "2027-2028", periodKey: "ANUAL" },
    })).rejects.toMatchObject<Partial<DueDateResolutionError>>({
      code: "MISSING_CONFIGURATION",
      statusCode: 422,
    });
  });

  it("rechaza usar un periodo mensual para un concepto anual", async () => {
    await expect(resolveConfiguredDueDate(pool, {
      tenantId,
      campusId,
      conceptId: annualConceptId,
      issueDate: "2026-08-01",
      billingPeriod: { kind: "monthly", month: "2026-08" },
    })).rejects.toMatchObject<Partial<DueDateResolutionError>>({
      code: "BILLING_PERIOD_MISMATCH",
    });
  });
});
