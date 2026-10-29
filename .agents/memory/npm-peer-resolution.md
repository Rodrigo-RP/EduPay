---
name: Resolución de dependencias con npm
description: Fallo interno de Arborist observado al simular correcciones de seguridad y límites de la evidencia
---

En este entorno, npm 10.8.2 y una ejecución temporal de npm 10.9.4 fallaron en `#loadPeerSet` con `Cannot read properties of null (reading 'edgesOut')` durante `npm audit fix --dry-run`. También ocurrió sin filtro de antigüedad. La dependencia desencadenante no quedó identificada.

**Why:** La simulación evitó modificar el árbol sin comprobar su compatibilidad. Cambiar de versión menor de npm y preferir deduplicación no resolvieron el fallo; no debe atribuirse exclusivamente al filtro de fechas.

**How to apply:** Confirmar si sigue ocurriendo antes de una nueva corrección masiva. No convertir un fallo interno de npm en permiso para usar `--force` o ignorar requisitos pares. Si reaparece, informar que la resolución está bloqueada y separar las correcciones efectivamente instaladas de las pendientes.
