/**
 * Actividad operativa de Cuentas por Cobrar.
 *
 * Notas, seguimientos, promesas, recordatorios y escalaciones se almacenan
 * aquí en vez de confirmarse sólo desde el estado de la pantalla.
 */
import type { Express } from "express";
import { pool } from "../db";
import { authenticateToken, hasPermissionForUser } from "./shared";
import { ACTIONS, MODULES } from "@shared/permissions";

type ActivityKind =
  | "cobranza"
  | "recordatorio"
  | "promesa"
  | "seguimiento"
  | "nota"
  | "escalacion";

const ALLOWED_CHANNELS = new Set(["email", "sms", "whatsapp", "llamada"]);
const ALLOWED_PRIORITIES = new Set(["baja", "normal", "alta", "urgente"]);
const ALLOWED_URGENCIES = new Set(["baja", "media", "alta", "critica"]);
type QueryClient = { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> };

function asPositiveId(value: unknown): number | null {
  const id = typeof value === "number" ? value : Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function asOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
}

async function getScope(req: any, res: any): Promise<{ campusId: number; tenantId: number } | null> {
  const campusId = asPositiveId(req.user?.campus_id);
  const tenantId = asPositiveId(req.user?.tenant_id);
  if (!campusId || !tenantId) {
    res.status(400).json({ message: "La sesión no tiene campus y tenant válidos" });
    return null;
  }
  return { campusId, tenantId };
}

