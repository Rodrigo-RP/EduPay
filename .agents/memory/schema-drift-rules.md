---
name: Schema drift rules
description: How to handle tables declared in the shared schema but missing from the active development database.
---

Cuando un flujo depende de una tabla declarada en el esquema compartido pero ausente en la base activa, se debe añadir y aplicar una migración SQL pequeña e idempotente para ese cambio puntual; no usar un `db:push` amplio como atajo.

**Why:** el proyecto tiene divergencias históricas entre el esquema declarado y la base. Un push global puede proponer modificaciones no relacionadas y convertir una corrección localizada en un cambio de datos o estructura mucho mayor.

**How to apply:** confirmar primero la ausencia con una consulta de catálogo o con el error reproducible. Versionar el `CREATE TABLE IF NOT EXISTS` con sus FKs y defaults necesarios, aplicarlo en desarrollo y cubrir el flujo dependiente con una prueba.