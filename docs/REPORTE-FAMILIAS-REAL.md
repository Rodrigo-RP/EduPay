# Familias: persistencia y archivado

## RESUMEN

La Parte A integró `barrido-simulados` mediante avance directo. Tanto
`replit-en-vivo` local como remoto quedaron en
`747f9b9cb486aed402a2d05bc38fd9b864072882`.

La Parte B se implementó en `familias-real`, desde esa base, sin integrarla.
Alta, edición y cambio de estado pasan por `manageFamily` en
`server/lib/family-service.ts`. Las escrituras y la auditoría comparten
transacción; una falla revierte también la familia y los tutores ya insertados.
La importación CSV conserva su contrato de vinculación a tutores existentes;
el alta manual rechaza duplicados con 409, en vez de reutilizarlos silenciosamente.

### Contrato y permisos

- Lectura: `FAMILIES.READ`. El campus de la URL debe coincidir con el de la sesión.
- Alta: `FAMILIES.CREATE`.
- Edición y archivo/reactivación: `FAMILIES.UPDATE`. Se conserva además la
  restricción administrativa existente: superadministrador, administrador
  general o administrador de campus. No se agregó ningún permiso ni rol.
- Tenant, campus y actor se obtienen de la sesión autenticada, nunca del cuerpo.
  Editar/archivar una familia ajena devuelve 404. Los tutores editados deben
  pertenecer a esa familia y al campus/tenant de la sesión.
- Se conserva la vinculación obligatoria a por lo menos un alumno del campus.
  El alta exige que esos alumnos todavía no estén en otra familia.
- Hay al menos un tutor; puede ser madre u otro, sin padre. En la pantalla de
  alta el primer tutor es el responsable principal. Se conserva la regla
  previa de que las responsabilidades de pago sumen 100.
- CURP/RFC son opcionales porque las columnas aceptan nulos; cuando se
  proporcionan se validan con el formato CURP del módulo existente y RFC de
  persona física de 13 caracteres. No se consulta RENAPO ni SAT.
  El correo, nombres y primer apellido son obligatorios.
- Código postal, cuando se proporciona, tiene cinco dígitos. Los teléfonos
  proporcionados se validan y normalizan a `+52` seguido de diez dígitos.
- CURP o correo ya registrados en la institución: 409. Si la familia pertenece
  al mismo campus, se indica su número. No se revela el identificador de una
  familia de otro campus; se indica el conflicto institucional. Un tutor
  existente sin familia vinculada se informa como tal, sin inventar una familia.
  Altas/ediciones manuales concurrentes toman bloqueos transaccionales por las
  claves de identidad, sin crear índices.
- El servidor devuelve `numero_familia`, derivado del ID asignado por la base.
  No se agrega una columna ni se calcula el número en la pantalla.
- Archivo: motivo no vacío, dos confirmaciones, `archived_at`, `archived_by`;
  sin borrar expedientes. Se bloquean los cargos antes de comprobar su saldo:
  monto neto de beca más recargos menos aplicaciones reales de pago; los
  cancelados/condonados no bloquean el archivo. Un saldo pendiente devuelve 409.
  La invalidación previa de sesiones/ligas de tutores se conserva.
- Repetir un archivo ya realizado no duplica la auditoría. La lectura oculta
  archivadas por defecto; `?status=archivada`/`all` permiten el filtro explícito.
- Auditoría: actor, campus y campos cambiados; motivo de archivo. CURP/RFC
  aparecen sólo enmascarados, también si se escriben dentro del motivo.
  Las respuestas de error 500 no exponen el error SQL ni sus parámetros.
- La interfaz espera la confirmación del servidor antes del éxito y recarga
  la lista por HTTP. No añade familias sólo al estado de React.

### Datos por tutor y campos retirados del formulario activo

Se escriben y vuelven a leer las columnas existentes de `guardians`:

| Captura | Columnas |
|---|---|
| Identidad | `tipo_guardian`, `nombres`, `apellido_paterno`, `apellido_materno`, `curp`, `rfc` |
| Contacto | `correo_institucional_familiar`, `email` sincronizado, `celular`, `telefono_casa_oficina` |
| Domicilio | `calle`, `numero_exterior`, `numero_interior`, `colonia`, `codigo_postal`, `municipio`, `estado` |
| Emergencia | `contacto_emergencia_nombre`, `contacto_emergencia_telefono`, `contacto_emergencia_relacion` |

El nombre completo se compone en el servidor. Tenant/campus no son editables.
Se retiraron de la captura individual: ocupación y empresa de padre/madre;
estado civil y observaciones; domicilio/ciudad familiar independientes del
domicilio de cada tutor; razón social y RFC familiar independientes; la captura
de múltiples perfiles fiscales y sus indicadores de principal, correo de
facturación, dirección fiscal, uso CFDI, método y forma de pago; usuario,
contraseña y referencias separadas de
padre/madre. No se simula su guardado. El RFC solicitado se conserva por tutor.
El número familiar dejó de ser una captura/generación local.

