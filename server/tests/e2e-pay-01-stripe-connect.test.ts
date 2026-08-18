/**
 * E2E-PAY-01 — Pago real end-to-end via Stripe Connect hacia JFR
 *
 * Verifica que:
 *   1. application_fee_amount=0 con transfer_data.destination es válido en Stripe
 *      (comportamiento: 100% del monto menos fees de Stripe va al campus — sin
 *      comisión de plataforma, por diseño permanente del modelo SaaS de Refereence).
 *   2. El PaymentIntent creado tiene transfer_data.destination = acct_1U5eFqE4HOJNFIv4.
 *   3. El endpoint /api/guardian/pagar registra via_stripe_connect=true en la respuesta.
 *   4. El pago queda registrado en la DB con referencia = pi_xxx de Stripe.
 *
 * Usa tarjeta de prueba 4242 (sin 3DS) en modo test.
 * Requiere: STRIPE_SECRET_KEY, campus_payment_config.charges_enabled=true para campus_id=1.
 *
 * ⚠️  Este test llama a la API de Stripe real (modo test) y al servidor HTTP en
 *     localhost:5000. No mockea Stripe — el propósito es verificar la integración real.
 */

import { describe, it, expect, afterAll } from "vitest";
import { pool } from "../db";
import Stripe from "stripe";
import jwt from "jsonwebtoken";

const JWT_SECRET  = process.env.JWT_SECRET ?? "fallback-secret-key";
const STRIPE_KEY  = process.env.STRIPE_SECRET_KEY!;
const SERVER_URL  = "http://localhost:5000";
const CAMPUS_ID   = 1;
const ACCOUNT_ID  = "acct_1U5eFqE4HOJNFIv4";

const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2025-05-28.basil" as any });

