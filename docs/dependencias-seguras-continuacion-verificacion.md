# Dependencias seguras: verificación de la continuación

Fecha: 29 de octubre de 2026. Rama: dependencias-seguras. Base de la continuación: 86f82bd9e94f9f565dab51b02f92698b401ab8a7. La rama original parte de c24b7648b2acb636fc7bf98e05108cb4d291464c. Sin integración a replit-en-vivo.

## Dependencias y reproducción

- Node permanece en 20.20.0; no se cambió .replit ni la configuración de workflows.
- package.json solo cambia en @types/node (20.16.11 → 20.19.43 exacta), jspdf (4.2.1 exacta) y jspdf-autotable (5.0.8 exacta). Comparación automatizada contra la base de continuación: tres entradas y ninguna más.
- @types/node 20.19.43 fue autorizado expresamente después de comprobar en una copia temporal que la versión exacta anterior incumplía el requisito de Vite interno. No cambió Node ni se añadieron any o supresiones.
- npm audit fix --legacy-peer-deps --ignore-scripts --before=2026-10-15T00:00:00Z encontró un bloqueo del firewall al intentar descargar jsPDF 3.0.4. No se eludió. Se resolvió primero el lockfile con --package-lock-only; la sustitución autorizada por jsPDF 4 permitió instalar.
- El lockfile heredado de la resolución legacy tenía una disposición de pares inválida. Se adoptó una resolución limpia generada desde el manifiesto, después de autorizar los tipos. No hubo force, overrides, fijaciones temporales ni restauraciones de versiones. Los rangos originales de los demás paquetes se conservaron.
- npm ci --no-audit --no-fund: salida 0, 973 paquetes instalados en 58 s en el espacio de trabajo.
- En una copia temporal solo de package.json y package-lock.json, sin código de la app, secretos ni configuración: npm ci --no-audit --no-fund, salida 0; 973 paquetes instalados en 47 s. Su npm ls --all --json terminó en 0 y sin problemas. No se utilizó legacy-peer-deps para esas instalaciones limpias.
- npm ls --all en el espacio de trabajo: salida 0, sin invalid ni missing.
- La app estaba detenida durante el bloque de instalaciones; la comprobación previa registró 0 procesos de server/index.ts y 0 listeners de 5000; al terminar el bloque no apareció ningún proceso de la app. Se arrancó deliberadamente después para las pruebas.

### Resumen del lockfile respecto a la base de continuación

| Medida | Resultado |
|---|---:|
| before | 1134 |
| after | 1194 |
| added | 139 |
| removed | 79 |
| changed | 417 |
| directChanged | 80 |

Los paquetes opcionales de otras plataformas están en el lockfile, pero no todos se instalan en Linux. La regeneración explica el tamaño del diff y las actualizaciones compatibles adicionales: ningún paquete directo cambia de versión mayor salvo jsPDF, autorizado; drizzle-orm se mantiene en 0.39.

| Dependencia protegida | Versión final |
|---|---|
| drizzle-orm | 0.39.3 |
| zod | 3.25.76 |
| zod-validation-error | 3.5.4 |
| Vite de la app | 5.4.21 |
| Vite interno de Vitest | 8.3.4 |

xlsx sigue siendo el tarball oficial 0.20.3 del CDN con integridad en el lockfile. express-brute y underscore siguen ausentes.

## PDF

jsPDF 4.2.1 es la versión 4 más reciente que cumple la antigüedad: publicada 2026-03-17T11:16:14.226Z. AutoTable 5.0.8 fue publicada 2026-05-17T21:05:41.957Z y declara compatibilidad con jsPDF 2, 3 y 4.

Cambio mínimo en reportes.tsx: import nombrado documentado por jsPDF. No cambian filtros, contenido ni lógica del reporte. Nueva prueba e2e/35-reportes-pdf.spec.ts (prepara y restaura onboarding del campus del administrador bajo assertTestDatabase, sin cambiar la app): descarga desde la pantalla real, nombre de archivo, bytes %PDF, tamaño >1000 bytes, título de institución, título del reporte, página y terminación %%EOF.

Primera corrida de la prueba nueva: falló la expectativa de capitalización del título. El archivo se había descargado correctamente con el título en mayúsculas. Se corrigió solo la expectativa para reflejar ese contenido existente. No se clasificó como fallo preexistente ni como fallo de la app.

Corrida aislada final: npx playwright test e2e/35-reportes-pdf.spec.ts --trace=retain-on-failure: 1 passed (16.0s); inicio 2026-10-29T13:29:31.262Z.

## Limpieza

Se eliminaron los ocho archivos: penetration-test-simple.js, security-penetration-test.js, test-role-based-filtering.js, test-verificacion-perfiles.js, login_response.json, cookies.txt, temp_token.txt y credenciales-jfr-completadas.md. Ninguno se retuvo. No había referencias en scripts, pruebas o documentación operativa vigente; solo menciones en inventarios de hallazgos y reportes históricos del 17 de julio de 2025. No se copiaron sus credenciales al reporte.

