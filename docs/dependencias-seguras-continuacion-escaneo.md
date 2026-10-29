# Dependencias seguras: segundo escaneo

Fecha: 29 de octubre de 2026. Ejecución de los tres escáneres de Replit, sin Fix all y sin crear tareas. Comparación contra docs/dependencias-seguras-escaneo.md.

| Escáner | Anterior | Actual | Diferencia |
|---|---:|---:|---:|
| Dependencias | 176 (4 críticas, 75 altas, 81 moderadas, 16 bajas) | 25 (0 críticas, 9 altas, 15 moderadas, 1 baja) | -151 |
| SAST | 4 medias | 1 media | -3 |
| Privacidad | 12 (4 críticas, 2 medias, 6 bajas) | 7 (2 críticas, 2 medias, 3 bajas) | -5 |

Estas cifras son registros de cada escáner, no equivalen a los paquetes agrupados por npm audit. El npm audit final se documenta por separado. No se ocultan los hallazgos residuales.

## Dependencias: registros actuales

| Paquete | Versión | Severidad | ID |
|---|---|---|---|
| @vitest/mocker | 4.1.11 | moderate | GHSA-qxg6-89mg-rqv8@@vitest/mocker-4.1.11 |
| @vitest/mocker | 4.1.11 | moderate | GHSA-xp26-3454-mjgp@@vitest/mocker-4.1.11 |
| body-parser | 1.20.8 | high | GHSA-27r3-jxmh-p828@body-parser-1.20.8 |
| cookie | 0.4.0 | moderate | GHSA-pxg6-pf52-xh8x@cookie-0.4.0 |
| deepmerge | 4.3.1 | moderate | GHSA-gcqx-w48m-w2h4@deepmerge-4.3.1 |
| drizzle-orm | 0.39.3 | high | GHSA-gpj5-g38j-94v9@drizzle-orm-0.39.3 |
| esbuild | 0.18.20 | moderate | GHSA-67mh-4wv8-2f99@esbuild-0.18.20 |
| esbuild | 0.19.12 | moderate | GHSA-67mh-4wv8-2f99@esbuild-0.19.12 |
| esbuild | 0.21.5 | moderate | GHSA-67mh-4wv8-2f99@esbuild-0.21.5 |
| multer | 2.4.0 | high | GHSA-q7qp-rjg7-q26m@multer-2.4.0 |
| node-forge | 1.4.0 | high | GHSA-86w9-cpqp-85rv@node-forge-1.4.0 |
| postcss-selector-parser | 6.0.10 | moderate | GHSA-rj75-hqrm-r3gf@postcss-selector-parser-6.0.10 |
| postcss-selector-parser | 6.1.4 | moderate | GHSA-rj75-hqrm-r3gf@postcss-selector-parser-6.1.4 |
| uuid | 8.3.2 | high | GHSA-w5hq-g745-h8pq@uuid-8.3.2 |
| vite | 5.4.21 | moderate | GHSA-4w7w-66w2-5vf9@vite-5.4.21 |
| vite | 5.4.21 | high | GHSA-587h-7wmj-h5pm@vite-5.4.21 |
| vite | 5.4.21 | moderate | GHSA-698v-4r3x-3vcv@vite-5.4.21 |
| vite | 5.4.21 | low | GHSA-9jrq-w75r-8gcw@vite-5.4.21 |
| vite | 5.4.21 | moderate | GHSA-fx2h-pf6j-xcff@vite-5.4.21 |
| vite | 5.4.21 | moderate | GHSA-r825-w8mm-5pxw@vite-5.4.21 |
| vite | 5.4.21 | moderate | GHSA-rq7h-c2jc-7f22@vite-5.4.21 |
| vite | 5.4.21 | moderate | GHSA-v6wh-96g9-6wx3@vite-5.4.21 |
| xlsx | 0.20.3 | high | GHSA-4r6h-8v6p-xvw6@xlsx-0.20.3 |
| xlsx | 0.20.3 | high | GHSA-5pgg-2g8v-p4x9@xlsx-0.20.3 |
| zod | 3.25.76 | high | GHSA-mrhx-c7xc-m3w5@zod-3.25.76 |

## Dos alertas de SheetJS que no corresponden a esta versión

Se mantienen en el conteo bruto del escáner. Sus rangos se representan como introduced:0 sin versión final, aunque las descripciones y los avisos oficiales delimitan los afectados. El proyecto instala xlsx 0.20.3 desde el CDN oficial, con integridad en el lockfile.

- CVE-2023-30533: el aviso oficial afecta hasta 0.19.2 y corrige desde 0.19.3: https://cdn.sheetjs.com/advisories/CVE-2023-30533
- CVE-2024-22363: el aviso oficial afecta hasta 0.20.1 y corrige desde 0.20.2: https://cdn.sheetjs.com/advisories/CVE-2024-22363

Consultados el 29 de octubre de 2026. Son falsos positivos de rango para 0.20.3; no se modificó la librería ni se suprimieron resultados. No equivale a asegurar ausencia de otras vulnerabilidades.

## SAST

Queda un hallazgo MEDIUM en server/security-middleware.ts:225: MD5 para generar un identificador de evento. No es un hash de contraseña. Cambiarlo queda fuera de esta limpieza. Desaparecieron el JWT del archivo raíz eliminado y los dos usos AES-CBC sin consumidores.

## Privacidad: registros restantes

| Severidad | Archivo:línea | Hallazgo |
|---|---|---|
| LOW | e2e/16-admin-rate-limit-navigation.spec.ts:81 | Email sent to Local Storage |
| LOW | e2e/19-asistente-claude-real.spec.ts:399 | Email sent to Local Storage |
| CRITICAL | e2e/19-asistente-claude-real.spec.ts:271 | Auth Token sent to Local Storage |
| CRITICAL | e2e/19-asistente-claude-real.spec.ts:397 | Auth Token sent to Local Storage |
| MEDIUM | shared/security-engine.ts:509 | IP Address sent to Standard Error |
| MEDIUM | server/websocket-manager.ts:54 | IP Address sent to Standard Output |
| LOW | e2e/19-asistente-claude-real.spec.ts:273 | Email sent to Local Storage |

Se retiraron los archivos de prueba raíz que escribían contraseñas, correo o usuario en salida estándar. Persisten dos alertas críticas por tokens de autenticación en localStorage en pruebas E2E existentes. No se modificaron autenticación ni esas pruebas fuera del alcance autorizado. Los logs de IP siguen pendientes.

## Limpieza y límites

Se eliminaron los ocho archivos raíz enumerados por el dueño. Las referencias restantes son inventarios de escaneo y reportes históricos del 17 de julio de 2025, no scripts, pruebas ni instrucciones vigentes de ejecución. Ningún archivo de esa lista se conservó. Eliminar archivos no borra secretos de Git histórico ni revoca tokens: la eventual rotación y saneamiento histórico requieren una tarea autorizada aparte.

No hubo migraciones, cambios de Node, llamadas a servicios de pago ni publicación.
