/**
 * assistant-health-checks.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Catálogo de smoke-tests por módulo del sistema EduPay.
 * Cada check es una consulta directa a la base de datos (sin HTTP externo).
 * Los autoFix son conservadores: nunca eliminan datos, solo completan lo faltante.
 */

import { pool } from "./db";
import { storage } from "./storage";

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
  expectedBehavior: string;
}

export interface FixResult {
  ok: boolean;
  message: string;
  auditLogged?: boolean;
}

export interface ModuleCheck {
  /** Identificador del módulo (coincide con route sin /) */
  moduleId: string;
  label: string;
  checks: Array<{
    name: string;
    expectedBehavior: string;
    run: (ctx: CheckContext) => Promise<CheckResult>;
    autoFix?: (ctx: CheckContext) => Promise<FixResult>;
    autoFixDescription?: string;
  }>;
}

export interface CheckContext {
  campusId: number;
  tenantId: number;
  userId: number;
}

export type DiagnosticStatus = "ok" | "config_error" | "technical_error";

export interface DiagnosticResult {
  status: DiagnosticStatus;
  moduleId: string;
  label: string;
  checks: CheckResult[];
  fixAvailable?: boolean;
  fixDescription?: string;
}

// ── Catálogo de módulos ───────────────────────────────────────────────────────

