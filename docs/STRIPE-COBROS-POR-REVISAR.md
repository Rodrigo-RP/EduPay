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
