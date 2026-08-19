/**
 * Completa los pagos SPEI que Stripe confirmó mediante webhook.
 *
 * Un PaymentIntent bancario no es un pago confirmado cuando se crea: solo al
 * recibir `payment_intent.succeeded` se aplica el ledger. La relación
 * PaymentIntent ↔ cargos vive en `payments.referencia_pasarela`, con filas
 * inicialmente en estado `pendiente`.
 */
import { pool } from "../db";
import { enqueueAuditLog, type AuditLogPayload } from "../audit-retry";

export type SpeiSettlementResult =
  | { status: "processed"; paymentIds: number[] }
  | { status: "duplicate" | "not_pending" };

export async function settleStripeSpeiPaymentIntent(
  paymentIntentId: string,
  stripeEventId: string,
  rawPayload: string,
): Promise<SpeiSettlementResult> {
  const client = await pool.connect();
  const auditPayloads: AuditLogPayload[] = [];

  try {
    await client.query("BEGIN");

    // Las filas pendientes fueron creadas por POST /api/guardian/spei-intent.
    // Lock de payment primero; después locks de charges en id ascendente para
    // mantener el orden consistente y evitar deadlocks con pagos concurrentes.
    const pending = await client.query(
      `SELECT id, tenant_id, charge_id, guardian_id, monto_centavos
         FROM payments
        WHERE referencia_pasarela = $1
          AND metodo = 'spei'
          AND estado = 'pendiente'
        ORDER BY charge_id ASC, id ASC
        FOR UPDATE`,
      [paymentIntentId],
    );

    if (!pending.rows.length) {
      await client.query("ROLLBACK");
      return { status: "not_pending" };
    }

    const paymentRows = pending.rows as Array<{
      id: number;
      tenant_id: number;
      charge_id: number;
      guardian_id: number | null;
      monto_centavos: string | number;
    }>;
    const tenantId = Number(paymentRows[0].tenant_id);

    // Idempotencia en la MISMA transacción que el ledger: si Stripe reintenta
    // el evento, ningún segundo payment_application puede llegar a crearse.
    const eventInsert = await client.query(
      `INSERT INTO payment_events
         (tenant_id, provider, provider_event_id, payload, status)
       VALUES ($1, 'stripe', $2, $3, 'received')
       ON CONFLICT (provider, provider_event_id) DO NOTHING
       RETURNING id`,
      [tenantId, stripeEventId, rawPayload],
    );
    if (!eventInsert.rowCount) {
      await client.query("ROLLBACK");
      return { status: "duplicate" };
    }

    for (const payment of paymentRows) {
      if (Number(payment.tenant_id) !== tenantId) {
        throw new Error("PaymentIntent SPEI contiene pagos de tenants distintos");
      }

      const chargeResult = await client.query(
        `SELECT id, monto_base_centavos, recargo_aplicado_centavos, estado
           FROM charges
          WHERE id = $1 AND tenant_id = $2
          FOR UPDATE`,
        [payment.charge_id, tenantId],
      );
      if (!chargeResult.rows.length) {
        throw new Error(`Cargo ${payment.charge_id} no encontrado al liquidar SPEI`);
      }

      const charge = chargeResult.rows[0] as {
        id: number;
        monto_base_centavos: string | number;
        recargo_aplicado_centavos: string | number | null;
        estado: string;
      };
      if (["pagado", "cancelado"].includes(charge.estado)) {
        throw new Error(`Cargo ${charge.id} ya está ${charge.estado} al liquidar SPEI`);
      }

      const balanceResult = await client.query(
        `SELECT COALESCE(SUM(amount_centavos), 0)::bigint AS ya_pagado
           FROM payment_applications
          WHERE charge_id = $1`,
        [charge.id],
      );
      const saldoPendiente =
        Number(charge.monto_base_centavos) +
        Number(charge.recargo_aplicado_centavos || 0) -
        Number((balanceResult.rows[0] as { ya_pagado: string | number }).ya_pagado);
      const amount = Number(payment.monto_centavos);

      if (saldoPendiente !== amount || amount <= 0) {
        throw new Error(
          `Monto SPEI ${amount} no coincide con saldo pendiente ${saldoPendiente} del cargo ${charge.id}`,
        );
      }

      await client.query(
        `UPDATE payments
            SET estado = 'exitoso', fecha_pago = CURRENT_DATE, updated_at = NOW()
          WHERE id = $1`,
        [payment.id],
      );
      await client.query(
        `INSERT INTO payment_applications (payment_id, charge_id, amount_centavos, applied_at)
         VALUES ($1, $2, $3, NOW())`,
        [payment.id, charge.id, amount],
      );
      await client.query(
        `UPDATE charges
            SET estado = 'pagado', updated_at = NOW()
          WHERE id = $1`,
        [charge.id],
      );

      auditPayloads.push({
        tenant_id: tenantId,
        user_id: null,
        guardian_id: payment.guardian_id,
        action: "charge.status_changed",
        entity_type: "charge",
        entity_id: charge.id,
        previous_value: { estado: charge.estado },
        new_value: { estado: "pagado" },
        metadata: {
          flujo: "stripe_spei_webhook",
          payment_id: payment.id,
          monto_centavos: amount,
          stripe_payment_intent_id: paymentIntentId,
          stripe_event_id: stripeEventId,
        },
      });
    }

    await client.query(
      `UPDATE payment_events
          SET status = 'processed', processed_at = NOW()
        WHERE provider = 'stripe' AND provider_event_id = $1`,
      [stripeEventId],
    );
    await client.query("COMMIT");

    // Auditoría fuera de la transacción financiera (ADR-001).
    for (const payload of auditPayloads) {
      pool.query(
        `INSERT INTO audit_log
           (tenant_id, guardian_id, action, entity_type, entity_id, previous_value, new_value, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          payload.tenant_id,
          payload.guardian_id,
          payload.action,
          payload.entity_type,
          payload.entity_id,
          JSON.stringify(payload.previous_value),
          JSON.stringify(payload.new_value),
          JSON.stringify(payload.metadata),
        ],
      ).catch((error) => enqueueAuditLog(payload, error));
    }

    return { status: "processed", paymentIds: paymentRows.map((payment) => payment.id) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}