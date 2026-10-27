import { pool } from "../db";
import { enqueueAuditLog, type AuditLogPayload } from "../audit-retry";

/** Datos obtenidos del SDK o de un webhook cuya firma ya fue validada. */
export interface StripePaymentIntentResult {
  id: string;
  status: string;
  amount?: number;
  amount_received?: number;
  currency?: string;
  metadata?: Record<string, string>;
  transfer_data?: { destination: string | { id: string } } | null;
  client_secret?: string | null;
}

export async function settleStripeCardPaymentIntent(
  pi: StripePaymentIntentResult,
  sourceId: string,
  rawPayload: string,
): Promise<{ status: "processed" | "duplicate" | "not_pending"; paymentIds: number[] }> {
  // Ninguna escritura ni apertura de transacción para estados no confirmados.
  if (pi.status !== "succeeded") return { status: "not_pending", paymentIds: [] };
  const meta = pi.metadata ?? {};
  const ids = [meta.tenant_id, meta.guardian_id, meta.campus_id, meta.charge_id].map(Number);
  const [tenant, guardian, campus, chargeId] = ids;
  const destination = typeof pi.transfer_data?.destination === "string"
    ? pi.transfer_data.destination : pi.transfer_data?.destination?.id;
  if (
    meta.edupay_payment_flow !== "guardian_card" ||
    ids.some(id => !Number.isSafeInteger(id) || id <= 0) ||
    !pi.id.startsWith("pi_") || pi.currency !== "mxn" ||
    !Number.isSafeInteger(pi.amount) || Number(pi.amount) <= 0 ||
    pi.amount_received !== pi.amount ||
    !meta.stripe_account_id || destination !== meta.stripe_account_id
  ) throw new Error("Confirmación Stripe incompleta o fuera de alcance");

  const client = await pool.connect();
  let audit: AuditLogPayload | undefined;
  let paymentId: number;
  try {
    await client.query("BEGIN");
    const locked = await client.query(
      `SELECT c.id, c.monto_base_centavos, c.recargo_aplicado_centavos, c.estado
         FROM charges c JOIN students s ON s.id = c.student_id
        WHERE c.id = $1 AND c.tenant_id = $2
          AND s.tenant_id = $2 AND s.campus_id = $4
          AND EXISTS (SELECT 1 FROM student_guardian sg
                       WHERE sg.student_id = s.id AND sg.guardian_id = $3)
        FOR UPDATE OF c`,
      [chargeId, tenant, guardian, campus],
    );
    if (!locked.rows.length) throw new Error("Cargo fuera del alcance confirmado");
    const receipt = await client.query(
      `SELECT id, tenant_id, status FROM payment_events
        WHERE provider = 'stripe' AND provider_event_id = $1`,
      [pi.id],
    );
    if (receipt.rows.length) {
      const paid = await client.query(
        `SELECT id FROM payments WHERE referencia_pasarela = $1 AND tenant_id = $2
          AND charge_id = $3 AND guardian_id = $4 AND metodo = 'tarjeta' AND estado = 'exitoso'`,
        [pi.id, tenant, chargeId, guardian],
      );
      if (Number(receipt.rows[0].tenant_id) !== tenant || receipt.rows[0].status !== "processed" || paid.rows.length !== 1)
        throw new Error("PaymentIntent ya registrado con otro alcance");
      await client.query("ROLLBACK");
      return { status: "duplicate", paymentIds: [Number(paid.rows[0].id)] };
    }
    const charge = locked.rows[0];
    if (["pagado", "cancelado"].includes(charge.estado)) throw new Error("Cargo cerrado antes de la confirmación Stripe");
    const applied = await client.query(
      `SELECT COALESCE(SUM(amount_centavos), 0)::bigint AS ya_pagado
         FROM payment_applications WHERE charge_id = $1`, [chargeId],
    );
    const balance = Number(charge.monto_base_centavos) + Number(charge.recargo_aplicado_centavos || 0)
      - Number(applied.rows[0].ya_pagado);
    if (balance !== pi.amount || balance <= 0) throw new Error("El saldo cambió antes de la confirmación Stripe");

    // La UNIQUE existente (provider, provider_event_id) recibe el ID del PI,
    // NO el evt_...: API inmediata y todos sus webhooks comparten esta clave.
    // No impone unicidad global a referencia_pasarela (SPEI puede tener varios cargos).
    const event = await client.query(
      `INSERT INTO payment_events (tenant_id, provider, provider_event_id, payload, status)
       VALUES ($1,'stripe',$2,$3,'received')
       ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id`,
      [tenant, pi.id, rawPayload],
    );
    if (!event.rowCount) throw new Error("PaymentIntent ya registrado concurrentemente");
    const pay = await client.query(
      `INSERT INTO payments (tenant_id, charge_id, guardian_id, metodo, referencia_pasarela,
                             monto_centavos, fecha_pago, estado)
       VALUES ($1,$2,$3,'tarjeta',$4,$5,CURRENT_DATE,'exitoso') RETURNING id`,
      [tenant, chargeId, guardian, pi.id, balance],
    );
    paymentId = Number(pay.rows[0].id);
    await client.query(
      `INSERT INTO payment_applications (payment_id, charge_id, amount_centavos, applied_at)
       VALUES ($1,$2,$3,NOW())`, [paymentId, chargeId, balance],
    );
    await client.query("UPDATE charges SET estado = 'pagado', updated_at = NOW() WHERE id = $1", [chargeId]);
    await client.query(
      `UPDATE payment_events SET status = 'processed', processed_at = NOW()
        WHERE provider = 'stripe' AND provider_event_id = $1`, [pi.id],
    );
    await client.query("COMMIT");
    audit = {
      tenant_id: tenant, user_id: null, guardian_id: guardian,
      action: "charge.status_changed", entity_type: "charge", entity_id: chargeId,
      previous_value: { estado: charge.estado }, new_value: { estado: "pagado" },
      metadata: { flujo: "stripe_card_confirmed", stripe_payment_intent_id: pi.id,
        stripe_event_id: sourceId, payment_id: paymentId, monto_centavos: balance },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  if (audit) {
    await pool.query(
      `INSERT INTO audit_log (tenant_id, guardian_id, action, entity_type, entity_id, previous_value, new_value, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [audit.tenant_id, audit.guardian_id, audit.action, audit.entity_type, audit.entity_id,
        JSON.stringify(audit.previous_value), JSON.stringify(audit.new_value), JSON.stringify(audit.metadata)],
    ).catch(error => enqueueAuditLog(audit!, error));
  }
  return { status: "processed", paymentIds: [paymentId!] };
}
