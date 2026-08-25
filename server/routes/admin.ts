import type { Express } from "express";
import { pool, db } from "../db";
import { createFamily } from "../lib/family-service";
import { getFamilyGuardianIds, getGuardiansWithoutActiveFamilies } from "../lib/family-access";
import { enqueueAuditLog } from "../audit-retry";
import { eq, and, gte, lt } from "drizzle-orm";
import { storage } from "../storage";
import { authenticateToken, requireAuth, requireSuperAdmin, checkCampusTenant, serializeUser, upload, esmRequire, authenticateGuardian, hasPermissionForUser, JWT_SECRET} from "./shared";
import { MODULES, ACTIONS } from "@shared/permissions";
import { students, guardians, student_guardian, charges, payments, concepts, scholarships, invoices, institutional_info, institutional_credentials, payment_due_dates, payment_surcharge_rules } from "@shared/schema";
import { insertInstitutionalInfoSchema } from "@shared/schema";
import { getAcademicLevel } from "@shared/academic-levels";
import { seedAdmissionsData } from "../seed-admissions-data";
import * as XLSX from "xlsx";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { wsManager } from "../websocket-manager";

/**
 * Campos que el usuario puede modificar directamente en un alumno.
 *
 * La política de campus/tenant se deriva exclusivamente del JWT y nunca del
 * body. `.strict()` hace que esa frontera sea explícita: cualquier campo nuevo
 * o sensible enviado por el cliente debe agregarse aquí de forma deliberada.
 */
export const updateStudentSchema = z.object({
  nombres: z.string().max(255).nullable().optional(),
  apellido_paterno: z.string().max(255).nullable().optional(),
  apellido_materno: z.string().max(255).nullable().optional(),
  curp: z.string().max(18).nullable().optional(),
  fecha_nacimiento: z.string().max(10).nullable().optional(),
  correo_institucional: z.string().max(255).nullable().optional(),
  nivel_escolar: z.string().max(100).nullable().optional(),
  grado: z.string().max(50).nullable().optional(),
  grupo: z.string().max(50).nullable().optional(),
  turno: z.string().max(50).nullable().optional(),
  status: z.string().max(50).nullable().optional(),
}).strict();

const scholarshipCriterionSchema = z.object({
  criterio: z.string().trim().min(1).max(100),
  valor_minimo: z.coerce.number().finite().nullable().optional(),
  valor_maximo: z.coerce.number().finite().nullable().optional(),
  obligatorio: z.boolean().optional().default(true),
}).superRefine((criterion, ctx) => {
  if (
    criterion.valor_minimo !== null && criterion.valor_minimo !== undefined
    && criterion.valor_maximo !== null && criterion.valor_maximo !== undefined
    && criterion.valor_minimo > criterion.valor_maximo
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "valor_minimo no puede ser mayor que valor_maximo",
      path: ["valor_maximo"],
    });
  }
});

const scholarshipBenefitSchema = z.object({
  porcentaje_descuento: z.coerce.number().int().min(1).max(100),
  aplica_conceptos: z.array(z.string().trim().min(1).max(100)).min(1).max(20).optional()
    .default(["colegiatura"]),
  vigencia_meses: z.coerce.number().int().min(1).max(120).nullable().optional().default(12),
}).strict();

const scholarshipTypePayloadSchema = z.object({
  nombre: z.string().trim().min(1).max(100),
  categoria: z.enum([
    "academica", "socioeconomica", "deportiva", "cultural",
    "familiar", "empleado", "convenio", "descuento",
  ]),
  descripcion: z.string().trim().max(5000).nullable().optional(),
  algoritmo: z.enum(["manual", "automatico", "promedio", "hermanos", "ingresos"]),
  activo: z.boolean().optional().default(true),
  beneficio: scholarshipBenefitSchema,
  criterios: z.array(scholarshipCriterionSchema).max(30).optional().default([]),
}).strict();

const scholarshipTypeUpdateSchema = scholarshipTypePayloadSchema.extend({
  motivo_cambio: z.string().trim().min(10).max(500),
}).strict();

const scholarshipAssignmentUpdateSchema = z.object({
  porcentaje: z.coerce.number().finite().gt(0).lte(100).optional(),
  motivo: z.string().trim().max(500).nullable().optional(),
  vigencia_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  vigencia_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  motivo_cambio: z.string().trim().min(10).max(500),
}).strict().superRefine((value, ctx) => {
  if (
    value.porcentaje === undefined
    && value.motivo === undefined
    && value.vigencia_inicio === undefined
    && value.vigencia_fin === undefined
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Indica al menos un campo de la beca para actualizar",
    });
  }
});

const scholarshipStateChangeSchema = z.object({
  estado: z.enum(["activa", "suspendida"]),
  motivo: z.string().trim().min(10).max(500),
}).strict();

function toDateOnly(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value ?? "");
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString().slice(0, 10);
}

function scholarshipAssignmentSnapshot(row: any) {
  return {
    id: Number(row.id),
    student_id: Number(row.student_id),
    scholarship_type_id: row.scholarship_type_id === null ? null : Number(row.scholarship_type_id),
    porcentaje: Number(row.porcentaje),
    motivo: row.motivo ?? null,
    estado: row.estado ?? "activa",
    vigencia_inicio: toDateOnly(row.vigencia_inicio),
    vigencia_fin: toDateOnly(row.vigencia_fin),
  };
}

async function getStudentInCurrentScope(studentId: number, user: any): Promise<any | undefined> {
  const campusId = Number(user?.campus_id);
  const tenantId = Number(user?.tenant_id);
  if (!Number.isSafeInteger(studentId) || studentId <= 0
    || !Number.isSafeInteger(campusId) || campusId <= 0
    || !Number.isSafeInteger(tenantId) || tenantId <= 0) {
    return undefined;
  }
  const result = await pool.query(
    `SELECT * FROM students WHERE id = $1 AND campus_id = $2 AND tenant_id = $3 LIMIT 1`,
    [studentId, campusId, tenantId],
  );
  return result.rows[0];
}

