import type { Express } from "express";
import { pool } from "../db";
import { authenticateToken, hasPermissionForUser } from "./shared";
import { MODULES, ACTIONS } from "../../shared/permissions";
import { stripeReviewIntent } from "../lib/stripe-review-exceptions";

export function registerStripeReviewRoutes(app: Express) {
  app.post("/api/conciliacion/excepciones/stripe/:id/resolver", authenticateToken, async (req: any, res) => {
    const user = req.user;
    if (!user?.tenant_id || !user?.campus_id ||
        !hasPermissionForUser(user, MODULES.PAYMENTS, ACTIONS.PROCESS)) {
      return res.status(403).json({ message: "Sin permiso para resolver este cobro" });
    }
    const id = Number(req.params.id);
    const { accion, justificacion, confirmacion_inicial, confirmacion_final } = req.body;
    if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647 ||
        accion !== "resolved_manual" || typeof justificacion !== "string" ||
        !justificacion.trim() || justificacion.length > 2000 ||
        confirmacion_inicial !== true || confirmacion_final !== true) {
      return res.status(400).json({ message: "Escribe la justificación y confirma dos veces la resolución fuera del sistema" });
    }
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const rows = await client.query(
        `SELECT * FROM payment_events
          WHERE id=$1 AND tenant_id=$2 AND provider='stripe' FOR UPDATE`,
        [id, user.tenant_id]);
      const event = rows.rows[0];
      const intent = event && stripeReviewIntent(event);
      const scoped = intent && await client.query(
        `SELECT c.id FROM charges c JOIN students s ON s.id=c.student_id
          JOIN campuses ca ON ca.id=s.campus_id
          WHERE c.id=$1 AND c.tenant_id=$2 AND s.tenant_id=$2
            AND s.campus_id=$3 AND ca.tenant_id=$2 FOR SHARE OF c,s`,
        [intent.chargeId, user.tenant_id, user.campus_id]);
      if (!intent || !scoped?.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Cobro no encontrado en tu institución y campus" });
      }
      if (event.status === "resolved_manual") {
        await client.query("COMMIT");
        return res.json({ message: "El cobro ya estaba resuelto fuera del sistema", duplicate: true });
      }
      if (event.status !== "requires_review") {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "El cobro ya no está pendiente de revisión" });
      }
      await client.query(
        `UPDATE payment_events SET status='resolved_manual', processed_at=NOW()
          WHERE id=$1 AND status='requires_review'`, [id]);
      // Es una resolución administrativa, no la aplicación de un pago.
      // Auditoría y transición juntas: un error revierte ambas y un reintento
      // bajo el mismo lock nunca genera una segunda auditoría.
      await client.query(
        `INSERT INTO audit_log (tenant_id,user_id,action,entity_type,entity_id,metadata,previous_value,new_value)
         VALUES ($1,$2,'STRIPE_REVIEW_RESOLVED_MANUAL','payment_event',$3,$4,$5,$6)`,
        [user.tenant_id, user.id, id,
          JSON.stringify({ justificacion: justificacion.trim(), campus_id: user.campus_id,
            payment_intent_id: intent.pi.id, charge_id: intent.chargeId }),
          JSON.stringify({ status: "requires_review" }), JSON.stringify({ status: "resolved_manual" })]);
      await client.query("COMMIT");
      res.json({ message: "Cobro resuelto fuera del sistema. No se crearon pagos ni se modificaron cargos.", duplicate: false });
    } catch {
      if (client) await client.query("ROLLBACK").catch(() => {});
      res.status(500).json({ message: "No se pudo guardar la resolución. Inténtalo de nuevo." });
    } finally {
      client?.release();
    }
  });
}
