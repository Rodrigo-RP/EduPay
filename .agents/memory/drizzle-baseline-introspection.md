---
name: Drizzle baseline introspection
description: Límites observados al crear un baseline físico desde una base PostgreSQL poblada.
---

No confiar ciegamente en el SQL o schema generado por `drizzle-kit pull`: puede
desplazar operator classes entre columnas de índices compuestos, serializar mal
defaults de arreglos y producir sintaxis inválida para checks `NOT VALID`.

**Why:** La introspección de un catálogo válido produjo SQL que no ejecutaba en
PostgreSQL y un manifiesto que parecía estable sólo porque su snapshot repetía
los mismos errores.

**How to apply:** Ejecutar el baseline completo en un schema transaccional
desechable y comparar contra `public` tablas, columnas, constraints, índices,
RLS, políticas y enums antes de marcar el ledger. En bases pobladas, el runner
debe exigir el hash y timestamp exactos del baseline; cualquier ledger ajeno
debe fallar cerrado.