---
name: Drizzle schema creation prompt
description: Safe handling for an ambiguous Drizzle create-versus-rename prompt when applying a new development table.
---

Cuando `drizzle-kit push` propone una tabla nueva pero presenta una opción alternativa de renombrar una tabla existente, no aceptar el renombrado como atajo ni asumir que `--force`, `CI` o stdin aplicaron el cambio.

**Why:** el prompt puede quedarse sin resolver en ejecuciones no interactivas y el renombrado de una tabla no relacionada sería destructivo. Un exit code exitoso no prueba que el DDL se haya aplicado.

**How to apply:** mantener una migración SQL idempotente y versionada, aplicarla sólo a la conexión de desarrollo cuando el flujo interactivo esté bloqueado, y confirmar la tabla e índice en el catálogo antes de probar. La producción se actualiza exclusivamente mediante Publish.