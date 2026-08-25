---
name: Assistant student navigation
description: Contrato de destinos de expediente entre las rutas del asistente y el widget.
---

Todas las rutas de respuesta del chat que resuelvan una consulta de alumnos deben propagar `studentTargets` al nivel superior de la respuesta, incluso cuando también devuelvan un `actionResult`.

**Why:** Las rutas de Claude y de fallback pueden tener formas de respuesta distintas. Si una de ellas deja los destinos sólo anidados, cualquier consumidor que espere la señal común puede perder los enlaces a expedientes.

**How to apply:** Al añadir o modificar retornos del asistente, comprobar que los destinos se preserven en todos los caminos. La E2E debe verificar que un usuario con `STUDENTS.READ` ve un botón por alumno y que el enlace abre el `studentId` correcto; el servidor no debe usar nombres como identificadores de navegación.