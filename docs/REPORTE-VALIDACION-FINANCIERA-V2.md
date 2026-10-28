# RESUMEN

Rama de revisión desde `58b56c6`. Validación financiera compartida, antes de
las consultas de autenticación y de los handlers, sin cambiar la identidad
del tenant ni del campus que resuelve el servidor.

- Pesos en texto o número convertidos por partes enteras a centavos, sin
  `parseFloat` ni multiplicar un importe decimal por 100.
- Una constante de máximo: `MAX_MONTO_CENTAVOS = 50_000_000`.
  Cargos y pagos positivos; el enganche puede ser cero.
- Porcentajes de 0 a 100, máximo dos decimales. Excepción autorizada:
  beneficios de tipos de beca enteros, sin redondeo y sin migración.
  Segunda excepción autorizada: reglas automáticas mayores que cero y hasta
  100, con dos decimales, para respetar su CHECK existente sin migración.
- Fechas reales ISO y vencimiento no anterior a emisión.
- Identificadores enteros positivos compatibles con las claves `integer`
  de PostgreSQL (hasta 2,147,483,647).
- Convenios de 3 a 6 cuotas mensuales, suma exacta con enganche y residuo
  solamente en la última cuota. Diálogo de reestructuración desplazable
  cuando la lista de cargos excede la pantalla.
- Importaciones financieras inválidas rechazadas antes de escribir. El
  preflight no sustituye el parser histórico de los campos no financieros.
  La prueba bancaria verifica rechazo completo y reintento con CSV corregido,
  no presenta una importación inválida como parcialmente exitosa.

El **inventario completo, con 70 entradas, archivo, línea de la base y
validación anterior**, forma parte de este reporte:
[Inventario de entradas financieras](INVENTARIO-ENTRADAS-FINANCIERAS.md).
Incluye importaciones, configuración, reportes y aliases retirados. Los
webhooks firmados y sus payloads originales no se reinterpretan como
formularios administrativos.

# ARCHIVOS MODIFICADOS

## Implementación

| Archivo | Cambio |
|---|---|
| `server/lib/financial-input.ts` | Conversiones exactas, límites, porcentajes, excepción entera, fechas, IDs y distribución mensual. |
| `server/lib/financial-request-validation.ts` | Contratos de entradas y guard previo a SQL, sin reescribir solicitudes válidas. |
| `server/lib/financial-import.ts` | Preflight de archivos, fechas reales y valores de adeudos/becas/familias. |
| `server/lib/financial-bank-import.ts` | Preflight de PDF bancario y valores de sus movimientos. |
| `server/lib/surcharge-calculator.ts` | Porcentaje base cero dentro del intervalo autorizado. |
| `server/routes.ts` | Instalación del guard antes de autenticación que consulta la base. |
| `server/routes/admin.ts` | Porcentaje cero y excepción entera de tipos de beca. |
| `server/routes/charges.ts` | Conversión compartida de importes en pesos. |
| `server/routes/conciliacion.ts` | Centavos exactos y validación del PDF antes de SQL. |
| `server/routes/guardian.ts` | Conversión exacta de recargos y rango porcentual inclusivo. |
| `server/routes/misc.ts` | Convenios, distribución exacta y vencimientos por mes calendario. |
| `server/routes/payments.ts` | Preflight de archivos y validadores compartidos sin cambiar otros campos importados. |
| `client/src/pages/planes-pago.tsx` | Opciones 3–6, frecuencia mensual, enganche validado, mensaje explicativo y diálogo desplazable. |

## Pruebas y documentación

