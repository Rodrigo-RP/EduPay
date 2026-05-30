---
name: Payment flow endpoint
description: Endpoint para procesar pagos desde el portal de padres.
---

## Endpoint

`POST /api/guardian/pagar` — requiere JWT de tipo `guardian` en header Authorization.

**Body**: `{ charge_ids: number[], metodo_pago: string }`  
**Response**: `{ success: true, payments: [{charge_id, payment_id, cfdi}], message }`

**Why:** El portal-padres-3clics.tsx llama a este alias. Internamente crea un `payment` por cada charge_id, actualiza el estado a "pagado", e inserta una `invoice` con UUID CFDI simulado.

**How to apply:** El portal de padres SIEMPRE usa este endpoint. No usar `/api/payments/process` desde el frontend del tutor.
