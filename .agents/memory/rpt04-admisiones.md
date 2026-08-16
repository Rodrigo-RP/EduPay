---
name: RPT-04 Reporte de Admisiones y Becas
description: Módulo RPT-04 — reemplaza R6, guards, estructura de respuesta, y archivos de test migrados.
---

## Módulo

`server/routes/reportes-admisiones.ts` — `registerReportesAdmisionesRoutes(app)`

- `GET  /api/reportes/admisiones`          guard: ADMISSIONS.READ
- `POST /api/reportes/admisiones/exportar` guard: REPORTS.EXPORT

## Guard

- `ADMISSIONS.READ` — roles que lo tienen: administrador_campus, admisiones, asistente.
- `ADMISSIONS.READ` — roles que NO lo tienen: administrador_general, contador_general, auxiliar_contable.
- `REPORTS.EXPORT` — no lo tiene auxiliar_contable ni asistente.

## Respuesta GET

```json
{
  "resumen": {
    "total_alumnos": N,
    "alumnos_con_beca": N,
    "monto_descuento_centavos": N,
    "inscripciones": { "total": N, "monto_centavos": N, "ciclo": "2025-2026" }
  },
  "por_tipo_beca": [{ "tipo": "string|null", "categoria": "...", "cantidad": N, "porcentaje_promedio": N }],
  "alumnos": [{ "alumno_id", "alumno", "nivel", "grado", "grupo", "estado",
                "con_beca", "porcentaje_beca", "motivo_beca",
                "monto_descuento_centavos", "tutor", "tutor_email", "fecha_registro" }],
  "total": N,
  "filters": {}
}
```

## Filtros

| Parámetro    | Aplica sobre                              |
|---|---|
| ciclo        | EXISTS (charges.ciclo_escolar = ?) en students |
| nivel        | students.nivel_escolar                   |
| estado       | students.status                          |
| fecha_desde  | students.created_at::date >=             |
| fecha_hasta  | students.created_at::date <=             |

El índice del parámetro `ciclo` se reutiliza tanto en el EXISTS del WHERE como
en el LATERAL de descuento — PostgreSQL permite referenciar el mismo $N múltiples veces.

## Cálculo monto_descuento

- Por alumno: LATERAL sobre charges WHERE beca_aplicada::numeric > 0 (y ciclo si aplica).
- Resumen: SUM separado sobre charges JOIN students WHERE campus_id = $1.
- NO usa scholarships.porcentaje para el monto — usa charges.beca_aplicada (lo realmente aplicado).

## R6 retirado

`GET /api/admin/admissions-report` removido de `server/routes/admin.ts`.
Reemplazado por comentario de migración. Todos los tests que lo referenciaban migrados.

## Tests migrados

- `server/tests/admissions-guard.test.ts` — ADM-01..07 ahora apuntan a `/api/reportes/admisiones`.
  Body assertion cambiada de `body.becas + body.inscripciones` → `body.resumen + body.alumnos`.
- `server/tests/scholarship-types-cycle.test.ts` — STC-02, STC-03, STC-05 migrados.
  STC-05: `body?.becas?.por_tipo` → `body?.por_tipo_beca`.

## Frontend migrado

`client/src/pages/reportes-admisiones.tsx`:
- Eliminado `import * as XLSX from 'xlsx'` y exports client-side.
- Data source: `/api/admin/students` → `/api/reportes/admisiones`.
- Exports: XLSX.utils + window.print → POST `/api/reportes/admisiones/exportar`.
- Filtros server-side: ciclo, nivel, estado. Filtro beca (con/sin) client-side.
