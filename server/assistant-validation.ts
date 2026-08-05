/**
 * server/assistant-validation.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Motor de sondas SQL del asistente EduPay.
 *
 * Cada sonda prueba exactamente las tablas y columnas que usa una query del
 * asistente. Lo hace con `WHERE false LIMIT 0` — el planificador de PostgreSQL
 * valida la sintaxis y la existencia de columnas SIN cargar ninguna fila.
 *
 * Uso programático (desde el asistente):
 *   const report = await runAllProbes(ctx);
 *
 * Uso CLI (desde npm run validate:assistant):
 *   tsx scripts/validate-assistant-queries.ts
 *
 * ¿Por qué no basta con unit tests?
 * Porque el schema TypeScript puede divergir de la DB real (ocurrió con
 * scholarships: porcentaje_aplicado no existía, concepto no existía, etc.).
 * Las sondas prueban la DB LIVE, no el código.
 */

import { pool } from "./db";

export interface ProbeResult {
  name: string;
  description: string;
  ok: boolean;
  error?: string;
  durationMs: number;
}

export interface ValidationReport {
  totalProbes: number;
  passed: number;
  failed: number;
  durationMs: number;
  results: ProbeResult[];
}

// ── Contexto mínimo para los parámetros ──────────────────────────────────────

export interface ProbeContext {
  campusId: number;
  tenantId: number;
}

interface Probe {
  name: string;
  description: string;
  /** SQL que se ejecuta; debe tener WHERE false o similar para no leer datos */
  sql: string;
  params: (ctx: ProbeContext) => any[];
}

// ── Registro de sondas ────────────────────────────────────────────────────────
// Una sonda por cada query en assistant-actions.ts.
// Si la sonda falla, el handler correspondiente también fallará en producción.

const PROBES: Probe[] = [

  // ── Alumnos ────────────────────────────────────────────────────────────────
  {
    name: "students:contar",
    description: "students — campus_id, status (queryContar alumnos)",
    sql: `SELECT campus_id, status FROM students WHERE false LIMIT 0`,
    params: () => [],
  },
  {
    name: "students:buscar",
    description: "students — nombre_completo, grado, grupo, status, nivel_escolar (queryBuscarAlumno)",
    sql: `SELECT nombre_completo, grado, grupo, status, nivel_escolar FROM students WHERE false LIMIT 0`,
    params: () => [],
  },

  // ── Cargos ─────────────────────────────────────────────────────────────────
  {
    name: "charges:monto_base",
    description: "charges — monto_base_centavos, estado, student_id (queryResumenFinanciero / queryBuscarAlumno)",
    sql: `SELECT student_id, monto_base_centavos, estado, fecha_vencimiento FROM charges WHERE false LIMIT 0`,
    params: () => [],
  },
  {
    name: "charges:concepto_join",
    description: "charges JOIN concepts — nombre del concepto (queryCargosAlumno)",
    sql: `SELECT c.student_id, c.monto_base_centavos, c.estado, c.fecha_vencimiento,
                 co.nombre AS concepto
          FROM charges c
          LEFT JOIN concepts co ON co.id = c.concept_id
          WHERE false LIMIT 0`,
    params: () => [],
  },

  // ── Pagos ──────────────────────────────────────────────────────────────────
  {
    name: "payments:monto",
    description: "payments — monto_centavos, charge_id (queryContar pagos)",
    sql: `SELECT p.monto_centavos, p.charge_id
          FROM payments p
          WHERE false LIMIT 0`,
    params: () => [],
  },

  // ── Becas ──────────────────────────────────────────────────────────────────
  {
    name: "scholarships:porcentaje",
    description: "scholarships — porcentaje, vigencia_inicio, vigencia_fin, motivo (queryBecasAlumno / queryBecasNivel)",
    sql: `SELECT sh.porcentaje, sh.vigencia_inicio, sh.vigencia_fin, sh.motivo,
                 s.nombre_completo, s.nivel_escolar, s.grado
          FROM scholarships sh
          INNER JOIN students s ON sh.student_id = s.id
          WHERE false LIMIT 0`,
    params: () => [],
  },

  // ── Familias ───────────────────────────────────────────────────────────────
  {
    name: "families:hijos",
    description: "families + family_students — nombre, campus_id, tenant_id (queryFamiliasHijos)",
    sql: `SELECT f.nombre, f.campus_id, f.tenant_id, fs.student_id
          FROM families f
          INNER JOIN family_students fs ON fs.family_id = f.id
          WHERE false LIMIT 0`,
    params: () => [],
  },

  // ── Discrepancia (multi-tabla) ─────────────────────────────────────────────
  {
    name: "discrepancia:multi",
    description: "students + scholarships + charges — columnas clave para queryDiscrepancia",
    sql: `SELECT s.campus_id, s.status,
                 sh.tenant_id AS beca_tenant,
                 c.student_id AS cargo_student
          FROM students s
          LEFT JOIN scholarships sh ON sh.student_id = s.id
          LEFT JOIN charges c ON c.student_id = s.id
          WHERE false LIMIT 0`,
    params: () => [],
  },

  // ── Resumen financiero ─────────────────────────────────────────────────────
  {
    name: "charges:resumen_financiero",
    description: "charges JOIN students — monto_base_centavos, estado, campus_id (queryResumenFinanciero)",
    sql: `SELECT c.monto_base_centavos, c.estado, s.campus_id
          FROM charges c
          INNER JOIN students s ON c.student_id = s.id
          WHERE false LIMIT 0`,
    params: () => [],
  },

  // ── payment_applications ───────────────────────────────────────────────────
  {
    name: "payment_applications:amount",
    description: "payment_applications — amount_centavos, charge_id (estado de cuenta)",
    sql: `SELECT amount_centavos, charge_id, payment_id FROM payment_applications WHERE false LIMIT 0`,
    params: () => [],
  },

  // ── Guardians ─────────────────────────────────────────────────────────────
  {
    name: "guardians:email",
    description: "guardians — email, nombre_completo, tipo_guardian",
    sql: `SELECT email, nombre_completo, tipo_guardian FROM guardians WHERE false LIMIT 0`,
    params: () => [],
  },

  // ── Audit log ─────────────────────────────────────────────────────────────
  {
    name: "audit_log:schema",
    description: "audit_log — action, entity_type, entity_id, user_id, tenant_id",
    sql: `SELECT action, entity_type, entity_id, user_id, tenant_id FROM audit_log WHERE false LIMIT 0`,
    params: () => [],
  },
];

// ── Ejecutor ──────────────────────────────────────────────────────────────────

export async function runAllProbes(ctx?: ProbeContext): Promise<ValidationReport> {
  const start = Date.now();
  const results: ProbeResult[] = [];

  for (const probe of PROBES) {
    const t0 = Date.now();
    try {
      const params = probe.params(ctx ?? { campusId: 0, tenantId: 0 });
      await pool.query(probe.sql, params);
      results.push({
        name: probe.name,
        description: probe.description,
        ok: true,
        durationMs: Date.now() - t0,
      });
    } catch (e: any) {
      results.push({
        name: probe.name,
        description: probe.description,
        ok: false,
        error: e.message?.replace(/\n/g, " ").slice(0, 200),
        durationMs: Date.now() - t0,
      });
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  return {
    totalProbes: results.length,
    passed,
    failed,
    durationMs: Date.now() - start,
    results,
  };
}
