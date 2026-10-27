# Correo de Notificaciones — Fase B: eventos verificables

## RESUMEN

Implementación de revisión sobre la Fase A limpia. No aplicada a la app.
No inicia procesadores, no envía correos, no registra una URL en Resend y no
ejecuta migraciones. El receptor nuevo es
`POST /api/notifications/webhooks/resend`.

Git mostraba que la rama principal todavía no incluía la Fase A, aunque la tarea
figurara fusionada. Por eso esta revisión parte de
`email-notifications-phase-a-v2`, no de una rama contaminada ni del trabajo
descartado. El diff específico de B debe compararse con esa base limpia.
No se modifica `replit-en-vivo`, `skill-protocolo` ni la rama de Fase A.

### Recepción y confianza

1. Rate limit: 60 solicitudes/minuto por origen; el despliegue debe conservar
   correctamente su configuración de proxy.
2. Captura `express.raw` antes de JSON y sanitización, sin descompresión.
   Rechaza cuerpos mayores a 64 KiB y compresión no admitida.
3. Persiste los bytes originales en base64, tamaño, hash y vencimiento en
   cuarentena **no confiable**. Base64 no es cifrado. No guarda headers, firma
   ni Secret. No registra cuerpo, direcciones o diagnósticos del proveedor.
4. Verifica con `standardwebhooks@1.0.0`, la biblioteca usada directamente por
   el SDK oficial vigente de Resend. Mapea los tres headers `svix-*` exactamente
   como ese SDK. Valida formato del Secret/headers con Zod; la biblioteca oficial
   comprueba HMAC, comparación segura y tolerancia temporal de cinco minutos.
5. Sólo después de verificar utiliza `svix-id` como clave primaria confiable.
   Una firma inválida no reserva ese ID. Los duplicados firmados conservan su
   recepción cruda pero no crean otro evento ni otra aplicación.
6. Devuelve 200 **después** de persistir el evento autenticado. Fallos de
   persistencia/configuración devuelven 503; firma inválida, 400; límite de
   frecuencia, 429; tamaño/compresión, 413/415. Respuestas de código constante,
   sin detalles internos. Nunca procesa el evento dentro de la petición.

`RESEND_WEBHOOK_SECRET` es exclusivamente de servidor. No se creó ni solicitó
un Secret real. Ausente/malformado falla cerrado; no existe un valor por defecto
que permita simular autenticación.

### Retención y procesamiento

- Cuarentena: máximo 2,000 filas y 16 MiB de bytes originales globales
  (base64 ocupa más espacio físico), expiración a 24 horas.
- Contabilidad de capacidad serializada con advisory lock transaccional.
  Si se llena, falla cerrado con 503, no descarta evidencia dando 200.
- Limpieza acotada de expirados al recibir otra petición o al ejecutar un tick
  explícito del procesador. **No hay cron activado**: con la app/procesador
  detenidos, la eliminación física espera la siguiente ejecución autorizada.
- Los eventos autenticados y sus hechos no se eliminan por el TTL del crudo.
- `processEmailWebhookOnce` es un tick exportado; no se llama desde el runtime,
  no tiene timer y no se activó. El procesador de envío de Fase A sigue detenido.
- Claim atómico `FOR UPDATE SKIP LOCKED`; lease de un minuto; reclamación de
  leases vencidas; comprobación del token y bloqueo del evento antes de aplicar.
- Cambio de destinatario y asociación/procesado del evento en una transacción.
  Si falla, rollback; el evento sigue reclamable tras vencer la lease.
- Los no correlacionados se conservan indefinidamente y reintentan cada minuto
  cuando un operador habilite la ejecución. No se descartan por número de intentos.
- Tipos desconocidos: retenidos como ignorados. Eventos conocidos incompletos
  o con scope inconsistente/ambiguo: revisión, sin alterar destinatarios.

### Correlación, scope y hechos

Se usa **`data.email_id`**, no el `message_id` RFC, correo, tags ni tenant/campus
aportados en el payload. Se exige un único destinatario por ID de proveedor,
con aceptación previamente persistida y consistencia entre destinatario, lote
y campus propietario. Si el evento llega antes del commit de aceptación, queda
esperando correlación. Duplicidad del ID en varios destinatarios => revisión.

La cuarentena y los eventos aún sin correlacionar son datos globales del
proveedor, no registros asignados a un tenant inventado. La API no ofrece
lectura de crudos. La asociación final lleva destinatario/tenant/campus, con
FK compuesta. Las lecturas de notificaciones mantienen permisos y scope de
Fase A; la entrada pública usa firma del proveedor, no JWT administrativo.

