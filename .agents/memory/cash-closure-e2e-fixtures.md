---
name: Cash closure E2E fixtures
description: Reglas para probar cierres diarios persistentes sin depender ni contaminar pagos reales del día.
---

Un cierre diario persiste el snapshot de todos los pagos exitosos del campus en su fecha, no sólo los pagos creados por el fixture. En una prueba, compara sus totales contra la misma consulta de alcance campus/fecha usada por el servidor y confirma que el pago temporal está incluido.

**Why:** El entorno demo puede contener pagos de efectivo del día. Asumir que el total del cierre equivale al fixture produce falsos fallos aunque el snapshot sea correcto. Si una aserción de respuesta falla antes de conservar el identificador creado, la limpieza no puede borrar el cierre temporal.

**How to apply:** Guarda y valida el ID devuelto antes de hacer aserciones posteriores. En limpieza, elimina únicamente cierres identificados inequívocamente como fixtures E2E y nunca un cierre existente de un usuario.