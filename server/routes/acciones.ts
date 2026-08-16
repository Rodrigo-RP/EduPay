/**
 * server/routes/acciones.ts — Motor genérico de workflow: acciones de seguimiento
 *
 * Endpoints:
 *   GET  /api/acciones           — bandeja de acciones del campus (con resync)
 *   POST /api/acciones/:id/asignar — asignar responsable a una acción
 *   GET  /api/acciones/efectividad — Q1 tiempo por tipo + Q2 velocidad por responsable
 *
 * Guard: MODULES.WORKFLOW (nuevo módulo en shared/permissions.ts)
 *
 * Decisión de resync (punto 5 del requerimiento):
 *   El resync de acciones_seguimiento vs bank_transactions corre en GET /api/acciones,
 *   NO en GET /api/conciliacion/excepciones. Razones:
 *   1. acciones.ts es el dueño de la consistencia de acciones_seguimiento; conciliacion.ts
 *      no debe acoplarse a una tabla de otro módulo.
 *   2. GET /api/conciliacion/excepciones es un endpoint de alta frecuencia que ya hace
 *      queries pesadas; añadir resync ahí lo encarecería sin beneficio arquitectónico.
 *   3. El resync es fire-and-forget — si falla, la siguiente llamada al GET lo reintenta.
 */

import type { Express } from "express";
import { pool } from "../db";
import { authenticateToken, hasPermissionForUser } from "./shared";
import { MODULES, ACTIONS } from "@shared/permissions";

