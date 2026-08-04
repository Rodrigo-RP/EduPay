---
name: Semaforo SQL FILTER clause
description: FILTER(WHERE…) en PostgreSQL debe ir DESPUÉS del paréntesis de cierre del agregado
---

## Regla
En PostgreSQL, la cláusula `FILTER (WHERE ...)` es una extensión de funciones de agregado. Debe aparecer directamente después del paréntesis de cierre del agregado, NO dentro de él.

**INCORRECTO:**
```sql
MAX(EXTRACT(DAY FROM expr) FILTER (WHERE condition))
```

**CORRECTO:**
```sql
MAX(EXTRACT(DAY FROM expr)) FILTER (WHERE condition)
```

También con casts:
```sql
-- INCORRECTO
COUNT(x) FILTER (WHERE y)::numeric

-- CORRECTO
(COUNT(x) FILTER (WHERE y))::numeric
```

**Why:** Error en el semáforo de riesgo causó 500 "syntax error at or near FILTER" hasta corregir la posición del FILTER.

**How to apply:** Revisar cualquier query que combine FILTER con funciones anidadas.
