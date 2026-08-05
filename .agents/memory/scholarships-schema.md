---
name: Scholarships real DB columns
description: La tabla scholarships en la DB tiene columnas distintas al schema TypeScript; scholarship_types no existe en la DB.
---

## Columnas reales de la tabla `scholarships` (verificado agosto 2026)

| Columna | Tipo |
|---|---|
| id | integer |
| student_id | integer |
| porcentaje | numeric |
| vigencia_inicio | date |
| vigencia_fin | date |
| motivo | varchar |
| tenant_id | integer |
| created_at | timestamp |
| updated_at | timestamp |

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

## Cómo filtrar becas correctamente
```sql
SELECT s.nombre_completo, sh.porcentaje, sh.vigencia_inicio, sh.vigencia_fin, sh.motivo
FROM scholarships sh
INNER JOIN students s ON sh.student_id = s.id
WHERE s.campus_id = $1
  AND sh.vigencia_inicio <= CURRENT_DATE
  AND (sh.vigencia_fin IS NULL OR sh.vigencia_fin >= CURRENT_DATE)
```

## Por qué
El schema TypeScript fue refactorizado (columnas renombradas, tablas nuevas) pero `db:push`
no fue ejecutado para sincronizar. Las rutas de la app usan `.catch()` masivamente para
enmascarar estos errores. El asistente usa queries sin catch y los expone claramente.
