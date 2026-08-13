# Roadmap de evolución EduPay — de sistema funcional a plataforma inteligente

Este documento es la hoja de ruta operativa resultante de contrastar el Plan Maestro de
Refereence Pagos (agosto 2026) contra el estado real de EduPay tras la auditoría de
seguridad y correctitud de agosto 2026. No es una lista de construcción desde cero — es la
evolución de un sistema que ya tiene 689 pruebas pasando, un ledger inmutable, un motor de
conciliación de tres bandejas, y un protocolo de autorización de tres niveles, todos
verificados con evidencia real.

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

### 1. Centro de Implementación

Unificar los imports ya existentes (alumnos, becas, plantillas) en un flujo formal único:
subir alumnos → familias/tutores → becas/descuentos → adeudos iniciales → validar
inconsistencias → simular cargos → activar cobranza. Con preview, simulación, rollback y
auditoría explícitos en cada paso.

Prioridad 1 no por ser lo más complejo técnicamente, sino por ser el argumento comercial más
directo frente a plataformas que tardan 30-60 días en implementar: "No tienes que capturar
todo otra vez. Sube tus Excels actuales."

### 1b. Conexión a pasarela real de pagos — en paralelo, sin proveedor fijo aún

Falta como prioridad explícita, no solo mencionada de paso en el diagnóstico: sin una
pasarela real conectada, ni la conciliación ni la lectura de estados bancarios se validan
contra datos reales (comisiones reales, depósitos reales, eventos reales de webhook), solo
contra simulaciones. Se posiciona en paralelo al Centro de Implementación, no estrictamente
antes de las prioridades 2-3, porque depende de investigación de documentación vigente y de
tiempos de aprobación comercial que no dependen del equipo de ingeniería — mientras eso
avanza, el diseño de conciliación y lectura bancaria puede construirse ya contra datos con la
forma realista de lo que cualquier pasarela documenta en su especificación de webhooks.

Proveedor todavía sin decidir — la elección entre Conekta, Stripe, Mattilda Pay u otro
depende de qué comisiones ofrezca cada uno, decisión puramente comercial de Rodrigo. La
interfaz PaymentProvider (ya especificada en el documento original de Instituto JFR, en
/packages/payments) existe exactamente para este escenario: el resto del sistema nunca
conoce el SDK de un procesador específico, solo la interfaz — así que construir contra esa
interfaz ahora no ata la decisión comercial a ningún proveedor en particular. El adaptador
concreto se construye cuando el proveedor esté decidido, consultando su documentación oficial
vigente en ese momento, nunca de memoria.

### 2. Conciliación con confianza porcentual

Evolucionar el motor de tres bandejas ya existente (auto-conciliado / revisión / aclaración)
hacia niveles explícitos: 100% conciliado automáticamente, 90-99% coincidencia muy probable,
70-89% requiere revisión, 0-69% no conciliado.

### 3. Carga de estados bancarios, por fases

- Fase 1: CSV/Excel bancario estructurado (resuelve la mayoría de los casos reales).
- Fase 2: PDF bancario digital con tablas legibles.
- Fase 3: PDF escaneado/OCR — solo si resulta indispensable, dado el ruido y los errores
  que introduce frente a las dos fases anteriores.

### 4. CFDI 4.0 con complemento IEDU

Fase técnica: 4 — Peso comercial: Alto (diferenciador comercial de primer orden, sin el cual
no se puede salir al mercado).

Confirmado explícitamente por Rodrigo, incluso frente a la sugerencia de suavizarlo para
pilotos técnicos: el CFDI es bloqueante también para el piloto en Instituto JFR, no solo
para la venta comercial a otras escuelas. No hay una versión "ligera" de esta prioridad — se
mantiene con el mismo peso decidido desde el principio.

Se posiciona aquí, inmediatamente después de que el motor financiero, la conciliación y la
carga bancaria estén sólidos, porque el CFDI necesita que esos datos de origen sean confiables
— no porque importe menos que el resto. Si surge presión comercial real (un prospecto pregunta
por deducibilidad fiscal antes de firmar), esta posición se puede adelantar aún más; el orden
es un default razonable, no una regla rígida.

