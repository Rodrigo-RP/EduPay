/**
 * server/routes/assistant.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/assistant/chat          — navegación inteligente
 * POST /api/assistant/diagnose      — smoke-tests de módulo
 * GET  /api/assistant/issue-reports — historial de fallos (audit_log)
 * POST /api/assistant/health-check  — health-check completo de todos los módulos
 */

import type { Express } from "express";
import { authenticateToken, hasPermissionForUser } from "./shared";
import { MODULES, ACTIONS } from "@shared/permissions";
import {
  matchIntent,
  detectExportIntent,
  detectSuggestTrigger,
  containsSensitiveAssistantData,
  isClaudeReadOnlyFallbackCandidate,
} from "../assistant-knowledge";
import { runDiagnostic, runFullDiagnostic, MODULE_CHECKS } from "../assistant-health-checks";
import {
  executeAction,
  resolveSuggestContext,
  type StudentNavigationTarget,
} from "../assistant-actions";
import {
  answerWithClaude,
  getAssistantActionPermission,
} from "../assistant-claude";
import {
  appendTrustedConversationTurn,
  getAssistantConversationSession,
  getTrustedConversationHistory,
} from "../assistant-conversation-store";
import { pool } from "../db";

function isContextualFollowUp(message: string, history: unknown): boolean {
  if (!Array.isArray(history)) return false;
  const hasAssistantContext = history.some(
    (turn) => turn
      && typeof turn === "object"
      && (turn as any).role === "assistant"
      && typeof (turn as any).content === "string",
  );
  return hasAssistantContext
    && /\bde\s+(?:esos|esas|ellos|ellas)\b|\b(?:los|las)\s+anteriores\b/i.test(message);
}

function isScholarshipContextFollowUp(message: string): boolean {
  return /\bbecas?\b|\bbecad[oa]s?\b|\bdescuentos?\b/i.test(message);
}

function uniqueStudentTargets(value: unknown): StudentNavigationTarget[] {
  if (!Array.isArray(value)) return [];
  const targets = new Map<number, StudentNavigationTarget>();
  for (const candidate of value) {
    const id = Number((candidate as any)?.id);
    const name = typeof (candidate as any)?.name === "string"
      ? (candidate as any).name.trim()
      : "";
    if (Number.isSafeInteger(id) && id > 0 && name) targets.set(id, { id, name });
  }
  return Array.from(targets.values());
}

function mostRecentStudentTargets(claudeTurns: unknown): StudentNavigationTarget[] {
  if (!Array.isArray(claudeTurns)) return [];
  for (const turn of [...claudeTurns].reverse()) {
    const targets = uniqueStudentTargets((turn as any)?.studentTargets);
    if (targets.length) return targets;
  }
  return [];
}

type ContextScholarshipStatus = StudentNavigationTarget & { porcentaje: number | null };

async function getContextScholarshipStatuses(
  targets: StudentNavigationTarget[],
  tenantId: number,
  campusId: number,
): Promise<ContextScholarshipStatus[]> {
  if (!targets.length) return [];
  const result = await pool.query(
    `SELECT s.id,
            COALESCE(s.nombre_completo, CONCAT_WS(' ', s.nombres, s.apellido_paterno, s.apellido_materno)) AS name,
            scholarship.porcentaje
       FROM students s
       LEFT JOIN LATERAL (
         SELECT porcentaje
           FROM scholarships
          WHERE student_id = s.id
            AND tenant_id = $2
            AND (vigencia_inicio IS NULL OR vigencia_inicio <= CURRENT_DATE)
            AND (vigencia_fin IS NULL OR vigencia_fin >= CURRENT_DATE)
          ORDER BY id DESC
          LIMIT 1
       ) scholarship ON true
      WHERE s.id = ANY($1::int[])
        AND s.tenant_id = $2
        AND s.campus_id = $3`,
    [targets.map((target) => target.id), tenantId, campusId],
  );
  return result.rows.flatMap((row: any) => {
    const id = Number(row.id);
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!Number.isSafeInteger(id) || id <= 0 || !name) return [];
    const percentage = row.porcentaje === null || row.porcentaje === undefined
      ? null
      : Number(row.porcentaje);
    return [{ id, name, porcentaje: Number.isFinite(percentage) ? percentage : null }];
  });
}

