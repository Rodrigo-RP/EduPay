---
name: Assistant keyword scoring rules
description: Reglas del motor de intención del asistente — cómo se puntúan módulos y qué falsos positivos evitar.
---

## Regla
El scoring de módulos en `matchIntent` usa **coincidencia de palabra completa**, no subcadena.

## Por qué
Con `kw.includes(token)`, el token corto "hace" matcheaba la keyword "hacer un cargo" produciendo
falsos positivos de navegación para mensajes irrelevantes como "qué bonito día hace hoy".
Misma trampa para label/desc: "que" (de "qué") aparece como subcadena en "busqueda".

## Cómo aplicar
- Exact keyword → `kw === token` → score +3
- Keyword multi-palabra contiene token → `kw.split(" ").includes(token)` (token.length >= 4) → score +2
- Token contiene keyword → `token.includes(kw) && kw.length > 3` → score +1
- Label/desc → `str.split(" ").includes(token)` (token.length >= 4) → score +2/+1
- Nunca usar `.includes(token)` directo sobre cadenas multi-palabra.

## FAULT_KEYWORDS
Agregar frases completas con "no + verbo": "no me deja", "no descarga", "no se genero".
Sin estas frases los reportes de fallo se clasifican como navegación.

## Límite financiero del asistente
El chat del asistente es estrictamente de solo lectura: no devuelve señales, endpoints ni
payloads confirmables para modificar cargos, pagos, becas, facturas o conciliaciones.

**Why:** La conversación nunca debe convertirse en una vía alterna de ejecución administrativa.

**How to apply:** Una solicitud de escritura se rechaza y dirige a la pantalla correspondiente;
las guías sólo explican pasos locales y nunca preparan una llamada HTTP de modificación.

## Logging de interacciones (§4.3)
Cada POST /api/assistant/chat inserta en `audit_log` con action `assistant_chat_interaction`.
No guardar PII de familias — solo: intentType, route/actionId, messageLength.
