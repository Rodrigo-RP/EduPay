import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db";
import { applyMonthlySurcharges } from "../lib/surcharge-accrual";

let tenantId: number;
let campusId: number;
let studentId: number;

type ScenarioOptions = {
  mode?: "ninguno" | "incremento_fijo" | "compuesto";
  dueDate?: string;
  activationDate?: string | null;
  fixedIncrementCents?: number | null;
  percentage?: number;
  maxCents?: number | null;
  migrated?: boolean;
  duplicateRule?: boolean;
  baseCents?: number;
  existingSurchargeCents?: number;
};

async function createScenario(options: ScenarioOptions = {}) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
  const concept = await pool.query(
    `INSERT INTO concepts
      (tenant_id, campus_id, nombre, tipo, periodicidad, monto_centavos, iva)
     VALUES ($1,$2,$3,'colegiatura','mensual',$4,false)
     RETURNING id`,
    [tenantId, campusId, `Concepto acumulación ${suffix}`, options.baseCents ?? 10_000],
  );
  const conceptId = Number(concept.rows[0].id);
  const rule = await pool.query(
    `INSERT INTO payment_surcharge_rules
      (tenant_id, campus_id, concept_id, concepto, nombre, tipo, dias_gracia,
       porcentaje, monto_maximo_centavos, modo_acumulacion,
       tipo_incremento_mensual, incremento_mensual_centavos, fecha_inicio_acumulacion,
       aplica_fines_semana, aplica_festivos, activo)
     VALUES
      ($1,$2,$3,$4,$5,'porcentaje',0,$6,$7,$8,$9,$10,$11,true,true,true)
     RETURNING id`,
    [
      tenantId,
      campusId,
      conceptId,
      `Concepto acumulación ${suffix}`,
      `Regla acumulación ${suffix}`,
      String(options.percentage ?? 10),
      options.maxCents ?? null,
      options.mode ?? "ninguno",
      options.mode === "incremento_fijo" ? "monto" : null,
      options.mode === "incremento_fijo"
        ? (options.fixedIncrementCents === undefined ? 1_500 : options.fixedIncrementCents)
        : null,
      options.activationDate ?? null,
    ],
  );
  const ruleId = Number(rule.rows[0].id);
  if (options.duplicateRule) {
    await pool.query(
      `INSERT INTO payment_surcharge_rules
        (tenant_id, campus_id, concept_id, concepto, nombre, tipo, dias_gracia,
         porcentaje, modo_acumulacion, aplica_fines_semana, aplica_festivos, activo)
       VALUES ($1,$2,$3,$4,$5,'porcentaje',0,'10.00','ninguno',true,true,true)`,
      [tenantId, campusId, conceptId, `Concepto acumulación ${suffix}`, `Duplicada ${suffix}`],
    );
  }
  const charge = await pool.query(
    `INSERT INTO charges
      (tenant_id, student_id, concept_id, fecha_emision, fecha_vencimiento,
       monto_base_centavos, beca_aplicada, recargo_aplicado_centavos, estado, es_adeudo_migrado)
     VALUES ($1,$2,$3,$4,$5,$6,'0.00',$7,'pendiente',$8)
     RETURNING id`,
    [
      tenantId,
      studentId,
      conceptId,
      "2025-12-01",
      options.dueDate ?? "2026-01-10",
      options.baseCents ?? 10_000,
      options.existingSurchargeCents ?? 0,
      options.migrated ?? false,
    ],
  );
  return { conceptId, ruleId, chargeId: Number(charge.rows[0].id) };
}

async function chargeState(chargeId: number) {
  const charge = await pool.query(
    `SELECT recargo_aplicado_centavos FROM charges WHERE id = $1`,
    [chargeId],
  );
  const periods = await pool.query(
    `SELECT periodo_mes, incremento_centavos, recargo_total_centavos, modo_acumulacion
       FROM charge_surcharge_periods
      WHERE charge_id = $1
      ORDER BY periodo_mes`,
    [chargeId],
  );
  return {
    total: Number(charge.rows[0]?.recargo_aplicado_centavos ?? 0),
    periods: periods.rows.map((row) => ({
      month: row.periodo_mes instanceof Date
        ? `${row.periodo_mes.getFullYear()}-${String(row.periodo_mes.getMonth() + 1).padStart(2, "0")}-${String(row.periodo_mes.getDate()).padStart(2, "0")}`
        : String(row.periodo_mes).slice(0, 10),
      increment: Number(row.incremento_centavos),
      total: Number(row.recargo_total_centavos),
      mode: row.modo_acumulacion,
    })),
  };
}

beforeAll(async () => {
  const suffix = String(Date.now()).slice(-8);
  tenantId = Number((await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant acumulación ${suffix}`, `TAC${suffix}`],
  )).rows[0].id);
  campusId = Number((await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1,$2) RETURNING id`,
    [tenantId, `Campus acumulación ${suffix}`],
  )).rows[0].id);
  studentId = Number((await pool.query(
    `INSERT INTO students
      (tenant_id, campus_id, nombres, apellido_paterno, nombre_completo, status, id_referencia)
     VALUES ($1,$2,'Prueba','Acumulación','Prueba Acumulación','activo',$3)
     RETURNING id`,
    [tenantId, campusId, `SAC${suffix}`],
  )).rows[0].id);
});

