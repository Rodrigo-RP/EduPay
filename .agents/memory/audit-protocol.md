---
name: Audit Protocol
description: Directiva de auditoría QA que debe aplicarse antes de dar por finalizado cualquier desarrollo o corrección en la plataforma.
---

# Directiva de Operación: Pruebas de Integración y Auditoría de Sistema

**Rol:** Experto en QA y Arquitectura de Software para Plataformas de Pagos Educativas (EduPay / Reference).

**Misión:** Garantizar la integridad funcional completa del sistema ejecutando pruebas de integración automáticas y aplicando un protocolo de auditoría estricto antes de validar cualquier ajuste o nueva función.

## 1. Pruebas de Integración E2E

Para funciones críticas (Carga Masiva de Alumnos, Generación de Fichas de Pago, Exportación de Reportes) se debe simular y verificar el ciclo completo:

- **UI:** Simular el evento del usuario (cargar archivo, presionar botón exportar/procesar).
- **Backend:** Validar recepción, parseo y procesamiento correcto en el servidor.
- **Base de datos:** Confirmar que los registros se creen, actualicen o relacionen exactamente en las tablas correspondientes.
- **Red y notificación:** Verificar códigos HTTP correctos (200/201) y alertas visuales hacia el usuario.

## 2. Modo Auditoría — Checklist

Antes de aprobar cualquier corrección o módulo, validar:

- [ ] **Endpoints:** Todos los endpoints involucrados responden correctamente y sin latencias anómalas.
- [ ] **Base de datos:** Conexión disponible y schema íntegro (staging y réplicas).
- [ ] **Servicios externos:** Estado de webhooks, sandbox de pago y servicios de terceros.
- [ ] **Resiliencia:** Ante datos corruptos o caídas parciales, el sistema captura la excepción, muestra mensaje claro al usuario y no corrompe la BD.

## 3. Definition of Done

**Ningún desarrollo o corrección se considera finalizado si no ha superado:**
1. La simulación End-to-End completa.
2. El checklist del Modo Auditoría.

Un fallo sólo puede etiquetarse como “preexistente” después de ejecutarlo en el
commit base con el mismo comando y condiciones comparables. Si un escenario
pasa aislado pero falla en la suite completa, reportarlo como dependiente del
orden/estado de la suite, no como regresión ni como preexistente sin evidencia.

Reproducir el fallo en la base no basta para atribuirlo a la app: ambas
ramas pueden compartir una preparación incorrecta. Antes de clasificar
fallos de vigencias, antigüedad o cortes, comprobar que las fechas de las
pruebas y de SQL usan el mismo calendario escolar que el servidor.

**Why:** Una comparación en la misma franja nocturna reprodujo fallos
causados por fixtures UTC, no por las reglas de la app.

**How to apply:** Distinguir fallo de preparación de fallo del producto y
verificar el calendario de ambos lados, especialmente entre las 18:00 y
las 24:00 de Ciudad de México; no debilitar las aserciones para hacerlo pasar.

**Why:** El usuario explícitamente requiere este protocolo para asegurar calidad antes de marcar cualquier tarea como completa.

**How to apply:** Cuando el usuario pida una auditoría, o antes de marcar como IMPLEMENTED cualquier tarea crítica (pagos, cargos, reportes, carga masiva), ejecutar este checklist completo y reportar resultados punto por punto.
