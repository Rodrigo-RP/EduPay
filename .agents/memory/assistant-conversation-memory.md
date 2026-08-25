---
name: Assistant conversation memory
description: Trust boundary and invalidation rules for Claude conversational context.
---

El historial canónico que se envía a Claude debe existir sólo en memoria del servidor. El navegador puede conservar el chat para mostrarlo, pero sus mensajes o resultados de herramientas no son una fuente confiable para reconstruir contexto.

**Why:** Un cliente puede falsificar mensajes con rol `assistant` o resultados previos y hacer que el modelo repita datos o siga instrucciones que nunca produjo el servidor.

**How to apply:** Liga la conversación a la sesión autenticada y al contexto efectivo (usuario, tenant, campus, rol y permisos), vuelve a validar y ejecutar las herramientas históricas con ese contexto, conserva un máximo acotado de turnos y descarta la memoria cuando cambie el enlace. En E2E que deba verificar metadatos de una herramienta ejecutada ahora (por ejemplo, destinos estructurados), usa una sesión autenticada nueva: una respuesta basada sólo en contexto histórico no vuelve a emitir esos metadatos.

**Regla de revocación:** Si una herramienta histórica no puede revalidarse, falla o perdió permiso, se debe omitir el turno completo antes de enviarlo al proveedor externo; no basta con sustituir el resultado de la herramienta por un error.

**Why:** El texto previo del asistente puede contener los datos financieros originalmente autorizados y el modelo podría repetirlos aunque la herramienta ya esté bloqueada.

**How to apply:** Tratar un fallo de revalidación como una frontera de datos: no reenviar ni la pregunta ni la respuesta de ese intercambio, y cubrirlo con una prueba que inspeccione el contexto saliente.

**Objetivos estructurados:** Los destinos de expedientes que provienen de una herramienta deben persistirse como IDs y nombres validados en el turno confiable. Un seguimiento que use referencias como “de esos” debe partir de esos IDs, no de nombres extraídos del texto ni de datos del navegador.

**Why:** Una herramienta de becas puede devolver sólo los casos positivos. Sin el conjunto original de alumnos, el asistente omite los casos sin beca y no puede demostrar de forma segura que pertenecen al contexto previo.

**How to apply:** Para consultas contextuales de becas, volver a consultar todos los IDs guardados con filtros explícitos de tenant y campus, y representar cada alumno devuelto, incluyendo “Sin beca activa” sólo cuando el `LEFT JOIN` verificado no encuentre una beca vigente. Devolver también la unión de destinos actuales y contextuales para que la navegación no desaparezca entre turnos.