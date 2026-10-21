# Cierre del seed y preflight de bases candidatas

## Alcance y límites

No se ejecutaron seeds, suites de integración, suites E2E, DDL, índices ni
escrituras de datos. Se detuvo `Start application`: su arranque inicializa
auditoría y su worker puede escribir. No se reinició ni se publicó.

Las pruebas de seguridad usan exclusivamente mocks de base y storage, y un seed
mock para las peticiones HTTP. Las pruebas de rechazo de la función seed real
no alcanzan SQL destructivo.

## Barreras

- Única registración de `POST /api/demo/seed`, montada desde system.
- Middleware real `requireSuperAdmin` antes de invocar el seed.
- `ALLOW_DEMO_SEED` debe ser exactamente `true`.
- La función seed exige `APP_ENV=development` o `APP_ENV=test` antes de SQL.
- El comentario de la base (`pg_database`) debe ser exactamente `edupay:demo`
  o `edupay:test` para seed.
- Vitest y Playwright exigen `edupay:test`; `edupay:demo` no sirve para suites.
- La marca no se crea, repara ni infiere automáticamente. No basta un tenant
  llamado demo ni una variable que afirme que es una base de pruebas.
- Playwright valida antes de su webServer, además de su globalSetup: el arranque
  del servidor ocurre antes del setup global y también puede escribir.
- Las suites quedan intencionalmente bloqueadas sobre bases sin marcar.
  Sólo se debe marcar una base desechable cuya identidad haya confirmado su dueño.
  Una copia que herede el comentario debe revisarse y reclasificarse.

Comando aislado, sin fixtures ni conexión real:

```sh
cd server && npx vitest run --config vitest.safety.config.ts
```

Resultado: 16 pruebas aprobadas. Build aprobado. No se ejecutaron las suites
normales ni se certificó el funcionamiento E2E de los demás módulos.

## Resultados de sólo lectura

| Candidata | Tenants | Campus | Alumnos | Cargos | Pagos | Tenants con fixtures | Campus con fixtures | Marcador |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| DATABASE_URL | 2 | 3 | 15 | 93 | 25 | 1 | 1 | Sin marcador reconocido |
| NEON_DATABASE_URL | No verificable | No verificable | No verificable | No verificable | No verificable | No verificable | No verificable | No verificable |

`NEON_DATABASE_URL` rechaza la conexión con endpoint deshabilitado. Las dos
variables configuran destinos distintos (comparación interna sin revelar host,
usuario, URL ni contraseña). Eso no prueba cuál es producción ni que representen
bases lógicamente diferentes. No se pudo identificar inequívocamente la base real
de JFR ni certificar si coincide con DATABASE_URL. Ninguna cuenta, nombre de
institución ni cantidad de filas basta para esa identificación.

En DATABASE_URL hay dos tenants con nombres que coinciden con el patrón JFR;
ningún campus coincide con ese patrón. Esto tampoco prueba identidad productiva.

Preflight de la candidata accesible (no certificado como producción):

- CURPs duplicadas por `upper(btrim(curp))`, tenant y campus: 0 grupos.
- Matrículas duplicadas por `btrim(id_referencia)`, tenant y campus: 0 grupos.
- No hubo filas duplicadas cuyos IDs/fechas reportar.
- CURPs vacías: 0; matrículas vacías: 0.
- Los 15 alumnos tienen tenant_id NULL: 10 en campus 1 y 5 en campus 2.
  No se corrigió ninguno. Es un bloqueo adicional antes de diseñar unicidad
  por tenant/campus; no asumir que un índice normal protege valores NULL.
- Preflight de la base real JFR: pendiente de identificación y acceso confirmado.

## Consultas exactas ejecutadas

Todas son consultas SELECT; Q4 usa CTEs de lectura (`WITH ... SELECT`).
No se consultaron nombres de alumnos, CURPs completas, matrículas ni credenciales.

### Q1 — columnas

```sql
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('tenants','campuses','students','charges','payments')
ORDER BY table_name, ordinal_position
```

### Q2 — conteos y presencia de nombres de fixtures

```sql
SELECT
(SELECT count(*)::int FROM tenants) AS tenants,
(SELECT count(*)::int FROM campuses) AS campuses,
(SELECT count(*)::int FROM students) AS students,
(SELECT count(*)::int FROM charges) AS charges,
(SELECT count(*)::int FROM payments) AS payments,
(SELECT count(*)::int FROM tenants WHERE nombre_legal ~* '(vitest fixtures|e2e|demo)') AS fixture_tenants,
(SELECT count(*)::int FROM campuses WHERE nombre ~* '(vitest fixtures|e2e|demo)') AS fixture_campuses,
(SELECT count(*)::int FROM tenants WHERE nombre_legal ~* '(jfr|juan.*rulfo)') AS jfr_named_tenants,
(SELECT count(*)::int FROM campuses WHERE nombre ~* '(jfr|juan.*rulfo)') AS jfr_named_campuses
```

### Q3 — marcador reconocido, sin exponer otros comentarios

```sql
SELECT CASE WHEN shobj_description(oid, 'pg_database') = 'edupay:test' THEN 'edupay:test'
WHEN shobj_description(oid, 'pg_database') = 'edupay:demo' THEN 'edupay:demo'
ELSE 'sin marcador reconocido' END AS environment_marker
FROM pg_database WHERE datname = current_database()
```

### Q4 — duplicados normalizados con IDs, alcance y fecha