export function registerAccionesRoutes(app: Express): void {

  // ── GET /api/acciones ─────────────────────────────────────────────────────
  // Bandeja de acciones del campus. Antes de seleccionar, corre un resync
  // fire-and-forget para cerrar acciones cuya fuente de verdad ya cambió.
  app.get("/api/acciones", authenticateToken, async (req: any, res) => {
    if (!hasPermissionForUser(req.user, MODULES.WORKFLOW, ACTIONS.READ)) {
      return res.status(403).json({ message: "Sin permisos para ver acciones de seguimiento" });
    }
    const campusId = req.user?.campus_id;
    if (!campusId) return res.status(400).json({ message: "campus_id requerido" });

    // ── Resync fire-and-forget ────────────────────────────────────────────────
    // Cierra acciones que ya están conciliadas/ignoradas en bank_transactions
    // pero cuyo registro en acciones_seguimiento todavía dice 'pendiente' o
    // 'asignado' (edge case: el resolver falló después de COMMIT pero antes del UPDATE).
    pool.query(
      `UPDATE acciones_seguimiento a
       SET    status       = CASE bt.estado_conciliacion
                               WHEN 'conciliado' THEN 'resuelto'::accion_status
                               WHEN 'ignorado'   THEN 'ignorado'::accion_status
                             END,
              resolved_at  = COALESCE(a.resolved_at, NOW())
       FROM   bank_transactions bt
       WHERE  a.entity_type = 'bank_transaction'
         AND  a.entity_id   = bt.id
         AND  a.campus_id   = $1
         AND  bt.estado_conciliacion IN ('conciliado','ignorado')
         AND  a.status NOT IN ('resuelto','ignorado')`,
      [campusId]
    ).catch(() => {}); // fire-and-forget

    try {
      const rows = await pool.query(
        `SELECT
           a.id, a.entity_type, a.entity_id, a.tipo_hallazgo, a.status,
           a.titulo, a.descripcion, a.resolution_notes, a.metadata,
           a.created_at, a.assigned_at, a.started_at, a.resolved_at, a.escalated_at,
           u.name   AS assigned_to_name,
           u.role   AS assigned_to_role,
           a.assigned_to
         FROM acciones_seguimiento a
         LEFT JOIN users u ON u.id = a.assigned_to
         WHERE a.campus_id = $1
         ORDER BY
           CASE a.status
             WHEN 'pendiente'   THEN 1
             WHEN 'asignado'    THEN 2
             WHEN 'en_progreso' THEN 3
             WHEN 'escalado'    THEN 4
             WHEN 'resuelto'    THEN 5
             WHEN 'ignorado'    THEN 6
           END,
           a.created_at DESC`,
        [campusId]
      );
      res.json({ acciones: rows.rows, total: rows.rows.length });
    } catch (err: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── POST /api/acciones/:id/asignar ────────────────────────────────────────
  // Asigna un responsable a una acción de seguimiento.
  // Transiciones permitidas: pendiente → asignado, escalado → asignado.
  // Si la acción ya está en en_progreso o en otro estado activo, mantiene ese
  // estado y solo actualiza assigned_to + assigned_at.
  // Devuelve 404 si no existe o pertenece a otro campus.
  // Devuelve 409 si ya está cerrada (resuelto/ignorado).
  app.post("/api/acciones/:id/asignar", authenticateToken, async (req: any, res) => {
    if (!hasPermissionForUser(req.user, MODULES.WORKFLOW, ACTIONS.ASSIGN)) {
      return res.status(403).json({ message: "Sin permisos para asignar acciones de seguimiento" });
    }

    const id         = parseInt(req.params.id);
    const campusId   = req.user?.campus_id;
    const { assigned_to } = req.body;

    if (!assigned_to || isNaN(id)) {
      return res.status(400).json({ message: "Parámetros inválidos: se requiere assigned_to" });
    }

    try {
      // Verificar que la acción existe y pertenece al campus del usuario
      const check = await pool.query(
        `SELECT id, status FROM acciones_seguimiento WHERE id = $1 AND campus_id = $2`,
        [id, campusId]
      );
      if (!check.rows.length) {
        return res.status(404).json({ message: "Acción no encontrada" });
      }
      const current = check.rows[0];
      if (current.status === 'resuelto' || current.status === 'ignorado') {
        return res.status(409).json({
          message: "No se puede reasignar una acción ya cerrada",
          status: current.status,
        });
      }

      // Transición de estado:
      // pendiente | escalado → asignado
      // asignado | en_progreso → mantiene su estado, solo actualiza responsable
      const nuevoStatus =
        (current.status === 'pendiente' || current.status === 'escalado')
          ? 'asignado'
          : current.status;

      const upd = await pool.query(
        `UPDATE acciones_seguimiento
         SET assigned_to = $1,
             assigned_at = NOW(),
             status      = $2::accion_status
         WHERE id = $3 AND campus_id = $4
         RETURNING id, status, assigned_to, assigned_at`,
        [assigned_to, nuevoStatus, id, campusId]
      );
      res.json({ message: "Responsable asignado correctamente", accion: upd.rows[0] });
    } catch (err: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── GET /api/acciones/efectividad ─────────────────────────────────────────
  // Devuelve dos datasets de métricas de efectividad:
  //   q1: tiempo de resolución por tipo de hallazgo (últimos 3 meses)
  //   q2: conteo y velocidad por responsable (últimos 3 meses)
  //
  // Verificación del rango "últimos 3 meses":
  //   Fórmula: DATE_TRUNC('month', CURRENT_DATE - INTERVAL '2 months')
  //   Ejemplo con hoy = 16 Aug 2026:
  //     CURRENT_DATE - INTERVAL '2 months' = 16 Jun 2026
  //     DATE_TRUNC('month', 16 Jun)        = 1 Jun 2026
  //     Cubre: junio + julio + agosto = 3 meses ✓
  //   Caso límite inicio de mes (1 Aug):
  //     1 Aug - 2 months = 1 Jun → DATE_TRUNC = 1 Jun → 3 meses ✓
  //   Caso límite fin de mes (31 Aug):
  //     31 Aug - 2 months = 30 Jun → DATE_TRUNC = 1 Jun → 3 meses ✓
  //   Rollover (1 Sep):
  //     1 Sep - 2 months = 1 Jul → DATE_TRUNC = 1 Jul → cubre Jul+Ago+Sep = 3 meses ✓
  //   IMPORTANTE: usar INTERVAL '3 months' daría DATE_TRUNC del mes de hace 3 meses
  //   = 4 meses de cobertura (bug corregido respecto al draft de diseño en Q1).
  app.get("/api/acciones/efectividad", authenticateToken, async (req: any, res) => {
    if (!hasPermissionForUser(req.user, MODULES.WORKFLOW, ACTIONS.READ)) {
      return res.status(403).json({ message: "Sin permisos para ver métricas de efectividad" });
    }
    const campusId = req.user?.campus_id;
    if (!campusId) return res.status(400).json({ message: "campus_id requerido" });

    try {
      const [q1Rows, q2Rows] = await Promise.all([
        // Q1: tiempo promedio de resolución por tipo_hallazgo
        pool.query(
          `SELECT
             tipo_hallazgo,
             COUNT(*)                                                         AS total_detectadas,
             COUNT(*) FILTER (WHERE status IN ('resuelto','ignorado'))        AS cerradas,
             COUNT(*) FILTER (WHERE status NOT IN ('resuelto','ignorado'))    AS abiertas,
             ROUND(AVG(
               EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600
             ) FILTER (WHERE resolved_at IS NOT NULL), 1)                    AS horas_prom_total,
             ROUND(AVG(
               EXTRACT(EPOCH FROM (assigned_at - created_at)) / 3600
             ) FILTER (WHERE assigned_at IS NOT NULL), 1)                    AS horas_prom_hasta_asignacion,
             ROUND(AVG(
               EXTRACT(EPOCH FROM (resolved_at - assigned_at)) / 3600
             ) FILTER (WHERE resolved_at IS NOT NULL
                         AND assigned_at IS NOT NULL), 1)                    AS horas_prom_trabajo,
             COUNT(*) FILTER (
               WHERE status NOT IN ('resuelto','ignorado')
                 AND created_at < NOW() - INTERVAL '48 hours'
             )                                                                AS vencidas_48h
           FROM acciones_seguimiento
           WHERE campus_id  = $1
             AND created_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '2 months')
           GROUP BY tipo_hallazgo
           ORDER BY horas_prom_total DESC NULLS LAST`,
          [campusId]
        ),
        // Q2: conteo y velocidad por responsable
        pool.query(
          `SELECT
             u.id                                                                  AS user_id,
             u.name                                                                AS nombre,
             u.role,
             COUNT(*)                                                              AS total_asignadas,
             COUNT(*) FILTER (WHERE a.status = 'resuelto')                        AS resueltas,
             COUNT(*) FILTER (WHERE a.status = 'ignorado')                        AS ignoradas,
             COUNT(*) FILTER (WHERE a.status IN ('asignado','en_progreso'))        AS en_curso,
             COUNT(*) FILTER (WHERE a.status = 'escalado')                        AS escaladas,
             ROUND(AVG(
               EXTRACT(EPOCH FROM (a.resolved_at - a.assigned_at)) / 3600
             ) FILTER (
               WHERE a.resolved_at IS NOT NULL
                 AND a.assigned_at IS NOT NULL
                 AND a.status != 'escalado'
             ), 1)                                                                 AS horas_prom_resolucion,
             ROUND(
               COUNT(*) FILTER (WHERE a.status = 'resuelto') * 100.0
               / NULLIF(
                   COUNT(*) FILTER (WHERE a.status IN ('resuelto','ignorado','escalado')),
                   0
                 ),
               1
             )                                                                     AS pct_resuelto_directo
           FROM acciones_seguimiento a
           JOIN users u ON u.id = a.assigned_to
           WHERE a.campus_id   = $1
             AND a.assigned_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '2 months')
           GROUP BY u.id, u.name, u.role
           ORDER BY total_asignadas DESC`,
          [campusId]
        ),
      ]);

      res.json({
        periodo_desde: (() => {
          const d = new Date();
          d.setMonth(d.getMonth() - 2);
          d.setDate(1);
          return d.toISOString().slice(0, 10);
        })(),
        por_tipo:         q1Rows.rows,
        por_responsable:  q2Rows.rows,
      });
    } catch (err: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });
}
