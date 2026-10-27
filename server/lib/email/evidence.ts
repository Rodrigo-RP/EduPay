import type { EmailEvidenceCounts } from "@shared/email-evidence";
import { emptyCounts, type EmailState } from "./types";

// EXISTS/lateral aggregation preserves one row per recipient, not per webhook.
// Only processed, authenticated events with all four correlation keys are facts.
export const emailEvidenceJoinSql = `
  LEFT JOIN LATERAL (
    SELECT MIN(e.occurred_at) FILTER (WHERE e.event_type='email.delivered') AS delivered_at,
      MIN(e.occurred_at) FILTER (WHERE e.event_type='email.bounced') AS bounced_at,
      MIN(e.occurred_at) FILTER (WHERE e.event_type='email.complained') AS complained_at,
      MIN(e.occurred_at) FILTER (WHERE e.event_type='email.suppressed') AS suppressed_at,
      MIN(e.occurred_at) FILTER (WHERE e.event_type='email.failed') AS failed_at,
      MIN(e.occurred_at) FILTER (WHERE e.event_type='email.delivery_delayed') AS delayed_at,
      COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT('id',e.provider_event_id,'type',e.event_type,
        'occurred_at',e.occurred_at,'bounce_type',e.details->>'bounceType',
        'bounce_sub_type',e.details->>'bounceSubType','failed_reason',e.details->>'failedReason')
        ORDER BY e.occurred_at,e.provider_event_id),'[]'::jsonb) AS provider_events
    FROM email_webhook_events e WHERE e.status='procesado' AND e.recipient_id=r.id
      AND e.tenant_id=r.tenant_id AND e.campus_id=r.campus_id
      AND e.provider_message_id=r.provider_message_id
  ) proof ON true`;

export const emailEvidenceCountsSql = `
 WITH facts AS (
   SELECT r.estado,proof.delivered_at,proof.bounced_at,proof.complained_at,
     proof.suppressed_at,proof.failed_at,proof.delayed_at,
     (r.provider_message_id IS NOT NULL AND length(r.provider_message_id)>0
      AND r.accepted_at IS NOT NULL AND r.enviado_en=r.accepted_at) AS accepted
   FROM email_notification_recipients r ${emailEvidenceJoinSql}
   WHERE r.tenant_id=$1 AND r.campus_id=$2 AND ($3::text IS NULL OR r.batch_id=$3)
 )
 SELECT estado,COUNT(*)::int AS n,
   COUNT(*) FILTER (WHERE accepted)::int AS evidence_aceptados,
   COUNT(*) FILTER (WHERE accepted AND delivered_at IS NOT NULL)::int AS evidence_entregados,
   COUNT(*) FILTER (WHERE accepted AND bounced_at IS NOT NULL)::int AS evidence_rebotados,
   COUNT(*) FILTER (WHERE accepted AND complained_at IS NOT NULL)::int AS evidence_quejas,
   COUNT(*) FILTER (WHERE accepted AND suppressed_at IS NOT NULL)::int AS evidence_suprimidos,
   COUNT(*) FILTER (WHERE accepted AND failed_at IS NOT NULL)::int AS evidence_fallidos,
   COUNT(*) FILTER (WHERE accepted AND delayed_at IS NOT NULL)::int AS evidence_demorados,
   COUNT(*) FILTER (WHERE accepted AND (bounced_at IS NOT NULL OR suppressed_at IS NOT NULL))::int AS state_rebotado
 FROM facts GROUP BY estado`;

export function countEmailEvidence(rows: any[]) {
  const evidence: EmailEvidenceCounts = {aceptados:0,entregados:0,rebotados:0,quejas:0,suprimidos:0,fallidos:0,demorados:0};
  const counts = Object.assign(emptyCounts(),{evidence});
  const evidenceKey = {aceptado:"aceptados",entregado:"entregados",rebotado:"rebotados",queja:"quejas"} as const;
  for (const row of rows) {
    if (!(row.estado in counts) || row.estado === "total" || row.estado === "evidence") continue;
    for (const key of Object.keys(evidence) as (keyof EmailEvidenceCounts)[])
      evidence[key] += Number(row[`evidence_${key}`] ?? 0);
    const state = row.estado as EmailState;
    counts[state] = state==="rebotado" ? Number(row.state_rebotado??0) : state in evidenceKey
      ? Number(row[`evidence_${evidenceKey[state as keyof typeof evidenceKey]}`] ?? 0) : Number(row.n);
    counts.total += Number(row.n);
  }
  return counts;
}
