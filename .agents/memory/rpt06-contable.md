---
name: RPT-06 Reporte Contable / Fiscal
description: Módulo RPT-06 — reemplaza R9 de fiscal.ts, corrige bug de filtro periodo ignorado, guards FISCAL.READ y REPORTS.EXPORT.
---

## Bug histórico corregido (R9)

`GET /api/fiscal/reportes-contables` recibía `?periodo=YYYY-MM` pero el SQL
nunca aplicaba ese filtro. La query siempre devolvía `LIMIT 12` meses sin
restricción de período. CON-07 reproduce esto empíricamente.

## Módulo RPT-06

`server/routes/reportes-contable.ts` — `registerReportesContableRoutes(app)`

- `GET  /api/reportes/contable`          guard: FISCAL.READ
- `POST /api/reportes/contable/exportar` guard: REPORTS.EXPORT

## Filtros soportados

| Parámetro | Aplica sobre |
|---|---|
| ciclo   | charges.ciclo_escolar = $ciclo |
| periodo | DATE_TRUNC('month', p.created_at) = DATE_TRUNC('month', $N::date) |

Sin `periodo` → `LIMIT 12` (últimos 12 meses).
Con `periodo` → sin LIMIT (devuelve sólo el mes solicitado).

## Guards

- **FISCAL.READ** (GET): super_admin, administrador_general, administrador_campus, contador_general, auxiliar_contable
  - Bloqueados: asistente, admisiones
- **REPORTS.EXPORT** (POST): administrador_general, administrador_campus, contador_general, admisiones, super_admin
  - Bloqueado: **auxiliar_contable** tiene FISCAL.READ pero NO REPORTS.EXPORT

## R9 retirado

`/api/fiscal/reportes-contables` eliminado de `server/routes/fiscal.ts`.
- `fiscal-guard.test.ts` FSC-06 y FSC-21 migrados a `/api/reportes/contable`.
- Frontend `fiscal-contable.tsx`: queryKey actualizado a URL con `?periodo=`.

## Fixture de test

payments con `created_at` fijo en INSERT (no UPDATE posterior):
```sql
INSERT INTO payments (..., created_at) VALUES (..., '2025-06-15'::timestamp)
```
Columnas reales de charges: `(tenant_id, student_id, concept_id, ciclo_escolar, fecha_emision, fecha_vencimiento, monto_base_centavos, beca_aplicada, recargo_aplicado_centavos, estado)` — sin `metodo_pago_esperado` ni `frecuencia`.
