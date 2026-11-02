import { pool } from "../db";
import { enqueueAuditLog, type AuditLogPayload } from "../audit-retry";

/** ADR-001: sólo después de COMMIT. Un fallo se conserva en la cola durable. */
export async function creditAudit(payload: AuditLogPayload) {
  await pool.query(
    `INSERT INTO audit_log (tenant_id,user_id,action,entity_type,entity_id,metadata,previous_value,new_value)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [payload.tenant_id, payload.user_id, payload.action, payload.entity_type, payload.entity_id,
      JSON.stringify(payload.metadata), JSON.stringify(payload.previous_value ?? {}),
      JSON.stringify(payload.new_value ?? {})],
  ).catch(error => enqueueAuditLog(payload, error));
}
