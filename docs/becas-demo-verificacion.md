# Becas demo: verificación del 28 de octubre de 2026

## RESUMEN

El panel y el asistente cuentan alumnos distintos, activos, del campus autenticado,
con una asignación activa y vigente en la fecha local escolar de México.
Las asignaciones se muestran por separado.
Las reglas de descuento sin alumno asignado no generan beneficiarios.

El seed crea 14 hogares, 15 alumnos (incluida una hermana), 10 conceptos y 9
asignaciones vigentes: **Campus Norte: 5 beneficiarios; Campus Sur: 4**.
Ambos campus tienen hogares, cargos y becas en Kinder, Primaria, Secundaria y
Bachillerato. Se probó el reset desde `/demo-setup`.

## ARCHIVOS MODIFICADOS

- `client/src/pages/becas.tsx`: elimina datos locales simulados; deduplica alumnos
  y ahorro; distingue lecturas fallidas de datos vacíos; filtra por nivel;
  permite lectura sin permiso de administrar el catálogo; exporta CSV y texto
  identificados como tales, sin anunciar PDF/Word inexistentes.
- `shared/scholarship-dashboard.ts`: modelo puro de beneficiarios, asignaciones,
  ahorro por alumno y porcentaje medio por asignación.
- `server/lib/scholarship-scope.ts`: definición SQL común para consultas del asistente.
- `server/assistant-actions.ts`: aplica campus, tenant, estado y vigencia en
  conteos, discrepancias, listados y consultas relacionadas.
- `server/assistant-knowledge.ts`: reconoce explícitamente “cuántos becados”.
- `server/routes/admin.ts`: la lectura de becas falla explícitamente ante
  errores de base, sin convertirlos en un listado vacío.
- `server/seed-demo.ts`: corrige conceptos por nivel de Campus Sur; completa
  beneficios y criterios del Sur, tenant de alumnos y acceso al demo ya preparado.
  Conserva las guardas y el respaldo/restauración de `campus_payment_config`.
- `client/src/pages/demo-setup.tsx`: normaliza la lectura JSON de la mutación
  antes del callback de confirmación.
- `server/tests/seed-demo-coverage.test.ts`: comprueba ocho combinaciones
  campus/nivel, hogares completos, cargos compatibles, API/asistente/modelo,
  límites de vigencia, suspendidas, inactivos, duplicados, permisos y otro tenant.
  Los casos adicionales se revierten mediante una transacción.
- `server/safety-tests/scholarship-dashboard.test.ts`: cinco pruebas aisladas del modelo.
- `e2e/becas-demo.spec.ts` y `e2e/becas-demo.config.ts`: recorrido real desde seed
  hasta panel, filtros, modal, descarga y asistente para las dos cuentas.
  No utilizan rutas HTTP de preparación de pruebas.
- `.agents/memory/scholarship-dashboard.md`: criterios de interpretación de los indicadores.

## MIGRACIONES

Ninguna. No se cambió el esquema ni se publicaron cambios.
Las escrituras de seed y fixtures se ejecutaron contra `DATABASE_URL`,
con el marcador físico `edupay:test`, las guardas existentes y la autorización
de esta tarea. No se utilizó la conexión alternativa.

## PRUEBAS

- `npm run build`: aprobado. Advertencias por tamaño de bundles y Browserslist.
- `npm run check:routes`: aprobado, 44 rutas registradas.
- `npm run check:migration-policy`: aprobado.
- `npm run test:safety`:

  ```text
  Test Files  6 passed (6)
       Tests  76 passed (76)
    Start at  17:59:14
    Duration  2.76s
  ```

- `npm run test:unit -- seed-demo-coverage.test.ts z-seed-stripe-preservation.test.ts`:

  ```text
  Test Files  2 passed (2)
       Tests  8 passed (8)
    Start at  17:57:29
    Duration  13.96s
  ```

- `npm run test:unit`, corrida completa anterior a la sincronización. Servidor reiniciado:
  `6:06:05 PM [express] serving on port 5000`.

  ```text
  Test Files  140 passed | 1 skipped (141)
       Tests  1343 passed | 1 skipped (1344)
    Start at  18:06:11
    Duration  134.73s
  ```

