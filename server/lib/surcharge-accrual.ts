import { pool } from "../db";
import { enqueueAuditLog } from "../audit-retry";
import {
  calculateCompoundMonthlyIncrement,
  calculateFixedMonthlyIncrement,
  calculateSurcharge,
  getEligibleSurchargePeriods,
  type SurchargeAccumulationMode,
  type SurchargeRuleForCalculation,
} from "./surcharge-calculator";

type SurchargeRuleRow = SurchargeRuleForCalculation & {
  id: number;
  monto_maximo_centavos?: number | string | null;
};

type ChargeRow = {
  id: number;
  tenant_id: number;
  campus_id: number;
  concept_id: number | null;
  monto_base_centavos: number | string;
  recargo_aplicado_centavos: number | string | null;
  fecha_vencimiento: Date | string;
  estado: string;
  es_adeudo_migrado: boolean | null;
};

export interface ApplyMonthlySurchargesInput {
  campusId: number;
  tenantId: number;
  userId?: number | null;
  asOf?: Date | string;
}

export interface ApplyMonthlySurchargesResult {
  actualizados: number;
  incrementos_aplicados: number;
  cargos_sin_cambio: number;
  cargos_omitidos: number;
  motivos: Record<string, number>;
}

interface ChargeAccrualResult {
  updated: boolean;
  periodCount: number;
  reason?: string;
}

function isoCalendarDate(value: Date | string): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function numberValue(value: number | string | null | undefined): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function amountWithCap(
  rawAmount: number,
  currentTotal: number,
  maxAmount: number,
): { amount: number; capped: boolean } {
  const safeRaw = Math.max(0, Math.round(rawAmount));
  if (maxAmount <= 0) return { amount: safeRaw, capped: false };
  const remaining = Math.max(0, maxAmount - currentTotal);
  return { amount: Math.min(safeRaw, remaining), capped: safeRaw > remaining };
}

function accumulationMode(value: unknown): SurchargeAccumulationMode | null {
  return value === "ninguno" || value === "incremento_fijo" || value === "compuesto"
    ? value
    : null;
}

async function recordSurchargeAudit(
  tenantId: number,
  userId: number | null | undefined,
  chargeId: number,
  metadata: Record<string, unknown>,
): Promise<void> {
  const payload = {
    tenant_id: tenantId,
    user_id: Number.isSafeInteger(userId) ? Number(userId) : null,
    action: "apply_monthly_surcharge",
    entity_type: "charge",
    entity_id: chargeId,
    metadata,
  };

  try {
    await pool.query(
      `INSERT INTO audit_log
        (tenant_id, user_id, action, entity_type, entity_id, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())`,
      [
        payload.tenant_id,
        payload.user_id,
        payload.action,
        payload.entity_type,
        payload.entity_id,
        JSON.stringify(payload.metadata),
      ],
    );
  } catch (error) {
    enqueueAuditLog(payload, error);
  }
}

