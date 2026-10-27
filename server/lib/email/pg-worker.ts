import { randomUUID } from "node:crypto";
import type { EmailDatabase } from "./repository";
import type { ClaimedEmail, EmailWorkerRepository, WorkerUpdate } from "./worker";
import { scopedCandidateSql } from "./pg-repository";

export const claimEmailSql=`
  SELECT r.*, i.content, i.config_fingerprint, i.selection
  FROM email_notification_recipients r
  JOIN email_notification_batches b ON b.id=r.batch_id AND b.tenant_id=r.tenant_id AND b.campus_id=r.campus_id
  JOIN email_notification_intents i ON i.id=b.intent_id AND i.tenant_id=b.tenant_id AND i.campus_id=b.campus_id
  JOIN campuses ca ON ca.id=r.campus_id AND ca.tenant_id=r.tenant_id
  WHERE r.estado='pendiente' AND r.next_attempt_at<=NOW()
  ORDER BY r.next_attempt_at,r.id FOR UPDATE OF r SKIP LOCKED LIMIT 1`;
export class PgEmailWorkerRepository implements EmailWorkerRepository {
  constructor(private db: EmailDatabase) {}
  async claim():Promise<ClaimedEmail|null> {
    const c=await this.db.connect();
    try {
      await c.query("BEGIN");
      // Single gate per provider team across workers, tenants and batches. A
      // conservative 1 request/sec (default team ceiling documented as 10/sec).
      await c.query("INSERT INTO email_provider_gate(provider) VALUES ('resend') ON CONFLICT DO NOTHING");
      const g=await c.query("SELECT next_allowed_at FROM email_provider_gate WHERE provider='resend' FOR UPDATE");
      await c.query(`WITH expired AS (
        UPDATE email_notification_recipients SET estado='incierto',error_code='RECLAMO_ABANDONADO',
        error_message='Revisar con el proveedor; no reenviar automáticamente',updated_at=NOW()
        WHERE estado='enviando' AND claimed_until<NOW()
        RETURNING id,claim_id,tenant_id,campus_id
      ) INSERT INTO email_notification_attempts (id,recipient_id,tenant_id,campus_id,outcome,code)
        SELECT claim_id || '/recovery',id,tenant_id,campus_id,'incierto','RECLAMO_ABANDONADO' FROM expired
        ON CONFLICT DO NOTHING`);
      const clock=await c.query("SELECT NOW() AS now");
      const now=new Date(clock.rows[0].now).getTime();
      if (new Date(g.rows[0].next_allowed_at).getTime()>now) {
        await c.query("COMMIT"); return null;
      }
      const r=await c.query(claimEmailSql);
      if (!r.rows.length) { await c.query("COMMIT"); return null; }
      const row=r.rows[0];
      if (row.first_attempt_at && now-new Date(row.first_attempt_at).getTime()>=23*60*60_000) {
        await c.query(`UPDATE email_notification_recipients SET estado='incierto',error_code='VENTANA_IDEMPOTENCIA_AGOTADA',
          error_message='Revisar con el proveedor; no reenviar automáticamente',updated_at=NOW() WHERE id=$1`,[row.id]);
        await c.query("COMMIT"); return null;
      }
      const claimId=randomUUID();
      await c.query(`UPDATE email_notification_recipients SET estado='enviando',claim_id=$2,
        claimed_until=NOW()+INTERVAL '2 minutes',attempts=attempts+1,
        first_attempt_at=COALESCE(first_attempt_at,NOW()),updated_at=NOW() WHERE id=$1`,[row.id,claimId]);
      await c.query(`INSERT INTO email_notification_attempts (id,recipient_id,tenant_id,campus_id,outcome)
        VALUES ($1,$2,$3,$4,'enviando')`,[claimId,row.id,row.tenant_id,row.campus_id]);
      await c.query(`UPDATE email_provider_gate SET next_allowed_at=NOW()+INTERVAL '1 second',pause_reason=NULL WHERE provider='resend'`);
      await c.query("COMMIT"); // Network runs after release, never inside transaction.
      return {id:row.id,claimId,tenantId:row.tenant_id,campusId:row.campus_id,to:row.email,providerKey:row.provider_key,
        content:row.content,configFingerprint:row.config_fingerprint,retries:row.retries,
        firstAttemptAt:row.first_attempt_at?new Date(row.first_attempt_at).getTime():now};
    } catch(e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  }
  async stillEligible(claim:ClaimedEmail) {
    const r=await this.db.query(`SELECT i.selection,r.student_ids,r.guardian_ids
      FROM email_notification_recipients r
      JOIN email_notification_batches b ON b.id=r.batch_id AND b.tenant_id=r.tenant_id AND b.campus_id=r.campus_id
      JOIN email_notification_intents i ON i.id=b.intent_id AND i.tenant_id=b.tenant_id AND i.campus_id=b.campus_id
      WHERE r.id=$1 AND r.tenant_id=$2 AND r.campus_id=$3 AND r.claim_id=$4 AND r.estado='enviando'`,
      [claim.id,claim.tenantId,claim.campusId,claim.claimId]);
    if (!r.rows.length) return false;
    const row=r.rows[0];
    const current=await this.db.query(scopedCandidateSql,[claim.tenantId,claim.campusId,row.student_ids,row.selection.tipo]);
    return row.student_ids.every((id:number)=>current.rows.some(c=>c.id===id &&
      c.email?.trim().toLowerCase()===claim.to && row.guardian_ids.includes(c.guardianId)));
  }
  async finish(claim:ClaimedEmail,u:WorkerUpdate) {
    const c=await this.db.connect();
    try {
      await c.query("BEGIN");
      // Same lock order as claim(): gate -> recipient, avoiding an inversion
      // against abandoned-lease recovery in another worker.
      await c.query("SELECT provider FROM email_provider_gate WHERE provider='resend' FOR UPDATE");
      const r=await c.query(`UPDATE email_notification_recipients
        SET estado=$5,provider_message_id=$6,accepted_at=$7,enviado_en=$7,retries=$8,
        next_attempt_at=COALESCE($9::timestamptz,next_attempt_at),error_code=$10,error_message=$11,motivo=$12,
        first_attempt_at=CASE WHEN $13::boolean THEN NULL ELSE first_attempt_at END,
        claimed_until=NULL,updated_at=NOW()
        WHERE id=$1 AND tenant_id=$2 AND campus_id=$3 AND claim_id=$4 AND estado IN ('enviando','incierto')
        RETURNING id`,[claim.id,claim.tenantId,claim.campusId,claim.claimId,u.estado,u.providerMessageId??null,
        u.acceptedAt?new Date(u.acceptedAt):null,u.retries,u.retryAt?new Date(u.retryAt):null,u.code,
        u.code?"Revise el estado y el código de la incidencia":null,u.motivo??null,u.clearFirstAttemptAt??false]);
      if (r.rows.length) await c.query(`INSERT INTO email_notification_attempts
        (id,recipient_id,tenant_id,campus_id,outcome,code) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
        [`${claim.claimId}/result`,claim.id,claim.tenantId,claim.campusId,u.estado,u.code]);
      if (u.pauseUntil) await c.query(`UPDATE email_provider_gate
        SET next_allowed_at=GREATEST(next_allowed_at,$1::timestamptz),
        pause_reason=COALESCE($2,pause_reason) WHERE provider='resend'`,
        [new Date(u.pauseUntil),u.pauseReason??null]);
      await c.query("COMMIT");
    } catch(e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  }
}