export function registerAdminRoutes(app: Express): void {
  // GUARDIAN PORTAL ROUTES

  // Get guardian's students and their pending charges
  app.get("/api/guardian/dashboard", authenticateGuardian, async (req: any, res) => {
    try {
      const guardianId = req.guardian?.id;
      const tenantId = req.guardian?.tenant_id;

      // Verificar que el guardián pertenece al tenant del JWT antes de devolver datos
      if (tenantId) {
        const owned = await storage.getGuardianScoped(guardianId, tenantId);
        if (!owned) return res.status(403).json({ message: "Acceso denegado" });
      }
      
      const students = await storage.getStudentsByGuardian(guardianId);
      // Filtrar alumnos, cargos y pagos por tenant del JWT
      const tenantStudents = tenantId ? students.filter((s: any) => !s.tenant_id || s.tenant_id === tenantId) : students;
      const pendingCharges = (await storage.getPendingChargesByGuardian(guardianId))
        .filter((c: any) => !tenantId || !c.tenant_id || c.tenant_id === tenantId);
      const paymentHistory = (await storage.getPaymentsByGuardian(guardianId))
        .filter((p: any) => !tenantId || !p.tenant_id || p.tenant_id === tenantId);
      const paymentMethods = await storage.getPaymentMethodsByGuardian(guardianId);

      // Calculate total pending balance
      const totalPending = pendingCharges.reduce((sum, charge) => {
        const baseAmount = charge.monto_base_centavos;
        const discount = baseAmount * (Number(charge.beca_aplicada) / 100);
        const finalAmount = baseAmount - discount + (charge.recargo_aplicado_centavos || 0);
        return sum + finalAmount;
      }, 0);

      res.json({
        students: tenantStudents,
        pendingCharges: pendingCharges.map(charge => ({
          ...charge,
          total_amount_centavos: charge.monto_base_centavos - (charge.monto_base_centavos * Number(charge.beca_aplicada) / 100) + (charge.recargo_aplicado_centavos || 0),
        })),
        totalPendingBalance: totalPending / 100, // Convert to pesos
        paymentHistory,
        paymentMethods,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching dashboard" });
    }
  });

  // ADMIN PORTAL ROUTES

  // Get dashboard KPIs — 3 capas: ciclo / mes / alertas + desglose por nivel
  app.get("/api/admin/dashboard/:campusId", requireAuth, async (req: any, res) => {
    try {
      const role = req.user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.DASHBOARD, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver el dashboard" });
      }
      const campusId = parseInt(req.params.campusId);
      if (!await checkCampusTenant(campusId, req.user?.tenant_id, res)) return;

      // Parámetros del header global: ciclo, nivel, periodo
      const now = new Date();
      const autoY  = now.getFullYear();
      const autoMo = now.getMonth() + 1;
      const ciclo  = (req.query.ciclo as string) ||
                     (autoMo >= 8 ? `${autoY}-${autoY + 1}` : `${autoY - 1}-${autoY}`);
      const rawNivel  = (req.query.nivel as string) ?? "all";
      const periodo   = (req.query.periodo as string) ?? "mes"; // hoy | semana | mes | ciclo

      // ── Filtro de nivel (ILIKE para ignorar mayúsculas) ─────────────────────
      let nivelClause = '';
      let baseParams: any[] = [campusId];
      if (rawNivel && rawNivel !== "all") {
        nivelClause = "AND UPPER(s.nivel_escolar) = UPPER($2)";
        baseParams  = [campusId, rawNivel];
      }

      // ── Rango de fechas según periodo ───────────────────────────────────────
      const hoy      = now.toISOString().split("T")[0];
      const en7dias  = new Date(now.getTime() + 7 * 86_400_000).toISOString().split("T")[0];
      let periodoInicio: string;
      let periodoFin: string;
      if (periodo === "hoy") {
        periodoInicio = hoy;
        periodoFin    = hoy;
      } else if (periodo === "semana") {
        const lunes = new Date(now);
        lunes.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        const domingo = new Date(lunes);
        domingo.setDate(lunes.getDate() + 6);
        periodoInicio = lunes.toISOString().split("T")[0];
        periodoFin    = domingo.toISOString().split("T")[0];
      } else if (periodo === "ciclo") {
        const [startY] = ciclo.split("-").map(Number);
        periodoInicio = `${startY}-08-01`;
        periodoFin    = `${startY + 1}-07-31`;
      } else {
        // mes (default)
        periodoInicio = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
        periodoFin    = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
      }

      // ── 1. Semáforo del ciclo ───────────────────────────────────────────────
      const cicloRes = await pool.query(`
        SELECT
          COALESCE(SUM(c.monto_base_centavos), 0)                                                          AS facturado,
          COALESCE(SUM(CASE WHEN c.estado = 'pagado'                 THEN c.monto_base_centavos END), 0)   AS cobrado,
          COALESCE(SUM(CASE WHEN c.estado IN ('pendiente','parcial') THEN c.monto_base_centavos END), 0)   AS por_cobrar,
          COALESCE(SUM(CASE WHEN c.estado = 'vencido'                THEN c.monto_base_centavos END), 0)   AS vencido,
          COUNT(DISTINCT s.id)                                                                              AS alumnos_activos,
          COUNT(DISTINCT CASE WHEN c.estado = 'vencido' THEN s.id END)                                     AS alumnos_con_adeudo
        FROM charges c
        JOIN students s ON c.student_id = s.id
        WHERE s.campus_id = $1 AND c.ciclo_escolar = $${baseParams.length + 1} ${nivelClause}
      `, [...baseParams, ciclo]);

      const cr            = cicloRes.rows[0] as any;
      const facturado     = Number(cr.facturado);
      const cobrado_ciclo = Number(cr.cobrado);
      const alumnos_act   = Number(cr.alumnos_activos);
      const alumnos_deb   = Number(cr.alumnos_con_adeudo);

      // ── 2. Pulso del mes ────────────────────────────────────────────────────
      const mesRes = await pool.query(`
        SELECT
          COALESCE(SUM(c.monto_base_centavos), 0)                                                        AS esperado,
          COALESCE(SUM(CASE WHEN c.estado = 'pagado' THEN c.monto_base_centavos END), 0)                 AS cobrado
        FROM charges c
        JOIN students s ON c.student_id = s.id
        WHERE s.campus_id = $1
          AND c.fecha_vencimiento BETWEEN $${baseParams.length + 1} AND $${baseParams.length + 2}
          ${nivelClause}
      `, [...baseParams, periodoInicio, periodoFin]);

      const mr           = mesRes.rows[0] as any;
      const esperado_mes = Number(mr.esperado);
      const cobrado_mes  = Number(mr.cobrado);

      // ── 3. Alertas operativas (siempre campus-wide) ─────────────────────────
      const [excRes, semRes, riesgoRes] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) AS cnt FROM bank_transactions
           WHERE campus_id = $1 AND estado_conciliacion = 'pendiente'`,
          [campusId]
        ).catch(() => ({ rows: [{ cnt: 0 }] })),
        pool.query(`
          SELECT COUNT(*) AS cnt
          FROM charges c JOIN students s ON c.student_id = s.id
          WHERE s.campus_id = $1
            AND c.estado IN ('pendiente','parcial')
            AND c.fecha_vencimiento BETWEEN $2 AND $3
        `, [campusId, hoy, en7dias]),
        pool.query(`
          SELECT COUNT(DISTINCT s.id) AS cnt
          FROM charges c JOIN students s ON c.student_id = s.id
          WHERE s.campus_id = $1
            AND c.estado = 'vencido'
            AND c.fecha_vencimiento <= CURRENT_DATE - INTERVAL '60 days'
        `, [campusId]),
      ]);

      // ── 4. Niveles disponibles en el campus (sin filtro de ciclo) ──────────
      const nivelesRes = await pool.query(`
        SELECT DISTINCT COALESCE(nivel_escolar, 'Sin nivel') AS nivel
        FROM students
        WHERE campus_id = $1
        ORDER BY nivel
      `, [campusId]);

      // ── 5. Desglose por nivel (métricas del ciclo, todos los niveles) ───────
      const desgloseRes = await pool.query(`
        SELECT
          COALESCE(s.nivel_escolar, 'Sin nivel')                                                         AS nivel,
          COALESCE(SUM(c.monto_base_centavos), 0)                                                        AS facturado,
          COALESCE(SUM(CASE WHEN c.estado = 'pagado'  THEN c.monto_base_centavos END), 0)                AS cobrado,
          COALESCE(SUM(CASE WHEN c.estado = 'vencido' THEN c.monto_base_centavos END), 0)                AS vencido,
          COUNT(DISTINCT s.id)                                                                            AS alumnos,
          COUNT(DISTINCT CASE WHEN c.estado = 'vencido' THEN s.id END)                                   AS alumnos_adeudo
        FROM charges c
        JOIN students s ON c.student_id = s.id
        WHERE s.campus_id = $1 AND c.ciclo_escolar = $2
        GROUP BY s.nivel_escolar
        ORDER BY s.nivel_escolar NULLS LAST
      `, [campusId, ciclo]);

      res.json({
        ciclo,
        ciclo_metrics: {
          facturado,
          cobrado:              cobrado_ciclo,
          por_cobrar:           Number(cr.por_cobrar),
          vencido:              Number(cr.vencido),
          pct_cumplimiento:     facturado > 0 ? Math.round(cobrado_ciclo / facturado * 100) : 0,
          alumnos_activos:      alumnos_act,
          alumnos_al_corriente: alumnos_act - alumnos_deb,
          alumnos_con_adeudo:   alumnos_deb,
        },
        mes_metrics: {
          mes_nombre: periodo === "hoy"    ? `hoy (${now.toLocaleDateString("es-MX", { day: "numeric", month: "short" })})` :
                      periodo === "semana" ? `esta semana (${periodoInicio.slice(5)} – ${periodoFin.slice(5)})` :
                      periodo === "ciclo"  ? `ciclo ${ciclo}` :
                      now.toLocaleDateString("es-MX", { month: "long", year: "numeric" }),
          esperado:   esperado_mes,
          cobrado:    cobrado_mes,
          pendiente:  Math.max(0, esperado_mes - cobrado_mes),
          eficiencia: esperado_mes > 0 ? Math.round(cobrado_mes / esperado_mes * 100) : 0,
        },
        alertas: {
          excepciones_pendientes: Number((excRes.rows[0] as any)?.cnt ?? 0),
          vencen_semana:          Number((semRes.rows[0] as any)?.cnt  ?? 0),
          alumnos_riesgo:         Number((riesgoRes.rows[0] as any)?.cnt ?? 0),
        },
        niveles_disponibles: (nivelesRes.rows as any[]).map(r => r.nivel as string),
        desglose_nivel: (desgloseRes.rows as any[]).map(r => ({
          nivel:          r.nivel as string,
          facturado:      Number(r.facturado),
          cobrado:        Number(r.cobrado),
          vencido:        Number(r.vencido),
          alumnos:        Number(r.alumnos),
          alumnos_adeudo: Number(r.alumnos_adeudo),
        })),
      });
    } catch (error: any) {
      console.error("[dashboard] Error:", error);
      res.status(500).json({ message: "Error al cargar el dashboard" });
    }
  });

  // Get students for authenticated user's campus (no campusId in URL)
  app.get("/api/admin/students", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!hasPermissionForUser(user, MODULES.STUDENTS, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver alumnos" });
      }
      const campusId = Number(user?.campus_id);
      const tenantId = Number(user?.tenant_id);
      if (!Number.isSafeInteger(campusId) || campusId <= 0 || !Number.isSafeInteger(tenantId) || tenantId <= 0) {
        return res.status(400).json({ message: "Campus ID requerido" });
      }

      const rawStudentId = req.query.studentId;
      if (rawStudentId !== undefined) {
        if (typeof rawStudentId !== "string" || !/^[1-9]\d*$/.test(rawStudentId)) {
          return res.status(400).json({ message: "ID de alumno inválido" });
        }
        const student = await getStudentInCurrentScope(Number(rawStudentId), user);
        if (!student) {
          return res.status(403).json({ message: "Alumno no disponible en tu campus" });
        }
        return res.json(student);
      }

      const students = await pool.query(
        `SELECT * FROM students WHERE campus_id = $1 AND tenant_id = $2`,
        [campusId, tenantId],
      );
      res.json(students.rows);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching students" });
    }
  });

  // Get students by campus — requiere autenticación y campus del tenant
  app.get("/api/admin/students/:campusId", authenticateToken, async (req: any, res) => {
    try {
      const campusId = parseInt(req.params.campusId);
      if (!await checkCampusTenant(campusId, req.user?.tenant_id, res)) return;
      if (!hasPermissionForUser(req.user, MODULES.STUDENTS, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver alumnos" });
      }
      const students = await storage.getStudentsByCampus(campusId);
      res.json(students);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching students" });
    }
  });

  // Get guardians by campus — requiere autenticación y campus del tenant
  app.get("/api/admin/guardians/:campusId", authenticateToken, async (req: any, res) => {
    try {
      if (!hasPermissionForUser(req.user, MODULES.FAMILIES, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver tutores" });
      }
      const campusId = parseInt(req.params.campusId);
      if (!await checkCampusTenant(campusId, req.user?.tenant_id, res)) return;
      const guardians = await storage.getGuardiansByCampus(campusId);
      res.json(guardians);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching guardians" });
    }
  });

  // Get students (real data from database)
  app.get("/api/students", authenticateToken, async (req, res) => {
    try {
      const role = (req as any).user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.STUDENTS, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver alumnos" });
      }
      const campusId = (req as any).user?.campus_id;
      
      if (!campusId) {
        return res.status(400).json({ message: "Campus ID requerido" });
      }
      
      const students = await storage.getStudentsByCampus(campusId);
      res.json(students);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching students" });
    }
  });

  // Get payments (real data from database)
  app.get("/api/payments", authenticateToken, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.PAYMENTS, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver pagos" });
      }
      const campusId = (req as any).user?.campus_id;
      
      if (!campusId) {
        return res.status(400).json({ message: "Campus ID requerido" });
      }
      
      const payments = await storage.getPaymentsByCampus(campusId);
      res.json(payments);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching payments" });
    }
  });

  // Get charges (real data from database)
  app.get("/api/charges", authenticateToken, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.CHARGES, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver cargos" });
      }
      const campusId = (req as any).user?.campus_id;
      
      if (!campusId) {
        return res.status(400).json({ message: "Campus ID requerido" });
      }
      
      const charges = await storage.getChargesByCampus(campusId);
      res.json(charges);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching charges" });
    }
  });

  // Get accounts receivable with detailed student and guardian information
  app.get("/api/accounts-receivable", authenticateToken, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.RECEIVABLES, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver cuentas por cobrar" });
      }
      const campusId = (req as any).user?.campus_id;
      
      if (!campusId) {
        return res.status(400).json({ message: "Campus ID requerido" });
      }
      
      const accountsReceivable = await storage.getAccountsReceivableByCampus(campusId);
      res.json(accountsReceivable);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching accounts receivable" });
    }
  });

  // Get scholarships (real data from database)
  app.get("/api/scholarships", authenticateToken, async (req, res) => {
    try {
      // ── Guard de rol ──────────────────────────────────────────────────────
      // Este endpoint nunca llegó a auditarse porque estaba roto por tabla
      // inexistente (scholarship_types). Ahora que la tabla existe, se aplica
      // el guard que corresponde: SCHOLARSHIPS.READ (ver permissions.ts).
      if (!hasPermissionForUser((req as any).user, MODULES.SCHOLARSHIPS, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para consultar becas" });
      }

      const campusId = (req as any).user?.campus_id;
      
      if (!campusId) {
        return res.status(400).json({ message: "Campus ID requerido" });
      }
      
       // Becas reales del campus con tipo de beca incluido.
       // Columnas reales de la tabla scholarships (DB real difiere del schema Drizzle):
       //   porcentaje (no porcentaje_aplicado), motivo (no observaciones),
       //   sin monto_fijo_aplicado_centavos.
      // Alias en el SELECT mantienen los nombres que espera el frontend.
      const rows = await pool.query(`
        SELECT s.id, s.student_id, s.scholarship_type_id,
               s.porcentaje               AS porcentaje_aplicado,
               s.motivo                   AS observaciones,
               COALESCE(s.estado, 'activa') AS estado,
               s.vigencia_inicio, s.vigencia_fin,
               st.nombre                  AS tipo_nombre,
               st.categoria               AS tipo_categoria,
               st.algoritmo                AS tipo_algoritmo,
               stu.nombre_completo        AS alumno,
               stu.nivel_escolar,
               stu.grado,
               stu.grupo,
               stu.status                 AS student_status,
               (
                 s.vigencia_inicio <= CURRENT_DATE
                 AND (s.vigencia_fin IS NULL OR s.vigencia_fin >= CURRENT_DATE)
                  AND COALESCE(s.estado, 'activa') = 'activa'
                 AND stu.status = 'activo'
               )                          AS vigente,
               COALESCE((
                 SELECT SUM(
                   (c.monto_base_centavos * COALESCE(c.beca_aplicada, 0) / 100)::bigint
                 )
                 FROM charges c
                 WHERE c.student_id = s.student_id
                   AND c.tenant_id = s.tenant_id
                   AND c.beca_aplicada > 0
                   AND c.fecha_emision <= CURRENT_DATE
               ), 0)                      AS monto_descuento_centavos
        FROM scholarships s
        JOIN students stu ON stu.id = s.student_id
        LEFT JOIN scholarship_types st ON st.id = s.scholarship_type_id
         WHERE stu.campus_id = $1
           AND s.tenant_id = $2
        ORDER BY stu.nombre_completo
       `, [campusId, (req as any).user?.tenant_id]).catch((err: any) => {
        // Catch visible: un error real de DB se registra en logs. El catch
        // silencioso anterior ocultó la ausencia de scholarship_types durante
        // tiempo indeterminado. Mantenemos degradación elegante (array vacío)
        // pero ahora el error es visible en los logs del servidor.
        console.error("[GET /api/scholarships] DB error:", err.message);
        return { rows: [] };
      });
      res.json(rows.rows);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching scholarships" });
    }
  });

  // ── GET /api/students/:studentId/estado-cuenta ────────────────────────────
  // Estado de cuenta completo del alumno para el admin.
  // Incluye: tutores (responsable de pago vs. solo contacto), todos los cargos
  // con su historia de pagos, y un resumen numérico.
  app.get("/api/students/:studentId/estado-cuenta", authenticateToken, async (req: any, res) => {
    try {
      if (!hasPermissionForUser(req.user, MODULES.CHARGES, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver estado de cuenta" });
      }
      const studentId = parseInt(req.params.studentId);
      if (isNaN(studentId)) return res.status(400).json({ message: "ID de alumno inválido" });

      // Verificar que el alumno pertenece al campus del usuario autenticado
      const studentRow = await pool.query(
        `SELECT id, nombre_completo, id_referencia, grado, grupo, campus_id, tenant_id, status
         FROM students WHERE id = $1`, [studentId]
      ).catch((e: any) => { throw new Error("Error al buscar alumno: " + e.message); });
      if (!studentRow.rows.length) return res.status(404).json({ message: "Alumno no encontrado" });
      const student = studentRow.rows[0] as any;
      if (!await checkCampusTenant(student.campus_id, req.user?.tenant_id, res)) return;

      // Tutores con su rol de responsabilidad
      const tutoresResult = await pool.query(`
        SELECT g.id, g.nombre_completo, g.email, g.telefono, g.tipo_guardian AS parentesco,
               sg.es_responsable_pago, sg.porcentaje_responsabilidad
        FROM guardians g
        JOIN student_guardian sg ON sg.guardian_id = g.id
        WHERE sg.student_id = $1
        ORDER BY sg.es_responsable_pago DESC, g.nombre_completo
      `, [studentId]).catch((e: any) => { throw new Error("Error al buscar tutores: " + e.message); });

      // Cargos con beca, recargos y pagos aplicados
      const cargosResult = await pool.query(`
        SELECT c.id, c.ciclo_escolar, c.fecha_emision, c.fecha_vencimiento,
               c.monto_base_centavos, c.beca_aplicada, c.recargo_aplicado_centavos,
               c.estado, co.nombre AS concepto,
               COALESCE(SUM(pa.amount_centavos), 0)::bigint AS pagado_centavos,
               ROUND(c.monto_base_centavos * COALESCE(c.beca_aplicada,0) / 100)::bigint AS descuento_centavos
        FROM charges c
        JOIN concepts co ON co.id = c.concept_id
        LEFT JOIN payment_applications pa ON pa.charge_id = c.id
        WHERE c.student_id = $1
        GROUP BY c.id, co.nombre
        ORDER BY c.fecha_vencimiento DESC
      `, [studentId]).catch((e: any) => { throw new Error("Error al buscar cargos: " + e.message); });

      // Saldo a favor: solo créditos ACTIVOS (status='activo').
      // Los consumidos ya generaron una payment_application y no se cuentan dos veces.
      const creditRes = await pool.query(
        `SELECT COALESCE(SUM(fc.amount_centavos), 0)::bigint AS saldo_a_favor
         FROM family_credits fc
         WHERE fc.status = 'activo'
           AND (
             fc.student_id = $1
             OR fc.family_id IN (
               SELECT fs.family_id FROM family_students fs WHERE fs.student_id = $1
             )
           )`,
        [studentId]
      ).catch(() => ({ rows: [{ saldo_a_favor: 0 }] }));
      const saldoAFavor = Number((creditRes.rows as any[])[0]?.saldo_a_favor ?? 0);

      // Resumen financiero
      const cargos = cargosResult.rows as any[];
      const totalCargos = cargos.reduce((s, c) => s + Number(c.monto_base_centavos), 0);
      const totalDescuentos = cargos.reduce((s, c) => s + Number(c.descuento_centavos), 0);
      const totalRecargos = cargos.reduce((s, c) => s + Number(c.recargo_aplicado_centavos || 0), 0);
      const totalPagado = cargos.reduce((s, c) => s + Number(c.pagado_centavos), 0);
      const saldoPendiente = totalCargos - totalDescuentos + totalRecargos - totalPagado;

      res.json({
        alumno: student,
        tutores: (tutoresResult.rows as any[]).map(t => ({
          ...t,
          rol: t.es_responsable_pago ? "responsable_pago" : "solo_contacto",
        })),
        cargos,
        resumen: {
          total_cargos_centavos:     totalCargos,
          total_descuentos_centavos: totalDescuentos,
          total_recargos_centavos:   totalRecargos,
          total_pagado_centavos:     totalPagado,
          saldo_a_favor_centavos:    saldoAFavor,
          saldo_pendiente_centavos:  Math.max(0, saldoPendiente),
          saldo_neto_centavos:       Math.max(0, saldoPendiente - saldoAFavor),
        },
      });
    } catch (error: any) {
      console.error("[estado-cuenta]", error.message);
      if (!res.headersSent) res.status(500).json({ message: "Error en estado de cuenta" });
    }
  });

  // R6 — GET /api/admin/admissions-report
  // RETIRADO. Migrado a RPT-04: GET /api/reportes/admisiones
  // (server/routes/reportes-admisiones.ts)
  // Agrega filtros ciclo/nivel/estado/fecha_desde/fecha_hasta,
  // ADMISSIONS.READ guard, y POST /api/reportes/admisiones/exportar.

  // Create new student
  app.post("/api/admin/students", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!hasPermissionForUser(user, MODULES.STUDENTS, ACTIONS.CREATE)) {
        return res.status(403).json({ message: "Sin permisos para crear alumnos" });
      }
      const studentData = req.body;
      
      // campus_id y tenant_id SIEMPRE se derivan del JWT, nunca del body del request
      studentData.campus_id = user.campus_id;
      studentData.tenant_id = user.tenant_id;
      
      const student = await storage.createStudent(studentData);
      
      // Notify real-time update
      wsManager.notifyStudentUpdate(student, 'create', {
        campus_id: studentData.campus_id || user.campus_id,
        tenant_id: user.tenant_id,
        created_by: user.id
      });
      
      res.status(201).json(student);
    } catch (error: any) {
      res.status(500).json({ message: "Error creating student" });
    }
  });

  /**
   * PATCH /api/admin/students/:studentId
   * Actualiza los datos propios del alumno (no tutores).
   */
  app.patch("/api/admin/students/:studentId", authenticateToken, async (req: any, res) => {
    try {
      if (!hasPermissionForUser(req.user, MODULES.STUDENTS, ACTIONS.UPDATE)) {
        return res.status(403).json({ message: "Sin permisos para editar alumnos" });
      }
      const studentId = parseInt(req.params.studentId);
      const campusId  = req.user?.campus_id;
      const tenantId  = req.user?.tenant_id;

      // Verificar que el alumno pertenece al campus del token
      const student = await getStudentInCurrentScope(studentId, req.user);
      if (!student) {
        return res.status(403).json({ message: "Alumno no encontrado en tu campus" });
      }

      const parsedBody = updateStudentSchema.safeParse(req.body);
      if (!parsedBody.success) {
        const unknownFields = parsedBody.error.issues
          .filter((issue) => issue.code === "unrecognized_keys")
          .flatMap((issue) => issue.code === "unrecognized_keys" ? issue.keys : []);
        const message = unknownFields.length > 0
          ? `Campos no permitidos: ${unknownFields.join(", ")}`
          : "Datos inválidos para actualizar el alumno";

        return res.status(400).json({
          message,
          errors: parsedBody.error.flatten(),
        });
      }

      const {
        nombres, apellido_paterno, apellido_materno, curp,
        fecha_nacimiento, correo_institucional,
        nivel_escolar, grado, grupo, turno, status,
      } = parsedBody.data;

      // Validar CURP si viene en el body (edición individual — error bloqueante)
      if (curp) {
        const { validarCurp, normalizarCurp } = await import("../lib/validators");
        const curpNorm = normalizarCurp(curp);
        if (!validarCurp(curpNorm)) {
          return res.status(400).json({ message: `CURP inválida: "${curpNorm}". Verifique el formato oficial SAT de 18 caracteres.` });
        }
      }

      await pool.query(
        `UPDATE students SET
           nombres = COALESCE($1, nombres),
           apellido_paterno = COALESCE($2, apellido_paterno),
           apellido_materno = COALESCE($3, apellido_materno),
           curp = COALESCE($4, curp),
           fecha_nacimiento = COALESCE($5, fecha_nacimiento),
           correo_institucional = COALESCE($6, correo_institucional),
           nivel_escolar = COALESCE($7, nivel_escolar),
           grado = COALESCE($8, grado),
           grupo = COALESCE($9, grupo),
           turno = COALESCE($10, turno),
           status = COALESCE($11, status),
           updated_at = NOW()
         WHERE id = $12 AND campus_id = $13`,
        [
          nombres || null, apellido_paterno || null, apellido_materno || null,
          curp || null, fecha_nacimiento || null, correo_institucional || null,
          nivel_escolar || null, grado || null, grupo || null, turno || null,
          status || null,
          studentId, campusId,
        ]
      );

      const updated = await pool.query(
        `SELECT * FROM students WHERE id = $1`,
        [studentId]
      );
      res.json(updated.rows[0]);
    } catch (error: any) {
      console.error("Error updating student:", error);
      res.status(500).json({ message: "Error al actualizar alumno" });
    }
  });

  /**
   * GET /api/admin/students/:studentId/guardians
   * Devuelve los tutores vinculados a un alumno con su estado de responsabilidad de pago.
   * Solo accesible para administradores del mismo tenant.
   */
  app.get("/api/admin/students/:studentId/guardians", authenticateToken, async (req: any, res) => {
    try {
      if (!hasPermissionForUser(req.user, MODULES.FAMILIES, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver tutores del alumno" });
      }
      const studentId = parseInt(req.params.studentId);
      const tenantId  = req.user?.tenant_id;
      const campusId  = req.user?.campus_id;

      // Verificar tenant y campus: pertenecer al mismo tenant no concede acceso
      // al expediente de otro campus.
      const studentCheck = await pool.query(
        `SELECT id FROM students WHERE id = $1 AND tenant_id = $2 AND campus_id = $3`,
        [studentId, tenantId, campusId]
      );
      if (studentCheck.rows.length === 0) {
        return res.status(404).json({ message: "Alumno no encontrado" });
      }

      const result = await pool.query(`
        SELECT
          g.id,
          g.nombres,
          g.apellido_paterno,
          g.apellido_materno,
          g.nombre_completo,
          g.tipo_guardian,
          g.es_padre,
          g.es_madre,
          g.email,
          g.correo_institucional_familiar,
          g.celular,
          g.telefono,
          g.telefono_casa_oficina,
          sg.es_responsable_pago,
          sg.porcentaje_responsabilidad
        FROM student_guardian sg
        JOIN guardians g ON g.id = sg.guardian_id
        WHERE sg.student_id = $1
        ORDER BY sg.es_responsable_pago DESC, g.apellido_paterno ASC
      `, [studentId]);

      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  /**
   * PATCH /api/admin/students/:studentId/guardians/:guardianId
   * Actualiza es_responsable_pago y/o porcentaje_responsabilidad en student_guardian.
   * Valida que no se deje al alumno sin ningún responsable de pago.
   */
  app.patch("/api/admin/students/:studentId/guardians/:guardianId", authenticateToken, async (req: any, res) => {
    try {
      if (!hasPermissionForUser(req.user, MODULES.FAMILIES, ACTIONS.UPDATE)) {
        return res.status(403).json({ message: "Sin permisos para editar responsabilidad de tutores" });
      }
      const studentId  = parseInt(req.params.studentId);
      const guardianId = parseInt(req.params.guardianId);
      const tenantId   = req.user?.tenant_id;
      const campusId   = req.user?.campus_id;
      const { es_responsable_pago, porcentaje_responsabilidad } = req.body;

      // Verificar tenant y campus antes de tocar una relación alumno-tutor.
      const studentCheck = await pool.query(
        `SELECT id FROM students WHERE id = $1 AND tenant_id = $2 AND campus_id = $3`,
        [studentId, tenantId, campusId]
      );
      if (studentCheck.rows.length === 0) {
        return res.status(404).json({ message: "Alumno no encontrado" });
      }

      // Si se intenta desactivar, verificar que quede al menos otro responsable
      if (es_responsable_pago === false) {
        const otrosResponsables = await pool.query(`
          SELECT COUNT(*) AS cnt
          FROM student_guardian
          WHERE student_id = $1
            AND guardian_id != $2
            AND es_responsable_pago = true
        `, [studentId, guardianId]);

        if (Number((otrosResponsables.rows[0] as any).cnt) === 0) {
          return res.status(422).json({
            message: "No se puede desactivar: el alumno quedaría sin ningún responsable de pago. Asigna primero a otro tutor como responsable."
          });
        }
      }

      // Construir campos a actualizar
      const updates: string[] = [];
      const values: any[]    = [];
      let idx = 1;

      if (es_responsable_pago !== undefined) {
        updates.push(`es_responsable_pago = $${idx++}`);
        values.push(es_responsable_pago);
      }
      if (porcentaje_responsabilidad !== undefined) {
        updates.push(`porcentaje_responsabilidad = $${idx++}`);
        values.push(porcentaje_responsabilidad);
      }

      if (updates.length === 0) {
        return res.status(400).json({ message: "Sin campos para actualizar" });
      }

      values.push(studentId, guardianId);
      const result = await pool.query(`
        UPDATE student_guardian
        SET ${updates.join(", ")}
        WHERE student_id = $${idx} AND guardian_id = $${idx + 1}
        RETURNING *
      `, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Relación alumno-tutor no encontrada" });
      }

      res.json(result.rows[0]);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // Import students from Excel/CSV
  app.post("/api/admin/students/import", authenticateToken, upload.single('file'), async (req, res) => {
    try {
      const user = (req as any).user;
      if (!hasPermissionForUser(user, MODULES.STUDENTS, ACTIONS.IMPORT)) {
        return res.status(403).json({ message: "Sin permisos para importar alumnos" });
      }
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ message: "No se proporcionó archivo" });
      }

      let jsonData: any[] = [];
      
      // Process file based on type
      if (file.mimetype === 'text/csv') {
        // Parse CSV
        const csvContent = file.buffer.toString('utf-8').replace(/^\uFEFF/, ''); // Remove BOM
        const lines = csvContent.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
          return res.status(400).json({ message: "El archivo CSV debe tener al menos una fila de encabezados y una fila de datos" });
        }
        
        const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
        
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.replace(/"/g, '').trim());
          const obj: any = {};
          headers.forEach((header, index) => {
            obj[header] = values[index] || '';
          });
          // Filtro de fila: acepta las mismas variantes que el mapeo de columnas
          if (obj['Nombre Completo'] || obj['nombre_completo'] || obj['Nombre'] ||
              obj['CURP'] || obj['curp']) {
            jsonData.push(obj);
          }
        }
      } else {
        // Parse Excel
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        jsonData = XLSX.utils.sheet_to_json(sheet);
      }

      if (jsonData.length === 0) {
        return res.status(400).json({ message: "No se encontraron datos válidos en el archivo" });
      }

      // Transform and validate data
      const studentsToCreate = [];
      const errors = [];

      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        const rowNum = i + 2; // Account for header row
        
        try {
          // Map column names (flexible mapping)
          const studentData = {
            campus_id: user.campus_id,
            tenant_id: user.tenant_id,  // SIEMPRE del JWT
            curp: row['CURP'] || row['curp'] || '',
            nombres: row['Nombre Completo'] || row['nombre_completo'] || row['Nombre'] || '',
            grado: row['Grado'] || row['grado'] || '',
            grupo: row['Grupo'] || row['grupo'] || '',
            status: row['Estatus'] || row['status'] || row['Status'] || 'activo'
          };

          // Validate required fields
          if (!studentData.nombres.trim()) {
            errors.push(`Fila ${rowNum}: Nombre completo es requerido`);
            continue;
          }

          // Validate CURP format if provided (patrón oficial SAT, incluye X para no binarios)
          if (studentData.curp) {
            const { validarCurp, normalizarCurp } = await import("../lib/validators");
            studentData.curp = normalizarCurp(studentData.curp);
            if (!validarCurp(studentData.curp)) {
              errors.push(`Fila ${rowNum}: CURP inválida (${studentData.curp}) — verifique el formato oficial de 18 caracteres`);
              continue;
            }
          }

          studentsToCreate.push(studentData);
        } catch (error) {
          errors.push(`Fila ${rowNum}: Error procesando datos`);
        }
      }

      if (errors.length > 0 && studentsToCreate.length === 0) {
        return res.status(400).json({ 
          message: "No se pudieron procesar los datos",
          errors: errors 
        });
      }

      // ── dry_run: igual que el resto de endpoints de import ───────────────────
      const isDryRun =
        req.query.dry_run === 'true' ||
        req.query.dry_run === '1'    ||
        (req as any).body?.dry_run === true ||
        (req as any).body?.dry_run === 'true';

      // ── Creación atómica con BEGIN / SAVEPOINT por fila / COMMIT|ROLLBACK ────
      //
      // Por qué SAVEPOINT por fila y no una sola transacción rígida:
      //   • Error de validación de fila → ya filtrado arriba (studentsToCreate
      //     solo tiene filas que pasaron la fase de validación del frontend).
      //   • Error de DB en fila N (ej. nombre > varchar 255) → SAVEPOINT hace
      //     ROLLBACK solo de esa fila; las demás continúan → mismo comportamiento
      //     observable que antes, pero ahora dentro de BEGIN/COMMIT.
      //   • Error fatal de conexión → ROLLBACK total: cero filas quedan escritas.
      //
      // Por qué no storage.createStudent:
      //   storage.createStudent usa Drizzle (conexión propia) y no puede
      //   participar en el BEGIN/COMMIT de este pool.connect().
      //   Se hace INSERT inline idéntico, con RETURNING * para obtener el
      //   objeto alumno que espera wsManager.notifyStudentUpdate.

      const createdStudents: any[] = [];
      const creationErrors: string[] = [];

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        for (let i = 0; i < studentsToCreate.length; i++) {
          const studentData = studentsToCreate[i];
          const sp = `sp_stu_${i}`;
          await client.query(`SAVEPOINT ${sp}`);
          try {
            const result = await client.query(
              `INSERT INTO students
                 (campus_id, tenant_id, nombres, nombre_completo, curp,
                  grado, grupo, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               RETURNING *`,
              [
                studentData.campus_id,
                studentData.tenant_id,
                studentData.nombres,
                studentData.nombres,   // nombre_completo ← NOT NULL en la DB real
                studentData.curp  || null,
                studentData.grado || null,
                studentData.grupo || 'A',
                studentData.status || 'activo',
              ],
            );
            createdStudents.push(result.rows[0]);
            await client.query(`RELEASE SAVEPOINT ${sp}`);
          } catch (rowErr: any) {
            await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
            creationErrors.push(
              `Error creando estudiante ${studentData.nombres}: ${rowErr.message}`,
            );
          }
        }

        if (isDryRun) {
          await client.query('ROLLBACK');
          // dry_run → devolvemos conteos pero vaciamos created_students
          //           (ninguna fila quedó en DB)
          return res.json({
            message: 'Importación completada',
            total_processed: jsonData.length,
            successful: createdStudents.length,
            errors: [...errors, ...creationErrors],
            created_students: [],
          });
        }

        await client.query('COMMIT');

        // ── WS por alumno — igual que antes, después del COMMIT ──────────────
        for (const student of createdStudents) {
          wsManager.notifyStudentUpdate(student, 'create', {
            campus_id: user.campus_id,
            tenant_id: user.tenant_id,
            created_by: user.id,
          });
        }

        // ── Auditoría — fuera de txn commiteada, fire-and-forget ─────────────
        const auditPayload = {
          tenant_id:   user.tenant_id,
          user_id:     user.id,
          action:      'STUDENTS_IMPORT',
          entity_type: 'students',
          entity_id:   user.campus_id,
          metadata: {
            total:      jsonData.length,
            successful: createdStudents.length,
            failed:     creationErrors.length,
            validation_errors: errors.length,
          },
        };
        pool.query(
          `INSERT INTO audit_log
             (tenant_id, user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            auditPayload.tenant_id,
            auditPayload.user_id,
            auditPayload.action,
            auditPayload.entity_type,
            auditPayload.entity_id,
            JSON.stringify(auditPayload.metadata),
          ],
        ).catch((err) => enqueueAuditLog(auditPayload, err));

      } catch (fatalError: any) {
        await client.query('ROLLBACK').catch(() => {});
        client.release();
        return res.status(500).json({ message: 'Error importing students' });
      } finally {
        // release solo si no fue liberado ya en el catch de error fatal
        try { client.release(); } catch {}
      }

      // ── Respuesta — formato idéntico al contrato actual con estudiantes.tsx ──
      res.json({
        message: `Importación completada`,
        total_processed: jsonData.length,
        successful: createdStudents.length,
        errors: [...errors, ...creationErrors],
        created_students: createdStudents,
      });

    } catch (error: any) {
      res.status(500).json({ message: "Error importing students" });
    }
  });

  // ── POST /api/admin/family-credits/:creditId/aplicar ─────────────────────────
  /**
   * Aplica un saldo a favor (family_credits) a un cargo pendiente.
   *
   * PRINCIPIO DEL LEDGER: el crédito se consume creando una PaymentApplication
   * nueva contra el payment_id original que generó el excedente, y apuntando al
   * charge nuevo.  De esta forma el balance de la familia es 100% calculable
   * como SUM(charges) − SUM(payment_applications), sin ninguna query auxiliar.
   *
   * El registro de family_credits queda marcado como 'consumido' con referencia
   * a la PaymentApplication creada.  amount_centavos NUNCA se edita ni se borra.
   *
   * Si el crédito es mayor que el saldo pendiente del cargo (pago en exceso del
   * exceso), se crea un nuevo crédito activo por el remanente.
   *
   * Body: { charge_id: number }
   */
  app.post("/api/admin/family-credits/:creditId/aplicar", authenticateToken, async (req: any, res) => {
    try {
      const role = req.user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.PAYMENTS, ACTIONS.PROCESS)) {
        return res.status(403).json({ message: "Sin permisos para procesar pagos" });
      }
      const tenantId  = req.user?.tenant_id;
      const campusId  = req.user?.campus_id;
      const userId    = req.user?.id;
      const creditId  = parseInt(req.params.creditId);
      const chargeId  = parseInt(req.body?.charge_id);

      if (isNaN(creditId) || isNaN(chargeId)) {
        return res.status(400).json({ message: "creditId y charge_id deben ser enteros válidos" });
      }

      const client = await pool.connect();
      let newPaId!: number;
      let montoAplicado!: number;
      let newChargeEstado!: string;
      let remanente = 0;
      let newCreditId: number | null = null;

      try {
        await client.query("BEGIN");

        // ── Bloquear el crédito y verificar que sigue activo ─────────────────
        const creditLock = await client.query(
          `SELECT id, payment_id, amount_centavos, status, student_id, family_id, tenant_id
           FROM family_credits WHERE id = $1 FOR UPDATE`,
          [creditId]
        );
        if (!creditLock.rows.length) {
          await client.query("ROLLBACK");
          return res.status(404).json({ message: "Crédito no encontrado" });
        }
        const credit = creditLock.rows[0] as any;
        if (Number(credit.tenant_id) !== tenantId) {
          await client.query("ROLLBACK");
          return res.status(403).json({ message: "El crédito no pertenece a tu institución" });
        }
        if (credit.status !== "activo") {
          await client.query("ROLLBACK");
          return res.status(409).json({ message: "El crédito ya fue consumido o no está activo" });
        }

        // ── Bloquear el cargo y verificar que está pendiente ─────────────────
        const chargeLock = await client.query(
          `SELECT c.id, c.monto_base_centavos, c.estado, c.student_id, s.campus_id
           FROM charges c JOIN students s ON s.id = c.student_id
           WHERE c.id = $1 AND c.tenant_id = $2 FOR UPDATE`,
          [chargeId, tenantId]
        );
        if (!chargeLock.rows.length) {
          await client.query("ROLLBACK");
          return res.status(404).json({ message: "Cargo no encontrado" });
        }
        const charge = chargeLock.rows[0] as any;
        if (Number(charge.campus_id) !== campusId) {
          await client.query("ROLLBACK");
          return res.status(403).json({ message: "El cargo no pertenece a tu campus" });
        }
        if (["pagado", "cancelado"].includes(charge.estado)) {
          await client.query("ROLLBACK");
          return res.status(409).json({ message: "El cargo ya está pagado o cancelado" });
        }

        // ── Validar que el crédito pertenece al mismo alumno o familia que el cargo ─
        // Evita que el crédito de la familia A se aplique a un cargo de la familia B.
        const chargeStudentId = Number(charge.student_id);
        const creditStudentId = Number(credit.student_id);
        if (chargeStudentId !== creditStudentId) {
          const familyCheck = await client.query(
            `SELECT 1 FROM (
               -- Ambos alumnos comparten una familia
               SELECT fs1.family_id
               FROM family_students fs1
               JOIN family_students fs2 ON fs1.family_id = fs2.family_id
               WHERE fs1.student_id = $1 AND fs2.student_id = $2
               UNION ALL
               -- El crédito tiene family_id explícito que incluye al alumno del cargo
               SELECT family_id FROM family_students
               WHERE family_id = $3 AND student_id = $2
             ) t LIMIT 1`,
            [creditStudentId, chargeStudentId, credit.family_id]
          );
          if (!familyCheck.rows.length) {
            await client.query("ROLLBACK");
            return res.status(403).json({ message: "El crédito no corresponde al alumno o familia del cargo" });
          }
        }

        // ── Saldo pendiente real del cargo (vía payment_applications) ─────────
        const saldoRes = await client.query(
          `SELECT COALESCE(SUM(pa.amount_centavos), 0)::bigint AS ya_pagado
           FROM payment_applications pa WHERE pa.charge_id = $1`,
          [chargeId]
        );
        const yaPagado = Number(saldoRes.rows[0].ya_pagado);
        const saldoPendiente = Number(charge.monto_base_centavos) - yaPagado;

        if (saldoPendiente <= 0) {
          await client.query("ROLLBACK");
          return res.status(409).json({ message: "El cargo ya tiene saldo cero" });
        }

        const creditAmount = Number(credit.amount_centavos);
        montoAplicado  = Math.min(creditAmount, saldoPendiente);
        remanente      = creditAmount - montoAplicado;  // > 0 si el crédito excede el cargo
        newChargeEstado = montoAplicado >= saldoPendiente ? "pagado" : "parcial";

        // ── Crear PaymentApplication contra el payment original ───────────────
        // Principio del ledger: el balance SUM(charges)-SUM(payment_applications) es
        // la única fuente de verdad.  Esta PA cubre el nuevo cargo usando el payment
        // del excedente original, sin tocar ni crear otro Payment.
        const paRes = await client.query(
          `INSERT INTO payment_applications (payment_id, charge_id, amount_centavos, applied_at)
           VALUES ($1, $2, $3, NOW()) RETURNING id`,
          [credit.payment_id, chargeId, montoAplicado]
        );
        newPaId = (paRes.rows as any[])[0].id;

        // ── Actualizar estado del cargo ────────────────────────────────────────
        await client.query(
          `UPDATE charges SET estado = $1, updated_at = NOW() WHERE id = $2`,
          [newChargeEstado, chargeId]
        );

        // ── Marcar el crédito como consumido (sin editar amount_centavos) ─────
        await client.query(
          `UPDATE family_credits
           SET status = 'consumido',
               consumed_application_id = $1,
               consumed_at = NOW()
           WHERE id = $2`,
          [newPaId, creditId]
        );

        // ── Si el crédito excedía el saldo del cargo, crear nuevo crédito activo
        if (remanente > 0) {
          const remRes = await client.query(
            `INSERT INTO family_credits
               (tenant_id, campus_id, family_id, student_id, payment_id,
                amount_centavos, origen, descripcion)
             VALUES ($1, $2, $3, $4, $5, $6, 'excedente_caja',
                     'Remanente de crédito #' || $7 || ' tras aplicación parcial')
             RETURNING id`,
            [
              tenantId, campusId, credit.family_id, credit.student_id,
              credit.payment_id, remanente, creditId,
            ]
          );
          newCreditId = (remRes.rows as any[])[0].id;
        }

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      // ── Audit fuera de la transacción (ADR-001) ────────────────────────────
      const auditPayloadCredit: import("../audit-retry").AuditLogPayload = {
        tenant_id:   tenantId,
        user_id:     userId,
        action:      "credit.applied",
        entity_type: "family_credit",
        entity_id:   creditId,
        new_value:   { status: "consumido", monto_aplicado: montoAplicado },
        metadata:    {
          charge_id: chargeId, payment_application_id: newPaId,
          charge_nuevo_estado: newChargeEstado,
          remanente_centavos: remanente,
          nuevo_credit_id: newCreditId,
        },
      };
      pool.query(
        `INSERT INTO audit_log
           (tenant_id, user_id, action, entity_type, entity_id, new_value, metadata)
         VALUES ($1,$2,'credit.applied','family_credit',$3,$4,$5)`,
        [
          tenantId, userId, creditId,
          JSON.stringify(auditPayloadCredit.new_value),
          JSON.stringify(auditPayloadCredit.metadata),
        ]
      ).catch((err) => enqueueAuditLog(auditPayloadCredit, err));

      res.json({
        message: `Crédito aplicado al cargo (${newChargeEstado})${remanente > 0 ? ` — remanente de $${(remanente / 100).toFixed(2)} registrado como nuevo crédito activo` : ""}`,
        payment_application_id: newPaId,
        monto_aplicado_centavos: montoAplicado,
        charge_nuevo_estado:     newChargeEstado,
        remanente_centavos:      remanente,
        nuevo_credit_id:         newCreditId,
      });
    } catch (error: any) {
      console.error("[family-credits/aplicar]", error.message);
      if (!res.headersSent) res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── GET /api/admin/alertas/condonaciones — Protocolo §8 ──────────────────
  // Devuelve alertas ALERTA_CONDONACION_REPETIDA del tenant, ordenadas por
  // fecha descendente. Solo accesible a administrador_general y super_admin.
  // (administrador_campus también tiene FINANCIAL.READ, por eso el guard es
  //  por rol explícito y no por permiso de módulo.)
  app.get("/api/admin/alertas/condonaciones", authenticateToken, async (req: any, res) => {
    try {
      const role     = req.user?.role;
      const tenantId = req.user?.tenant_id;
      if (!['administrador_general', 'super_admin'].includes(role)) {
        return res.status(403).json({ message: "Sin permisos para ver alertas de condonaciones" });
      }
      const rows = await pool.query(
        `SELECT id, user_id, entity_id AS plan_id, metadata, created_at
         FROM audit_log
         WHERE tenant_id = $1
           AND action = 'ALERTA_CONDONACION_REPETIDA'
         ORDER BY created_at DESC
         LIMIT 50`,
        [tenantId]
      );
      res.json(rows.rows);
    } catch (error: any) {
      res.status(500).json({ message: "Error al obtener alertas de condonaciones" });
    }
  });

  // ── POST /api/admin/alertas/condonaciones/:planId/override-token ──────────
  // Genera un JWT de 30 minutos que autoriza a ejecutar una condonación adicional
  // cuando ya existe una activa en los últimos 90 días para el mismo alumno o familia.
  //
  // El token incluye tenant_id y campus_id para que NO pueda usarse en otro plantel.
  // El campo 'motivo' (≥10 chars) queda grabado en audit_log: el administrador_general
  // debe dejar constancia de por qué autorizó la repetición, no solo que lo hizo.
  // El campo 'alerta_id' vincula el token a la ALERTA_CONDONACION_REPETIDA original,
  // creando la cadena: alerta → token generado → condonación ejecutada.
  //
  // Solo administrador_general y super_admin pueden emitirlo.
  app.post("/api/admin/alertas/condonaciones/:planId/override-token", authenticateToken, async (req: any, res) => {
    try {
      const role     = req.user?.role;
      const tenantId = req.user?.tenant_id;
      const userId   = req.user?.id;

      if (!['administrador_general', 'super_admin'].includes(role)) {
        return res.status(403).json({ message: "Sin permisos para emitir tokens de autorización de condonación" });
      }

      const planId              = parseInt(req.params.planId);
      const { motivo, alerta_id } = req.body;

      if (!motivo || String(motivo).trim().length < 10) {
        return res.status(400).json({
          message: "El campo 'motivo' es obligatorio y debe tener mínimo 10 caracteres para registrar la razón de la autorización",
        });
      }
      if (alerta_id === undefined || alerta_id === null || isNaN(Number(alerta_id))) {
        return res.status(400).json({
          message: "El campo 'alerta_id' es obligatorio: debe corresponder al id de la ALERTA_CONDONACION_REPETIDA que activa esta autorización",
        });
      }

      // Validar que el plan existe y pertenece al tenant
      const planRes = await pool.query(
        `SELECT id, student_id, campus_id, tenant_id FROM payment_plans WHERE id = $1`,
        [planId]
      );
      if ((planRes.rows as any[]).length === 0) {
        return res.status(404).json({ message: "Plan no encontrado" });
      }
      const plan = (planRes.rows as any[])[0];
      if (Number(plan.tenant_id) !== Number(tenantId)) {
        return res.status(403).json({ message: "El plan no pertenece a este tenant" });
      }

      // Validar que la alerta existe y pertenece al mismo tenant
      const alertaRes = await pool.query(
        `SELECT id FROM audit_log
         WHERE id = $1
           AND tenant_id = $2
           AND action = 'ALERTA_CONDONACION_REPETIDA'
           AND entity_type = 'payment_plan'
           AND entity_id = $3`,
        [Number(alerta_id), tenantId, planId]
      );
      if ((alertaRes.rows as any[]).length === 0) {
        return res.status(404).json({ message: "Alerta no encontrada o no corresponde a este tenant" });
      }

      // Generar token con todo lo necesario para la validación exacta en el PATCH cancelar.
      // campus_id y tenant_id incluidos: un token de un plantel no puede usarse en otro.
      const token = jwt.sign(
        {
          action:     'override_condonacion',
          plan_id:    planId,
          student_id: Number(plan.student_id),
          tenant_id:  Number(tenantId),
          campus_id:  Number(plan.campus_id),
          alerta_id:  Number(alerta_id),
        },
        JWT_SECRET,
        { expiresIn: '30m' }
      );

      // Registrar la autorización en audit_log con el motivo — trazabilidad completa.
      // El admin_general no puede generar un token sin dejar constancia de por qué.
      const overrideMeta = {
        plan_id:    planId,
        student_id: Number(plan.student_id),
        alerta_id:  Number(alerta_id),
        motivo:     String(motivo).trim(),
        campus_id:  Number(plan.campus_id),
      };
      pool.query(
        `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
         VALUES ($1,$2,'generacion_override_condonacion','payment_plan',$3,$4)`,
        [tenantId, userId ?? null, planId, JSON.stringify(overrideMeta)]
      ).catch((err: any) =>
        enqueueAuditLog({
          tenant_id: tenantId, user_id: userId ?? null,
          action: 'generacion_override_condonacion', entity_type: 'payment_plan',
          entity_id: planId, metadata: overrideMeta,
        }, err)
      );

      res.json({ token, expires_in: '30m', plan_id: planId, alerta_id: Number(alerta_id) });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  /**
   * POST /api/admin/students/:studentId/beca
   * Asigna una beca individual a un alumno del campus del JWT.
   *
   * Guard:  SCHOLARSHIPS.ASSIGN
   * Body:   { porcentaje (0<x≤100), motivo?, vigencia_inicio?, vigencia_fin? }
   * 201:    { id, student_id, alumno, porcentaje, vigencia_inicio, vigencia_fin,
   *           motivo, overlap_warning, becas_vigentes_previas }
   * Columnas escritas: solo las reales de la DB (porcentaje, motivo,
   *   vigencia_inicio, vigencia_fin, student_id, tenant_id). monto_fijo rechazado
   *   explícitamente — esa columna no existe en la DB real (verificado agosto 2026).
   * Overlap: se permiten múltiples becas vigentes simultáneas (el generador de cargos
   *   ya elige la de mayor porcentaje). overlap_warning=true advierte al admin.
   * Audit: fuera de transacción (ADR-001).
   */
  app.post("/api/admin/students/:studentId/beca", authenticateToken, async (req: any, res) => {
    try {
      if (!hasPermissionForUser(req.user, MODULES.SCHOLARSHIPS, ACTIONS.ASSIGN)) {
        return res.status(403).json({ message: "Sin permisos para asignar becas" });
      }

      const tenantId  = req.user?.tenant_id as number;
      const campusId  = req.user?.campus_id as number;
      const userId    = req.user?.id ?? null;
      const studentId = parseInt(req.params.studentId);

      const { porcentaje, motivo, vigencia_inicio, vigencia_fin, monto_fijo, scholarship_type_id } = req.body;

      // Guardia explícita: monto_fijo no existe como columna en la DB real
      if (monto_fijo !== undefined) {
        return res.status(400).json({
          message: "La columna monto_fijo no existe en DB — use porcentaje",
        });
      }

      // Validar porcentaje
      const pct = Number(porcentaje);
      if (!porcentaje || isNaN(pct) || pct <= 0 || pct > 100) {
        return res.status(400).json({
          message: "porcentaje es requerido y debe ser un número entre 1 y 100",
        });
      }

      // Resolver fechas con defaults
      const hoy   = new Date().toISOString().split("T")[0];
      const vinicio = vigencia_inicio ? String(vigencia_inicio).trim() : hoy;
      let vfin: string;
      if (vigencia_fin) {
        vfin = String(vigencia_fin).trim();
      } else {
        const d = new Date(vinicio);
        d.setFullYear(d.getFullYear() + 1);
        vfin = d.toISOString().split("T")[0];
      }

      if (vfin <= vinicio) {
        return res.status(400).json({
          message: "vigencia_fin debe ser posterior a vigencia_inicio",
        });
      }

      // Verificar que el alumno pertenece al campus/tenant del JWT
      // (scholarships no tiene campus_id — el aislamiento se hace vía JOIN a students)
      const alumnoRes = await pool.query(
        `SELECT id, nombre_completo FROM students
         WHERE id = $1 AND campus_id = $2 AND tenant_id = $3`,
        [studentId, campusId, tenantId]
      );
      if ((alumnoRes.rows as any[]).length === 0) {
        return res.status(404).json({ message: "Alumno no encontrado en este campus" });
      }
      const alumno = (alumnoRes.rows as any[])[0];

      let scholarshipTypeId: number | null = null;
      if (scholarship_type_id !== undefined && scholarship_type_id !== null && scholarship_type_id !== "") {
        scholarshipTypeId = Number(scholarship_type_id);
        if (!Number.isSafeInteger(scholarshipTypeId) || scholarshipTypeId <= 0) {
          return res.status(400).json({ message: "scholarship_type_id debe ser un entero positivo" });
        }
        const typeResult = await pool.query(
          `SELECT id FROM scholarship_types WHERE id = $1 AND campus_id = $2`,
          [scholarshipTypeId, campusId],
        );
        if (!typeResult.rows.length) {
          return res.status(404).json({ message: "Tipo de beca no encontrado en este campus" });
        }
      }

      // Comparte el bloqueo del motor automático: la decisión manual/automática
      // queda serializada por alumno incluso si ambas solicitudes llegan a la vez.
      const client = await pool.connect();
      let vigentes: any[] = [];
      let beca: any;
      try {
        await client.query("BEGIN");
        await client.query(
          `SELECT pg_advisory_xact_lock(($1::bigint * 1000000) + $2::bigint)`,
          [campusId, studentId],
        );
        const vigentesRes = await client.query(
          `SELECT id, porcentaje, vigencia_inicio, vigencia_fin
             FROM scholarships
            WHERE student_id = $1 AND tenant_id = $2
              AND vigencia_fin >= CURRENT_DATE
            ORDER BY porcentaje DESC
            FOR UPDATE`,
          [studentId, tenantId],
        );
        vigentes = vigentesRes.rows as any[];
        const insertRes = await client.query(
           `INSERT INTO scholarships
              (student_id, tenant_id, scholarship_type_id, porcentaje, motivo, vigencia_inicio, vigencia_fin)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, student_id, tenant_id, scholarship_type_id, porcentaje, motivo,
                      estado, vigencia_inicio, vigencia_fin, created_at`,
           [studentId, tenantId, scholarshipTypeId, pct, motivo || null, vinicio, vfin],
        );
        beca = (insertRes.rows as any[])[0];
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
      const overlapWarning = vigentes.length > 0;

      // Audit FUERA de transacción (ADR-001)
      const auditMeta = {
        porcentaje:      pct,
        motivo:          motivo || null,
        vigencia_inicio: vinicio,
        vigencia_fin:    vfin,
        scholarship_id:  beca.id,
        scholarship_type_id: scholarshipTypeId,
        campus_id:       campusId,
        overlap_warning: overlapWarning,
      };
      pool.query(
        `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
         VALUES ($1,$2,'beca_asignada','student',$3,$4)`,
        [tenantId, userId, studentId, JSON.stringify(auditMeta)]
      ).catch((err: any) =>
        enqueueAuditLog({
          tenant_id:   tenantId,
          user_id:     userId,
          action:      "beca_asignada",
          entity_type: "student",
          entity_id:   studentId,
          metadata:    auditMeta,
        }, err)
      );

      return res.status(201).json({
        id:                    beca.id,
        student_id:            beca.student_id,
        alumno:                alumno.nombre_completo,
        porcentaje:            Number(beca.porcentaje),
        vigencia_inicio:       beca.vigencia_inicio,
        vigencia_fin:          beca.vigencia_fin,
        motivo:                beca.motivo,
        overlap_warning:       overlapWarning,
        becas_vigentes_previas: overlapWarning ? vigentes : null,
      });
    } catch (error: any) {
      return res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  /**
   * PATCH /api/admin/scholarships/:id
   * Corrige una asignación individual sin tocar cargos ya emitidos. El cambio
   * sólo será considerado por el resolvedor al generar cargos posteriores.
   */
  app.patch("/api/admin/scholarships/:id", authenticateToken, async (req: any, res) => {
    if (!hasPermissionForUser(req.user, MODULES.SCHOLARSHIPS, ACTIONS.ASSIGN)) {
      return res.status(403).json({ message: "Sin permisos para editar becas" });
    }

    const scholarshipId = Number(req.params.id);
    if (!Number.isSafeInteger(scholarshipId) || scholarshipId <= 0) {
      return res.status(400).json({ message: "ID de beca inválido" });
    }
    const parsed = scholarshipAssignmentUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message || "Datos de beca inválidos",
      });
    }

    const tenantId = Number(req.user?.tenant_id);
    const campusId = Number(req.user?.campus_id);
    const userId = req.user?.id ?? null;
    const input = parsed.data;
    const client = await pool.connect();
    let previousValue: ReturnType<typeof scholarshipAssignmentSnapshot>;
    let newValue: ReturnType<typeof scholarshipAssignmentSnapshot>;
    try {
      await client.query("BEGIN");
      const currentResult = await client.query(
        `SELECT s.*, stu.nombre_completo AS alumno
           FROM scholarships s
           JOIN students stu ON stu.id = s.student_id
          WHERE s.id = $1
            AND s.tenant_id = $2
            AND stu.campus_id = $3
            AND stu.tenant_id = $2
          FOR UPDATE OF s`,
        [scholarshipId, tenantId, campusId],
      );
      const current = currentResult.rows[0] as any;
      if (!current) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Beca no encontrada en este campus" });
      }

      await client.query(
        `SELECT pg_advisory_xact_lock(($1::bigint * 1000000) + $2::bigint)`,
        [campusId, Number(current.student_id)],
      );
      previousValue = scholarshipAssignmentSnapshot(current);
      const vigenciaInicio = input.vigencia_inicio ?? previousValue.vigencia_inicio;
      const vigenciaFin = input.vigencia_fin ?? previousValue.vigencia_fin;
      if (vigenciaFin <= vigenciaInicio) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "vigencia_fin debe ser posterior a vigencia_inicio",
        });
      }

      const updateResult = await client.query(
        `UPDATE scholarships
            SET porcentaje = $1,
                motivo = $2,
                vigencia_inicio = $3,
                vigencia_fin = $4,
                updated_at = NOW()
          WHERE id = $5 AND tenant_id = $6
          RETURNING *`,
        [
          input.porcentaje ?? previousValue.porcentaje,
          input.motivo === undefined ? previousValue.motivo : input.motivo,
          vigenciaInicio,
          vigenciaFin,
          scholarshipId,
          tenantId,
        ],
      );
      newValue = scholarshipAssignmentSnapshot(updateResult.rows[0]);
      await client.query("COMMIT");
    } catch (error: any) {
      await client.query("ROLLBACK").catch(() => {});
      return res.status(500).json({ message: error.message || "No se pudo editar la beca" });
    } finally {
      client.release();
    }

    const auditPayload = {
      tenant_id: tenantId,
      user_id: userId,
      action: "beca_editada",
      entity_type: "scholarship",
      entity_id: scholarshipId,
      previous_value: previousValue!,
      new_value: newValue!,
      metadata: {
        campus_id: campusId,
        motivo_cambio: input.motivo_cambio,
        recalculate_existing_charges: false,
      },
    };
    pool.query(
      `INSERT INTO audit_log
        (tenant_id, user_id, action, entity_type, entity_id, previous_value, new_value, metadata)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)`,
      [
        auditPayload.tenant_id, auditPayload.user_id, auditPayload.action,
        auditPayload.entity_type, auditPayload.entity_id,
        JSON.stringify(auditPayload.previous_value), JSON.stringify(auditPayload.new_value),
        JSON.stringify(auditPayload.metadata),
      ],
    ).catch((error) => enqueueAuditLog(auditPayload, error));

    return res.json({
      ...newValue!,
      message: "La beca fue actualizada. Los cargos ya emitidos no cambiaron.",
    });
  });

  /**
   * PATCH /api/admin/scholarships/:id/estado
   * Suspender/reactivar es una decisión manual y nunca recalcula el ledger.
   */
  app.patch("/api/admin/scholarships/:id/estado", authenticateToken, async (req: any, res) => {
    if (!hasPermissionForUser(req.user, MODULES.SCHOLARSHIPS, ACTIONS.ASSIGN)) {
      return res.status(403).json({ message: "Sin permisos para cambiar el estado de becas" });
    }

    const scholarshipId = Number(req.params.id);
    if (!Number.isSafeInteger(scholarshipId) || scholarshipId <= 0) {
      return res.status(400).json({ message: "ID de beca inválido" });
    }
    const parsed = scholarshipStateChangeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message || "Cambio de estado inválido",
      });
    }

    const tenantId = Number(req.user?.tenant_id);
    const campusId = Number(req.user?.campus_id);
    const userId = req.user?.id ?? null;
    const { estado, motivo } = parsed.data;
    const client = await pool.connect();
    let previousValue: ReturnType<typeof scholarshipAssignmentSnapshot>;
    let newValue: ReturnType<typeof scholarshipAssignmentSnapshot>;
    try {
      await client.query("BEGIN");
      const currentResult = await client.query(
        `SELECT s.*
           FROM scholarships s
           JOIN students stu ON stu.id = s.student_id
          WHERE s.id = $1
            AND s.tenant_id = $2
            AND stu.campus_id = $3
            AND stu.tenant_id = $2
          FOR UPDATE OF s`,
        [scholarshipId, tenantId, campusId],
      );
      const current = currentResult.rows[0] as any;
      if (!current) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Beca no encontrada en este campus" });
      }

      previousValue = scholarshipAssignmentSnapshot(current);
      if (previousValue.estado === estado) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: `La beca ya está ${estado}` });
      }

      await client.query(
        `SELECT pg_advisory_xact_lock(($1::bigint * 1000000) + $2::bigint)`,
        [campusId, Number(current.student_id)],
      );
      const updateResult = await client.query(
        `UPDATE scholarships
            SET estado = $1, updated_at = NOW()
          WHERE id = $2 AND tenant_id = $3
          RETURNING *`,
        [estado, scholarshipId, tenantId],
      );
      newValue = scholarshipAssignmentSnapshot(updateResult.rows[0]);
      await client.query("COMMIT");
    } catch (error: any) {
      await client.query("ROLLBACK").catch(() => {});
      return res.status(500).json({ message: error.message || "No se pudo cambiar el estado de la beca" });
    } finally {
      client.release();
    }

    const auditPayload = {
      tenant_id: tenantId,
      user_id: userId,
      action: "beca_estado_actualizado",
      entity_type: "scholarship",
      entity_id: scholarshipId,
      previous_value: previousValue!,
      new_value: newValue!,
      metadata: {
        campus_id: campusId,
        motivo,
        recalculate_existing_charges: false,
      },
    };
    pool.query(
      `INSERT INTO audit_log
        (tenant_id, user_id, action, entity_type, entity_id, previous_value, new_value, metadata)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)`,
      [
        auditPayload.tenant_id, auditPayload.user_id, auditPayload.action,
        auditPayload.entity_type, auditPayload.entity_id,
        JSON.stringify(auditPayload.previous_value), JSON.stringify(auditPayload.new_value),
        JSON.stringify(auditPayload.metadata),
      ],
    ).catch((error) => enqueueAuditLog(auditPayload, error));

    return res.json({
      ...newValue!,
      message: estado === "suspendida"
        ? "Beca suspendida. Los cargos ya emitidos no fueron modificados."
        : "Beca reactivada para cargos futuros dentro de su vigencia.",
    });
  });

  /**
   * Catálogo de tipos de beca. El catálogo no modifica asignaciones ya
   * otorgadas ni activa automatismos por sí mismo.
   */
  app.get("/api/admin/scholarship-types", authenticateToken, async (req: any, res) => {
    if (!hasPermissionForUser(req.user, MODULES.SCHOLARSHIPS, ACTIONS.ASSIGN)) {
      return res.status(403).json({ message: "Sin permisos para administrar tipos de beca" });
    }
    const campusId = Number(req.user?.campus_id);
    try {
      const typesResult = await pool.query(
        `SELECT * FROM scholarship_types WHERE campus_id = $1 ORDER BY nombre ASC`,
        [campusId],
      );
      const types = typesResult.rows as any[];
      const ids = types.map((type) => Number(type.id));
      if (!ids.length) return res.json([]);
      const [benefitsResult, criteriaResult] = await Promise.all([
        pool.query(
          `SELECT * FROM scholarship_benefits
            WHERE scholarship_type_id = ANY($1::int[])
            ORDER BY id ASC`,
          [ids],
        ),
        pool.query(
          `SELECT * FROM scholarship_criteria
            WHERE scholarship_type_id = ANY($1::int[])
            ORDER BY id ASC`,
          [ids],
        ),
      ]);
      const benefitsByType = new Map<number, any>();
      for (const benefit of benefitsResult.rows as any[]) {
        if (!benefitsByType.has(Number(benefit.scholarship_type_id))) {
          benefitsByType.set(Number(benefit.scholarship_type_id), benefit);
        }
      }
      const criteriaByType = new Map<number, any[]>();
      for (const criterion of criteriaResult.rows as any[]) {
        const typeId = Number(criterion.scholarship_type_id);
        criteriaByType.set(typeId, [...(criteriaByType.get(typeId) ?? []), criterion]);
      }
      return res.json(types.map((type) => ({
        ...type,
        beneficio: benefitsByType.get(Number(type.id)) ?? null,
        criterios: criteriaByType.get(Number(type.id)) ?? [],
      })));
    } catch (error: any) {
      return res.status(500).json({ message: error.message || "No se pudieron consultar los tipos de beca" });
    }
  });

  app.post("/api/admin/scholarship-types", authenticateToken, async (req: any, res) => {
    if (!hasPermissionForUser(req.user, MODULES.SCHOLARSHIPS, ACTIONS.ASSIGN)) {
      return res.status(403).json({ message: "Sin permisos para crear tipos de beca" });
    }
    const parsed = scholarshipTypePayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message || "Datos de tipo de beca inválidos",
      });
    }
    const campusId = Number(req.user?.campus_id);
    const tenantId = Number(req.user?.tenant_id);
    const userId = req.user?.id ?? null;
    const input = parsed.data;
    const client = await pool.connect();
    let created: any;
    try {
      await client.query("BEGIN");
      const typeResult = await client.query(
        `INSERT INTO scholarship_types (campus_id, nombre, categoria, descripcion, algoritmo, activo)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING *`,
        [campusId, input.nombre, input.categoria, input.descripcion ?? null, input.algoritmo, input.activo],
      );
      const type = typeResult.rows[0] as any;
      const benefitResult = await client.query(
        `INSERT INTO scholarship_benefits
          (scholarship_type_id, tipo_beneficio, porcentaje_descuento, aplica_conceptos, vigencia_meses)
         VALUES ($1,'porcentaje',$2,$3,$4)
         RETURNING *`,
        [
          type.id,
          input.beneficio.porcentaje_descuento,
          input.beneficio.aplica_conceptos,
          input.beneficio.vigencia_meses,
        ],
      );
      const criterios: any[] = [];
      for (const criterion of input.criterios) {
        const criterionResult = await client.query(
          `INSERT INTO scholarship_criteria
            (scholarship_type_id, criterio, valor_minimo, valor_maximo, obligatorio)
           VALUES ($1,$2,$3,$4,$5)
           RETURNING *`,
          [
            type.id, criterion.criterio,
            criterion.valor_minimo ?? null, criterion.valor_maximo ?? null,
            criterion.obligatorio,
          ],
        );
        criterios.push(criterionResult.rows[0]);
      }
      created = { ...type, beneficio: benefitResult.rows[0], criterios };
      await client.query("COMMIT");
    } catch (error: any) {
      await client.query("ROLLBACK").catch(() => {});
      return res.status(500).json({ message: error.message || "No se pudo crear el tipo de beca" });
    } finally {
      client.release();
    }

    const auditPayload = {
      tenant_id: tenantId,
      user_id: userId,
      action: "tipo_beca_creado",
      entity_type: "scholarship_type",
      entity_id: Number(created.id),
      previous_value: {},
      new_value: created,
      metadata: { campus_id: campusId },
    };
    pool.query(
      `INSERT INTO audit_log
        (tenant_id, user_id, action, entity_type, entity_id, previous_value, new_value, metadata)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)`,
      [
        auditPayload.tenant_id, auditPayload.user_id, auditPayload.action,
        auditPayload.entity_type, auditPayload.entity_id,
        JSON.stringify(auditPayload.previous_value), JSON.stringify(auditPayload.new_value),
        JSON.stringify(auditPayload.metadata),
      ],
    ).catch((error) => enqueueAuditLog(auditPayload, error));

    return res.status(201).json(created);
  });

  app.patch("/api/admin/scholarship-types/:id", authenticateToken, async (req: any, res) => {
    if (!hasPermissionForUser(req.user, MODULES.SCHOLARSHIPS, ACTIONS.ASSIGN)) {
      return res.status(403).json({ message: "Sin permisos para editar tipos de beca" });
    }
    const typeId = Number(req.params.id);
    if (!Number.isSafeInteger(typeId) || typeId <= 0) {
      return res.status(400).json({ message: "ID de tipo de beca inválido" });
    }
    const parsed = scholarshipTypeUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message || "Datos de tipo de beca inválidos",
      });
    }
    const campusId = Number(req.user?.campus_id);
    const tenantId = Number(req.user?.tenant_id);
    const userId = req.user?.id ?? null;
    const input = parsed.data;
    const client = await pool.connect();
    let previousValue: any;
    let newValue: any;
    try {
      await client.query("BEGIN");
      const typeResult = await client.query(
        `SELECT * FROM scholarship_types
          WHERE id = $1 AND campus_id = $2
          FOR UPDATE`,
        [typeId, campusId],
      );
      const existing = typeResult.rows[0] as any;
      if (!existing) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Tipo de beca no encontrado en este campus" });
      }
      const [oldBenefits, oldCriteria] = await Promise.all([
        client.query(
          `SELECT * FROM scholarship_benefits WHERE scholarship_type_id = $1 ORDER BY id ASC`,
          [typeId],
        ),
        client.query(
          `SELECT * FROM scholarship_criteria WHERE scholarship_type_id = $1 ORDER BY id ASC`,
          [typeId],
        ),
      ]);
      previousValue = {
        ...existing,
        beneficio: oldBenefits.rows[0] ?? null,
        criterios: oldCriteria.rows,
      };

      const updatedTypeResult = await client.query(
        `UPDATE scholarship_types
            SET nombre = $1, categoria = $2, descripcion = $3, algoritmo = $4,
                activo = $5, updated_at = NOW()
          WHERE id = $6 AND campus_id = $7
          RETURNING *`,
        [
          input.nombre, input.categoria, input.descripcion ?? null, input.algoritmo,
          input.activo, typeId, campusId,
        ],
      );
      await client.query(`DELETE FROM scholarship_benefits WHERE scholarship_type_id = $1`, [typeId]);
      const newBenefitResult = await client.query(
        `INSERT INTO scholarship_benefits
          (scholarship_type_id, tipo_beneficio, porcentaje_descuento, aplica_conceptos, vigencia_meses)
         VALUES ($1,'porcentaje',$2,$3,$4)
         RETURNING *`,
        [
          typeId,
          input.beneficio.porcentaje_descuento,
          input.beneficio.aplica_conceptos,
          input.beneficio.vigencia_meses,
        ],
      );
      await client.query(`DELETE FROM scholarship_criteria WHERE scholarship_type_id = $1`, [typeId]);
      const criterios: any[] = [];
      for (const criterion of input.criterios) {
        const criterionResult = await client.query(
          `INSERT INTO scholarship_criteria
            (scholarship_type_id, criterio, valor_minimo, valor_maximo, obligatorio)
           VALUES ($1,$2,$3,$4,$5)
           RETURNING *`,
          [
            typeId, criterion.criterio,
            criterion.valor_minimo ?? null, criterion.valor_maximo ?? null,
            criterion.obligatorio,
          ],
        );
        criterios.push(criterionResult.rows[0]);
      }
      newValue = {
        ...updatedTypeResult.rows[0],
        beneficio: newBenefitResult.rows[0],
        criterios,
      };
      await client.query("COMMIT");
    } catch (error: any) {
      await client.query("ROLLBACK").catch(() => {});
      return res.status(500).json({ message: error.message || "No se pudo editar el tipo de beca" });
    } finally {
      client.release();
    }

    const auditPayload = {
      tenant_id: tenantId,
      user_id: userId,
      action: "tipo_beca_editado",
      entity_type: "scholarship_type",
      entity_id: typeId,
      previous_value: previousValue,
      new_value: newValue,
      metadata: {
        campus_id: campusId,
        motivo_cambio: input.motivo_cambio,
      },
    };
    pool.query(
      `INSERT INTO audit_log
        (tenant_id, user_id, action, entity_type, entity_id, previous_value, new_value, metadata)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)`,
      [
        auditPayload.tenant_id, auditPayload.user_id, auditPayload.action,
        auditPayload.entity_type, auditPayload.entity_id,
        JSON.stringify(auditPayload.previous_value), JSON.stringify(auditPayload.new_value),
        JSON.stringify(auditPayload.metadata),
      ],
    ).catch((error) => enqueueAuditLog(auditPayload, error));

    return res.json(newValue);
  });

  /**
   * POST /api/admin/families
   * Crea una familia con tutores y alumnos en una sola llamada atómica,
   * o agrega miembros a una familia existente si alguno de los alumnos
   * ya está vinculado vía family_students.
   *
   * Guard:  FAMILIES.CREATE
   * Body:   { nombre, student_ids: number[], tutores: TutorInput[] }
   * 201:    { family_id, family_nombre, guardians_created, guardians_linked,
   *           students_linked, warnings }
   * 400/422: validación — mensaje descriptivo, nada escrito en DB.
   */
  app.post("/api/admin/families", authenticateToken, async (req: any, res) => {
    try {
      if (!hasPermissionForUser(req.user, MODULES.FAMILIES, ACTIONS.CREATE)) {
        return res.status(403).json({ message: "Sin permisos para crear familias" });
      }

      const tenantId = req.user?.tenant_id as number;
      const campusId = req.user?.campus_id as number;
      const { nombre, student_ids, tutores } = req.body;

      // Validación de estructura básica (la lógica de dominio está en createFamily)
      if (!nombre || typeof nombre !== "string" || !nombre.trim()) {
        return res.status(400).json({ message: "nombre es requerido" });
      }
      if (!Array.isArray(student_ids) || student_ids.length === 0) {
        return res.status(400).json({ message: "student_ids debe ser un array no vacío" });
      }
      if (!Array.isArray(tutores) || tutores.length === 0) {
        return res.status(400).json({ message: "tutores debe ser un array no vacío" });
      }

      const result = await createFamily(
        { nombre: nombre.trim(), student_ids, tutores },
        tenantId,
        campusId,
      );

      res.status(201).json(result);
    } catch (error: any) {
      const status  = typeof error.status === "number" ? error.status : 500;
      const message = error.message || "Error interno del servidor";
      res.status(status).json({ message });
    }
  });

  /**
   * PATCH /api/admin/families/:familyId
   * Actualiza en una transacción los datos de la familia y sus tutores.
   * Los tutores deben estar vinculados a la familia; no se permite cambiar
   * relaciones de otro tenant/campus desde este endpoint.
   */
  app.patch("/api/admin/families/:familyId", authenticateToken, async (req: any, res) => {
    const familyId = Number(req.params.familyId);
    const { nombre, tutores } = req.body || {};
    if (!Number.isInteger(familyId) || !Array.isArray(tutores) || tutores.length === 0) {
      return res.status(400).json({ message: "familyId y tutores son requeridos" });
    }
    const administrativeRoles = ["super_admin", "administrador_general", "administrador_campus"];
    if (
      !hasPermissionForUser(req.user, MODULES.FAMILIES, ACTIONS.UPDATE) ||
      !administrativeRoles.includes(req.user?.role)
    ) {
      return res.status(403).json({ message: "Sin permisos para editar familias" });
    }

    const tenantId = Number(req.user?.tenant_id);
    const campusId = Number(req.user?.campus_id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const family = await client.query(
        `SELECT id, nombre FROM families
          WHERE id = $1 AND tenant_id = $2 AND campus_id = $3
          FOR UPDATE`,
        [familyId, tenantId, campusId],
      );
      if (!family.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Familia no encontrada en este campus" });
      }

      if (nombre?.trim()) {
        await client.query(
          `UPDATE families SET nombre = $1, updated_at = NOW() WHERE id = $2`,
          [nombre.trim(), familyId],
        );
      }

      const linked = await client.query(
        `SELECT DISTINCT g.id
           FROM family_students fs
           JOIN student_guardian sg ON sg.student_id = fs.student_id
           JOIN guardians g ON g.id = sg.guardian_id
          WHERE fs.family_id = $1 AND g.tenant_id = $2`,
        [familyId, tenantId],
      );
      const linkedIds = new Set(linked.rows.map((row: any) => Number(row.id)));
      for (const tutor of tutores) {
        const guardianId = Number(tutor.guardian_id);
        if (!Number.isInteger(guardianId) || !linkedIds.has(guardianId)) {
          throw Object.assign(new Error("Tutor no vinculado a esta familia"), { status: 422 });
        }
        for (const [field, value] of [
          ["celular", tutor.celular],
          ["contacto_emergencia_telefono", tutor.contacto_emergencia_telefono],
        ] as const) {
          if (!value || !/^\+[1-9]\d{7,14}$/.test(value)) {
            throw Object.assign(new Error(`${field} debe estar en formato E.164`), { status: 422 });
          }
        }
        if (!tutor.calle || !tutor.numero_exterior || !tutor.colonia ||
            !tutor.codigo_postal || !/^\d{5}$/.test(tutor.codigo_postal) ||
            !tutor.municipio || !tutor.estado ||
            !tutor.contacto_emergencia_nombre || !tutor.contacto_emergencia_relacion) {
          throw Object.assign(
            new Error("Domicilio y contacto de emergencia completos son obligatorios para cada tutor"),
            { status: 422 },
          );
        }
        await client.query(
          `UPDATE guardians
              SET calle = $1, numero_exterior = $2, numero_interior = $3,
                  colonia = $4, codigo_postal = $5, municipio = $6, estado = $7,
                  contacto_emergencia_nombre = $8,
                  contacto_emergencia_telefono = $9,
                  contacto_emergencia_relacion = $10,
                  updated_at = NOW()
            WHERE id = $11 AND tenant_id = $12`,
          [
            tutor.calle, tutor.numero_exterior, tutor.numero_interior || null,
            tutor.colonia, tutor.codigo_postal, tutor.municipio, tutor.estado,
            tutor.contacto_emergencia_nombre, tutor.contacto_emergencia_telefono,
            tutor.contacto_emergencia_relacion, guardianId, tenantId,
          ],
        );
      }
      await client.query("COMMIT");
      return res.json({ id: familyId, nombre: nombre?.trim() || family.rows[0].nombre, tutores });
    } catch (error: any) {
      await client.query("ROLLBACK").catch(() => {});
      return res.status(error.status || 500).json({ message: error.message || "No se pudo actualizar la familia" });
    } finally {
      client.release();
    }
  });

  /**
   * PATCH /api/admin/families/:familyId/status
   * Archivado lógico o reactivación. Archivar invalida sesiones y magic links
   * únicamente de tutores que ya no conservan otra familia activa.
   */
  app.patch("/api/admin/families/:familyId/status", authenticateToken, async (req: any, res) => {
    const familyId = Number(req.params.familyId);
    const requestedStatus = req.body?.status;
    if (!Number.isInteger(familyId) || !["activo", "archivada"].includes(requestedStatus)) {
      return res.status(400).json({ message: "familyId y status ('activo' o 'archivada') son requeridos" });
    }
    // Archivar/reactivar cambia el acceso al portal; se reserva a roles
    // administrativos, no a perfiles operativos que sólo editan datos.
    const administrativeRoles = ["super_admin", "administrador_general", "administrador_campus"];
    if (
      !hasPermissionForUser(req.user, MODULES.FAMILIES, ACTIONS.UPDATE) ||
      !administrativeRoles.includes(req.user?.role)
    ) {
      return res.status(403).json({ message: "Sin permisos para archivar o reactivar familias" });
    }

    const tenantId = Number(req.user?.tenant_id);
    const campusId = Number(req.user?.campus_id);
    const userId = Number(req.user?.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const familyResult = await client.query(
        `SELECT id, nombre, status
           FROM families
          WHERE id = $1 AND tenant_id = $2 AND campus_id = $3
          FOR UPDATE`,
        [familyId, tenantId, campusId],
      );
      const family = familyResult.rows[0] as any;
      if (!family) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Familia no encontrada en este campus" });
      }

      await client.query(
        `UPDATE families
            SET status = $1::varchar,
                archived_at = CASE WHEN $1::varchar = 'archivada' THEN NOW() ELSE NULL END,
                archived_by = CASE WHEN $1::varchar = 'archivada' THEN $2::integer ELSE NULL END,
                updated_at = NOW()
          WHERE id = $3`,
        [requestedStatus, userId, familyId],
      );

      let guardianIdsRevoked: number[] = [];
      if (requestedStatus === "archivada") {
        const linkedGuardianIds = await getFamilyGuardianIds(client, familyId, tenantId);
        guardianIdsRevoked = await getGuardiansWithoutActiveFamilies(client, linkedGuardianIds, tenantId);
        if (guardianIdsRevoked.length) {
          // Reutiliza la invalidación canónica de sesiones de tutor.
          await client.query(
            `UPDATE guardians
                -- JWT.iat tiene precisión de segundos. El margen evita que un
                -- token emitido en el mismo segundo sobreviva al archivado.
                SET password_changed_at = NOW() + INTERVAL '1 second', updated_at = NOW()
              WHERE id = ANY($1::int[]) AND tenant_id = $2`,
            [guardianIdsRevoked, tenantId],
          );
          await client.query(
            `UPDATE magic_link_tokens
                SET revoked_at = NOW()
              WHERE guardian_id = ANY($1::int[])
                AND tenant_id = $2
                AND revoked_at IS NULL`,
            [guardianIdsRevoked, tenantId],
          );
        }
      }
      await client.query("COMMIT");

      const auditPayload = {
        tenant_id: tenantId,
        user_id: userId || null,
        action: requestedStatus === "archivada" ? "archive" : "reactivate",
        entity_type: "family",
        entity_id: familyId,
        metadata: {
          family_nombre: family.nombre,
          previous_status: family.status,
          new_status: requestedStatus,
          guardian_ids_revoked: guardianIdsRevoked,
        },
      };
      pool.query(
        `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
        [auditPayload.tenant_id, auditPayload.user_id, auditPayload.action, auditPayload.entity_type,
         auditPayload.entity_id, JSON.stringify(auditPayload.metadata)],
      ).catch((error) => enqueueAuditLog(auditPayload, error));

      return res.json({
        id: familyId,
        status: requestedStatus,
        guardian_ids_revoked: guardianIdsRevoked,
        message: requestedStatus === "archivada"
          ? "Familia archivada y accesos de tutores revocados cuando correspondía."
          : "Familia reactivada. Los tutores pueden iniciar una nueva sesión.",
      });
    } catch (error: any) {
      await client.query("ROLLBACK").catch(() => {});
      return res.status(500).json({ message: error.message || "No se pudo cambiar el estatus de la familia" });
    } finally {
      client.release();
    }
  });
}
