# Roadmap de evolución EduPay — de sistema funcional a plataforma inteligente

Este documento es la hoja de ruta operativa resultante de contrastar el Plan Maestro de
Refereence Pagos (agosto 2026) contra el estado real de EduPay tras la auditoría de
seguridad y correctitud de agosto 2026. No es una lista de construcción desde cero — es la
evolución de un sistema que ya tiene **1135 pruebas pasando**, un ledger inmutable, un motor de
conciliación de tres bandejas, y un protocolo de autorización de tres niveles, todos
verificados con evidencia real.

**Estado al cierre de sesión (agosto 2026):** prioridades 1–8 completadas y verificadas en
suite verde. Dos piezas externas (Stripe, PAC) pendientes de decisión/acción de Rodrigo.
Prioridad 9 (ML) diferida explícitamente a Fase 4.

Documentos de referencia: docs/adr/ADR-001 a ADR-003, docs/HANDOFF-agosto-2026.md,
docs/PROTOCOLO-AUDITORIA.md, y docs/analisis-plan-maestro.md (el diagnóstico detallado
del que este roadmap deriva).

## Decisión de arquitectura

No migrar de stack. Se mantiene Express+Vite. El Plan Maestro sugiere NestJS/Fastify en
abstracto, pero dado que la decisión es evolucionar lo existente, reescribir el runtime ahora
sería trabajo puro sin ganancia funcional sobre un sistema ya endurecido. La recomendación de
"monolito modular, no microservicios" del Plan Maestro sí coincide con lo que ya existe.

## Regla de diseño no negociable — reglas explícitas, no IA, hasta Fase 4

El documento original de Instituto JFR prohíbe explícitamente "cualquier función de IA antes
de la Fase 4". Esta regla aplica a tres piezas de este roadmap que podrían implementarse de
dos formas muy distintas:

- Navegador universal, niveles 4 y 5 (sugerir acciones, ejecutar con confirmación)
- Panel directivo, insights narrativos ("secundaria concentra el 42% del riesgo")
- Motor predictivo, versión estadística/ML (regresión logística, Random Forest, XGBoost)

Las tres se construyen con Forma A: reglas explícitas y plantillas de texto fijas. Nunca
con modelo de lenguaje ni modelo estadístico/ML de ningún tipo, hasta Fase 4. Esto no es una
preferencia de estilo — es una instrucción de diseño tan concreta como "todo pago debe ser
atómico".

Para que la eventual migración a Forma B (generativa/estadística) en Fase 4 sea barata y no
una reconstrucción: el cálculo del hallazgo y la redacción/decisión final deben vivir en
pasos separados desde el día uno. Ejemplo: primero se calcula el dato estructurado
({tipo: "riesgo_concentrado", nivel: "secundaria", porcentaje: 42}), y solo después, en un
paso aparte, se convierte en la frase que ve el usuario o en la acción que se sugiere. Cuando
llegue Fase 4, solo ese último paso cambia — el cálculo real no se toca.

## Prioridades, en orden de construcción

### ✅ 1. Centro de Implementación — COMPLETADO

Flujo unificado: alumnos → familias/tutores → becas/descuentos → adeudos iniciales →
validar inconsistencias → simular cargos → activar cobranza. Con preview, simulación,
rollback y auditoría explícitos. Dry-run atómico, importación masiva desde Excel, wizard
de onboarding con persistencia de paso ante recarga.

Tests: `wizard-import-steps.test.ts` (14), `wizard-reload-persistence.test.ts` (9),
`import-dry-run.test.ts` (7), `import-becas-real-db.test.ts` (9),
`import-familias-tutores.test.ts` (5), `students-import-atomicity.test.ts` (8).

### 1b. Conexión a pasarela real de pagos — PENDIENTE RODRIGO (Stripe)

Proveedor seleccionado: **Stripe**. Pendiente que Rodrigo complete el alta comercial y
proporcione credenciales de API. El motor de conciliación, ledger e idempotencia de webhooks
ya está construido y probado — el adaptador Stripe se construye consultando la documentación
oficial vigente en el momento de la implementación, nunca de memoria. El resto del sistema
nunca conocerá el SDK de Stripe directamente — solo la interfaz PaymentProvider.

### ✅ 2. Conciliación con confianza porcentual — COMPLETADO

Motor de scoring: 100% auto-conciliado, 90-99% coincidencia muy probable, 70-89% revisión,
0-69% no conciliado. Bandeja de excepciones con asignación de responsable y maker-checker.
Parsers BBVA (PDF digital) y Santander. Importación CSV. Deduplicación con UNIQUE parcial.

Tests: `conciliacion-scoring.test.ts` (10), `excepciones-conciliacion.test.ts` (16),
`import-bank-transactions.test.ts` (11), `bbva-parser.test.ts` (8),
`santander-parser.test.ts` (8), `importar-pdf.test.ts` (9).

