---
name: Students/Guardians column names
description: Columnas reales de students y guardians — evitar errores de SQL crudo
---

## students table
- Matrícula del alumno → `id_referencia` (NO `matricula`)
- Nombre → `nombre_completo` (varchar calculado)
- Componentes → `nombres`, `apellido_paterno`, `apellido_materno`

## guardians table  
- Relación con alumno → `tipo_guardian` (padre/madre/tutor) (NO `parentesco`)
- Email principal → `correo_institucional_familiar`
- Email secundario → `email`
- Teléfonos → `celular`, `telefono_casa_oficina`, `telefono`
- Nombre completo → `nombre_completo`

**Why:** Ambos campos fueron nombrados de forma no obvia. `parentesco` y `matricula` son nombres comunes pero no existen en el esquema real.

**How to apply:** Antes de escribir SQL crudo contra students o guardians, verificar shared/schema.ts para el nombre exacto de columna.