async function applyForCharge(
  chargeId: number,
  input: Required<Pick<ApplyMonthlySurchargesInput, "campusId" | "tenantId">> & {
    userId?: number | null;
    asOf: string;
  },
): Promise<ChargeAccrualResult> {
  const client = await pool.connect();
  let committedSummary: Record<string, unknown> | null = null;

  try {
    await client.query("BEGIN");

    const lockedCharge = await client.query<ChargeRow>(
      `SELECT c.id, c.tenant_id, s.campus_id, c.concept_id,
              c.monto_base_centavos, c.recargo_aplicado_centavos,
              c.fecha_vencimiento, c.estado, c.es_adeudo_migrado
         FROM charges c
         JOIN students s ON s.id = c.student_id
        WHERE c.id = $1
          AND c.tenant_id = $2
          AND s.campus_id = $3
        FOR UPDATE OF c`,
      [chargeId, input.tenantId, input.campusId],
    );
    const charge = lockedCharge.rows[0];
    if (!charge) {
      await client.query("ROLLBACK");
      return { updated: false, periodCount: 0, reason: "cargo_fuera_de_alcance" };
    }
    if (charge.estado !== "pendiente" || charge.es_adeudo_migrado) {
      await client.query("ROLLBACK");
      return { updated: false, periodCount: 0, reason: "cargo_no_elegible" };
    }
    if (!charge.concept_id || isoCalendarDate(charge.fecha_vencimiento) >= input.asOf) {
      await client.query("ROLLBACK");
      return { updated: false, periodCount: 0, reason: "cargo_no_vencido" };
    }

    const rules = await client.query<SurchargeRuleRow>(
      `SELECT id, tipo, dias_gracia, porcentaje, monto_fijo_centavos,
              reglas_progresivas, aplica_fines_semana, aplica_festivos,
              monto_maximo_centavos, modo_acumulacion, tipo_incremento_mensual,
              incremento_mensual_centavos, incremento_mensual_porcentaje,
              fecha_inicio_acumulacion
         FROM payment_surcharge_rules
        WHERE tenant_id = $1
          AND campus_id = $2
          AND concept_id = $3
          AND activo = true
        FOR UPDATE`,
      [input.tenantId, input.campusId, charge.concept_id],
    );
    if (rules.rowCount !== 1) {
      await client.query("ROLLBACK");
      return { updated: false, periodCount: 0, reason: "regla_ambigua_o_ausente" };
    }
    const rule = rules.rows[0];
    const mode = accumulationMode(rule.modo_acumulacion);
    if (!mode) {
      await client.query("ROLLBACK");
      return { updated: false, periodCount: 0, reason: "modo_acumulacion_invalido" };
    }

    const eligiblePeriods = getEligibleSurchargePeriods(rule, charge.fecha_vencimiento, input.asOf);
    if (eligiblePeriods.length === 0) {
      await client.query("ROLLBACK");
      return { updated: false, periodCount: 0, reason: "dentro_de_gracia" };
    }

    const applied = await client.query<{ periodo_mes: string }>(
      `SELECT periodo_mes
         FROM charge_surcharge_periods
        WHERE charge_id = $1
        FOR UPDATE`,
      [chargeId],
    );
    const appliedPeriods = new Set(applied.rows.map((row) => isoCalendarDate(row.periodo_mes)));

    const paid = await client.query<{ ya_pagado: string | number }>(
      `SELECT COALESCE(SUM(amount_centavos), 0)::bigint AS ya_pagado
         FROM payment_applications
        WHERE charge_id = $1`,
      [chargeId],
    );

    const baseAmount = numberValue(charge.monto_base_centavos);
    const paidAmount = numberValue(paid.rows[0]?.ya_pagado);
    let currentTotal = numberValue(charge.recargo_aplicado_centavos);
    const maxAmount = numberValue(rule.monto_maximo_centavos);
    const hasHistoricalBase = currentTotal > 0 || appliedPeriods.size > 0;
    let basePending = !hasHistoricalBase;
    let insertedPeriods = 0;
    let positiveIncrementCount = 0;

    const periodsToApply = mode === "ninguno"
      ? (hasHistoricalBase ? [] : [eligiblePeriods[0]])
      : eligiblePeriods.filter((period) => !appliedPeriods.has(period));

    for (const period of periodsToApply) {
      let rawAmount = 0;
      let valid = true;
      let source = "monthly_increment";

      if (basePending) {
        const initialBase = Math.max(0, baseAmount - paidAmount);
        rawAmount = calculateSurcharge(rule, initialBase, charge.fecha_vencimiento, input.asOf).amountCentavos;
        source = "initial_surcharge";
        if (rawAmount <= 0) {
          valid = false;
        }
        basePending = false;
      } else if (mode === "incremento_fijo") {
        const increment = calculateFixedMonthlyIncrement(rule, baseAmount);
        rawAmount = increment.amountCentavos;
        valid = increment.valid;
      } else if (mode === "compuesto") {
        const outstanding = Math.max(0, baseAmount + currentTotal - paidAmount);
        const increment = calculateCompoundMonthlyIncrement(rule, outstanding);
        rawAmount = increment.amountCentavos;
        valid = increment.valid;
      } else {
        // modo "ninguno" never reaches this branch.
        valid = false;
      }

      if (!valid) {
        await client.query("ROLLBACK");
        return {
          updated: false,
          periodCount: 0,
          reason: source === "initial_surcharge"
            ? "regla_no_genero_recargo"
            : "configuracion_acumulacion_invalida",
        };
      }

      const capped = amountWithCap(rawAmount, currentTotal, maxAmount);
      const nextTotal = currentTotal + capped.amount;
      const detail = {
        source,
        rule_id: rule.id,
        due_date: isoCalendarDate(charge.fecha_vencimiento),
        calculation_date: input.asOf,
        raw_increment_centavos: rawAmount,
        applied_increment_centavos: capped.amount,
        capped: capped.capped,
        max_late_fee_centavos: maxAmount || null,
        paid_centavos: paidAmount,
        accumulation_mode: mode,
      };

      const inserted = await client.query(
        `INSERT INTO charge_surcharge_periods
          (charge_id, payment_rule_id, tenant_id, campus_id, periodo_mes,
           modo_acumulacion, saldo_base_centavos, recargo_anterior_centavos,
           incremento_centavos, recargo_total_centavos, formula_detalle)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
         ON CONFLICT (charge_id, periodo_mes) DO NOTHING
         RETURNING id`,
        [
          chargeId,
          rule.id,
          input.tenantId,
          input.campusId,
          period,
          mode,
          Math.max(0, baseAmount - paidAmount),
          currentTotal,
          capped.amount,
          nextTotal,
          JSON.stringify(detail),
        ],
      );
      if (inserted.rowCount !== 1) continue;

      insertedPeriods += 1;
      if (capped.amount > 0) positiveIncrementCount += 1;
      currentTotal = nextTotal;
    }

    if (insertedPeriods === 0) {
      await client.query("ROLLBACK");
      return { updated: false, periodCount: 0, reason: "sin_periodos_nuevos" };
    }

    await client.query(
      `UPDATE charges
          SET recargo_aplicado_centavos = $1, updated_at = NOW()
        WHERE id = $2 AND tenant_id = $3`,
      [currentTotal, chargeId, input.tenantId],
    );

    await client.query("COMMIT");
    committedSummary = {
      rule_id: rule.id,
      mode,
      periods_recorded: insertedPeriods,
      positive_increments: positiveIncrementCount,
      recargo_total_centavos: currentTotal,
      calculation_date: input.asOf,
    };
    return {
      updated: positiveIncrementCount > 0,
      periodCount: insertedPeriods,
      reason: positiveIncrementCount > 0 ? undefined : "tope_alcanzado",
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    if (committedSummary) {
      await recordSurchargeAudit(input.tenantId, input.userId, chargeId, committedSummary);
    }
  }
}

/**
 * Applies surcharge periods using the school's calendar date. It is exported
 * for deterministic integration tests; the HTTP endpoint always uses today.
 */
export async function applyMonthlySurcharges(
  input: ApplyMonthlySurchargesInput,
): Promise<ApplyMonthlySurchargesResult> {
  const asOf = isoCalendarDate(input.asOf ?? new Date());
  const candidates = await pool.query<{ id: number }>(
    `WITH active_rule_counts AS (
       SELECT tenant_id, campus_id, concept_id, COUNT(*) AS count
         FROM payment_surcharge_rules
        WHERE activo = true AND concept_id IS NOT NULL
        GROUP BY tenant_id, campus_id, concept_id
     )
     SELECT c.id
       FROM charges c
       JOIN students s ON s.id = c.student_id
       JOIN active_rule_counts counts
         ON counts.tenant_id = c.tenant_id
        AND counts.campus_id = s.campus_id
        AND counts.concept_id = c.concept_id
        AND counts.count = 1
      WHERE s.campus_id = $1
        AND c.tenant_id = $2
        AND c.estado = 'pendiente'
        AND c.fecha_vencimiento < $3::date
        AND NOT COALESCE(c.es_adeudo_migrado, false)
      ORDER BY c.id`,
    [input.campusId, input.tenantId, asOf],
  );

  const result: ApplyMonthlySurchargesResult = {
    actualizados: 0,
    incrementos_aplicados: 0,
    cargos_sin_cambio: 0,
    cargos_omitidos: 0,
    motivos: {},
  };

  for (const candidate of candidates.rows) {
    const chargeResult = await applyForCharge(candidate.id, {
      campusId: input.campusId,
      tenantId: input.tenantId,
      userId: input.userId,
      asOf,
    });
    if (chargeResult.updated) result.actualizados += 1;
    if (chargeResult.periodCount > 0) result.incrementos_aplicados += chargeResult.periodCount;
    if (!chargeResult.updated) result.cargos_sin_cambio += 1;
    if (chargeResult.reason) {
      result.motivos[chargeResult.reason] = (result.motivos[chargeResult.reason] ?? 0) + 1;
      if (chargeResult.reason !== "tope_alcanzado") result.cargos_omitidos += 1;
    }
  }
  return result;
}