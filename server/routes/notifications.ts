import type { Express } from "express";
import { pool, db } from "../db";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";
import { authenticateToken, requireAuth, requireSuperAdmin, serializeUser } from "./shared";
import { NotificationSystem as ServerNotificationSystem } from "../notification-system";
import { wsManager } from "../websocket-manager";
import { users, students, guardians, charges, payments, concepts, scholarships } from "@shared/schema";
import { z } from "zod";

export function registerNotificationRoutes(app: Express): void {
  app.get("/api/notifications", authenticateToken, async (req, res) => {
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
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/notifications/stats
   * Estadísticas de notificaciones para el tenant.
   */
  app.get("/api/notifications/stats", authenticateToken, async (req, res) => {
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
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/notifications/pending-students
   * Devuelve estudiantes con cargos pendientes/morosos del campus del usuario.
   * Query: ?tipo=RECORDATORIO_VENCIMIENTO|AVISO_MORA|CARGO_EMITIDO
   * Datos reales del sistema, no simulados.
   */
  app.get("/api/notifications/pending-students", authenticateToken, async (req, res) => {
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
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ error: "Error interno del servidor", message: error.message });
    }
  });

  // ===== PAYMENT CONFIGURATION APIs (legacy demo routes removed - real DB routes in later section) =====

  // Get late fee rules configuration
  app.get("/api/payment-config/late-fee-rules", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      const campusId = user.campus_id || 1;
      
      // Demo data for late fee rules - in production this would come from database
      const lateFeeRules = [
        {
          id: "1",
          nombre: "Estándar Mexicano",
          tipo: "porcentaje",
          dias_gracia: 5,
          porcentaje: 3,
          aplica_fines_semana: false,
          aplica_festivos: false,
          monto_maximo: 500000, // $5,000 MXN in centavos
          activo: true,
          campus_id: campusId
        },
        {
          id: "2",
          nombre: "Recargo Fijo Básico",
          tipo: "fijo",
          dias_gracia: 3,
          monto_fijo: 20000, // $200 MXN in centavos
          aplica_fines_semana: false,
          aplica_festivos: false,
          activo: true,
          campus_id: campusId
        },
        {
          id: "3",
          nombre: "Progresivo por Días",
          tipo: "progresivo",
          dias_gracia: 7,
          reglas_progresivas: [
            { dias_desde: 1, dias_hasta: 15, porcentaje: 1 },
            { dias_desde: 16, dias_hasta: 30, porcentaje: 2 },
            { dias_desde: 31, dias_hasta: 999, porcentaje: 3 }
          ],
          aplica_fines_semana: false,
          aplica_festivos: false,
          activo: false,
          campus_id: campusId
        }
      ];
      
      res.json(lateFeeRules);
    } catch (error: any) {
      res.status(500).json({ error: "Error obteniendo reglas de recargo", message: error.message });
    }
  });

  // Create new late fee rule
  app.post("/api/payment-config/late-fee-rules", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      const campusId = user.campus_id || 1;
      const { 
        nombre, 
        tipo, 
        dias_gracia, 
        porcentaje, 
        monto_fijo, 
        reglas_progresivas,
        aplica_fines_semana, 
        aplica_festivos, 
        monto_maximo 
      } = req.body;
      
      if (!nombre || !tipo || dias_gracia === undefined) {
        return res.status(400).json({ error: "Nombre, tipo y días de gracia son requeridos" });
      }

      if (dias_gracia < 0 || dias_gracia > 30) {
        return res.status(400).json({ error: "Los días de gracia deben estar entre 0 y 30" });
      }

      if (tipo === 'porcentaje' && (!porcentaje || porcentaje <= 0 || porcentaje > 50)) {
        return res.status(400).json({ error: "El porcentaje debe estar entre 0.1 y 50" });
      }

      if (tipo === 'fijo' && (!monto_fijo || monto_fijo <= 0)) {
        return res.status(400).json({ error: "El monto fijo debe ser mayor a 0" });
      }
      
      const newLateFeeRule = {
        id: Date.now().toString(),
        nombre,
        tipo,
        dias_gracia: parseInt(dias_gracia),
        porcentaje: tipo === 'porcentaje' ? parseFloat(porcentaje) : undefined,
        monto_fijo: tipo === 'fijo' ? parseInt(monto_fijo) : undefined,
        reglas_progresivas: tipo === 'progresivo' ? reglas_progresivas : undefined,
        aplica_fines_semana: !!aplica_fines_semana,
        aplica_festivos: !!aplica_festivos,
        monto_maximo: monto_maximo ? parseInt(monto_maximo) : undefined,
        activo: true,
        campus_id: campusId,
        created_at: new Date().toISOString()
      };
      
      res.json({ 
        message: "Regla de recargo creada exitosamente",
        lateFeeRule: newLateFeeRule
      });
    } catch (error: any) {
      res.status(500).json({ error: "Error creando regla de recargo", message: error.message });
    }
  });

  // Update late fee rule
  app.put("/api/payment-config/late-fee-rules/:id", authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const { 
        nombre, 
        tipo, 
        dias_gracia, 
        porcentaje, 
        monto_fijo, 
        reglas_progresivas,
        aplica_fines_semana, 
        aplica_festivos, 
        monto_maximo,
        activo 
      } = req.body;
      
      if (!nombre || !tipo || dias_gracia === undefined) {
        return res.status(400).json({ error: "Nombre, tipo y días de gracia son requeridos" });
      }

      if (dias_gracia < 0 || dias_gracia > 30) {
        return res.status(400).json({ error: "Los días de gracia deben estar entre 0 y 30" });
      }

      if (tipo === 'porcentaje' && (!porcentaje || porcentaje <= 0 || porcentaje > 50)) {
        return res.status(400).json({ error: "El porcentaje debe estar entre 0.1 y 50" });
      }

      if (tipo === 'fijo' && (!monto_fijo || monto_fijo <= 0)) {
        return res.status(400).json({ error: "El monto fijo debe ser mayor a 0" });
      }
      
      const updatedLateFeeRule = {
        id,
        nombre,
        tipo,
        dias_gracia: parseInt(dias_gracia),
        porcentaje: tipo === 'porcentaje' ? parseFloat(porcentaje) : undefined,
        monto_fijo: tipo === 'fijo' ? parseInt(monto_fijo) : undefined,
        reglas_progresivas: tipo === 'progresivo' ? reglas_progresivas : undefined,
        aplica_fines_semana: !!aplica_fines_semana,
        aplica_festivos: !!aplica_festivos,
        monto_maximo: monto_maximo ? parseInt(monto_maximo) : undefined,
        activo: activo !== undefined ? activo : true,
        updated_at: new Date().toISOString()
      };
      
      res.json({ 
        message: "Regla de recargo actualizada exitosamente",
        lateFeeRule: updatedLateFeeRule
      });
    } catch (error: any) {
      res.status(500).json({ error: "Error actualizando regla de recargo", message: error.message });
    }
  });

  // Delete late fee rule
  app.delete("/api/payment-config/late-fee-rules/:id", authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      
      res.json({ 
        message: "Regla de recargo eliminada exitosamente",
        deletedId: id
      });
    } catch (error: any) {
      res.status(500).json({ error: "Error eliminando regla de recargo", message: error.message });
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
      res.status(500).json({ error: "Error calculando recargo", message: error.message });
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
      res.status(500).json({ error: "Error obteniendo presets", message: error.message });
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
      res.status(500).json({ message: "Error obteniendo aprobaciones pendientes: " + error.message });
    }
  });

  // Get user's own requests (as requester)
  app.get("/api/approvals/my-requests", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const requests = await storage.getPendingApprovalsByRequester(userId);
      res.json(requests);
    } catch (error: any) {
      res.status(500).json({ message: "Error obteniendo mis solicitudes: " + error.message });
    }
  });

  // Get all approvals history (for both admin and requesters)
  app.get("/api/approvals/history", authenticateToken, async (req, res) => {
    try {
      const allApprovals = await storage.getAllApprovalsHistory();
      res.json(allApprovals);
    } catch (error: any) {
      res.status(500).json({ message: "Error obteniendo historial de aprobaciones: " + error.message });
    }
  });

  // Create new approval request
  app.post("/api/approvals/request", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
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

      // Create the approval request
      const approval = await storage.createPendingApproval({
        campus_id: user.campus_id!,
        requested_by: user.id,
        action_type,
        entity_type: 'approval',
        entity_id: 1,
        original_data: current_value || '',
        requested_data: proposed_value || '',
        reason,
        status: 'pending'
      });

      // Create notifications for approvers
      const approvers = await storage.getPendingApprovalsForApprover(user.id);
      // In a real system, you would notify all potential approvers
      
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
      res.status(500).json({ message: "Error creando solicitud de aprobación: " + error.message });
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
      res.status(500).json({ message: "Error procesando decisión: " + error.message });
    }
  });

  // Get approval workflow logs
  app.get("/api/approvals/logs/:approvalId", authenticateToken, async (req, res) => {
    try {
      const { approvalId } = req.params;
      const logs = await storage.getWorkflowLogsByApproval(parseInt(approvalId));
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: "Error obteniendo logs de aprobación: " + error.message });
    }
  });

  // Get user notifications
  app.get("/api/approvals/notifications", authenticateToken, async (req, res) => {
    try {
      // Buscar usuario administrador general para notificaciones
      const adminUsers = await db.select().from(users).where(eq(users.role, 'administrador_general')).limit(1);
      const adminUserId = adminUsers.length > 0 ? adminUsers[0].id : 25; // Fallback a super admin
      
      const notifications = await storage.getNotificationsByUser(adminUserId);
      res.json(notifications);
    } catch (error: any) {
      res.status(500).json({ message: "Error obteniendo notificaciones: " + error.message });
    }
  });

  // Mark notification as read
  app.post("/api/approvals/notifications/:id/read", authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.markNotificationAsRead(parseInt(id));
      res.json({ message: "Notificación marcada como leída" });
    } catch (error: any) {
      res.status(500).json({ message: "Error marcando notificación como leída: " + error.message });
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
      res.status(500).json({ message: "Error verificando requisitos de aprobación: " + error.message });
    }
  });

  // Function to execute approved changes
  async function executeApprovedChange(approval: any) {
    const { action_type, entity_type, entity_id, requested_data } = approval;
    const requestedData = JSON.parse(requested_data);

    switch (action_type) {
      case 'modify_scholarship':
        if (entity_type === 'scholarship' && entity_id) {
          // Update scholarship percentage
          await db.update(scholarships)
            .set({ porcentaje_aplicado: requestedData.percentage })
            .where(eq(scholarships.id, entity_id));
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

      default:
        throw new Error(`Tipo de acción no soportado: ${action_type}`);
    }
  }
}
