# Verificación y audit final

## Estado

Trabajo parcial: express-brute retirado y SheetJS actualizado; las actualizaciones compatibles del punto 5 siguen bloqueadas. No equivale a una aprobación de seguridad.

## npm audit final

Comando: npm audit --json. Salida 1 por vulnerabilidades pendientes.

| Severidad | Inicial | Final |
|---|---:|---:|
| Crítica | 5 | 3 |
| Alta | 25 | 24 |
| Moderada | 18 | 18 |
| Baja | 9 | 9 |
| Total de paquetes afectados | 57 | 54 |

Los tres paquetes críticos restantes son form-data, jspdf y proxy-addr. El escáner de Replit distingue avisos críticos de jspdf cuya corrección exige versión 4, no autorizada; no se asume que una sugerencia genérica de npm resuelva todos los avisos de ese paquete.

### Paquetes pendientes y motivo

Los motivos explican por qué no se modificaron, no justifican aceptar el riesgo ni declaran que sean inexplotables. Avisos, rangos y enlaces completos están en el inventario inicial y el escaneo.

| Paquete | Severidad | Relación | Motivo pendiente |
|---|---|---|---|
| @babel/core | low | Transitiva | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| @babel/helpers | moderate | Transitiva | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| @esbuild-kit/core-utils | moderate | Transitiva | Propuesta incompatible / fuera del rango actual, no autorizada |
| @esbuild-kit/esm-loader | moderate | Transitiva | Propuesta incompatible / fuera del rango actual, no autorizada |
| @sendgrid/client | low | Transitiva | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| @sendgrid/helpers | low | Transitiva | Propuesta incompatible / fuera del rango actual, no autorizada |
| @sendgrid/mail | low | Directa | Propuesta incompatible / fuera del rango actual, no autorizada |
| @tailwindcss/typography | moderate | Directa | Propuesta incompatible / fuera del rango actual, no autorizada |
| @vitest/coverage-v8 | moderate | Directa | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| @vitest/mocker | moderate | Transitiva | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| axios | high | Transitiva | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| body-parser | high | Transitiva | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| brace-expansion | high | Transitiva | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| browserslist | high | Transitiva | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| cookie | low | Transitiva | Propuesta incompatible / fuera del rango actual, no autorizada |
| csurf | low | Directa | Propuesta incompatible / fuera del rango actual, no autorizada |
| deepmerge | low | Transitiva | Propuesta incompatible / fuera del rango actual, no autorizada |
| dompurify | high | Transitiva | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| drizzle-kit | moderate | Directa | Propuesta incompatible / fuera del rango actual, no autorizada |
| drizzle-orm | high | Directa | Actualización excluida expresamente; análisis en el informe de riesgo |
| esbuild | moderate | Transitiva | Propuesta incompatible / fuera del rango actual, no autorizada |
| exceljs | moderate | Directa | Propuesta incompatible / fuera del rango actual, no autorizada |
| express | high | Directa | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| express-session | low | Directa | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| express-validator | moderate | Directa | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| fflate | moderate | Transitiva | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| follow-redirects | moderate | Transitiva | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| form-data | critical | Transitiva | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| glob | high | Transitiva | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| jspdf | critical | Directa | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| jws | high | Transitiva | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| lodash | high | Transitiva | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| minimatch | high | Transitiva | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| multer | high | Directa | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| nanoid | high | Transitiva | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| node-forge | high | Directa | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| on-headers | low | Transitiva | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| path-to-regexp | high | Transitiva | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| picomatch | high | Transitiva | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| postcss-selector-parser | moderate | Transitiva | Propuesta incompatible / fuera del rango actual, no autorizada |
| proxy-addr | critical | Transitiva | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| qs | moderate | Transitiva | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| rollup | high | Transitiva | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| source-map-js | high | Transitiva | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| tmp | high | Transitiva | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| tsx | moderate | Directa | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| uuid | moderate | Transitiva | Propuesta incompatible / fuera del rango actual, no autorizada |
| validator | high | Transitiva | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| vite | high | Directa | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| vitest | moderate | Directa | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| ws | high | Directa | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| yaml | moderate | Transitiva | Corrección propuesta por npm pendiente: resolución de audit fix bloqueada; no se verificó la compatibilidad final ni la antigüedad de la propuesta |
| zod | high | Directa | Actualización excluida expresamente; análisis en el informe de riesgo |
| zod-validation-error | high | Directa | Actualización excluida expresamente; análisis en el informe de riesgo |

