import { describe, expect, it } from "vitest";
import { canRefund, refundMethods, assertRefundAmount } from "../lib/credit-refund-policy";
import type { RefundPayment } from "../lib/refund-provider";

const now = Date.now();
const payment: RefundPayment = { id: "pi_isolated", amount: 100000, refunded: 0,
  created: now / 1000, destination: "acct_isolated", currency: "mxn", customerEmail: true, spei: true };
describe("política de devoluciones sin red", () => {
  it.each(["administrador_campus", "contador_general", "caja", "auxiliar_caja", "asistente", undefined])(
    "rechaza el rol %s", role => expect(canRefund(role)).toBe(false));
  it.each(["super_admin", "administrador_general"])("permite %s", role => expect(canRefund(role)).toBe(true));
  it("SPEI de 181 días sólo permite transferencia escolar", () => {
    expect(refundMethods("stripe_no_aplicado", { ...payment, created: now / 1000 - 181 * 86400 }, false, true, now))
      .toEqual(["transferencia_escuela"]);
  });
  it("tarjeta antigua no hereda los 180 días; su rechazo habilita la alternativa", () => {
    const card = { ...payment, spei: false, created: now / 1000 - 900 * 86400 };
    expect(refundMethods("stripe_no_aplicado", card, false, true, now)).toEqual(["stripe"]);
    expect(refundMethods("stripe_no_aplicado", card, true, false, now)).toEqual([]);
    expect(refundMethods("stripe_no_aplicado", card, true, true, now)).toEqual(["transferencia_escuela"]);
  });
  it("efectivo no usa Stripe y SPEI sin correo ofrece transferencia de la escuela", () => {
    expect(refundMethods("excedente_caja", null, false, true)).toEqual(["efectivo"]);
    expect(refundMethods("stripe_no_aplicado", { ...payment, customerEmail: false }, false, true)).toEqual(["transferencia_escuela"]);
  });
  it("limita el importe por ambos saldos, incluyendo parciales", () => {
    expect(() => assertRefundAmount(500, 1000, 1000)).not.toThrow();
    expect(() => assertRefundAmount(1001, 1000, 2000)).toThrow(/supera/);
    expect(() => assertRefundAmount(1001, 2000, 1000)).toThrow(/supera/);
  });
});
