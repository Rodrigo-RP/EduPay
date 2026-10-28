# Pagos sin simulación

## RESUMEN

- Parte A: avance directo de `quitar-exitos-simulados` a `replit-en-vivo`, verificado en `0d2d7edbf64eadaf4e4e36b9ea61cc13af60e05a`.
- Parte B: rama independiente `pagos-sin-simulacion`, desde esa base. No integrada a `replit-en-vivo`.
- Los endpoints heredados de pago conservan autenticación de tutor y responden 501 `NO_DISPONIBLE`, sin ejecutar SQL en sus handlers.
- El pago de tarjeta del tutor requiere método de pago y Connect activo del campus/tenant. Su ausencia devuelve 422, sin escrituras.
- Sólo `succeeded` permite liquidar. Otros estados devuelven 202 con el estado real, sin pagos, aplicaciones, eventos ni facturas locales.
- La respuesta inmediata y el webhook firmado utilizan la misma liquidación. Se eliminaron la referencia simulada, el CFDI ficticio y los intentos de cancelar un PI ya confirmado.

## ARCHIVOS MODIFICADOS

| Archivo | Cambio |
|---|---|
| `server/routes/payments.ts` | Retira ambos handlers de pago sin proveedor. |
| `server/routes/unavailable-payments.ts` | Registro autenticado de respuestas 501, sin acceso a DB. |
| `server/routes/guardian.ts` | Guardas, SDK con clave idempotente, estados reales y liquidación compartida; sin simulación ni CFDI inventado. |
| `server/lib/stripe-card-settlement.ts` | Confirma importe, moneda, destino, tenant, campus y vínculo del tutor; transacción y deduplicación por PI. |
| `server/lib/stripe-spei-settlement.ts` | Entrada común; conserva la liquidación SPEI existente. |
| `server/routes/campus-payment.ts` | Despacha tarjetas y SPEI desde el webhook con firma verificada; lookup de Connect acotado al tenant para tarjetas. |
| `client/src/pages/checkout.tsx` | Elimina captura de PAN/CVV y endpoint antiguo; enlaza al portal real, preseleccionando el cargo. Sin clave pública, deshabilita tarjeta con el mensaje requerido. |
| `client/src/pages/portal-padres-3clics.tsx` | Preselección validada, pantalla pendiente y éxito sólo con pagos confirmados; sin promesas de emitir o enviar CFDI. |
| `shared/payment-confirmation.ts` | Predicado explícito para permitir la pantalla de éxito. |
| `server/safety-tests/unavailable-payments.test.ts` | Autenticación, 501, cero SQL y rechazo de falsas confirmaciones de UI. |
| `server/tests/guardian-stripe-transfer.test.ts` | SDK simulado, DB real de pruebas y HMAC local; confirmación, pendientes, duplicados, concurrencia y aislamiento. |
| `server/tests/payment-concurrency.test.ts` | Sustituye expectativas de pagos ficticios; mantiene intactas las pruebas de efectivo y captura manual. |
| `server/tests/tenant-http.test.ts` | Contratos 422/501 e IDOR preservado con un método ficticio que nunca alcanza Stripe. |
| `e2e/14-portal-padres-pago-completo.spec.ts` | Reemplaza cobros reales por comprobación de rechazo y ausencia de modificaciones financieras. Reutiliza la constante de acceso existente. |
| Este informe | Evidencia y límites de verificación. |

Existe flujo real de Stripe Elements en el portal. Se eligió reutilizarlo, no crear otro formulario ni enviar datos de tarjeta al endpoint retirado. `payment-modal.tsx` continúa delegando en `checkout.tsx` y no necesita cambios.

## MIGRACIONES

Ninguna generada ni aplicada. La base ya tiene:

```sql
CREATE UNIQUE INDEX uq_payment_events_provider
ON public.payment_events USING btree (provider, provider_event_id);
```

La sentencia anterior es la definición devuelta por `pg_indexes`, **no una sentencia ejecutada**.

Para tarjeta, la entrada canónica usa `provider='stripe'` y `provider_event_id=pi.id`. Así, `evt_...` diferentes y la respuesta inmediata comparten una clave única respaldada por PostgreSQL. El recibo, el pago, su aplicación y el estado del cargo se confirman en una sola transacción. El bloqueo del cargo serializa las confirmaciones concurrentes. Un reintento valida y reutiliza el pago confirmado.