export const MODULE_CHECKS: ModuleCheck[] = [
  // ── Estudiantes ──────────────────────────────────────────────────────────────
  {
    moduleId: "estudiantes",
    label: "Estudiantes",
    checks: [
      {
        name: "Tabla de alumnos responde",
        expectedBehavior: "La consulta de alumnos por campus devuelve sin error",
        async run(ctx) {
          try {
            const res = await pool.query(
              "SELECT COUNT(*) AS cnt FROM students WHERE campus_id = $1",
              [ctx.campusId]
            );
            const cnt = parseInt(res.rows[0].cnt, 10);
            return {
              name: "Tabla de alumnos responde",
              ok: true,
              detail: `${cnt} alumno(s) registrado(s) en este campus`,
              expectedBehavior: "La consulta de alumnos por campus devuelve sin error",
            };
          } catch (e: any) {
            return { name: "Tabla de alumnos responde", ok: false, detail: e.message, expectedBehavior: "La consulta de alumnos por campus devuelve sin error" };
          }
        },
      },
      {
        name: "Existen alumnos activos",
        expectedBehavior: "Al menos un alumno con status = 'activo'",
        async run(ctx) {
          try {
            const res = await pool.query(
              "SELECT COUNT(*) AS cnt FROM students WHERE campus_id = $1 AND status = 'activo'",
              [ctx.campusId]
            );
            const cnt = parseInt(res.rows[0].cnt, 10);
            return {
              name: "Existen alumnos activos",
              ok: cnt > 0,
              detail: cnt === 0 ? "No hay alumnos activos — es posible que todos estén inactivos o sin asignar campus" : `${cnt} alumno(s) activo(s)`,
              expectedBehavior: "Al menos un alumno con status = 'activo'",
            };
          } catch (e: any) {
            return { name: "Existen alumnos activos", ok: false, detail: e.message, expectedBehavior: "Al menos un alumno con status = 'activo'" };
          }
        },
      },
    ],
  },

  // ── Familias ─────────────────────────────────────────────────────────────────
  {
    moduleId: "familias",
    label: "Familias",
    checks: [
      {
        name: "Tabla de familias responde",
        expectedBehavior: "La consulta de familias del tenant devuelve sin error",
        async run(ctx) {
          try {
            const res = await pool.query(
              "SELECT COUNT(*) AS cnt FROM families WHERE tenant_id = $1",
              [ctx.tenantId]
            );
            const cnt = parseInt(res.rows[0].cnt, 10);
            return {
              name: "Tabla de familias responde",
              ok: true,
              detail: `${cnt} familia(s) registrada(s)`,
              expectedBehavior: "La consulta de familias del tenant devuelve sin error",
            };
          } catch (e: any) {
            return { name: "Tabla de familias responde", ok: false, detail: e.message, expectedBehavior: "La consulta de familias del tenant devuelve sin error" };
          }
        },
      },
    ],
  },

  // ── Cargos ───────────────────────────────────────────────────────────────────
  {
    moduleId: "cargos",
    label: "Cargos",
    checks: [
      {
        name: "Tabla de cargos responde",
        expectedBehavior: "La consulta de cargos del campus devuelve sin error",
        async run(ctx) {
          try {
            const res = await pool.query(
              `SELECT COUNT(*) AS cnt FROM charges c
               INNER JOIN students s ON c.student_id = s.id
               WHERE s.campus_id = $1`,
              [ctx.campusId]
            );
            const cnt = parseInt(res.rows[0].cnt, 10);
            return {
              name: "Tabla de cargos responde",
              ok: true,
              detail: `${cnt} cargo(s) registrado(s)`,
              expectedBehavior: "La consulta de cargos del campus devuelve sin error",
            };
          } catch (e: any) {
            return { name: "Tabla de cargos responde", ok: false, detail: e.message, expectedBehavior: "La consulta de cargos del campus devuelve sin error" };
          }
        },
      },
      {
        name: "Existen conceptos de cobro",
        expectedBehavior: "Al menos un concepto activo para poder generar cargos",
        async run(ctx) {
          try {
            const res = await pool.query(
              "SELECT COUNT(*) AS cnt FROM concepts WHERE campus_id = $1 AND activo = true",
              [ctx.campusId]
            );
            const cnt = parseInt(res.rows[0].cnt, 10);
            return {
              name: "Existen conceptos de cobro",
              ok: cnt > 0,
              detail: cnt === 0
                ? "No hay conceptos activos — debes configurar al menos uno en Catálogo de Productos antes de generar cargos"
                : `${cnt} concepto(s) activo(s)`,
              expectedBehavior: "Al menos un concepto activo para poder generar cargos",
            };
          } catch (e: any) {
            return { name: "Existen conceptos de cobro", ok: false, detail: e.message, expectedBehavior: "Al menos un concepto activo para poder generar cargos" };
          }
        },
      },
    ],
  },

  // ── Pagos ────────────────────────────────────────────────────────────────────
  {
    moduleId: "pagos",
    label: "Pagos",
    checks: [
      {
        name: "Tabla de pagos responde",
        expectedBehavior: "La consulta de pagos devuelve sin error",
        async run(ctx) {
          try {
            const res = await pool.query(
              `SELECT COUNT(*) AS cnt FROM payments p
               INNER JOIN charges c ON p.charge_id = c.id
               INNER JOIN students s ON c.student_id = s.id
               WHERE s.campus_id = $1`,
              [ctx.campusId]
            );
            const cnt = parseInt(res.rows[0].cnt, 10);
            return {
              name: "Tabla de pagos responde",
              ok: true,
              detail: `${cnt} pago(s) registrado(s)`,
              expectedBehavior: "La consulta de pagos devuelve sin error",
            };
          } catch (e: any) {
            return { name: "Tabla de pagos responde", ok: false, detail: e.message, expectedBehavior: "La consulta de pagos devuelve sin error" };
          }
        },
      },
    ],
  },

  // ── Cuentas por Cobrar ───────────────────────────────────────────────────────
  {
    moduleId: "cuentas-por-cobrar",
    label: "Cuentas por Cobrar",
    checks: [
      {
        name: "Consulta de saldos pendientes responde",
        expectedBehavior: "La vista de adeudos devuelve datos sin error",
        async run(ctx) {
          try {
            const res = await pool.query(
              `SELECT COUNT(*) AS cnt FROM charges c
               INNER JOIN students s ON c.student_id = s.id
               WHERE s.campus_id = $1 AND c.estado IN ('pendiente','vencido')`,
              [ctx.campusId]
            );
            const cnt = parseInt(res.rows[0].cnt, 10);
            return {
              name: "Consulta de saldos pendientes responde",
              ok: true,
              detail: `${cnt} cargo(s) pendiente(s) o vencido(s)`,
              expectedBehavior: "La vista de adeudos devuelve datos sin error",
            };
          } catch (e: any) {
            return { name: "Consulta de saldos pendientes responde", ok: false, detail: e.message, expectedBehavior: "La vista de adeudos devuelve datos sin error" };
          }
        },
      },
    ],
  },

  // ── Catálogo de Productos ────────────────────────────────────────────────────
  {
    moduleId: "catalogo-productos",
    label: "Catálogo de Productos",
    checks: [
      {
        name: "Tabla de conceptos responde",
        expectedBehavior: "La consulta de conceptos devuelve sin error",
        async run(ctx) {
          try {
            const res = await pool.query(
              "SELECT COUNT(*) AS cnt FROM concepts WHERE campus_id = $1",
              [ctx.campusId]
            );
            return {
              name: "Tabla de conceptos responde",
              ok: true,
              detail: `${res.rows[0].cnt} concepto(s) en catálogo`,
              expectedBehavior: "La consulta de conceptos devuelve sin error",
            };
          } catch (e: any) {
            return { name: "Tabla de conceptos responde", ok: false, detail: e.message, expectedBehavior: "La consulta de conceptos devuelve sin error" };
          }
        },
      },
      {
        name: "Existen conceptos activos",
        expectedBehavior: "Al menos un concepto con activo = true",
        async run(ctx) {
          try {
            const res = await pool.query(
              "SELECT COUNT(*) AS cnt FROM concepts WHERE campus_id = $1 AND activo = true",
              [ctx.campusId]
            );
            const cnt = parseInt(res.rows[0].cnt, 10);
            return {
              name: "Existen conceptos activos",
              ok: cnt > 0,
              detail: cnt === 0 ? "Todos los conceptos están inactivos — activa al menos uno" : `${cnt} activo(s)`,
              expectedBehavior: "Al menos un concepto con activo = true",
            };
          } catch (e: any) {
            return { name: "Existen conceptos activos", ok: false, detail: e.message, expectedBehavior: "Al menos un concepto con activo = true" };
          }
        },
      },
    ],
  },

  // ── Becas ────────────────────────────────────────────────────────────────────
  {
    moduleId: "becas",
    label: "Becas y Descuentos",
    checks: [
      {
        name: "Tabla de becas responde",
        expectedBehavior: "La consulta de becas devuelve sin error",
        async run(ctx) {
          try {
            const res = await pool.query(
              "SELECT COUNT(*) AS cnt FROM scholarships WHERE tenant_id = $1",
              [ctx.tenantId]
            );
            return {
              name: "Tabla de becas responde",
              ok: true,
              detail: `${res.rows[0].cnt} beca(s) o descuento(s) registrado(s)`,
              expectedBehavior: "La consulta de becas devuelve sin error",
            };
          } catch (e: any) {
            return { name: "Tabla de becas responde", ok: false, detail: e.message, expectedBehavior: "La consulta de becas devuelve sin error" };
          }
        },
      },
    ],
  },

  // ── Notificaciones ───────────────────────────────────────────────────────────
  {
    moduleId: "notificaciones",
    label: "Notificaciones",
    checks: [
      {
        name: "Tabla de notificaciones responde",
        expectedBehavior: "La consulta de notificaciones devuelve sin error",
        async run(ctx) {
          try {
            const res = await pool.query(
              "SELECT COUNT(*) AS cnt FROM approval_notifications WHERE user_id IN (SELECT id FROM users WHERE campus_id = $1)",
              [ctx.campusId]
            );
            return {
              name: "Tabla de notificaciones responde",
              ok: true,
              detail: `${res.rows[0].cnt} notificación(es) para este campus`,
              expectedBehavior: "La consulta de notificaciones devuelve sin error",
            };
          } catch (e: any) {
            return { name: "Tabla de notificaciones responde", ok: false, detail: e.message, expectedBehavior: "La consulta de notificaciones devuelve sin error" };
          }
        },
      },
    ],
  },

  // ── Usuarios ─────────────────────────────────────────────────────────────────
  {
    moduleId: "usuarios",
    label: "Gestión de Usuarios",
    checks: [
      {
        name: "Tabla de usuarios responde",
        expectedBehavior: "La consulta de usuarios del campus devuelve sin error",
        async run(ctx) {
          try {
            const res = await pool.query(
              "SELECT COUNT(*) AS cnt FROM users WHERE campus_id = $1",
              [ctx.campusId]
            );
            return {
              name: "Tabla de usuarios responde",
              ok: true,
              detail: `${res.rows[0].cnt} usuario(s) en este campus`,
              expectedBehavior: "La consulta de usuarios del campus devuelve sin error",
            };
          } catch (e: any) {
            return { name: "Tabla de usuarios responde", ok: false, detail: e.message, expectedBehavior: "La consulta de usuarios del campus devuelve sin error" };
          }
        },
      },
      {
        name: "Existe al menos un administrador",
        expectedBehavior: "Al menos un usuario con rol de administrador",
        async run(ctx) {
          try {
            const res = await pool.query(
              `SELECT COUNT(*) AS cnt FROM users WHERE campus_id = $1
               AND role IN ('administrador_general','administrador_campus','super_admin')`,
              [ctx.campusId]
            );
            const cnt = parseInt(res.rows[0].cnt, 10);
            return {
              name: "Existe al menos un administrador",
              ok: cnt > 0,
              detail: cnt === 0 ? "No hay administradores asignados a este campus" : `${cnt} administrador(es)`,
              expectedBehavior: "Al menos un usuario con rol de administrador",
            };
          } catch (e: any) {
            return { name: "Existe al menos un administrador", ok: false, detail: e.message, expectedBehavior: "Al menos un usuario con rol de administrador" };
          }
        },
      },
    ],
  },

  // ── Caja y Conciliación ──────────────────────────────────────────────────────
  {
    moduleId: "caja-conciliacion",
    label: "Caja y Conciliación",
    checks: [
      {
        name: "Tabla de movimientos bancarios responde",
        expectedBehavior: "La consulta de bank_transactions devuelve sin error",
        async run(ctx) {
          try {
            const res = await pool.query(
              "SELECT COUNT(*) AS cnt FROM bank_transactions WHERE campus_id = $1",
              [ctx.campusId]
            );
            return {
              name: "Tabla de movimientos bancarios responde",
              ok: true,
              detail: `${res.rows[0].cnt} movimiento(s) bancario(s)`,
              expectedBehavior: "La consulta de bank_transactions devuelve sin error",
            };
          } catch (e: any) {
            return { name: "Tabla de movimientos bancarios responde", ok: false, detail: e.message, expectedBehavior: "La consulta de bank_transactions devuelve sin error" };
          }
        },
      },
    ],
  },

  // ── Fiscal y Contable ────────────────────────────────────────────────────────
  {
    moduleId: "fiscal-contable",
    label: "Fiscal y Contable",
    checks: [
      {
        name: "Tabla de facturas/CFDIs responde",
        expectedBehavior: "La consulta de invoices devuelve sin error",
        async run(ctx) {
          try {
            const res = await pool.query(
              `SELECT COUNT(*) AS cnt FROM invoices i
               INNER JOIN payments p ON i.payment_id = p.id
               INNER JOIN charges c ON p.charge_id = c.id
               INNER JOIN students s ON c.student_id = s.id
               WHERE s.campus_id = $1`,
              [ctx.campusId]
            );
            return {
              name: "Tabla de facturas/CFDIs responde",
              ok: true,
              detail: `${res.rows[0].cnt} CFDI(s) emitido(s)`,
              expectedBehavior: "La consulta de invoices devuelve sin error",
            };
          } catch (e: any) {
            return { name: "Tabla de facturas/CFDIs responde", ok: false, detail: e.message, expectedBehavior: "La consulta de invoices devuelve sin error" };
          }
        },
      },
    ],
  },

  // ── Reportes ─────────────────────────────────────────────────────────────────
  {
    moduleId: "reportes",
    label: "Reportes",
    checks: [
      {
        name: "Datos de reportes disponibles",
        expectedBehavior: "Existen datos de pagos y cargos para generar reportes",
        async run(ctx) {
          try {
            const res = await pool.query(
              `SELECT
                 (SELECT COUNT(*) FROM charges c INNER JOIN students s ON c.student_id = s.id WHERE s.campus_id = $1) AS cargos,
                 (SELECT COUNT(*) FROM payments p INNER JOIN charges c ON p.charge_id = c.id INNER JOIN students s ON c.student_id = s.id WHERE s.campus_id = $1) AS pagos`,
              [ctx.campusId]
            );
            const { cargos, pagos } = res.rows[0];
            const ok = parseInt(cargos, 10) > 0;
            return {
              name: "Datos de reportes disponibles",
              ok,
              detail: ok ? `${cargos} cargo(s) y ${pagos} pago(s) para reportes` : "Sin datos — los reportes aparecerán vacíos hasta que existan cargos",
              expectedBehavior: "Existen datos de pagos y cargos para generar reportes",
            };
          } catch (e: any) {
            return { name: "Datos de reportes disponibles", ok: false, detail: e.message, expectedBehavior: "Existen datos de pagos y cargos para generar reportes" };
          }
        },
      },
    ],
  },

  // ── Configuración ────────────────────────────────────────────────────────────
  {
    moduleId: "configuracion",
    label: "Configuración",
    checks: [
      {
        name: "Parámetros institucionales existen",
        expectedBehavior: "Existe al menos un registro de configuración para este campus",
        async run(ctx) {
          try {
            const res = await pool.query(
              "SELECT COUNT(*) AS cnt FROM institutional_settings WHERE campus_id = $1",
              [ctx.campusId]
            );
            const cnt = parseInt(res.rows[0].cnt, 10);
            return {
              name: "Parámetros institucionales existen",
              ok: cnt > 0,
              detail: cnt === 0 ? "No se han guardado parámetros institucionales — ve a Configuración y guarda la información" : "Parámetros configurados correctamente",
              expectedBehavior: "Existe al menos un registro de configuración para este campus",
            };
          } catch (e: any) {
            return { name: "Parámetros institucionales existen", ok: false, detail: e.message, expectedBehavior: "Existe al menos un registro de configuración para este campus" };
          }
        },
      },
    ],
  },

  // ── Importación ──────────────────────────────────────────────────────────────
  {
    moduleId: "importacion-datos",
    label: "Importación de Datos",
    checks: [
      {
        name: "Estructura de importación disponible",
        expectedBehavior: "Las tablas de alumnos y familias aceptan inserción",
        async run(ctx) {
          try {
            // Verificamos que las tablas existen y tienen las columnas correctas
            const res = await pool.query(
              `SELECT column_name FROM information_schema.columns
               WHERE table_name = 'students' AND column_name IN ('nombre_completo','grado','campus_id')
               ORDER BY column_name`
            );
            const ok = res.rows.length === 3;
            return {
              name: "Estructura de importación disponible",
              ok,
              detail: ok ? "Estructura de tablas correcta para importación" : "Falta alguna columna en la tabla students",
              expectedBehavior: "Las tablas de alumnos y familias aceptan inserción",
            };
          } catch (e: any) {
            return { name: "Estructura de importación disponible", ok: false, detail: e.message, expectedBehavior: "Las tablas de alumnos y familias aceptan inserción" };
          }
        },
      },
    ],
  },

  // ── Aprobaciones ─────────────────────────────────────────────────────────────
  {
    moduleId: "aprobaciones",
    label: "Aprobaciones",
    checks: [
      {
        name: "Tabla de aprobaciones responde",
        expectedBehavior: "La consulta de solicitudes pendientes devuelve sin error",
        async run(ctx) {
          try {
            const res = await pool.query(
              "SELECT COUNT(*) AS cnt FROM pending_approvals WHERE status = 'pending'"
            );
            return {
              name: "Tabla de aprobaciones responde",
              ok: true,
              detail: `${res.rows[0].cnt} solicitud(es) pendiente(s) de aprobar`,
              expectedBehavior: "La consulta de solicitudes pendientes devuelve sin error",
            };
          } catch (e: any) {
            return { name: "Tabla de aprobaciones responde", ok: false, detail: e.message, expectedBehavior: "La consulta de solicitudes pendientes devuelve sin error" };
          }
        },
      },
    ],
  },
];