```sql
WITH normalized AS (
SELECT id, tenant_id, campus_id, created_at,
NULLIF(upper(btrim(curp)), '') AS curp_key,
NULLIF(btrim(id_referencia), '') AS reference_key FROM students
), duplicate_curps AS (
SELECT tenant_id, campus_id, curp_key FROM normalized WHERE curp_key IS NOT NULL
GROUP BY tenant_id, campus_id, curp_key HAVING count(*) > 1
), duplicate_references AS (
SELECT tenant_id, campus_id, reference_key FROM normalized WHERE reference_key IS NOT NULL
GROUP BY tenant_id, campus_id, reference_key HAVING count(*) > 1
)
SELECT 'CURP' AS duplicate_type, n.id, n.tenant_id, n.campus_id, n.created_at
FROM normalized n JOIN duplicate_curps d ON n.tenant_id IS NOT DISTINCT FROM d.tenant_id
AND n.campus_id IS NOT DISTINCT FROM d.campus_id AND n.curp_key = d.curp_key
UNION ALL
SELECT 'matricula' AS duplicate_type, n.id, n.tenant_id, n.campus_id, n.created_at
FROM normalized n JOIN duplicate_references d ON n.tenant_id IS NOT DISTINCT FROM d.tenant_id
AND n.campus_id IS NOT DISTINCT FROM d.campus_id AND n.reference_key = d.reference_key
ORDER BY duplicate_type, tenant_id, campus_id, id
```

### Q5 — vacíos y alcance ausente

```sql
SELECT tenant_id, campus_id, count(*)::int AS students,
count(*) FILTER (WHERE NULLIF(btrim(curp), '') IS NULL)::int AS empty_curps,
count(*) FILTER (WHERE NULLIF(btrim(id_referencia), '') IS NULL)::int AS empty_references,
count(*) FILTER (WHERE tenant_id IS NULL OR campus_id IS NULL)::int AS missing_scope
FROM students GROUP BY tenant_id, campus_id ORDER BY tenant_id, campus_id
```

### Intento fallido Q2-inicial

Antes de corregir el nombre de columna a partir del resultado Q1, se intentó
exactamente Q2 con `nombre` en las dos subconsultas de tenants, en lugar de
`nombre_legal`. El SELECT falló y no se escribió nada:

```sql
SELECT
(SELECT count(*)::int FROM tenants) AS tenants,
(SELECT count(*)::int FROM campuses) AS campuses,
(SELECT count(*)::int FROM students) AS students,
(SELECT count(*)::int FROM charges) AS charges,
(SELECT count(*)::int FROM payments) AS payments,
(SELECT count(*)::int FROM tenants WHERE nombre ~* '(vitest fixtures|e2e|demo)') AS fixture_tenants,
(SELECT count(*)::int FROM campuses WHERE nombre ~* '(vitest fixtures|e2e|demo)') AS fixture_campuses,
(SELECT count(*)::int FROM tenants WHERE nombre ~* '(jfr|juan.*rulfo)') AS jfr_named_tenants,
(SELECT count(*)::int FROM campuses WHERE nombre ~* '(jfr|juan.*rulfo)') AS jfr_named_campuses
```

Orden de intentos: DATABASE_URL Q1, Q2-inicial (falló);
NEON_DATABASE_URL Q1 (conexión rechazada); DATABASE_URL Q1, Q2, Q3, Q4, Q5;
NEON_DATABASE_URL Q1 (conexión rechazada). Sin otras consultas reales de esta
revisión. Las consultas de las pruebas de seguridad son mocks, no SQL remoto.

## Aprobaciones — diagnóstico, sin cambios

Sí: recomiendo retirar `/demo-aprobaciones` del producto operativo. Está montada
separadamente de `/aprobaciones` y sus decisiones muestran éxito y recargan con
temporizador sin aplicar una decisión real. No se retiró en este trabajo.

Para atomicidad de `/api/approvals/decision`:

1. En `server/routes/notifications.ts`, adquirir un único cliente y BEGIN.
2. Leer solicitud con FOR UPDATE, validar que siga pendiente y comprobar
   permisos, tenant/campus y entidad destino dentro del alcance de la solicitud.
   Repeticiones/concurrencia deben rechazar o devolver resultado idempotente.
3. Validar action_type, entity_type, requested_data y estado del destino.
   Bloquear las filas financieras que se modificarán; no aceptar éxito sin
   comprobar filas afectadas. Hoy algunos if pueden no hacer nada y dar éxito.
4. Refactorizar `executeApprovedChange` y los helpers de `server/storage.ts`
   para recibir el MISMO cliente transaccional. No mezclar `pool.query`, `db`
   global y operaciones storage que abran conexiones/transacciones independientes.
5. Aplicar primero el cambio, actualizar decisión y registrar workflow,
   auditoría obligatoria y notificación interna dentro de esa transacción.
   Cualquier fallo debe provocar ROLLBACK y respuesta de error, no approved.
6. Eliminar el catch interno que registra execution_failed y sigue devolviendo
   aprobación exitosa. Si se necesita registrar un intento fallido, hacerlo
   después del rollback y sin cambiar el estado a aprobado.
7. Las entregas externas no son atómicas con PostgreSQL: usar outbox en la misma
   transacción, con entrega posterior idempotente. No prometer rollback de un
   efecto ya enviado a Stripe/email.
8. Para retirar demo, revisar App.tsx, shared/route-registry.ts y referencias;
   conservar la pantalla real `/aprobaciones`.
9. Probar fallo de ejecución, tenant/campus ajenos, solicitudes repetidas,
   concurrencia, acciones sin filas afectadas y errores de notificación/auditoría
   sólo en una base desechable explícitamente marcada.
