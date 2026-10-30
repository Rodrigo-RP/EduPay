---
name: Procesos hijos y preload de CI
description: Aislamiento de pruebas de negativa de producción cuando CI precarga el adaptador de PostgreSQL.
---

Los procesos hijos heredan `NODE_OPTIONS`. En CI, el adaptador de PostgreSQL
se precarga antes del script y sólo admite el entorno de pruebas. Un hijo
que simula producción puede morir en ese adaptador sin llegar a la guarda
que la prueba pretende verificar.

**Why:** La negativa de seguridad del adaptador es correcta, pero no demuestra
la negativa del comando de aplicación y puede producir evidencia engañosa.

**How to apply:** En pruebas negativas aisladas que no deben conectar a ninguna
base, vaciar `NODE_OPTIONS` únicamente en el entorno del hijo. No quitar el
preload del servidor o de las suites con base real ni relajar la guarda del
adaptador para aceptar producción.
