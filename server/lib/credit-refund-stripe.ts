import { pool } from "../db";
import { creditAudit } from "./credit-audit";
import { completeRefundCredit, type RefundRow } from "./credit-refund-service";
import { stripeRefundProvider, type RefundProvider, type ProviderRefund } from "./refund-provider";
import { CreditError } from "./stripe-family-credit";

const RETRY_WINDOW_MS = 23 * 3600000; // Stripe puede purgar las claves después de 24 h.
function retrySafe(attempted: Date | null): boolean {
  return !attempted || Date.now() - new Date(attempted).getTime() < RETRY_WINDOW_MS;
}
function definiteRejection(error: unknown): boolean {
  // Sólo una negativa inequívoca de creación libera el crédito. Timeouts,
  // 409, 429 y 5xx conservan la reserva: podría haberse creado el reembolso.
  return error instanceof Error && "type" in error && error.type === "StripeInvalidRequestError" &&
    "statusCode" in error && (error.statusCode === 400 || error.statusCode === 404);
}
export async function dispatchRefund(id: number, provider = stripeRefundProvider()) {
  // Durable ANTES de la llamada externa, incluso si muere el proceso.
  await pool.query(
    "UPDATE credit_refunds SET attempted_at=COALESCE(attempted_at,NOW()) WHERE id=$1 AND status='pendiente'", [id]);
  const client = await pool.connect();
  let rejected: RefundRow | undefined;
  try {
    await client.query("BEGIN");
    const result = await client.query<RefundRow>("SELECT * FROM credit_refunds WHERE id=$1 FOR UPDATE", [id]);
    const row = result.rows[0];
    if (row?.status === "pendiente" && !row.stripe_refund_id) {
      if (!retrySafe(row.attempted_at)) {
        await client.query("UPDATE credit_refunds SET incident=$1 WHERE id=$2",
          ["Respuesta de Stripe no confirmada; requiere revisión antes de reintentar", id]);
      } else if (!row.payment_intent_id) throw new Error("Devolución sin pago Stripe");
      else {
        try {
          const response = await provider.create(row.payment_intent_id, Number(row.amount_centavos), id, row.idempotency_key);
          if (response.payment_intent !== row.payment_intent_id || response.amount !== Number(row.amount_centavos))
            throw new Error("Respuesta de Stripe no corresponde a la devolución");
          // Ni siquiera response.status=succeeded confirma la devolución.
          await client.query("UPDATE credit_refunds SET stripe_refund_id=$1,stripe_status=$2,incident=NULL WHERE id=$3",
            [response.id, response.status, id]);
        } catch (error) {
          if (definiteRejection(error)) {
            await client.query(
              "UPDATE credit_refunds SET status='rechazada',incident='Stripe no aceptó la devolución; puede registrarse transferencia de la escuela' WHERE id=$1", [id]);
            await client.query("UPDATE family_credits SET status='activo' WHERE id=$1", [row.credit_id]);
            rejected = row;
          } else {
            await client.query("UPDATE credit_refunds SET incident=$1 WHERE id=$2",
              ["No se confirmó la solicitud a Stripe. El crédito sigue reservado; reintenta sin crear otra devolución.", id]);
          }
        }
      }
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  if (rejected) await creditAudit({ tenant_id: rejected.tenant_id, user_id: rejected.created_by,
    action: "credit.refund_rejected", entity_type: "credit_refund", entity_id: id,
    metadata: { campus_id: rejected.campus_id }, new_value: { status: "rechazada" } });
}

/** Sólo se llama desde el receptor existente DESPUÉS de constructEvent.
 * No se guardan datos bancarios del padre: payload es el recibo mínimo permitido.
 */
export async function processRefundWebhook(event: {
  id: string; type: string; created: number; refund: ProviderRefund;
}, provider = stripeRefundProvider()) {
  if (!["refund.created", "refund.updated", "refund.failed"].includes(event.type)) return;
  const refund = event.refund;
  const refundId = Number(refund.metadata.edupay_credit_refund);
  if (!Number.isSafeInteger(refundId) || refundId <= 0) return; // Reembolso ajeno a EduPay.
  const client = await pool.connect();
  let changed: RefundRow | undefined;
  let returnRequired = false;
  try {
    await client.query("BEGIN");
    const result = await client.query<RefundRow>("SELECT * FROM credit_refunds WHERE id=$1 FOR UPDATE", [refundId]);
    const row = result.rows[0];
    if (!row || row.method !== "stripe" || row.status === "preparada" ||
        row.payment_intent_id !== refund.payment_intent ||
        Number(row.amount_centavos) !== refund.amount || refund.currency !== "mxn" ||
        (row.stripe_refund_id && row.stripe_refund_id !== refund.id)) {
      throw new Error("Webhook de devolución no corresponde al registro");
    }
    const receipt = await client.query(
      `INSERT INTO credit_refund_events (tenant_id,refund_id,provider_event_id,payload)
       VALUES ($1,$2,$3,$4) ON CONFLICT (provider_event_id) DO NOTHING RETURNING id`,
      [row.tenant_id, row.id, event.id, JSON.stringify(event)]);
    const terminal = ["exitosa", "fallida", "rechazada"].includes(row.status);
    const olderPending = row.status === "requiere_accion" && refund.status === "pending" &&
      event.created <= Number(row.last_event_created);
    if (receipt.rows.length && !terminal && !olderPending && event.created >= Number(row.last_event_created)) {
      const state = refund.status === "succeeded" ? "exitosa" :
        ["failed", "canceled"].includes(refund.status ?? "") ? "fallida" :
          refund.status === "requires_action" ? "requiere_accion" :
            refund.status === "pending" ? "pendiente" : null;
      if (!state) throw new Error("Estado de devolución Stripe desconocido");
      const returning = state === "fallida" && refund.transfer_reversal;
      const returnStatus = returning ?
        (refund.failure_balance_transaction ? "pendiente" : "esperando_fondos") : "no_necesario";
      const incident = state === "fallida" ? (returning ?
        "Fondos de la escuela pendientes de regresar" : "Stripe no pudo devolver el dinero; registra una transferencia de la escuela") :
        state === "requiere_accion" ? "Stripe requiere información del destinatario; revisa el reembolso en Stripe" : null;
      await client.query(
        `UPDATE credit_refunds SET status=$1,stripe_status=$2,stripe_refund_id=$3,last_event_created=$4,
          return_status=$5,incident=$6 WHERE id=$7`,
        [state, refund.status, refund.id, event.created, returnStatus, incident, row.id]);
      if (state === "exitosa") await completeRefundCredit(client, row);
      if (state === "fallida" && !returning)
        await client.query("UPDATE family_credits SET status='activo' WHERE id=$1", [row.credit_id]);
      if (state !== row.status) changed = { ...row, status: state };
      returnRequired = Boolean(returning);
    } else if (row.status === "fallida" && ["esperando_fondos", "pendiente", "fallido"].includes(row.return_status)) {
      // Un duplicado también recupera una transferencia interrumpida tras COMMIT.
      returnRequired = true;
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  if (changed) await creditAudit({ tenant_id: changed.tenant_id, user_id: changed.created_by,
    action: "credit.refund_webhook", entity_type: "credit_refund", entity_id: refundId,
    metadata: { provider_event_id: event.id, campus_id: changed.campus_id, stripe_refund_id: refund.id },
    new_value: { status: changed.status } });
  if (returnRequired) await returnSchoolFunds(refundId, provider);
}

export async function returnSchoolFunds(id: number, provider = stripeRefundProvider()) {
  const client = await pool.connect();
  let returned: RefundRow | undefined;
  try {
    await client.query("BEGIN");
    const result = await client.query<RefundRow>("SELECT * FROM credit_refunds WHERE id=$1 FOR UPDATE", [id]);
    const row = result.rows[0];
    if (!row || row.status !== "fallida" || ["completo", "no_necesario"].includes(row.return_status)) {
      await client.query("COMMIT"); return;
    }
    if (!row.stripe_refund_id || !row.destination) throw new Error("Retorno sin referencia Stripe");
    // Un evento failed no prueba por sí solo que los fondos ya estén disponibles.
    const current = await provider.retrieve(row.stripe_refund_id);
    if (!["failed", "canceled"].includes(current.status ?? "") ||
        current.payment_intent !== row.payment_intent_id || current.amount !== Number(row.amount_centavos) ||
        !current.transfer_reversal || !current.failure_balance_transaction) {
      await client.query("COMMIT"); return;
    }
    if (!retrySafe(row.return_attempted_at)) {
      await client.query("UPDATE credit_refunds SET incident=$1 WHERE id=$2",
        ["Fondos de la escuela pendientes de regresar: revisa la transferencia anterior en Stripe antes de otro intento", id]);
      await client.query("COMMIT"); return;
    }
    await client.query("UPDATE credit_refunds SET return_status='pendiente',return_attempted_at=COALESCE(return_attempted_at,NOW()) WHERE id=$1", [id]);
    await client.query("COMMIT");
    // Se deja constancia durable de intento antes de la llamada; segundo lock
    // serializa doble clic y reintentos del webhook sobre la misma clave.
    await client.query("BEGIN");
    const locked = await client.query<RefundRow>("SELECT * FROM credit_refunds WHERE id=$1 FOR UPDATE", [id]);
    if (!locked.rows[0].return_transfer_id) {
      try {
        const transfer = await provider.returnFunds(row.destination, Number(row.amount_centavos), row.id, row.return_key);
        await client.query(
          "UPDATE credit_refunds SET return_status='completo',return_transfer_id=$1,incident=$2 WHERE id=$3",
          [transfer, "Stripe no pudo devolver el dinero. Fondos devueltos a la escuela; registra una transferencia de la escuela.", id]);
        await client.query("UPDATE family_credits SET status='activo' WHERE id=$1", [row.credit_id]);
        returned = row;
      } catch {
        await client.query("UPDATE credit_refunds SET return_status='fallido',incident='Fondos de la escuela pendientes de regresar' WHERE id=$1", [id]);
      }
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  if (returned) await creditAudit({ tenant_id: returned.tenant_id, user_id: returned.created_by,
    action: "credit.refund_funds_returned", entity_type: "credit_refund", entity_id: id,
    metadata: { campus_id: returned.campus_id }, new_value: { return_status: "completo" } });
}

export async function retryRefund(scope: { tenant_id: number; campus_id: number }, id: number,
  provider: RefundProvider) {
  const result = await pool.query<RefundRow>(
    "SELECT * FROM credit_refunds WHERE id=$1 AND tenant_id=$2 AND campus_id=$3",
    [id, scope.tenant_id, scope.campus_id]);
  const row = result.rows[0];
  if (!row) throw new CreditError(404, "Devolución no encontrada");
  if (row.status === "fallida") await returnSchoolFunds(id, provider);
  else if (row.status === "pendiente" && !row.stripe_refund_id) await dispatchRefund(id, provider);
  return { message: "Revisión del intento terminada. Consulta el estado registrado." };
}
