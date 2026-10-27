import { createHash, randomUUID } from "node:crypto";
import type { EmailDatabase } from "./repository";
import {
  isEmailEventType, WEBHOOK_MAX_BODY_BYTES, WEBHOOK_RAW_MAX_BYTES, WEBHOOK_RAW_MAX_ROWS,
  WEBHOOK_RAW_TTL_HOURS, type EmailEventClaim, type EmailWebhookRepository, type VerifiedEmailEvent,
} from "./webhook-types";
import { stateAfterEmailEvent } from "./webhook-worker";

export const claimWebhookSql = `
  UPDATE email_webhook_events SET status='procesando',claim_id=$1,
    claimed_until=NOW()+INTERVAL '1 minute',attempts=LEAST(attempts+1,2147483647)
  WHERE provider_event_id=(
    SELECT provider_event_id FROM email_webhook_events
    WHERE (status IN ('pendiente','sin_correlacion') AND next_attempt_at<=NOW())
       OR (status='procesando' AND claimed_until<=NOW())
    ORDER BY next_attempt_at,provider_event_id FOR UPDATE SKIP LOCKED LIMIT 1
  ) RETURNING *`;

// No scope from payload/tags. A global provider ID must match exactly one row,
// with a consistent batch AND campus, otherwise the event cannot change mail.
export const correlateEmailSql = `
  SELECT r.*, (b.id IS NOT NULL AND ca.id IS NOT NULL) AS scope_valid
  FROM email_notification_recipients r
  LEFT JOIN email_notification_batches b ON b.id=r.batch_id
    AND b.tenant_id=r.tenant_id AND b.campus_id=r.campus_id
  LEFT JOIN campuses ca ON ca.id=r.campus_id AND ca.tenant_id=r.tenant_id
  WHERE r.provider_message_id=$1 ORDER BY r.id FOR UPDATE OF r`;

export class PgEmailWebhookRepository implements EmailWebhookRepository {
  constructor(private database: EmailDatabase) {}
  async saveRaw(payload: Buffer): Promise<string> {
    if (payload.length > WEBHOOK_MAX_BODY_BYTES) throw new Error("WEBHOOK_BODY_LIMIT");
    const c = await this.database.connect();
    try {
      await c.query("BEGIN");
      // Serialize capacity accounting across processes, including retention cleanup.
      await c.query("SELECT pg_advisory_xact_lock(18437, 9201)");
      await c.query(`DELETE FROM email_webhook_receipts WHERE id IN (
        SELECT id FROM email_webhook_receipts WHERE expires_at<=NOW() ORDER BY expires_at LIMIT 2000)`);
      const usage = await c.query(`SELECT COUNT(*)::int AS rows, COALESCE(SUM(payload_size),0)::bigint AS bytes
        FROM email_webhook_receipts`);
      if (Number(usage.rows[0].rows) >= WEBHOOK_RAW_MAX_ROWS ||
          Number(usage.rows[0].bytes) + payload.length > WEBHOOK_RAW_MAX_BYTES)
        throw new Error("WEBHOOK_QUARANTINE_FULL");
      const id = randomUUID();
      await c.query(`INSERT INTO email_webhook_receipts(id,payload_base64,payload_size,payload_hash,expires_at)
        VALUES($1,$2,$3,$4,NOW()+$5::integer*INTERVAL '1 hour')`,
      [id,payload.toString("base64"),payload.length,createHash("sha256").update(payload).digest("hex"),WEBHOOK_RAW_TTL_HOURS]);
      await c.query("COMMIT");
      return id;
    } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  }
  async enqueue(event: VerifiedEmailEvent): Promise<void> {
    // This is the first use of the trusted ID; invalid signatures never reach it.
    // Autocommit must complete before HTTP 200, including for duplicate receipts.
    await this.database.query(`INSERT INTO email_webhook_events
      (provider_event_id,event_type,provider_message_id,occurred_at,receipt_id,payload_hash)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(provider_event_id) DO NOTHING`,
    [event.eventId,event.eventType,event.messageId,event.occurredAt,event.receiptId,event.payloadHash]);
  }
  async pruneRaw(): Promise<void> {
    await this.database.query(`DELETE FROM email_webhook_receipts WHERE id IN (
      SELECT id FROM email_webhook_receipts WHERE expires_at<=NOW() ORDER BY expires_at LIMIT 2000)`);
  }
  async claim(): Promise<EmailEventClaim | null> {
    const claimId = randomUUID();
    const r = await this.database.query(claimWebhookSql,[claimId]);
    const e = r.rows[0];
    return e ? {eventId:e.provider_event_id,eventType:e.event_type,messageId:e.provider_message_id,
      occurredAt:e.occurred_at ? new Date(e.occurred_at).toISOString() : null,
      receiptId:e.receipt_id,payloadHash:e.payload_hash,claimId} : null;
  }
  async process(claim: EmailEventClaim): Promise<void> {
    const c = await this.database.connect();
    try {
      await c.query("BEGIN");
      const owned = await c.query(`SELECT * FROM email_webhook_events
        WHERE provider_event_id=$1 AND claim_id=$2 AND status='procesando' AND claimed_until>NOW() FOR UPDATE`,
      [claim.eventId,claim.claimId]);
      if (!owned.rows.length) { await c.query("COMMIT"); return; }
      // Re-read persisted facts, not caller-supplied claim fields.
      const e = owned.rows[0];
      let status = "revision", code: string | null = "EVENTO_INCOMPLETO";
      let recipient: any = null;
      if (!isEmailEventType(e.event_type)) { status = "ignorado"; code = "EVENTO_NO_SOPORTADO"; }
      else if (e.provider_message_id && e.occurred_at) {
        const matches = await c.query(correlateEmailSql,[e.provider_message_id]);
        if (!matches.rows.length) { status = "sin_correlacion"; code = "ESPERANDO_ACEPTACION"; }
        else if (matches.rows.length !== 1) { code = "CORRELACION_AMBIGUA"; }
        else {
          const r = matches.rows[0];
          if (!r.scope_valid || !(r.tenant_id > 0 && r.campus_id > 0)) code = "ALCANCE_INCONSISTENTE";
          else if (!r.accepted_at || !r.enviado_en ||
              new Date(r.accepted_at).getTime() !== new Date(r.enviado_en).getTime() ||
              !["aceptado","entregado","rebotado","queja"].includes(r.estado)) {
            status = "sin_correlacion"; code = "ESPERANDO_ACEPTACION";
          } else {
            recipient = r;
            await c.query(`UPDATE email_notification_recipients SET estado=$4,updated_at=NOW()
              WHERE id=$1 AND tenant_id=$2 AND campus_id=$3 AND provider_message_id=$5`,
            [r.id,r.tenant_id,r.campus_id,stateAfterEmailEvent(r.estado,e.event_type),e.provider_message_id]);
            status = "procesado"; code = null;
          }
        }
      }
      await c.query(`UPDATE email_webhook_events SET status=$3,error_code=$4,
        recipient_id=$5,tenant_id=$6,campus_id=$7,claim_id=NULL,claimed_until=NULL,
        processed_at=CASE WHEN $3::text='sin_correlacion' THEN NULL ELSE NOW() END,
        next_attempt_at=NOW()+INTERVAL '1 minute'
        WHERE provider_event_id=$1 AND claim_id=$2`,
      [e.provider_event_id,claim.claimId,status,code,recipient?.id??null,recipient?.tenant_id??null,recipient?.campus_id??null]);
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  }
}