- `server/safety-tests/financial-input.test.ts`
- `server/safety-tests/financial-routes.test.ts`
- `server/tests/beca-individual.test.ts`
- `server/tests/becas-auto-reglas-alias-guard.test.ts`
- `server/tests/caja-onerror.test.ts`
- `server/tests/charges-create-update-role-guard.test.ts`
- `server/tests/concepts-payment-config-guard.test.ts`
- `server/tests/custom-permissions-e2e.test.ts`
- `server/tests/extraordinario.test.ts`
- `server/tests/import-becas-real-db.test.ts`
- `server/tests/importar-pdf.test.ts`
- `server/tests/planes-pago-hardening.test.ts`
- `server/tests/planes-pago.test.ts`
- `server/tests/tenant-http.test.ts`
- `server/tests/wizard-import-steps.test.ts`
- `e2e/25-caja-conciliacion-bancaria.spec.ts`
- `e2e/27-planes-pago-flujos-completos.spec.ts`
- `docs/INVENTARIO-ENTRADAS-FINANCIERAS.md`
- `docs/REPORTE-VALIDACION-FINANCIERA-V2.md`
- `.agents/memory/MEMORY.md`
- `.agents/memory/financial-input-policy.md`

# MIGRACIONES

Ninguna generada ni aplicada. No se ejecutó `db:migrate`, instalación de
dependencias, `Apply changes` ni publicación. No se modificó
`NEON_DATABASE_URL`, `.replit`, paquetes ni configuración de workflows.

# PRUEBAS

Los logs completos quedan en el directorio ignorado
`generated-artifacts/validacion-financiera-v2/`, sin incorporarlos a Git.

`npm run test:safety`:

```text
 Test Files  7 passed (7)
      Tests  275 passed (275)
   Start at  23:24:03
   Duration  4.50s (transform 1.40s, setup 0ms, import 848ms, tests 2.74s, environment 1ms)
```

`npm run test:unit`:

```text
 Test Files  142 passed | 1 skipped (143)
      Tests  1360 passed | 1 skipped (1361)
   Start at  23:27:53
   Duration  113.86s (transform 2.46s, setup 18.01s, import 22.63s, tests 55.82s, environment 11ms)
```

La prueba omitida es `server/tests/e2e-pay-01-stripe-connect.test.ts`,
condicionada a `RUN_STRIPE_E2E=1`; no se habilitó ni se cuenta como aprobada.
El nuevo test conserva el
HTTP 200 del contrato existente al crear reglas automáticas, en vez de
cambiar la API para devolver 201.

`npm run build`, `npm run check:routes` y
`npm run check:migration-policy`: código de salida 0.
`npm run check`: código 2, comparado abajo con la base.

`npm run test:e2e -- --trace=retain-on-failure`, inicio del comando
`2026-10-28T23:30:13Z`:

```text
  94 passed (6.0m)
```

PPX-01 (6 cuotas), PPX-02 (3 cuotas), PPX-06 (rechazo de 7) y EM-02
se ejecutaron y aprobaron; no hubo pruebas de navegador omitidas.
Las tres suites solicitadas terminaron sin fallos.

Al finalizar se detuvo el workflow sin modificar su configuración.
Verificación de cierre a `2026-10-28T23:37:59Z`:

```text
Escuchas en puerto 5000: []
```

Tampoco quedó ningún proceso `tsx server/index.ts`. Las dos capturas
generadas por pruebas anteriores se conservaron en el directorio ignorado
de evidencias y se restauraron en Git; no forman parte del cambio.

Reinicios reales del servidor antes de las suites finales, en UTC:

```text
2026-10-28T23:27:44.454Z [audit-retry] info: audit_retry worker iniciado (intervalo: 30s, max_attempts: 3)
11:27:44 PM [express] serving on port 5000
2026-10-28T23:30:05.284Z [audit-retry] info: audit_retry worker iniciado (intervalo: 30s, max_attempts: 3)
11:30:05 PM [express] serving on port 5000
```

El fallo de la prueba de cero motivó la segunda excepción autorizada.
Cero y 100.01 ahora se rechazan antes de SQL; 0.01 y 100 se aceptan y
se verifica su persistencia. No se cambiaron restricciones de la base.

## Cobertura añadida

