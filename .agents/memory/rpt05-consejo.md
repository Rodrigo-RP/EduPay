---
name: RPT-05 Reporte Consejo Directivo
description: Módulo RPT-05 — reemplaza R7/R8 de misc.ts, guards, filtros, respuesta backward-compat, tests migrados.
---

## Módulo

`server/routes/reportes-consejo.ts` — `registerReportesConsejoRoutes(app)`

- `GET  /api/reportes/consejo`          guard: FINANCIAL.READ — campus del JWT
- `POST /api/reportes/consejo/exportar` guard: REPORTS.EXPORT

## Guard FINANCIAL.READ

- **Con permiso:** administrador_campus, contador_general, administrador_general
- **Sin permiso:** asistente, admisiones, auxiliar_contable

## Filtros

| Parámetro    | Aplica sobre                              |
|---|---|
| ciclo        | charges.ciclo_escolar (ingresos, facturado, por_nivel) |
| fecha_desde  | payments.created_at::date >= (ingresos) / charges.created_at::date >= (facturado) |
| fecha_hasta  | ídem, límite superior |

Sin filtros → query sin restricción de período.

## Respuesta GET (backward-compatible con R7/R8)

```json
{
  "kpis": {
    "ingresos_mes": N, "ingresos_mes_anterior": N, "total_facturado": N,
    "pendiente": N, "vencido": N, "tasa_cobro": N, "meta_cobro": 85,
    "mora": N, "mora_anterior": N, "estudiantes_activos": N,
    "nuevos_ingresos": 0, "cfdi_emitidos": 0,
    "becas_aplicadas": N, "convenios_activos": N, "ciclo_escolar": "..."
  },
  "top_deudores": [{ "estudiante", "nombre_familia", "adeudo_centavos", "dias_vencido", "semaforo" }],
  "por_nivel":    [{ "nivel", "cobrado", "total" }],
  "tendencias":   [],
  "filters":      { "ciclo": "...", "fecha_desde": "...", "fecha_hasta": "..." }
}
```

`top_deudores` NO usa filtro de período — muestra estado actual de cargos pendientes.
`por_nivel` SÍ aplica el mismo filtro de ingresos (pagos en el período).

## R7 y R8 retirados

- R7 (`/api/reportes/consejo/:campusId`, misc.ts:705) — nunca consumido por frontend; solo tests.
- R8 (`/api/reportes/consejo` alias, misc.ts:789) — era consumido por frontend.
- `consejo-role-guard.test.ts` CON-01..08 migrados a ruta canónica.
- `consejo-alias-guard.test.ts` ya apuntaba a canónico — sin cambios.

## Frontend migrado

`client/src/pages/reporte-consejo.tsx`:
- `mes` es 0-indexed → `monthNum = Number(mes) + 1` para construir `fecha_desde`/`fecha_hasta`.
- queryKey usa URL con params: `/api/reportes/consejo?fecha_desde=...&fecha_hasta=...`
- `window.print()` reemplazado por `exportar(excel|pdf)` → POST `/api/reportes/consejo/exportar`.

## Notas SQL

- `becas_aplicadas` se calcula con JOIN a students (no campus_id directo en scholarships) — bug legacy corregido en fix #135, mantenido.
- `ciclo_escolar` en kpis responde `p.ciclo ?? "2025-2026"`.
