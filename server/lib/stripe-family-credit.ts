import { pool } from "../db";
import { SCHOOL_TODAY_SQL } from "../../shared/school-date";
import { stripeReviewIntent } from "./stripe-review-exceptions";
import { creditAudit } from "./credit-audit";

export interface CreditScope { tenant_id: number; campus_id: number; id: number }
export class CreditError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function registerStripeFamilyCredit(scope: CreditScope, eventId: number, reason: string) {
  const client = await pool.connect();
  let result: { payment_id: number; credit_id: number; duplicate: boolean };
  let audit = false;
  let intentId = "";
  try {
    await client.query("BEGIN");
    // La UNIQUE(provider, provider_event_id) existente + el lock de ese evento
    // son la clave idempotente del servidor; no confiamos en una clave del cliente.
    const events = await client.query(
      "SELECT * FROM payment_events WHERE id=$1 AND tenant_id=$2 AND provider='stripe' FOR UPDATE",
      [eventId, scope.tenant_id]);
    const event = events.rows[0];
    const intent = event && stripeReviewIntent(event);
    if (!intent) throw new CreditError(404, "Cobro no encontrado");
    const charges = await client.query(
      `SELECT c.id, c.student_id FROM charges c JOIN students s ON s.id=c.student_id
       JOIN campuses ca ON ca.id=s.campus_id
       WHERE c.id=$1 AND c.tenant_id=$2 AND s.tenant_id=$2
         AND s.campus_id=$3 AND ca.tenant_id=$2 FOR SHARE OF c,s`,
      [intent.chargeId, scope.tenant_id, scope.campus_id]);
    if (!charges.rows.length) throw new CreditError(404, "Cobro no encontrado");
    intentId = intent.pi.id;
    if (event.status === "resolved_credit") {
      const prior = await client.query(
        `SELECT fc.id AS credit_id, fc.payment_id FROM family_credits fc
         JOIN payments p ON p.id=fc.payment_id
         WHERE p.tenant_id=$1 AND p.referencia_pasarela=$2
           AND fc.tenant_id=$1 AND fc.campus_id=$3 AND fc.origen='stripe_no_aplicado'
         ORDER BY fc.id LIMIT 1`, [scope.tenant_id, intentId, scope.campus_id]);
      if (!prior.rows.length) throw new Error("Resolución sin crédito");
      result = { ...prior.rows[0], duplicate: true };
    } else {
      if (event.status !== "requires_review") throw new CreditError(409, "El cobro ya fue resuelto de otra forma");
      const families = await client.query(
        `SELECT f.id FROM families f JOIN family_students fs ON fs.family_id=f.id
         WHERE fs.student_id=$1 AND f.tenant_id=$2 AND f.campus_id=$3
         ORDER BY f.id FOR SHARE OF f`,
        [charges.rows[0].student_id, scope.tenant_id, scope.campus_id]);
      if (families.rows.length !== 1) throw new CreditError(409, "Asigna primero una única familia al alumno");
      const prior = await client.query(
        "SELECT id FROM payments WHERE tenant_id=$1 AND referencia_pasarela=$2",
        [scope.tenant_id, intentId]);
      if (prior.rows.length) throw new CreditError(409, "El cobro ya tiene un pago registrado; requiere revisión");
      const payment = await client.query(
        `INSERT INTO payments (tenant_id,charge_id,metodo,referencia_pasarela,monto_centavos,fecha_pago,estado)
         VALUES ($1,NULL,'tarjeta',$2,$3,${SCHOOL_TODAY_SQL},'exitoso') RETURNING id`,
        [scope.tenant_id, intentId, intent.pi.amount_received]);
      const credit = await client.query(
        `INSERT INTO family_credits (tenant_id,campus_id,family_id,student_id,payment_id,amount_centavos,origen,status,descripcion)
         VALUES ($1,$2,$3,$4,$5,$6,'stripe_no_aplicado','activo',$7) RETURNING id`,
        [scope.tenant_id, scope.campus_id, families.rows[0].id, charges.rows[0].student_id,
          payment.rows[0].id, intent.pi.amount_received, reason]);
      await client.query("UPDATE payment_events SET status='resolved_credit',processed_at=NOW() WHERE id=$1", [eventId]);
      result = { payment_id: payment.rows[0].id, credit_id: credit.rows[0].id, duplicate: false };
      audit = true;
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
  if (audit) await creditAudit({
    tenant_id: scope.tenant_id, user_id: scope.id, action: "STRIPE_REVIEW_CREDIT",
    entity_type: "payment_event", entity_id: eventId,
    metadata: { ...result, justificacion: reason, campus_id: scope.campus_id, payment_intent_id: intentId },
    previous_value: { status: "requires_review" }, new_value: { status: "resolved_credit" },
  });
  return result;
}
