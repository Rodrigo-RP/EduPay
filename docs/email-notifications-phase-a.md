# Correo real en Notificaciones — fase A, revisión sin activar

## Reconstrucción de la rama de revisión

Esta entrega se reconstruye en `email-notifications-phase-a-v2` desde
`cd5f50fad97d0b0786675f5c26b67e0279e37250`, transportando sólo el trabajo de
Fase A de `4727b34`. No se incorpora `373cd75`, ni se transporta `4edfd66`:
este último sólo registra metadatos de un archivo de resultados en la Library,
innecesarios para el código y fuera de la lista de archivos de Fase A.

Los conflictos se resolvieron conservando la pantalla y el registro seguro
de rutas de Fase A y creando su memoria de seguridad, ausente en la base.
El resto de `server/routes/notifications.ts`, incluido Aprobaciones, coincide
con la base autorizada. Los scripts de setup, los cinco PNG y los cambios
ajenos de la tarea descartada quedan fuera de esta rama.
Las URL inertes de pruebas/documentación ya no incluyen usuario ni contraseña,
ni siquiera ficticios. Las direcciones de prueba usan el dominio reservado
`example.test`; no son accesos a cuentas reales.

La causa de la rama anterior fue partir del HEAD que ya tenía aplicado
`373cd75` y revisar el diff de Fase A respecto de ese HEAD, sin comprobar la
ascendencia respecto de la base autorizada. Ese fue un error de preparación
y verificación de la entrega; no significaba que la tarea descartada estuviera
autorizada.

La skill solicitada `edupay-protocolo-desarrollo` no está disponible en este
entorno ni se encontró en el buscador de skills; el reporte explicita alcance,
validaciones, evidencia Git, exclusiones y restricciones sin afirmar que sigue
un formato inaccesible.

## Estado de entrega y límites

Código preparado para revisión. No se inició/reinició la aplicación, no se
activó ningún worker, no se ejecutaron seeds, no se usaron las conexiones
configuradas, no se enviaron correos y no se publicaron cambios.

**No aplicar ni fusionar automáticamente.** `scripts/post-merge.sh:8` instala
dependencias, `:11` ejecuta `npm run db:migrate` y `:14` ejecuta `npx vite build`.
El hook no fue ejecutado ni modificado. Detener la app no evita que ese hook
escriba en la base si se ejecuta posteriormente.

## Archivos y función