function formatContextScholarships(statuses: ContextScholarshipStatus[]): string {
  if (!statuses.length) return "";
  const cell = (value: string) => value.replace(/\|/g, "\\|");
  return [
    "### Becas de los alumnos consultados",
    "| Alumno | Beca vigente |",
    "| --- | --- |",
    ...statuses.map((status) =>
      `| ${cell(status.name)} | ${
        status.porcentaje === null
          ? "Sin beca activa"
          : `${status.porcentaje.toLocaleString("es-MX", { maximumFractionDigits: 2 })}%`
      } |`,
    ),
  ].join("\n");
}

export function registerAssistantRoutes(app: Express): void {
  const auditAssistantDenied = async (req: any, actionId: string, reason: string) => {
    await pool.query(
      `INSERT INTO audit_log
        (tenant_id, user_id, action, entity_type, entity_id, metadata, created_at)
       VALUES ($1, $2, 'assistant_access_denied', 'system', $3, $4, NOW())`,
      [
        req.user?.tenant_id || null,
        req.user?.id || null,
        req.user?.campus_id || null,
        JSON.stringify({ actionId, reason, messageLength: String(req.body?.message || "").length }),
      ],
    );
  };

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
      const campusId: number = req.user?.campus_id;
      const tenantId: number = req.user?.tenant_id;
      const userId: number   = req.user?.id;
      const conversationSession = getAssistantConversationSession(
        req.header("authorization"),
        req.user,
      );
      const trustedHistory = getTrustedConversationHistory(conversationSession);

      // Decodificar entidades HTML que puede introducir algún middleware de sanitización
      const decodedPath = currentPath
        ? currentPath.replace(/&#x2F;/g, "/").replace(/&#x27;/g, "'").replace(/&amp;/g, "&")
        : undefined;

      // ── N3: intención de exportación — tiene prioridad sobre matchIntent ─────
      const exportIntent = detectExportIntent(message.trim());
      if (exportIntent) {
        const exportPermission = exportIntent.endpoint.includes("financiero") || exportIntent.endpoint.includes("cobranza")
          ? [MODULES.FINANCIAL, ACTIONS.READ] as const
          : [MODULES.REPORTS, ACTIONS.READ] as const;
        if (!hasPermissionForUser(req.user, exportPermission[0], exportPermission[1])) {
          await auditAssistantDenied(req, "export:" + exportIntent.format, "missing_read_permission");
          return res.status(403).json({
            error: "Sin permiso",
            reply: "No tienes permiso para consultar este reporte desde el asistente.",
          });
        }
        const fmtLabel = exportIntent.format === "pdf" ? "PDF" : "Excel";
        pool.query(
          `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata, created_at)
           VALUES ($1, $2, 'assistant_chat_interaction', 'system', $3, $4, NOW())`,
          [
            tenantId || null,
            userId || null,
            campusId || null,
            JSON.stringify({ intentType: "export", endpoint: exportIntent.endpoint, format: exportIntent.format }),
          ]
        ).catch(() => {});

        return res.json({
          reply: `Aquí está tu **${exportIntent.reportLabel}** en ${fmtLabel}. Haz clic en el botón para descargarlo.`,
          export: exportIntent,
        });
      }

      // ── Sugerencias de escritura: preparar, nunca ejecutar ──────────────────
      // La señal se confirma después en la UI y el endpoint administrativo vuelve
      // a validar permisos, tenant/campus y payload antes de cambiar datos.
      const suggestTrigger = detectSuggestTrigger(message.trim());
      if (suggestTrigger) {
        const canPrepareSuggestion = [
          "super_admin",
          "administrador_general",
          "administrador_campus",
          "admisiones",
        ].includes(userRole);
        if (
          suggestTrigger.action === "asignar_beca"
          && canPrepareSuggestion
          && Number.isSafeInteger(campusId)
          && Number.isSafeInteger(tenantId)
        ) {
          const resolved = await resolveSuggestContext(suggestTrigger, { campusId, tenantId });
          if (resolved?.kind === "signal") {
            pool.query(
              `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata, created_at)
               VALUES ($1, $2, 'assistant_chat_interaction', 'system', $3, $4, NOW())`,
              [
                tenantId || null, userId || null, campusId || null,
                JSON.stringify({ intentType: "suggestion_prepared", requestedAction: suggestTrigger.action, messageLength: message.trim().length }),
              ],
            ).catch(() => {});
            return res.json({
              reply: "Preparé una propuesta para tu revisión. Confírmala para aplicarla.",
              suggest: resolved.signal,
            });
          }
          if (resolved?.kind === "clarification") {
            return res.json({ reply: resolved.reply });
          }
        }
        pool.query(
          `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata, created_at)
           VALUES ($1, $2, 'assistant_chat_interaction', 'system', $3, $4, NOW())`,
          [
            tenantId || null, userId || null, campusId || null,
            JSON.stringify({ intentType: "write_request_refused", requestedAction: suggestTrigger.action, messageLength: message.trim().length }),
          ],
        ).catch(() => {});
        return res.json({
          reply:
            "El asistente sólo puede consultar y orientar. No puede modificar becas, cargos, pagos, facturas ni configuraciones. " +
            "Realiza esta acción manualmente desde la pantalla correspondiente.",
        });
      }

      const result = matchIntent(message.trim(), userRole, decodedPath);
      if (containsSensitiveAssistantData(message)) {
        return res.json({
          reply: "No puedo consultar ni compartir CURP, RFC, contraseñas, tokens, credenciales o secretos.",
        });
      }
      const contextualFollowUp = isContextualFollowUp(message, trustedHistory.messages);
      const scholarshipPermission = getAssistantActionPermission("query:becas_alumno", {});
      const contextualScholarshipTargets = contextualFollowUp
        && isScholarshipContextFollowUp(message)
        && scholarshipPermission
        && hasPermissionForUser(req.user, scholarshipPermission[0], scholarshipPermission[1])
        ? mostRecentStudentTargets(trustedHistory.claudeTurns)
        : [];
      const naturalClaudeActionId = result.action
        && ["query:resumen_ejecutivo_mes", "query:adeudos_nivel_periodo"].includes(result.action.actionId)
        ? result.action.actionId
        : null;
      const naturalClaudeAction = Boolean(naturalClaudeActionId) && !contextualFollowUp;
      let prefetchedActionResult: Awaited<ReturnType<typeof executeAction>> | undefined;

      if (naturalClaudeAction && campusId && tenantId && result.action) {
        const requiredPermission = getAssistantActionPermission(
          result.action.actionId,
          result.action.params,
        );
        if (
          requiredPermission
          && !hasPermissionForUser(req.user, requiredPermission[0], requiredPermission[1])
        ) {
          await auditAssistantDenied(req, result.action.actionId, "missing_read_permission");
          return res.status(403).json({
            error: "Sin permiso",
            reply: "No tienes permiso para consultar esta información desde el asistente.",
          });
        }
        prefetchedActionResult = await executeAction(
          result.action.actionId,
          result.action.params,
          { campusId, tenantId, userId },
        );
      }

      // Si el intent es una acción/consulta de datos, ejecutarla en el servidor
      if (result.action && campusId && tenantId && !contextualFollowUp && !naturalClaudeAction) {
        const requiredPermission = getAssistantActionPermission(
          result.action.actionId,
          result.action.params,
        );
        if (
          requiredPermission &&
          !hasPermissionForUser(req.user, requiredPermission[0], requiredPermission[1])
        ) {
          await auditAssistantDenied(req, result.action.actionId, "missing_read_permission");
          return res.status(403).json({
            error: "Sin permiso",
            reply: "No tienes permiso para consultar esta información desde el asistente.",
          });
        }
        const actionResult = await executeAction(
          result.action.actionId,
          result.action.params,
          { campusId, tenantId, userId }
        );
        // Reemplazar la respuesta genérica con el resumen real
        result.reply = actionResult.summary;
        (result as any).actionResult = actionResult;
        delete result.action;
      }

      const canUseClaude = Boolean(naturalClaudeAction) || (isClaudeReadOnlyFallbackCandidate(message)
        && !result.diagnose
        && !result.guide
        && !result.navigate
        && !result.suggestions
        && !(result as any).actionResult)
        || (
          contextualFollowUp
          && isClaudeReadOnlyFallbackCandidate(message)
          && !result.diagnose
          && !result.guide
          && !result.navigate
          && !result.suggestions
        );
      if (canUseClaude && campusId && tenantId) {
        const claude = await answerWithClaude(
          message.trim(),
          { campusId, tenantId, userId: userId || 0, role: userRole },
          {
            canRead: (actionId, params) => {
              const permission = getAssistantActionPermission(actionId, params);
              return Boolean(
                permission &&
                hasPermissionForUser(req.user, permission[0], permission[1]),
              );
            },
            history: trustedHistory,
            prefetchedTool: naturalClaudeAction && result.action && prefetchedActionResult
              ? {
                name: naturalClaudeActionId === "query:resumen_ejecutivo_mes"
                  ? "query_resumen_ejecutivo_mes"
                  : "query_adeudos_nivel_periodo",
                input: result.action.params,
                result: prefetchedActionResult,
              }
              : undefined,
          },
        );

        const expectedToolWasUsed = !naturalClaudeAction
          || claude.trace.toolCalls.includes(
            naturalClaudeActionId === "query:resumen_ejecutivo_mes"
              ? "query_resumen_ejecutivo_mes"
              : "query_adeudos_nivel_periodo",
          );
        if (claude.handled && !claude.error && expectedToolWasUsed) {
          const contextScholarships = await getContextScholarshipStatuses(
            contextualScholarshipTargets,
            tenantId,
            campusId,
          );
          const responseTargets = uniqueStudentTargets([
            ...contextualScholarshipTargets,
            ...(claude.studentTargets ?? []),
          ]);
          const verifiedContextScholarships = formatContextScholarships(contextScholarships);
          const reply = verifiedContextScholarships
            ? `${claude.reply}\n\n${verifiedContextScholarships}`
            : claude.reply;
          if (claude.conversationTurn) {
            appendTrustedConversationTurn(conversationSession, {
              ...claude.conversationTurn,
              assistant: reply ?? claude.conversationTurn.assistant,
              studentTargets: responseTargets,
            });
          }
          pool.query(
            `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata, created_at)
             VALUES ($1, $2, 'assistant_chat_interaction', 'system', $3, $4, NOW())`,
            [
              tenantId || null,
              userId || null,
              campusId || null,
              JSON.stringify({
                intentType: "claude_fallback",
                provider: "anthropic",
                model: claude.trace.model,
                toolCalls: claude.trace.toolCalls,
                adeudosPeriodos: claude.trace.adeudosPeriodos,
                rounds: claude.trace.rounds,
                stopReason: claude.trace.stopReason,
                success: !claude.error,
                messageLength: message.trim().length,
              }),
            ],
          ).catch(() => {});
          return res.json({
            reply,
            studentTargets: responseTargets.length ? responseTargets : claude.studentTargets,
            claude: {
              provider: "anthropic",
              model: claude.trace.model,
              toolCalls: claude.trace.toolCalls,
              adeudosPeriodos: claude.trace.adeudosPeriodos,
              rounds: claude.trace.rounds,
            },
          });
        }
      }
      if (naturalClaudeAction && result.action && campusId && tenantId) {
        const actionResult = prefetchedActionResult ?? await executeAction(
          result.action.actionId,
          result.action.params,
          { campusId, tenantId, userId },
        );
        result.reply = actionResult.summary;
        (result as any).actionResult = actionResult;
        (result as any).studentTargets = actionResult.studentTargets;
        delete result.action;
      }
      // ── §4.3 Registro estructurado de interacción (sin PII de familias) ─────
      // Determinar qué tipo de intención se resolvió
      const intentType = (result as any).actionResult
        ? "query_action"
        : result.navigate
          ? "navigation"
          : (result as any).diagnose
            ? "diagnose"
            : "no_match";

      pool.query(
        `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata, created_at)
         VALUES ($1, $2, 'assistant_chat_interaction', 'system', $3, $4, NOW())`,
        [
          tenantId || null,
          userId || null,
          campusId || null,
          JSON.stringify({
            intentType,
            route: result.navigate?.route || null,
            actionId: (result as any).actionResult
              ? ((result as any).actionResult as any).title || intentType
              : null,
            messageLength: message.trim().length,
          }),
        ]
      ).catch(() => {}); // no bloquear si audit falla

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
