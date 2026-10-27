# Retiro de éxitos simulados y barrido de rutas

## Alcance y método

Base de trabajo: `f910c61`. Revisión estática de los 30 archivos
`server/routes/*.ts`: 296 declaraciones de rutas; 278 con URL literal y
callback inline, 18 con callback referenciado, constante o bucle. El bucle
de seguridad registra tres URLs. Se revisaron también las funciones
delegadas relevantes. Los números son declaraciones, no rutas únicas.

No se ejecutó directamente ningún endpoint de mantenimiento para este
barrido. No se enviaron correos ni solicitudes a proveedores fiscales para
comprobar una conexión. Los resultados siguientes son evidencia de código,
no comprobaciones de servicios externos.

No se considera ficticio un GET que consulta datos reales, una calculadora
identificada como prueba, la emisión real de un JWT, un catálogo estático
o una vista previa explícita: no prometen persistencia ni entrega externa.
Sí se distingue la escritura de un log de la ejecución de la acción que
ese log describe.

## Correcciones limitadas a esta tarea

- Las tres rutas `/api/security/{scan,block-ip,enable-2fa}` conservan
  `requireAuth` y `SECURITY.READ`. Responden 401 sin autenticación, 403 sin
  permiso y 501 con el JSON solicitado cuando hay permiso. El manejador
  no tiene dependencias de escritura ni de proveedores.
- No existen consumidores de estas tres rutas en `client/src` ni controles
  globales que deshabilitar. No se añadieron botones ficticios. El 2FA
  individual de `/api/auth/2fa/*` permanece intacto.
- No se encontró ninguna prueba existente que esperase 2xx de esas tres
  rutas. Los casos existentes de `system-db-guards.test.ts` esperan 403.
  SYS-13 y SYS-14 no se modificaron ni se convirtieron en mocks.
- Se consolidó `estadisticas-sat`: el registro redundante de `misc.ts`
  desaparece; `fiscal.ts` registra un único manejador de estadísticas.
  Una falla de consulta o configuración devuelve 500 sin ceros inventados.
- El proveedor sale de `campus_invoicing_config` del campus/tenant
  autenticado; su modo usa el mismo resolvedor privado de credenciales
  que la fábrica. No se devuelve ninguna clave. Una configuración
  incompatible o incompleta informa `sin configurar`.
- La clave Live sólo se describe como configuración de producción:
  `operacion_habilitada:false`. El adaptador continúa limitado a sandbox.
  `conexion_verificada:false` siempre: no se comprobó conectividad.
- La pestaña nueva muestra exclusivamente estadísticas, carga, error y
  reintento. No monta el formulario heredado que afirma generar un
  reporte SAT sin generarlo.

## Hallazgos fuera de alcance: éxito o información fabricada

No se corrigieron los endpoints de esta tabla.