## Validación

`npm run check`: salida 0. `npm run build`: salida 0; advierte de chunks mayores de 500 kB.

### Seguridad

Comando: `npm run test:safety`. Inicio del comando 2026-10-29T12:20:35Z, fin 12:21:09Z; salida 0.

```text
 Test Files  23 passed (23)
      Tests  1001 passed (1001)
   Start at  12:20:39
   Duration  29.78s (transform 3.92s, setup 0ms, import 11.05s, tests 10.44s, environment 2ms)
```

### Unitarias

La primera ejecución comenzó a las 12:21:30Z y fue interrumpida por el límite de 240 segundos de la terminal, antes de producir un resumen. No se cuenta como aprobada ni como fallo de una prueba concreta.

Se reinició el servidor antes de repetir la suite completa. Línea real del log del 29 de octubre:

```text
2026-10-29T12:26:11.189Z [audit-retry] info: audit_retry worker iniciado (intervalo: 30s, max_attempts: 3)
12:26:11 PM [express] serving on port 5000
```

Comando: `npm run test:unit`. Inicio 2026-10-29T12:26:33Z (06:26:33 Ciudad de México), fin 12:29:00Z; salida 0.

```text
 Test Files  145 passed | 1 skipped (146)
      Tests  1397 passed | 1 skipped (1398)
   Start at  12:26:34
   Duration  146.15s (transform 8.02s, setup 18.50s, import 32.94s, tests 72.22s, environment 13ms)
```

### E2E completa

Nuevo reinicio previo. Línea real del log:

```text
2026-10-29T12:29:22.582Z [audit-retry] info: audit_retry worker iniciado (intervalo: 30s, max_attempts: 3)
12:29:22 PM [express] serving on port 5000
```

Comando: `npm run test:e2e`. Inicio del comando 2026-10-29T12:29:31Z (06:29:31 Ciudad de México), fin 12:35:06Z; salida 0.

```text
101 passed (5.5m)
```

JSON de Playwright: 35 archivos, inicio 2026-10-29T12:29:33.586Z, duración 332348.955 ms; expected=101, skipped=0, unexpected=0, flaky=0.

Se aprobaron las importaciones reales existentes, entre ellas:

- `e2e/25-caja-conciliacion-bancaria.spec.ts:262`: CSV inválido no escribe; CSV corregido importa y cuenta duplicados.
- `e2e/25-caja-conciliacion-bancaria.spec.ts:444`: PDF BBVA con preview y confirmación.
- `e2e/31-importacion-incremental-estudiantes.spec.ts:85`: archivo CSV por la interfaz, 14 alumnos importados y 1 duplicado omitido.

Estas pruebas no equivalen a cubrir exhaustivamente todo archivo XLSX externo.

La captura del acceso administrativo cargó correctamente. La consola señaló una respuesta 400 en el WebSocket de recarga de Vite; no se corrigió fuera de alcance.

Al finalizar se detuvo el workflow; comprobación de procesos y `/proc/net/tcp{,6}`: cero procesos de la app y cero listeners en 5000. Se restauraron únicamente las capturas versionadas generadas por las pruebas para que no entraran en el diff.

## Base autorizada

Antes de iniciar las suites se ejecutaron únicamente estas consultas manuales de lectura:

```sql
SELECT current_database() AS database_name;
SELECT shobj_description(oid, 'pg_database') AS environment_marker
FROM pg_database WHERE datname = current_database();
```

Resultados: database_name=heliumdb; environment_marker=edupay:test. La consulta del marcador se repitió en la comprobación programática de la guarda y dio el mismo valor. No se ejecutaron migraciones ni seeds manuales; las escrituras de las suites corresponden a sus fixtures autorizados.

## Documentación oficial consultada

- https://docs.sheetjs.com/docs/getting-started/installation/nodejs/
- https://docs.npmjs.com/cli/v10/using-npm/config#before
- https://github.com/advisories/GHSA-gpj5-g38j-94v9
- https://github.com/advisories/GHSA-mrhx-c7xc-m3w5

## Límites

No se actualizó ninguna de las tres dependencias protegidas. No se ejecutaron Fix all, npm audit fix --force, migraciones, Apply changes ni publicación. El análisis de identificadores no sustituye una auditoría exhaustiva; la prueba de Zod no agotó memoria.
