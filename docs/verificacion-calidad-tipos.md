# Verificación de calidad de tipos y auditoría

Fecha: 2026-10-29. Base: `293c5ab` (seguridad operativa).

## Tipos

`npm run check` detectó 24 diagnósticos antes del cambio y terminó con código
0 después. No se añadieron `any`, supresiones de TypeScript ni casts.
No se cambió el objetivo de compilación ni la versión de Node.

El script `server/scripts/reproduce-importar-bugs.mts` no tenía referencias
vigentes fuera de su propio comentario. Se eliminó sin ejecutarlo.
La búsqueda incluyó scripts, pruebas, documentación y configuración de CI;
se excluyeron adjuntos y resultados generados.

## Auditoría según ADR-001

La operación se confirma antes de escribir la auditoría. Las pruebas nuevas
usan las rutas reales y actores válidos, y simulan únicamente el fallo del
INSERT de auditoría en un servidor privado del proceso de prueba.

Se comprobó el estado persistido del descarte y del pago, incluyendo pago,
aplicación, cargo y transacción bancaria. La cola conserva actor, operación,
error y metadatos; procesarla dos veces deja una sola fila en `audit_log`.
No se alteró la política de auditoría ni se añadieron rutas de prueba a la app.

Comando:

```sh
cd server
npx vitest run --config vitest.config.ts tests/bug-audit-log-rollback.test.ts tests/excepciones-audit-regression.test.ts
```

```text
Reinicio: 11:31:25 AM [express] serving on port 5000
Test Files  2 passed (2)
Tests       9 passed (9)
Start at    11:31:36
Duration    7.51s
```

## C-4: diez ejecuciones consecutivas

Comando idéntico en las diez ejecuciones:

```sh
cd server
npx vitest run --config vitest.config.ts tests/condonacion-assistant.test.ts
```

Horas UTC del 2026-10-29; Ciudad de México corresponde a UTC−6.
Antes de cada ejecución se reinició el servidor para vaciar los límites.
La columna de reinicio transcribe la hora de la línea
`[express] serving on port 5000`, no una hora estimada.

| Corrida | Reinicio | Start at | Test Files | Tests | Duration | Salida |
|---|---|---|---|---|---|---|
| 1 | 11:32:33 | 11:32:35 | 1 passed (1) | 12 passed (12) | 4.59s | 0 |
| 2 | 11:32:43 | 11:32:45 | 1 passed (1) | 12 passed (12) | 3.78s | 0 |
| 3 | 11:32:51 | 11:32:53 | 1 passed (1) | 12 passed (12) | 4.68s | 0 |
| 4 | 11:33:01 | 11:33:03 | 1 passed (1) | 12 passed (12) | 4.84s | 0 |
| 5 | 11:33:11 | 11:33:13 | 1 passed (1) | 12 passed (12) | 3.71s | 0 |
| 6 | 11:33:25 | 11:33:28 | 1 passed (1) | 12 passed (12) | 5.26s | 0 |
| 7 | 11:33:37 | 11:33:39 | 1 passed (1) | 12 passed (12) | 3.90s | 0 |
| 8 | 11:33:46 | 11:33:48 | 1 passed (1) | 12 passed (12) | 3.90s | 0 |
| 9 | 11:33:54 | 11:33:57 | 1 passed (1) | 12 passed (12) | 3.70s | 0 |
| 10 | 11:34:03 | 11:34:05 | 1 passed (1) | 12 passed (12) | 4.80s | 0 |

Resultado: 10/10 ejecuciones correctas; 120/120 casos aprobados en conjunto.
No hizo falta modificar `condonacion-assistant.test.ts`.

## Validaciones finales

Comandos con salida 0:

- `npm run check`
- `npm run build`
- `npm run check:routes`
- `npm run check:migration-policy`

`npm run test:safety`:

```text
Test Files  23 passed (23)
Tests       1001 passed (1001)
Start at    11:34:21
Duration    29.68s
```

`npm run test:unit`:

```text
Reinicio: 11:35:42 AM [express] serving on port 5000
Test Files  145 passed | 1 skipped (146)
Tests       1397 passed | 1 skipped (1398)
Start at    11:35:52
Duration    132.16s
```

