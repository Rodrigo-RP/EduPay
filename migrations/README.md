# Cambios de esquema

El modelo que consume la aplicación vive en `shared/schema.ts`. El manifiesto
físico introspectado y administrado por Drizzle vive en
`drizzle/physical/schema.ts`; ambos deben actualizarse juntos en cambios de
esquema. Las migraciones ejecutables viven en `drizzle/migrations/`. El flujo
versionado es:

```bash
npm run db:generate -- --name=descripcion-del-cambio
npm run db:check
npm run db:validate-baseline
npm run db:migrate
```

`npm run db:push` está deshabilitado intencionalmente. Las migraciones
generadas se aplican con el runner de Drizzle y registran su hash en
`drizzle.__drizzle_migrations`.

Los archivos `.sql` históricos de este directorio son registros manuales,
idempotentes y auditables. No constituyen una cola ejecutable y no se
reproducen durante la transición al baseline. `server/migrations/` también
contiene registros históricos fuera del runner.

El baseline representa las 57 tablas físicas actuales. Excluye
`platform_profiles` y `platform_subscriptions`, que permanecen declaradas como
diseño futuro en `shared/schema.ts` pero todavía no existen en PostgreSQL. Para
una base ya sincronizada, `npm run db:baseline:mark` crea el esquema físico en
un schema transaccional desechable, compara columnas, constraints, índices,
RLS, políticas y enums contra `public`, y sólo entonces registra el hash. No
ejecuta el DDL del baseline sobre las tablas existentes. Una base vacía puede
ejecutar el baseline con `npm run db:migrate`.

`db:validate-baseline` prueba el SQL completo dentro de una transacción y un
schema PostgreSQL desechable. Los seis checks históricos `NOT VALID` de becas
se conservan al final del baseline mediante `ALTER TABLE`, porque Drizzle Kit
no puede representarlos dentro de `CREATE TABLE`.

`0001_snapshot_alignment.sql` es intencionalmente vacío: avanza únicamente la
metadata de Drizzle para reflejar correcciones que ya están en el baseline
(orden de una restricción única y expresiones explícitas de políticas), sin
volver a ejecutar DDL.

`0002_physical_index_snapshot_alignment.sql` también es metadata-only: corrige
en el snapshot las operator classes que `drizzle-kit pull` asignó a columnas
equivocadas. Neon y el baseline ya contienen los índices correctos.

Para cambios nuevos:

1. Actualiza `shared/schema.ts` y `drizzle/physical/schema.ts`.
2. Genera y revisa una migración en `drizzle/migrations/`.
3. Ejecuta `db:check` y `db:migrate`.
4. Incluye SQL y metadata en el mismo commit.