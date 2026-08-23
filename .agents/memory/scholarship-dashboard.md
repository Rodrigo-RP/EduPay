---
name: Scholarship dashboard definition
description: Canonical scope for scholarship beneficiary and assignment counts.
---

“Alumnos beneficiados” significa alumnos distintos, activos, del campus actual y con una beca vigente en la fecha de consulta. “Asignaciones” es el número de registros de beca que cumplen la misma regla y puede ser mayor que los beneficiarios.

**Why:** El panel mostraba totales locales inventados mientras el asistente consultaba asignaciones reales de todo el tenant, lo que producía cifras contradictorias.

**How to apply:** Cualquier KPI, listado, reporte o respuesta del asistente sobre becas debe filtrar por campus, estado activo del alumno y vigencia de la beca. No presentar datos locales simulados como información administrativa.