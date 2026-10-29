# Correcciones de pago en efectivo y calendario de pruebas

## RESUMEN

Trabajo directo en `barrido-simulados`, sin tareas, integración ni publicación.
Se eliminan exclusivamente los dos fallbacks de las lecturas `explicitRow`
y `candidateRow` del pago en efectivo. Dos regresiones aisladas verifican
500, ausencia del mensaje «No hay cargos pendientes» y ninguna apertura
de transacción cuando falla cualquiera de esas consultas.

Se corrigen las fechas de 51 archivos de pruebas: 43 en `server/tests`
y 8 en `e2e`. Los cálculos actuales y relativos usan `schoolDate()`; las
preparaciones y lecturas SQL usan `SCHOOL_TODAY_SQL`, incluidos los anteriores
`NOW()::date`. No se modifica el calendario compartido ni otras reglas de la app.
Las operaciones, umbrales y cantidad de aserciones se conservan:
1,934 llamadas `expect` antes y después en esos archivos; no se agregan omitidos.

La clasificación anterior de los cinco fallos como fallos preexistentes de
la app fue incorrecta. Reproducirlos en ambas ramas no distinguía una
preparación compartida en UTC del calendario local del servidor.
El reporte anterior conserva sus resultados históricos y señala esta corrección.

## ARCHIVOS MODIFICADOS

Punto 1:
- `server/routes/conciliacion.ts`: únicamente las dos eliminaciones solicitadas.
- `server/safety-tests/barrido-simulados.test.ts`: cargo explícito y automático
  con fallo de lectura, ambos 500 sin iniciar pago.

Punto 2, archivos de navegador:
- `e2e/08-excepciones.spec.ts`
- `e2e/09-planes-pago.spec.ts`
- `e2e/18-condonacion-override-ui.spec.ts`
- `e2e/19-asistente-claude-real.spec.ts`
- `e2e/25-caja-conciliacion-bancaria.spec.ts`
- `e2e/27-cargos-emision-persistencia.spec.ts`
- `e2e/27-planes-pago-flujos-completos.spec.ts`
- `e2e/28-asignacion-precios-real.spec.ts`

Punto 2, archivos de servidor, todos bajo `server/tests/`:
- `acciones-seguimiento.test.ts`, `adeudo-migrado-recargo.test.ts`,
  `approval-workflow.test.ts`, `assistant-claude.test.ts`,
  `assistant-suggest.test.ts`, `beca-individual.test.ts`,
  `bug-audit-log-rollback.test.ts`, `charges-by-campus-concept-join.test.ts`,
  `charges-create-update-role-guard.test.ts`, `concepts-payment-config-guard.test.ts`,
  `conciliacion-revision-supervisor.test.ts`, `conciliacion-schema.test.ts`,
  `conciliacion-scoring.test.ts`, `condonacion-alerta-repetida.test.ts`,
  `condonacion-assistant.test.ts`, `condonacion-override-token.test.ts`,
  `consejo-role-guard.test.ts`, `excepciones-audit-regression.test.ts`,
  `excepciones-conciliacion.test.ts`, `extraordinario.test.ts`,
  `family-ledger.test.ts`, `fiscal-timbrar-tenant.test.ts`,
  `guardian-stripe-transfer.test.ts`, `nit-narrative-insights.test.ts`,
  `pagar-manual.test.ts`, `payment-concurrency.test.ts`,
  `payments-process-role-guard.test.ts`, `planes-pago-hardening.test.ts`,
  `planes-pago.test.ts`, `rpt01-financiero.test.ts`, `rpt03-cobranza.test.ts`,
  `rpt04-admisiones.test.ts`, `rpt05-consejo.test.ts`,
  `rpt07-antiguedad-saldos.test.ts`, `rpt08-riesgo.test.ts`,
  `scholarships-drizzle-real.test.ts`, `school-date.test.ts`,
  `seed-demo-coverage.test.ts`, `state-machines.test.ts`, `stripe-spei.test.ts`,
  `surcharge-application-by-concept.test.ts`, `tenant-http.test.ts`,
  `test-helpers.ts`.

