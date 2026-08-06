---
name: Pago manual admin — diseño y coexistencia
description: Comparativa entre los endpoints de pago manual; por qué pagar-manual es genérico y qué le falta a caja/pago-efectivo.
---

## Regla

`POST /api/admin/charges/:chargeId/pagar-manual` es el único endpoint que cubre el caso **"admin marca un charge específico como pagado"**.
Funciona para CUALQUIER charge del sistema — no está acoplado a planes de pago.

## Endpoints de pago manual existentes

| Endpoint | Propósito | ¿Crea payment_applications? |
|---|---|---|
| `POST /api/caja/pago-efectivo` | Cajera al mostrador; auto-selecciona el charge más antiguo del alumno por `estudiante_id`, monto libre | **NO** — ledger incompleto |
| `POST /api/admin/charges/:chargeId/pagar-manual` | Admin marca un charge concreto; lee saldo real desde `payment_applications` | **SÍ** — transacción atómica |
| Bloque SPEI en conciliacion.ts | Auto-matching bancario | SÍ |

## Deuda técnica conocida

`/api/caja/pago-efectivo` **no escribe `payment_applications`**. Esto significa que para charges pagados por caja, `SELECT SUM(pa.amount_centavos) FROM payment_applications WHERE charge_id=?` devuelve 0 aunque el charge esté en estado `'pagado'`. Si en el futuro se usa ese SUM para calcular saldo pendiente real (como hace `pagar-manual`), el resultado será incorrecto.

**Why:** El endpoint de caja fue escrito antes de que existiera el ledger de `payment_applications`; usa la state machine (`updatePaymentStatus`/`updateChargeStatus`) que no pasa por ese ledger.

**How to apply:** La próxima tarea que refactorice el módulo de caja debe agregar el INSERT en `payment_applications` dentro de la misma transacción, o delegar en `pagar-manual` como helper interno.