La página conserva el importador CSV real y sus pasos preview/confirmación.
El JSX individual heredado queda inactivo dentro de su pestaña no montada:
la única captura individual accesible es `FamilyEditor`. No se hizo una
reescritura de los filtros, vistas y demás funciones de la página.

### Única excepción de reemplazo de expedientes

`POST /api/demo/seed` y el botón **Cargar datos demo** se conservan sin cambios
de comportamiento. Es la única ruta autorizada para reemplazar familias,
tutores y alumnos mediante el seed, no una operación ordinaria de expedientes.
Sus guardas son conjuntas: superadministrador, `ALLOW_DEMO_SEED=true`,
`APP_ENV` no productivo y marcador físico `edupay:test` o `edupay:demo`.
La autorización no se extiende a otras rutas por estar en desarrollo.

Se documentó la excepción en `server/routes/demo-seed.ts` y se excluye
exclusivamente por el nombre `POST /api/demo/seed` en el inventario de no borrado.
Una prueba adicional usa la ruta y seed reales, con base simulada: producción,
sin habilitación o sin marcador devuelven 403 sin ninguna escritura/borrado.
`e2e/17-demo-setup.spec.ts` no se modificó: sigue cubriendo la carga demo real.
El reemplazo demo sólo se ejecuta como parte de esa suite autorizada.

## ARCHIVOS MODIFICADOS

- `server/lib/family-service.ts`: operaciones transaccionales, campos reales,
  validación, duplicados, bloqueo por deuda, archivo y auditoría.
- `server/routes/admin.ts`: delegación al servicio, permisos/contexto y errores
  de servidor sin detalles internos.
- `server/routes/misc.ts`: listado con número asignado por servidor, campos
  completos, pertenencia por campus/tenant y filtro de archivadas.
- `server/routes/demo-seed.ts`: sólo comentario de la excepción autorizada.
- `client/src/components/family-editor.tsx`: captura real y doble confirmación.
- `client/src/pages/familias.tsx`: conexión al formulario, recarga real, número
  de servidor, archivo/filtro y retiro del alta ficticia en memoria.
- `server/tests/families-real.test.ts`: 20 casos sobre la base de pruebas.
- `server/tests/family-create-manual.test.ts`: fixtures compatibles con los
  campos/formatos del contrato nuevo; FCM-02/04 ahora exigen 409 sin vincular.
- `server/tests/family-archive-portal.test.ts`: motivo y dos confirmaciones
  en las solicitudes de archivo; conserva las aserciones de acceso al portal.
- `server/safety-tests/family-no-delete.test.ts`: inventario de rutas mediante
  AST, sin DELETE de entidades ni SQL destructivo salvo la excepción nombrada.
- `server/safety-tests/demo-seed-real-guards.test.ts`: las tres negativas
  atraviesan las guardas reales, sin conexión a una base real.
- `e2e/32-familias-real.spec.ts`: madre sola, datos completos, recargas,
  edición persistida, archivo con motivo/confirmaciones y filtro.
- `.agents/memory/database-environment-safety.md`: autorización de limpieza
  de fixtures propios y frontera de la excepción demo.
- Este reporte.

## MIGRACIONES

Ninguna. No se ejecutó `db:migrate`, no se creó/modificó ningún índice,
constraint ni marcador. Sin cambios a `.replit`, dependencias o Secrets.
Se usaron las columnas inspeccionadas de la base existente.
`check:migration-policy` pasó; ese comando no aplica migraciones.

## PRUEBAS

Base verificada antes de escribir: `heliumdb`, marcador `edupay:test`.
Los teardowns sólo borran los registros que cada prueba creó, como se autorizó.

Seguridad, comando completo `npm run test:safety`:

```text
Test Files  10 passed (10)
     Tests  371 passed (371)
  Start at  01:45:09
  Duration  15.79s (transform 3.43s, setup 0ms, import 4.09s, tests 7.99s, environment 1ms)
```

Fecha UTC: 2026-10-29; hora CDMX: 2026-10-28 19:45:09.

Unitarias, comando completo `npm run test:unit -- --reporter=verbose`:

```text
Test Files  143 passed | 1 skipped (144)
     Tests  1380 passed | 1 skipped (1381)
  Start at  01:47:28
  Duration  117.10s (transform 2.47s, setup 18.67s, import 23.71s, tests 56.75s, environment 11ms)
```

Fecha UTC: 2026-10-29; inicio CDMX: 2026-10-28 19:47:28.
Líneas reales del reinicio anterior a esa suite:

```text
2026-10-29T01:47:18.837Z [audit-retry] info: audit_retry worker iniciado (intervalo: 30s, max_attempts: 3)
1:47:18 AM [express] serving on port 5000
```

La base tenía 1,360 aprobadas y una omitida; se agregaron 20 casos de familias.
La prueba de Stripe Connect omitida no se presenta como comprobación real.
La primera ejecución completa agotó 180 segundos sin resumen; no se contó como
aprobada. La ejecución posterior completa, con reporte detallado, terminó con
el resultado anterior. No se atribuye una causa no demostrada a ese timeout.

