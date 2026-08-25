# Cambios de esquema

La fuente de verdad del esquema activo es `shared/schema.ts`. El único comando
configurado para sincronizar desarrollo es:

```bash
npm run db:push -- --force
```

Ese comando ejecuta `drizzle-kit push`: compara el esquema declarado con
PostgreSQL y **no** ejecuta los archivos `.sql` de este directorio ni los de
`server/migrations/`. La publicación sincroniza el mismo esquema mediante el
flujo de Replit.

Los archivos `.sql` aquí son registros de cambios manuales, idempotentes y
auditables. Sirven para revisar o reproducir una corrección puntual, pero no
constituyen una cola de migraciones ni tienen una tabla de historial asociada.

`server/migrations/` contiene registros históricos de cambios anteriores al
flujo actual. No debe recibir cambios nuevos y no es leído por ningún script
del proyecto. No se consolidó automáticamente porque no existe un ledger que
permita reconstruir con seguridad el orden real en que esos cambios históricos
se aplicaron en cada entorno.

Para cambios nuevos:

1. Actualiza `shared/schema.ts`.
2. Usa `db:push` para desarrollo y el flujo de publicación para producción.
3. Si se requiere un registro SQL idempotente, añádelo en este directorio con
   un prefijo que no colisione con los registros existentes.