Estado efectivo monotónico:
`queja > rebotado > entregado > aceptado`.
`email.sent` tardío no degrada nada. Los eventos verificados permanecen como
hechos distintos con ID y fecha; una queja no inventa una entrega, y una entrega
no borra rebote/queja. No se modifica `accepted_at` ni `enviado_en` de Fase A.

Conteos de evidencia acumulados por **destinatario distinto**, no por cantidad
de eventos: aceptaciones con ID, entregas firmadas, rebotes firmados y quejas
firmadas. No son sumables. Se conservan también contadores de estado actual.
No se usa `notifications` legado, ni se calcula una tasa a partir de aceptaciones.
La UI muestra los cuatro hechos, fechas/IDs y advertencias de incidencia; una
fecha o estado avanzado sin evento no habilita un badge de evidencia.
Sin URL pública/evento firmado no se afirma entrega. “Actualizar” recarga
también el lote abierto.

## ARCHIVOS MODIFICADOS

- `server/routes/email-webhooks.ts`: receptor DI, rate limit y captura cruda.
- `server/lib/email/webhook-signature.ts`: Secret/headers Zod y verificador oficial.
- `server/lib/email/webhook-types.ts`: contratos y límites de recepción.
- `server/lib/email/pg-webhooks.ts`: cuarentena, cola durable, claim, correlación,
  transacción, limpieza y reintentos.
- `server/lib/email/webhook-worker.ts`: tick explícito y precedencia monotónica.
- `server/lib/email/webhook-runtime.ts`: registro sin conexión ni activación.
- `server/index.ts`: montaje raw antes de JSON.
- `server/routes.ts`: receptor antes de sanitización.
- `server/lib/email/evidence.ts`: consultas de evidencia y conteos distintos.
- `server/lib/email/pg-repository.ts`: lecturas scoped con evidencia acumulada.
- `shared/email-evidence.ts`: tipos compartidos de hechos/conteos.
- `shared/email-webhook-schema.ts`: esquema de cuarentena y eventos.
- `shared/email-schema.ts`: restricción única compuesta e índice de correlación.
- `shared/schema.ts`, `drizzle/physical/schema.ts`: exportaciones del nuevo esquema.
- `drizzle/migrations/0004_email_notifications_phase_b.sql`: DDL aditivo generado.
- `drizzle/migrations/meta/0004_snapshot.json`,
  `drizzle/migrations/meta/_journal.json`: metadata de generación.
- `client/src/components/notifications/email-evidence.tsx`: presentación aislada
  de hechos/conteos y verificación de badges.
- `client/src/pages/notificaciones.tsx`: integración en estadísticas, historial
  y detalle, y actualización del lote abierto.
- `package.json`, `package-lock.json`: declaran directamente `standardwebhooks`
  ya instalado. No se ejecutó ninguna instalación.
- `server/email-tests/email-phase-b.test.ts`: firmas, recepción, límites,
  orden, idempotencia, recuperación y scope, sin red.
- `server/email-tests/webhook-memory-repository.ts`: persistencia simulada
  exclusivamente de pruebas.
- `server/email-tests/email-webhook-pg.test.ts`: captura de SQL/contratos
  transaccionales; **no ejecuta ese SQL en PostgreSQL**.
- `server/email-tests/email-evidence.test.tsx`: UI por render SSR, sin app.
- `server/email-tests/no-network.ts`: conserva utilidades puras de `node:net`
  necesarias para validar IP, bloqueando conexión.
- `server/vitest.email.config.ts`: pruebas TSX, Oxc, aliases y Secret vacío.
- `server/tsconfig.email.json`: cobertura de tipos de los archivos nuevos.
- `.agents/memory/notification-safety-requirements.md`: decisiones de producto
  sobre hechos y activación controlada.
- `.agents/memory/vitest-ui-transform.md`, `.agents/memory/MEMORY.md`: explicación
  del transformador de pruebas y punteros a requisitos persistentes.
- `docs/email-notifications-phase-b.md`: este informe.

## MIGRACIONES

Se ejecutó **generación offline**, no aplicación:

```sh
DATABASE_URL=postgresql://127.0.0.1:1/blocked \
NEON_DATABASE_URL=postgresql://127.0.0.1:1/blocked \
npm run db:generate -- --name=email_notifications_phase_b
```