Antes de las suites completas, la selección de familias pasó 30/30. La primera
selección detectó cinco fixtures/expectativas del contrato manual antiguo:
los dos casos de reutilización se actualizaron a 409 y se completaron los
campos/formato de los otros tres. No se clasificaron como “preexistentes”.
El recorrido nuevo de navegador pasó 1/1; inicialmente detectó que la lista no
tenía un botón directo de edición y se agregó. Se conservó su traza de fallo.

E2E completa, comando `npm run test:e2e -- --trace=retain-on-failure`:

```text
Running 101 tests using 1 worker
101 passed (6.2m)
```

El reporte JSON registra 35 archivos, 101 aprobadas, 0 omitidas, 0 inesperadas,
0 inestables; inicio `2026-10-29T01:50:21.561Z`, duración `370569.992 ms`.
Inicio CDMX: `2026-10-28 19:50:21.561`. La carga demo de la prueba 17 y el
caso nuevo de familias se ejecutaron y aprobaron, al igual que EM-02.
Líneas reales del reinicio anterior:

```text
2026-10-29T01:50:08.675Z [audit-retry] info: audit_retry worker iniciado (intervalo: 30s, max_attempts: 3)
1:50:08 AM [express] serving on port 5000
```

Después se detuvo `Start application`. Se inspeccionaron `/proc/net/tcp` y,
si existía, `/proc/net/tcp6`: `LISTEN puerto 5000: []`. La lectura final volvió
a devolver `heliumdb` y `edupay:test`. Las dos capturas rastreadas que generan
otras pruebas se copiaron a evidencias ignoradas y se restauraron a su estado
original; no se incluyen imágenes en el diff.

Además: build, catálogo de rutas y política de migraciones aprobados.
`npm run check` devuelve 24 diagnósticos. Comparados con
`generated-artifacts/barrido-correcciones/types.log` de la base, normalizando
sólo línea/columna, hay cero diagnósticos nuevos y cero eliminados.
No se presenta TypeScript como aprobado.

Evidencias locales en `generated-artifacts/familias-real/`, ignoradas por Git:
logs completos, reinicios, comparación TypeScript y traza/captura del primer
recorrido fallido. La captura pública comprobó el acceso administrativo;
el recorrido autenticado se comprobó con Playwright, sin bypass de autenticación.

## CONSULTAS A LA BASE

Consultas manuales de inspección, sólo lectura, antes de los fixtures:

```sql
SELECT current_database() AS database_name;
-- Resultado: heliumdb

SELECT shobj_description(oid, 'pg_database') AS environment_marker
FROM pg_database WHERE datname = current_database();
-- Resultado: edupay:test

SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('families','guardians','family_students','student_guardian')
ORDER BY table_name,ordinal_position;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname='public' AND tablename IN ('families','guardians')
ORDER BY tablename,indexname;

SELECT table_name,column_name,data_type
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('audit_log','charges','payment_applications','magic_link_tokens','users')
ORDER BY table_name,ordinal_position;
```

La inspección confirmó los campos de tutores/archivo y que no existe columna
para número ni motivo familiar: número derivado del ID en servidor y motivo
en auditoría. En `guardians` sólo se encontraron la PK y el índice de cliente
Stripe: no se supuso una restricción única de CURP/correo ni se creó una.
Los bloqueos transaccionales de la gestión manual no son índices.

Las consultas de escritura autorizadas pertenecen a las suites: altas/ediciones
y archivo por HTTP; fixtures de alumnos/cargos; rollback real con fallo
controlado al insertar el segundo tutor; limpieza por IDs de registros propios.
Las consultas completas parametrizadas se encuentran en los archivos de
pruebas y en el servicio, no en scripts ad hoc. No se corrigieron registros
históricos ni se ejecutó un seed manual.

## DOCUMENTACIÓN EXTERNA CONSULTADA

No aplica: no se añadió ni cambió ninguna integración externa. Se utilizó el
validador CURP existente; la validación local no certifica inscripción oficial.

## LO QUE NO PUDE VERIFICAR

- Registro real de CURP/RFC ante RENAPO/SAT: sólo formato local.
- Un pago real de Stripe: no forma parte de esta tarea ni de la prueba omitida.
- La causa exacta del primer timeout de unitarias: no se inventa un diagnóstico.

## HALLAZGOS FUERA DE ALCANCE (NO CORREGIDOS)

- Los 24 diagnósticos TypeScript de la base se conservan.
- El JSX individual heredado permanece inactivo en la página para no reescribir
  el importador y las demás vistas. No constituye una segunda captura accesible.
- `storage.getFamilyBalance` conserva su cálculo previo a partir de montos
  base; no se reescribió el cálculo de todos los indicadores del listado.
  El bloqueo de archivo sí utiliza importe neto y aplicaciones de pago.

## RAMA

`familias-real`, descendiente de `747f9b9`. No integrada a `replit-en-vivo`.

## COMMIT

Un commit por punto, todos con `[skip ci]`. El hash final de la rama y la
igualdad con `git ls-remote` se reportan después del commit de este documento.
