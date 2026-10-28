# Diagnóstico de sólo lectura — 2026-10-28

Consultas manuales completas, realizadas antes de ejecutar la suite completa.
No se ejecutó backfill, UPDATE de pagos, migración ni creación de índices.

## Identidad

```sql
SELECT current_database() AS database_name,
       shobj_description(oid, 'pg_database') AS marker
FROM pg_database
WHERE datname=current_database();
```

Resultado: `heliumdb`, `edupay:test`.

## Tipos reales

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public'
  AND column_name IN (
    'created_at','fecha_pago','fecha_vencimiento','fecha_emision',
    'fecha','applied_at','assigned_at'
  )
ORDER BY table_name,ordinal_position;
```

Resultados relevantes para la corrección:

| Tabla | Columna(s) | Tipo |
|---|---|---|
| payments | created_at, fecha_pago | timestamp without time zone |
| charges | created_at | timestamp without time zone |
| charges | fecha_emision, fecha_vencimiento | date |
| students | created_at | timestamp without time zone |
| bank_transactions | fecha | date |
| bank_transactions | created_at | timestamp without time zone |
| cash_closures | fecha | date |
| acciones_seguimiento | created_at, assigned_at | timestamp without time zone |

`fecha_pago` es un timestamp en el catálogo, aunque las escrituras financieras
de la aplicación le asignan un día calendario. Por eso no se convierte ese
campo como si siempre fuera un instante UTC. Se corrige el día que se escribe;
el filtro de efectivo/cierre/tablero convierte el instante `created_at`.

## Reproducción sin escrituras

```sql
SELECT '2026-10-29 01:30:00'::timestamp::date AS dia_utc,
       ('2026-10-29 01:30:00'::timestamp
         AT TIME ZONE 'UTC'
         AT TIME ZONE 'America/Mexico_City')::date AS dia_escuela;
```

Resultado: `dia_utc = 2026-10-29`, `dia_escuela = 2026-10-28`.
Truncar directamente UTC cambia de día un pago hecho a las 19:30 locales.

## Diferencias históricas (sólo conteos)

```sql
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (
         WHERE fecha_pago IS NOT NULL
           AND fecha_pago::date <>
             (created_at AT TIME ZONE 'UTC'
                         AT TIME ZONE 'America/Mexico_City')::date
       ) AS fecha_pago_distinta_dia_local,
       COUNT(*) FILTER (WHERE fecha_pago IS NULL) AS fecha_pago_nula
FROM payments;
```

Resultado: `total = 25`, `fecha_pago_distinta_dia_local = 0`,
`fecha_pago_nula = 0`. Es la fotografía previa a las pruebas, no una garantía
para otras bases o para nuevos registros. No se modificó ninguno.

## Sondeo de conexión del runner

```sql
SELECT current_database() AS db;
```

Resultado: `heliumdb`. Se usó para distinguir un problema de conexión de un
problema del doble de pruebas; no hubo cambios de conexión ni de variables.

## Ampliación del barrido

Las líneas también corresponden a la base `35a2b93`:

- `server/routes/fiscal.ts:79,266`: filtros mensuales de pagos por `created_at`.
  Afectan cifras fiscales; se convierten al calendario local.
- `server/routes/reportes-contable.ts:73,82`: agrupación mensual además del filtro
  ya inventariado; se convierte al mismo calendario.
- `server/assistant-actions.ts:837`: año predeterminado de cobranza; año local.
- `server/routes/reportes-financiero.ts:382`: agrupa por `fecha_pago`, que
  conserva su semántica de calendario; no reinterpretar históricos.
- `server/routes/payments.ts:193` y `server/routes/conciliacion.ts:251`:
  el pago manual general y la conciliación escribían `fecha_pago` con `NOW()`.
  Afectan dinero: se asigna el día local, conservando el instante en `created_at`.
- `e2e/24-caja-efectivo-cierre.spec.ts:208`: la consulta de control de CE-01
  también truncaba UTC. Se convierte al día local, sin cambiar sus aserciones
  de importes, persistencia, duplicados o permisos.

Las pruebas de reloj fijo usan SELECT sobre CTE, relojes explícitos y dobles de
escritura; no requieren cambiar la hora del servidor ni filas históricas.
