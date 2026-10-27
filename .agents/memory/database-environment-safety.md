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

El dueño autorizó el 2026-10-26 clasificar como pruebas el destino entonces
configurado en `DATABASE_URL`. Esa autorización no incluye
`NEON_DATABASE_URL` ni destinos futuros si cambia la configuración.

**Why:** Identificar una base como de pruebas es una decisión del dueño, no
algo que pueda inferirse de su nombre o de que tenga fixtures. El marcador
no certifica que el contenido esté vacío o libre de datos reales.

**How to apply:** Releer el marcador físico antes de cualquier prueba con
escrituras y mantener las guardas de entorno. No recrearlo automáticamente
si falta ni copiarlo a otra conexión. Marcar la base no autoriza por sí solo
seeds, suites, migraciones o arranques: respetar el alcance de cada encargo.

Una orden de no ejecutar suites con escrituras también incluye las que pueda
disparar automáticamente GitHub al subir o borrar referencias.

**Why:** Una operación Git autorizada no amplía por sí sola el permiso de
escritura sobre las bases usadas por CI.

**How to apply:** Revisar los eventos de los workflows antes del push. Usar
`[skip ci]` en el commit que se sube cuando corresponda a `push`/`pull_request`;
no extender esa garantía a otros eventos ni al borrado de ramas, que puede
evaluarse con el commit de la rama predeterminada. Si no puede evitarse una
suite prohibida sin cambiar configuración, detenerse y pedir autorización.

`APP_ENV=development` debe configurarse únicamente como variable del entorno
`development`, nunca en `shared` ni en los Secrets de publicación.

**Why:** El dueño exige separar la configuración del espacio de trabajo de
la de publicación; habilitar guardas de desarrollo fuera de ese alcance
podría autorizar escrituras en un destino distinto.

**How to apply:** Usar la operación de variables con ámbito `development` y
verificar por separado que no se propagó a producción. Esto no prohíbe una
configuración futura `APP_ENV=production` autorizada para publicación.

Las pruebas de navegador con un servidor Vite temporal pueden hacer que
Replit agregue automáticamente un puerto a `.replit`.

**Why:** Una ejecución sin cambios de código puede dejar cambios de
configuración generados por la plataforma, además de variables autorizadas.

**How to apply:** Comparar la configuración al terminar y retirar sólo la
exposición temporal del servidor ya detenido. No restaurar todo `.replit`,
porque se perderían también las variables de entorno pedidas por el dueño.
