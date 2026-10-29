# Barrido de éxitos simulados y errores disfrazados

## RESUMEN

- Rama de revisión desde `506d472`; no se integra en `replit-en-vivo`.
- 19 rutas retiradas: 401 sin autenticación, 403 sin permiso,
  501 `{"code":"NO_DISPONIBLE","message":"No disponible por ahora"}`
  para el usuario autorizado, sin escrituras.
- Migración y validación: `SYSTEM.IMPORT`. Análisis financiero:
  `FINANCIAL.READ`. Los demás permisos y guardas se conservan.
- El detalle institucional conserva solo campus y alumnos reales;
  elimina dinero, usuarios y actividad inventados e informa «No disponible».
  No hay consumidor de esa ruta en `client/src`; no se inventó una pantalla.
- IVA y becas responden `no_evaluado`, con cantidades desconocidas en `null`,
  sin contarlas como categorías aprobadas. Se eliminó POST `/api/test-create`.
- Se eliminaron los fallbacks de las 20 lecturas degradadas del inventario
  y de los dos POST indicados. Una consulta que sí funciona puede devolver
  legítimamente cero o una lista vacía; una consulta fallida no.
- Las pantallas consumidoras ocultan resultados ante error y ofrecen
  «Reintentar». Se mantiene la alerta durante un reintento todavía pendiente.
- La importación real conserva preview, confirmación y resultados reales:
  ya no llama a `/api/migration/status` ni simula porcentaje. El panel de
  migración y `/migracion` y `/migration-refeerence` quedan deshabilitados.

### Rutas retiradas y permisos

| Métodos y rutas | Guarda conservada o aprobada |
| --- | --- |
| POST `/api/fiscal/generar-reporte-contable`, `/api/fiscal/generar-reporte-sat` | Autenticación, `FISCAL.CONFIGURE` |
| GET `/api/security/metrics`, `/api/security/events`, `/api/security/report` | Autenticación, `SECURITY.READ` |
| POST `/api/super-admin/security/scan`, `/api/super-admin/security/block-ip` | `requireSuperAdmin` |
| GET `/api/super-admin/live/revenue`, `/api/super-admin/live/transactions`, `/api/super-admin/analytics/regional`, `/api/super-admin/alerts/executive` | `requireSuperAdmin` |
| GET `/api/financial/analysis`, `/api/financial/analysis/:period` | Autenticación, `FINANCIAL.READ` |
| GET/POST `/api/migration/status`, POST `/api/migration/reset`, GET `/api/migration/progress/:sessionId`, GET `/api/migration/download/:sessionId`, GET `/api/validation/report` | Autenticación, `SYSTEM.IMPORT` |

Las dependencias de interfaz encontradas fueron el panel de migración de
`/importacion-datos`, las dos páginas de migración y los reportes fiscales
retirados. La búsqueda en `client/src`, incluyendo archivos ignorados,
no encontró consumidores de los otros endpoints retirados ni de
`school-details`. No se añadieron controles ficticios para ellos.

## ARCHIVOS MODIFICADOS