- 54 casos del módulo puro: entradas negativas/no numéricas/vacías/nulas,
  NaN, exceso de decimales, 0.29→29, 0.1→10, límite y límite+1, porcentaje
  100.01, febrero 30, cuotas 2/7 rechazadas y 3/6 válidas, residuo exacto.
- Beneficio de tipo de beca 12.50 rechazado con mensaje de entero y 25
  aceptado, incluyendo comprobación HTTP y persistencia.
- Guard montado con los registradores reales y pool simulado: cada contrato
  debe corresponder a una ruta realmente registrada; entradas inválidas dan
  400 con cero llamadas SQL. Las solicitudes válidas llegan intactas al
  siguiente middleware. Esta última comprobación es del guard, no una
  afirmación de persistencia individual en cada endpoint.
- Archivos inválidos y PDF con parser simulado sin conexión real.
- Recargo mensual cero: aceptación y persistencia con fixtures.
- Reglas automáticas: 0 y 100.01 rechazados con 400 y cero consultas SQL;
  0.01 y 100 aceptados y persistidos en las pruebas de integración.
- Navegador: convenio de 6 cuotas y reestructuración de 3, cargos persistidos,
  recarga y rechazo de 7 con mensaje visible y sin nuevos planes ni cargos.
- CSV bancario inválido: 400 y conteo de movimientos sin cambios; CSV
  corregido: importado y duplicado contados con datos persistidos.

Las pruebas anteriores de permisos mantienen su propósito con cuerpos
sintácticamente válidos. Las pruebas anteriores de dos cuotas, fechas
estáticas o errores 500 ante importes inválidos se ajustaron a las reglas
solicitadas; no se cambiaron las reglas de pertenencia ni las aserciones del
ledger para hacerlas pasar.

## TypeScript contra la base

`npm run check` se ejecutó también en una copia temporal de `58b56c6`,
con las mismas dependencias. Base: **24 diagnósticos**; rama: **24**;
comparación de mensajes normalizados sin números de línea: **cero nuevos**.
El comando sigue saliendo con código 2: no se declara aprobado.

En los archivos de implementación modificados persisten estos diez
diagnósticos, comprobados en ambas versiones:

| Archivo | Línea base → rama | Código y mensaje |
|---|---|---|
| `server/routes/conciliacion.ts` | 62 → 64 | TS2802: iterar `Set<string>` requiere downlevelIteration o target ES2015+. |
| mismo | 124 → 126 | TS2802: iterar `Set<number>` requiere downlevelIteration o target ES2015+. |
| mismo | 174 → 176 | TS2802: iterar `Map<number, { id; monto_neto; family_id }[]>` requiere downlevelIteration o target ES2015+. |
| mismo | 199 → 201 | TS18046: `'c' is of type 'unknown'`. |
| mismo | 200 → 202 | TS18046: `'suma' is of type 'unknown'`. |
| mismo | 206 → 208 | TS18046: `'c' is of type 'unknown'`. |
| mismo | 207 → 209 | TS2322: `Type 'unknown' is not assignable to type 'number'`. |
| `server/routes/misc.ts` | 263 → 256 | TS2802: iterar `Set<any>` requiere downlevelIteration o target ES2015+. |
| mismo | 1126 → 1122 | TS2802: iterar `Set<string>` requiere downlevelIteration o target ES2015+. |
| `server/routes/payments.ts` | 1049 → 1051 | TS2802: iterar `Map<string, any[]>` requiere downlevelIteration o target ES2015+. |

# CONSULTAS A LA BASE

Diagnóstico manual de solo lectura. Las siguientes son las consultas
completas, no abreviaciones. Las escrituras de fixtures pertenecen a las
suites autorizadas y sus preparaciones/teardowns, no a correcciones manuales.

```sql
SELECT current_database() AS database_name;
```

Resultado: `heliumdb`.

```sql
SELECT shobj_description(oid, 'pg_database') AS environment_marker
FROM pg_database
WHERE datname = current_database();
```

Resultado: `edupay:test`. Es el SQL de `DATABASE_MARKER_SQL`.