describe("E2E-PAY-01: pago Stripe Connect → JFR", () => {
  let paymentDbId: number | null    = null;
  let stripePaymentIntentId: string | null = null;
  let chargeIdUsed: number | null   = null;

  it("PaymentIntent tiene transfer_data.destination = acct_1U5eFqE4HOJNFIv4", async () => {
    // ── 1. Confirmar que campus_id=1 tiene charges_enabled ────────────────────
    const { rows: cpcRows } = await pool.query(
      `SELECT stripe_account_id, charges_enabled
         FROM campus_payment_config WHERE campus_id = $1`,
      [CAMPUS_ID]
    );
    expect(
      cpcRows[0]?.charges_enabled,
      "campus_payment_config no tiene charges_enabled=true para campus_id=1 — conectar Stripe primero",
    ).toBe(true);
    expect(cpcRows[0]?.stripe_account_id).toBe(ACCOUNT_ID);

    // ── 2+3. Un solo query: cualquier guardián con cargo pendiente en campus_id=1 ──
    // Más robusto que buscar el primer guardián y luego su cargo por separado —
    // si ese guardián tiene todos sus cargos pagados (por runs previos de suite),
    // este query sigue encontrando otro par guardián+cargo disponible.
    const { rows: pairRows } = await pool.query(
      `SELECT c.id        AS charge_id,
              c.monto_base_centavos,
              g.id        AS guardian_id,
              g.tenant_id AS tenant_id,
              g.campus_id AS campus_id
         FROM charges c
         JOIN students s        ON s.id = c.student_id AND s.campus_id = $1
         JOIN student_guardian sg ON sg.student_id = s.id
         JOIN guardians g       ON g.id = sg.guardian_id AND g.campus_id = $1
        WHERE c.estado != 'pagado'
          AND c.monto_base_centavos > 0
          AND g.password_hash IS NOT NULL
        LIMIT 1`,
      [CAMPUS_ID]
    );
    expect(
      pairRows.length,
      "No hay pares guardián+cargo pendiente en campus_id=1 — ejecutar seed primero",
    ).toBeGreaterThan(0);
    const pair = pairRows[0] as any;
    chargeIdUsed = pair.charge_id;

    // ── 4. JWT de guardián con campus_id (igual que login corregido) ──────────
    const guardianToken = jwt.sign(
      {
        type:      "guardian",
        id:        pair.guardian_id,
        tenant_id: pair.tenant_id,
        campus_id: pair.campus_id,
      },
      JWT_SECRET,
      { expiresIn: "5m" }
    );

    // ── 5. PaymentMethod de prueba (token predefinido de Stripe, sin raw card data) ──
    // Stripe no permite enviar números de tarjeta raw por API sin habilitación especial.
    // pm_card_visa es el token de prueba Visa estándar: always succeeds, no 3DS.
    // Ref: https://stripe.com/docs/testing#cards
    const PM_TEST_VISA = "pm_card_visa";
    console.log("[E2E-PAY-01] Usando PaymentMethod de prueba:", PM_TEST_VISA);

    // ── 6. Llamar al endpoint de pago del servidor en vivo ────────────────────
    const resp = await fetch(`${SERVER_URL}/api/guardian/pagar`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${guardianToken}`,
      },
      body: JSON.stringify({
        charge_ids:        [pair.charge_id],
        metodo_pago:       "tarjeta",
        payment_method_id: PM_TEST_VISA,
      }),
    });

    const body = await resp.json() as any;
    console.log("[E2E-PAY-01] Respuesta servidor:", JSON.stringify(body, null, 2));

    expect(
      resp.status,
      `Servidor devolvió ${resp.status}: ${JSON.stringify(body)}`,
    ).toBe(200);
    expect(body.success).toBe(true);

    const pago = body.payments?.[0];
    expect(pago?.via_stripe_connect, "via_stripe_connect debe ser true").toBe(true);
    expect(pago?.needs_liquidacion_manual, "no debe requerir liquidación manual").toBe(false);
    paymentDbId = pago?.payment_id ?? null;

    // ── 7. Obtener el PI ID desde la DB (referencia = pi_xxx) ─────────────────
    expect(paymentDbId, "payment_id no está en la respuesta").toBeTruthy();
    const { rows: pmRows } = await pool.query(
      `SELECT referencia_pasarela FROM payments WHERE id = $1`,
      [paymentDbId]
    );
    stripePaymentIntentId = pmRows[0]?.referencia_pasarela ?? null;
    expect(
      stripePaymentIntentId,
      "La DB no tiene referencia de Stripe para este pago",
    ).toBeTruthy();
    console.log("[E2E-PAY-01] PaymentIntent ID:", stripePaymentIntentId);

    // ── 8. Verificar en la API de Stripe que transfer_data.destination es correcto ──
    const pi = await stripe.paymentIntents.retrieve(stripePaymentIntentId!);
    console.log("[E2E-PAY-01] PaymentIntent de Stripe:", {
      id:                    pi.id,
      status:                pi.status,
      amount:                pi.amount,
      transfer_data:         pi.transfer_data,
      application_fee_amount: (pi as any).application_fee_amount,
    });

    // transfer_data.destination debe apuntar a la cuenta Express de JFR
    expect(
      (pi.transfer_data as any)?.destination,
      "transfer_data.destination no apunta a acct_1U5eFqE4HOJNFIv4",
    ).toBe(ACCOUNT_ID);

    // application_fee_amount=0 es el comportamiento correcto (modelo SaaS, sin comisión por txn)
    expect(
      (pi as any).application_fee_amount ?? 0,
      "application_fee_amount debe ser 0 (sin comisión de plataforma)",
    ).toBe(0);

    // El pago debe haber sido procesado exitosamente
    expect(
      pi.status,
      `PaymentIntent en estado inesperado: ${pi.status}`,
    ).toBe("succeeded");
  }, 60_000);

  afterAll(async () => {
    // El pago fue real en modo test — Stripe test charges no se revierten automáticamente
    // pero tampoco mueven dinero real. No hay limpieza necesaria en Stripe.
    // En la DB el cargo queda marcado como pagado (estado correcto para el test E2E).
    // Si se necesita restaurar el cargo para pruebas repetidas: correr el seed.
    console.log("[E2E-PAY-01] Test completado. Payment DB ID:", paymentDbId,
                "| Stripe PI:", stripePaymentIntentId,
                "| Cargo usado:", chargeIdUsed);
  });
});