Documentación del punto 2: este reporte, la rectificación de
`docs/REPORTE-BARRIDO-SIMULADOS.md` y la lección de clasificación en
`.agents/memory/audit-protocol.md`.

### Búsqueda y excepciones legítimas

```sh
rg -n 'toISOString\(\)\.(split\("T"\)\[0\]|slice\(0, ?10\))|CURRENT_DATE|NOW\(\)::date' server/tests e2e
```

Quedan solamente dos serializaciones de valores DATE persistidos, no de «hoy»:
- `server/tests/caja-cierre-dia.test.ts:128`: representación del DATE recuperado
  del cierre, que ya es una fecha de calendario; no convertirlo otra vez de zona.
- `e2e/22-cuentas-cobrar-persistencia.spec.ts:98`: comprobación de la fecha
  fija persistida `2026-12-15`.

La búsqueda de cálculos UTC de «hoy» y de SQL `CURRENT_DATE`/`NOW()::date`
ejecutables da cero. También se conservan estos usos legítimos de ISO completo:
- `server/tests/import-becas-real-db.test.ts:228–229`: fechas fijas importadas
  `2026-08-01` y `2027-07-31`, no reloj actual.
- `server/tests/import-audit-log.test.ts:147,175,203`: instantes de auditoría
  con hora; no son fechas escolares.

Una búsqueda más amplia de cualquier `.slice(0, 10)` conserva además:
- `server/tests/beca-individual.test.ts:236`: fecha de calendario recibida
  de la API, comparada con la fecha esperada calculada con `schoolDate`.
- `server/tests/caja-cierre-dia.test.ts:129`: rama string del mismo DATE
  persistido descrito arriba.
- `server/tests/surcharge-monthly-accrual.test.ts:104`: mes persistido,
  no reloj actual.
- `e2e/27-cargos-emision-persistencia.spec.ts:168`,
  `e2e/28-asignacion-precios-real.spec.ts:174` y
  `e2e/30-calendario-vencimientos-periodicidad.spec.ts:107`: comparación de
  fechas persistidas contra el vencimiento esperado, no cálculo de «hoy».
- `server/tests/helpers/stripe-review-fixtures.ts:8`: recorte de un UUID,
  sin relación con fechas.

Las fechas de calendario empleadas para sumar un año o construir límites
mensuales se anclan al mediodía UTC antes de convertirlas a la zona escolar;
así no se interpreta una medianoche UTC como el día escolar anterior.

## MIGRACIONES

Ninguna generada ni aplicada. Sin cambios en `.replit`, dependencias,
secretos, versión de Node, workflows ni `NEON_DATABASE_URL`.

## PRUEBAS

Regresiones aisladas:
```text
 Test Files  1 passed (1)
      Tests  96 passed (96)
   Start at  00:47:44
   Duration  9.69s
```
Hora de Ciudad de México: `2026-10-28 18:47:44 CST`.

Seguridad completa, `npm run test:safety`:
```text
 Test Files  8 passed (8)
      Tests  367 passed (367)
   Start at  00:51:55
   Duration  16.73s (transform 3.83s, setup 0ms, import 2.62s, tests 9.49s, environment 1ms)
```
Hora de Ciudad de México: `2026-10-28 18:51:55 CST`.

Reinicio real previo a unitarias:
```text
2026-10-29T00:52:20.714Z [audit-retry] info: audit_retry worker iniciado (intervalo: 30s, max_attempts: 3)
12:52:20 AM [express] serving on port 5000
```
Equivale a `2026-10-28 18:52:20 CST`.

`npm run test:unit`, inicio local `2026-10-28 18:52:34 CST`,
fin local `2026-10-28 18:54:37 CST`:

```text
 Test Files  142 passed | 1 skipped (143)
      Tests  1360 passed | 1 skipped (1361)
   Start at  00:52:34
   Duration  122.80s (transform 2.67s, setup 19.28s, import 24.88s, tests 60.32s, environment 11ms)
```