| Archivo | Cambio |
|---|---|
| `client/src/pages/notificaciones.tsx` | Reemplaza el flujo de éxito simulado por configuración, candidatos, vista previa, confirmación de lote 202, seguimiento, conteos y cierre explícito de incidencias inciertas. Muestra worker detenido, diferencia aceptado de entregado, deshabilita SMS/WhatsApp y acciones sin PROCESS. Retira interruptores decorativos y tasa ficticia. |
| `server/routes/notifications.ts` | Sustituye únicamente los handlers antiguos de correo por el registro nuevo. El sufijo de Aprobaciones permanece idéntico al de HEAD. |
| `server/routes/email-notifications.ts` | Endpoints con dependencias inyectables, autorización READ/PROCESS, alcance obligatorio y errores públicos seguros. Alias antiguos no permiten envío directo. |
| `server/lib/email/runtime.ts` | Conecta repositorio y servicio a autenticación/permisos existentes; no crea transporte, temporizador ni worker. |
| `server/lib/email/types.ts` | Contratos de proveedor, configuración, destinatarios, estados y errores. |
| `server/lib/email/config.ts` | Validación Zod de APP_ENV y Secrets. Entorno ausente/desconocido falla cerrado. |
| `server/lib/email/identity.ts` | Hash canónico, independiente del orden de claves JSONB. |
| `server/lib/email/recipients.ts` | Normalización, deduplicación y omisiones; nunca inventa una dirección. |
| `server/lib/email/templates.ts` | Plantillas españolas centralizadas, HTML escapado, sin identificadores fiscales, tokens ni ligas de pago. |
| `server/lib/email/resend-provider.ts` | Adaptador REST Resend con timeout, ID verificable, clave idempotente y clasificación segura de errores/cuotas. |
| `server/lib/email/repository.ts` | Interfaces de persistencia; no abre conexiones. |
| `server/lib/email/pg-repository.ts` | Persistencia transaccional de intención/lote/destinatarios, consultas reales con alcance, estadísticas sólo del ledger nuevo y cierre auditado. |
| `server/lib/email/worker.ts` | Un tick explícito con proveedor inyectado; máximo tres reintentos transitorios y tratamiento conservador de incertidumbre. |
| `server/lib/email/pg-worker.ts` | Reclamo SKIP LOCKED, gate compartido por proveedor, recuperación de leases y resultado transaccional. Libera conexión antes de la red. |
| `server/lib/email/simulated-provider.ts` | Proveedor explícitamente simulado, utilizado sólo por pruebas; runtime no lo selecciona. |
| `shared/email-schema.ts` | Esquema aditivo separado del historial legado. |
| `shared/schema.ts`, `drizzle/physical/schema.ts` | Exportan el esquema nuevo para la app y el manifiesto físico de generación. |
| `drizzle/migrations/0003_email_notifications_phase_a.sql` | Migración generada, no aplicada. |
| `drizzle/migrations/meta/0003_snapshot.json`, `meta/_journal.json` | Snapshot y registro de generación; no son el registro de migraciones aplicadas de una base. |
| `server/email-tests/*`, `server/vitest.email.config.ts`, `server/tsconfig.email.json` | Pruebas aisladas, repositorio en memoria, bloqueo de conectividad y chequeo de tipos específico. |
| `.gitignore`, `.replitignore` | Excluyen resultados generados de Git y del proyecto publicado. |
| `.agents/memory/notification-safety-requirements.md` | Conserva las decisiones de seguridad y la obligación de verificar ascendencia y diff contra la base autorizada. |

## Esquema nuevo: sólo aditivo

La migración crea:

1. `email_notification_intents`: intención canónica por tenant/campus,
   selección, destinatarios y contenido congelados, fingerprint de configuración,
   expiración de vista previa. No guarda claves ni allowlist.
2. `email_notification_batches`: lote único por intención.
3. `email_notification_recipients`: un registro por dirección normalizada en el
   lote o por omisión sin dirección; estados, clave idempotente, evidencia de
   aceptación, reintentos, lease y error público genérico.
4. `email_notification_attempts`: trazabilidad de reclamos, resultados,
   recuperación y decisiones manuales con actor.
5. `email_provider_gate`: pausa/ritmo común de todos los workers de esta base.

Incluye índices, restricciones de unicidad, FK compuestas que preservan alcance
y CHECK de estado/evidencia/reintentos. Son **SQL pendiente**, no índices creados
en una base durante esta implementación. No altera tablas anteriores, no copia
historial, no hace backfill y no contiene INSERT de seeds.

Se generó con:

```sh
DATABASE_URL='postgresql://127.0.0.1:1/blocked' \
  npm run db:generate -- --name=email_notifications_phase_a
DATABASE_URL='postgresql://127.0.0.1:1/blocked' npm run db:check
```

Ambos son comandos de generación/verificación de archivos; no se ejecutó
`db:migrate` ni `db:push`. El SQL nuevo sería candidato a aplicación si más
adelante se ejecutara el hook sobre una base con las migraciones anteriores
aplicadas. **No se consultó la tabla de migraciones de DATABASE_URL:** no se
afirma cuáles migraciones anteriores están pendientes en esa base.

## Origen de destinatarios y reemplazo de simulaciones

Los candidatos salen de alumnos del campus, la relación `student_guardian`
marcada como responsable financiero, correo registrado del tutor y cargos
pendientes/parciales. Las fechas distinguen cargo emitido, recordatorio y mora.
El campus se valida contra el tenant autenticado; alumnos, tutores y cargos
deben pertenecer al mismo alcance. Los tenant nulos históricos sólo se admiten
cuando el campus o el alumno relacionado establecen el alcance; no se modifican.

