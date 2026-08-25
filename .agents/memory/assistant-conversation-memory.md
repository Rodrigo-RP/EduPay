---
name: Assistant conversation memory
description: Trust boundary and invalidation rules for Claude conversational context.
---

El historial canónico que se envía a Claude debe existir sólo en memoria del servidor. El navegador puede conservar el chat para mostrarlo, pero sus mensajes o resultados de herramientas no son una fuente confiable para reconstruir contexto.

**Why:** Un cliente puede falsificar mensajes con rol `assistant` o resultados previos y hacer que el modelo repita datos o siga instrucciones que nunca produjo el servidor.

**How to apply:** Liga la conversación a la sesión autenticada y al contexto efectivo (usuario, tenant, campus, rol y permisos), vuelve a validar y ejecutar las herramientas históricas con ese contexto, conserva un máximo acotado de turnos y descarta la memoria cuando cambie el enlace. En E2E que deba verificar metadatos de una herramienta ejecutada ahora (por ejemplo, destinos estructurados), usa una sesión autenticada nueva: una respuesta basada sólo en contexto histórico no vuelve a emitir esos metadatos.