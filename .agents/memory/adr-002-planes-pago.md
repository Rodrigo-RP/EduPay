---
name: ADR-002 planes de pago integrados al ledger
description: Detalles de implementación del ADR-002 — planes de pago como charges reales con plan_id FK.
---

# ADR-002 — Planes de Pago integrados al ledger

## Regla
Los planes de pago generan `charges` reales con `concept.tipo='cuota_plan'` y `charges.plan_id` FK nullable a `payment_plans`. La tabla `payment_plan_installments` ya no se usa para cuotas activas.

## Modo A (reestructuración)
- Body: `charge_ids[]` (sin concept_id)
- Saldo pendiente = `monto_base_centavos - COALESCE(SUM(payment_applications.amount_centavos), 0)` por cargo
- Cargos originales → `estado='cancelado'` en la misma transacción
- `payment_plans.tipo_origen = 'reestructuracion'`, `charge_ids_origen = JSON(charge_ids)`

## Modo B (futuro)
- Body: `concept_id` (sin charge_ids); `concept.tipo` no puede ser `'cuota_plan'`
- `payment_plans.tipo_origen = 'futuro'`

## Cancelación (PATCH /api/planes-pago/:id/cancelar)
- Para reestructuración: `destino_saldo_pendiente: 'reinstalar' | 'condonar'` obligatorio
  - 'reinstalar' → nuevo charge con saldo=SUM(pending cuotas), plan_id=NULL
  - 'condonar' → requiere `motivo_condonacion` ≥10 chars, audit_log con `monto_condonado_centavos`
- Para futuro: sin destino_saldo_pendiente
- `payment_plans` NO tiene columna `updated_at` — no incluirla en UPDATE

## Decisión de interfaz para reestructuraciones
Las dos salidas de cancelación —reinstalar y condonar— viven en el mismo diálogo de Planes de Pago. Sólo una condonación repetida dentro de 90 días requiere el flujo de override; reinstalar nunca solicita ese token.

**Why:** Ambas opciones resuelven el mismo cierre de una reestructuración, pero únicamente la condonación elimina saldo y requiere control reforzado.

**How to apply:** Mostrar el diálogo únicamente para planes activos de reestructuración. Ante `409 requiere_override`, los roles administrador_general y super_admin pueden pedir el token con motivo; los demás sólo ven el bloqueo y a quién solicitar autorización.

## Helpers en server/routes/misc.ts
- `getOrCreateCuotaPlanConcept(campusId, tenantId)` — concepto sentinel, idempotente
- `generarCuotaCharges(client, opts)` — genera N charges dentro de BEGIN/COMMIT

**Why:** La tabla payment_plan_installments era paralela al ledger; integrar al ledger garantiza coherencia contable y permite pagar cuotas por los mismos endpoints de pago existentes.

**How to apply:** Siempre leer `charges WHERE plan_id = pp.id` para cuotas de un plan, nunca `payment_plan_installments`.
