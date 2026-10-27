---
name: Payment flow endpoint
description: Endpoint para procesar pagos desde el portal de padres.
---

## Endpoint

`POST /api/guardian/pagar` — requiere JWT de tipo `guardian` en header Authorization.

**Body**: `{ charge_ids: number[], metodo_pago: string }`  
**Response**: `{ success: true, payments: [{charge_id, payment_id, cfdi}], message }`

**Why:** La nota histórica de este alias describe la creación de pagos y de una `invoice` con UUID CFDI simulado. Ese CFDI simulado **NO es timbrado real** y no debe presentarse como tal; un UUID generado localmente no acredita emisión fiscal ni aceptación de un PAC.

**How to apply:** Verificar el contrato vigente del endpoint antes de usarlo. No presentar una factura como timbrada sin confirmación y evidencia del proveedor real; sin proveedor, informar la falta de configuración, nunca sustituirla por un éxito simulado. La confirmación del pago y el timbrado fiscal son hechos distintos, conforme a la skill §5.
