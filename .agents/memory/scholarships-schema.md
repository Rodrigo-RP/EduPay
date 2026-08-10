---
name: Scholarships real DB columns
description: Estado verificado de la tabla scholarships y scholarship_types en la DB real — columnas reales vs schema.ts, restricciones NOT NULL, comportamiento de XLSX con fechas.
---

## Estado verificado con evidencia directa de la DB (agosto 2026)

### Tabla `scholarships` — columnas reales

| column_name | data_type | is_nullable |
|---|---|---|
| id | integer | NO |
| student_id | integer | YES |
| porcentaje | numeric | NO |
| vigencia_inicio | date | NO |
| vigencia_fin | date | NO |
| motivo | character varying | YES |
| created_at | timestamp | YES |
| updated_at | timestamp | YES |
| tenant_id | integer | YES |
| scholarship_type_id | integer | YES |

### Tabla `scholarship_types` — EXISTE en la DB

Columnas: id, campus_id, nombre, categoria, descripcion, algoritmo, activo, created_at, updated_at.

La nota anterior que decía "no existe" era incorrecta — la tabla fue creada con una migración (tests STC-01 a STC-06).

---

## Drift real entre schema.ts y DB

`shared/schema.ts` define columnas que NO existen en la DB real:

| En schema.ts | En la DB real | Estado |
|---|---|---|
| `porcentaje_aplicado` (integer) | `porcentaje` (numeric) | Nombre distinto |
| `observaciones` (text) | `motivo` (varchar) | Nombre distinto |
| `estado` varchar | — | No existe en DB |
| `monto_fijo_aplicado_centavos` bigint | — | No existe en DB |
| `metodo_asignacion` varchar | — | No existe en DB |
| `score_evaluacion` numeric | — | No existe en DB |
| `created_by` integer | — | No existe en DB |

`scholarship_type_id` SÍ existe en ambos (schema.ts y DB). `scholarship_types` SÍ existe.

---

## Consecuencia del drift

Cualquier query Drizzle ORM que use el bloque `scholarships` de schema.ts genera SQL con nombres de columna incorrectos (`porcentaje_aplicado`, `observaciones`). Las rutas afectadas lo saben y tienen `.catch(()=>({rows:[]}))` para silenciar el error devolviendo `[]` sin aviso.

El fix en #131 (importación de becas) se escribió en SQL crudo usando los nombres reales. Esa es la workaround válida hasta que el schema.ts se sincronice.

---

## XLSX convierte fechas ISO a números seriales de Excel

Al parsear un CSV con `XLSX.read(csvData, { type: 'string' })`, XLSX auto-detecta cadenas como `"2026-08-01"` y las convierte a seriales de Excel (ej. `46235`). Nunca pasar directamente a PostgreSQL — usar el helper `parseXlsxDate`:

```ts
const parseXlsxDate = (val: any): string | null => {
  if (!val && val !== 0) return null;
  if (typeof val === 'number') {
    const jsDate = new Date((val - 25569) * 86400 * 1000);
    return jsDate.toISOString().split('T')[0];
  }
  if (val instanceof Date) return val.toISOString().split('T')[0];
  return String(val).trim();
};
```

## vigencia_fin y porcentaje son NOT NULL en la DB

Siempre proveer defaults si el CSV no los incluye. Para vigencia_fin: 1 año después de vigencia_inicio.

## Cómo filtrar becas correctamente en SQL crudo

```sql
SELECT sh.porcentaje, sh.vigencia_inicio, sh.vigencia_fin, sh.motivo
FROM scholarships sh
INNER JOIN students s ON sh.student_id = s.id
WHERE s.campus_id = $1
  AND sh.vigencia_inicio <= CURRENT_DATE
  AND sh.vigencia_fin >= CURRENT_DATE
```