| Archivo | Cambio |
| --- | --- |
| `server/routes/unavailable-feature.ts` | Respuesta compartida 403/501 sin SQL ni proveedor. |
| `server/routes/system.ts` | Retiro de seguridad, superadmin y análisis; detalle institucional solo real. |
| `server/routes/fiscal.ts` | Retiro de ambos reportes; consultas de facturas y estadísticas propagan el error. |
| `server/lib/financial-request-validation.ts` | Los reportes retirados ya no pasan por validación de cuerpo antes de su 403/501. |
| `server/routes/payments.ts` | Retiro de estado/progreso/descarga/reporte; guardas aprobadas; validaciones no evaluadas; proyectos sin fallback. |
| `server/routes/guardian.ts` | Eliminación de `/api/test-create`. |
| `server/routes/admin.ts` | Dashboard, becas y saldo a favor sin sustituciones ante fallos. |
| `server/routes/auth.ts` | Historial de ligas mágicas sin lista ficticia por error. |
| `server/routes/charges.ts` | Listado de cargos administrativos propaga el error. |
| `server/routes/conciliacion.ts` | Dashboard, movimientos, estadísticas y lectura previa a conciliar sin éxito degradado. |
| `server/routes/misc.ts` | Planes, dashboard, cuentas, CRM, Caja y cargos sin resultados inventados ante error. |
| `server/routes/reportes-admisiones.ts` | Lecturas parciales de inscripciones y becas invalidan el reporte si fallan. |
| `client/src/components/unavailable-feature.tsx` | Estado «No disponible por ahora» y control deshabilitado. |
| `client/src/components/data-read-boundary.tsx` | Error común, resultados ocultos y reintento de consultas afectadas. |
| `client/src/App.tsx` | Conecta la protección de lecturas y las páginas de migración deshabilitadas. |
| `client/src/components/data-validation-report.tsx` | Presenta `no_evaluado` y cantidades desconocidas sin aprobación falsa. |
| `client/src/pages/importacion-datos.tsx` | Desacopla la importación real del estado retirado; elimina porcentaje automático. |
| `client/src/pages/fiscal-contable.tsx` | Reporte retirado no genera éxito; aviso y control deshabilitado. |
| `client/src/pages/cargos.tsx` | Un HTTP fallido no se convierte en lista vacía en el navegador. |
| `client/src/pages/estudiantes.tsx` | Historial de ligas mágicas no oculta el HTTP fallido. |
| `server/safety-tests/barrido-simulados.test.ts` | 94 casos aislados con manejadores reales y dependencias simuladas. |
| `server/tests/system-db-guards.test.ts` | SYS-16/17 exigen 501, no indicadores de seguridad inventados. SYS-13/14 intactos. |
| `server/tests/rpt06-contable.test.ts` | CON-14 exige 501 sin URL; la exportación contable real permanece. |
| `e2e/34-barrido-simulados.spec.ts` | Error sin cifras y reintento en cuatro pantallas; páginas retiradas. |
| `e2e/31-importacion-incremental-estudiantes.spec.ts` | Conserva comprobaciones reales y añade indicador sin porcentaje y cero llamadas al estado retirado. |
| `docs/BARRIDO-EXITOS-SIMULADOS.md` | Alcance autorizado y estado de la revisión, manteniendo el inventario histórico. |
| `docs/REPORTE-BARRIDO-SIMULADOS.md` | Este reporte y evidencia. |
| `.agents/memory/MEMORY.md`, `.agents/memory/query-errors-and-dialogs.md` | Lección durable sobre portales y consultas deshabilitadas; sin datos personales. |

## MIGRACIONES

Ninguna generada ni aplicada. No se modificaron esquema, paquetes,
`.replit`, configuración de workflows, secretos ni `NEON_DATABASE_URL`.
No se usó «Apply changes», no se publicaron cambios y no se enviaron
peticiones reales a proveedores para reconstruir funciones retiradas.

## PRUEBAS

Fechas y horas de esta sección en UTC, 29 de octubre de 2026
(28 de octubre por la tarde en America/Mexico_City).

### `npm run test:safety`

```text
 Test Files  8 passed (8)
      Tests  365 passed (365)
   Start at  00:09:35
   Duration  6.53s (transform 1.61s, setup 0ms, import 974ms, tests 4.17s, environment 1ms)
```

Los 94 casos nuevos incluyen las 19 rutas retiradas con 401/403/501 y
cero llamadas de escritura/lectura del manejador, las 20 lecturas
degradadas, los dos POST, once fallos parciales de consultas,
detalle institucional, validación no evaluada y eliminación de la ruta.
No usan conexión real.

### `npm run test:unit`

Reinicio real previo:

```text
2026-10-29T00:10:04.619Z [audit-retry] info: audit_retry worker iniciado (intervalo: 30s, max_attempts: 3)
12:10:05 AM [express] serving on port 5000
```

```text
 Test Files  3 failed | 139 passed | 1 skipped (143)
      Tests  5 failed | 1355 passed | 1 skipped (1361)
   Start at  00:10:23
   Duration  130.29s (transform 5.08s, setup 19.42s, import 27.74s, tests 64.18s, environment 11ms)
```

Se repitió **el mismo comando completo** en una copia temporal de
`506d472`, con el servidor de esa copia escuchando en el puerto 5000
en vez del servidor de revisión. No se comparó contra la API modificada.
Línea real del servidor base:

```text
2026-10-29T00:21:11.970Z [audit-retry] info: audit_retry worker iniciado (intervalo: 30s, max_attempts: 3)
12:21:13 AM [express] serving on port 5000
```

Resultado base:

```text
 Test Files  3 failed | 139 passed | 1 skipped (143)
      Tests  5 failed | 1355 passed | 1 skipped (1361)
   Start at  00:21:12
   Duration  138.17s (transform 2.83s, setup 19.88s, import 25.65s, tests 73.20s, environment 11ms)
```

Los cinco fallos son preexistentes por comparación, no por inferencia:

| Archivo y línea | Prueba | Aserción en revisión y base |
| --- | --- | --- |
| `server/tests/beca-individual.test.ts:235` | A-3: vigencia_fin default = vigencia_inicio + 1 año | `expected '2027-10-28' to be '2027-10-29'` |
| `server/tests/consejo-role-guard.test.ts:160` | CON-04b: becas_aplicadas refleja valor real (>= 1) — no 0 por catch silencioso | `expected 0 to be greater than or equal to 1` |
| `server/tests/consejo-role-guard.test.ts:189` | CON-08: regresión POST-RPT05: canónico /api/reportes/consejo → becas_aplicadas >= 1 | `expected 0 to be greater than or equal to 1` |
| `server/tests/rpt07-antiguedad-saldos.test.ts:330` | AGS-07: bucket 1_30 → cargo de frontera exacta 30 días (d=30, 1≤30≤30 → 1_30) | `expected 0 to be greater than or equal to 30000` |
| `server/tests/rpt07-antiguedad-saldos.test.ts:337` | AGS-08: bucket 31_60 → cargo de frontera exacta 31 días (d=31, 31≤31≤60 → 31_60) | `expected 0 to be greater than or equal to 1` |

No se corrigieron reglas de becas, fechas ni buckets para hacerlos pasar.

### `npm run test:e2e -- --trace=retain-on-failure`

Reinicio real previo:

```text
2026-10-29T00:13:00.209Z [audit-retry] info: audit_retry worker iniciado (intervalo: 30s, max_attempts: 3)
12:13:02 AM [express] serving on port 5000
```

La primera corrida completa aprobó `100 passed (6.2m)`, comenzando a
las `00:13:09Z`. Incluye los seis casos nuevos exigidos: cuatro pantallas
con 500/reintento y las dos páginas de migración deshabilitadas.
La importación incremental real verificó 14 altas y un duplicado omitido,
con conteos en PostgreSQL, indicador sin porcentaje y cero peticiones a
`/api/migration/status`.

Tras reforzar el tratamiento local de error del historial y distinguir
consultas activas de consultas deshabilitadas, las seis comprobaciones
de navegador solicitadas volvieron a aprobar en la corrida focal.
Se repite la suite completa con el código final:

Reinicio final real:

```text
2026-10-29T00:33:45.011Z [audit-retry] info: audit_retry worker iniciado (intervalo: 30s, max_attempts: 3)
12:33:45 AM [express] serving on port 5000
```

Inicio del comando: `2026-10-29T00:33:52Z`.

```text
Running 100 tests using 1 worker
  100 passed (6.3m)
```

Se examinó también la captura autenticada del tablero: se ven el aviso
de error y «Reintentar», sin tarjetas financieras ni resultados en cero.
La aplicación se detuvo al terminar; no se desactivó ni se retiró el workflow.

Los resultados y las capturas quedan en `generated-artifacts/` y
`test-results/`, excluidos de Git. Las dos capturas históricas que las
pruebas sobrescriben se conservan fuera del diff de la rama.

### Comprobaciones adicionales

- `npm run build`: aprobado.
- `npm run check:routes`: aprobado.
- `npm run check:migration-policy`: aprobado.
- `npm run check`: salida 2, con 24 diagnósticos. Mismo comando en copia
  temporal de `506d472`: los mismos 24 diagnósticos. Comparación de las
  listas ordenadas, normalizando solo posiciones de línea/columna: idénticas.
  No se afirma que TypeScript apruebe; no aparecen diagnósticos nuevos.
- Se capturó el acceso público. Las pantallas privadas se comprueban con
  Playwright autenticado; la captura pública no se usa para afirmarlo.

