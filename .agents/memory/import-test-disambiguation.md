---
name: Import test — desambigüación de concepto
description: Cómo evitar colisiones con el seed demo al testear la desambigüación de concept_id en el import de adeudos migrados.
---

## Problema

El campus demo (campus_id=48, tenant_id=29) ya tiene muchos conceptos de tipo `colegiatura` con `'PRIMARIA'` y `'SECUNDARIA'` en el nombre. Cuando el test crea sus propios fixtures del mismo tipo, la query `ORDER BY id` puede devolver primero los conceptos del seed (id más bajo), y si hay múltiples matches para el nivel del alumno (`filtrados.length > 1`), el algoritmo cae al fallback (primer concepto, id más bajo = seed).

## Solución

Usar un `tipo` exclusivo del test que nunca exista en el seed:

```typescript
const TIPO_IAM_TEST = 'colegiatura_iam_test';
```

Crear exactamente UN concepto con 'PRIMARIA' en nombre y UNO con 'SECUNDARIA', ambos de tipo `TIPO_IAM_TEST`. Garantiza `filtrados.length === 1` para cada nivel → desambigüación determinista.

## Limpieza de residuos entre corridas

Si el test falla antes de `afterAll`, los fixtures de concepts quedan en la DB. Agregar al inicio del `beforeAll`:

```typescript
await pool.query(
  `DELETE FROM concepts WHERE campus_id = $1 AND tenant_id = $2 AND tipo = $3`,
  [CAMPUS_ID, TENANT_ID, TIPO_IAM_TEST],
);
```

## Regla general

Cualquier test de import que necesite control total sobre qué concept_id se elige debe usar un `tipo` ficticio exclusivo del test, nunca un tipo real ('colegiatura', 'inscripcion') que el seed también usa.
