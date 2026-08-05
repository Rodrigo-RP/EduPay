/**
 * server/routes/assistant.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/assistant/chat          — navegación inteligente
 * POST /api/assistant/diagnose      — smoke-tests de módulo
 * GET  /api/assistant/issue-reports — historial de fallos (audit_log)
 * POST /api/assistant/health-check  — health-check completo de todos los módulos
 */

import type { Express } from "express";
import { authenticateToken } from "./shared";
import { matchIntent } from "../assistant-knowledge";
import { runDiagnostic, runFullDiagnostic, MODULE_CHECKS } from "../assistant-health-checks";
import { pool } from "../db";

export function registerAssistantRoutes(app: Express): void {
  // ── POST /api/assistant/chat ─────────────────────────────────────────────────
  app.post("/api/assistant/chat", authenticateToken, async (req: any, res) => {
    try {
      const { message, currentPath } = req.body as {
        message?: string;
        currentPath?: string;
      };

      if (!message || typeof message !== "string" || message.trim().length === 0) {
        return res.status(400).json({ error: "El campo message es requerido." });
      }
      if (message.trim().length > 500) {
        return res.status(400).json({ error: "El mensaje no puede superar 500 caracteres." });
      }

      const userRole: string = req.user?.role || "asistente";
      // Decodificar entidades HTML que puede introducir algún middleware de sanitización
      const decodedPath = currentPath
        ? currentPath.replace(/&#x2F;/g, "/").replace(/&#x27;/g, "'").replace(/&amp;/g, "&")
        : undefined;
      const result = matchIntent(message.trim(), userRole, decodedPath);
      return res.json(result);
    } catch (err: any) {
      console.error("[assistant] Error procesando mensaje:", err.message);
      return res.status(500).json({ reply: "Ocurrió un error interno. Por favor intenta de nuevo." });
    }
  });

  // ── POST /api/assistant/diagnose ─────────────────────────────────────────────
  /**
   * Body: { module: string, autoFixConfirmed?: boolean }
   * Returns DiagnosticResult | { error }
   */
  app.post("/api/assistant/diagnose", authenticateToken, async (req: any, res) => {
    try {
      const { module: moduleId, autoFixConfirmed = false } = req.body as {
        module?: string;
        autoFixConfirmed?: boolean;
      };

      if (!moduleId || typeof moduleId !== "string") {
        return res.status(400).json({ error: "El campo module es requerido." });
      }

      const campusId: number = req.user?.campus_id;
      const tenantId: number = req.user?.tenant_id;
      const userId: number   = req.user?.id;

      if (!campusId || !tenantId) {
        return res.status(403).json({ error: "Sesión sin campus asignado." });
      }

      const result = await runDiagnostic(moduleId, { campusId, tenantId, userId }, autoFixConfirmed);
      if (!result) {
        return res.status(404).json({ error: `Módulo '${moduleId}' no reconocido.` });
      }

      return res.json(result);
    } catch (err: any) {
      console.error("[assistant/diagnose] Error:", err.message);
      return res.status(500).json({ error: "Error interno ejecutando diagnóstico." });
    }
  });

  // ── GET /api/assistant/issue-reports ─────────────────────────────────────────
  /**
   * Devuelve los últimos 50 fallos reportados por el asistente para el tenant.
   */
  app.get("/api/assistant/issue-reports", authenticateToken, async (req: any, res) => {
    try {
      const tenantId: number = req.user?.tenant_id;
      if (!tenantId) return res.status(403).json({ error: "Sin tenant." });

      const result = await pool.query(
        `SELECT al.id, al.created_at, al.action, al.entity_id AS campus_id,
                al.metadata,
                u.name AS user_name, u.email AS user_email
         FROM audit_log al
         LEFT JOIN users u ON al.user_id = u.id
         WHERE al.tenant_id = $1
           AND al.action IN ('assistant_issue_report','assistant_autofix')
         ORDER BY al.created_at DESC
         LIMIT 50`,
        [tenantId]
      );

      const reports = result.rows.map((row: any) => {
        let meta: any = {};
        try { meta = JSON.parse(row.metadata || "{}"); } catch {}
        return {
          id: row.id,
          createdAt: row.created_at,
          action: row.action,
          campusId: row.campus_id,
          moduleId: meta.moduleId || "desconocido",
          status: meta.status || (row.action === "assistant_autofix" ? "fixed" : "error"),
          failedChecks: meta.failedChecks || [],
          fix: meta.fix || null,
          userName: row.user_name || row.user_email || "Sistema",
        };
      });

      return res.json({ reports });
    } catch (err: any) {
      console.error("[assistant/issue-reports] Error:", err.message);
      return res.status(500).json({ error: "Error consultando reportes." });
    }
  });

  // ── POST /api/assistant/health-check ─────────────────────────────────────────
  /**
   * Corre diagnóstico completo de todos los módulos.
   */
  app.post("/api/assistant/health-check", authenticateToken, async (req: any, res) => {
    try {
      const campusId: number = req.user?.campus_id;
      const tenantId: number = req.user?.tenant_id;
      const userId: number   = req.user?.id;

      if (!campusId || !tenantId) {
        return res.status(403).json({ error: "Sesión sin campus asignado." });
      }

      const results = await runFullDiagnostic({ campusId, tenantId, userId });
      const summary = {
        ok: results.filter((r) => r.status === "ok").length,
        config_error: results.filter((r) => r.status === "config_error").length,
        technical_error: results.filter((r) => r.status === "technical_error").length,
        total: results.length,
      };

      return res.json({ summary, modules: results });
    } catch (err: any) {
      console.error("[assistant/health-check] Error:", err.message);
      return res.status(500).json({ error: "Error ejecutando health-check completo." });
    }
  });

  // ── GET /api/assistant/modules ───────────────────────────────────────────────
  /**
   * Lista los módulos diagnosticables.
   */
  app.get("/api/assistant/modules", authenticateToken, (_req, res) => {
    return res.json(
      MODULE_CHECKS.map((m) => ({
        moduleId: m.moduleId,
        label: m.label,
        checkCount: m.checks.length,
      }))
    );
  });
}
