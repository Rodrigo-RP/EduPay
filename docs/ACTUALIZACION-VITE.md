# Actualización de Vite

Base: `7dce7c9`. Fuentes consultadas el 31 de octubre de 2026:

- https://v6.vite.dev/guide/migration (5 → 6).
- https://v7.vite.dev/guide/migration (6 → 7).
- https://vite.dev/guide/migration (7 → 8).

## Efectos en EduPay

| Cambio | Aplicación |
| --- | --- |
| Vite 6 cambia las condiciones de resolución y la carga de PostCSS | No hay condiciones personalizadas; PostCSS usa su configuración JavaScript existente. No se añaden Sass ni SSR. |
| Vite 7 exige Node 20.19+ o 22.12+ | El entorno tiene Node 20.20.0; CI instala Node 20. No se cambia el runtime. |
| Vite 7/8 elevan los navegadores mínimos predeterminados | `build.target` declara explícitamente los de Vite 5: es2020, Chrome 87, Edge 88, Firefox 78 y Safari 14. |
| Vite 8 sustituye Rollup/esbuild por Rolldown/Oxc para el cliente | Se conserva la configuración de aliases y la salida. No había manualChunks ni transformaciones esbuild personalizadas que convertir. |
| Vite 8 usa Lightning CSS al minificar y cambia interoperabilidad CommonJS | Se verifican build, recursos del bundle y renderizado de producción, además de las suites existentes. No se activa el modo legacy para ocultar incompatibilidades. |
| Plugin React 6 usa el pipeline de Vite 8 | Se instala 6.1.2; EduPay no configura Babel ni React Compiler. |
| Vite 8.3.4 exige como par opcional esbuild 0.27/0.28 | La instalación inicial con el esbuild directo 0.25 fue rechazada por npm. Se actualiza a 0.28.2; el empaquetado del servidor sigue siendo esbuild con las mismas opciones. |

Se fijan Vite **8.3.4**, plugin React **6.1.2** y esbuild **0.28.2**.
Se retira `@tailwindcss/vite`: no tenía consumidores. Tailwind 3 conserva
su integración PostCSS.

Los plugins de Replit conservan sus versiones: cartographer **0.2.8** y
runtime-error-modal **0.0.3**. No declaran una restricción de pares de Vite
y la actualización no requiere sustituirlos.

En `server/vite.ts` se declara el tipo `ServerOptions`, sin el cast anterior,
y sólo se corrige la pila cuando lo capturado es realmente un `Error`.
Se conservan las opciones de middleware y HMR.

## Tamaño de referencia

`npm run build` sobre la base, antes de instalar:

- `dist/public`: **2,589,599 bytes**, cuatro archivos.
- Suma de los archivos comprimidos individualmente con gzip: **649,514 bytes**.
- El build del cliente tardó **23.08 segundos**.

El paso de producción del CI informa el tamaño final del cliente y del
servidor. El tiempo de una sola compilación no es una prueba de rendimiento
de la aplicación.

## Smoke de producción en CI

Tras el build, CI clona el esquema desechable ya migrado a
`edupay_production_smoke_ci`, sin aplicar migraciones adicionales.
`npm run start` usa APP_ENV y NODE_ENV de producción, sin permitir seeds.
La guarda de producción se mantiene: la base temporal nueva no tiene
marcador de pruebas/demo.

El adaptador de transporte separado sólo admite CI, el usuario `ci_test`,
el puerto 5432 y ese nombre exacto de base en loopback. No modifica el
adaptador habitual ni se carga en la aplicación publicada.

Se comprueban el HTTP 200 y los bytes de todos los archivos del bundle,
la página principal renderizada en Chromium, errores JavaScript y el
HTTP 200 de los recursos efectivamente cargados, incluidos los externos.
Se informa el tamaño sin comprimir/gzip y se detiene el proceso incluso
si falla la prueba. La base temporal se elimina al terminar.

## Correcciones compatibles de seguridad

Se ejecutó `npm audit fix --legacy-peer-deps`, nunca `--force`.
Cambios de las cuatro dependencias altas:

- body-parser 1.20.8 → 1.20.9.
- follow-redirects 1.16.1 → 1.16.2.
- multer 2.4.0 → 2.5.0.
- node-forge 1.4.0 → 1.4.2.

La resolución automática dejó Vitest 4.1.12 junto a coverage-v8 4.1.11,
con pares incompatibles. Se alinearon ambos en la línea 4.1.12, sin
ignorar el resultado de `npm ls`. La instalación normal y `npm ci` en
una copia limpia terminaron correctamente; ambos árboles pasaron
`npm ls --all`.

Auditoría final local: **21 pendientes, 6 bajas y 15 moderadas;
cero altas y cero críticas**. Vite y Drizzle ORM ya no aparecen.

Los pendientes se agrupan en:

- Drizzle Kit / esbuild-kit / esbuild: npm propone retroceder Kit a
  0.18.1 con cambio incompatible; se conserva el migrador verificado.
- ExcelJS / archiver / glob / minimatch / uuid y derivados: la propuesta
  global exige retroceder ExcelJS a 3.4.0; no se cambia su API.
- typography / postcss-selector-parser: npm propone otra línea de
  typography, fuera de las correcciones compatibles autorizadas.
- SendGrid / deepmerge y csurf / cookie: las propuestas globales son
  retrocesos incompatibles de sus dependencias principales.

`@sendgrid/client`, `rimraf` y `zip-stream` indican además
`fixAvailable: true`. Se intentó su actualización compatible con
`npm update @sendgrid/client rimraf zip-stream --ignore-scripts`;
los avisos permanecieron. No se presentan como corregidos ni se
introducen overrides para forzar versiones fuera de los rangos de
los padres.

## Evidencia de PPX-05

Los CI 41083388666 y 41087348673 no tienen artefactos:
`GET /repos/Rodrigo-RP/EduPay/actions/runs/<id>/artifacts` devuelve
`total_count: 0`. El workflow anterior sólo subía evidencias si el job
fallaba, y una prueba que pasaba al reintentarse no activaba ese paso.
Además, `on-first-retry` no grababa la primera ejecución fallida.

El log de 41087348673 sitúa el fallo en `openPlanes`, al esperar el
encabezado después de cambiar al campus B. No es suficiente para afirmar
que el fallo pertenece a la prueba o a la app. Los otros artefactos
disponibles contienen PPX-05 aprobado u omitido, no esa traza fallida.
No se cambia la prueba basándose únicamente en una hipótesis.

CI ahora conserva trazas de la primera ejecución fallida, deshabilita
los reintentos y sube los reportes también en verde. Repite diez veces
el archivo completo porque PPX-05 usa el convenio creado por los casos
anteriores del grupo serial. No cambia aserciones ni límites de tiempo.
