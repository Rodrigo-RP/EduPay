# Tarea C — guardas y diagnóstico de tenant_id

## Alcance

Sin seeds, sin suites conectadas a bases reales, sin backfills, sin DDL,
sin índices, sin cambios de marcadores y sin publicación. El servidor se mantuvo
detenido para evitar las escrituras de su arranque y del worker de auditoría.
Sólo se ejecutaron las dos consultas SELECT que se muestran al final, sobre
DATABASE_URL. No se volvió a intentar la conexión NEON_DATABASE_URL.
DATABASE_URL sigue siendo una candidata cuya identidad productiva JFR no está
confirmada.

## C1 y C2

- `server/seed-demo-data.ts`: antes del primer SQL exige APP_ENV development/test,
  ALLOW_DEMO_SEED=true y marcador físico edupay:demo o edupay:test.
- `server/scripts/restore-vitest-fixtures.ts`: antes de restaurar exige APP_ENV
  development/test y marcador físico edupay:test; no acepta sólo demo.
  Se exportó la función sin ejecución automática al importarla.
- `DatabaseSafetyError` distingue un rechazo explícito de política de un fallo
  operativo. Un fallo de conexión al consultar el marcador no se etiqueta 403.
- `server/routes/demo-seed.ts`: bandera desactivada o guarda rechazada -> 403;
  excepción operativa del seed o resultado success=false -> 500.
  Las respuestas de error no incluyen logs, mensajes SQL ni detalles internos.
- La función seed principal también usa el tipo de rechazo de política para
  su bandera, para no confundir ese rechazo con un fallo operativo.
- APP_ENV production se rechaza antes de cualquier SQL. Para determinar que
  falta el marcador hay que ejecutar su SELECT: se permite únicamente esa
  lectura y se aborta antes de todo INSERT, TRUNCATE, setval u otra escritura.

Pruebas nuevas/adaptadas aisladas:

- Ambos scripts: production -> cero consultas y cero db.insert.
- Ambos scripts: sin marcador -> sólo SELECT de guarda y cero db.insert.
- Restore: marcador demo -> rechazo (requiere test).
- Ruta: DatabaseSafetyError -> 403 sin detalles.
- Ruta: excepción simulada -> 500 sin detalles.
- Ruta: success=false -> 500 sin logs ni error interno.

Se usa `npm run test:safety`; db, storage y el seed invocado por HTTP son mocks.
Nunca se ejecuta un seed autorizado real para probar estas barreras.

Validación final: 23/23 pruebas aisladas aprobadas; build y git diff --check
aprobados. El check global TypeScript devuelve error; no reporta diagnósticos
en los archivos modificados de esta tarea. No se ejecutaron suites reales ni
validaciones UI, y el servidor permanece detenido.

## C3 — resultados

| Tabla | Filas totales | tenant_id NULL | Derivables desde campus | Sin resolución desde campus |
|---|---:|---:|---:|---:|
| students | 15 | 15 | 15 | 0 |
| guardians | 28 | 0 | 0 | 0 |
| families | 14 | 0 | 0 | 0 |
| charges | 93 | 0 | 0 | 0 |
| payments | 25 | 0 | 0 | 0 |

En la segunda consulta tampoco hubo tenants ya asignados que difirieran del
campus usado en el JOIN. Para payments se comprobó sólo la cadena charge_id ->
charges -> students -> campuses, no todas las posibles aplicaciones de pagos.
No se autoriza un backfill financiero general a partir de esa comprobación.

### Inventario estático de omisiones

Se revisaron INSERT SQL, inserts Drizzle y llamadores createStudent/createGuardian/
createCharge/createPayment/createFamily en fuentes server/, scripts/ y e2e/.
Se separaron los inserts que omiten el campo de los helpers que lo reciben
delegado y de las escrituras que sí declaran tenant_id. Referencias de líneas
correspondientes al código de este cambio; no se ejecutó ninguno de estos flujos.
Los sitios con arrays se enumeran como un único punto de inserción.

#### Código de aplicación, importadores y seeds