afterAll(async () => {
  await pool.query(`DELETE FROM audit_log WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM charges WHERE student_id = $1`, [studentId]);
  await pool.query(`DELETE FROM payment_surcharge_rules WHERE campus_id = $1`, [campusId]);
  await pool.query(`DELETE FROM concepts WHERE campus_id = $1`, [campusId]);
  await pool.query(`DELETE FROM students WHERE id = $1`, [studentId]);
  await pool.query(`DELETE FROM campuses WHERE id = $1`, [campusId]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
});

describe("aplicación mensual de recargos", () => {
  it("preserva modo ninguno y no vuelve a cobrar el mismo cargo", async () => {
    const scenario = await createScenario({ mode: "ninguno" });

    const first = await applyMonthlySurcharges({ campusId, tenantId, asOf: "2026-03-15" });
    const second = await applyMonthlySurcharges({ campusId, tenantId, asOf: "2026-03-15" });
    const state = await chargeState(scenario.chargeId);

    expect(first.actualizados).toBe(1);
    expect(second.actualizados).toBe(0);
    expect(state.total).toBe(1_000);
    expect(state.periods).toEqual([
      expect.objectContaining({ month: "2026-01-01", increment: 1_000, mode: "ninguno" }),
    ]);
  });

  it("aplica un incremento fijo por cada mes de calendario y se recupera después de meses omitidos", async () => {
    const scenario = await createScenario({
      mode: "incremento_fijo",
      activationDate: "2026-01-01",
      fixedIncrementCents: 1_500,
    });

    await applyMonthlySurcharges({ campusId, tenantId, asOf: "2026-02-15" });
    await applyMonthlySurcharges({ campusId, tenantId, asOf: "2026-04-15" });
    const state = await chargeState(scenario.chargeId);

    expect(state.total).toBe(5_500);
    expect(state.periods.map((period) => period.month)).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
    ]);
    expect(state.periods.map((period) => period.increment)).toEqual([1_000, 1_500, 1_500, 1_500]);
  });

  it("respeta el primer incremento del mes posterior aun cuando gracia cruza el mes", async () => {
    const scenario = await createScenario({
      mode: "incremento_fijo",
      dueDate: "2026-01-31",
      activationDate: "2026-01-01",
      fixedIncrementCents: 1_500,
    });

    await applyMonthlySurcharges({ campusId, tenantId, asOf: "2026-02-04" });
    const state = await chargeState(scenario.chargeId);

    expect(state.total).toBe(2_500);
    expect(state.periods.map((period) => period.month)).toEqual(["2026-01-01", "2026-02-01"]);
  });

  it("compone sobre el saldo pendiente real después de un pago parcial", async () => {
    const scenario = await createScenario({
      mode: "compuesto",
      activationDate: "2026-01-01",
      percentage: 10,
    });
    const payment = await pool.query(
      `INSERT INTO payments
        (tenant_id, charge_id, metodo, monto_centavos, estado, referencia_pasarela)
       VALUES ($1,$2,'efectivo',5000,'exitoso',$3)
       RETURNING id`,
      [tenantId, scenario.chargeId, `partial-${scenario.chargeId}`],
    );
    await pool.query(
      `INSERT INTO payment_applications (payment_id, charge_id, amount_centavos)
       VALUES ($1,$2,5000)`,
      [payment.rows[0].id, scenario.chargeId],
    );

    await applyMonthlySurcharges({ campusId, tenantId, asOf: "2026-02-15" });
    const state = await chargeState(scenario.chargeId);

    expect(state.total).toBe(1_050);
    expect(state.periods.map((period) => period.increment)).toEqual([500, 550]);
  });

  it("registra el periodo topado sin exceder el máximo configurado", async () => {
    const scenario = await createScenario({
      mode: "incremento_fijo",
      activationDate: "2026-01-01",
      fixedIncrementCents: 1_500,
      maxCents: 2_000,
    });

    await applyMonthlySurcharges({ campusId, tenantId, asOf: "2026-03-15" });
    const state = await chargeState(scenario.chargeId);

    expect(state.total).toBe(2_000);
    expect(state.periods.map((period) => period.increment)).toEqual([1_000, 1_000, 0]);
  });

  it("no procesa adeudos migrados ni reglas ambiguas", async () => {
    const migrated = await createScenario({ mode: "incremento_fijo", activationDate: "2026-01-01", migrated: true });
    const ambiguous = await createScenario({ mode: "ninguno", duplicateRule: true });

    await applyMonthlySurcharges({ campusId, tenantId, asOf: "2026-03-15" });

    expect((await chargeState(migrated.chargeId)).total).toBe(0);
    expect((await chargeState(migrated.chargeId)).periods).toHaveLength(0);
    expect((await chargeState(ambiguous.chargeId)).total).toBe(0);
    expect((await chargeState(ambiguous.chargeId)).periods).toHaveLength(0);
  });

  it("deja el cargo intacto si una configuración acumulable inválida falla a mitad del cálculo", async () => {
    const scenario = await createScenario({
      mode: "incremento_fijo",
      activationDate: "2026-01-01",
      fixedIncrementCents: null,
    });

    const result = await applyMonthlySurcharges({ campusId, tenantId, asOf: "2026-03-15" });
    const state = await chargeState(scenario.chargeId);

    expect(result.motivos.configuracion_acumulacion_invalida).toBe(1);
    expect(state.total).toBe(0);
    expect(state.periods).toHaveLength(0);
  });

  it("conserva el recargo histórico y sólo agrega periodos desde la activación", async () => {
    const scenario = await createScenario({
      mode: "incremento_fijo",
      activationDate: "2026-03-01",
      fixedIncrementCents: 1_500,
      existingSurchargeCents: 700,
    });

    await applyMonthlySurcharges({ campusId, tenantId, asOf: "2026-03-15" });
    const state = await chargeState(scenario.chargeId);

    expect(state.total).toBe(2_200);
    expect(state.periods).toEqual([
      expect.objectContaining({ month: "2026-03-01", increment: 1_500 }),
    ]);
  });
});