No se impone unicidad global a `payments.referencia_pasarela`: SPEI puede aplicar un mismo PI a varios cargos. Su flujo y su deduplicación existentes se conservan.

## PRUEBAS

### Cambios de expectativas

| Prueba | Antes | Ahora |
|---|---|---|
| Guardian T1 | Sin Connect acreditaba y guardaba `sim_...`. | 422, cero escrituras y cero llamadas al SDK. |
| Guardian T2 | Confirmaba referencia y cargo pagado. | Conserva lo anterior con PI completo; verifica una aplicación y ninguna factura ficticia. |
| Guardian T3 | Exponía el detalle interno del error de Stripe. | 402 sin detalle interno; cargo pendiente y sin pagos. |
| PC-01 | Sin método de Stripe esperaba pago y aplicación. | 422, ningún pago/aplicación y cargo pendiente. |
| PC-02 | Dos solicitudes sin método producían 200/409 y un pago. | Dos 422 y cero acreditaciones. |
| PC-03 | Reintento después del pago ficticio esperaba 409. | Reintento sin método sigue en 422, sin pago. |
| PC-04 | El pago ficticio reducía el estado de cuenta. | El saldo y lo aplicado al cargo permanecen sin cambios. |
| PC-05 | Endpoint heredado producía 200/409 y un pago. | Dos 501 y cero pagos/aplicaciones. |
| Tenant T3 | Probaba IDOR sin método de pago. | Incluye método ficticio y sigue en 403 antes de alcanzar Stripe. |
| Tenant T4 | Aceptaba cualquier respuesta menor a 500 excepto 403. | Exige 422 sin método Stripe; ya no lo llama pago exitoso. |
| Tenant T5/T6 | Esperaban 403 en endpoints heredados. | Tutor autenticado recibe 501; autenticación se conserva. |
| PP-01 | Tokenizaba tarjeta y esperaba pago exitoso, folio de pago y saldo reducido. | No tokeniza ni cobra; exige 422 y compara DB/dashboard antes y después, sin éxito en pantalla. |
| PP-02 | Doble clic esperaba un pago. | Dos reintentos sin método dan 422 y no modifican DB ni historial. |

Los casos positivos con proveedor simulado cubren:

- `succeeded`: un pago, una aplicación y cargo pagado.
- `requires_action` y `processing`: cero escrituras; webhook posterior liquida una vez.
- Mismo webhook repetido y eventos distintos del mismo PI: una sola acreditación.
- Respuesta inmediata más webhooks concurrentes: un pago.
- Dos solicitudes HTTP concurrentes: misma clave idempotente y un pago.
- Webhook que llega antes de la respuesta del SDK: mismo pago, sin duplicados.
- Firma HMAC inválida y tenant incorrecto: sin acreditación.

El SDK de creación de PI está inyectado y simulado. La comprobación HMAC usa el SDK local y una clave efímera generada para la prueba. No requiere red de Stripe. `RUN_STRIPE_E2E=0` deshabilita explícitamente el smoke que sí usa el proveedor. Los dos E2E del portal bloquean su API en el navegador y no ingresan tarjetas.

### Safety

Horas de Safety y unitarias: 27 de octubre de 2026, UTC. Las pruebas E2E y sus comparaciones ocurrieron el 28 de octubre, UTC; en Ciudad de México seguía siendo 27 de octubre.

Arranque real:

```text
11:50:53 PM [express] serving on port 5000
```

Comando: `APP_ENV=development RUN_STRIPE_E2E=0 npm run test:safety`

```text
 Test Files  5 passed (5)
      Tests  71 passed (71)
   Start at  23:51:15
   Duration  9.51s (transform 1.85s, setup 0ms, import 4.46s, tests 937ms, environment 1ms)
```

### Unitarias

La primera corrida detectó dos fallos SPEI en el despachador compartido:

```text
 Test Files  1 failed | 139 passed | 1 skipped (141)
      Tests  2 failed | 1338 passed | 1 skipped (1341)
   Start at  23:51:47
   Duration  131.75s (transform 3.26s, setup 20.77s, import 26.86s, tests 63.31s, environment 13ms)
```

Se corrigió el despachador para no añadir a SPEI la guarda nueva de tarjeta. No se modificaron sus pruebas ni su liquidación.