Se elimina el marcado inmediato de éxito y no se utiliza el correo ficticio
del flujo anterior. La ausencia o invalidez de correo produce una omisión;
hermanos con el mismo destinatario producen un solo envío por lote.
Las consultas de historial/estadísticas leen exclusivamente las tablas nuevas.
Los antiguos `notifications.estado='enviado'` **no se reinterpretan como
aceptaciones o entregas**, no se actualizan ni se incluyen en los conteos nuevos.

## Configuración y correo real

Resend se implementa detrás de `EmailProvider`, mediante
`POST https://api.resend.com/emails`. El código contiene sólo los nombres de
Secrets, nunca sus valores:

- `RESEND_API_KEY`: clave de Resend.
- `EMAIL_FROM`: remitente autorizado del proveedor.
- `EMAIL_ALLOWED_RECIPIENTS`: lista explícita separada por coma, punto y coma o
  salto de línea. No se devuelve por la API ni se registra en logs.
- `APP_ENV`: debe ser exactamente `production`, `development` o `test`.

Sin configuración válida, las operaciones autorizadas de preparar/confirmar y
el alias de envío responden `503 EMAIL_NO_CONFIGURADO`, sin crear intenciones,
lotes ni destinatarios. La pantalla informa el problema; no muestra éxito.
En desarrollo/test, allowlist vacía significa **nadie**, no permitir todos.
En test se permite el proveedor simulado; el adaptador real está prohibido.
No se solicitó ni configuró ninguna clave durante esta implementación.
Los endpoints serializan JSON mediante `send` para no pasar destinatarios ni
otros cuerpos al capturador global de `res.json`; permanecen los logs normales
de método/ruta/estado y no se modifica el logger de otros módulos.

**No hay envío real activado:** registrar rutas no crea un adaptador ni llama
al worker. Los ticks sólo existen como funciones exportadas que requieren
repositorio/proveedor explícitos. Una futura activación requiere autorización
separada, configuración y validación previa; este documento no indica que se
ejecute ahora.

## Estados, evidencia y duplicados

Estados: pendiente, enviando, aceptado, entregado, rebotado, queja, error,
incierto y omitido.

Sólo una aceptación con ID del proveedor guarda `provider_message_id`,
`accepted_at` y `enviado_en` iguales. Un `200` sin ID verificable no es éxito.
Los errores guardan un código seguro y texto genérico, no la respuesta cruda.
Fase A no produce entregado/rebotado/queja: requieren evidencia de eventos
verificados de la fase siguiente. Aceptado no equivale a entregado.

La intención se calcula en el servidor, no depende de una clave del navegador.
Dos pestañas, doble clic y reintentos de confirmación reutilizan el mismo lote.
Los destinatarios se revalidan al confirmar y justo antes de enviar. El cuerpo
y el remitente efectivo no pueden cambiar silenciosamente en un reintento.
Un nuevo envío deliberado exige referencia explícita al lote anterior, vista
previa nueva y confirmación; no se permite mientras el anterior esté activo
o tenga resultados inciertos.

Resend conserva sus claves 24 horas; la unicidad local no expira al cumplir
ese plazo. Un timeout/respuesta perdida pasa a incierto, sin replay automático.
Un lease abandonado también pasa a incierto. El operador sólo puede cerrar
explícitamente la incertidumbre sin reenviar; la decisión queda auditada.

Todos los workers de esta base comparten gate `resend`, no uno por tenant ni
por API key. Se usa un ritmo conservador de un inicio por segundo y se respetan
Retry-After y ratelimit-reset. La cuota diaria conserva pendientes hasta
medianoche UTC; la mensual pausa hasta el siguiente mes. Un rechazo por cuota
sin reintentos previos puede renovar la ventana de primer intento; si hubo
reintentos transitorios previos se conserva la protección de 23 horas.
Cualquier consumidor externo del mismo equipo de Resend debe coordinarse con
este gate o reservar capacidad; esta base no controla aplicaciones externas.

