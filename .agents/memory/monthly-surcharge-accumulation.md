---
name: Recargos mensuales acumulables
description: Reglas de negocio para aplicar recargos acumulables sobre cargos vencidos.
---

Los modos admitidos son `ninguno`, `incremento_fijo` y `compuesto`. El primer incremento mensual corresponde al primer mes calendario posterior al vencimiento, una vez terminados los días de gracia. Cada periodo debe ser idempotente por cargo y mes.

**Why:** Instituto JFR debe poder activar la política hacia adelante sin recalcular ni cobrar retroactivamente meses pasados de cargos ya vencidos. El ledger emitido de pagos y recargos históricos debe conservarse.

**How to apply:** Para cualquier regla acumulable se requiere fecha de inicio. Un cargo vencido sólo genera periodos desde esa fecha; el recargo histórico se conserva como saldo inicial. El modo compuesto calcula sobre el saldo pendiente real, incluidos los recargos previos y descontando pagos aplicados. El modo fijo puede ser por importe o porcentaje.