# Resultados de la fase 0 (línea base automatizada)

Fecha: 26-nov-2026. Commit: `8400ba6` (rama `puente-firebase`, árbol de trabajo sin cambios salvo archivos nuevos de `docs/qa/` y `.vscode/`). Entorno: Windows 11, Docker, contenedor `edupay-pg18` (PostgreSQL 18), base desechable `edupay_ci` marcada `edupay:test`, `APP_ENV=test`, `TZ=UTC`, secretos efímeros y claves de Stripe falsas. Producción no se tocó.

## Resultado

| Comprobación | Resultado |
|---|---|
| Migraciones sobre base nueva | 12 de 12 registradas |
| Esquema idéntico al catálogo (antes y después de correr todas las pruebas) | 12 categorías, cero diferencias; las pruebas no dejaron DDL nuevo |
| Datos de demostración (ficticios) | Cargados sin error |
| Pruebas unitarias con PostgreSQL real (`test:unit`) | 161 archivos pasan, 1 omitido; 1499 pruebas pasan, 1 omitida |
| E2E de Playwright (servidor local con SSO de prueba, sin reintentos) | 122 pasan, 9 omitidos, 0 fallan (3.9 min) |
| Suite de seguridad (`test:safety`, con `DATABASE_URL` y `STRIPE_SECRET_KEY` falsas) | 52 archivos y 1349 pruebas pasan |
| Pruebas de correo (`vitest.email.config.ts`) | 4 archivos y 172 pruebas pasan |
| Chequeo de tipos (`npm run check`, `tsc`) | Sin errores |
| `check:routes` | Todas las rutas de `App.tsx` están en el registro; catálogo del asistente sincronizado |
| `check:migration-policy` | Política de migraciones OK |

Sin la variable de entorno falsa, la suite de seguridad muestra 3 archivos fallidos (`barrido-simulados`, `financial-routes`, `credit-refund-policy`): fallan por falta de `STRIPE_SECRET_KEY` o `DATABASE_URL`, no por el código. Es una característica de la suite ya registrada en la memoria del proyecto; el CI las define.

## Qué quedó omitido y por qué

| Omitido | Cantidad | Causa |
|---|---|---|
| `e2e/44-sso-only.spec.ts` | 6 | Se activa solo con `SSO_ONLY_E2E=1` y un servidor arrancado con `SSO_ONLY=true`; la suite normal corre con la bandera apagada. Se probó aparte en una sesión anterior (6 de 6) |
| `e2e/19-asistente-claude-real` y `e2e/20-assistant-fresh-session` | parte de los 3 restantes | Requieren `ANTHROPIC_API_KEY`; no está definida |
| `e2e/04-cuentas-por-cobrar.spec.ts:50` | parte de los 3 restantes | `test.skip(true, ...)` fijo: "No hay control de filtro en esta vista" |
| Unitaria `e2e-pay-01-stripe-connect` | 1 | `RUN_STRIPE_E2E=0`: necesita Stripe real |

No desglosé los 3 omitidos distintos de los de `44`: la asignación entre 19, 20 y 04 sale de leer las condiciones de omisión, no del reporte de Playwright (el modo de línea no lista los omitidos).

## Lo que esta línea base NO cubre

- **PostgreSQL 16 en local:** no se corrió; el CI lo cubre (ejecución 120, verde).
- **`SSO_ONLY=true`:** probado en la sesión anterior, no en esta corrida.
- **Asistente con Claude real y Stripe real:** sin claves.
- **Pruebas de correo en el CI:** las 172 pruebas de `vitest.email.config.ts` no se invocan desde ningún flujo de GitHub ni script de `package.json` (búsqueda de `vitest.email`, `test:email` y `email-tests` sin resultados). Hoy solo se ejecutan a mano.
- **`npm run build` y `vitest.production.config.ts`:** el CI los corre y yo no. El CI los dio por buenos en este commit (ejecución 120).
- **Lint:** no hay script de lint en `package.json`; no se corrió ninguno.
- **`validate:assistant` y `verify-drizzle-generation`:** no se corrieron (el segundo falla en Windows por symlink, según la memoria del proyecto).
- **Comportamiento visual y rendimiento:** ningún e2e lo mide.

## Conclusión

Con el commit `8400ba6` la línea base automatizada está limpia en PG18. Esto no prueba que las funciones estén correctas: varios hallazgos del plan (por ejemplo `POST /api/charges/generate` sin permiso, o el historial de auditoría sin validación) conviven con pruebas verdes porque ninguna prueba los cubre, o porque la prueba que los cubría está desactualizada.
