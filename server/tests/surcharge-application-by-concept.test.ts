import { afterAll, beforeAll, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { pool } from "../db";
import { JWT_SECRET } from "../routes/shared";

const BASE = "http://localhost:5000";

let tenantId: number;
let campusId: number;
let studentId: number;
let percentageChargeId: number;
let inactiveChargeId: number;
let progressiveChargeId: number;
let noRuleChargeId: number;
let ruleIds: number[] = [];
let conceptIds: number[] = [];
let token: string;

async function chargeSurcharge(id: number): Promise<number> {
  const result = await pool.query(
    `SELECT recargo_aplicado_centavos FROM charges WHERE id = $1`,
    [id],
  );
  return Number(result.rows[0]?.recargo_aplicado_centavos ?? 0);
}

beforeAll(async () => {
  const suffix = String(Date.now()).slice(-8);
  tenantId = Number((await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1, $2) RETURNING id`,
    [`Tenant recargos ${suffix}`, `TRC${suffix}`],
  )).rows[0].id);
  campusId = Number((await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1, $2) RETURNING id`,
    [tenantId, `Campus recargos ${suffix}`],
  )).rows[0].id);
  studentId = Number((await pool.query(
    `INSERT INTO students (tenant_id, campus_id, nombres, apellido_paterno, nombre_completo, status, id_referencia)
     VALUES ($1, $2, 'Prueba', 'Recargos', 'Prueba Recargos', 'activo', $3) RETURNING id`,
    [tenantId, campusId, `SRC${suffix}`],
  )).rows[0].id);

  const concepts = await pool.query(
    `INSERT INTO concepts (tenant_id, campus_id, nombre, tipo, periodicidad, monto_centavos, iva)
     VALUES
       ($1, $2, 'Porcentaje ${suffix}', 'colegiatura', 'mensual', 10000, false),
       ($1, $2, 'Inactiva ${suffix}', 'colegiatura', 'mensual', 10000, false),
       ($1, $2, 'Progresiva ${suffix}', 'colegiatura', 'mensual', 20000, false),
       ($1, $2, 'Sin regla ${suffix}', 'colegiatura', 'mensual', 10000, false)
     RETURNING id, nombre`,
    [tenantId, campusId],
  );
  conceptIds = concepts.rows.map((concept) => Number(concept.id));

  const rules = await pool.query(
    `INSERT INTO payment_surcharge_rules
       (tenant_id, campus_id, concept_id, concepto, nombre, tipo, dias_gracia, porcentaje,
        reglas_progresivas, monto_maximo_centavos, aplica_fines_semana, aplica_festivos, activo)
     VALUES
       ($1, $2, $3, $4, 'Porcentaje', 'porcentaje', 0, '10.00', NULL, NULL, true, true, true),
       ($1, $2, $5, $6, 'Inactiva', 'fijo', 0, NULL, NULL, NULL, true, true, false),
       ($1, $2, $7, $8, 'Progresiva', 'progresivo', 0, NULL,
        '[{"dias_desde":1,"dias_hasta":30,"porcentaje":5}]', 700, true, true, true)
     RETURNING id`,
    [
      tenantId, campusId,
      conceptIds[0], concepts.rows[0].nombre,
      conceptIds[1], concepts.rows[1].nombre,
      conceptIds[2], concepts.rows[2].nombre,
    ],
  );
  ruleIds = rules.rows.map((rule) => Number(rule.id));

  const charges = await pool.query(
    `INSERT INTO charges
       (tenant_id, student_id, concept_id, fecha_emision, fecha_vencimiento,
        monto_base_centavos, beca_aplicada, recargo_aplicado_centavos, estado, es_adeudo_migrado)
     VALUES
       ($1, $2, $3, CURRENT_DATE - 30, CURRENT_DATE - 10, 10000, '0.00', 0, 'pendiente', false),
       ($1, $2, $4, CURRENT_DATE - 30, CURRENT_DATE - 10, 10000, '0.00', 0, 'pendiente', false),
       ($1, $2, $5, CURRENT_DATE - 30, CURRENT_DATE - 10, 20000, '0.00', 0, 'pendiente', false),
       ($1, $2, $6, CURRENT_DATE - 30, CURRENT_DATE - 10, 10000, '0.00', 0, 'pendiente', false)
     RETURNING id`,
    [tenantId, studentId, ...conceptIds],
  );
  [percentageChargeId, inactiveChargeId, progressiveChargeId, noRuleChargeId] =
    charges.rows.map((charge) => Number(charge.id));

  token = jwt.sign(
    { role: "administrador_campus", campus_id: campusId, tenant_id: tenantId },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
});

afterAll(async () => {
  await pool.query(`DELETE FROM payment_surcharge_rules WHERE id = ANY($1::int[])`, [ruleIds]);
  await pool.query(
    `DELETE FROM charges WHERE id = ANY($1::int[])`,
    [[percentageChargeId, inactiveChargeId, progressiveChargeId, noRuleChargeId]],
  );
  await pool.query(`DELETE FROM students WHERE id = $1`, [studentId]);
  await pool.query(`DELETE FROM concepts WHERE id = ANY($1::int[])`, [conceptIds]);
  await pool.query(`DELETE FROM campuses WHERE id = $1`, [campusId]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
});

describe("POST /api/admin/cargos/aplicar-recargos por concepto", () => {
  it("sólo aplica la regla activa del concepto correcto y respeta el tope progresivo", async () => {
    const response = await fetch(`${BASE}/api/admin/cargos/aplicar-recargos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.actualizados).toBe(2);
    expect(await chargeSurcharge(percentageChargeId)).toBe(1_000);
    expect(await chargeSurcharge(inactiveChargeId)).toBe(0);
    expect(await chargeSurcharge(progressiveChargeId)).toBe(700);
    expect(await chargeSurcharge(noRuleChargeId)).toBe(0);
  });
});