- La misma suite completa en la base
  `35a2b936109fd673b6d6641a91fe7ddd2a48c25a`, con servidor de esa base:
  `6:02:51 PM [express] serving on port 5000`.

  ```text
  Test Files  140 passed | 1 skipped (141)
       Tests  1341 passed | 1 skipped (1342)
    Start at  18:02:58
    Duration  151.30s
  ```

  La diferencia de dos pruebas corresponde a las ampliaciones de cobertura del seed.
  En la primera corrida de esta rama falló C-4 de
  `server/tests/condonacion-assistant.test.ts` al no observar una fila de auditoría.
  No se reprodujo ni en la base ni en la corrida final limpia de esta rama.
  No se atribuye una causa ni se etiqueta como un fallo preexistente.

- `npx playwright test --config e2e/becas-demo.config.ts`, antes de sincronizar:
  **3 aprobadas, 25.2s**.
  Servidor iniciado a las `6:14:34 PM`, antes del recorrido.
  Incluye seed real desde la pantalla, cuentas reales del seed para ambos
  campus, comparación con SQL, cuatro niveles, listado del modal, CSV, consulta
  “cuántos becados tengo” y error de lectura sin mostrar cero como éxito.
  La primera corrida detectó que el catálogo exigía permiso de asignación;
  se corrigió la dependencia del panel sin ampliar permisos.
- `npm run check`: 22 diagnósticos globales; el mismo comando en la base
  devolvió 24. No quedan diagnósticos en los archivos modificados.
  Los dos eliminados pertenecían a datos simulados del panel.
- `git diff --check`: aprobado.

### Validación final después de sincronizar con el proyecto principal

La base final es `10a08b1a76fd700c8d2a2dec86e1318a0c0904a7`.
Se conservaron los cambios entrantes de fecha escolar en formulario y consultas,
y se aplicó esa misma fecha al alcance común de becas y a sus pruebas.
No se revirtieron funciones del proyecto principal.

- `npm run build`, `npm run check:routes` y `npm run check:migration-policy`:
  aprobados nuevamente.
- `npm run test:safety`:

  ```text
  Test Files  6 passed (6)
       Tests  76 passed (76)
    Start at  18:17:37
    Duration  2.37s
  ```

- `npm run test:unit`, servidor reiniciado:
  `6:17:12 PM [express] serving on port 5000`.

  ```text
  Test Files  141 passed | 1 skipped (142)
       Tests  1353 passed | 1 skipped (1354)
    Start at  18:17:21
    Duration  157.99s
  ```

  La base sincronizada incluye además las pruebas entrantes de fecha escolar,
  por eso crece el total respecto de la corrida anterior.
- `npx playwright test --config e2e/becas-demo.config.ts`: **3 aprobadas, 35.5s**,
  con servidor iniciado a las `6:20:12 PM`. Comprueba nuevamente ambos campus.
- `npm run check`: 22 diagnósticos, ninguno en archivos modificados; el mismo
  comando en la base sincronizada devuelve 24.

### Corrección de descuentos históricos

La revisión detectó que el resumen mensual reutilizaba indebidamente el alcance
de beneficiarios actuales al sumar cargos históricos. Se eliminó ese requisito:
los descuentos del período se calculan con `charges.beca_aplicada` y
`monto_base_centavos` de cargos emitidos en el período, conservando los filtros
de campus y tenant. La vigencia actual sólo se usa para contar beneficiarios.

La prueba de regresión crea, dentro de una transacción, un cargo de enero de
2025 con 25% sobre $1,000 y un cargo de control fuera del período. Una beca
vigente en enero de 2025 pero vencida hoy debe aportar $250 al período,
aunque los beneficiarios actuales sean cero. También se comprueba que suspender
esa beca no elimina el descuento emitido. Todo se revierte al terminar.

La corrección pasó `npm run build` y la suite completa:

```text
Servidor:   6:24:38 PM [express] serving on port 5000
Comando:    npm run test:unit
Test Files  141 passed | 1 skipped (142)
     Tests  1354 passed | 1 skipped (1355)
  Start at  18:24:47
  Duration  154.39s
```

`npm run check` sigue en 22 diagnósticos frente a 24 en la base, sin diagnósticos
en los archivos modificados. Los recorridos de navegador del panel y del conteo
actual no cambian con esta corrección; sus resultados se conservan arriba.

## CONSULTAS A LA BASE

Estas fueron las consultas manuales de diagnóstico, todas de sólo lectura.
Las consultas de verificación y los fixtures de las suites se conservan
íntegros en los archivos de pruebas enumerados arriba.

