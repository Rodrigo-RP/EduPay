# Inventario de calendario del servidor

Base: código anterior a esta corrección en `actualizacion-vite`.
Las líneas son las originales, para poder auditar las 31 coincidencias del
buscador (una línea puede contener varios getters).

Comando: `rg -n '\.get(Month|FullYear|Date|Day)\(' server shared
--glob '!**/tests/**' --glob '!**/*.test.*'`.

A: calendario explícito/persistido, no interpretar como instante UTC.
B: reloj actual o cálculo relativo a él.
C: interpretación de archivo externo.

| Archivo:línea original | Clase | Decisión |
|---|---|---|
| server/storage.ts:922 | B, duración técnica | Conservar los últimos 30 días como duración móvil, con milisegundos; no truncar a medianoche. |
| server/assistant-claude.ts:710 | B | Año del día escolar. |
| server/assistant-claude.ts:711 | B | Mes del mismo día escolar. |
| server/assistant-actions.ts:330 | B | Mes predeterminado del día escolar. |
| server/assistant-actions.ts:331 | B | Año predeterminado del mismo día escolar. |
| server/assistant-actions.ts:1288 | B | Vigencia relativa al día escolar; operar sobre calendario UTC anclado al día explícito, no al reloj UTC. |
| server/assistant-knowledge.ts:641 | B | Mes de deudores desde el día escolar. |
| server/assistant-knowledge.ts:642 | B | Año de deudores desde el mismo día escolar. |
| server/assistant-knowledge.ts:682 | B | Mes del resumen desde el día escolar; conservar mes explícito. |
| server/assistant-knowledge.ts:683 | B | Año del resumen desde el mismo día escolar; conservar año explícito. |
| server/seed-demo.ts:50 | B | Desplazamiento del calendario demo anclado al día escolar, mediante getters/setters UTC. No ejecutar seed. |
| server/seed-demo.ts:479 | B | Año demo desde el día escolar. No ejecutar seed. |
| server/lib/surcharge-calculator.ts:40 | A | Mantener serialización de calendario ya normalizado. |
| server/lib/surcharge-calculator.ts:41 | A | Mantener día de calendario ya normalizado. |
| server/lib/surcharge-calculator.ts:42 | A | Mantener año de calendario ya normalizado. |
| server/lib/surcharge-calculator.ts:47 | A | Mantener lectura de DATE explícito. Su antiguo origen B se corrige aparte: parámetro calculationDate predeterminado con schoolDate(), no new Date(). |
| server/lib/surcharge-calculator.ts:58 | A | Mantener recuperación del calendario explícito parseado. |
| server/lib/surcharge-calculator.ts:63 | A | Mantener avance de días sobre calendario normalizado. |
| server/lib/surcharge-calculator.ts:69 | A | Mantener comienzo del mes del calendario normalizado. |
| server/lib/surcharge-calculator.ts:73 | A | Mantener avance de meses sobre calendario normalizado. |
| server/lib/surcharge-calculator.ts:85 | A | Mantener día de semana del calendario normalizado; no es el reloj actual. |
| server/lib/report-exporter.ts:97 | A | Mantener día de DATE/timestamp sin zona recibido del controlador. |
| server/lib/report-exporter.ts:98 | A | Mantener mes recibido del controlador. |
| server/lib/report-exporter.ts:99 | A | Mantener año recibido del controlador. |
| server/lib/surcharge-accrual.ts:56 | A | Mantener DATE de cargo/periodo. El asOf predeterminado ya usa schoolDate(). |
| server/lib/bank-parsers/bbva-parser.ts:315 | B | El getter obtiene el año del reloj sólo como fallback; usar schoolDate(). Mantener año explícito de metadata PDF, que se lee con parseInt, no con estos getters. |
| server/routes/payments.ts:689 | B | Vigencia predeterminada desde hoy escolar, o fecha explícita: aritmética UTC del día literal, sin extraer año del reloj. |
| server/notification-system.ts:21 | B, duración técnica | Conservar anticipación móvil de 15 días y cálculo de urgencia por duración; usar milisegundos, sin truncar instantes. |
| server/routes/acciones.ts:244 | B | Primer día de hace dos meses en calendario escolar; fijar día 1 antes de desplazar mes para evitar desbordamiento. |
| server/routes/reportes-admisiones.ts:222 | B | Ciclo predeterminado desde el año escolar actual; conservar ciclo solicitado. |
| server/routes/admin.ts:1500 | B | Vigencia predeterminada desde hoy escolar, o fecha explícita: aritmética UTC del día literal. |

Las ventanas técnicas no extraen “hoy”, mes o año: comparan instantes y
conservan su duración, no se sustituyen por un corte de día escolar. Esto
evita introducir otra política de retención o anticipación.

No se convierte con schoolDate() un Date recibido de una columna DATE:
medianoche del día persistido no representa un instante UTC a desplazar.

No hay un getter de clase C pura entre estas 31 líneas. En el parser BBVA,
el año explícito del archivo se obtiene de CreationDate mediante expresión
regular y parseInt. No depende de la zona del proceso y se conserva.
Esa metadata es una inferencia del año del documento, no una garantía del
año de cada movimiento: archivos regenerados o con periodos interanuales
requieren comprobar su año. No se cambia esa política en esta tarea.
