# Cobros Stripe por revisar

## Alcance

La bandeja y su contador incluyen eventos Stripe `requires_review`. El payload
guardado puede ser un PaymentIntent o un webhook con `data.object`.
La institución se verifica en el evento, el cargo, el alumno y el campus;
el campus proviene del alumno del cargo, nunca de parámetros del navegador ni
de `metadata.campus_id`. Los payloads malformados o sin atribución comprobable
no se muestran a un campus al que no se puedan atribuir.

Lectura: permiso existente `payments.read`, manteniendo el alcance de roles de
la bandeja. Resolución: `payments.process`. No hay permisos ni roles nuevos.

La resolución manual exige justificación y dos confirmaciones. Se bloquea el
evento, se verifica el cargo y se registra la transición `requires_review` →
`resolved_manual` junto con su auditoría en una transacción. Es una resolución
administrativa, no una aplicación de dinero: no inserta pagos, aplicaciones,
créditos, ni modifica cargos. Si la auditoría falla se revierte la resolución.
La clave única existente `(provider, provider_event_id)` y el lock del evento
permiten un único cambio/auditoría también bajo concurrencia.

## Por qué no se habilita saldo a favor

Existe `family_credits` y el consumidor en `server/routes/admin.ts` reutiliza
`credit.payment_id` al insertar una `payment_application`. La columna
`payment_applications.payment_id` es NOT NULL. Un cobro que no pudo aplicarse
no tiene ese pago: crear solamente un crédito con `payment_id = NULL` lo
mostraría como disponible, pero no permitiría consumirlo.

Falta diseñar y autorizar créditos respaldados directamente por eventos del
proveedor: origen único e idempotente, trazabilidad del cobro, consumo y reversas,
reflejo contable y sus pruebas. No se construye ese mecanismo en esta tarea,
no se crea un pago artificial y no se ofrece un botón de crédito inoperante.

## Diagnóstico previo (solo SELECT)

```sql
SELECT current_database() AS db, shobj_description(oid,'pg_database') AS marker
FROM pg_database WHERE datname=current_database();

SELECT table_name,column_name,data_type,is_nullable,column_default
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('payment_events','family_credits','audit_log','charges','students','campuses')
ORDER BY table_name,ordinal_position;

SELECT tablename,indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename IN ('payment_events','family_credits');

SELECT conrelid::regclass AS tabla,pg_get_constraintdef(oid) AS restriccion
FROM pg_constraint
WHERE conrelid IN ('payment_events'::regclass,'family_credits'::regclass);

SELECT table_name,column_name,data_type
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('bank_transactions','concepts','family_students')
  AND column_name IN ('id','tenant_id','campus_id','nombre','student_id','family_id')
ORDER BY table_name,column_name;

SELECT column_name,data_type,is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='payment_applications'
  AND column_name='payment_id';
```

Resultados: `heliumdb`, marcador `edupay:test`; `payload` es texto;
`payment_events.created_at` es timestamp sin zona; índices únicos por id y
por proveedor/evento; `family_credits.payment_id` permite NULL pero
`payment_applications.payment_id` no. No se ejecutaron migraciones.

Documentación oficial consultada: objeto PaymentIntent de Stripe,
https://docs.stripe.com/api/payment_intents/object (2026-10-28).
La lectura directa mostró hCaptcha; se contrastaron los resultados indexados
de esa misma referencia para `metadata`, `amount_received` y `status`.
No se utilizan SDK, API de cobros ni llamadas de reembolso en estos cambios.

## Verificación — 2026-10-28 (UTC)

Comandos con `APP_ENV=development RUN_STRIPE_E2E=0`. Base verificada:
`heliumdb`, marcador `edupay:test`. No se ejecutaron seeds ni migraciones
directamente. Las escrituras de prueba usan fixtures propios y teardown.

### Seguridad

Arranque real: `9:09:19 PM [express] serving on port 5000`.
Comando: `npm run test:safety`.

```text
 Test Files  5 passed (5)
      Tests  71 passed (71)
   Start at  21:09:30
   Duration  4.67s (transform 742ms, setup 0ms, import 2.14s, tests 363ms, environment 0ms)
```

### Unitarias completas

Arranque real: `9:09:57 PM [express] serving on port 5000`.
Comando: `npm run test:unit`.

```text
 Test Files  142 passed | 1 skipped (143)
      Tests  1357 passed | 1 skipped (1358)
   Start at  21:10:05
   Duration  152.46s (transform 5.44s, setup 20.38s, import 29.76s, tests 81.53s, environment 12ms)
```

Son seis pruebas nuevas respecto a la base. Comprueban datos y contador,
tenant/campus, permisos, payload inválido, justificación, dos confirmaciones,
reintentos y concurrencia, una auditoría y rollback ante fallo de auditoría.
Los snapshots verifican que cargos, pagos, aplicaciones y créditos no cambian.

### E2E completa

Arranque real: `9:15:10 PM [express] serving on port 5000`.
Comando: `npm run test:e2e -- --trace=retain-on-failure`.
Inicio JSON: `2026-10-28T21:15:22.993Z`; duración: `349142.146 ms`.

```text
Running 93 tests using 1 worker
93 passed (5.8m)
```

Incluye SR-01, nuevo flujo UI → API → base → recarga. Cero omitidas/fallidas.

Después se alineó el resumen administrativo con el contador unificado,
evitando mostrar el contador bancario antiguo como si incluyera Stripe.
Se verificaron nuevamente las pantallas afectadas, sin cambiar el backend:

- Arranque: `9:24:09 PM [express] serving on port 5000`.
- Comando: `npm run test:e2e -- e2e/02-dashboard.spec.ts e2e/33-stripe-review.spec.ts --trace=retain-on-failure`.
- Inicio: `2026-10-28T21:24:22.863Z`; duración: `54929.809 ms`.

```text
Running 4 tests using 1 worker
4 passed (54.9s)
```

El caso SR-01 verifica también el número visible del resumen, ambas
confirmaciones, persistencia, descenso del contador, repetición idempotente
y ausencia de cambios financieros. Bloquea dominios Stripe en su navegador.

`npm run build`, `npm run check:routes` y `npm run check:migration-policy`:
aprobados. `npm run check`: 24 diagnósticos, idénticos (archivo, código y
mensaje, sin números de línea) a ejecutar el mismo comando en una copia
temporal de `10a08b1`. Ningún diagnóstico nuevo.

Al finalizar se detuvo la app; el puerto 5000 quedó libre. Evidencias
generadas en `generated-artifacts/excepciones-cobros-stripe/`, fuera de Git.