```sql
SELECT table_name, column_name, data_type, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (column_name LIKE '%porcentaje%' OR column_name = 'beca_aplicada')
ORDER BY table_name, column_name;
```

Resultado:

| Tabla.columna | Tipo | Precisión, escala |
|---|---|---|
| `charges.beca_aplicada` | numeric | 5, 2 |
| `payment_surcharge_rules.incremento_mensual_porcentaje` | numeric | 5, 2 |
| `payment_surcharge_rules.porcentaje` | numeric | 5, 2 |
| `scholarship_auto_assignments.porcentaje_aplicado` | numeric | 5, 2 |
| `scholarship_auto_assignments.porcentaje_manual` | numeric | 5, 2 |
| `scholarship_auto_rules.descuento_porcentaje` | numeric | 5, 2 |
| `scholarship_benefits.porcentaje_descuento` | integer | 32, 0 |
| `scholarships.porcentaje` | numeric | 5, 2 |
| `student_guardian.porcentaje_responsabilidad` | numeric | 5, 2 |

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN
    ('payment_plans','charges','payments','audit_log','concepts',
     'students','campuses','users')
ORDER BY table_name, ordinal_position;
```

Resultado: **124 columnas** verificadas: audit_log 12, campuses 8, charges 18,
concepts 10, payment_plans 16, payments 12, students 30 y users 18.
La salida completa de metadatos está en `database-preflight.log`.

Consulta adicional, ejecutada después del fallo de porcentaje cero:

```sql
SELECT c.conname, pg_get_constraintdef(c.oid) AS definition, c.convalidated
FROM pg_constraint c
JOIN pg_class t ON t.oid=c.conrelid
JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'scholarship_auto_rules'
  AND c.contype = 'c'
ORDER BY c.conname;
```

Resultado: cinco CHECKs (ciclo, fechas, destino, porcentaje y tipo), todos
NOT VALID. `scholarship_auto_rules_percentage_check` exige
`descuento_porcentaje > 0 AND descuento_porcentaje <= 100`.
NOT VALID no exime las escrituras nuevas. El resultado completo está en
`automatic-scholarship-constraint.log`. Se volvieron a ejecutar las dos
primeras consultas: `heliumdb`, marcador `edupay:test`.

# DOCUMENTACIÓN EXTERNA CONSULTADA

Ninguna. Se consultaron el protocolo del proyecto, su documentación local,
el esquema real y los contratos existentes. No se añadió ni cambió un SDK
de proveedor.

# LO QUE NO PUDE VERIFICAR

- No se realizó ningún cobro real ni se verificó un despliegue publicado.
- La integración real Stripe Connect quedó omitida por su condición
  `RUN_STRIPE_E2E`; no se verificó como parte de esta entrega.
- La captura anónima mostró el acceso administrativo; no se retiró
  autenticación para inspeccionar pantallas protegidas. Los flujos de
  convenios autenticados se verifican mediante Playwright.
- `npm run check` no queda verde: conserva los 24 errores comprobados
  también en la base.

# HALLAZGOS FUERA DE ALCANCE (NO CORREGIDOS)

- Diagnósticos TypeScript anteriores descritos arriba.
- La captura de desarrollo registró un handshake WebSocket de Vite con
  HTTP 400. La página de acceso se renderizó; no se investigó ni se
  clasificó su antigüedad.

# RAMA

`validacion-financiera-v2`, desde `58b56c6`. Sin integración a
`replit-en-vivo`. No se trajeron otros archivos de la rama anterior.
Commits de implementación y pruebas, todos con `[skip ci]`:

- `6adcbd6`: inventario.
- `8995614`: módulo puro.
- `7202c31`: integración en rutas, importaciones y pantalla.
- `e93b077`: pruebas.
- El último commit incorpora este reporte y las decisiones documentadas.

# COMMIT

El hash final y su comparación con `git ls-remote github
refs/heads/validacion-financiera-v2` se entregan en el cierre del hilo,
después de crear el commit de este reporte.
