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

`drizzle-kit generate` puede terminar con código 0 después de imprimir un
error de importación. El exit code no demuestra que haya comparado el esquema.

**Why:** En la carga ESM de Kit, una copia temporal sin una dependencia local
imprimió `MODULE_NOT_FOUND` pero devolvió 0 y dejó los snapshots intactos.

**How to apply:** Exigir también la salida positiva de comparación y un
manifiesto idéntico de SQL, snapshots y journal. Incluir las dependencias
locales del esquema en las copias temporales; no probar con heliumdb.