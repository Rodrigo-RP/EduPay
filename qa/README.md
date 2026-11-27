# Suite de QA de EduPay

Pruebas de comportamiento contra un servidor real y una base **desechable**, escritas durante la evaluación de noviembre de 2026 (ver `docs/qa/plan-qa-2026-11.md`). Cada prueba afirma el comportamiento **diseñado**.

## Cosa importante: estas pruebas fallan a propósito

Hoy fallan varias decenas de pruebas que reproducen 62 defectos documentados (`docs/qa/resultados-fase-*.md`, defectos Q-01 a Q-62). Un fallo no es una prueba rota: es un defecto abierto. **Cuando se corrige un defecto, sus pruebas deben pasar.** Si una prueba contradice una decisión de producto, se discute la decisión y se actualiza la prueba con un motivo escrito; nunca se debilita una prueba para que pase.

Por eso esta carpeta **no la ejecuta el CI** (`playwright.config.ts` solo corre `e2e/`, y `tsc` solo revisa `client`, `shared` y `server`). Cuando un paquete de correcciones termine, sus pruebas ya pasan y pueden promoverse a `e2e/`.

## Seguridad

- Todo corre contra la base `edupay_ci` del contenedor `edupay-pg18` (puerto 54318). `crear-cuentas.mjs` y `levantar-entorno.sh` se niegan a continuar si la base no está marcada `edupay:test`. **Nunca apuntan a producción.**
- Todos los datos son ficticios. Las claves de cada corrida son efímeras y se guardan en `qa/.env.qa.sh`, que git ignora.
- Los resultados (`resultados*.json`, `matriz-fase2*`) también se ignoran.

## Cómo correrla

1. Tener Docker y el contenedor `edupay-pg18` (PostgreSQL 18, usuario `ci_test`, acceso `trust`, puerto 54318). Es el mismo que usa la verificación local del CI. Para crearlo desde cero: `docker run -d --name edupay-pg18 -p 54318:5432 -e POSTGRES_USER=ci_test -e POSTGRES_HOST_AUTH_METHOD=trust postgres:18` **[NO VERIFICADO: lo reconstruí de mis notas; el contenedor existente sí funcionó]**.
2. En una terminal, levantar el entorno (base nueva con seed y cuentas, y servidor en el puerto 5000). Queda corriendo:
   ```
   bash qa/levantar-entorno.sh
   ```
   Espera la línea `QA-LISTO`. Cada ejecución recrea la base desde cero.
3. En otra terminal, desde la raíz del repositorio:
   ```
   source qa/.env.qa.sh
   unset CI
   npx playwright test -c qa/playwright.qa.config.ts qa/fase4-dinero.spec.ts
   node qa/resumen.mjs
   ```
   `resumen.mjs` lista cada fallo con sus observaciones a partir de `qa/resultados.json`. Sin indicar archivo corre todas las suites.
4. Para detener, cerrar el proceso de `levantar-entorno.sh`.

## Qué suite verifica cada paquete de correcciones

| Paquete (`docs/qa/plan-correcciones-2026-11.md`) | Suites |
|---|---|
| P1 saldo único | `fase4-dinero` (describe "C-10 beca y recargo") |
| P2 idempotencia y cierre de caja | `fase4-dinero` (C-43, C-45) |
| P3 emisión de cargos | `fase3-datos` (asignación de precios), `fase4-dinero` (C-07 y C-02) |
| P4 recargos y convenios | `fase4-dinero` (C-13, C-32 y C-35) |
| P5 aprobaciones | `fase1-acceso` y `verif-hallazgos` (aprobar tras rechazar), `fase4-dinero` (C-38 y C-40), `fase6-reportes` (visibilidad, bitácora y notificación) |
| P6 autorización por módulo y alcance | `verif-hallazgos`, `fase1-acceso`, `fase6-reportes` (exportaciones) |
| P7 credenciales y sesión | `fase1-acceso`, `fase3-datos` (alta masiva), `fase5-portal` |
| P8 cifras de reportes | `fase6-reportes` |
| P9 validaciones | `fase3-datos`, `fase5-portal`, `fase6-reportes` |
| P10 importaciones | `fase3-datos` |
| P11 menú, permisos de pantalla y ligas | `fase2-roles` (matriz; analizar con `node qa/analiza-fase2.mjs`), `fase5-portal` |
| P12 limpieza | `fase1-acceso` (mantenimiento de BD), `fase3-datos` (estado de escuela), `fase6-reportes` (`/cuentas`) |

`fase2-roles.spec.ts` no afirma nada: recorre las pantallas de cada rol y deja `matriz-fase2b.json` para `analiza-fase2.mjs`.

## Límites

- Casi todo es por API; las pruebas de navegador son pocas (portal del tutor, matriz de roles y páginas huérfanas).
- Lo que depende de Stripe, Facturapi, un proveedor de correo o una clave de Claude no se prueba de punta a punta (ver cada informe de fase).
- Algunas pruebas dependen de datos que dejan pruebas anteriores de la misma suite (por ejemplo, alumnos creados). La corrida limpia es la de una base recién levantada.