| Ruta | Archivo y línea | Qué afirma | Qué hace realmente |
|---|---|---|---|
| POST `/api/payments/create-intent` | `server/routes/payments.ts:244` | Devuelve un secreto de PaymentIntent. | Fabrica `pi_mock_…` con fecha/aleatoriedad; no crea un intent en Stripe. |
| POST `/api/payments/process` | `server/routes/payments.ts:274` | “Payment processed successfully”. | Sí persiste pago exitoso, aplicación y cargo pagado, pero no llama ni valida una confirmación de la pasarela. La persistencia no prueba el cobro externo. **Riesgo financiero**. |
| POST `/api/guardian/pagar` | `server/routes/guardian.ts:452`, bloque `:685` | Retorna CFDI y marca la factura emitida. | El bloque fiscal inventa UUID y URLs demo, inserta una factura y la marca `emitido` sin PAC. El pago tiene su propio flujo, con Stripe condicional; el hallazgo no afirma que todos esos pagos sean simulados. **El CFDI local no es timbrado real**. |
| POST `/api/fiscal/generar-reporte-contable` | `server/routes/fiscal.ts:634` | Reporte generado. | Devuelve `url:null` y los parámetros recibidos, sin producir archivo. |
| POST `/api/fiscal/generar-reporte-sat` | `server/routes/fiscal.ts:644` | Reporte SAT generado. | Devuelve `url:null` y parámetros; no produce ni presenta un reporte al SAT. |
| POST `/api/crm/prospects` | `server/routes/misc.ts:1001` | HTTP 201, prospecto creado. | Intenta INSERT; si falla devuelve el body recibido como si fuera una fila creada. |
| GET `/api/security/metrics` | `server/routes/system.ts:171` | Amenazas, ataques bloqueados, usuarios y puntuación actuales. | Son constantes con timestamp nuevo, sin medición. |
| GET `/api/security/events` | `server/routes/system.ts:190` | Eventos recientes resueltos. | Devuelve dos objetos fijos con hora nueva; no consulta eventos reales. |
| GET `/api/security/report` | `server/routes/system.ts:226` | Puntuaciones de seguridad/cumplimiento. | Valores fijos; no realiza auditoría ni certificación PCI/ISO/OWASP/GDPR. |
| POST `/api/super-admin/security/scan` | `server/routes/system.ts:351` | Escaneo de plataforma iniciado, cero vulnerabilidades, puntuación 96. | Persiste un evento de seguridad; no ejecuta motor de escaneo. |
| POST `/api/super-admin/security/block-ip` | `server/routes/system.ts:672` | IP bloqueada en toda la plataforma. | Inserta evento `is_blocked:true`; no implementa rechazo de peticiones por IP. No se encontró consumo de ese indicador como bloqueo de acceso. |
| GET `/api/super-admin/school-details/:schoolId` | `server/routes/system.ts:458` | Detalle financiero, usuarios y actividad de la escuela. | Campus/alumnos sí provienen de storage; importes aleatorios, dos usuarios construidos y actividad fija no provienen del historial real. |
| GET `/api/super-admin/live/revenue` | `server/routes/system.ts:740` | Ingresos/MRR/cobros/uptime en vivo. | Bases fijas, variación horaria y `Math.random()`. |
| GET `/api/super-admin/live/transactions` | `server/routes/system.ts:768` | Transacciones recientes exitosas/fallidas. | Construye doce transacciones aleatorias; no lee pagos. |
| GET `/api/super-admin/analytics/regional` | `server/routes/system.ts:807` | Ingresos/alumnos/crecimiento regionales. | Regiones y bases fijas con perturbaciones aleatorias. |
| GET `/api/super-admin/alerts/executive` | `server/routes/system.ts:833` | Alertas ejecutivas actuales. | Selecciona dos a cuatro alertas de un catálogo estático al azar. |
| GET `/api/financial/analysis/:period` | `server/routes/system.ts:887` | Análisis financiero del periodo. | Parte de alumnos reales; supone colegiatura, cobranza, costos, liquidez, retención y crecimiento; tendencias mensuales aleatorias. No corresponde al ledger de ese periodo. |
| GET `/api/financial/analysis` | `server/routes/system.ts:1058` | Análisis financiero general. | Importes, costos y número de alumnos constantes; comentario reconoce simulación. |
| GET `/api/migration/progress/:sessionId` | `server/routes/payments.ts:1578` | Sesión completada, 100%. | Siempre devuelve completado, cero registros y cero errores; no consulta la sesión. |
| GET `/api/migration/download/:sessionId` | `server/routes/payments.ts:1596` | CSV de migración completada. | Construye una línea “ok” para cualquier identificador; no verifica una migración. |
| GET `/api/validation/run` | `server/routes/payments.ts:1611` | Validación satisfactoria de IVA y becas. | Estudiantes/conceptos tienen comprobaciones reales; IVA se fuerza a `pass` y becas devuelve tres `pass` estáticos sin consultar esas asignaciones. |
| GET `/api/validation/report` | `server/routes/payments.ts:1767` | Reporte completado con categorías exitosas y fecha actual. | Resumen/campus fijos; no recupera un reporte ejecutado o persistido. |

### Respuestas 2xx degradadas ante errores de base

No necesariamente inventan una mutación, pero ocultan una consulta fallida
como ausencia de datos, saldo cero o ejecución sin trabajo. Se reportan
separadamente para no confundirlas con cobros o entregas reales.