async function ensureChargeInScope(
  chargeId: number,
  campusId: number,
  tenantId: number,
  client: QueryClient = pool,
): Promise<{ id: number; student_id: number; estudiante: string }> {
  const result = await client.query(
    `SELECT c.id, c.student_id, s.nombre_completo AS estudiante
       FROM charges c
       JOIN students s ON s.id = c.student_id
      WHERE c.id = $1 AND c.tenant_id = $2 AND s.campus_id = $3`,
    [chargeId, tenantId, campusId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("La cuenta seleccionada no pertenece al campus actual");
  return row;
}

async function insertActivity(
  client: QueryClient,
  scope: { campusId: number; tenantId: number },
  userId: number | null,
  activity: {
    chargeId: number;
    kind: ActivityKind;
    state: string;
    title: string;
    description?: string | null;
    scheduledDate?: string | null;
    scheduledTime?: string | null;
    amountCentavos?: number | null;
    channel?: string | null;
    priority?: string | null;
    reason?: string | null;
    supervisor?: string | null;
    urgency?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const charge = await ensureChargeInScope(activity.chargeId, scope.campusId, scope.tenantId, client);
  const inserted = await client.query(
    `INSERT INTO collection_activities (
        tenant_id, campus_id, charge_id, student_id, created_by, tipo, estado,
        titulo, descripcion, fecha_programada, hora_programada, monto_centavos,
        canal, prioridad, motivo, supervisor, urgencia, metadata
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb
      )
      RETURNING id, charge_id, student_id, tipo, estado, titulo, descripcion,
                fecha_programada, hora_programada, monto_centavos, canal, prioridad,
                motivo, supervisor, urgencia, metadata, created_at`,
    [
      scope.tenantId,
      scope.campusId,
      charge.id,
      charge.student_id,
      userId,
      activity.kind,
      activity.state,
      activity.title,
      activity.description ?? null,
      activity.scheduledDate ?? null,
      activity.scheduledTime ?? null,
      activity.amountCentavos ?? null,
      activity.channel ?? null,
      activity.priority ?? null,
      activity.reason ?? null,
      activity.supervisor ?? null,
      activity.urgency ?? null,
      JSON.stringify(activity.metadata ?? {}),
    ],
  );
  return { ...inserted.rows[0], estudiante: charge.estudiante };
}

export function registerReceivablesRoutes(app: Express): void {
  app.get("/api/receivables/activities", authenticateToken, async (req: any, res) => {
    if (!hasPermissionForUser(req.user, MODULES.RECEIVABLES, ACTIONS.READ)) {
      return res.status(403).json({ message: "Sin permisos para ver actividad de cobranza" });
    }
    const scope = await getScope(req, res);
    if (!scope) return;

    const chargeId = req.query.charge_id == null ? null : asPositiveId(req.query.charge_id);
    if (req.query.charge_id != null && !chargeId) {
      return res.status(400).json({ message: "charge_id inválido" });
    }

    try {
      const result = await pool.query(
        `SELECT a.*, s.nombre_completo AS estudiante, u.name AS creado_por
           FROM collection_activities a
           JOIN students s ON s.id = a.student_id
           LEFT JOIN users u ON u.id = a.created_by
          WHERE a.tenant_id = $1
            AND a.campus_id = $2
            AND ($3::integer IS NULL OR a.charge_id = $3)
          ORDER BY a.created_at DESC
          LIMIT 200`,
        [scope.tenantId, scope.campusId, chargeId],
      );
      res.json(result.rows);
    } catch (error) {
      console.error("Error al consultar actividades de cobranza:", error);
      res.status(500).json({ message: "No se pudo consultar la actividad de cobranza" });
    }
  });

  const requireProcess = async (req: any, res: any) => {
    if (!hasPermissionForUser(req.user, MODULES.RECEIVABLES, ACTIONS.PROCESS)) {
      res.status(403).json({ message: "Sin permisos para gestionar cobranza" });
      return null;
    }
    return getScope(req, res);
  };

  app.post("/api/receivables/follow-ups", authenticateToken, async (req: any, res) => {
    const scope = await requireProcess(req, res);
    if (!scope) return;
    const chargeId = asPositiveId(req.body?.charge_id);
    const type = asOptionalText(req.body?.tipo, 40);
    const scheduledDate = asOptionalText(req.body?.fecha, 10);
    const scheduledTime = asOptionalText(req.body?.hora, 8);
    const description = asOptionalText(req.body?.observaciones, 4000);
    if (!chargeId || !type || !scheduledDate || !scheduledTime) {
      return res.status(400).json({ message: "Cuenta, tipo, fecha y hora son requeridos" });
    }
    try {
      const activity = await insertActivity(pool, scope, asPositiveId(req.user?.id), {
        chargeId,
        kind: "seguimiento",
        state: "programado",
        title: `Seguimiento: ${type}`,
        description,
        scheduledDate,
        scheduledTime,
        metadata: { tipo: type },
      });
      res.status(201).json(activity);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "No se pudo programar el seguimiento" });
    }
  });

  app.post("/api/receivables/notes", authenticateToken, async (req: any, res) => {
    const scope = await requireProcess(req, res);
    if (!scope) return;
    const chargeId = asPositiveId(req.body?.charge_id);
    const title = asOptionalText(req.body?.titulo, 255);
    const description = asOptionalText(req.body?.contenido, 8000);
    const priority = asOptionalText(req.body?.prioridad, 20) ?? "normal";
    if (!chargeId || !title || !description || !ALLOWED_PRIORITIES.has(priority)) {
      return res.status(400).json({ message: "Cuenta, título, contenido y prioridad válida son requeridos" });
    }
    try {
      const activity = await insertActivity(pool, scope, asPositiveId(req.user?.id), {
        chargeId,
        kind: "nota",
        state: "registrado",
        title,
        description,
        priority,
      });
      res.status(201).json(activity);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "No se pudo guardar la nota" });
    }
  });

  app.post("/api/receivables/promises", authenticateToken, async (req: any, res) => {
    const scope = await requireProcess(req, res);
    if (!scope) return;
    const chargeId = asPositiveId(req.body?.charge_id);
    const dueDate = asOptionalText(req.body?.fecha, 10);
    const amountCentavos = Number(req.body?.monto_centavos);
    const description = asOptionalText(req.body?.observaciones, 4000);
    if (!chargeId || !dueDate || !Number.isSafeInteger(amountCentavos) || amountCentavos <= 0) {
      return res.status(400).json({ message: "Cuenta, fecha y monto válido son requeridos" });
    }
    try {
      const activity = await insertActivity(pool, scope, asPositiveId(req.user?.id), {
        chargeId,
        kind: "promesa",
        state: "prometido",
        title: "Promesa de pago",
        description,
        scheduledDate: dueDate,
        amountCentavos,
      });
      res.status(201).json(activity);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "No se pudo registrar la promesa" });
    }
  });

  app.post("/api/receivables/reminders", authenticateToken, async (req: any, res) => {
    const scope = await requireProcess(req, res);
    if (!scope) return;
    const channel = asOptionalText(req.body?.canal, 30);
    const rawIds: unknown[] = Array.isArray(req.body?.charge_ids) ? req.body.charge_ids : [];
    const chargeIds = rawIds.reduce<number[]>((ids, value) => {
      const id = asPositiveId(value);
      return id && !ids.includes(id) ? [...ids, id] : ids;
    }, []);
    if (!channel || !ALLOWED_CHANNELS.has(channel) || chargeIds.length === 0 || chargeIds.length > 100) {
      return res.status(400).json({ message: "Canal válido y entre 1 y 100 cuentas son requeridos" });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const activities = [];
      for (const chargeId of chargeIds) {
        activities.push(await insertActivity(client, scope, asPositiveId(req.user?.id), {
          chargeId,
          kind: "recordatorio",
          state: "programado",
          title: `Recordatorio por ${channel}`,
          channel,
        }));
      }
      await client.query("COMMIT");
      res.status(201).json({ activities, total: activities.length });
    } catch (error: any) {
      await client.query("ROLLBACK");
      res.status(400).json({ message: error.message || "No se pudieron registrar los recordatorios" });
    } finally {
      client.release();
    }
  });

  app.post("/api/receivables/escalations", authenticateToken, async (req: any, res) => {
    const scope = await requireProcess(req, res);
    if (!scope) return;
    const chargeId = asPositiveId(req.body?.charge_id);
    const reason = asOptionalText(req.body?.motivo, 100);
    const supervisor = asOptionalText(req.body?.supervisor, 255);
    const urgency = asOptionalText(req.body?.urgencia, 20) ?? "media";
    const description = asOptionalText(req.body?.detalles, 4000);
    if (!chargeId || !reason || !supervisor || !ALLOWED_URGENCIES.has(urgency)) {
      return res.status(400).json({ message: "Cuenta, motivo, supervisor y urgencia válida son requeridos" });
    }
    try {
      const activity = await insertActivity(pool, scope, asPositiveId(req.user?.id), {
        chargeId,
        kind: "escalacion",
        state: "escalado",
        title: `Caso escalado: ${reason}`,
        description,
        reason,
        supervisor,
        urgency,
      });
      res.status(201).json(activity);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "No se pudo escalar el caso" });
    }
  });

  app.post("/api/receivables/collections", authenticateToken, async (req: any, res) => {
    const scope = await requireProcess(req, res);
    if (!scope) return;
    const rawIds: unknown[] = Array.isArray(req.body?.charge_ids) ? req.body.charge_ids : [];
    const chargeIds = rawIds.reduce<number[]>((ids, value) => {
      const id = asPositiveId(value);
      return id && !ids.includes(id) ? [...ids, id] : ids;
    }, []);
    if (chargeIds.length === 0 || chargeIds.length > 100) {
      return res.status(400).json({ message: "Selecciona entre 1 y 100 cuentas" });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const activities = [];
      for (const chargeId of chargeIds) {
        activities.push(await insertActivity(client, scope, asPositiveId(req.user?.id), {
          chargeId,
          kind: "cobranza",
          state: "iniciado",
          title: "Proceso de cobranza iniciado",
        }));
      }
      await client.query("COMMIT");
      res.status(201).json({ activities, total: activities.length });
    } catch (error: any) {
      await client.query("ROLLBACK");
      res.status(400).json({ message: error.message || "No se pudo iniciar la cobranza" });
    } finally {
      client.release();
    }
  });
}