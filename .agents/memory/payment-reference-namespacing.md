---
name: Payment reference namespacing
description: Scope idempotency uniqueness to manual payment references without blocking multi-charge settlement.
---

Las referencias de idempotencia de captura manual deben persistirse con el prefijo `manual:` y ser las únicas cubiertas por el índice único por tenant. Las referencias de pasarela y SPEI no deben usar esa garantía global.

**Why:** Un mismo pago o transferencia puede aplicarse correctamente a varios cargos, por lo que varias filas de `payments` pueden compartir la referencia de pasarela. Un índice único para todas las referencias bloquea esa liquidación legítima.

**How to apply:** Al crear o buscar un pago manual, normalizar la clave a `manual:<idempotency_key>` y conservar compatibilidad de lectura con claves manuales anteriores. Mantener el índice parcial limitado a ese namespace; no reutilizarlo para referencias de Stripe o SPEI.