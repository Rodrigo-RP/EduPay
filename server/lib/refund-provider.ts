import Stripe from "stripe";

export interface RefundPayment {
  id: string; amount: number; refunded: number; created: number;
  destination: string | null; currency: string; customerEmail: boolean;
  spei: boolean;
}
export interface ProviderRefund {
  id: string; amount: number; payment_intent: string | null; status: string | null;
  currency: string; metadata: Record<string, string>;
  transfer_reversal: string | null; failure_balance_transaction: string | null;
}
export interface RefundProvider {
  payment(id: string): Promise<RefundPayment>;
  create(payment: string, amount: number, refundId: number, key: string): Promise<ProviderRefund>;
  retrieve(id: string): Promise<ProviderRefund>;
  returnFunds(destination: string, amount: number, refundId: number, key: string): Promise<string>;
}
const objectId = (value: string | { id: string } | null | undefined): string | null =>
  typeof value === "string" ? value : value?.id ?? null;
export function refundSnapshot(refund: Stripe.Refund): ProviderRefund {
  return {
    id: refund.id, amount: refund.amount, currency: refund.currency, status: refund.status,
    payment_intent: objectId(refund.payment_intent),
    metadata: { edupay_credit_refund: refund.metadata?.edupay_credit_refund ?? "" },
    transfer_reversal: objectId(refund.transfer_reversal),
    failure_balance_transaction: objectId(refund.failure_balance_transaction),
  };
}
/** Frontera única, sustituida por un proveedor sin red en las pruebas.
 * Mantiene el SDK y la cuenta de plataforma existentes; no guarda cuentas bancarias.
 */
export function stripeRefundProvider(): RefundProvider {
  let instance: Stripe | undefined;
  const sdk = () => {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("Proveedor de devoluciones no configurado");
    return instance ??= new Stripe(key);
  };
  return {
    async payment(id) {
      const pi = await sdk().paymentIntents.retrieve(id, { expand: ["latest_charge", "customer"] });
      const charge = pi.latest_charge;
      if (!charge || typeof charge === "string" || pi.status !== "succeeded")
        throw new Error("El pago no tiene un cobro confirmado");
      const customer = pi.customer;
      return { id: pi.id, amount: pi.amount_received, refunded: charge.amount_refunded,
        created: charge.created, destination: objectId(pi.transfer_data?.destination ?? null),
        currency: pi.currency, customerEmail: Boolean(charge.billing_details.email ||
          (customer && typeof customer !== "string" && !customer.deleted && customer.email)),
        spei: charge.payment_method_details?.type === "customer_balance" };
    },
    async create(payment, amount, refundId, idempotencyKey) {
      return refundSnapshot(await sdk().refunds.create({
        payment_intent: payment, amount, reverse_transfer: true,
        metadata: { edupay_credit_refund: String(refundId) },
      }, { idempotencyKey }));
    },
    async retrieve(id) { return refundSnapshot(await sdk().refunds.retrieve(id)); },
    async returnFunds(destination, amount, refundId, idempotencyKey) {
      const transfer = await sdk().transfers.create({
        destination, amount, currency: "mxn", metadata: { edupay_credit_refund: String(refundId) },
      }, { idempotencyKey });
      return transfer.id;
    },
  };
}
