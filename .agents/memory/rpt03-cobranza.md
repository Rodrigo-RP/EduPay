---
name: RPT-03 Reporte de Cargos y Cobranza
description: Detalles del módulo de cobranza — query SQL, columnas, filtros, lección sobre permisos y payment_applications.
---

## Módulo

`server/routes/reportes-cobranza.ts` — `registerReportesCobranzaRoutes(app)`

- `GET /api/reportes/cobranza` (REPORTS.READ)
- `POST /api/reportes/cobranza/exportar` (REPORTS.EXPORT)

Reemplaza R5 — `GET /api/charges/export` retirado de `guardian.ts`.

## Schema crítico

- `payment_applications` tiene columnas: `payment_id, charge_id, amount_centavos, applied_at` (NO `monto_centavos`)
- `charges` NO tiene `campus_id` — siempre JOIN via `students`
- `beca_aplicada` se castea con `::numeric` en la query (puede ser texto en DB)

## Cálculo saldo_pendiente

```sql
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(pa.amount_centavos), 0) AS monto_pagado
  FROM payment_applications pa
  JOIN payments p ON p.id = pa.payment_id
  WHERE pa.charge_id = c.id AND p.estado = 'exitoso'
) pagado ON true
-- saldo_pendiente = GREATEST(0, total - pagado.monto_pagado)
```

## dias_vencido

```sql
CASE WHEN c.fecha_vencimiento < CURRENT_DATE
      AND c.estado NOT IN ('pagado', 'cancelado')
  THEN (CURRENT_DATE - c.fecha_vencimiento::date)::int
  ELSE 0 END
```

## Permisos — lección

`REPORTS.READ` está asignado a **todos** los roles admin incluyendo `asistente` y `auxiliar_contable`.
Solo `REPORTS.EXPORT` es restrictivo (excluye asistente y auxiliar_contable).
Tests de 403 en GET /reportes/* son incorrectos para cualquier rol admin.

**Why:** todos los roles necesitan ver reportes; exportar datos masivos sí requiere restricción.