### ✅ 3. Carga de estados bancarios — COMPLETADO

- Fase 1 ✅: CSV/Excel bancario (`/api/caja/importar`).
- Fase 2 ✅: PDF bancario digital con tablas legibles (`/api/caja/importar-pdf`), BBVA
  implementado con parser real de coordenadas X.
- Fase 3: PDF escaneado/OCR — no implementada (Santander disponible es escaneado, sin texto
  extraíble; solo se valida que el parser no rompe ante él).

### ✅ 4. CFDI 4.0 con complemento IEDU — COMPLETADO (lógica interna)

Lógica CFDI completa: uso D10, complemento IEDU, CURP oficial SAT, clave RVOE, nivel
educativo (5 valores catálogo SAT), RFC del pagador real, separación colegiatura/inscripción,
17 claves c_FormaPago. Validators en `server/lib/validators.ts`. Check constraints en DB y
declarados en `shared/schema.ts` (drizzle-kit generate confirma 0 DROP CONSTRAINT).

Tests: `validators-m017.test.ts` (16), `fiscal-guard.test.ts` (28),
`fiscal-timbrar-tenant.test.ts` (4).

**PAC de timbrado real — PENDIENTE RODRIGO** (Facturama, FiscalCloud, o SW Sapien). El
timbrado actual es simulado. La conexión al PAC se construye consultando documentación
oficial vigente en el momento de implementación, nunca de memoria.

### ✅ 5. Reportes prediseñados con filtros acotados — COMPLETADO

Catálogo de 8 reportes: RPT-01 Financiero · RPT-02 Estudiantes · RPT-03 Cobranza ·
RPT-04 Admisiones · RPT-05 Consejo Directivo · RPT-06 Contable · RPT-07 Antigüedad de
Saldos · RPT-08 Riesgo de Cartera. Filtros: ciclo, nivel, grado, grupo, fecha, concepto,
estado, semáforo. Salida: tabla, Excel real (ExcelJS), PDF. Guards correctos por rol.

Tests: `rpt01`–`rpt08` test files, `export-role-guard.test.ts` (14),
`consejo-role-guard.test.ts` (9), `admissions-guard.test.ts` (7).

### ✅ 6. Navegador universal accionable — COMPLETADO (5 niveles)

N1 intención+navegación · N2 resultado directo en respuesta · N3 exportar Excel/PDF desde
asistente · N4 sugerir acciones (Forma A) · N5 ejecutar con confirmación explícita.
Implementado en `server/assistant-knowledge.ts` + `server/assistant-actions.ts`.

Tests: `assistant-knowledge.test.ts` (47), `assistant-export.test.ts` (23),
`assistant-suggest.test.ts` (11), `assistant-catalogo-productos-fix.test.ts` (8).

### ✅ 7. Motor de acciones generalizado — COMPLETADO (primer caso: conciliación)

`server/routes/acciones.ts` + migración `017_acciones_seguimiento.sql`. Bandeja de
excepciones de conciliación como primer caso de uso. Asignación de responsable, seguimiento,
resolución con maker-checker, medición de efectividad por resolución.

Tests: `acciones-seguimiento.test.ts` (11), `excepciones-conciliacion.test.ts` (16).

Extensión a otros tipos de hallazgo (riesgo, adeudos, becas, convenios): pendiente en backlog.

### ✅ 8. Panel directivo narrativo — COMPLETADO (NI-01 a NI-05)

`server/lib/narrative-insights.ts` con `generateNarrativeInsights()`. Reglas de umbral con
plantillas de texto fijas (Forma A — nunca LLM). 5 reglas: mora por encima del umbral,
cobranza baja vs mes anterior, riesgo concentrado en un nivel, alumnos sin cargo activo,
ingresos bajo el mínimo histórico. Severidades: info / warning / critical. Integrado en
RPT-05 Consejo Directivo con card visual coloreada por severidad.

Tests: `nit-narrative-insights.test.ts` (8), `rpt05-consejo.test.ts` (12).

### 9. Riesgo estadístico/ML — DIFERIDO (Fase 4, explícito)

Regresión logística, Random Forest o XGBoost. Doblemente diferido: falta historial real de
varias escuelas y ciclos, y es función de IA bajo la regla de diseño de este roadmap.

Mientras tanto: profundizar el modelo de reglas ya existente (riesgo por días vencidos,
meses acumulados, pagos parciales recurrentes, convenio incumplido, cercanía al cierre de
ciclo, historial del ciclo anterior).

## Variables explícitamente excluidas del scoring individual

Código postal, colonia, municipio, y cualquier dato socioeconómico inferido no deben usarse
para etiquetar a una familia individual como riesgosa — sí pueden usarse para reportes
agregados de marketing (por ejemplo, de dónde provienen las familias nuevas), pero nunca para
una decisión de riesgo sobre una familia específica. Esta distinción, ya presente en el Plan
Maestro original, se preserva sin diluir.
