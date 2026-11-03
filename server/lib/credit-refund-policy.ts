import { CreditError } from "./stripe-family-credit";
import type { RefundPayment } from "./refund-provider";

export type RefundMethod = "stripe" | "efectivo" | "transferencia_escuela";
export interface RefundScope { id: number; tenant_id: number; campus_id: number; role?: string }
export function canRefund(role: string | undefined): boolean {
  return role === "administrador_general" || role === "super_admin";
}
/** 180 días es exclusivamente SPEI. No hay plazo numérico de tarjetas
 * documentado por Stripe: un rechazo definitivo habilita la alternativa escolar.
 */
export function refundMethods(origin: string, payment: RefundPayment | null,
  previousFailure: boolean, fundsReturned: boolean, now = Date.now()): RefundMethod[] {
  if (!fundsReturned) return [];
  if (origin === "excedente_caja") return ["efectivo"];
  if (!payment || payment.currency !== "mxn" || !payment.destination) return [];
  if (previousFailure || (payment.spei && (
    now - payment.created * 1000 > 180 * 86400000 || !payment.customerEmail
  ))) return ["transferencia_escuela"];
  return ["stripe"];
}
export function assertRefundAmount(amount: number, available: number, paymentRemaining: number) {
  if (amount > available || amount > paymentRemaining) {
    throw new CreditError(400, "El monto supera el saldo a favor disponible o el remanente del pago original");
  }
}
