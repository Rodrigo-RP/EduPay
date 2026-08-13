---
name: Guardians email NOT NULL drift
description: La columna email de la tabla guardians tiene NOT NULL en la DB real pero el schema Drizzle la declara nullable. Todo INSERT directo (SQL crudo o family-service.ts) debe incluirla.
---

## Regla

Al hacer INSERT INTO guardians con SQL crudo o via pool.connect(), incluir siempre la columna `email` con el mismo valor que `correo_institucional_familiar`.

```sql
INSERT INTO guardians (nombres, correo_institucional_familiar, email, ...)
VALUES ($1, $2, $2, ...)
```

## Por qué

El schema Drizzle declara `email: varchar("email", { length: 255 })` sin `.notNull()`, pero la DB real tiene la constraint NOT NULL. Omitir `email` causa error 23502 en runtime. La causa es drift de migración: una migración anterior añadió NOT NULL que no se refleja en schema.ts.

## Dónde aplica

- `server/lib/family-service.ts` — INSERT de guardian nuevo (ya corregido)
- Tests que hagan INSERT INTO guardians directamente (beforeAll de FCM y similares)
- Cualquier futura migración o import que cree guardians con SQL crudo

## Cómo detectarlo

Error en test: `null value in column "email" of relation "guardians" violates not-null constraint` con código `23502`.
