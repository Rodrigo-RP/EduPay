---
name: Commit reporting
description: Regla de trazabilidad para reportes de trabajo terminado.
---

Todo reporte de trabajo terminado debe incluir el hash real del commit publicado y el resultado de `git ls-remote` para la rama remota correspondiente.

**Why:** Un cambio puede estar validado o guardado localmente sin estar disponible en GitHub; el hash remoto permite confirmar que el trabajo realmente quedó publicado.

**How to apply:** Antes del reporte final, obtener el hash con Git, hacer push si corresponde y comparar explícitamente el hash local contra la salida de `git ls-remote`. Si no coinciden, no reportar el trabajo como publicado.