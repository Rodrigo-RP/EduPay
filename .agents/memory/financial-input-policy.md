---
name: Excepciones de porcentajes financieros
description: Decisiones autorizadas para conservar enteros y porcentajes positivos sin migraciones.
---

La validación financiera general admite porcentajes de 0 a 100 con hasta dos
decimales, pero los beneficios de tipos de beca conservan enteros de 0 a 100.
No redondear una fracción para hacerla entrar en esa excepción.
Las reglas automáticas conservan porcentaje estrictamente mayor que cero y
hasta 100, con dos decimales; cero se rechaza antes de cualquier consulta.

**Why:** Se confirmó expresamente mantener esta diferencia sin migración;
el límite de precisión es una decisión autorizada, no un defecto que deba
relajarse automáticamente al reutilizar el validador general.
También se autorizó conservar restricciones de la base que difieran de la
validación general, documentándolas sin migrar. Detenerse sólo si contradicen
una regla de negocio explícita de la instrucción.

**How to apply:** Al unificar formularios y validadores, conservar el mensaje
de rechazo para fracciones en tipos de beca. Cualquier ampliación de precisión
allí necesita una nueva autorización; no inferir permiso para cambiar el esquema.
