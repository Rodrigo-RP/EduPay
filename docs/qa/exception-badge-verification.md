# Verificación del badge de excepciones bancarias

## RESUMEN

El sidebar consultaba el conteo una sola vez al montarse. Se restauró la
consulta periódica cada 60 segundos usando únicamente el endpoint de conteo.
Resolver una excepción invalida también ese conteo: el badge se actualiza
sin esperar al siguiente intervalo y desaparece cuando la API confirma cero.

La consulta separa su caché por usuario y campus, se descarta al desmontar
el sidebar y vuelve a consultar al montarse o recuperar el foco.
Un error de actualización conserva el último conteo confirmado, no lo sustituye
por cero.

## ARCHIVOS MODIFICADOS

- `client/src/components/layout/sidebar.tsx`: consulta React Query del conteo,
  polling de 60 segundos y caché separada por usuario/campus.
- `client/src/pages/excepciones-conciliacion.tsx`: invalidación del conteo
  después de una resolución exitosa, tanto al descartar como al aplicar.
- `e2e/isolated/exception-badge.html` y `exception-badge.tsx`: montaje aislado
  de los componentes reales Login, Sidebar y ExcepcionesConciliacion,
  con los proveedores y defaults de React Query de la aplicación.
- `e2e/isolated/exception-badge.spec.ts`: seis escenarios de navegador.
- `playwright.exception-badge.config.ts`: ejecución sólo con Vite, sin
  servidor Express, globalSetup, conexión de base ni fixtures persistidos.
- Este documento: evidencia y límites de la verificación.

## MIGRACIONES

Ninguna.

## PRUEBAS

### Reproducción antes de corregir

Sobre el código de aplicación de la base
`f84a9fb2a264c8b95da106fea29e01ec6ab7a030`:

```sh
npx playwright test --config playwright.exception-badge.config.ts --grep 'polling de 60'
```

Resultado: **1 fallo de 1**. Después de avanzar el reloj del navegador 60
segundos, se esperaban dos solicitudes del conteo pero sólo se recibió una.
El badge seguía mostrando dos pendientes aunque la API simulada tenía cero.
No se afirmó haber reproducido esto contra un endpoint real.

### Resultado después de corregir

```sh
npx playwright test --config playwright.exception-badge.config.ts
```

Resultado: **6 passed (27.9s)**.

1. Resolver dos excepciones por la UI cambia el badge de 2 a 1 y luego lo
   elimina. Continúa ausente al salir, volver y abrir un documento nuevo.
2. Una resolución externa simulada deja el badge sin cambios antes de los
   60 segundos y lo elimina en el siguiente polling sin recargar.
3. Nuevas excepciones vuelven a mostrar el badge en el siguiente polling.
   Al reabrir el documento y entrar a la bandeja se ve la excepción nueva.
4. Aplicar la última excepción a un cargo también elimina el badge.
5. Una respuesta de error al resolver mantiene los pendientes y no muestra
   un mensaje de éxito.
6. Un error al consultar el conteo mantiene el último valor y se recupera
   en el siguiente polling exitoso.

Todas las llamadas `/api/**` se interceptan explícitamente en Playwright.
Las llamadas inesperadas fallan en vez de reenviarse. El login usa datos
ficticios y devuelve el rol `administrador_campus`, campus 48.
Los intervalos se verifican con el reloj virtual de Playwright, no con una
espera física de un minuto. No se usan contraseñas de cuentas existentes.

```sh
npm run test:safety
```

```text
 Test Files  3 passed (3)
      Tests  40 passed (40)
   Start at  22:36:49
   Duration  2.30s (transform 346ms, setup 0ms, import 1.54s, tests 149ms, environment 0ms)
```

Esta suite aislada no inicia Express ni escribe en bases. No requiere la
secuencia de reinicio de servidor prevista para suites HTTP reales.

- `npm run check:routes`: aprobado, 44 rutas y 44 entradas del registro.
- `npm run check:migration-policy`: aprobado.
- `npm run build`: aprobado. Advertencias de Browserslist desactualizado
  y tamaño del bundle; no bloquean la compilación.
- `npm run check`: código de salida 2, con 24 diagnósticos. Se ejecutó
  exactamente el mismo comando en un worktree del commit base; también
  código 2 y los mismos 24 diagnósticos. La comparación de ambas salidas
  no mostró diferencias. Ninguno apunta a los archivos modificados.

Se inspeccionó además la captura del login del montaje aislado. Las
interacciones autenticadas se comprobaron mediante Playwright, no mediante
la herramienta de captura estática.

## CONSULTAS A LA BASE

Ninguna.

## DOCUMENTACIÓN EXTERNA CONSULTADA

No aplica: no se cambiaron integraciones externas.

## LO QUE NO PUDE VERIFICAR

- No se inició sesión real como `admin.campus@jfr.edu.mx`, ni se resolvieron
  excepciones existentes del campus. Esta entrega valida la UI real con una
  API simulada de prueba; no certifica persistencia, aislamiento ni respuestas
  del backend conectado a Neon.
- No se ejecutaron las suites completas Vitest/Playwright que crean o
  modifican datos. La tarea no autoriza esas escrituras.
- No se inició ni reinició el backend: su arranque puede escribir en la base.
  La comprobación visual usó Vite aislado, detenido al finalizar.
- No se verificó la ejecución de polling en pestañas ocultas, donde el
  navegador puede suspender temporizadores. Recuperar el foco consulta de nuevo.

## HALLAZGOS FUERA DE ALCANCE (NO CORREGIDOS)

- Si la primera consulta del conteo falla, el sidebar no distingue
  visualmente entre “sin conteo disponible” y cero pendientes.
- La lista de excepciones usa una caché con `staleTime: Infinity` heredado.
  Volver por navegación interna puede mostrar la lista anterior hasta pulsar
  Actualizar, aunque el badge tenga el conteo nuevo. La prueba de reingreso con
  datos nuevos incluye un documento nuevo para comprobar la carga inicial.

## RAMA

Rama de revisión: `review/exception-badge-refresh`.
Base: `f84a9fb2a264c8b95da106fea29e01ec6ab7a030`.
El hash de entrega y su comparación con el remoto se reportan después de
crear y subir el commit. No se integra ni publica en producción.