Cero fallos. A-3, CON-04b, CON-08, AGS-07 y AGS-08 forman parte de esta
suite aprobada. La corrida completa ocurrió entre las 18:00 y las 24:00
de Ciudad de México, con el reloj real; no se cambió la hora del sistema.
La prueba omitida ya estaba omitida; no se agregó ninguna omisión.
`TZ=America/Mexico_City` se aplicó solamente al comando `date` que imprime
los horarios, no al proceso de npm, al servidor ni a las suites.

Reinicio real previo a E2E:
```text
2026-10-29T00:55:34.083Z [audit-retry] info: audit_retry worker iniciado (intervalo: 30s, max_attempts: 3)
12:55:34 AM [express] serving on port 5000
```
Equivale a `2026-10-28 18:55:34 CST`.

`npm run test:e2e`, inicio local `2026-10-28 18:55:54 CST`,
fin local `2026-10-28 19:01:26 CST`:
```text
Running 100 tests using 1 worker
  100 passed (5.5m)
```
Cero fallos y ninguna omisión. El servidor se detuvo después de la corrida;
se conserva el workflow configurado. Se verificará además que no quede
ningún listener en el puerto 5000 antes del commit y del push.

Verificaciones adicionales:
- `npm run build`: aprobado.
- `npm run check:routes`: aprobado.
- `npm run check:migration-policy`: aprobado; no ejecuta migraciones.
- `npm run check`: salida 2, 24 diagnósticos. Se compararon los mensajes
  completos, normalizando sólo posiciones de línea/columna, con la salida
  registrada del mismo comando sobre `506d472`: son idénticos.

En el archivo de app modificado, `server/routes/conciliacion.ts`, se conservan
estos siete diagnósticos ya presentes en esa base, ajenos a las dos lecturas:
- Líneas 64, 126 y 176: TS2802, iteración de Set/Map con target ES inferior.
- Líneas 201, 202 y 208: TS18046, valores `unknown`.
- Línea 209: TS2322, `unknown` no asignable a `number`.
No se introdujo un diagnóstico nuevo ni se presenta TypeScript global
como aprobado.

Logs de esta ronda conservados en el directorio ignorado
`generated-artifacts/barrido-correcciones/`.

## CONSULTAS A LA BASE

Antes del arranque y de las suites con escrituras, sólo SELECT:

```sql
SELECT current_database() AS database_name
```
Resultado: `heliumdb`.

```sql
SELECT shobj_description(oid, 'pg_database') AS environment_marker FROM pg_database WHERE datname = current_database()
```
Resultado: `edupay:test`.

```sql
SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position
```
Resultado: 772 columnas recuperadas para verificar el catálogo existente.
No se añadieron columnas ni se alteraron los esquemas.

## DOCUMENTACIÓN EXTERNA CONSULTADA

No aplica: se utilizan el calendario y protocolos existentes del proyecto;
no se implementan integraciones externas.

## LO QUE NO PUDE VERIFICAR

Todo el alcance de las correcciones se verificó con seguridad, unitarias,
navegador y búsqueda estática. La pantalla pública también se capturó sin
un fallo manifiesto de renderizado. No se probaron servicios externos reales.
TypeScript global no está aprobado: conserva los 24 diagnósticos comparados
contra la base, incluidos los siete del archivo modificado indicados arriba.

## HALLAZGOS FUERA DE ALCANCE (NO CORREGIDOS)

No se cambian reglas de negocio ni se intenta corregir las operaciones
de mantenimiento o los demás hallazgos históricos del barrido.

## RAMA

`barrido-simulados`; no se integra en `replit-en-vivo`.
Un commit por punto, ambos con `[skip ci]`.

## COMMIT

El primer commit es `f951c5f`. El segundo incluye este documento.
El hash final y su coincidencia con `git ls-remote` se registran en el
reporte del hilo después del push, sin generar un tercer commit.