| Ruta | Archivo y línea de la ruta | Sustitución / consecuencia |
|---|---|---|
| GET `/api/admin/dashboard/:campusId` | `server/routes/admin.ts:195` | Conciliaciones pendientes → 0 si falla esa consulta. |
| GET `/api/scholarships` | `server/routes/admin.ts:515` | Array vacío; registra el error en consola pero devuelve 200 sin aviso de indisponibilidad. |
| GET `/api/students/:studentId/estado-cuenta` | `server/routes/admin.ts:590` | Saldo a favor → 0 si falla esa lectura. Otras consultas sí propagan error. |
| GET `/api/admin/magic-link/history/:guardianId` | `server/routes/auth.ts:483` | Historial vacío ante error. |
| GET `/api/admin/cargos` | `server/routes/charges.ts:163` | Cargos vacíos ante error. |
| GET `/api/dashboard/comandos/:campusId` | `server/routes/conciliacion.ts:547` | Diversos contadores/sumas → 0. |
| GET `/api/caja/movimientos-banco` | `server/routes/conciliacion.ts:889` | Movimientos vacíos ante error. |
| GET `/api/caja/estadisticas-conciliacion` | `server/routes/conciliacion.ts:956` | Conteos/importes → 0. |
| POST `/api/caja/ejecutar-conciliacion` | `server/routes/conciliacion.ts:981` | Error al leer transacciones → array vacío; puede responder cero conciliadas en lugar de fallo. |
| GET `/api/fiscal` | `server/routes/fiscal.ts:234` | Total de facturas → 0. |
| GET `/api/fiscal/estadisticas-cfdi` | `server/routes/fiscal.ts:287` | Conteos/importes de emitidos, pendientes y cancelados → 0. |
| GET `/api/planes-pago/:campusId` | `server/routes/misc.ts:125` | Cuotas vacías ante error; conserva el resto del plan. |
| GET `/api/planes-pago` | `server/routes/misc.ts:871` | Cuotas vacías ante error; conserva el resto del plan. |
| GET `/api/dashboard/comandos` | `server/routes/misc.ts:939` | Conciliaciones pendientes → 0. |
| GET `/api/receivables` | `server/routes/misc.ts:977` | Cuentas vacías ante error. |
| GET `/api/crm/prospects` | `server/routes/misc.ts:993` | Prospectos vacíos ante error. |
| GET `/api/caja` | `server/routes/misc.ts:1305` | Conteo/importe de pagos del día → 0. |
| GET `/api/admin/charges` | `server/routes/misc.ts:1317` | Cargos vacíos ante error. |
| GET `/api/admin/dashboard` | `server/routes/misc.ts:1892` | Totales de alumnos/cobros/pendientes → 0. |
| GET `/api/migration/projects` | `server/routes/payments.ts:1536` | Proyectos vacíos ante error. |
| GET `/api/reportes/admisiones` | `server/routes/reportes-admisiones.ts:199` | Algunas lecturas de inscripciones/becas se sustituyen por resultados vacíos o cero. |

Otros casos diferenciados:

- GET `/api/migration/project/:id` (`payments.ts:1550`) convierte una
  falla en 404, **no en éxito 200**.
- POST `/api/caja/pago-efectivo` (`conciliacion.ts:662`) convierte una
  falla de búsqueda en ausencia de cargo; las validaciones posteriores
  pueden rechazarlo. No se afirma que siempre devuelva éxito.
- POST `/api/charges/generate` (`guardian.ts:748`) oculta una falla de
  búsqueda de concepto extraordinario como “no existe”, pudiendo intentar
  crear otro. Sí hay escrituras posteriores: no es una acción vacía.
- GET/POST `/api/migration/status` (`payments.ts:1423`, `:1479`) y POST
  `/api/migration/reset` (`payments.ts:1503`) consultan/modifican un mapa
  **en memoria**, no un progreso durable de importaciones. El cambio del
  mapa ocurre realmente, pero no demuestra migración ejecutada y se pierde
  al reiniciar.