Arranque real de la repetición:

```text
11:56:51 PM [express] serving on port 5000
```

Comando: `APP_ENV=development RUN_STRIPE_E2E=0 npm run test:unit`

```text
 Test Files  140 passed | 1 skipped (141)
      Tests  1340 passed | 1 skipped (1341)
   Start at  23:57:01
   Duration  129.03s (transform 2.65s, setup 20.85s, import 25.88s, tests 62.28s, environment 13ms)
```

La única omitida es E2E-PAY-01, la integración real con Stripe, excluida deliberadamente por la prohibición de llamadas al proveedor.

### E2E

Arranque real:

```text
12:00:42 AM [express] serving on port 5000
```

Comando: `APP_ENV=development RUN_STRIPE_E2E=0 npm run test:e2e -- --trace=retain-on-failure`

```text
  1 failed
    [chromium] › e2e/24-caja-efectivo-cierre.spec.ts:136:3
    › Caja — efectivo y cierre con persistencia
    › CE-01: efectivo por UI persiste pago, aplicación, cargo y lista tras recarga
  1 did not run
  90 passed (6.5m)
```

32 archivos. Inicio: `2026-10-28T00:00:54.568Z`; duración JSON: `389438.575 ms`. Sin reintentos que oculten fallos. PP-01 y PP-02 aprobaron. CE-02 quedó sin ejecutar por la interrupción de su grupo serial después de CE-01.

**Fallo de Caja reproducido en la base, no corregido:**

- Definición: `e2e/24-caja-efectivo-cierre.spec.ts:136`; aserción: línea 191.
- Error: `expect(locator).toBeVisible() failed`, `getByText('Alumno E2E Caja <timestamp>', { exact: true })`, `element(s) not found`, timeout de 5000 ms.
- URL al fallar: `/caja-conciliacion`.
- Pantalla: `0 pagos confirmados` y `No hay pagos en efectivo confirmados para este día.`
- `POST /api/caja/pago-efectivo`: 200.
- `GET /api/caja/pagos-efectivo?fecha=2026-10-27`: 200, incluso después de recargar. No se confundió el fallo de la lista con un fallo HTTP del cobro.
- La traza y captura del fallo completo están en `generated-artifacts/pagos-sin-simulacion/caja-full/`.

Se detuvo la app y se verificó la misma prueba, con el mismo comando, primero en esta rama y luego en checkout temporal separado de las referencias de rama, en `0d2d7ed`:

```sh
APP_ENV=development RUN_STRIPE_E2E=0 npm run test:e2e -- e2e/24-caja-efectivo-cierre.spec.ts --trace=retain-on-failure
```

| Código servido | Inicio UTC | Duración | Resultado |
|---|---|---|---|
| `pagos-sin-simulacion` | `2026-10-28T00:14:04.746Z` | 50.114 s | CE-01 falla en la misma aserción; CE-02 sin ejecutar |
| `0d2d7ed`, HEAD temporal detached | `2026-10-28T00:15:35.584Z` | 38.055 s | CE-01 falla en la misma aserción; CE-02 sin ejecutar |

Ambos bloques terminan en:

```text
  1 failed
    [chromium] › e2e/24-caja-efectivo-cierre.spec.ts:136:3
    › CE-01: efectivo por UI persiste pago, aplicación, cargo y lista tras recarga
  1 did not run
```

La base también muestra POST y GET 200, el mismo filtro de fecha y la misma lista vacía. La clasificación de preexistente se limita a ese fallo reproducido; su causa no está confirmada. Se restauró `pagos-sin-simulacion` antes de las verificaciones finales. No se modificaron Caja, su prueba ni las referencias de `replit-en-vivo`. No se ejecutó el E2E antiguo del portal contra la base, ya que realizaba operaciones reales con Stripe.

Después de retirar también los mensajes que prometían un CFDI, se repitió el archivo del portal contra la versión final:

```text
Running 2 tests using 1 worker

  ✓  PP-01: sin método Stripe no hay éxito, factura ni reducción del saldo (13.3s)
  ✓  PP-02: dos reintentos sin método Stripe dan 422 y cero acreditaciones (11.1s)

  2 passed (33.1s)
```

