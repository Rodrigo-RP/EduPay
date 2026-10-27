---
name: Transformación de UI en pruebas aisladas
description: El transformador de Vitest no es necesariamente el del Vite principal.
---

Configurar JSX en el transformador del runner instalado, no asumir que la
opción esbuild de la app gobierna las pruebas aisladas.

**Why:** El runner resuelve su propia generación de Vite/Oxc, mientras el build
principal puede usar otra. Se observó que ignoraba esbuild y conservaba JSX sin
transformar: SSR fallaba antes de ejecutar una sola prueba, aunque el build
de la app y los tipos pasaran.

**How to apply:** Ante errores “Unexpected JSX expression”, comprobar primero
el transformador realmente resuelto y sus tipos instalados. No reinstalar ni
migrar las dependencias de la app para resolverlo: las instalaciones reinician
workflows, lo que puede violar una revisión con la app expresamente detenida.
