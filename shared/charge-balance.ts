/** Contrato monetario compartido por cobros y créditos. Ningún monto flotante. */
export interface ChargeBalanceInput {
  monto_base_centavos: number | string;
  beca_aplicada?: number | string | null;
  recargo_aplicado_centavos?: number | string | null;
  ya_pagado?: number | string;
  estado?: string | null;
}

export function chargeBalance(charge: ChargeBalanceInput) {
  const base = Number(charge.monto_base_centavos);
  const surcharge = Number(charge.recargo_aplicado_centavos ?? 0);
  const applied = Number(charge.ya_pagado ?? 0);
  const percentage = String(charge.beca_aplicada ?? 0);
  if (![base, surcharge, applied].every(n => Number.isSafeInteger(n) && n >= 0) ||
      !/^\d+(?:\.\d{1,2})?$/.test(percentage)) {
    throw new Error("Importes del cargo inválidos");
  }
  const [whole, decimals = ""] = percentage.split(".");
  const basisPoints = BigInt(whole) * BigInt(100) + BigInt(decimals.padEnd(2, "0"));
  if (basisPoints > BigInt(10000)) throw new Error("Beca del cargo inválida");
  // ROUND de PostgreSQL para cantidades no negativas, sin error binario del .5.
  const discounted = Number((BigInt(base) * (BigInt(10000) - basisPoints) + BigInt(5000)) / BigInt(10000));
  const total = ["cancelado", "reestructurado"].includes(charge.estado ?? "") ? 0 : discounted + surcharge;
  if (!Number.isSafeInteger(total)) throw new Error("Importe del cargo fuera de rango");
  return { total_centavos: total, aplicado_centavos: applied,
    pendiente_centavos: Math.max(0, total - applied) };
}
