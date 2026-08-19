---
name: Liquidación SPEI
description: Regla de consistencia para cobros SPEI por transferencia bancaria con Stripe Connect.
---

Un PaymentIntent de SPEI (`customer_balance` con transferencia bancaria MX) debe crear pagos en estado pendiente y no modificar el estado de los cargos. La acreditación ocurre únicamente al recibir `payment_intent.succeeded` autenticado por Stripe.

**Why:** La transferencia se confirma de forma asíncrona. Acreditar al crear el Intent permitiría saldos pagados sin que haya entrado dinero y duplicaría aplicaciones ante reintentos del webhook.

**How to apply:** El handler del webhook debe conservar la liquidación transaccional del ledger y usar el identificador del evento en `payment_events` para idempotencia. Los intents SPEI dirigen fondos al Connect del campus y mantienen `application_fee_amount` en cero.