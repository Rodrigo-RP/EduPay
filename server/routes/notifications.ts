import type { Express } from "express";
import { pool, db } from "../db";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";
import { authenticateToken, requireAuth, requireSuperAdmin, serializeUser, hasPermissionForUser, checkCampusTenant } from "./shared";
import { MODULES, ACTIONS } from "@shared/permissions";
import { NotificationSystem as ServerNotificationSystem } from "../notification-system";
import { wsManager } from "../websocket-manager";
import { users, students, guardians, charges, payments, concepts, scholarships, payment_surcharge_rules } from "@shared/schema";
import { z } from "zod";

export function registerNotificationRoutes(app: Express): void {
  const legacyPaymentConfigWriteGone = (_req: any, res: any) =>
    res.status(410).json({
      code: "LEGACY_PAYMENT_CONFIG_ENDPOINT_GONE",
      message: "Este endpoint de configuración fue retirado para escritura. Usa /configuracion-pagos-completa.",
    });

  app.get("/api/notifications", authenticateToken, async (req, res) => {
    if (!hasPermissionForUser((req as any).user, MODULES.RECEIVABLES, ACTIONS.READ)) {
      return res.status(403).json({ message: "No tienes permiso para ver el historial de notificaciones" });
    }
    try {
      const user = (req as any).user;
      const tenantId = user?.tenant_id;
      if (!tenantId) return res.status(403).json({ message: "Sin contexto de tenant" });

      const { canal, tipo, limit = "100", offset = "0" } = req.query as Record<string, string>;

      const conditions: string[] = [`n.tenant_id = ${tenantId}`];
      if (canal && canal !== "all") conditions.push(`n.canal = '${canal.replace(/'/g, "''")}'`);
      if (tipo)  conditions.push(`n.tipo = '${tipo.replace(/'/g, "''")}'`);

      const where = conditions.join(" AND ");
      const result = await pool.query(`
        SELECT
          n.id,
          n.tipo,
          n.canal,
          n.destinatario,
          n.asunto,
          n.mensaje,
          n.estado,
          n.intentos,
          n.enviado_en   AS fecha_envio,
          n.student_id,
          s.nombre_completo AS alumno_nombre
        FROM notifications n
        LEFT JOIN students s ON s.id = n.student_id
        WHERE ${where}
        ORDER BY n.enviado_en DESC
        LIMIT ${Math.min(Number(limit), 200)} OFFSET ${Number(offset)}
      `);

      res.json(result.rows);
    } catch (error: any) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  /**
   * GET /api/notifications/stats
   * Estadísticas de notificaciones para el tenant.
   */
  app.get("/api/notifications/stats", authenticateToken, async (req, res) => {
    if (!hasPermissionForUser((req as any).user, MODULES.RECEIVABLES, ACTIONS.READ)) {
      return res.status(403).json({ message: "No tienes permiso para ver estadísticas de notificaciones" });
    }
    try {
      const tenantId = (req as any).user?.tenant_id;
      if (!tenantId) return res.status(403).json({ message: "Sin contexto de tenant" });

      const result = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE estado = 'enviado')  AS enviadas,
          COUNT(*) FILTER (WHERE estado = 'pendiente') AS pendientes,
          COUNT(*) FILTER (WHERE estado = 'error')     AS errores,
          COUNT(*)                                      AS total
        FROM notifications
        WHERE tenant_id = $1
      `, [tenantId]);

      const row = (result.rows[0] as any) || {};
      const total    = Number(row.total    ?? 0);
      const enviadas = Number(row.enviadas ?? 0);
      res.json({
        totalEnviadas: enviadas,
        pendientes:    Number(row.pendientes ?? 0),
        errores:       Number(row.errores    ?? 0),
        total,
        tasaEntrega:   total > 0 ? Math.round((enviadas / total) * 1000) / 10 : 0,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  /**
   * GET /api/notifications/pending-students
   * Devuelve estudiantes con cargos pendientes/morosos del campus del usuario.
   * Query: ?tipo=RECORDATORIO_VENCIMIENTO|AVISO_MORA|CARGO_EMITIDO
   * Datos reales del sistema, no simulados.
   */
  app.get("/api/notifications/pending-students", authenticateToken, async (req, res) => {
    if (!hasPermissionForUser((req as any).user, MODULES.RECEIVABLES, ACTIONS.READ)) {
      return res.status(403).json({ message: "Sin permisos para ver alumnos con cargos pendientes" });
    }
    try {
      const user = (req as any).user;
      const campusId  = user?.campus_id;
      const tenantId  = user?.tenant_id;
      if (!campusId) return res.status(400).json({ message: "Usuario sin campus asignado" });

      const { tipo = "CARGO_EMITIDO" } = req.query as { tipo?: string };

      // Construir condición de fecha según tipo de notificación
      let estadoCondicion = `c.estado IN ('pendiente', 'parcial')`;
      let fechaCondicion  = "";
      if (tipo === "RECORDATORIO_VENCIMIENTO") {
        // Vencen en los próximos 3 días o vencen hoy
        fechaCondicion = `AND c.fecha_vencimiento BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '3 days')`;
      } else if (tipo === "AVISO_MORA") {
        // Ya vencidos
        fechaCondicion = `AND c.fecha_vencimiento < CURRENT_DATE`;
      }
      // CARGO_EMITIDO: todos los pendientes/parciales sin filtro de fecha extra

      const result = await pool.query(`
        SELECT
          s.id,
          s.nombre_completo                                      AS nombre,
          COALESCE(g.email, g.correo_institucional_familiar)     AS email,
          COALESCE(g.telefono, '')                               AS telefono,
          c.monto_base_centavos                                  AS monto_centavos,
          con.nombre                                             AS concepto,
          c.fecha_vencimiento,
          (CURRENT_DATE - c.fecha_vencimiento)::integer          AS dias_vencido,
          c.id                                                   AS charge_id,
          g.id                                                   AS guardian_id
        FROM students s
        JOIN charges c ON c.student_id = s.id
        LEFT JOIN concepts con ON con.id = c.concept_id
        LEFT JOIN student_guardian sg ON sg.student_id = s.id AND sg.es_responsable_pago = true
        LEFT JOIN guardians g ON g.id = sg.guardian_id
        WHERE s.campus_id = $1
          AND s.tenant_id = $2
          AND ${estadoCondicion}
          ${fechaCondicion}
        ORDER BY c.fecha_vencimiento ASC, s.nombre_completo ASC
        LIMIT 100
      `, [campusId, tenantId]);

      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  /**
   * POST /api/notifications/send
   * Envía notificaciones a estudiantes con cargos pendientes.
   * Registra cada notificación en la tabla notifications (datos reales).
   */
  app.post("/api/notifications/send", authenticateToken, async (req, res) => {
    try {
      const { tipo, canal, modo, estudiantesIds } = req.body;
      const user = (req as any).user;
      const tenantId = user?.tenant_id;
      const campusId = user?.campus_id;

      if (!tipo || !canal || !modo) {
        return res.status(400).json({ error: "Parámetros requeridos: tipo, canal, modo" });
      }

      // ── 1. Consultar estudiantes reales desde la BD ────────────────────────
      let estadoCondicion = `c.estado IN ('pendiente', 'parcial')`;
      let fechaCondicion  = "";
      if (tipo === "RECORDATORIO_VENCIMIENTO") {
        fechaCondicion = `AND c.fecha_vencimiento BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '3 days')`;
      } else if (tipo === "AVISO_MORA") {
        fechaCondicion = `AND c.fecha_vencimiento < CURRENT_DATE`;
      }

      const studentsResult = await pool.query(`
        SELECT DISTINCT ON (s.id)
          s.id,
          s.nombre_completo                                    AS nombre,
          COALESCE(g.email, g.correo_institucional_familiar)   AS email,
          COALESCE(g.telefono, '')                             AS telefono,
          c.monto_base_centavos                                AS monto_centavos,
          con.nombre                                           AS concepto,
          c.fecha_vencimiento,
          (CURRENT_DATE - c.fecha_vencimiento)::integer        AS dias_vencido,
          c.id                                                 AS charge_id,
          g.id                                                 AS guardian_id
        FROM students s
        JOIN charges c ON c.student_id = s.id
        LEFT JOIN concepts con ON con.id = c.concept_id
        LEFT JOIN student_guardian sg ON sg.student_id = s.id AND sg.es_responsable_pago = true
        LEFT JOIN guardians g ON g.id = sg.guardian_id
        WHERE s.campus_id = $1
          AND s.tenant_id = $2
          AND ${estadoCondicion}
          ${fechaCondicion}
        ORDER BY s.id, c.fecha_vencimiento ASC
        LIMIT 200
      `, [campusId, tenantId]);

      let targetStudents: any[] = studentsResult.rows;

      // Filtro individual si aplica
      if (modo === "individual" && estudiantesIds?.length > 0) {
        targetStudents = targetStudents.filter(e => estudiantesIds.includes(e.id));
      }

      if (targetStudents.length === 0) {
        return res.status(400).json({ error: "No se encontraron estudiantes para este tipo de notificación" });
      }

      // ── 2. Construir y persistir cada notificación ─────────────────────────
      const insertedIds: number[] = [];

      for (const student of targetStudents) {
        const montoPesos = Math.round((student.monto_centavos || 0) / 100);
        const concepto   = student.concepto || "Colegiatura";
        const diasVencido = Number(student.dias_vencido ?? 0);

        let asunto  = "";
        let mensaje = "";

        switch (tipo) {
          case "RECORDATORIO_VENCIMIENTO":
            asunto  = canal === "EMAIL" ? `Recordatorio: ${concepto} — Instituto JFR` : "";
            mensaje = canal === "EMAIL"
              ? `Estimado/a responsable de ${student.nombre},\n\nLe recordamos que el pago de ${concepto} por $${montoPesos.toLocaleString("es-MX")} MXN ${diasVencido === 0 ? "vence hoy" : `vence en ${Math.abs(diasVencido)} día(s)`}.\n\nPuede realizar su pago en: https://jfr.edu.mx/pagar\n\nGracias.`
              : `Recordatorio: ${concepto} por $${montoPesos.toLocaleString("es-MX")} ${diasVencido === 0 ? "vence hoy" : `vence en ${Math.abs(diasVencido)} día(s)`}. Pague en jfr.edu.mx/pagar`;
            break;
          case "AVISO_MORA":
            asunto  = canal === "EMAIL" ? `URGENTE: Pago vencido — ${concepto} — Instituto JFR` : "";
            mensaje = canal === "EMAIL"
              ? `Estimado/a responsable de ${student.nombre},\n\nSu pago de ${concepto} por $${montoPesos.toLocaleString("es-MX")} MXN está vencido desde hace ${diasVencido} día(s). Se aplicarán recargos por mora.\n\nPague ahora: https://jfr.edu.mx/pagar`
              : `URGENTE: ${concepto} vencido ${diasVencido} día(s). Recargos aplicados. Pague en jfr.edu.mx/pagar`;
            break;
          case "CARGO_EMITIDO":
            asunto  = canal === "EMAIL" ? `Nuevo cargo disponible — ${concepto} — Instituto JFR` : "";
            mensaje = canal === "EMAIL"
              ? `Estimado/a responsable de ${student.nombre},\n\nSe ha emitido un nuevo cargo: ${concepto} por $${montoPesos.toLocaleString("es-MX")} MXN.\n\nConsúltelo y págalo en: https://jfr.edu.mx/pagar`
              : `Nuevo cargo: ${concepto} por $${montoPesos.toLocaleString("es-MX")}. jfr.edu.mx/pagar`;
            break;
          default:
            mensaje = `Notificación de tipo ${tipo} para ${student.nombre}`;
        }

        // Determinar destinatario según canal
        const destinatario = canal === "EMAIL"
          ? (student.email || "sin-email@jfr.edu.mx")
          : (student.telefono || "sin-telefono");

        // Insertar registro en notifications
        const insertResult = await pool.query(`
          INSERT INTO notifications
            (tenant_id, student_id, guardian_id, canal, tipo, destinatario, asunto, mensaje, contenido, estado, intentos, enviado_en)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, 'enviado', 1, NOW())
          RETURNING id
        `, [tenantId, student.id, student.guardian_id, canal, tipo, destinatario, asunto, mensaje]);

        insertedIds.push((insertResult.rows[0] as any).id);
      }

      res.json({
        success: true,
        enviadas: targetStudents.length,
        modo,
        canal,
        tipo,
        detalles: {
          total_estudiantes: targetStudents.length,
          mensajes_enviados: insertedIds.length,
          timestamp: new Date().toISOString(),
        },
        preview: targetStudents.slice(0, 3).map((s: any) => ({
          destinatario: s.nombre,
          contacto: canal === "EMAIL" ? s.email : s.telefono,
          mensaje_preview: (tipo === "AVISO_MORA"
            ? `Pago vencido ${s.dias_vencido} día(s)`
            : tipo === "RECORDATORIO_VENCIMIENTO"
            ? `Vence en ${Math.abs(Number(s.dias_vencido ?? 0))} día(s)`
            : "Nuevo cargo disponible"),
        })),
      });

    } catch (error: any) {
      console.error("Error sending notifications:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  });

  // ===== PAYMENT CONFIGURATION APIs — conectados a payment_surcharge_rules en BD =====

  // Get late fee rules configuration — lee de payment_surcharge_rules real
  app.get("/api/payment-config/late-fee-rules", authenticateToken, async (req: any, res) => {
    try {
      if (!hasPermissionForUser(req.user, MODULES.SETTINGS, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver configuración de recargos" });
      }
      const campusId = Number(req.user?.campus_id);
      const tenantId = req.user?.tenant_id;
      if (!Number.isSafeInteger(campusId) || campusId <= 0) {
        return res.status(400).json({ error: "Campus requerido" });
      }
      if (!await checkCampusTenant(campusId, tenantId, res)) return;

      const rules = await db.select().from(payment_surcharge_rules)
        .where(tenantId
          ? and(eq(payment_surcharge_rules.campus_id, campusId), eq(payment_surcharge_rules.tenant_id, tenantId))
          : eq(payment_surcharge_rules.campus_id, campusId));

      // Serializar reglas_progresivas si vienen como string
      const mapped = rules.map((r: any) => ({
        ...r,
        reglas_progresivas: r.reglas_progresivas
          ? (typeof r.reglas_progresivas === 'string' ? JSON.parse(r.reglas_progresivas) : r.reglas_progresivas)
          : null,
      }));
      res.json(mapped);
    } catch (error: any) {
      console.error("Error fetching late fee rules:", error);
      res.status(500).json({ error: "Error obteniendo reglas de recargo" });
    }
  });

  // Create new late fee rule — persiste en payment_surcharge_rules
  app.post("/api/payment-config/late-fee-rules", authenticateToken, legacyPaymentConfigWriteGone, async (req: any, res) => {
    try {
      const campusId = req.user?.campus_id;
      const tenantId = req.user?.tenant_id;
      if (!campusId || !tenantId) return res.status(400).json({ error: "Campus y tenant requeridos" });

      // ── Guard de rol ──────────────────────────────────────────────────────
      if (!hasPermissionForUser(req.user, MODULES.SETTINGS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para configurar reglas de recargo" });
      }

      const { nombre, tipo, dias_gracia, porcentaje, monto_fijo, reglas_progresivas,
              aplica_fines_semana, aplica_festivos, monto_maximo } = req.body;

      if (!nombre || !tipo || dias_gracia === undefined) {
        return res.status(400).json({ error: "Nombre, tipo y días de gracia son requeridos" });
      }
      const diasGracia = parseInt(dias_gracia);
      if (isNaN(diasGracia) || diasGracia < 0 || diasGracia > 30) {
        return res.status(400).json({ error: "Los días de gracia deben estar entre 0 y 30" });
      }
      if (!['porcentaje', 'fijo', 'progresivo'].includes(tipo)) {
        return res.status(400).json({ error: "Tipo inválido: porcentaje|fijo|progresivo" });
      }
      if (tipo === 'porcentaje' && (!porcentaje || parseFloat(porcentaje) <= 0 || parseFloat(porcentaje) > 50)) {
        return res.status(400).json({ error: "El porcentaje debe estar entre 0.1 y 50" });
      }
      if (tipo === 'fijo' && (!monto_fijo || parseInt(monto_fijo) <= 0)) {
        return res.status(400).json({ error: "El monto fijo debe ser mayor a 0" });
      }

      const [newRule] = await db.insert(payment_surcharge_rules).values({
        nombre,
        concepto: nombre, // concepto identifica el nombre de la regla en el catálogo
        tipo,
        dias_gracia: diasGracia,
        porcentaje: tipo === 'porcentaje' ? String(parseFloat(porcentaje)) : null,
        monto_fijo_centavos: tipo === 'fijo' ? parseInt(monto_fijo) : null,
        reglas_progresivas: tipo === 'progresivo' && reglas_progresivas ? JSON.stringify(reglas_progresivas) : null,
        aplica_fines_semana: !!aplica_fines_semana,
        aplica_festivos: !!aplica_festivos,
        monto_maximo_centavos: monto_maximo ? parseInt(monto_maximo) : null,
        activo: true,
        campus_id: campusId,
        tenant_id: tenantId,
      }).returning();

      res.status(201).json({ message: "Regla de recargo creada exitosamente", lateFeeRule: newRule });
    } catch (error: any) {
      console.error("Error creating late fee rule:", error);
      res.status(500).json({ error: "Error creando regla de recargo" });
    }
  });

  // Update late fee rule — actualiza en BD con ownership check
  app.put("/api/payment-config/late-fee-rules/:id", authenticateToken, legacyPaymentConfigWriteGone, async (req: any, res) => {
    try {
      const ruleId = parseInt(req.params.id);
      if (!ruleId || isNaN(ruleId)) return res.status(400).json({ error: "ID inválido" });
      const campusId = req.user?.campus_id;
      if (!campusId) return res.status(400).json({ error: "Campus requerido" });

      // ── Guard de rol ──────────────────────────────────────────────────────
      if (!hasPermissionForUser(req.user, MODULES.SETTINGS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para configurar reglas de recargo" });
      }

      // Ownership check
      const [existing] = await db.select({ id: payment_surcharge_rules.id })
        .from(payment_surcharge_rules)
        .where(and(eq(payment_surcharge_rules.id, ruleId), eq(payment_surcharge_rules.campus_id, campusId)))
        .limit(1);
      if (!existing) return res.status(404).json({ error: "Regla no encontrada" });

      const { nombre, tipo, dias_gracia, porcentaje, monto_fijo, reglas_progresivas,
              aplica_fines_semana, aplica_festivos, monto_maximo, activo } = req.body;

      if (!nombre || !tipo || dias_gracia === undefined) {
        return res.status(400).json({ error: "Nombre, tipo y días de gracia son requeridos" });
      }
      const diasGracia = parseInt(dias_gracia);
      if (isNaN(diasGracia) || diasGracia < 0 || diasGracia > 30) {
        return res.status(400).json({ error: "Los días de gracia deben estar entre 0 y 30" });
      }

      const [updated] = await db.update(payment_surcharge_rules).set({
        nombre,
        tipo,
        dias_gracia: diasGracia,
        porcentaje: tipo === 'porcentaje' ? String(parseFloat(porcentaje)) : null,
        monto_fijo_centavos: tipo === 'fijo' ? parseInt(monto_fijo) : null,
        reglas_progresivas: tipo === 'progresivo' && reglas_progresivas ? JSON.stringify(reglas_progresivas) : null,
        aplica_fines_semana: !!aplica_fines_semana,
        aplica_festivos: !!aplica_festivos,
        monto_maximo_centavos: monto_maximo ? parseInt(monto_maximo) : null,
        activo: activo !== undefined ? !!activo : true,
        updated_at: new Date(),
      }).where(and(eq(payment_surcharge_rules.id, ruleId), eq(payment_surcharge_rules.campus_id, campusId)))
        .returning();

      res.json({ message: "Regla de recargo actualizada exitosamente", lateFeeRule: updated });
    } catch (error: any) {
      console.error("Error updating late fee rule:", error);
      res.status(500).json({ error: "Error actualizando regla de recargo" });
    }
  });

  // Delete late fee rule — elimina de BD con ownership check
  app.delete("/api/payment-config/late-fee-rules/:id", authenticateToken, legacyPaymentConfigWriteGone, async (req: any, res) => {
    try {
      const ruleId = parseInt(req.params.id);
      if (!ruleId || isNaN(ruleId)) return res.status(400).json({ error: "ID inválido" });
      const campusId = req.user?.campus_id;
      if (!campusId) return res.status(400).json({ error: "Campus requerido" });

      // ── Guard de rol ──────────────────────────────────────────────────────
      if (!hasPermissionForUser(req.user, MODULES.SETTINGS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para configurar reglas de recargo" });
      }

      const [deleted] = await db.delete(payment_surcharge_rules)
        .where(and(eq(payment_surcharge_rules.id, ruleId), eq(payment_surcharge_rules.campus_id, campusId)))
        .returning({ id: payment_surcharge_rules.id });

      if (!deleted) return res.status(404).json({ error: "Regla no encontrada" });
      res.json({ message: "Regla de recargo eliminada exitosamente", deletedId: ruleId });
    } catch (error: any) {
      console.error("Error deleting late fee rule:", error);
      res.status(500).json({ error: "Error eliminando regla de recargo" });
    }
  });

  // Test late fee rule calculation
  app.post("/api/payment-config/test-late-fee", authenticateToken, async (req, res) => {
    try {
      const { rule, amount, daysLate } = req.body;
      
      if (!rule || !amount || daysLate === undefined) {
        return res.status(400).json({ error: "Regla, monto y días de atraso son requeridos" });
      }

      let lateFee = 0;
      let calculation = "Sin recargo (dentro del período de gracia)";
      
      // Apply grace period
      const effectiveDays = Math.max(0, parseInt(daysLate) - rule.dias_gracia);
      
      if (effectiveDays > 0) {
        const baseAmount = parseInt(amount);
        
        switch (rule.tipo) {
          case 'porcentaje':
            lateFee = Math.round(baseAmount * (rule.porcentaje / 100));
            calculation = `${rule.porcentaje}% del monto original ($${(baseAmount/100).toFixed(2)})`;
            break;
            
          case 'fijo':
            lateFee = rule.monto_fijo;
            calculation = `Recargo fijo de $${(lateFee/100).toFixed(2)}`;
            break;
            
          case 'progresivo':
            if (rule.reglas_progresivas) {
              for (const regla of rule.reglas_progresivas) {
                if (effectiveDays >= regla.dias_desde && effectiveDays <= regla.dias_hasta) {
                  lateFee = Math.round(baseAmount * (regla.porcentaje / 100));
                  calculation = `${regla.porcentaje}% progresivo por ${effectiveDays} días de atraso`;
                  break;
                }
              }
            }
            break;
        }
        
        // Apply maximum limit if specified
        if (rule.monto_maximo && lateFee > rule.monto_maximo) {
          lateFee = rule.monto_maximo;
          calculation += ` (limitado a máximo de $${(rule.monto_maximo/100).toFixed(2)})`;
        }
      }
      
      const result = {
        originalAmount: parseInt(amount),
        daysLate: parseInt(daysLate),
        effectiveDaysLate: effectiveDays,
        lateFeeAmount: lateFee,
        totalAmount: parseInt(amount) + lateFee,
        calculation,
        gracePeriodApplied: parseInt(daysLate) <= rule.dias_gracia
      };
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: "Error calculando recargo" });
    }
  });

  // Get payment configuration presets
  app.get("/api/payment-config/presets", authenticateToken, async (req, res) => {
    try {
      const presets = {
        dueDatePresets: [
          { concepto: "Colegiatura", dia_vencimiento: 10, mes_aplicacion: "todos" },
          { concepto: "Inscripción", dia_vencimiento: 15, mes_aplicacion: "agosto" },
          { concepto: "Reinscripción", dia_vencimiento: 20, mes_aplicacion: "febrero" },
          { concepto: "Seguro Escolar", dia_vencimiento: 5, mes_aplicacion: "septiembre" },
          { concepto: "Uniformes", dia_vencimiento: 25, mes_aplicacion: "julio" },
          { concepto: "Libros y Materiales", dia_vencimiento: 30, mes_aplicacion: "agosto" }
        ],
        lateFeePresets: [
          {
            nombre: "Estándar Mexicano",
            tipo: "porcentaje",
            dias_gracia: 5,
            porcentaje: 3,
            description: "3% mensual sobre saldos vencidos con 5 días de gracia"
          },
          {
            nombre: "Recargo Fijo Básico",
            tipo: "fijo",
            dias_gracia: 3,
            monto_fijo: 20000,
            description: "Recargo fijo de $200 pesos con 3 días de gracia"
          },
          {
            nombre: "Progresivo Escalonado",
            tipo: "progresivo",
            dias_gracia: 7,
            reglas_progresivas: [
              { dias_desde: 1, dias_hasta: 15, porcentaje: 1 },
              { dias_desde: 16, dias_hasta: 30, porcentaje: 2 },
              { dias_desde: 31, dias_hasta: 999, porcentaje: 3 }
            ],
            description: "Recargo progresivo: 1% (1-15 días), 2% (16-30 días), 3% (31+ días)"
          }
        ]
      };
      
      res.json(presets);
    } catch (error: any) {
      res.status(500).json({ error: "Error obteniendo presets" });
    }
  });

  // ========================================
  // APPROVAL WORKFLOW ROUTES
  // ========================================

  // Get pending approvals for current user (as approver)
  app.get("/api/approvals/pending", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const approvals = await storage.getPendingApprovalsForApprover(userId);
      res.json(approvals);
    } catch (error: any) {
      res.status(500).json({ message: "Error obteniendo aprobaciones pendientes" });
    }
  });

  // Get user's own requests (as requester)
  app.get("/api/approvals/my-requests", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const requests = await storage.getPendingApprovalsByRequester(userId);
      res.json(requests);
    } catch (error: any) {
      res.status(500).json({ message: "Error obteniendo mis solicitudes" });
    }
  });

  // Get all approvals history (for both admin and requesters)
  app.get("/api/approvals/history", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      const isGlobalAdmin = user.role === 'super_admin' || user.role === 'administrador_general';
      // super_admin ve historial global; administrador_general ve todo su tenant;
      // cualquier otro rol solo ve sus propias solicitudes históricas (requested_by = userId).
      const tenantFilter: number | undefined =
        user.role === 'super_admin' ? undefined : (user.tenant_id as number | undefined);
      const userFilter: number | undefined =
        isGlobalAdmin ? undefined : (user.id as number | undefined);
      const allApprovals = await storage.getAllApprovalsHistory(tenantFilter, userFilter);
      res.json(allApprovals);
    } catch (error: any) {
      res.status(500).json({ message: "Error obteniendo historial de aprobaciones" });
    }
  });

  // ── resolveAndValidateEntity ─────────────────────────────────────────────────
  // Extrae el entity_id real de proposed_value según el action_type, lo valida
  // contra la BD (existe Y pertenece al tenant/campus del solicitante) y devuelve
  // { entity_id, entity_type }.  Lanza un Error con mensaje 422 si falla.
  //
  // Todos los action_type del catálogo crítico tenían entity_id=1 hardcodeado y
  // entity_type='approval' hardcodeado.  Esta función corrige los 10 tipos.
  async function resolveAndValidateEntity(
    actionType: string,
    proposedValue: Record<string, any>,
    tenantId: number,
    campusId: number,
  ): Promise<{ entity_id: number; entity_type: string }> {
    // Especificación por acción: tipo de entidad, campo del body, tabla SQL y
    // columna de ownership para aislar por tenant/campus.
    // checkUsing='tenant_id' → compara con tenantId del JWT
    // checkUsing='campus_id' → compara con campusId del JWT
    //   (payment_surcharge_rules tiene campus_id NOT NULL pero tenant_id nullable)
    type Spec = {
      entityType: string;
      idField: string;          // clave preferida en proposed_value
      sqlTable: string;
      checkCol: string;
      checkUsing: 'tenant_id' | 'campus_id';
    };
    const SPEC: Record<string, Spec> = {
      cancel_payment:          { entityType: 'payment',       idField: 'payment_id',       sqlTable: 'payments',                checkCol: 'tenant_id', checkUsing: 'tenant_id' },
      refund_payment:          { entityType: 'payment',       idField: 'payment_id',       sqlTable: 'payments',                checkCol: 'tenant_id', checkUsing: 'tenant_id' },
      modify_charge_amount:    { entityType: 'charge',        idField: 'charge_id',        sqlTable: 'charges',                 checkCol: 'tenant_id', checkUsing: 'tenant_id' },
      delete_charge:           { entityType: 'charge',        idField: 'charge_id',        sqlTable: 'charges',                 checkCol: 'tenant_id', checkUsing: 'tenant_id' },
      modify_payment_due_date: { entityType: 'charge',        idField: 'charge_id',        sqlTable: 'charges',                 checkCol: 'tenant_id', checkUsing: 'tenant_id' },
      modify_scholarship:      { entityType: 'scholarship',   idField: 'scholarship_id',   sqlTable: 'scholarships',            checkCol: 'tenant_id', checkUsing: 'tenant_id' },
      modify_price:            { entityType: 'concept',       idField: 'concept_id',       sqlTable: 'concepts',                checkCol: 'tenant_id', checkUsing: 'tenant_id' },
      delete_concept:          { entityType: 'concept',       idField: 'concept_id',       sqlTable: 'concepts',                checkCol: 'tenant_id', checkUsing: 'tenant_id' },
      modify_concept:          { entityType: 'concept',       idField: 'concept_id',       sqlTable: 'concepts',                checkCol: 'tenant_id', checkUsing: 'tenant_id' },
      modify_late_fee:         { entityType: 'surcharge_rule',idField: 'surcharge_rule_id',sqlTable: 'payment_surcharge_rules', checkCol: 'campus_id', checkUsing: 'campus_id' },
    };

    const spec = SPEC[actionType];
    if (!spec) {
      throw new Error(`Tipo de acción desconocido: ${actionType}`);
    }

    // Acepta el campo específico del tipo (payment_id, charge_id, …) o 'entity_id' genérico
    const rawId = proposedValue[spec.idField] ?? proposedValue['entity_id'];
    const entityId = rawId != null ? Number(rawId) : NaN;
    if (!Number.isFinite(entityId) || entityId <= 0) {
      throw new Error(
        `proposed_value.${spec.idField} es requerido y debe ser un entero positivo (recibido: ${rawId})`
      );
    }

    // Validar que la entidad exista y pertenezca al tenant/campus del solicitante
    const checkVal = spec.checkUsing === 'tenant_id' ? tenantId : campusId;
    const result = await pool.query(
      `SELECT id FROM ${spec.sqlTable} WHERE id = $1 AND ${spec.checkCol} = $2 LIMIT 1`,
      [entityId, checkVal],
    );
    if ((result.rows as any[]).length === 0) {
      throw new Error(
        `${spec.entityType} ${entityId} no existe o no pertenece a este ${spec.checkUsing === 'tenant_id' ? 'tenant' : 'campus'}`
      );
    }

    return { entity_id: entityId, entity_type: spec.entityType };
  }

  // Create new approval request
  app.post("/api/approvals/request", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      const tenantId  = user?.tenant_id  as number | undefined;
      const campusId  = user?.campus_id  as number | undefined;

      if (!tenantId) {
        return res.status(403).json({ message: "Sin contexto de tenant" });
      }

      const { 
        action_type, 
        action_description, 
        current_value, 
        proposed_value, 
        reason, 
        additional_data 
      } = req.body;

      // Validate required fields
      if (!action_type || !action_description || !reason) {
        return res.status(400).json({ message: "Faltan campos requeridos" });
      }

      // Check if this action type requires approval for this user
      const needsApproval = await storage.requiresApproval(action_type, user.id);
      if (!needsApproval) {
        return res.status(400).json({ message: "Esta acción no requiere aprobación para tu rol" });
      }

      // Resolver y validar el entity_id real contra la base de datos.
      // Antes: siempre entity_id=1, entity_type='approval' (hardcodeados).
      // Ahora: extraído de proposed_value, validado que exista y pertenezca al tenant.
      let resolvedEntityId: number;
      let resolvedEntityType: string;
      try {
        const parsed: Record<string, any> =
          typeof proposed_value === 'string'
            ? JSON.parse(proposed_value)
            : (proposed_value && typeof proposed_value === 'object' ? proposed_value : {});
        const resolved = await resolveAndValidateEntity(action_type, parsed, tenantId, campusId!);
        resolvedEntityId   = resolved.entity_id;
        resolvedEntityType = resolved.entity_type;
      } catch (err: any) {
        return res.status(422).json({ message: err.message });
      }

      // Serializar current_value y proposed_value como JSON si vienen como objetos
      const originalDataStr  =
        typeof current_value === 'string'  ? current_value  : JSON.stringify(current_value  ?? {});
      const requestedDataStr =
        typeof proposed_value === 'string' ? proposed_value : JSON.stringify(proposed_value ?? {});

      // Create the approval request
      const approval = await storage.createPendingApproval({
        campus_id:          campusId!,
        tenant_id:          tenantId,           // ← antes: ausente → null en la DB
        requested_by:       user.id,
        action_type,
        action_description: String(action_description), // columna NOT NULL en la DB real
        entity_type:        resolvedEntityType, // ← antes: 'approval' hardcodeado
        entity_id:          resolvedEntityId,   // ← antes: 1 hardcodeado
        original_data:      originalDataStr,
        requested_data:     requestedDataStr,
        reason,
        status: 'pending'
      });

      // Log the request
      await storage.createApprovalWorkflowLog({
        approval_id: approval.id,
        action: 'created',
        user_id: user.id,
        notes: `Solicitud de aprobación creada para: ${action_description}`
      });

      res.json({ 
        message: "Solicitud de aprobación enviada exitosamente",
        approval_id: approval.id
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error creando solicitud de aprobación" });
    }
  });

  // Approve or reject a request
  app.post("/api/approvals/decision", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      const { approval_id, decision, notes } = req.body;

      // Validate required fields
      if (!approval_id || !decision || !['approved', 'rejected'].includes(decision)) {
        return res.status(400).json({ message: "ID de aprobación y decisión válida son requeridos" });
      }

      // Get the approval request
      const approval = await storage.getPendingApprovalById(approval_id);
      if (!approval) {
        return res.status(404).json({ message: "Solicitud de aprobación no encontrada" });
      }

      // Aislamiento de tenant: el aprobador debe pertenecer al mismo tenant que la solicitud.
      // super_admin es la única excepción — puede actuar en cualquier tenant.
      // tenant_id NULL es un registro legacy/corrupto: ningún rol (excepto super_admin)
      // puede aprobarlo; tratarlo como excepción silenciosa sería una brecha de control.
      if (user.role !== 'super_admin') {
        if (approval.tenant_id === null) {
          return res.status(403).json({
            message: "Esta solicitud no tiene tenant asignado y no puede ser aprobada — contacta al administrador del sistema"
          });
        }
        if (Number(approval.tenant_id) !== Number(user.tenant_id)) {
          return res.status(403).json({
            message: "No puedes aprobar solicitudes de otro plantel"
          });
        }
      }

      // Check if user can approve this type of action
      const canApprove = await storage.checkUserCanApprove(user.id, approval.action_type);
      if (!canApprove) {
        return res.status(403).json({ message: "No tienes permisos para aprobar este tipo de acción" });
      }

      // Update the approval status
      await storage.updateApprovalStatus(approval_id, decision, user.id, notes);

      // If approved, execute the actual changes
      if (decision === 'approved') {
        try {
          await executeApprovedChange(approval);
          // Log successful execution
          await storage.createApprovalWorkflowLog({
            approval_id,
            action: 'changes_applied',
            user_id: user.id,
            notes: `Cambios aplicados exitosamente al sistema`
          });
        } catch (executeError: any) {
          console.error('Error ejecutando cambio aprobado:', executeError);
          // Log the execution error but don't fail the approval
          await storage.createApprovalWorkflowLog({
            approval_id,
            action: 'execution_failed',
            user_id: user.id,
            notes: `Error ejecutando cambio: ${executeError.message}`
          });
        }
      }

      // Create notification for the requester
      await storage.createApprovalNotification({
        approval_id,
        recipient_id: approval.requested_by,
        notification_type: decision === 'approved' ? 'approval_granted' : 'approval_denied',
        title: `Solicitud ${decision === 'approved' ? 'Aprobada' : 'Rechazada'}`,
        message: `Tu solicitud ha sido ${decision === 'approved' ? 'aprobada' : 'rechazada'}`
      });

      // Log the decision
      await storage.createApprovalWorkflowLog({
        approval_id,
        action: decision,
        user_id: user.id,
        notes: notes || `Solicitud ${decision === 'approved' ? 'aprobada' : 'rechazada'} por ${user.name}`
      });

      res.json({ 
        message: `Solicitud ${decision === 'approved' ? 'aprobada' : 'rechazada'} exitosamente`,
        approval_id,
        decision
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error procesando decisión" });
    }
  });

  // Get approval workflow logs
  app.get("/api/approvals/logs/:approvalId", authenticateToken, async (req, res) => {
    try {
      const { approvalId } = req.params;
      const logs = await storage.getWorkflowLogsByApproval(parseInt(approvalId));
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: "Error obteniendo logs de aprobación" });
    }
  });

  // Get user notifications
  app.get("/api/approvals/notifications", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      // Antes: buscaba el primer administrador_general en la DB e ignoraba al usuario
      // autenticado; si no había ninguno usaba el ID 25 hardcodeado.
      // Ahora: cada usuario recibe sus propias notificaciones según recipient_id.
      const notifications = await storage.getNotificationsByUser(user.id);
      res.json(notifications);
    } catch (error: any) {
      res.status(500).json({ message: "Error obteniendo notificaciones" });
    }
  });

  // Mark notification as read
  app.post("/api/approvals/notifications/:id/read", authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.markNotificationAsRead(parseInt(id));
      res.json({ message: "Notificación marcada como leída" });
    } catch (error: any) {
      res.status(500).json({ message: "Error marcando notificación como leída" });
    }
  });

  // Check if action requires approval
  app.post("/api/approvals/check-required", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      const { action_type } = req.body;

      if (!action_type) {
        return res.status(400).json({ message: "Tipo de acción requerido" });
      }

      const requiresApproval = await storage.requiresApproval(action_type, user.id);
      const canApprove = await storage.checkUserCanApprove(user.id, action_type);

      res.json({
        requiresApproval,
        canApprove,
        userRole: user.role
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error verificando requisitos de aprobación" });
    }
  });

  // Function to execute approved changes
  async function executeApprovedChange(approval: any) {
    const { action_type, entity_type, entity_id, requested_data } = approval;
    const requestedData = JSON.parse(requested_data);

    switch (action_type) {
      case 'modify_scholarship':
        if (entity_type === 'scholarship' && entity_id) {
          // La columna real en la DB es 'porcentaje' (numeric NOT NULL).
          // El schema.ts fue corregido para reflejar esto (2026-08-10).
          await pool.query(
            `UPDATE scholarships SET porcentaje = $1, updated_at = now() WHERE id = $2`,
            [requestedData.percentage, entity_id]
          );
        }
        break;

      case 'modify_price':
        if (entity_type === 'concept' && entity_id) {
          // Update concept price
          await db.update(concepts)
            .set({ monto_centavos: requestedData.amount })
            .where(eq(concepts.id, entity_id));
        }
        break;

      case 'modify_charge_amount':
        if (entity_type === 'charge' && entity_id) {
          // Update charge amount
          await db.update(charges)
            .set({ monto_base_centavos: requestedData.amount })
            .where(eq(charges.id, entity_id));
        }
        break;

      case 'delete_charge':
        if (entity_type === 'charge' && entity_id) {
          // Delete the charge
          await db.delete(charges)
            .where(eq(charges.id, entity_id));
        }
        break;

      case 'delete_concept':
        if (entity_type === 'concept' && entity_id) {
          // Delete the concept (only if no charges exist)
          await db.delete(concepts)
            .where(eq(concepts.id, entity_id));
        }
        break;

      case 'modify_payment_due_date':
        if (entity_type === 'charge' && entity_id) {
          // Update charge due date
          await db.update(charges)
            .set({ fecha_vencimiento: requestedData.due_date })
            .where(eq(charges.id, entity_id));
        }
        break;

      case 'cancel_payment':
        if (entity_type === 'payment' && entity_id) {
          // pendiente → fallido es la transición de cancelación válida
          // (exitoso ya no se puede cancelar — usar refund_payment para reversarlo)
          await storage.updatePaymentStatus(entity_id, 'fallido', {
            tenantId: approval.tenant_id,
            userId:   approval.approved_by ?? approval.requested_by,
            metadata: { flujo: 'approval_workflow', action: 'cancel_payment' },
          });
        }
        break;

      case 'refund_payment':
        if (entity_type === 'payment' && entity_id) {
          // exitoso → reversado es la única transición válida para reembolso
          await storage.updatePaymentStatus(entity_id, 'reversado', {
            tenantId: approval.tenant_id,
            userId:   approval.approved_by ?? approval.requested_by,
            metadata: { flujo: 'approval_workflow', action: 'refund_payment' },
          });
        }
        break;

      case 'modify_late_fee':
        if (entity_type === 'surcharge_rule' && entity_id) {
          // Actualiza porcentaje y/o monto_fijo_centavos según lo que incluya requestedData.
          // Columnas reales: porcentaje (numeric), monto_fijo_centavos (integer) — ambas en
          // payment_surcharge_rules y correctamente mapeadas en el schema Drizzle.
          const lateFeeUpdate: Partial<{ porcentaje: string; monto_fijo_centavos: number }> = {};
          if (requestedData.porcentaje !== undefined) {
            lateFeeUpdate.porcentaje = String(requestedData.porcentaje);
          }
          if (requestedData.monto_fijo_centavos !== undefined) {
            lateFeeUpdate.monto_fijo_centavos = Number(requestedData.monto_fijo_centavos);
          }
          if (Object.keys(lateFeeUpdate).length > 0) {
            await db.update(payment_surcharge_rules)
              .set(lateFeeUpdate)
              .where(eq(payment_surcharge_rules.id, entity_id));
          }
        }
        break;

      case 'modify_concept':
        if (entity_type === 'concept' && entity_id) {
          // Actualiza campos de metadatos del concepto: nombre, tipo, periodicidad.
          // (Los cambios de precio van por modify_price que actualiza monto_centavos.)
          // Columnas reales: nombre (varchar NOT NULL), tipo (varchar NOT NULL),
          // periodicidad (varchar NOT NULL) — todas correctamente mapeadas en schema Drizzle.
          const conceptUpdate: Partial<{ nombre: string; tipo: string; periodicidad: string }> = {};
          if (requestedData.nombre !== undefined) conceptUpdate.nombre = requestedData.nombre;
          if (requestedData.tipo !== undefined) conceptUpdate.tipo = requestedData.tipo;
          if (requestedData.periodicidad !== undefined) conceptUpdate.periodicidad = requestedData.periodicidad;
          if (Object.keys(conceptUpdate).length > 0) {
            await db.update(concepts)
              .set(conceptUpdate)
              .where(eq(concepts.id, entity_id));
          }
        }
        break;

      default:
        throw new Error(`Tipo de acción no soportado: ${action_type}`);
    }
  }
}
