---
name: Contacto opcional de tutores
description: Regla de producto para familias sin correo y contacto obligatorio del principal.
---

El correo de un tutor es opcional. Ausencia significa nulo, nunca una cadena
vacía ni una dirección inventada. El tutor principal debe tener celular;
los secundarios pueden no tenerlo. En una familia con un tutor, ése es el
principal.

**Why:** El dueño decidió admitir familias cuyo contacto es por celular.
La falta de correo no debe impedir representar sus expedientes ni generar
una liga de acceso, ni contarse como un envío de correo.

**How to apply:** Validar correo sólo cuando se captura; normalizar teléfonos
mexicanos a +52 y diez dígitos. No recuperar un correo anterior desde un alias
si el usuario vació explícitamente el campo canónico. Mantener las omisiones
de notificaciones y no restaurar NOT NULL mientras existan tutores sin correo.
