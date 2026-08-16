---
name: NIT Narrative Insights — Panel Consejo Directivo
description: Reglas de umbral NI-01…NI-05, gotchas de implementación y test, invariante de consistencia NI-03/RPT-08.
---

## Reglas implementadas (server/lib/narrative-insights.ts)

- NI-01: concentración >60%/75% del adeudo pendiente por nivel (query directa, no usa por_nivel del response que excluye charges sin pagos)
- NI-02: >30%/50% de la cartera con >90 días vencidos
- NI-03: ≥5/10 alumnos en semáforo rojo — usa EXACTA misma SQL que fetchRiesgoData + computeRiesgoScore() row-by-row
- NI-04: caída ≥10/15 pp tasa_cobro vs mes anterior (tasa_cobro_anterior calculada en fetchConsejoData y pasada como param)
- NI-05: ≥3/5 familias con adeudo >500k¢ Y dias_vencido >60

## Invariante NIT-07 (RSG-14-like)

NI-03.dato_numerico debe coincidir con resumen.rojo.count_alumnos de GET /api/reportes/riesgo.
**Why:** misma SQL de fetchRiesgoData (sin filtros) + misma computeRiesgoScore().
Campo correcto en resumen: **count_alumnos** (no count ni count_rojo).

## prevMonthRange

Función auxiliar en reportes-consejo.ts: Date.UTC(year, month, 0) = último día del mes anterior.
fecha_desde="2026-08-01" → start="2026-07-01", end="2026-07-31".

## Refactor fetchConsejoData

- Reemplazó: ingresos_mes_anterior: Math.round(ingresos * 0.92) → real query
- Reemplazó: mora_anterior: Math.max(0, 100-tasaCobro+3) → real computation
- Devuelve tasa_cobro_anterior (interno); el GET handler la extrae con destructuring antes de res.json()

## Test gotcha: Neon tipos inconsistentes

INSERT INTO payments VALUES ($1,$2,'...',$3,'exitoso',$3::date) → error "inconsistent types deduced for parameter $3".
**Fix:** usar índice separado para fecha_pago y created_at aunque el valor sea el mismo: ($3, $4::date) con params [..., prevMid, prevMid].
