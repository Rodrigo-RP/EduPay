---
name: Anthropic strict tool schemas
description: Límite del modo strict de Anthropic para herramientas con parámetros numéricos.
---

En modo `strict`, Anthropic rechazó esquemas de herramientas que usaban `minimum` y
`maximum` para propiedades de tipo `integer`.

**Why:** La API devolvió un `invalid_request_error` antes de ejecutar una herramienta,
por lo que el fallback no podía llegar al bucle de consultas aunque la clave y el modelo
fueran válidos.

**How to apply:** Mantener los esquemas expuestos a Anthropic simples y validar límites,
tipos, allowlists y permisos de cada argumento en el dispatcher del servidor antes de
ejecutar la consulta.