| Archivo y línea | Tabla | Camino / observación |
|---|---|---|
| server/seed-demo.ts:521 | students | seed principal, alumno del bucle de familias; omite tenant aunque el campus lo conoce |
| server/seed-demo.ts:681 | students | seed principal, alumno hermano; omite tenant |
| server/seed-demo-data.ts:195, :203, :211 | guardians | seed alternativo, tres tutores |
| server/seed-demo-data.ts:220, :229, :238, :248 | students | seed alternativo, cuatro alumnos |
| server/seed-demo-data.ts:268, :283, :298, :313, :328, :384 | charges | seed alternativo, individuales y lotes |
| server/seed-demo-data.ts:466 | payments | seed alternativo, lote de pagos |
| server/import-students-jfr.ts:58 | guardians | importStudentsFromCSV, tutor nuevo |
| server/import-students-jfr.ts:68 | students | importStudentsFromCSV, alumno nuevo |
| server/import-real-data.ts:59 | students | RealDataImporter, alta de alumno |
| server/import-real-data.ts:249 | guardians | findOrCreateGuardian, tutor nuevo |
| server/seed-admissions-data.ts:66 | students | seedAdmissionsData, campus hardcodeado |
| server/assistant-health-checks.ts:753 | charges | auditLayer4_Resilience, prueba de INSERT inválido con ROLLBACK; no es un alta normal |

Total: 22 puntos de inserción que omiten tenant_id en fuentes no-test,
incluido el probe de resiliencia. Ningún INSERT de families omitió el campo
en las fuentes revisadas.

El seed principal ya está protegido, pero su guarda no corrige los datos que
generaría: sus dos inserts de alumnos aún omiten tenant_id. Esto es compatible
con el patrón observado de alumnos sin tenant, pero no prueba por sí solo el
origen histórico de las filas actuales.

**Ruta HTTP adicional relevante:** POST /api/seed-admissions-data está montada en
`server/routes/guardian.ts:734`, llama al seed en :736 y sólo usa authenticateToken.
No tiene las barreras del seed demo. Sigue siendo un riesgo de escritura y una
fuente de alumnos sin tenant; se diagnostica aquí, no se modifica por estar fuera
de C1/C2. La importación de seedAdmissionsData en admin.ts no constituye otro
montaje: no hay allí una llamada encontrada.

El probe de resiliencia sí intenta escribir, aunque usa ROLLBACK. Además usa
una columna `monto` que no corresponde al nombre actual del cargo; no se debe
interpretar cualquier fallo suyo como evidencia de una FK válida. No se ejecutó.

#### Helpers delegados: no fijan ni exigen tenant por sí mismos

| Archivo y línea | Tabla | Resultado de seguimiento |
|---|---|---|
| server/storage.ts:375 | guardians | createGuardian propaga ...insertGuardian; no deriva ni exige tenant |
| server/storage.ts:438 | students | createStudent propaga ...student; no deriva ni exige tenant |
| server/storage.ts:642 | charges | createCharge inserta charge recibido; no deriva tenant |
| server/storage.ts:774 | payments | createPayment inserta payment recibido; no deriva tenant |

No se etiquetan como omisión cierta de todos los llamadores: dependen del objeto
recibido. POST /api/admin/students en admin.ts:685 asigna tenant desde usuario
en :695 antes de llamar createStudent en :697. Los createCharge encontrados en
routes/charges.ts:113, :240, :316, :505 y routes/guardian.ts:971 sí incluyen
tenant_id, aunque algunos usan fallback a student.tenant_id y su no-nulidad
debe validarse antes de imponer NOT NULL. No se encontraron llamadores de
producción a storage.createGuardian/createPayment en las fuentes revisadas.

Los INSERT actuales de las rutas de importación incremental, pagos manuales,
caja/conciliación, alumnos masivos y family-service sí incluyen tenant_id.
Incluir el campo no demuestra que nunca pueda valer NULL/undefined: este
inventario detecta omisiones, no certifica todas las condiciones de ejecución.

#### Fixtures de tests que también omiten tenant_id

| Archivo y línea | Tabla |
|---|---|
| server/tests/family-ledger.test.ts:38 | guardians |
| server/tests/family-ledger.test.ts:56 | charges |
| server/tests/family-ledger.test.ts:65 | payments |
| server/tests/guardian-stripe-transfer.test.ts:151, :157 | guardians |
| server/tests/rpt02-estudiantes.test.ts:196 | guardians |
| server/tests/stripe-spei.test.ts:91 | guardians |

