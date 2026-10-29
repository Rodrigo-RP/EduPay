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

## Revisión de usos de correo

Se revisaron las referencias a `correo_institucional_familiar`, `guardian.email`,
`g.email`, `guardianEmail` y los usos relacionados en servidor y cliente.
Las referencias agrupadas corresponden a cada operación, no a servicios nuevos.
La tabla final con líneas se completa tras el ajuste del servicio para que
sus números correspondan al código entregado.

- Ligas: generan acceso por ID, devuelven celular y mensaje claro para compartir
  cuando no hay correo; el canje conserva correo nulo en respuesta y JWT.
  Se eliminó el identificador de correo inventado del canje.
- Notificaciones: el repositorio convierte ausencia/vacío en nulo y
  `prepareRecipients` conserva estado `omitido`, motivo `sin correo`; nunca
  se incluye ese destinatario en un intento de envío.
- Stripe: la creación existente usa `email: guardian.email || undefined`;
  el SDK omite el parámetro ausente. Se comprobará con Stripe simulado.
- Inicio por contraseña: sigue requiriendo una dirección para ese método
  específico y devuelve 400 si falta; un tutor sin correo accede mediante liga.
- Búsqueda/listados/reportes: los `ILIKE` con nulos no coinciden por correo,
  pero las búsquedas por nombre/otros campos siguen funcionando; JSON conserva
  nulos y los componentes muestran teléfono, “Sin correo” o un campo vacío.
- Importación activa de tutores: correo opcional, validado y normalizado
  cuando existe; ausente se escribe nulo en ambas columnas. El importador de
  familias se completa en el siguiente punto mediante su servicio central.
- `storage.createGuardian` admite correo nulo sin sustituirlo por un inventado.
- Herramientas heredadas `import-real-data.ts` e `import-students-jfr.ts`:
  omiten la búsqueda por email cuando falta, validan/normalizan el capturado
  y escriben nulo. No se ejecutaron estos scripts ni sus cargas.
