---
name: RPT-07 Antigüedad de Saldos
description: Módulo RPT-07 — 6 buckets por días vencido, filtros ciclo/nivel/concepto, REPORTS.READ/EXPORT, sin filtro de fecha.
---

## Módulo

`server/routes/reportes-antiguedad-saldos.ts` — `registerReportesAntiguedadSaldosRoutes(app)`

- `GET  /api/reportes/antiguedad-saldos`          guard: REPORTS.READ
- `POST /api/reportes/antiguedad-saldos/exportar` guard: REPORTS.EXPORT

## Buckets (ambos extremos inclusivos)

| Key          | Rango                  |
|---|---|
| al_corriente | dias_vencido = 0       |
| 1_30         | 1 ≤ d ≤ 30            |
| 31_60        | 31 ≤ d ≤ 60           |
| 61_90        | 61 ≤ d ≤ 90           |
| 91_120       | 91 ≤ d ≤ 120          |
| mas_120      | d > 120 (≥ 121)       |

Frontera: d=30 → 1_30; d=31 → 31_60.

## Cálculo

```sql
dias_vencido = GREATEST(0, CURRENT_DATE - c.fecha_vencimiento::date)
```

Solo cargos `estado NOT IN ('pagado', 'cancelado')`.
Saldo = total neto − LATERAL SUM(payment_applications.amount_centavos) donde payment.estado='exitoso'.

## Filtros

| Param    | Columna                |
|---|---|
| ciclo    | charges.ciclo_escolar  |
| nivel    | students.nivel_escolar |
| concepto | charges.concept_id     |

Sin filtro de fecha — los buckets reflejan estado actual de cartera, no rango histórico.

## Respuesta GET

```json
{
  "buckets": [{ "key", "label", "count_cargos", "count_alumnos", "monto_centavos", "porcentaje" }],
  "total_cartera_centavos": N,
  "detalle": [{ "charge_id", "student_id", "alumno", "nivel", "ciclo", "concepto", "fecha_vencimiento", "dias_vencido", "saldo_centavos", "bucket" }],
  "filters": { "ciclo", "nivel", "concepto" }
}
```

Porcentajes redondeados a 2 decimales; la suma puede desviar ±0.1 por redondeo (test lo acepta con 99.9–100.1).

## Fixture de test — gotcha

Usar JS para calcular `fecha_emision` (30 días antes del vencimiento). NO usar `$4::date - INTERVAL '30 days'` cuando `$4` ya se usa como string (ciclo) — Neon lanza "inconsistent types deduced for parameter".