- POST `/api/test-create` (`guardian.ts:2175`) sólo hace eco del body; no
  crea una entidad. Su mensaje dice explícitamente que es una prueba.
- POST `/api/test/reset-auth-rate-limit` (`auth.ts:523`) sí reinicia un
  contador en memoria; no es éxito ficticio. Sin embargo, sigue siendo
  una ruta HTTP condicionada por `NODE_ENV`, incompatible con la regla
  vigente del protocolo de usar utilidades exportadas sin rutas HTTP.
  Se reporta, no se modifica ni se añade ninguna ruta de prueba.
- GET `/api/fiscal/estado-pac` (`fiscal.ts:516`) informa configuración
  guardada, no realiza una comprobación de conectividad. No debe tomarse
  como prueba de aceptación de un CFDI.
- Los endpoints de correo delegan en `EmailService`; las URLs antiguas de
  envío responden configuración requerida / 410, no éxito ficticio. No
  se ejecutó ningún envío real durante este barrido.

## Mantenimiento: operaciones, alcance y fallos

Los tres requieren `SYSTEM.CONFIGURE`, pero las operaciones son globales
en esta base, sin filtro tenant/campus. El análisis es estático; no se
ejecutaron directamente estas acciones. SYS-13/SYS-14 sí llaman al endpoint
de limpieza como parte de la suite, con autorización expresa de Rodrigo.

### POST `/api/admin/cleanup-database`

Ruta `server/routes/system.ts:290`; función
`server/optimize-database.ts:150–180`. Intenta, en orden:

```sql
DELETE FROM sessions WHERE expire < NOW();
DELETE FROM security_events WHERE created_at < NOW() - INTERVAL '90 days';
DELETE FROM approval_notifications
WHERE read = true AND created_at < NOW() - INTERVAL '30 days';
```

No toca `charges`, `payments`, `payment_applications`, `invoices` ni otro
registro financiero. **Borrar `security_events` a los 90 días es una
política de retención por decidir**, no una política aprobada por esta
tarea. Las sentencias no están envueltas en una transacción conjunta:
pueden haberse ejecutado borrados previos si falla una posterior.

Si falla, la función captura la excepción y retorna
`{success:false,error:...}`; la ruta serializa ese resultado con HTTP 200.
Si no llega a ejecutar los DELETE por un error previo, 200 no prueba
que haya limpiado nada. No se corrigió aquí.

### POST `/api/admin/optimize-database`

Ruta `server/routes/system.ts:264`; función
`server/optimize-database.ts:10–98`.

Intenta `CREATE INDEX CONCURRENTLY IF NOT EXISTS`:

| Tabla | Columnas según el código |
|---|---|
| students | campus_id, curp, status, grado |
| guardians | email, rfc |
| payments | student_id, guardian_id, status, created_at |
| charges | student_id, concept_id, status, due_date |
| scholarships | student_id, status, type |
| campuses | tenant_id |
| concepts | campus_id, type |
| student_guardian | student_id, guardian_id |
| pending_approvals | approver_id, status, created_at |
| approval_notifications | user_id, read |

Después intenta `ANALYZE;`. Son los nombres escritos en la función:
**no se validó ni ejecutó este DDL**, ni se afirma que sus columnas
coincidan con el catálogo actual. Modifica índices y estadísticas,
incluidos los de tablas financieras, pero no borra ni actualiza sus
filas de negocio.

Si falla, la función devuelve `{success:false,error:...}` y la ruta
responde HTTP 200. Puede haber operaciones anteriores realizadas; no
se corrigió este comportamiento.

### POST `/api/admin/database-maintenance`

Ruta `server/routes/system.ts:303`; función
`server/optimize-database.ts:184–195`. Invoca secuencialmente:

1. `optimizeDatabase()` — índices y `ANALYZE` anteriores.
2. `checkQueryPerformance()` — SELECT sobre `pg_stats` (users, students,
   payments, charges, guardians) y `pg_stat_user_indexes` de public.
3. `cleanupObsoleteData()` — los tres DELETE anteriores.

No contiene borrado de pagos/cargos/aplicaciones/facturas. Puede modificar
índices/estadísticas de esas tablas, y borrar los datos no financieros
indicados. No hay una transacción común que revierta operaciones previas.

