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
4. Verifica con el SDK oficial `svix@1.99.1`, fijado exactamente y comprobado
   con Node 20, sin `EBADENGINE`. Usa los tres headers nativos `svix-*`.
   Valida formato del Secret/headers con Zod; la biblioteca oficial
   comprueba HMAC, comparación segura y tolerancia temporal de cinco minutos.
5. Sólo después de verificar utiliza `svix-id` como clave primaria confiable.
   Una firma inválida no reserva ese ID. Los duplicados firmados conservan su
   recepción cruda pero no crean otro evento ni otra aplicación.
6. Devuelve 200 **después** de persistir el evento autenticado. Fallos de
   persistencia/configuración devuelven 503; firma inválida, 400; límite de
   frecuencia, 429; tamaño/compresión, 413/415. Respuestas de código constante,
   sin detalles internos. Nunca procesa el evento dentro de la petición.

Antes de cualquier SQL se comprueba la configuración. Sin Secret válido:
503 y **cero escrituras**, tampoco recepción cruda. Headers ausentes: 400 antes
de la cuarentena; firma incorrecta: 400, sin reservar un ID confiable.
Esta excepción explícita del usuario precede al orden general de cuarentena
del protocolo.

`RESEND_WEBHOOK_SECRET` es exclusivamente de servidor. No se creó ni solicitó
un Secret real. Ausente/malformado falla cerrado; no existe un valor por defecto
que permita simular autenticación.

### Retención y procesamiento

- Cuarentena: máximo 2,000 filas y 16 MiB de bytes originales globales
  (base64 ocupa más espacio físico), expiración a **7 días (168 horas)**.
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
- `email.sent`, `email.opened`, `email.clicked` y tipos desconocidos: retenidos
  como **no procesados**, sin cambiar destinatarios. Eventos conocidos incompletos
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
`queja > rebotado > error > entregado > aceptado`.
`email.sent` no se procesa. Los eventos verificados permanecen como
hechos distintos con ID y fecha; una queja no inventa una entrega, y una entrega
no borra rebote/queja. No se modifica `accepted_at` ni `enviado_en` de Fase A.

Conteos de evidencia acumulados por **destinatario distinto**, no por cantidad
de eventos: aceptaciones con ID, entregas firmadas, rebotes firmados y quejas
firmadas, supresiones, fallos y demoras firmados. No son sumables. Se conservan
también contadores de estado actual.
No se usa `notifications` legado, ni se calcula una tasa a partir de aceptaciones.
La UI muestra los hechos, fechas/IDs y advertencias de incidencia; una
fecha o estado avanzado sin evento no habilita un badge de evidencia.
Sin URL pública/evento firmado no se afirma entrega. “Actualizar” recarga
también el lote abierto.

- `email.bounced`: guarda `bounce.type` y `bounce.subType`; UI distingue
  Permanente de Temporal (`Temporary` o `Transient`).
- `email.suppressed`: estado rebotado, motivo fijo
  **«suprimido por el proveedor»**. Su hecho y conteo son independientes de
  un rebote firmado: no se fabrica un `email.bounced`.
- `email.failed`: error y código `failed.reason` preservado. Sólo se normalizan
  códigos de hasta 128 caracteres alfanuméricos/`_.:-`; texto libre se conserva
  únicamente en cuarentena limitada y queda en revisión, nunca en logs ni como
  código de error. Se anula `next_attempt_at`, sin reenvío automático.
- `email.delivery_delayed`: conserva el estado y muestra **«Con demora»** con
  su evento/fecha. Una demora histórica no acredita entrega.
- `details` contiene sólo esos códigos mínimos; no asunto, direcciones,
  diagnósticos SMTP, mensajes libres, firma ni Secret.

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
- `package.json`, `package-lock.json`: fijan el SDK oficial `svix@1.99.1`.
  Instalación por terminal con `--save-exact --ignore-scripts`; sin alterar Node,
  `.replit` ni workflows, sin reiniciar. No hay dependencia directa de
  `standardwebhooks`; Svix utiliza su dependencia oficial interna.
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
- `docs/email-notifications-phase-b-database-report.md`: procesos y todas las
  consultas SELECT reales autorizadas, parámetros, resultados y limitaciones.

## MIGRACIONES

`0004` se había generado offline en la implementación anterior transportada:

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

