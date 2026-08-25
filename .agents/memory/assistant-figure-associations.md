---
name: Assistant figure associations
description: Validación segura de resúmenes financieros redactados por modelos de lenguaje.
---

Un resumen financiero generado por un LLM sólo se puede conservar si cada importe y conteo verificado está asociado a su indicador correcto (cobrado, por cobrar no vencido, vencido, becas y descuentos). La presencia del conjunto correcto de números no es suficiente. Si no se puede demostrar esa asociación, se debe mostrar un fallback redactado con las filas verificadas del backend.

**Why:** Un modelo puede intercambiar dos valores reales entre indicadores y pasar una validación que sólo compare tokens numéricos; eso convierte una respuesta aparentemente exacta en información financiera materialmente falsa.

**How to apply:** Para resultados ejecutivos estructurados, conservar filas etiquetadas y verificar que cada valor aparezca en el contexto inmediato de sus términos semánticos antes de usar la redacción generativa. Para tablas de adeudos, cada alumno debe conservar sus cifras de saldo y cargos en su misma fila; los agregados verificados son permitidos pero no obligatorios. Una tabla válida se muestra literalmente; una omisión, cifra nueva o importe asociado al alumno equivocado usa fallback. Las pruebas deben cubrir ambos caminos.

La combinación de tono cálido, formato conversacional y esta frontera de precisión quedó validada como la experiencia deseada para el asistente financiero.

**Why:** La confirmación del producto fue positiva sin pedir relajar los controles de cifras.

**How to apply:** Mantener esta prioridad en futuras respuestas generativas del asistente: primero exactitud y asociación semántica; después naturalidad.