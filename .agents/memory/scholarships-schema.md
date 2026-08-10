---
name: Scholarships real DB columns
description: La tabla scholarships en la DB tiene columnas distintas al schema TypeScript; scholarship_types no existe en la DB. vigencia_fin es NOT NULL. Fechas del CSV llegan como seriales de Excel vía XLSX.
---

## Columnas reales de la tabla `scholarships` (verificado agosto 2026)

| Columna | Tipo | NOT NULL |
|---|---|---|
| id | integer | sí |
| student_id | integer | no (FK students) |
| porcentaje | numeric | no |
| vigencia_inicio | date | **sí** |
| vigencia_fin | date | **sí** — la DB tiene NOT NULL aunque schema.ts no lo marca |
| motivo | varchar | no |
| tenant_id | integer | no |
| created_at | timestamp | sí (default) |
| updated_at | timestamp | sí (default) |

## Columnas que NO existen (a pesar de estar en schema.ts)
- `porcentaje_aplicado` → el campo real es `porcentaje`
- `monto_fijo_aplicado_centavos` → no existe
- `estado` → no existe
- `observaciones` → el campo real es `motivo`
- `scholarship_type_id` → no existe
- `campus_id` → no existe (filtrar siempre vía JOIN con students)
- `activo` → no existe (filtrar por vigencia_inicio/vigencia_fin)

## La tabla `scholarship_types` NO existe en la DB
El schema TypeScript la define, pero nunca fue creada con db:push. Las rutas del servidor
(admin.ts) que la usan tienen `.catch(() => ({ rows: [] }))` y retornan silenciosamente `[]`.

## XLSX convierte fechas ISO a números seriales de Excel
Al parsear un CSV con `XLSX.read(csvData, { type: 'string' })`, XLSX auto-detecta cadenas
como `"2026-08-01"` y las convierte a seriales de Excel (ej. `46235`). Nunca pasar
directamente a PostgreSQL — usar el helper `parseXlsxDate`:

```ts
const parseXlsxDate = (val: any): string | null => {
  if (!val && val !== 0) return null;
  if (typeof val === 'number') {
    // Serial de Excel: días desde 1899-12-30 (epoch de Excel)
    const jsDate = new Date((val - 25569) * 86400 * 1000);
    return jsDate.toISOString().split('T')[0];
  }
  if (val instanceof Date) return val.toISOString().split('T')[0];
  return String(val).trim();
};
```

**Why:** XLSX.js versión ≥ 0.18 auto-convierte valores que parecen fechas en el CSV.
El número `25569` es el serial de Excel correspondiente a `1970-01-01` (epoch Unix).

## vigencia_fin NOT NULL — siempre proveer un default
Si el usuario no incluye `vigencia_fin` en el CSV, calcular 1 año después de `vigencia_inicio`:

```ts
const vigenciaFin = parseXlsxDate(raw.vigencia_fin) || (() => {
  const d = new Date(vigenciaInicio);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0];
})();
```

## Cómo filtrar becas correctamente
```sql
SELECT s.nombre_completo, sh.porcentaje, sh.vigencia_inicio, sh.vigencia_fin, sh.motivo
FROM scholarships sh
INNER JOIN students s ON sh.student_id = s.id
WHERE s.campus_id = $1
  AND sh.vigencia_inicio <= CURRENT_DATE
  AND sh.vigencia_fin >= CURRENT_DATE
```

## Por qué
El schema TypeScript fue refactorizado (columnas renombradas, tablas nuevas) pero `db:push`
no fue ejecutado para sincronizar. Las rutas de la app usan `.catch()` masivamente para
enmascarar estos errores. El asistente usa queries sin catch y los expone claramente.
