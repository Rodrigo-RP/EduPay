/** Un HTTP 2xx o un PaymentIntent creado no son una confirmación de pago. */
export function isConfirmedCardPaymentResponse(value: unknown): boolean {
  const result = value as { success?: unknown; payments?: unknown } | null;
  return result?.success === true && Array.isArray(result.payments) && result.payments.length > 0
    && result.payments.every((payment: { status?: unknown; payment_id?: unknown }) =>
      payment?.status === "succeeded" && Number.isSafeInteger(payment.payment_id) && Number(payment.payment_id) > 0);
}