## Permisos y compatibilidad

READ permite configuración pública, candidatos, estadísticas, historial y
detalle. PROCESS permite preparar, confirmar y resolver incertidumbre.
No se cambiaron definiciones de roles ni `shared/permissions.ts`.
La API devuelve `canProcess` y la pantalla muestra “Sólo consulta” cuando
corresponde. Cada operación exige tenant/campus/usuario válidos, verifica que
el campus pertenezca al tenant y aplica alcance también a identificadores
de intención, lote y destinatario.

Alias GET de notificaciones/estadísticas/candidatos usan el contrato nuevo.
POST heredado `/api/notifications/send` responde 410 con EMAIL configurado,
503 si no está configurado y 422 para SMS/WHATSAPP; no crea filas.
Los clientes heredados no pueden saltarse la confirmación.

## Validación ejecutada y límites

```sh
cd server
../node_modules/.bin/vitest run --config vitest.email.config.ts --reporter=verbose
# 1 archivo; 72 pruebas aprobadas

# Desde la raíz:
./node_modules/.bin/tsc --noEmit --pretty false -p server/tsconfig.email.json
# exit 0, sin diagnósticos
npm run build
# exit 0; Vite y esbuild completados, sin iniciar la app
npm run check:migration-policy
# verificación estática de política; no aplica migraciones
npm run test:safety
# 23 de 23 aprobadas: guardas y rutas con DB/seed sustituidos por mocks
```

Las cuatro verificaciones solicitadas en la reconstrucción finalizaron con
exit 0: 72/72 correo, build, política de migración y 23/23 safety.
No se ejecutaron los comandos de generación de migración mostrados arriba
durante esta reconstrucción: el SQL se transportó como archivo del commit
de Fase A y permanece sin aplicar.

La salida completa se guarda en `generated-artifacts/phase-a-v2-*.txt`,
excluida de Git y de publicación. Las 72 pruebas de Fase A cubren configuración
ausente, entorno desconocido, bloqueo de
red/DB, rechazo del adaptador real en test, deduplicación, JSONB, selección
individual, expiración, cambio de configuración, confirmaciones concurrentes,
unicidad tras 24 horas, aceptación/4xx/timeout, leases, caída tras aceptación,
workers concurrentes, gate entre instituciones, backoff, cuotas, allowlist,
reevaluación, cierre manual, permisos, IDs ajenos, 422/503/202, errores seguros,
conteos, plantillas y contratos SQL.

En la entrega inicial se habían contrastado los 24 diagnósticos globales con
su HEAD anterior. Ese resultado no se presenta como una nueva validación global
de esta reconstrucción. No se modifican módulos ajenos para ocultar errores.
El build advierte sobre Browserslist antiguo y tamaño de bundle; no son
fallos de compilación y no se instalaron dependencias para silenciarlos.

**No verificado todavía:**

- Migración, constraints, contención real de PostgreSQL, SKIP LOCKED,
  aislamiento entre procesos y planes de consulta en un servidor real.
  Las pruebas concurrentes usan memoria; las SQL usan dobles sin conexión.
- Login, navegación y render de la pantalla en navegador; la app se mantiene
  detenida y no se creó un bypass de autenticación.
- Dominio/remitente del proveedor y un envío controlado al correo propio
  autorizado por el usuario. No se intentó un envío real.
- Eventos de entrega/rebote/queja verificados, que pertenecen a la fase B.

La compilación y las pruebas aisladas no sustituyen esas comprobaciones ni
autorizan aplicar/fusionar el código, migrar, activar el worker o publicar.

## Documentación del proveedor consultada

- https://resend.com/docs/api-reference/emails/send-email
- https://resend.com/docs/api-reference/rate-limit
- https://resend.com/docs/api-reference/errors
- https://resend.com/docs/dashboard/emails/idempotency-keys