## CONSULTAS A LA BASE

Consultas manuales: solo estas tres lecturas. Se comprobaron identidad y
marcador antes del arranque y antes de ejecutar suites con escritura.

```sql
SELECT current_database() AS database_name;
```

Resultado: `heliumdb`.

`DATABASE_MARKER_SQL` de `server/lib/database-safety.ts`, literal:

```sql
SELECT shobj_description(oid, 'pg_database') AS environment_marker FROM pg_database WHERE datname = current_database();
```

Resultado: `edupay:test`. No se cambió el marcador.

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('users','campuses','bank_transactions','crm_prospects')
ORDER BY table_name, ordinal_position;
```

Resultado: 53 columnas, sin valores de personas:
`bank_transactions` 17, `campuses` 8, `crm_prospects` 10, `users` 18.
Confirma `users.email`, `users.campus_id` y
`campuses.onboarding_completado`, usados por la preparación y restauración
del nuevo archivo de navegador. Las escrituras son las de las suites
autorizadas sobre la base de pruebas, no correcciones manuales de datos.

## DOCUMENTACIÓN EXTERNA CONSULTADA

No aplica. Fuentes internas: skill del proyecto, protocolo de auditoría,
inventario del barrido y registros de las ejecuciones.

## LO QUE NO PUDE VERIFICAR

No se reconstruyeron ni se probaron como operativas las funciones retiradas.
No se verificaron servicios de correo, Stripe ni proveedores fiscales con
llamadas reales. Se conserva la omisión de la prueba de Stripe real.

No se declara verificado en navegador el aviso local del diálogo de
historial de ligas, aunque se implementó la condición explícita de error,
su reintento y su estado de carga. Un caso adicional exploratorio no
consiguió llegar al control; no forma parte de los seis casos solicitados
ni de la suite entregada. Se detuvo esa exploración sin alterar reglas de
la app para forzar un resultado:

- `npx playwright test e2e/34-barrido-simulados.spec.ts --trace=retain-on-failure`:
  seis casos solicitados aprobados y un caso adicional fallido al preparar
  un alumno usando `/api/students`; la consulta de tutores devolvió 404.
- `npx playwright test e2e/34-barrido-simulados.spec.ts --grep 'historial en diálogo' --trace=retain-on-failure`:
  un fallo; `/api/admin/students` devolvía 200 con lista vacía, sin alumno
  para esa preparación aislada.
- El mismo comando con identidades de lectura simuladas exclusivamente
  para el experimento: un fallo porque no apareció el control de historial.
  No se afirma una causa del fallo ni se conserva ese experimento como
  prueba aprobada.

## HALLAZGOS FUERA DE ALCANCE (NO CORREGIDOS)

- Los 24 diagnósticos TypeScript coinciden con la base; no se corrigieron
  archivos ajenos para ocultarlos.
- Los cinco fallos unitarios de la tabla anterior se reproducen en la
  base; quedan sin corregir.
- `/api/migration/project/:id` conserva el tratamiento de error como 404
  (`server/routes/payments.ts:1285`); no pertenece a las respuestas 2xx
  degradadas solicitadas.
- Las búsquedas de cargo en el pago en efectivo conservan sus fallbacks
  históricos (`server/routes/conciliacion.ts`); no se cambió el flujo de pagos.
- Mantenimiento conserva 200 con `success:false` cuando falla la operación
  (`server/routes/system.ts:216`, `:242`, `:255`, optimize/cleanup/maintenance).
  La limpieza de `security_events` a los 90 días
  (`server/optimize-database.ts:162`) sigue siendo una política
  de retención por decidir. No se modificaron SYS-13/14 ni se ejecutaron
  directamente acciones de mantenimiento; se ejecutó la suite autorizada.

## RAMA

`barrido-simulados`, base `506d4729d0d0f4b8f5de476cb322677b3064c673`.
Un commit por punto, todos con `[skip ci]`: alcance, retiro, propagación de
errores, pruebas y reporte. No se integra en `replit-en-vivo`.

## COMMIT

El hash completo final y la salida coincidente de
`git ls-remote github refs/heads/barrido-simulados` se entregan en el hilo
después del push únicamente de esta rama de revisión al remoto `github`.