Las funciones internas capturan errores y producen `success:false`.
La ruta responde **HTTP 200 incluso con fallos**, dentro de
`optimization.success`, `performance.success` o `cleanup.success`; no
hay un `success` global que certifique todo el mantenimiento. Sólo una
excepción que escape al manejador exterior produce 500.

## Consultas manuales de preflight (sólo SELECT)

Se usó `DATABASE_URL` con `default_transaction_read_only=on`.

```sql
SELECT current_database() AS database_name,
       shobj_description(oid, 'pg_database') AS environment_marker
FROM pg_database WHERE datname = current_database();
```

Resultado: `database_name=heliumdb`, `environment_marker=edupay:test`.

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'campus_invoicing_config'
     AND column_name IN ('campus_id','tenant_id','proveedor','ambiente','organizacion_id'))
    OR (table_name = 'invoices' AND column_name IN ('estado','payment_id'))
  )
ORDER BY table_name, column_name;
```

| table_name | column_name | data_type |
|---|---|---|
| campus_invoicing_config | ambiente | character varying |
| campus_invoicing_config | campus_id | integer |
| campus_invoicing_config | organizacion_id | character varying |
| campus_invoicing_config | proveedor | character varying |
| campus_invoicing_config | tenant_id | integer |
| invoices | estado | character varying |
| invoices | payment_id | integer |

Las suites tienen sus propias escrituras autorizadas sobre heliumdb.
No se ejecutaron migraciones, DDL manual ni mantenimiento fuera de ellas.

## Verificación de esta rama

Fecha UTC: 2026-10-27. Líneas reales de arranque del workflow:

```text
11:10:20 PM [express] serving on port 5000
11:10:44 PM [express] serving on port 5000
11:13:41 PM [express] serving on port 5000
```

Se reinició antes de cada suite para vaciar límites de peticiones.

`npm run test:safety`:

```text
 Test Files  4 passed (4)
      Tests  58 passed (58)
   Start at  23:10:32
   Duration  4.72s (transform 1.08s, setup 0ms, import 2.32s, tests 356ms, environment 0ms)
```

`npm run test:unit`:

```text
 Test Files  140 passed | 1 skipped (141)
      Tests  1333 passed | 1 skipped (1334)
   Start at  23:10:56
   Duration  143.93s (transform 2.99s, setup 21.35s, import 27.21s, tests 74.08s, environment 12ms)
```

`npm run test:e2e -- --trace=retain-on-failure`:

```text
Running 92 tests using 1 worker
92 passed (5.8m)
```

Reporte JSON: inicio `2026-10-27T23:13:55.008Z`, duración
`349695.733 ms`; 92 esperadas/aprobadas, 0 omitidas, 0 inesperadas,
0 inestables. 32 archivos. EM-02 ejecutada y aprobada.

Pruebas nuevas:

- `server/safety-tests/unavailable-actions-sat.test.ts`: 18 casos
  aislados; autenticación, permiso, 501 exacto sin SQL, configuración
  del proveedor, bloqueo de Live, aislamiento y dos errores de base → 500.
- `e2e/32-fiscal-estadisticas-sat.spec.ts`: dos pruebas de pantalla;
  error HTTP visible sin métricas inventadas y modo sin configurar.
  La captura del error se revisó visualmente.

Comprobación adicional `npm run check`: exit 2, 24 diagnósticos;
ninguno señala los archivos modificados. No se corrigieron ni se volvió
a ejecutar ese comando sobre la base como parte de esta tarea; no se
presenta el chequeo de tipos como aprobado.

Evidencia completa local, excluida de Git:
`generated-artifacts/quitar-exitos-simulados/` (preflight, logs, arranques,
JSON E2E y chequeo de tipos). Las capturas rastreadas que la suite
sobrescribe se restauraron; no forman parte de los commits.

No se verificó aceptación de mensajes, timbrado, conectividad con PAC,
certificaciones de seguridad ni bloqueo efectivo de IP en un proveedor
externo. No se modificaron dependencias, workflows, configuración de
entorno ni el seed.
