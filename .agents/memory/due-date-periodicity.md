---
name: Calendario de vencimientos por periodicidad
description: Contrato de negocio para resolver vencimientos institucionales sin fechas silenciosas.
---

Los conceptos mensuales usan una regla por concepto y mes; los cuatrimestrales, semestrales y anuales usan fechas explícitas por concepto, ciclo y clave de periodo. Los conceptos anuales usan `ANUAL`.

No se debe inventar una fecha de vencimiento ni usar `+30 días`. Una configuración ausente, ambigua o inválida debe detener la emisión con un error explícito. Una fecha manual sólo es válida para un cargo extraordinario, con motivo, auditoría y marca de override; no modifica cargos ya emitidos.

**Why:** Una fecha silenciosa puede alterar obligaciones financieras y ocultar configuración incompleta. La asociación por concepto evita colisiones de nombres y prepara periodos que una escuela todavía no usa.

**How to apply:** Todo flujo institucional que emita cargos debe pasar por el resolvedor central. Conserva la compatibilidad por nombre únicamente para reglas mensuales históricas sin `concept_id`, siempre con alcance seguro de campus/tenant.