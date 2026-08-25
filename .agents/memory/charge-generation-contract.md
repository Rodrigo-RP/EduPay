---
name: Generación de cargos
description: Reglas de contrato entre las pantallas de emisión y el generador de cargos.
---

Los valores de nivel académico que llegan desde una interfaz se deben normalizar al formato canónico antes de compararlos con el nivel calculado del alumno. El generador debe aceptar equivalentes como `primaria` y `PRIMARIA`.

**Why:** Una pantalla puede usar valores legibles en minúsculas aunque el dominio académico use constantes en mayúsculas; compararlos sin normalizar produce previews vacíos y confirmaciones sin alumnos.

**How to apply:** Canonicalizar el filtro de nivel en el borde del endpoint y conservar las constantes del dominio para la comparación interna.

Cuando un flujo de cargo extraordinario permite omitir fechas, el servidor debe resolver una fecha de emisión y un vencimiento operativos antes de escribir.

**Why:** Las columnas de cargos requieren fecha de emisión; delegar este valor a cada formulario convirtió una omisión opcional de UI en un error de persistencia.

**How to apply:** Las fechas explícitas del cliente tienen prioridad; si faltan, usar emisión del día y vencimiento a 30 días en el generador central.