Se eliminaron encryptSensitiveData y decryptSensitiveData de AdvancedEncryption, además de la derivación de clave, configuración, interfaces e imports exclusivos de esos métodos. Búsqueda de consumidores de métodos/tipos en el repositorio: ninguno. Se conserva el hashing de contraseñas y el resto del módulo; no se introduce otro cifrado.

## Pruebas y reinicios

Horas UTC (Ciudad de México = UTC−6). Los reinicios siguientes están respaldados por líneas reales del servidor:

```text
2026-10-29T13:28:00.170Z [audit-retry] info: audit_retry worker iniciado (intervalo: 30s, max_attempts: 3)
1:28:00 PM [express] serving on port 5000
2026-10-29T13:33:58.403Z [audit-retry] info: audit_retry worker iniciado (intervalo: 30s, max_attempts: 3)
1:33:59 PM [express] serving on port 5000
2026-10-29T13:37:04.737Z [audit-retry] info: audit_retry worker iniciado (intervalo: 30s, max_attempts: 3)
1:37:04 PM [express] serving on port 5000
```

- PDF aislado: reinicio 13:28 UTC / 07:28 CDMX.
- Unitarias: reinicio 13:33:59 UTC / 07:33:59 CDMX; inicio de suite 13:34:07 UTC / 07:34:07 CDMX.
- Primera E2E completa: reinicio 13:37:04 UTC / 07:37:04 CDMX.

npm run check: salida 0 después de la actualización de tipos y los cambios de código. No aparecieron errores nuevos que requirieran any, casts o supresiones.

npm run build: salida 0; Vite compiló en 12.27 s y esbuild en 195 ms. Permanece la advertencia de bundles grandes (>500 kB).

npm run test:safety: salida 0. Inicio 13:32:55 UTC / 07:32:55 CDMX.

```text
Test Files  23 passed (23)
      Tests  1001 passed (1001)
   Start at  13:32:55
   Duration  35.05s (transform 4.62s, setup 0ms, import 12.57s, tests 12.27s, environment 2ms)
```

npm run test:unit: salida 0.

```text
Test Files  145 passed | 1 skipped (146)
      Tests  1397 passed | 1 skipped (1398)
   Start at  13:34:07
   Duration  142.10s (transform 5.01s, setup 18.09s, import 30.51s, tests 72.17s, environment 12ms)
```

La prueba omitida es el smoke opcional de Stripe real, condicionado a RUN_STRIPE_E2E=1; no se habilitó ni se hizo un cobro real.

npm run check:routes: salida 0, 44 rutas y 44 registros. npm run check:migration-policy: salida 0. No aplica migraciones.

## E2E completa: ambas corridas

Comando en ambas: npm run test:e2e -- --trace=retain-on-failure.

### Primera corrida

Inicio: 2026-10-29T13:37:16.358Z / 07:37:16 CDMX. Duración JSON: 542983.14 ms.

```text
Running 102 tests using 1 worker
1 failed
101 passed (9.0m)
```

Falló solo PDF-01 (nuevo): timeout buscando el selector de Reportes. El snapshot de Playwright mostraba Centro de Implementación. Se agregó a la propia prueba la preparación y restauración del onboarding, con la guarda de base y tenant/campus del usuario demo, como en pruebas existentes. No se cambió la app.

### Segunda corrida, con la preparación corregida

Reinicio real:

```text
2026-10-29T13:49:44.123Z [audit-retry] info: audit_retry worker iniciado (intervalo: 30s, max_attempts: 3)
1:49:44 PM [express] serving on port 5000
```

Inicio: 2026-10-29T13:50:13.786Z / 07:50:13 CDMX. Duración JSON: 574302.73 ms.

```text
Running 102 tests using 1 worker
1 failed
101 passed (9.6m)
```

**La suite completa NO quedó verde.** PDF-01 pasó (5.6 s), incluyendo descarga y contenido. El fallo fue e2e/09-planes-pago.spec.ts:303, PP-05: Ninguna acción en /planes-pago genera un error 410.

Error: Test timeout of 30000ms exceeded. El cierre interrumpe page.waitForTimeout en la línea 317, después de los clicks del bucle. En la primera corrida PP-05 sí pasó en 23.1 s. No se modificó esa prueba ni la app, ni se corrió una tercera suite para ocultar el fallo.

Clasificación: **sin clasificar**; no se ejecutó en la base con el mismo comando. El hecho de que pase en otra corrida de esta rama no demuestra que sea preexistente ni descarta una regresión.

Evidencia de la segunda corrida: captura, trace.zip, snapshot y JSON se conservaron en generated-artifacts/dependencias-seguras-continuacion/pp05-second-full/ y e2e-final-results.json (ignorados por Git). La captura muestra /planes-pago, un convenio activo y el selector de ciclo desplegado; no una tarjeta de error, lista vacía ni pantalla de carga. El frameUrl /planes-pago está registrado en la traza.