Dos pasos independientes, que pueden avanzar en paralelo:
- Diseño de la lógica (uso D10, complemento IEDU, CURP, clave RVOE, separación de
  colegiatura e inscripción, RFC del pagador real): puede trabajarse ya, sin depender de nada
  externo — igual que se diseñó el motor de pagos antes de conectar un procesador real.
- Conexión a un PAC real (Facturama, FiscalCloud, SW Sapien): requiere consultar
  documentación oficial vigente en el momento en que se haga, nunca de memoria.

### 5. Reportes prediseñados con filtros acotados

Punto medio explícito, resuelto entre las dos posiciones del documento original de JFR ("sin
constructor configurable") y el Plan Maestro ("constructor visual completo"): un catálogo fijo
de reportes conocidos (cobranza, antigüedad de saldos, morosidad, becados, riesgo), cada uno
con filtros acotados de antemano (ciclo, nivel, grado, grupo, fecha, concepto, estado, riesgo),
con salida en tabla, Excel y PDF.

Nunca un constructor de consulta libre sobre cualquier campo de cualquier tabla — esa
superficie es exactamente la clase de riesgo que se cerró con el bug del wildcard en
audit_log durante la auditoría de seguridad de esta sesión.

### 6. Navegador universal accionable

Evolucionar la base ya existente (assistant-knowledge.ts, matchIntent,
detectActionIntent) en cinco niveles incrementales, cada uno con entrega verificable:

1. Entender intención y navegar (ya existe, en versión básica).
2. Mostrar resultado directo en la respuesta, no solo navegar a una pantalla.
3. Permitir exportar Excel/PDF desde la respuesta misma.
4. Sugerir acciones — Forma A obligatoria (ver regla de diseño arriba).
5. Ejecutar acciones con confirmación explícita del usuario — Forma A obligatoria, y con
   especial cautela: si en cualquier fase futura este nivel llega a aceptar texto libre que
   alimente un modelo con capacidad de ejecutar acciones (no solo describir), eso abre una
   superficie de riesgo nueva de manipulación del modelo, que necesitaría el mismo nivel de
   escrutinio que se le dio a cada guard de permisos en esta auditoría.

### 7. Motor de acciones generalizado

Extender el mecanismo ya existente (bandeja de excepciones, maker-checker de condonaciones)
para cualquier tipo de hallazgo — conciliación, riesgo, adeudos, becas, descuentos, convenios
— con asignación de responsable, seguimiento, y medición de efectividad.

### 8. Panel directivo narrativo

Agregar insights automáticos sobre el dashboard ya existente ("secundaria concentra el 42% del
riesgo de cartera", "18 familias requieren contacto antes del cierre de ciclo"). Forma A
obligatoria — reglas explícitas de umbral (por ejemplo: "si un nivel académico supera X% del
riesgo total del campus, generar la frase con esa plantilla fija"), nunca redactado por un
modelo de lenguaje.

### 9. Riesgo estadístico/ML

Regresión logística, Random Forest o XGBoost sobre las variables ya identificadas (días de
atraso, meses vencidos, pagos parciales recurrentes, convenios incumplidos, cercanía al cierre
de ciclo). Doblemente diferido: no solo falta suficiente historial real de varias escuelas y
ciclos para entrenar un modelo confiable, sino que además es, bajo la regla de diseño de este
roadmap, función de IA — sujeta al mismo límite de Fase 4 que el navegador y el panel, no solo
a una cuestión de volumen de datos.

Mientras tanto, profundizar el modelo de reglas ya existente: riesgo por días vencidos, por
meses acumulados, por pagos parciales recurrentes, por convenio incumplido, por cercanía al
cierre de ciclo, por historial de atraso del ciclo anterior.

## Variables explícitamente excluidas del scoring individual

Código postal, colonia, municipio, y cualquier dato socioeconómico inferido no deben usarse
para etiquetar a una familia individual como riesgosa — sí pueden usarse para reportes
agregados de marketing (por ejemplo, de dónde provienen las familias nuevas), pero nunca para
una decisión de riesgo sobre una familia específica. Esta distinción, ya presente en el Plan
Maestro original, se preserva sin diluir.
