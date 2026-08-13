---
name: Charges schema columns
description: Qué columnas tiene realmente la tabla charges en la DB vs. el schema Drizzle. Crítico antes de escribir SQL crudo sobre charges.
---

## Columnas confirmadas en DB (agosto 2026)

`id, tenant_id, student_id, concept_id, ciclo_escolar, fecha_emision, fecha_vencimiento, monto_base_centavos, beca_aplicada, recargo_aplicado_centavos, estado, plan_id, created_at, updated_at`

Columnas añadidas vía migración (aplicar `ADD COLUMN IF NOT EXISTS` antes de usar):
- `es_adeudo_migrado BOOLEAN NOT NULL DEFAULT FALSE` — migración 010
- `descripcion TEXT` — migración 011

## Columnas que NO existen en charges

- `campus_id` — siempre hacer JOIN vía students (campus_id está en students)
- `descripcion` — existe SÓLO después de migración 011; vistas en portal usan concept.nombre

## Tabla concepts

`concepts` NO tiene columna `activo`. No filtrar por `activo = true` en queries sobre concepts; el campo no existe en la DB.

## Por qué importa

Añadir una columna a `shared/schema.ts` sin migrarla a la DB causa 500 en cualquier INSERT/UPDATE que la liste explícitamente. Los SELECTs de Drizzle pueden fallar silenciosamente si la columna no existe. Siempre verificar con `information_schema.columns` antes de usar una columna nueva en SQL crudo.
