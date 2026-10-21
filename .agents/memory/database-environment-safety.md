---
name: Identidad de base y pruebas destructivas
description: No inferir producción externa a partir del estado de publicación de Replit; exigir identificación antes de pruebas.
---

No inferir que JFR carece de producción porque Replit no tenga una base publicada.
Puede existir una base externa; comparar destinos configurados no confirma cuál
es la base real. Un nombre JFR en fixtures tampoco es evidencia suficiente.

**Why:** La consulta administrada de producción no cubre bases Neon externas.
Confundir esa ausencia con inexistencia de producción llevó a sugerir publicar
sin haber identificado primero la base correcta.

**How to apply:** Identificar y confirmar el destino con el dueño antes de
pruebas con escrituras. No ejecutar seed, suites ni crear marcadores para
desbloquearlas en una candidata desconocida. No publicar ni crear índices antes
de presentar el preflight y recibir aprobación explícita. Revisar también el
arranque de servidores de pruebas: puede escribir antes del setup global.
