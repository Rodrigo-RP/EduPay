---
name: PostgreSQL CASE parameter typing
description: Casteos explícitos para parámetros reutilizados dentro de expresiones CASE en PostgreSQL mediante Neon.
---

Cuando un parámetro de una consulta parametrizada se reutilice en un `CASE` junto con una columna tipada, se debe declarar su tipo explícitamente en cada contexto sensible (por ejemplo, `::varchar` o `::integer`).

**Why:** El inferidor de tipos de PostgreSQL puede tratar un parámetro usado en una condición `CASE` como texto aunque su otra aparición actualice una columna entera o varchar, produciendo errores de tipos incompatibles en ejecución.

**How to apply:** Revisar `UPDATE` e `INSERT` con parámetros que aparezcan tanto en comparaciones como en ramas `THEN`/`ELSE`; usar un cast que coincida con la columna de destino.