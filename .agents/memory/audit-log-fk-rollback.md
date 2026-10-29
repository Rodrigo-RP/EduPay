---
name: audit_log FK silent rollback
description: Fallos de auditoría fuera de la transacción y pruebas con actores válidos.
---

# Cobertura de fallos con sesión válida

Para probar el reintento durable sin alterar ADR-001, simular el fallo del
INSERT de auditoría manteniendo un actor real y activo. La respuesta debe
coincidir con la operación confirmada, la cola conservar sus datos y dos
procesamientos consecutivos no duplicar la auditoría recuperada.

**Why:** El dueño confirmó que una falla de auditoría no revierte ni convierte
en error una operación financiera ya confirmada. Eliminar al actor sólo prueba
la revocación de sesión, no el fallo posterior de auditoría.

**How to apply:** Conservar las pruebas de actor inválido por separado y usar
dobles locales al proceso de prueba, nunca un bypass HTTP en la aplicación.
## La regla

El INSERT en `audit_log` **debe ocurrir FUERA de la transacción principal** usando `pool.query()` (fire-and-forget), no `client.query()` dentro de un bloque BEGIN/COMMIT.

## Por qué

Si `audit_log.user_id` tiene FK → `users.id` (aplicada a nivel PostgreSQL real, código `23503`), un INSERT con un `user_id` inexistente falla. Cuando ese INSERT corre dentro de una transacción abierta con `client.query()`:

1. El INSERT falla → la conexión pg entra en **estado abortado**.
2. `.catch(() => {})` captura el error JavaScript, pero el estado pg sigue abortado.
3. `await client.query('COMMIT')` en una conexión abortada → PostgreSQL ejecuta ROLLBACK silenciosamente sin lanzar error JavaScript en esta versión de `@neondatabase/serverless`.
4. El servidor responde **HTTP 200** con el body de éxito.
5. El UPDATE principal (`estado_conciliacion = 'ignorado'`) **fue revertido** — la DB sigue en 'pendiente'.

Evidencia empírica confirmada: HTTP 200, body `{"message":"Excepción descartada..."}`, DB = `'pendiente'`.

**Why:** El comentario `// audit never blocks the main operation` en el código original era la intención, pero la implementación (mismo `client`, misma transacción) no la cumplía. La única forma de que el audit sea verdaderamente no-bloqueante es que esté en una conexión separada, fuera de la transacción ya commitada.

## Cómo aplicar

```typescript
// ── CORRECTO: COMMIT primero, audit después con pool.query() ──
await client.query('UPDATE ...');
await client.query('COMMIT');
res.json({ message: "..." });

// fire-and-forget en conexión separada — NUNCA puede revertir el COMMIT
if (tenantId && user?.id) {
  pool.query(`INSERT INTO audit_log ...`, [...]).catch(() => {});
}
```

```typescript
// ── INCORRECTO (bug): audit con client.query() dentro de la tx ──
await client.query('UPDATE ...');
await client.query(`INSERT INTO audit_log ...`).catch(() => {}); // ← peligroso
await client.query('COMMIT'); // puede hacer rollback silencioso si el INSERT falló
res.json({ message: "..." });
```

## Cuándo aplica

- Cualquier escritura secundaria no crítica (audit_log, notificaciones, métricas) que corre dentro de un bloque `BEGIN/COMMIT` usando el mismo `client`.
- Aplica a toda la app: buscar patrones `.catch(() => {})` con `client.query()` dentro de transacciones.

## Identidad en pruebas

No eludir la FK omitiendo el `id` del JWT ni usando usuarios inexistentes.
Las pruebas de operaciones necesitan un actor real y activo y deben limpiar
su propia auditoría; las pruebas de sesión inválida deben conservar el rechazo.

**Why:** La comprobación de existencia y estado del usuario forma parte de la
autenticación. Evitarla para saltar auditoría ocultaría el comportamiento real.

**How to apply:** Usar fixtures válidos para probar permisos y operaciones.
Para demostrar rechazo por ausencia de identidad, emitir deliberadamente un
token sin actor, sin normalizarlo mediante el adaptador de fixtures.