Respuestas /api que sí quedaron registradas en esa traza:

| Método | Ruta | HTTP | Cantidad |
|---|---|---:|---:|
| GET | /api/admin/concepts/53 | 200 | 1 |
| GET | /api/admin/configuracion/onboarding-status | 200 | 1 |
| GET | /api/admin/students | 200 | 1 |
| GET | /api/conciliacion/excepciones/count | 200 | 1 |
| GET | /api/institutional-info | 200 | 1 |
| GET | /api/planes-pago | 200 | 1 |

No se encontró un HTTP 410 en esos eventos; esto no convierte el test con timeout en aprobado.

## Consultas de diagnóstico

Consultas manuales de diagnóstico, todas SELECT:

```sql
SELECT current_database() AS database_name;
SELECT shobj_description(oid, 'pg_database') AS environment_marker FROM pg_database WHERE datname = current_database();
```

Resultados: database_name=heliumdb; environment_marker=edupay:test. La app y las suites se arrancaron después de comprobarlo. No se ejecutaron migraciones ni seeds manuales; las suites usan sus fixtures y la carga demo existente cuando forma parte de sus pruebas.

### Catálogo verificado para la preparación del PDF

Consulta completa y sus seis resultados, sin datos personales:

```text
SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND ((table_name = 'users' AND column_name IN ('email', 'campus_id', 'tenant_id')) OR (table_name = 'campuses' AND column_name IN ('id', 'tenant_id', 'onboarding_completado'))) ORDER BY table_name, column_name
[
  {
    table_name: 'campuses',
    column_name: 'id',
    data_type: 'integer',
    is_nullable: 'NO'
  },
  {
    table_name: 'campuses',
    column_name: 'onboarding_completado',
    data_type: 'boolean',
    is_nullable: 'NO'
  },
  {
    table_name: 'campuses',
    column_name: 'tenant_id',
    data_type: 'integer',
    is_nullable: 'YES'
  },
  {
    table_name: 'users',
    column_name: 'campus_id',
    data_type: 'integer',
    is_nullable: 'YES'
  },
  {
    table_name: 'users',
    column_name: 'email',
    data_type: 'character varying',
    is_nullable: 'NO'
  },
  {
    table_name: 'users',
    column_name: 'tenant_id',
    data_type: 'integer',
    is_nullable: 'YES'
  }
]
```

## Documentación externa consultada

Consultas del 29 de octubre de 2026:

- https://github.com/parallax/jsPDF/releases/tag/v4.2.1
- https://github.com/parallax/jsPDF#usage
- https://github.com/simonbengtsson/jsPDF-AutoTable#usage
- https://cdn.sheetjs.com/advisories/CVE-2023-30533
- https://cdn.sheetjs.com/advisories/CVE-2024-22363
- Metadatos oficiales del registro npm: fechas de publicación, versiones, rangos de pares y npm audit.

## Límites y hallazgos fuera de alcance

- Quedan 24 paquetes señalados por npm audit; la justificación de cada uno está en docs/dependencias-seguras-continuacion-audit.md. No se afirma riesgo cero ni aptitud para producción.
- Persisten el MD5 usado como identificador, dos alertas críticas de tokens en localStorage de E2E y dos logs de IP. Desglose en docs/dependencias-seguras-continuacion-escaneo.md.
- Eliminar archivos con credenciales no revoca secretos ni los elimina del historial Git. La rotación y el saneamiento histórico no se ejecutaron.
- reportes.tsx conserva una plantilla de PDF que muestra totales pendientes de procesamiento junto a una leyenda que afirma usar datos reales. La prueba valida descarga y contenido, no la veracidad de cifras financieras. Conectar/corregir esa plantilla queda fuera del cambio de dependencias.
- La captura de la pantalla pública de acceso carga sin un error visual bloqueante. Su consola mostró un fallo 400 del WebSocket de HMR en la captura local; no se atribuye su origen ni se modificó esa configuración. La prueba de PDF sí verificó el flujo autenticado mediante Playwright.
- La compilación avisa sobre bundles grandes. No se optimizaron fuera de alcance.
- Antes del push se reagruparon únicamente los commits locales aún no enviados desde la base de continuación, para dejar uno por punto y todos con [skip ci]. Se conserva un respaldo local de la historia anterior. No se hizo force ni se fijaron/restauraron versiones; se verificó igualdad del árbol final con el árbol de archivos validados antes de reagrupar.
- No hubo publicación, Apply changes, cambio de Node ni modificación de workflows. No se integró la rama de revisión.

## Estado final de la aplicación

Workflow detenido. Comprobación real 2026-10-29T14:01:39.778285+00:00: 0 procesos de server/index.ts; 0 listeners del puerto 5000 (IPv4 e IPv6). No se deshabilitó ni modificó el workflow.

La rama se entrega para revisión, sin integrar. npm run check, build, test:safety, unitarias, npm ls y la instalación limpia pasaron; no se presenta la E2E completa como aprobada.
