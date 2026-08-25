---
name: Assistant figure associations
description: Validación segura de resúmenes financieros redactados por modelos de lenguaje.
---

Un resumen financiero generado por un LLM sólo se puede conservar si cada importe y conteo verificado está asociado a su indicador correcto (cobrado, por cobrar no vencido, vencido, becas y descuentos). La presencia del conjunto correcto de números no es suficiente. Si no se puede demostrar esa asociación, se debe mostrar un fallback redactado con las filas verificadas del backend.

**Why:** Un modelo puede intercambiar dos valores reales entre indicadores y pasar una validación que sólo compare tokens numéricos; eso convierte una respuesta aparentemente exacta en información financiera materialmente falsa.

**How to apply:** Para resultados ejecutivos estructurados, conservar filas etiquetadas y verificar que cada valor aparezca en el contexto inmediato de sus términos semánticos antes de usar la redacción generativa. Para listas de adeudos, mantener siempre el detalle de alumno y saldo verificado por el backend; las pruebas deben cubrir omisiones, cifras inventadas e importes intercambiados.