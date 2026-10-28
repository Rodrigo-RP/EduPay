---
name: Verificación aislada de pantallas operativas
description: Evitar falsos fallos y falsas garantías al probar UI sin backend.
---

Las pruebas aisladas de UI deben distinguir las barreras de acceso de los filtros
que se están comprobando. Una respuesta genérica vacía no representa correctamente
los contratos de habilitación de la plataforma ni garantiza acceso a la pantalla.
También hay que abrir explícitamente la pestaña con los datos cuando no es la inicial.

**Why:** Una verificación de filtros falló repetidamente antes de llegar a las filas:
la configuración inicial redirigía a otro flujo y otra pantalla abría reportes en vez
de la lista. No eran fallos del filtro académico.

**How to apply:** En pruebas sin red real, simular expresamente los contratos de
acceso y usar un rol permitido para los registros de prueba. Comprobar que se llegó
a la lista antes de evaluar filas. No ampliar permisos ni saltarse barreras en código
de aplicación para hacer pasar la prueba. Reportar la UI con respuestas simuladas
por separado de la integración con base de datos y autenticación real.
