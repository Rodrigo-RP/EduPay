---
name: Aislamiento de pagos manuales
description: Regla de tenant/campus para consultas y reintentos idempotentes de pagos administrativos.
---

En pagos manuales, filtrar el tenant por `charges.tenant_id` y el campus por el alumno asociado. No usar `students.tenant_id` como frontera exclusiva.

**Why:** Hay registros válidos de alumnos con ese campo sin poblar; usarlo excluye cargos legítimos del campus. El cargo es el registro financiero que porta el tenant.

**How to apply:** En lectura, bloqueo y replay idempotente, enlazar `payments → charges → students`, exigir el tenant del pago/cargo y el campus del alumno. El replay debe además coincidir con el cargo y alumno solicitados para no revelar un pago de otra operación.