`0004` agrega dos tablas, cuatro índices en ellas, un índice de búsqueda en
destinatarios y una restricción única para la FK compuesta. Sin backfill ni
cambios de datos. Se ordenó la restricción única antes de la FK: Drizzle la
había generado después de su referencia. Snapshot/journal corresponden al
esquema generado.

No se aplicó ni siquiera a una base temporal. La compatibilidad física real
y la concurrencia PostgreSQL están pendientes de validación autorizada.
Esta rama también hereda `0003` de Fase A. El hook post-merge existente conserva
`db:migrate`: **no usar Apply changes sin revisar y autorizar las migraciones
pendientes sobre la base identificada**. No se ejecutó ni modificó ese hook.

## PRUEBAS

Suite A+B aislada: 72 regresiones de A + 74 pruebas de B/UI/contratos SQL.

```text
Test Files  4 passed (4)
     Tests  146 passed (146)
  Start at  01:57:47
  Duration  4.44s (transform 724ms, setup 136ms, import 1.73s, tests 430ms, environment 0ms)
```

Seguridad aislada:

```text
Test Files  2 passed (2)
     Tests  23 passed (23)
  Start at  01:54:05
  Duration  3.29s (transform 598ms, setup 0ms, import 1.86s, tests 250ms, environment 0ms)
```

Pasaron también: `npx tsc --noEmit -p server/tsconfig.email.json`,
`npm run check:migration-policy`, `npm run check:routes` (44/44) y
`npm run build`. El build compiló sin iniciar el servidor.

El typecheck global **no pasa**: 24 diagnósticos en la base de Fase A y los
mismos 24 tras B, sin diagnósticos nuevos normalizados. Se comprobó compilando
una copia obtenida con `git archive` en `/tmp`, no suponiendo que eran previos.
No se amplió el alcance para corregirlos.

Se corrigieron dos fallos iniciales del arnés: JSX de Vitest/Oxc y un falso
positivo que confundía `ON DELETE NO ACTION` con DML. Los resultados anteriores
son del pase final. Logs y build outputs quedan fuera de Git.

## CONSULTAS A LA BASE

**Ninguna contra DATABASE_URL, NEON_DATABASE_URL ni otra base real.**
Las pruebas de repositorio capturan SQL en dobles de prueba, no lo ejecutan.
No se inspeccionó catálogo, tabla de migraciones, datos, destinatarios reales
ni configuración secreta. No se ejecutó seed, backfill, migración ni worker.

## DOCUMENTACIÓN EXTERNA CONSULTADA

Consulta de fuentes oficiales durante la implementación (2026-10-26):

- https://resend.com/docs/webhooks/verify-webhooks-requests
- https://resend.com/docs/webhooks/event-types
- https://resend.com/docs/webhooks/emails/sent
- https://resend.com/docs/webhooks/emails/delivered
- https://resend.com/docs/webhooks/emails/bounced
- https://resend.com/docs/webhooks/emails/complained
- https://docs.svix.com/receiving/verifying-payloads/how
- https://raw.githubusercontent.com/resend/resend-node/main/src/webhooks/webhooks.ts
- https://raw.githubusercontent.com/svix/svix-webhooks/main/javascript/src/webhook.ts

Estas fuentes respaldan bytes originales, headers firmados, biblioteca oficial,
`email_id`, significado de entrega y deduplicación por `svix-id`. “Delivered”
significa aceptación por el servidor de correo, no lectura por la persona.

## LO QUE NO PUDE VERIFICAR

- PostgreSQL real: DDL, restricciones, planes, concurrencia entre procesos,
  crash/rollback efectivos y capacidad bajo carga.
- Webhook real de Resend, Secret válido de la cuenta, URL pública y DNS.
- Envío real al correo propio autorizado y su entrega/incidencias.
- UI autenticada en navegador/captura: la app permaneció sin arrancar;
  sólo se verificaron componentes nuevos mediante SSR aislado.
- Estado actual de migraciones en cualquier base configurada.

## HALLAZGOS FUERA DE ALCANCE (NO CORREGIDOS)

El typecheck global tiene errores confirmados en `becas`, asistente,
parser bancario, exportador de reportes, rutas de conciliación/misc/pagos/
reportes y un script de reproducción. Build: advertencias de Browserslist
desactualizado y chunks mayores de 500 KiB. No se corrigieron estos módulos,
ni se tocó `approval_notifications`.

## RAMA

`email-notifications-phase-b-review`, basada en la Fase A limpia.
Sin integración ni publicación de la app.

## COMMIT

El hash real y su comprobación con `git ls-remote github` se entregan en el
reporte final de la revisión; no se inserta un hash autorreferente en este archivo.
