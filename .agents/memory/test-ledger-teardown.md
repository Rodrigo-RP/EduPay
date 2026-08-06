---
name: Teardown de ledger en transacción única
description: Patrón para afterAll de tests que borran payment_applications/payments/charges, y helper markChargeAsPaidForTest
---

**Regla:** todo `afterAll` que borre filas del ledger (payment_applications → invoices → payments → charges) debe ejecutarlas dentro de UNA transacción (`client.query BEGIN…COMMIT`, ROLLBACK+rethrow en catch, release en finally).

**Why:** DELETEs sueltos + proceso interrumpido a mitad dejan charges 'pagado' sin payment_application — falsos positivos permanentes en la consulta de salud `charges WHERE estado='pagado' AND NOT EXISTS payment_applications`. Así se generaron 14 huérfanos históricos (tenants de test "Concurrency Test" que quedaron vivos en la DB).

**How to apply:**
- Nunca poner un charge en 'pagado' vía INSERT/UPDATE directo en fixtures; usar `markChargeAsPaidForTest(pool, chargeId, montoCentavos, tenantId)` de `server/tests/test-helpers.ts` (crea payment + payment_application + UPDATE en una transacción).
- OJO: `payment_applications` NO tiene columna tenant_id (solo payment_id, charge_id, amount_centavos, applied_at).
- Tests que verifican "no se creó PA" sobre un charge pagado con el helper deben comparar contra el conteo previo (1), no contra 0.

**Rate limit en suite:** /api/admin tiene rate limit 50 req/5min (security-middleware.ts). Correr la suite Vitest varias veces seguidas produce 429 y fallos falsos — esperar ~5 min entre corridas repetidas.