Inicio: `2026-10-28T00:18:36.688Z`; duración JSON: `33114.340 ms`. La suite completa no se volvió a ejecutar tras esos cambios de texto y tipo nullable de CFDI; se verificaron el archivo afectado, build y tipos.

### Otras verificaciones

- `npm run build`: aprobado sobre la versión final; cliente en 32.15 s y servidor en 123 ms.
- `npm run check:routes`: aprobado.
- `npm run check:migration-policy`: aprobado.
- `npm run check`: 24 diagnósticos. Se reprodujeron los mismos 24 con el mismo comando sobre una copia temporal de `0d2d7ed`, con las mismas dependencias. Comparación por archivo, código y mensaje; se omiten posiciones porque se eliminaron líneas. No se corrigieron tipos ajenos a esta tarea.
- Captura del acceso público: `generated-artifacts/pagos-sin-simulacion/login-final.jpg`. El portal autenticado de selección/rechazo se verificó con Playwright; esta captura no muestra pantallas privadas.
- App detenida al terminar; `lsof -nP -iTCP:5000 -sTCP:LISTEN` sin listener. No quedaron procesos de `server/index.ts` ni workers de auditoría independientes.

## CONSULTAS A LA BASE

Preflight de sólo lectura mediante `pg`, sin importar la inicialización de la aplicación:

```sql
SELECT current_database() AS database_name,
       shobj_description(oid, 'pg_database') AS environment_marker
FROM pg_database
WHERE datname = current_database();
```

Resultado: `heliumdb`, `edupay:test`.

Se verificaron las columnas antes de escribir consultas nuevas:

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('payments','payment_events','charges','students',
                     'student_guardian','campus_payment_config')
ORDER BY table_name, ordinal_position;
```

Se comprobó la garantía única existente:

```sql
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname='public'
  AND tablename IN ('payments','payment_events','payment_applications')
ORDER BY tablename,indexname;
```

Resultados relevantes: `uq_payment_events_provider`, único sobre `(provider, provider_event_id)`; `payments_tenant_referencia_pasarela_uidx`, único parcial sólo para `manual:%`; índices de aplicaciones por pago y cargo.

Las escrituras de verificación pertenecen a las suites autorizadas sobre heliumdb. Los fixtures de tarjeta se eliminan por sus propios identificadores/tenant. No se ejecutó un seed directamente: el E2E conserva su preparación autorizada mediante el seed de la suite. No se cambió `NEON_DATABASE_URL`.

Al finalizar, ya detenida la app, la primera consulta volvió a devolver `heliumdb` / `edupay:test`. También se ejecutó:

```sql
SELECT COUNT(*)::integer AS rows FROM drizzle.__drizzle_migrations;
```

Resultado: `5`. No se ejecutó `db:migrate`, scripts de mantenimiento, `Apply changes` ni publicación.

## DOCUMENTACIÓN EXTERNA CONSULTADA

- https://docs.stripe.com/payments/payment-intents/verifying-status
- https://docs.stripe.com/api/idempotent_requests
- https://docs.stripe.com/webhooks

## LO QUE NO PUDE VERIFICAR

- Cobros, tokenización, cuenta Connect, entrega de webhooks o autenticación 3DS con Stripe real: prohibidos en este encargo.
- El portal distingue los estados pendientes, pero no implementa un nuevo flujo de autenticación 3DS.
- No se timbró ni se generó CFDI: se retiró el documento ficticio de este camino.

## HALLAZGOS FUERA DE ALCANCE (NO CORREGIDOS)

- Los 24 diagnósticos TypeScript reproducidos en la base.
- CE-01 de Caja, reproducido con el mismo comando sobre `0d2d7ed`; CE-02 permanece sin ejecutar. La suite E2E no está completamente aprobada.
- Si cambia el saldo o el alcance después del cobro externo, la liquidación falla y el webhook responde 500 para reintento/revisión. No se acredita un importe distinto ni se improvisa un reembolso. Esa excepción necesita una política de conciliación.
- No se revisaron ni corrigieron pagos históricos sin confirmación de proveedor.

## RAMA

`pagos-sin-simulacion`. No se integra la Parte B ni se publica.

## COMMIT

Un commit por punto de implementación/pruebas, todos con `[skip ci]`; informe en un commit adicional. El hash final y la verificación con `git ls-remote` se reportan en la respuesta de entrega para evitar un hash autorreferente en este archivo.
