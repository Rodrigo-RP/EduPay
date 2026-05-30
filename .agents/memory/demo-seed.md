---
name: Demo seed email normalization
description: Cómo generar emails válidos con apellidos mexicanos (con acentos) para la BD.
---

## Regla

Para convertir apellidos con acentos a slug de email válido, usar un mapa de caracteres con secuencias `\u` escapadas, **no** `String.prototype.normalize("NFD")`.

**Why:** normalize() no funciona correctamente con tsx en este entorno Replit. Los literales Unicode tampoco se leen bien desde archivos TypeScript compilados con tsx — `á` se guarda correctamente en la string del schema pero la función normalize falla en extraer el diacrítico.

**How to apply:** En cualquier función que convierta texto a slug de email dentro del servidor:
```ts
const map: Record<string, string> = {
  "\u00e1": "a", "\u00e9": "e", "\u00ed": "i", "\u00f3": "o", "\u00fa": "u",
  "\u00fc": "u", "\u00f1": "n",
  "\u00c1": "a", "\u00c9": "e", "\u00cd": "i", "\u00d3": "o", "\u00da": "u",
  "\u00dc": "u", "\u00d1": "n",
};
return str.split("").map(c => map[c] !== undefined ? map[c] : c).join("").toLowerCase().replace(/[^a-z0-9]/g, "");
```
