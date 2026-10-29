# Ajuste de contacto de familias

## Migración autorizada

Se generó mediante `npm run db:generate`:
`drizzle/migrations/0005_white_hellcat.sql`. Su contenido completo es:

```sql
ALTER TABLE "guardians" ALTER COLUMN "email" DROP NOT NULL;
```

Se verificó que fuera la única migración pendiente y se aplicó exclusivamente
con `npm run db:migrate`, sobre `heliumdb` con marcador `edupay:test`.
La aplicación permaneció detenida durante este paso.

| Verificación | Antes | Después |
|---|---:|---:|
| Filas del ledger | 5 | 6 |
| Tutores | 28 | 28 |
| Tutores con `email` no nulo | 28 | 28 |
| `guardians.email.is_nullable` | NO | YES |

Consultas completas de lectura:

```sql
SELECT current_database() AS database_name;
SELECT shobj_description(oid, 'pg_database') AS environment_marker
FROM pg_database WHERE datname = current_database();
SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id;
SELECT COUNT(*)::int AS tutors, COUNT(email)::int AS emails FROM guardians;
SELECT column_name,is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='guardians' AND column_name='email';
SELECT COUNT(*)::int AS ledger_count FROM drizzle.__drizzle_migrations;
```

Los resultados de identidad fueron `heliumdb` y `edupay:test` antes de aplicar.
No se editaron ni rellenaron correos existentes.

### Reversión propuesta, no ejecutada

Volver a `NOT NULL` sólo es posible si no queda ningún tutor sin correo.
Primero debe comprobarse:

```sql
SELECT COUNT(*) AS tutores_sin_correo FROM guardians WHERE email IS NULL;
```

Sólo si devuelve cero y existe una autorización posterior, una migración de
reversión podría ejecutar:

```sql
ALTER TABLE "guardians" ALTER COLUMN "email" SET NOT NULL;
```

No sustituir nulos por cadenas vacías ni correos inventados para forzar esa
reversión. Si hay tutores sin correo, debe mantenerse nullable hasta resolver
su contacto legítimamente o cambiar expresamente la decisión de producto.
