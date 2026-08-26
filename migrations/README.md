# Cambios de esquema

La fuente de verdad declarativa del esquema activo es `shared/schema.ts`. Las
migraciones ejecutables de Drizzle viven en `drizzle/migrations/`. El flujo
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

El baseline representa el esquema actual declarado por `shared/schema.ts`.
Para una base ya sincronizada se registra su hash con `npm run
db:baseline:mark`; no se ejecuta de nuevo su DDL. Una base vacía puede ejecutar
el baseline con `npm run db:migrate`. `db:validate-baseline` prueba el SQL
completo dentro de una transacción y un schema PostgreSQL desechable.

Para cambios nuevos:

1. Actualiza `shared/schema.ts`.
2. Genera y revisa una migración en `drizzle/migrations/`.
3. Ejecuta `db:check` y `db:migrate`.
4. Incluye SQL y metadata en el mismo commit.