Siete puntos de inserción adicionales de fixtures. No se ejecutaron estas suites.
La guarda de tests no corrige sus objetos; habría que actualizarlos antes de
exigir NOT NULL en la base desechable. No se detectaron omisiones directas en
families ni en e2e/ para estas cinco tablas.

## C4 — propuesta, NO ejecutada

### Orden recomendado

1. Confirmar con el dueño cuál es la base real JFR y disponer de respaldo y
   ventana de intervención. No asumir que ésta sea producción.
2. Corregir todos los productores de filas sin tenant: no basta el backfill,
   porque los seeds/importadores podrían volver a introducir nulos.
   Validar permisos y derivación tenant desde campus autenticado, no del body.
3. Revisar campuses con tenant ausente y referencias huérfanas; asegurar que
   cada campus pertenezca a un solo tenant. Validar también datos archivados.
4. Generar un plan de cambios por IDs con valor anterior, campus y tenant
   propuesto. En esta candidata hay 15 alumnos resolubles, no una autorización
   para modificarlos. Repetir conteos y detectar conflictos justo antes de actuar.
5. Sólo con aprobación, backfill transaccional de students donde tenant_id
   siga NULL: derivarlo de students.campus_id -> campuses.tenant_id. Bloquear
   filas/campus o detener temporalmente altas y cambios de campus; no sobrescribir
   un tenant ya presente. Comparar IDs y cantidad afectada con el plan aprobado.
6. Guardians y families: derivar de su propio campus cuando sea inequívoco.
   Si no tienen campus o sus relaciones cruzan tenants, no elegir un tenant
   arbitrario: revisar y aislar excepciones.
7. Charges: derivar de su student y el campus del student, verificando el tenant
   del concepto y vínculos financieros. Payments: derivar de cargos/aplicaciones
   sólo si todos conducen a un único tenant; validar guardian y fuente.
   No basta elegir el primer cargo o tutor. Excepciones/referencias contradictorias
   requieren resolución explícita, no reasignación automática.
8. En esta candidata no hay nulos que completar en las otras cuatro tablas.
   No proponer tocar sus registros no nulos.
9. Repetir auditoría de alcance, preflight normalizado de duplicados y pruebas
   sobre copia desechable identificada. Verificar filas afectadas y commit/rollback.

### NOT NULL

Sí conviene tenant_id NOT NULL en las cinco tablas tenant-scoped, pero sólo
después de corregir productores, completar/validar datos y confirmar que no
existen tutores o pagos globales legítimos. La identidad global debe modelarse
aparte de la afiliación a un tenant si el producto la requiere.

No aplicarlo ahora: rompería los seeds/importadores/fixtures inventariados.
Proponer migración versionada gradual: validación de no nulos y relaciones,
constraint validable y, tras resolver excepciones, NOT NULL. Hacer coherente
también el contrato/schema de aplicación. Ninguna migración fue creada.

### Índices: tenant+campus frente a sólo campus

- Mantener el contrato vigente de unicidad por tenant/campus para CURP y matrícula.
  Tras el saneamiento, proponer índices únicos sobre
  (tenant_id, campus_id, upper(btrim(curp))) y
  (tenant_id, campus_id, btrim(id_referencia)), excluyendo sólo valores vacíos.
  No excluir alumnos archivados sin una decisión explícita del producto.
- Antes de ello, asegurar tenant_id y campus_id no nulos donde corresponda y
  coherencia de (campus_id, tenant_id) con campuses. Una FK compuesta puede
  asegurarla; requiere diseñar su clave referenciada y migración, no sólo agregar
  tenant_id a un índice.
- Un índice triple normal permite duplicados si tenant_id es NULL. No dejar
  filas sin tenant fuera del índice como solución: ocultaría la deuda de datos
  y la deduplicación de aplicación por tenant seguiría sin encontrarlas.
- Con campus.id globalmente único y campus -> tenant consistente, la unicidad
  por (campus_id, identificador) es lógicamente equivalente dentro de cada campus
  y más compacta. Pero por sí sola no obliga al tenant de una fila a coincidir
  con el campus. No cambiar a campus-only sólo para tolerar nulos.