```sql
SELECT shobj_description(oid, 'pg_database') AS environment_marker
FROM pg_database
WHERE datname = current_database();
```

Resultado: `edupay:test`.

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = $1 AND table_name = ANY($2::text[])
ORDER BY table_name, ordinal_position;
```

Parámetros: `$1 = 'public'`; `$2 = ['scholarships', 'students', 'families',
'family_students', 'student_guardian', 'concepts', 'guardians']`.

Antes del nuevo fixture histórico se comprobaron además las columnas físicas:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = $1 AND table_name = $2
ORDER BY ordinal_position;
```

Parámetros: `['public', 'charges']`.

```sql
SELECT c.nombre AS campus,
       COUNT(DISTINCT s.id)::int AS alumnos,
       COUNT(DISTINCT sh.student_id) FILTER (
         WHERE sh.vigencia_inicio <= CURRENT_DATE
           AND (sh.vigencia_fin IS NULL OR sh.vigencia_fin >= CURRENT_DATE)
           AND COALESCE(sh.estado, $1) = $1 AND s.status = $2
       )::int AS beneficiarios
FROM campuses c
LEFT JOIN students s ON s.campus_id = c.id
LEFT JOIN scholarships sh ON sh.student_id = s.id
WHERE c.nombre IN ($3, $4)
GROUP BY c.id;
```

Parámetros: `['activa', 'activo', 'Campus Norte', 'Campus Sur']`.
Resultado observado: Norte, 10 alumnos y 5 beneficiarios; Sur, 5 alumnos y 4
beneficiarios.

La comparación final por campus del recorrido de navegador utilizó:

```sql
SELECT COUNT(DISTINCT sh.student_id)::int AS beneficiaries,
       COUNT(*)::int AS assignments
FROM scholarships sh
JOIN students s ON s.id = sh.student_id
WHERE s.campus_id = $1 AND sh.tenant_id = $2 AND s.status = 'activo'
  AND COALESCE(sh.estado, 'activa') = 'activa'
  AND sh.vigencia_inicio <= (NOW() AT TIME ZONE 'America/Mexico_City')::date
  AND (sh.vigencia_fin IS NULL OR
       sh.vigencia_fin >= (NOW() AT TIME ZONE 'America/Mexico_City')::date);
```

Parámetros: Norte `[1, 1]`, Sur `[2, 1]`.
Las cuentas de navegador se eligieron con:

```sql
SELECT u.email, c.id AS campus_id, c.tenant_id
FROM users u
JOIN campuses c ON c.id = u.campus_id
WHERE c.nombre = $1
  AND u.role IN ('administrador_campus', 'admisiones')
LIMIT 1;
```

Parámetro: el nombre del campus en cada recorrido. No se consultaron secretos.

## DOCUMENTACIÓN EXTERNA CONSULTADA

No aplica: no se implementó una nueva integración externa.

## LO QUE NO PUDE VERIFICAR

No se probó producción, no se ejecutaron cobros externos y no se atribuyen
descuentos emitidos a un tipo de beca concreto: esa relación no existe.
El ahorro es acumulado por alumno, no una proyección mensual o anual.
Los desgloses por tipo advierten que pueden compartir alumnos y no son sumables.
La suite global de tipos no está limpia; la comparación con la base se detalla arriba.

## HALLAZGOS FUERA DE ALCANCE (NO CORREGIDOS)

- El modal de documentos de `client/src/pages/becas.tsx` aún muestra estados
  locales y un éxito de carga sin persistencia. Se propuso su corrección separada.
- El seed no garantiza recuperación integral si falla después de limpiar las
  tablas. Se propusieron pruebas de fallo y recuperación separadas.
- La primera corrida completa presentó el fallo no reproducido de auditoría C-4
  ya detallado. No se modificó el flujo de condonación.

## RAMA

Rama inicial: `becas-demo-coherentes`, creada desde
`35a2b936109fd673b6d6641a91fe7ddd2a48c25a`.
Después se sincronizó sobre `10a08b1a76fd700c8d2a2dec86e1318a0c0904a7`.
La revisión final se sube a `becas-demo-coherentes-sincronizada`, sin sobrescribir
por la fuerza la rama anterior.
La configuración temporal del servidor para comparar la base se restauró:
no hay cambios en `.replit`.

## COMMIT

El hash completo y la comprobación
`git ls-remote github refs/heads/becas-demo-coherentes-sincronizada`
se proporcionan en el reporte final de entrega, después del push.
