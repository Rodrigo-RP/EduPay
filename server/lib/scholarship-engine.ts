import type { Pool, PoolClient } from "@neondatabase/serverless";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type ScholarshipResolution = {
  effectivePercentage: number;
  source: "manual" | "automatico" | "ninguna";
  scholarshipId: number | null;
  manualPercentage: number | null;
  automaticPercentage: number | null;
  automaticScholarshipId: number | null;
  manualPriorityAlert: boolean;
};

export type AutomaticRule = {
  id: number;
  nombre: string;
  descuento_porcentaje: string | number;
  aplica_a: string | null;
  ciclo_escolar: string | null;
  vigencia_inicio: string | null;
  vigencia_fin: string | null;
};

export type AutomaticAssignmentResult = {
  status: "aplicada" | "existente" | "omitida_manual_prioridad" | "omitida_automatica_mayor";
  scholarshipId: number | null;
  chargesUpdated: number;
  chargesExcluded: number;
  manualPercentage: number | null;
  automaticPercentage: number;
  alert: {
    studentId: number;
    manualPercentage: number;
    automaticPercentage: number;
    message: string;
  } | null;
};

export function currentSchoolYear(date = new Date()): string {
  const year = date.getUTCFullYear();
  return date.getUTCMonth() + 1 >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

export function schoolYearDates(cycle: string): { start: string; end: string } {
  const match = /^(\d{4})-(\d{4})$/.exec(cycle);
  if (!match) throw new Error("ciclo_escolar inválido");
  return { start: `${match[1]}-08-01`, end: `${match[2]}-07-31` };
}

function defaultRuleDates(rule: AutomaticRule, cycle: string) {
  const dates = schoolYearDates(cycle);
  return {
    start: rule.vigencia_inicio ?? dates.start,
    end: rule.vigencia_fin ?? dates.end,
  };
}

export async function resolveEffectiveScholarship(
  queryable: Queryable,
  params: {
    studentId: number;
    campusId: number;
    tenantId: number;
    chargeDate?: string;
    conceptType?: string | null;
  },
): Promise<ScholarshipResolution> {
  const noScholarship: ScholarshipResolution = {
    effectivePercentage: 0,
    source: "ninguna",
    scholarshipId: null,
    manualPercentage: null,
    automaticPercentage: null,
    automaticScholarshipId: null,
    manualPriorityAlert: false,
  };

  if ((params.conceptType ?? "").toLowerCase() !== "colegiatura") return noScholarship;

  const chargeDate = params.chargeDate ?? new Date().toISOString().slice(0, 10);
  const result = await queryable.query(
    `SELECT sh.id, sh.porcentaje,
            CASE WHEN saa.id IS NULL THEN 'manual' ELSE 'automatico' END AS source
       FROM scholarships sh
       JOIN students stu ON stu.id = sh.student_id
       LEFT JOIN scholarship_auto_assignments saa
         ON saa.scholarship_id = sh.id
        AND saa.estado = 'aplicada'
      WHERE sh.student_id = $1
        AND sh.tenant_id = $2
        AND stu.campus_id = $3
         AND COALESCE(sh.estado, 'activa') = 'activa'
        AND sh.vigencia_inicio <= $4::date
        AND sh.vigencia_fin >= $4::date
      ORDER BY sh.porcentaje DESC, sh.id ASC`,
    [params.studentId, params.tenantId, params.campusId, chargeDate],
  );

  const rows = result.rows as Array<{ id: number; porcentaje: string | number; source: "manual" | "automatico" }>;
  const manual = rows.find((row) => row.source === "manual") ?? null;
  const automatic = rows.find((row) => row.source === "automatico") ?? null;
  if (!manual && !automatic) return noScholarship;

  const manualPercentage = manual ? Number(manual.porcentaje) : null;
  const automaticPercentage = automatic ? Number(automatic.porcentaje) : null;
  if (manual) {
    return {
      effectivePercentage: manualPercentage!,
      source: "manual",
      scholarshipId: Number(manual.id),
      manualPercentage,
      automaticPercentage,
      automaticScholarshipId: automatic ? Number(automatic.id) : null,
      manualPriorityAlert: automaticPercentage !== null && automaticPercentage > manualPercentage!,
    };
  }

  return {
    effectivePercentage: automaticPercentage!,
    source: "automatico",
    scholarshipId: Number(automatic!.id),
    manualPercentage: null,
    automaticPercentage,
    automaticScholarshipId: Number(automatic!.id),
    manualPriorityAlert: false,
  };
}

export async function applyAutomaticRuleForStudent(
  client: Queryable,
  params: {
    rule: AutomaticRule;
    studentId: number;
    campusId: number;
    tenantId: number;
    cicloEscolar: string;
  },
): Promise<AutomaticAssignmentResult> {
  const rulePercentage = Number(params.rule.descuento_porcentaje);
  const dates = defaultRuleDates(params.rule, params.cicloEscolar);

  // Serialize all automatic decisions for this student inside the transaction.
  await client.query(
    `SELECT pg_advisory_xact_lock(($1::bigint * 1000000) + $2::bigint)`,
    [params.campusId, params.studentId],
  );

  const existing = await client.query(
    `SELECT id, scholarship_id, estado, porcentaje_manual, porcentaje_aplicado
       FROM scholarship_auto_assignments
      WHERE rule_id = $1 AND student_id = $2 AND campus_id = $3
        AND tenant_id = $4 AND ciclo_escolar = $5
      FOR UPDATE`,
    [params.rule.id, params.studentId, params.campusId, params.tenantId, params.cicloEscolar],
  );
  if (existing.rows.length > 0) {
    const row = existing.rows[0] as any;
    const manualPercentage = row.porcentaje_manual === null ? null : Number(row.porcentaje_manual);
    return {
      status: row.estado === "aplicada" ? "existente" : row.estado,
      scholarshipId: row.scholarship_id ? Number(row.scholarship_id) : null,
      chargesUpdated: 0,
      chargesExcluded: 0,
      manualPercentage,
      automaticPercentage: rulePercentage,
      alert: row.estado === "omitida_manual_prioridad" && manualPercentage !== null
        ? {
            studentId: params.studentId,
            manualPercentage,
            automaticPercentage: rulePercentage,
            message: `La beca automática de ${rulePercentage}% supera la beca manual vigente de ${manualPercentage}%.`,
          }
        : null,
    };
  }

  const manualResult = await client.query(
    `SELECT sh.id, sh.porcentaje
       FROM scholarships sh
      WHERE sh.student_id = $1 AND sh.tenant_id = $2
         AND COALESCE(sh.estado, 'activa') = 'activa'
        AND sh.vigencia_inicio <= $4::date
        AND sh.vigencia_fin >= $3::date
        AND NOT EXISTS (
          SELECT 1 FROM scholarship_auto_assignments saa
           WHERE saa.scholarship_id = sh.id AND saa.estado = 'aplicada'
        )
      ORDER BY sh.porcentaje DESC, sh.id ASC
      LIMIT 1`,
    [params.studentId, params.tenantId, dates.start, dates.end],
  );
  const manualPercentage = manualResult.rows.length ? Number(manualResult.rows[0].porcentaje) : null;

  const autoResult = await client.query(
    `SELECT sh.id, sh.porcentaje
       FROM scholarships sh
       JOIN scholarship_auto_assignments saa ON saa.scholarship_id = sh.id
      WHERE saa.student_id = $1 AND saa.tenant_id = $2
        AND saa.campus_id = $3 AND saa.estado = 'aplicada'
         AND COALESCE(sh.estado, 'activa') = 'activa'
        AND sh.vigencia_inicio <= $5::date
        AND sh.vigencia_fin >= $4::date
      ORDER BY sh.porcentaje DESC, sh.id ASC
      LIMIT 1`,
    [params.studentId, params.tenantId, params.campusId, dates.start, dates.end],
  );
  const existingAutoPercentage = autoResult.rows.length ? Number(autoResult.rows[0].porcentaje) : null;

  if (manualPercentage !== null) {
    const status = rulePercentage > manualPercentage
      ? "omitida_manual_prioridad"
      : "omitida_automatica_mayor";
    await client.query(
      `INSERT INTO scholarship_auto_assignments
        (rule_id, student_id, campus_id, tenant_id, ciclo_escolar,
         porcentaje_aplicado, porcentaje_manual, estado, motivo_resultado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        params.rule.id, params.studentId, params.campusId, params.tenantId,
        params.cicloEscolar, rulePercentage, manualPercentage, status,
        "La beca manual vigente conserva prioridad",
      ],
    );
    return {
      status,
      scholarshipId: null,
      chargesUpdated: 0,
      chargesExcluded: 0,
      manualPercentage,
      automaticPercentage: rulePercentage,
      alert: rulePercentage > manualPercentage
        ? {
            studentId: params.studentId,
            manualPercentage,
            automaticPercentage: rulePercentage,
            message: `La beca automática de ${rulePercentage}% supera la beca manual vigente de ${manualPercentage}%.`,
          }
        : null,
    };
  }

  if (existingAutoPercentage !== null && existingAutoPercentage >= rulePercentage) {
    await client.query(
      `INSERT INTO scholarship_auto_assignments
        (rule_id, student_id, campus_id, tenant_id, ciclo_escolar,
         porcentaje_aplicado, estado, motivo_resultado)
       VALUES ($1,$2,$3,$4,$5,$6,'omitida_automatica_mayor',$7)`,
      [
        params.rule.id, params.studentId, params.campusId, params.tenantId,
        params.cicloEscolar, rulePercentage,
        "Ya existe una beca automática igual o mayor para el alumno",
      ],
    );
    return {
      status: "omitida_automatica_mayor",
      scholarshipId: null,
      chargesUpdated: 0,
      chargesExcluded: 0,
      manualPercentage: null,
      automaticPercentage: rulePercentage,
      alert: null,
    };
  }

  const scholarshipResult = await client.query(
    `INSERT INTO scholarships
      (student_id, tenant_id, porcentaje, motivo, vigencia_inicio, vigencia_fin)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id`,
    [
      params.studentId, params.tenantId, rulePercentage,
      `Regla automática: ${params.rule.nombre}`, dates.start, dates.end,
    ],
  );
  const scholarshipId = Number(scholarshipResult.rows[0].id);
  await client.query(
    `INSERT INTO scholarship_auto_assignments
      (rule_id, scholarship_id, student_id, campus_id, tenant_id, ciclo_escolar,
       porcentaje_aplicado, estado, motivo_resultado)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'aplicada','Beca automática aplicada')`,
    [
      params.rule.id, scholarshipId, params.studentId, params.campusId,
      params.tenantId, params.cicloEscolar, rulePercentage,
    ],
  );

  const charges = await client.query(
    `SELECT c.id
       FROM charges c
       JOIN concepts con ON con.id = c.concept_id
      WHERE c.student_id = $1 AND c.tenant_id = $2
        AND LOWER(COALESCE(con.tipo, '')) = 'colegiatura'
        AND c.fecha_emision >= $3::date AND c.fecha_emision <= $4::date
        AND c.estado IN ('pendiente', 'vencido')
        AND c.plan_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM payment_applications pa WHERE pa.charge_id = c.id
        )
      FOR UPDATE OF c`,
    [params.studentId, params.tenantId, dates.start, dates.end],
  );
  const excludedCharges = await client.query(
    `SELECT COUNT(*)::int AS count
       FROM charges c
       LEFT JOIN concepts con ON con.id = c.concept_id
      WHERE c.student_id = $1 AND c.tenant_id = $2
        AND c.fecha_emision >= $3::date AND c.fecha_emision <= $4::date
        AND NOT (
          LOWER(COALESCE(con.tipo, '')) = 'colegiatura'
          AND c.estado IN ('pendiente', 'vencido')
          AND c.plan_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM payment_applications pa WHERE pa.charge_id = c.id
          )
        )`,
    [params.studentId, params.tenantId, dates.start, dates.end],
  );
  for (const charge of charges.rows as Array<{ id: number }>) {
    await client.query(
      `INSERT INTO charge_scholarship_applications
        (charge_id, scholarship_id, tenant_id, effective_percentage, source)
       VALUES ($1,$2,$3,$4,'automatico')
       ON CONFLICT (charge_id, scholarship_id) DO NOTHING`,
      [charge.id, scholarshipId, params.tenantId, rulePercentage],
    );
    await client.query(
      `UPDATE charges
          SET beca_aplicada = $1, updated_at = NOW()
        WHERE id = $2 AND tenant_id = $3
          AND estado IN ('pendiente', 'vencido')
          AND plan_id IS NULL`,
      [rulePercentage.toFixed(2), charge.id, params.tenantId],
    );
  }

  return {
    status: "aplicada",
    scholarshipId,
    chargesUpdated: charges.rows.length,
    chargesExcluded: Number(excludedCharges.rows[0]?.count ?? 0),
    manualPercentage: null,
    automaticPercentage: rulePercentage,
    alert: null,
  };
}