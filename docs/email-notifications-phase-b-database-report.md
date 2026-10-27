# Fase B — procesos detenidos y diagnóstico SELECT autorizado

## Alcance y precisión

La consulta apunta exactamente a `DATABASE_URL`, sin fallback a otra variable.
No se muestra su valor ni se infiere que sea una base de pruebas.
Se usó un cliente independiente de `@neondatabase/serverless`, sin importar
el servidor, scripts, seeds ni workers. Ambas conexiones se cerraron al terminar.

Parámetros de conexión: `default_transaction_read_only=on`,
`statement_timeout=15000`, `application_name=edupay_phase_b_readonly`.
Se confirmó `transaction_read_only=on` mediante SELECT en ambas sesiones antes
de consultar. No se ejecutó SQL de escritura ni se inició la aplicación.

## Los tres procesos detenidos

Fecha: **2026-10-26**. Horas de **America/Mexico_City (UTC−06:00)**.
Los tres pertenecían al usuario del sistema operativo `runner`.

| PID | PPID | Comando | Inicio | Detención |
|---|---|---|---|---|
| 218 | 28 | `npm run dev` | 18:00:18 | SIGTERM dentro del intervalo documentado abajo |
| 325 | 218 | `/nix/store/jfar9wnj6kvr0gr6klh1gk7vgckkfr5j-nodejs-20.20.0/bin/node /home/runner/workspace/node_modules/.bin/tsx server/index.ts` | 18:00:19 | Mismo intervalo |
| 336 | 325 | `/nix/store/jfar9wnj6kvr0gr6klh1gk7vgckkfr5j-nodejs-20.20.0/bin/node --require /home/runner/workspace/node_modules/tsx/dist/preflight.cjs --import file:///home/runner/workspace/node_modules/tsx/dist/loader.mjs server/index.ts` | 18:00:19 | Mismo intervalo |

Iniciador técnico: la cadena de padres observada es
`pid1 (14) → pid2 (28) → npm (218) → tsx (325) → app (336)`.
`pid2` ejecutaba `/mnt/pid2/bootstrap.cjs` y había iniciado a las 17:49:54.
Esto identifica el supervisor y los padres, **no la persona o acción que solicitó
el arranque**. No hay evidencia suficiente para atribuírselo a una persona ni
a una operación concreta del agente.

El PID 336 escuchaba en `*:5000`. El worker de auditoría se ejecutaba dentro
de ese proceso; no era un cuarto proceso. No se identificó un servidor de
pruebas independiente.

Se envió `kill -TERM 218 325 336` y se comprobó su desaparición.
**La hora exacta del SIGTERM no se registró.** La observación activa con hora
conocida lo acota por abajo a las **20:35:39**; el checkpoint de la instalación
posterior a la detención lo acota por arriba a las **20:40:26**.
No se presenta ninguna de esas dos horas como la hora exacta de detención.
Después de ambas instalaciones por terminal se confirmó que la app no había
arrancado. No se alteró `.replit` ni la configuración de workflows.

### Conexión anterior a la base

En el instante de `lsof` no se observó una conexión saliente del PID 336.
Eso **no demuestra ausencia de conexiones anteriores**: el arranque del
servidor había superado `initAuditRetryQueue`, que consulta la base del pool
configurado con `DATABASE_URL`, antes de abrir el puerto.
Por ese orden del código sí hay evidencia de conexión previa a esa variable.
No hay evidencia de si la inicialización creó la tabla o ya existía, ni de
todas las operaciones que pudo hacer el proceso durante su vida.

## Ventanas y resultado

Inicio común: **18:00:18** = `2026-10-27T00:00:18Z`.

- A: hasta **20:35:39** = `2026-10-27T02:35:39Z`, última observación activa
  con hora conocida.
- B: hasta **20:40:26** = `2026-10-27T02:40:26Z`, límite superior conservador,
  posterior a la detención. Puede incluir actividad ajena posterior al SIGTERM.

| Tabla | Filas creadas en A | Filas creadas en B |
|---|---:|---:|
| audit_log | 0 | 0 |
| audit_retry_queue | 0 | 0 |
| users | 0 | 0 |
| students | 0 | 0 |
| guardians | 0 | 0 |
| charges | 0 | 0 |
| payments | 0 | 0 |

Son conteos sobre `created_at`, **no atribución causal a los PIDs**.
No incluyen actualizaciones, borrados, DDL, filas creadas y luego eliminadas,
fechas alteradas ni fechas nulas. Por tanto, cero no equivale a «no se tocó
la base». Tampoco es posible reconstruir quién escribió cada fila con estos
conteos agregados.

El catálogo confirmó `created_at` en las siete tablas. Sólo el de
`audit_retry_queue` es `timestamptz`; los demás son `timestamp without time zone`.
La sesión reportó `GMT` y sus defaults son `now()`. Se interpretaron los
timestamps sin zona como UTC explícitamente; no se puede certificar desde
estos SELECT que todos los escritores históricos hayan seguido esa convención.

