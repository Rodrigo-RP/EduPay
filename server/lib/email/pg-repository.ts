import { randomUUID } from "node:crypto";
import type { EmailDatabase, EmailRepository, Intent, Selection } from "./repository";
import { EmailError, type EmailScope } from "./types";
import { digest } from "./identity";
import { countEmailEvidence, emailEvidenceCountsSql, emailEvidenceJoinSql } from "./evidence";

export const scopedCandidateSql = `
  SELECT s.id, s.nombre_completo AS nombre,
         COALESCE(NULLIF(BTRIM(g.email),''), NULLIF(BTRIM(g.correo_institucional_familiar),'')) AS email,
         g.id AS "guardianId"
  FROM students s
  JOIN campuses ca ON ca.id = s.campus_id AND ca.tenant_id = $1
  LEFT JOIN student_guardian sg ON sg.student_id = s.id AND sg.es_responsable_pago = true
  LEFT JOIN guardians g ON g.id = sg.guardian_id AND g.campus_id = $2
       AND (g.tenant_id = $1 OR g.tenant_id IS NULL)
  WHERE s.campus_id = $2 AND (s.tenant_id = $1 OR s.tenant_id IS NULL)
    AND ($3::integer[] IS NULL OR s.id = ANY($3::integer[]))
    AND EXISTS (
      SELECT 1 FROM charges c WHERE c.student_id = s.id
        AND (c.tenant_id = $1 OR c.tenant_id IS NULL)
        AND c.estado IN ('pendiente','parcial')
        AND ($4::text = 'CARGO_EMITIDO'
          OR ($4::text = 'AVISO_MORA' AND c.fecha_vencimiento < CURRENT_DATE)
          OR ($4::text = 'RECORDATORIO_VENCIMIENTO' AND c.fecha_vencimiento BETWEEN CURRENT_DATE AND CURRENT_DATE + 3))
    )
  ORDER BY s.id, g.id LIMIT 5001`;

function mapIntent(r: any): Intent {
  return { id: r.id, tenantId: r.tenant_id, campusId: r.campus_id, requestedBy: r.requested_by,
    canonicalKey: r.canonical_key, selection: r.selection, snapshot: r.snapshot,
    content: r.content, configFingerprint: r.config_fingerprint, expiresAt: new Date(r.expires_at).toISOString() };
}

