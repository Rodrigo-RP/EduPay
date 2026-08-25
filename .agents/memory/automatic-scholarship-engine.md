---
name: Motor de becas automáticas
description: Reglas de prioridad, idempotencia y compatibilidad de las becas automáticas.
---

Una beca creada por el motor se identifica únicamente por una asignación automática vinculada; las demás becas vigentes se consideran manuales. Para cualquier ciclo, una manual tiene prioridad aunque una automática ofrezca un porcentaje mayor; en ese caso se conserva una alerta administrativa en vez de acumular o sustituir descuentos.

**Why:** La tabla histórica de becas no tiene una columna de origen. Inferir el origen por porcentaje, motivo o tipo vuelve insegura la prioridad manual y puede modificar descuentos ya aprobados.

**How to apply:** Toda creación o emisión de cargo debe usar el resolvedor de beca efectiva con la fecha/ciclo aplicable. La idempotencia se define por regla, alumno y ciclo; los cargos de planes, con pago, parciales, pagados o no colegiatura nunca se alteran.

Los checks nuevos de reglas automáticas se añaden como `NOT VALID` para proteger escrituras futuras sin impedir que reglas históricas preexistentes se conserven durante la migración.

**Why:** El catálogo anterior puede contener tipos o destinos que la primera versión real no soporta todavía.

**How to apply:** Validar la nueva entrada en API y DB; no convertir ni borrar reglas históricas como efecto secundario de activar el motor.