## Todas las consultas ejecutadas

### 1. Guarda y zona horaria — primera sesión

```sql
SELECT current_setting('transaction_read_only') AS solo_lectura,
       current_setting('TimeZone') AS zona_horaria;
```

Resultado: `solo_lectura = on`, `zona_horaria = GMT`. Sin parámetros.

### 2. Catálogo — primera sesión

```sql
SELECT table_name,column_name,data_type,column_default,is_nullable
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name=ANY($1::text[])
  AND (
    data_type IN ('timestamp with time zone','timestamp without time zone')
    OR (table_name='campuses' AND column_name IN ('id','tenant_id'))
  )
ORDER BY table_name,ordinal_position;
```

Parámetro completo:

```json
[["audit_log","audit_retry_queue","users","students","guardians","charges","payments","campuses"]]
```

Sólo metadatos. `campuses` se incluyó para confirmar `id` y `tenant_id`
empleados por la correlación de scope, sin leer registros de campus.

### 3. Guarda — segunda sesión

```sql
SELECT current_setting('transaction_read_only') AS solo_lectura;
```

Resultado: `solo_lectura = on`. Sin parámetros.

### 4. Conteos — segunda sesión

```sql
SELECT 'audit_log'::text AS tabla, COUNT(*) FILTER (WHERE created_at AT TIME ZONE 'UTC' <= $2::timestamptz)::integer AS hasta_ultima_observacion_activa, COUNT(*)::integer AS hasta_limite_superior_detencion FROM public.audit_log WHERE created_at AT TIME ZONE 'UTC' >= $1::timestamptz AND created_at AT TIME ZONE 'UTC' <= $3::timestamptz
UNION ALL
SELECT 'audit_retry_queue'::text AS tabla, COUNT(*) FILTER (WHERE created_at <= $2::timestamptz)::integer AS hasta_ultima_observacion_activa, COUNT(*)::integer AS hasta_limite_superior_detencion FROM public.audit_retry_queue WHERE created_at >= $1::timestamptz AND created_at <= $3::timestamptz
UNION ALL
SELECT 'users'::text AS tabla, COUNT(*) FILTER (WHERE created_at AT TIME ZONE 'UTC' <= $2::timestamptz)::integer AS hasta_ultima_observacion_activa, COUNT(*)::integer AS hasta_limite_superior_detencion FROM public.users WHERE created_at AT TIME ZONE 'UTC' >= $1::timestamptz AND created_at AT TIME ZONE 'UTC' <= $3::timestamptz
UNION ALL
SELECT 'students'::text AS tabla, COUNT(*) FILTER (WHERE created_at AT TIME ZONE 'UTC' <= $2::timestamptz)::integer AS hasta_ultima_observacion_activa, COUNT(*)::integer AS hasta_limite_superior_detencion FROM public.students WHERE created_at AT TIME ZONE 'UTC' >= $1::timestamptz AND created_at AT TIME ZONE 'UTC' <= $3::timestamptz
UNION ALL
SELECT 'guardians'::text AS tabla, COUNT(*) FILTER (WHERE created_at AT TIME ZONE 'UTC' <= $2::timestamptz)::integer AS hasta_ultima_observacion_activa, COUNT(*)::integer AS hasta_limite_superior_detencion FROM public.guardians WHERE created_at AT TIME ZONE 'UTC' >= $1::timestamptz AND created_at AT TIME ZONE 'UTC' <= $3::timestamptz
UNION ALL
SELECT 'charges'::text AS tabla, COUNT(*) FILTER (WHERE created_at AT TIME ZONE 'UTC' <= $2::timestamptz)::integer AS hasta_ultima_observacion_activa, COUNT(*)::integer AS hasta_limite_superior_detencion FROM public.charges WHERE created_at AT TIME ZONE 'UTC' >= $1::timestamptz AND created_at AT TIME ZONE 'UTC' <= $3::timestamptz
UNION ALL
SELECT 'payments'::text AS tabla, COUNT(*) FILTER (WHERE created_at AT TIME ZONE 'UTC' <= $2::timestamptz)::integer AS hasta_ultima_observacion_activa, COUNT(*)::integer AS hasta_limite_superior_detencion FROM public.payments WHERE created_at AT TIME ZONE 'UTC' >= $1::timestamptz AND created_at AT TIME ZONE 'UTC' <= $3::timestamptz;
```

Parámetros completos, en orden:

```json
["2026-10-27T00:00:18Z","2026-10-27T02:35:39Z","2026-10-27T02:40:26Z"]
```

El resultado son exclusivamente los siete renglones agregados de la tabla
anterior. No hubo SELECT de correos, nombres, pagos individuales, payloads,
valores de Secrets ni tabla de migraciones. No se ejecutó ninguna otra
consulta real durante este ajuste.