- Recomendación: sanear primero, conservar tenant+campus por coherencia con el
  aislamiento existente y reevaluar campus-only sólo con una decisión explícita
  y la integridad del vínculo tenant/campus ya garantizada.
- No ampliar a unicidad sólo tenant: eso impediría reutilizar el identificador
  entre campus del mismo tenant y cambiaría la regla de negocio actual.

## Consultas exactas ejecutadas (sólo SELECT)

### Q1 — conteos

```sql
SELECT 'students' AS table_name, count(*)::int AS total, count(*) FILTER (WHERE tenant_id IS NULL)::int AS null_tenant_id FROM students UNION ALL SELECT 'guardians', count(*)::int, count(*) FILTER (WHERE tenant_id IS NULL)::int FROM guardians UNION ALL SELECT 'families', count(*)::int, count(*) FILTER (WHERE tenant_id IS NULL)::int FROM families UNION ALL SELECT 'charges', count(*)::int, count(*) FILTER (WHERE tenant_id IS NULL)::int FROM charges UNION ALL SELECT 'payments', count(*)::int, count(*) FILTER (WHERE tenant_id IS NULL)::int FROM payments
```

### Q2 — resolubilidad y contraste con campus

```sql
SELECT 'students' AS table_name, count(*) FILTER (WHERE x.tenant_id IS NULL)::int AS null_tenant_id, count(*) FILTER (WHERE x.tenant_id IS NULL AND c.tenant_id IS NOT NULL)::int AS resolvable_from_campus, count(*) FILTER (WHERE x.tenant_id IS NULL AND c.tenant_id IS NULL)::int AS unresolved, count(*) FILTER (WHERE x.tenant_id IS NOT NULL AND x.tenant_id IS DISTINCT FROM c.tenant_id)::int AS existing_tenant_conflicts FROM students x LEFT JOIN campuses c ON c.id=x.campus_id UNION ALL SELECT 'guardians', count(*) FILTER (WHERE x.tenant_id IS NULL)::int, count(*) FILTER (WHERE x.tenant_id IS NULL AND c.tenant_id IS NOT NULL)::int, count(*) FILTER (WHERE x.tenant_id IS NULL AND c.tenant_id IS NULL)::int, count(*) FILTER (WHERE x.tenant_id IS NOT NULL AND x.tenant_id IS DISTINCT FROM c.tenant_id)::int FROM guardians x LEFT JOIN campuses c ON c.id=x.campus_id UNION ALL SELECT 'families', count(*) FILTER (WHERE x.tenant_id IS NULL)::int, count(*) FILTER (WHERE x.tenant_id IS NULL AND c.tenant_id IS NOT NULL)::int, count(*) FILTER (WHERE x.tenant_id IS NULL AND c.tenant_id IS NULL)::int, count(*) FILTER (WHERE x.tenant_id IS NOT NULL AND x.tenant_id IS DISTINCT FROM c.tenant_id)::int FROM families x LEFT JOIN campuses c ON c.id=x.campus_id UNION ALL SELECT 'charges', count(*) FILTER (WHERE x.tenant_id IS NULL)::int, count(*) FILTER (WHERE x.tenant_id IS NULL AND c.tenant_id IS NOT NULL)::int, count(*) FILTER (WHERE x.tenant_id IS NULL AND c.tenant_id IS NULL)::int, count(*) FILTER (WHERE x.tenant_id IS NOT NULL AND x.tenant_id IS DISTINCT FROM c.tenant_id)::int FROM charges x LEFT JOIN students s ON s.id=x.student_id LEFT JOIN campuses c ON c.id=s.campus_id UNION ALL SELECT 'payments', count(*) FILTER (WHERE x.tenant_id IS NULL)::int, count(*) FILTER (WHERE x.tenant_id IS NULL AND c.tenant_id IS NOT NULL)::int, count(*) FILTER (WHERE x.tenant_id IS NULL AND c.tenant_id IS NULL)::int, count(*) FILTER (WHERE x.tenant_id IS NOT NULL AND x.tenant_id IS DISTINCT FROM c.tenant_id)::int FROM payments x LEFT JOIN charges ch ON ch.id=x.charge_id LEFT JOIN students s ON s.id=ch.student_id LEFT JOIN campuses c ON c.id=s.campus_id
```

Los SELECT de las pruebas de guardas fueron mocks; no se enviaron a una base.
