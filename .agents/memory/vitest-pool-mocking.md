---
name: Lectores SQL junto a pools simulados
description: Evitar recursión al combinar consultas reales de PostgreSQL con transacciones simuladas.
---

Usar un lector independiente cuando una prueba simula las conexiones del pool
de la aplicación pero necesita que PostgreSQL evalúe SELECT reales.

**Why:** Enlazar el método de consulta con `bind` no lo aísla: internamente sigue
abriendo conexiones mediante el mismo objeto. Si sus conexiones están simuladas
y remiten al lector enlazado, se produce recursión. Vitest puede quedarse sin
reportar progreso, aparentando un problema de importación o de red.

**How to apply:** Separar el lector real de los dobles transaccionales. Las
pruebas de calendario pueden evaluar las consultas sobre CTE de sólo lectura,
sin insertar fixtures ni ejecutar DDL para simular el reloj de PostgreSQL.