En este ajuste **no se ejecutó ningún comando de migración ni de generación**.
Se editaron el SQL pendiente `0004` y su snapshot en la rama de revisión:
TTL 7 días, `details` JSONB nullable y tipos/estados internos acordados.
No se añade ningún estado de destinatario. El nuevo control estático comprueba
la alineación entre snapshot y SQL sin conectarse a PostgreSQL.

No se aplicó ni siquiera a una base temporal. La compatibilidad física real
y la concurrencia PostgreSQL están pendientes de validación autorizada.
Esta rama también hereda `0003` de Fase A. El hook post-merge existente conserva
`db:migrate`: **no usar Apply changes sin revisar y autorizar las migraciones
pendientes sobre la base identificada**. No se ejecutó ni modificó ese hook.

## PRUEBAS

Suite A+B aislada: **72 regresiones de A + 100 pruebas de B/UI/contratos SQL**.
Comando: `cd server && npx vitest run --config vitest.email.config.ts`.

```text
Test Files  4 passed (4)
     Tests  172 passed (172)
  Start at  02:53:49
  Duration  5.40s (transform 879ms, setup 123ms, import 3.00s, tests 405ms, environment 0ms)
```

Seguridad aislada:

```text
Test Files  2 passed (2)
     Tests  23 passed (23)
  Start at  03:00:55
  Duration  3.65s (transform 526ms, setup 0ms, import 1.94s, tests 193ms, environment 0ms)
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

Las pruebas de repositorio siguen capturando SQL en dobles, sin ejecutarlo.
Separadamente, el usuario autorizó **SELECT reales sobre DATABASE_URL** para
los procesos detenidos. Sesiones con `default_transaction_read_only=on`,
confirmado por SELECT antes de consultar: catálogo de columnas y conteos
agregados, sin destinatarios, datos personales ni valores de Secrets.

**0 filas en las siete tablas**, tanto hasta la última observación con hora
conocida como hasta el límite superior de detención. La hora exacta del
SIGTERM no quedó registrada: no se inventa ni se atribuyen causalidades.
Texto completo de cada SELECT, parámetros, conteos y límites:
[informe de procesos y base](email-notifications-phase-b-database-report.md).
No se ejecutó DML, DDL, seed, backfill, migración ni worker.

## DOCUMENTACIÓN EXTERNA CONSULTADA

Consulta de fuentes oficiales durante la implementación (2026-10-26):

- https://resend.com/docs/webhooks/verify-webhooks-requests
- https://resend.com/docs/webhooks/event-types
- https://resend.com/docs/webhooks/emails/sent
- https://resend.com/docs/webhooks/emails/delivered
- https://resend.com/docs/webhooks/emails/bounced
- https://resend.com/docs/webhooks/emails/complained
- https://resend.com/docs/webhooks/emails/failed
- https://resend.com/docs/webhooks/emails/suppressed
- https://resend.com/docs/webhooks/emails/delivery-delayed
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
- Hora exacta de detención y persona que solicitó el arranque anterior.
  Sí se conoce el usuario del SO, la cadena técnica de procesos y un intervalo
  conservador de detención. Cero filas creadas no demuestra ausencia de
  modificaciones, borrados, DDL ni filas creadas y luego eliminadas.

## HALLAZGOS FUERA DE ALCANCE (NO CORREGIDOS)

El typecheck global tiene errores confirmados en `becas`, asistente,
parser bancario, exportador de reportes, rutas de conciliación/misc/pagos/
reportes y un script de reproducción. Build: advertencias de Browserslist
desactualizado y chunks mayores de 500 KiB. No se corrigieron estos módulos,
ni se tocó `approval_notifications`.

`npm` informó 53 alertas de dependencias (5 bajas, 18 moderadas, 25 altas,
5 críticas). No se ejecutó `npm audit fix`, no se atribuyen al cambio sin
comparar una auditoría de base y no se actualizaron dependencias ajenas.
También persiste el aviso de peer dependency de `@types/node` del Vite anidado;
no es `EBADENGINE` y no se modificó Node para resolverlo.

El arranque anterior de auditoría contiene `CREATE TABLE IF NOT EXISTS` en
`initAuditRetryQueue`. Está fuera del diff funcional de esta fase. Los conteos
de cero filas no permiten afirmar que no haya ejecutado DDL; no se modificó
ese arranque ni se volvió a ejecutar.

## RAMA

`email-notifications-phase-b`, basada en la Fase A limpia.
Sin integración ni publicación de la app.

## COMMIT

El hash real y su comprobación con `git ls-remote github` se entregan en el
reporte final de la revisión; no se inserta un hash autorreferente en este archivo.
