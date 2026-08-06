---
name: Payment atomicity pattern
description: Patrón canónico para endpoints de cobro — previene doble cobro concurrente y mantiene el ledger (payment_applications) consistente.
---

## Regla

Todo endpoint que marque un charge como pagado debe seguir este patrón dentro de una sola transacción de DB:

```
BEGIN (pool.connect() + client.query("BEGIN"))
  SELECT id, monto_base_centavos, recargo_aplicado_centavos, estado
    FROM charges WHERE id=$1 AND tenant_id=$2 FOR UPDATE
  → si estado IN ('pagado','cancelado') → ROLLBACK, return 409
  SELECT COALESCE(SUM(pa.amount_centavos),0) FROM payment_applications WHERE charge_id=$1
  saldo = monto_base + recargo - ya_pagado
  → si saldo <= 0 → ROLLBACK, return 409
  INSERT INTO payments (..., estado='exitoso') RETURNING id
  INSERT INTO payment_applications (payment_id, charge_id, amount_centavos, applied_at)
  UPDATE charges SET estado='pagado' WHERE id=$1   -- o 'parcial' para caja con pago parcial
COMMIT
-- Audit fuera de la txn (ADR-001):
pool.query("INSERT INTO audit_log ...").catch(() => {})
```

**Why:** El lock `FOR UPDATE` serializa requests concurrentes. Sin él, dos requests simultáneos crean dos payments (`exitoso`) para el mismo charge — el doble cobro real. La tabla `payment_applications` es el ledger; sin INSERT ahí, `getFamilyBalance` y `estado-cuenta` muestran saldo incorrecto.

**How to apply:**
- Aplica a: `POST /api/guardian/pagar`, `POST /api/payments/process`, `POST /api/caja/pago-efectivo`
- NO usar `storage.updateChargeStatus()` para endpoints de pago — esa función tiene `SELECT FOR UPDATE` pero no escribe `payment_applications`
- La excepción `if (from === to) return;` en `state-machines.ts:101` es la causa de que pagado→pagado silenciosamente pase: el FOR UPDATE serializa, pero si la transición se considera identidad, el segundo request también completa
- Referencia de implementación correcta: ver también `caja/ejecutar-conciliacion` (conciliacion.ts:250-297) y `POST /api/admin/charges/:id/pagar-manual`

## Diferencia caja vs guardian

`caja/pago-efectivo` soporta **pagos parciales** — el operador introduce el monto libremente:
- `montoAplicado = Math.min(montoOperador, saldoPendiente)` — cap al saldo real
- `newEstado = montoAplicado >= saldoPendiente ? 'pagado' : 'parcial'`
- Acepta `charge_id` opcional en el body para targeting explícito (si no, auto-selecciona el más antiguo)

`guardian/pagar` y `payments/process` siempre pagan el saldo completo — no hay parcialidad.
