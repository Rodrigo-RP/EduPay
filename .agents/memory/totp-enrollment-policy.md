---
name: Entrega privada del secreto TOTP
description: Excepción explícita de entrega del QR y código manual durante el registro pendiente de dos factores.
---

El QR y el código manual se permiten juntos sólo durante el registro pendiente
del propio usuario autenticado, con no-store. El pendiente se cifra desde su
generación, vence a los diez minutos y un registro nuevo lo reemplaza.
Después de confirmar nunca se vuelve a entregar el secreto, ni se registra.
La clave de cifrado nunca sale del servidor.

**Why:** El dueño aclaró que QR y código manual contienen el mismo secreto;
ocultar sólo el código no agrega seguridad y dificulta configurar desde el
mismo celular. Esta excepción no autoriza recuperar secretos ya configurados.

**How to apply:** Mantener privadas ambas formas de enrolamiento y probar
expiración, reemplazo y ausencia de secretos en respuestas posteriores.