export class PgEmailRepository implements EmailRepository {
  constructor(private db: EmailDatabase) {}
  async assertScope(s: EmailScope) {
    const r = await this.db.query("SELECT id FROM campuses WHERE id=$1 AND tenant_id=$2", [s.campusId, s.tenantId]);
    if (!r.rows.length) throw new EmailError(403, "EMAIL_SCOPE_DENEGADO", "Campus no autorizado");
  }
  async candidates(s: EmailScope, q: Selection) {
    const r = await this.db.query(scopedCandidateSql,
      [s.tenantId, s.campusId, q.modo === "individual" ? q.estudiantesIds : null, q.tipo]);
    if (r.rows.length > 5000) throw new EmailError(422, "EMAIL_SELECCION_AMPLIA", "Divida la selección en grupos más pequeños");
    if (q.modo === "individual" && q.estudiantesIds.some(id => !r.rows.some(row => row.id === id)))
      throw new EmailError(403, "EMAIL_SELECCION_DENEGADA", "Selección no autorizada o sin cargos elegibles");
    return r.rows;
  }
  async prepare(i: Intent) {
    // Serialize refresh against confirmation. A changed, unconfirmed preview
    // rotates its ID so an older tab cannot confirm a snapshot it never saw.
    const c = await this.db.connect();
    try {
      await c.query("BEGIN");
      await c.query(`
      INSERT INTO email_notification_intents
      (id,tenant_id,campus_id,requested_by,canonical_key,selection,snapshot,content,config_fingerprint,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10)
      ON CONFLICT (tenant_id,campus_id,canonical_key) DO NOTHING`,
      [i.id,i.tenantId,i.campusId,i.requestedBy,i.canonicalKey,JSON.stringify(i.selection),
      JSON.stringify(i.snapshot),JSON.stringify(i.content),i.configFingerprint,i.expiresAt]);
      const r = await c.query(`SELECT * FROM email_notification_intents
        WHERE tenant_id=$1 AND campus_id=$2 AND canonical_key=$3 FOR UPDATE`,[i.tenantId,i.campusId,i.canonicalKey]);
      let intent=mapIntent(r.rows[0]);
      const batch=await c.query("SELECT id FROM email_notification_batches WHERE intent_id=$1 AND tenant_id=$2 AND campus_id=$3",[intent.id,i.tenantId,i.campusId]);
      if (!batch.rows.length) {
        const changed=digest(intent.snapshot)!==digest(i.snapshot) ||
          intent.configFingerprint!==i.configFingerprint;
        const updated=await c.query(`UPDATE email_notification_intents SET id=$1,snapshot=$2::jsonb,
          content=$3::jsonb,config_fingerprint=$4,expires_at=$5 WHERE id=$6 RETURNING *`,
          [changed?i.id:intent.id,JSON.stringify(i.snapshot),JSON.stringify(i.content),i.configFingerprint,i.expiresAt,intent.id]);
        intent=mapIntent(updated.rows[0]);
      }
      await c.query("COMMIT");
      return {intent,batchId:batch.rows[0]?.id??null};
    } catch(e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  }
  async intent(s: EmailScope, id: string) {
    const r = await this.db.query("SELECT * FROM email_notification_intents WHERE id=$1 AND tenant_id=$2 AND campus_id=$3",
      [id,s.tenantId,s.campusId]);
    return r.rows[0] ? mapIntent(r.rows[0]) : null;
  }
  async batchForIntent(s: EmailScope, id: string) {
    const r = await this.db.query("SELECT id FROM email_notification_batches WHERE intent_id=$1 AND tenant_id=$2 AND campus_id=$3", [id,s.tenantId,s.campusId]);
    return r.rows[0]?.id ?? null;
  }
  async confirm(s: EmailScope, i: Intent) {
    const c = await this.db.connect();
    try {
      await c.query("BEGIN");
      const locked=await c.query("SELECT id FROM email_notification_intents WHERE id=$1 AND tenant_id=$2 AND campus_id=$3 FOR UPDATE", [i.id,s.tenantId,s.campusId]);
      if (!locked.rows.length) throw new EmailError(409,"EMAIL_PREVIEW_CHANGED","La vista previa cambió; vuelva a revisarla");
      const existing = await c.query("SELECT id FROM email_notification_batches WHERE intent_id=$1 AND tenant_id=$2 AND campus_id=$3", [i.id,s.tenantId,s.campusId]);
      if (existing.rows.length) { await c.query("COMMIT"); return { batchId: existing.rows[0].id, reused:true }; }
      const batchId = randomUUID();
      await c.query(`INSERT INTO email_notification_batches (id,intent_id,tenant_id,campus_id,created_by) VALUES ($1,$2,$3,$4,$5)`,
        [batchId,i.id,s.tenantId,s.campusId,s.userId]);
      for (const [idx,r] of Array.from(i.snapshot.entries())) {
        const id = randomUUID();
        await c.query(`INSERT INTO email_notification_recipients
          (id,batch_id,tenant_id,campus_id,recipient_key,email,student_ids,guardian_ids,estado,motivo,provider_key)
          VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11)`,
          [id,batchId,s.tenantId,s.campusId,r.email ?? `omision:${idx}`,r.email,
            JSON.stringify(r.studentIds),JSON.stringify(r.guardianIds),r.estado,r.motivo,`edupay/${id}`]);
      }
      await c.query("COMMIT");
      return { batchId, reused:false };
    } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  }
  async counts(s: EmailScope, batchId: string | null) {
    const r = await this.db.query(emailEvidenceCountsSql,[s.tenantId,s.campusId,batchId]);
    return countEmailEvidence(r.rows);
  }
  async batch(s: EmailScope, id: string) {
    const b = await this.db.query("SELECT id,created_at FROM email_notification_batches WHERE id=$1 AND tenant_id=$2 AND campus_id=$3", [id,s.tenantId,s.campusId]);
    if (!b.rows[0]) return null;
    const r = await this.db.query(`SELECT r.id,r.email,r.estado,r.motivo,r.error_code,r.error_message,
      r.provider_message_id,r.accepted_at,r.enviado_en,proof.delivered_at,
      proof.bounced_at,proof.complained_at,proof.suppressed_at,proof.failed_at,proof.delayed_at,proof.provider_events
      FROM email_notification_recipients r ${emailEvidenceJoinSql}
      WHERE r.batch_id=$1 AND r.tenant_id=$2 AND r.campus_id=$3 ORDER BY r.created_at,r.id`,[id,s.tenantId,s.campusId]);
    const gate = await this.db.query("SELECT pause_reason FROM email_provider_gate WHERE provider='resend' AND next_allowed_at>NOW()");
    return { ...b.rows[0], counts:await this.counts(s,id), recipients:r.rows, notice:gate.rows[0]?.pause_reason ?? null, workerEnabled:false };
  }
  async history(s: EmailScope) {
    const r = await this.db.query("SELECT id,created_at FROM email_notification_batches WHERE tenant_id=$1 AND campus_id=$2 ORDER BY created_at DESC LIMIT 100", [s.tenantId,s.campusId]);
    return Promise.all(r.rows.map(async row => ({...row,counts:await this.counts(s,row.id),workerEnabled:false,notice:null})));
  }
  stats(s: EmailScope) { return this.counts(s,null); }
  async resolve(s: EmailScope, id: string) {
    const c = await this.db.connect();
    try {
      await c.query("BEGIN");
      const r = await c.query(`UPDATE email_notification_recipients SET estado='error',error_code='CIERRE_MANUAL_SIN_REENVIO',
        error_message='Cerrado tras revisión manual; no reenviar automáticamente',updated_at=NOW()
        WHERE id=$1 AND tenant_id=$2 AND campus_id=$3 AND estado='incierto' RETURNING id`,[id,s.tenantId,s.campusId]);
      if (r.rows.length) await c.query(`INSERT INTO email_notification_attempts
        (id,recipient_id,tenant_id,campus_id,outcome,code,actor_id) VALUES ($1,$2,$3,$4,'resuelto','CIERRE_MANUAL_SIN_REENVIO',$5)`,
        [randomUUID(),id,s.tenantId,s.campusId,s.userId]);
      await c.query("COMMIT");
      return r.rows.length > 0;
    } catch(e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  }
}
