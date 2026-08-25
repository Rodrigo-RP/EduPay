---
name: Deuda de configuración de pagos
description: Decisión de mantener temporalmente las pantallas y APIs heredadas fuera del camino activo, pero tratarlas como deuda de seguridad.
---

El camino canónico de configuración de pagos es la pantalla completa y sus contratos `*-complete`. Las pantallas antiguas y sus APIs base, junto con el contrato alterno de reglas de recargo, deben permanecer fuera de auditorías funcionales del camino activo, pero no deben considerarse eliminadas: siguen siendo alcanzables por URL y pueden persistir datos con contratos y guards diferentes.

**Why:** La duplicidad no es sólo visual. Las rutas heredadas escriben las mismas tablas y tienen diferencias de permisos, formatos y validaciones; borrarlas durante una corrección funcional podría ocultar dependencias o romper enlaces existentes.

**How to apply:** No eliminar ni ampliar las rutas heredadas dentro de correcciones de vencimientos o recargos. Primero consolidar y asegurar el contrato canónico; después retirar o deshabilitar explícitamente las pantallas y APIs heredadas mediante una tarea separada, con búsqueda de referencias y verificación de autorización.