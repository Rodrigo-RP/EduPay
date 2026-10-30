# Actualización de Drizzle

Base: actualización de Zod integrada. Consulta de fuentes: 30 de octubre de 2026.

## Versiones y fuentes oficiales

- ORM: 0.39.3 → **0.45.4**.
- Kit: 0.30.6 → **0.31.11**.
- [Notas oficiales de todas las versiones](https://github.com/drizzle-team/drizzle-orm/releases).
- [ORM 0.40.1](https://github.com/drizzle-team/drizzle-orm/releases/tag/0.40.1).
- [ORM 0.41.0](https://github.com/drizzle-team/drizzle-orm/releases/tag/0.41.0).
- [ORM 0.42.0](https://github.com/drizzle-team/drizzle-orm/releases/tag/0.42.0).
- [ORM 0.43.0](https://github.com/drizzle-team/drizzle-orm/releases/tag/0.43.0).
- [ORM 0.44.0](https://github.com/drizzle-team/drizzle-orm/releases/tag/0.44.0).
- [ORM 0.45.0](https://github.com/drizzle-team/drizzle-orm/releases/tag/0.45.0).
- [ORM 0.45.1](https://github.com/drizzle-team/drizzle-orm/releases/tag/0.45.1).
- [ORM 0.45.2](https://github.com/drizzle-team/drizzle-orm/releases/tag/0.45.2).
- [ORM 0.45.4](https://github.com/drizzle-team/drizzle-orm/releases/tag/0.45.4).
- [Kit 0.31.0](https://github.com/drizzle-team/drizzle-orm/releases/tag/drizzle-kit%400.31.0).
- [Kit 0.31.10](https://github.com/drizzle-team/drizzle-orm/releases/tag/drizzle-kit%400.31.10).
- [Kit 0.31.11](https://github.com/drizzle-team/drizzle-orm/releases/tag/drizzle-kit%400.31.11).

Se revisaron las notas oficiales de las versiones intermedias de ORM 0.39–0.45
y Kit 0.30–0.31. Las rutas históricas del sitio de documentación para esas
versiones devolvieron 404; se consultaron las publicaciones oficiales de GitHub.

## Cambios relevantes para EduPay

| Versión | Cambio oficial | Aplicación a EduPay |
| --- | --- | --- |
| ORM 0.39 | CTE de escritura, vistas y objetos predefinidos de Neon | No se incorporan consultas nuevas ni Neon Auth. |
| ORM 0.40 | Dialecto Gel; 0.40.1 mejora compatibilidad de Neon HTTP | EduPay conserva PostgreSQL y su controlador Neon WebSocket; el migrador sigue con node-postgres. |
| ORM 0.41 | Modos de numeric/decimal y mapeo de arreglos PostgreSQL | Se conservan las declaraciones y modos existentes; no se opta por conversiones nuevas de dinero, fechas ni arreglos. |
| ORM 0.42 | Corrige exportaciones duplicadas; amplía enums | Relevante al cargador ESM/tsx. Se mantienen los enums existentes. |
| ORM 0.43 | Tipos de joins/modelos y nuevos joins laterales | TypeScript verifica compatibilidad. No se incorporan joins nuevos ni se reescriben consultas. |
| ORM 0.44 | `DrizzleQueryError` incluye causa, SQL y parámetros; caché opcional | No se activa caché. La forma de errores del controlador es un punto de revisión; no confundir parámetros de consultas con datos seguros para registrar. |
| ORM 0.45–0.45.1 | Corrige detección de Pool/pg-native en transacciones y entornos ESM | Afecta al migrador node-postgres; requiere probar esquema vacío y reconocimiento del ledger anterior. |
| ORM 0.45.2 | Corrige escape de `sql.identifier` y aliases (CWE-89) | Corrección de seguridad. No se cambian identificadores, filtros ni consultas de la app. |
| ORM 0.45.3–0.45.4 | Nuevo controlador Netlify y corrección de prepare en postgres-js | EduPay no usa esos controladores. |
| Kit 0.30 | DDL PostgreSQL deja de esconder conflictos con IF NOT EXISTS | Comportamiento ya presente en la versión anterior; no se alteran las migraciones existentes. |
| Kit 0.31.0 | Corrige DDL/defaults de enums, arrays e introspección de índices JSON | Es crítico que `generate` no encuentre diferencias ni produzca una migración nueva. |
| Kit 0.31.1–0.31.9 | Correcciones de introspección, tipos y carga ESM de la API | No se ejecuta pull, push ni Studio, ni se cambia el esquema físico. |
| Kit 0.31.10 | Sustituye esbuild-register por tsx; mejora carga ESM/CJS | Se comprueba la configuración existente mediante generación aislada. |
| Kit 0.31.11 | Advierte de migraciones omitidas silenciosamente en check | Se prueba explícitamente el ledger completo de siete entradas, antes y después del migrador nuevo. |

La instalación cambió exclusivamente las versiones de ORM y Kit y retiró
dependencias que dejaron de ser necesarias. TypeScript terminó con código 0
sin modificar código de la aplicación, sin any, supresiones ni casts.

No se cambian Vite, SQL de la aplicación, esquema físico, catálogo de referencia,
snapshots ni las siete migraciones.

## Pruebas reproducibles sin heliumdb

### Generación

```bash
npx tsx scripts/verify-drizzle-generation.ts
```

Ejecuta `npm run db:generate` en una copia temporal de la configuración,
`drizzle` y `shared`, con una URL inaccesible. Exige tanto la salida positiva
como hashes idénticos de todos los SQL, snapshots y journal.

Salida relevante:

```text
64 tables
...
No schema changes, nothing to migrate 😴
[drizzle:generate] Cero archivos nuevos o modificados; snapshots y journal idénticos.
```

Kit puede devolver 0 ante un error de importación; no basta el exit code.
La primera preparación temporal omitía `shared/email-schema`: se corrigió
la copia del entorno de prueba, no el esquema ni la app. No se contabilizó esa
invocación como generación aprobada.

### Esquema vacío con el migrador nuevo

En PostgreSQL 16.10 temporal, creado exclusivamente para esta prueba, con
APP_ENV=test y marcador edupay:test:

```text
DATABASE_URL → edupay_drizzle_fresh, servidor local temporal
npm run db:migrate
[db:migrate] Migraciones aplicadas correctamente
npx tsx scripts/verify-schema-exact.ts
[schema:exact] 12 categorías; cero diferencias (sin normalización)
```

Consulta completa y resultado:

```sql
SELECT current_database(), count(*) AS migraciones_aplicadas
FROM drizzle.__drizzle_migrations;
-- edupay_drizzle_fresh | 7
```

### Compatibilidad del ledger anterior

```bash
APP_ENV=test DATABASE_URL=<base-local-desechable> \
  npx tsx scripts/verify-drizzle-migrator-compat.ts <paquete-ORM-0.39.3>
```

La prueba rechaza antes de conectar cualquier destino no local, todo nombre
que no empiece por `edupay_drizzle_` y APP_ENV distinto de test. Exige el
marcador antes de escribir. Instala las siete migraciones usando realmente
el paquete 0.39.3, verifica hashes/timestamps y el catálogo esperado, y luego
invoca al migrador 0.45.4 sobre ese mismo ledger.

Consultas propias completas:

```sql
SELECT current_database() AS database_name;
-- edupay_drizzle_compat_local

SELECT shobj_description(oid, 'pg_database') AS environment_marker
FROM pg_database WHERE datname = current_database();
-- edupay:test

SELECT count(*)::integer AS total
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema');
-- 0 antes de migrar

SELECT id, hash, created_at::text AS created_at
FROM drizzle.__drizzle_migrations ORDER BY id;
-- 7 filas antes y después, con idénticos id, hash y created_at.
```

Las doce consultas completas de catálogo son las ya versionadas en
`scripts/lib/schema-catalog.ts`; se imprimen íntegramente en el paso de CI.
Se comparan sus resultados con `drizzle/schema-catalog.json` y entre sí.

El logger del migrador nuevo permite únicamente comprobar el schema/tabla
del ledger, seleccionar su última fila y abrir/cerrar la transacción.
Se rechaza cualquier sentencia de reejecución de los SQL de las migraciones.

```text
[drizzle:compat] Las siete migraciones se aplicaron con ORM 0.39.3.
[drizzle:compat] ORM 0.45.4 reconoce 7/7; cero migraciones reejecutadas, ledger idéntico y cero diferencias en 12 categorías.
```

El PostgreSQL temporal local se detuvo después de las dos pruebas. No se
consultó ni migró heliumdb. El CI repite generación, esquema vacío, conteo
de siete entradas y compatibilidad en bases desechables.