La diferencia frente a los 1395 casos aprobados de la base son las dos
regresiones nuevas de fallo de auditoría con actor válido. El caso de Stripe
que exige `RUN_STRIPE_E2E=1` permanece omitido; no se habilitó ese acceso.

`npm run test:e2e` sobre la rama de calidad:

```text
Reinicio: 11:38:21 AM [express] serving on port 5000
Test Files  35 archivos ejecutados (según results.json)
Tests       100 passed | 1 failed (101)
Start at    2026-10-29T11:38:33.618Z
Duration    307804.076 ms (5.1m en la consola)
Salida      1
```

Fallo: `e2e/19-asistente-claude-real.spec.ts:371`, prueba
«muestra un resumen ejecutivo y deudores con tono natural en el widget real».
La aserción espera `**$625** por cobrar`; la respuesta contiene
`**$0** por cobrar` y `**$1,605** vencido`. No se modificó esa prueba.

Se ejecutó el mismo comando completo `npm run test:e2e` sobre la base
`293c5ab`, con reinicio y el mismo entorno:

```text
Reinicio: 11:44:38 AM [express] serving on port 5000
Test Files  35 archivos ejecutados (según results.json)
Tests       100 passed | 1 failed (101)
Start at    2026-10-29T11:44:48.932Z
Duration    320077.640 ms (5.3m en la consola)
Salida      1
```

La prueba falló en la misma línea y con idénticos valores esperado y recibido.
Clasificación: preexistente, comprobada ejecutando la misma suite en la base.
El fixture fija el vencimiento al día 28 del mes corriente
(`e2e/19-asistente-claude-real.spec.ts:119`); la corrida fue el día 29.
No se corrigieron fechas ni aserciones fuera del alcance de calidad de tipos.
La suite E2E no está totalmente aprobada.

Los reportes JSON, capturas y logs de ambas corridas se conservaron bajo
`generated-artifacts/calidad-tipos/` (ignorado por Git); se restauraron las
capturas versionadas que las pruebas sobrescribieron.

Al terminar se volvió a `calidad-tipos`, se detuvo el workflow y se comprobó
que `/proc/net/tcp` y `/proc/net/tcp6` no tenían listeners en el puerto 5000.

## Consultas manuales previas

Sólo se ejecutaron estas consultas de lectura. Las escrituras de fixtures y
su limpieza pertenecen a las suites autorizadas, no a diagnósticos manuales.

```sql
SELECT current_database() AS database_name;
```

Resultado: `heliumdb`.

```sql
SELECT shobj_description(oid, 'pg_database') AS environment_marker
FROM pg_database WHERE datname = current_database();
```

Resultado: `edupay:test`.

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'audit_log','audit_retry_queue','bank_transactions','payments',
    'payment_applications','charges','users'
  )
ORDER BY table_name, ordinal_position;
```

Se verificaron las columnas usadas por los fixtures y las aserciones:
`audit_retry_queue.payload` es JSONB; `audit_log.metadata` es texto;
`payment_applications.amount_centavos` y `payments.monto_centavos` son BIGINT.
No se ejecutaron migraciones.

## Límites y hallazgos no corregidos

- En `server/routes/conciliacion.ts`, la respuesta del descarte aún dice
  «registrada en auditoría» antes de que el INSERT asíncrono termine. Las
  pruebas verifican que el descarte sí persiste y que la auditoría se recupera
  desde la cola; no se cambió ese texto ajeno a los diagnósticos de tipos.
- El recorrido de reintento cubierto es un fallo inicial, recuperación y un
  segundo procesamiento sin duplicado. No simula una caída del proceso entre
  el INSERT de auditoría y la marca `done` de la cola; no afirma una garantía
  general de exactamente una vez bajo todas las caídas posibles.
- La pantalla pública de acceso se revisó visualmente. La consola mostró un
  error de conexión WebSocket de Vite (HTTP 400) sin impedir esa pantalla;
  no se investigó ni se clasificó como regresión.
- No se habilitaron cobros ni envíos reales ni pruebas contra producción.
  La suite existente `e2e/19-asistente-claude-real.spec.ts` sí usa Anthropic
  real con la configuración existente; no se cambió esa integración.
- No se usó «Apply changes», no se publicaron cambios ni se integró esta
  rama de calidad en `replit-en-vivo`.