// ── Runner principal ──────────────────────────────────────────────────────────

/**
 * Ejecuta todos los checks de un módulo y devuelve el diagnóstico.
 * Si algún check tiene autoFix y autoFixConfirmed=true, lo ejecuta.
 */
export async function runDiagnostic(
  moduleId: string,
  ctx: CheckContext,
  autoFixConfirmed = false
): Promise<DiagnosticResult | null> {
  const mod = MODULE_CHECKS.find((m) => m.moduleId === moduleId);
  if (!mod) return null;

  // Ejecutar todos los checks en paralelo
  const checksWithMeta = await Promise.all(
    mod.checks.map(async (c) => {
      const result = await c.run(ctx).catch((e: any) => ({
        name: c.name,
        ok: false,
        detail: `Error inesperado: ${e.message}`,
        expectedBehavior: c.expectedBehavior,
      }));
      return { result, autoFix: c.autoFix, autoFixDescription: c.autoFixDescription };
    })
  );

  const allOk = checksWithMeta.every((c) => c.result.ok);
  const hasConfigError = checksWithMeta.some(
    (c) => !c.result.ok && c.result.detail && !c.result.detail.includes("Error inesperado")
  );
  
  // Detectar si hay fix disponible
  const fixableCheck = checksWithMeta.find((c) => !c.result.ok && c.autoFix);

  let status: DiagnosticStatus;
  if (allOk) {
    status = "ok";
  } else if (hasConfigError) {
    status = "config_error";
  } else {
    status = "technical_error";
  }

  // Ejecutar auto-fix si se confirma y está disponible
  if (autoFixConfirmed && fixableCheck?.autoFix) {
    const fixRes = await fixableCheck.autoFix(ctx).catch((e: any) => ({
      ok: false,
      message: `Error ejecutando fix: ${e.message}`,
    }));
    
    // Registrar en audit_log
    if (fixRes.ok) {
      await pool.query(
        `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata, created_at)
         VALUES ($1, $2, 'assistant_autofix', 'system', $3, $4, NOW())`,
        [
          ctx.tenantId,
          ctx.userId,
          ctx.campusId,
          JSON.stringify({ moduleId, fix: fixableCheck.autoFixDescription, result: fixRes.message }),
        ]
      ).catch(() => {}); // no bloquear si audit falla
    }
  }

  // Registrar issue en audit_log si hay error
  if (!allOk) {
    await pool.query(
      `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata, created_at)
       VALUES ($1, $2, 'assistant_issue_report', 'system', $3, $4, NOW())`,
      [
        ctx.tenantId,
        ctx.userId,
        ctx.campusId,
        JSON.stringify({
          moduleId,
          status,
          failedChecks: checksWithMeta
            .filter((c) => !c.result.ok)
            .map((c) => ({ name: c.result.name, detail: c.result.detail })),
        }),
      ]
    ).catch(() => {});
  }

  return {
    status,
    moduleId,
    label: mod.label,
    checks: checksWithMeta.map((c) => c.result),
    fixAvailable: !!fixableCheck,
    fixDescription: fixableCheck?.autoFixDescription,
  };
}

/**
 * Ejecuta los checks de TODOS los módulos en paralelo.
 * Útil para el health-check completo desde Configuración.
 */
export async function runFullDiagnostic(ctx: CheckContext): Promise<DiagnosticResult[]> {
  const results = await Promise.all(
    MODULE_CHECKS.map((mod) => runDiagnostic(mod.moduleId, ctx))
  );
  return results.filter((r): r is DiagnosticResult => r !== null);
}
