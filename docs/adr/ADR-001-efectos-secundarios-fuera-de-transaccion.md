# ADR-001: Ningún efecto secundario no financiero corre dentro de la misma transacción que la escritura financiera principal

**Estado:** Aceptado  
**Fecha:** 2026-08-06  
**Autores:** Equipo EduPay  
**Contexto:** Módulo de Excepciones de Conciliación — Bug real descubierto en producción

---

## Contexto

Durante las pruebas del módulo de Excepciones de Conciliación se descubrió un bug de producción
que causaba **pérdida silenciosa de datos**: el servidor respondía HTTP 200 ("operación exitosa")
pero el UPDATE en `bank_transactions` era revertido sin que el cliente lo supiera.

### Causa técnica exacta

El endpoint `POST /api/conciliacion/excepciones/:id/resolver` (acción "descartar") tenía
el INSERT en `audit_log` dentro de la misma transacción que el UPDATE financiero principal:

```typescript
// CÓDIGO CON BUG (antes del fix)
await client.query('BEGIN');
await client.query('UPDATE bank_transactions SET estado_conciliacion=\'ignorado\' ...');

// ← Este INSERT corre DENTRO de la transacción
await client.query(
  'INSERT INTO audit_log (user_id, ...) VALUES ($1, ...)',
  [user.id, ...]
).catch(() => {}); // ← .catch captura el error JavaScript...
                   //   ...pero NO restaura el estado de la conexión PostgreSQL

await client.query('COMMIT'); // ← Si el INSERT falló, la conexión está en estado
                               //   "abortado". COMMIT ejecuta un ROLLBACK silencioso.
                               //   @neondatabase/serverless NO lanza error JavaScript.
res.json({ message: 'Excepción descartada' }); // ← HTTP 200 falso
```

El escenario de producción que lo dispara: el administrador elimina una cuenta de usuario
mientras esa persona tiene una sesión activa (JWT aún válido). El JWT pasa la autenticación,
pero el INSERT en `audit_log.user_id` viola la FK → `users.id`. La conexión pg queda en
estado abortado. El COMMIT hace silenciosamente ROLLBACK. La respuesta es HTTP 200 pero
la bank_tx sigue en estado 'pendiente'.

**Evidencia empírica:**
```
HTTP status del servidor    : 200
DB estado_conciliacion      : pendiente
Body del servidor           : {"message":"Excepción descartada y registrada en auditoría"}
```

Este patrón fue verificado con un test dedicado (`tests/bug-audit-log-rollback.test.ts`)
que crea un usuario real, emite un JWT, elimina al usuario y luego llama al endpoint.

---

## Decisión

**Todo efecto secundario no financiero (audit_log, notificaciones, métricas, emails, webhooks)
que puede fallar por razones ajenas a la operación financiera DEBE correr FUERA de la
transacción principal, en una conexión separada, después del COMMIT.**

### Regla concreta

```
BEGIN
  [solo escrituras financieras que deben ser atómicas]
  INSERT/UPDATE en: bank_transactions, charges, payments,
                    payment_applications, invoices
COMMIT
──── barrera: res.json() enviado ────
pool.query('INSERT INTO audit_log ...').catch(err => enqueueAuditLog(payload, err))
```

El `pool.query()` posterior al COMMIT usa una **conexión diferente** del pool. Si falla,
no puede revertir el COMMIT ya ejecutado.

### Por qué NO usar `.catch(() => {})` como única salvaguarda

El comentario `// audit never blocks the main operation` expresa la intención correcta,
pero la implementación con `client.query().catch(() => {})` dentro de la transacción
NO la cumple:

1. `.catch(() => {})` captura la excepción JavaScript ✓
2. La conexión PostgreSQL queda en estado "abortado" ✗
3. El COMMIT posterior se convierte en ROLLBACK silencioso ✗
4. El servidor responde HTTP 200 aunque el UPDATE fue revertido ✗

### Queue de reintentos (audit-retry.ts)

Como el proyecto exige auditoría inmutable de toda acción financiera sensible, el INSERT
fallido no se descarta: se encola en `audit_retry_queue` (tabla PostgreSQL) con reintentos
automáticos y logging de error con Winston.

```typescript
// CÓDIGO CORRECTO (después del fix)
await client.query('UPDATE bank_transactions ...');
await client.query('COMMIT');          // ← commit limpio
res.json({ message: '...' });          // ← 200 verdadero

// Fuera de la transacción — conexión separada via pool
pool.query('INSERT INTO audit_log ...').catch((err) => {
  enqueueAuditLog(payload, err);       // ← retry queue + winston ERROR si agota reintentos
});
```

---

## Consecuencias

### Positivas
- El UPDATE financiero nunca puede ser revertido por un fallo de escritura secundaria.
- Las respuestas HTTP reflejan el estado real de la base de datos.
- Los fallos de audit_log son visibles (logs/audit-error.log) y recuperables (reintentos).
- El sistema es resiliente ante: cuentas eliminadas, timeouts transitorios, FK violations.

### Limitaciones aceptadas
- Hay una ventana temporal (≤30 s) entre el COMMIT y el reintento exitoso del audit_log,
  en la que la entrada de auditoría aún no existe en la DB. Esto es aceptable: el dato
  financiero ya está persistido y el audit llega momentáneamente después.
- Si el servidor cae justo después del COMMIT y antes del INSERT del audit_log, el registro
  puede perderse. La queue durable en PostgreSQL mitiga esto en el caso normal; el caso de
  crash-between-commit-and-enqueue es el mismo riesgo que existe en cualquier sistema
  distribuido sin 2PC.

---

## Regla de cumplimiento (code review checklist)

Al revisar cualquier PR que toque endpoints financieros, verificar:

1. **¿Hay un `client.query()` para `audit_log`, notificaciones, métricas o emails DENTRO
   de un bloque `BEGIN/COMMIT`?**  
   Si sí → mover fuera de la transacción. Usar `pool.query()` post-COMMIT.

2. **¿Hay un `.catch(() => {})` vacío en cualquier escritura secundaria?**  
   Si sí → reemplazar con `enqueueAuditLog(payload, err)` u otro mecanismo de retry/log.

3. **¿El `.catch()` en una escritura secundaria está anidado dentro de un `try/catch`
   que tiene un `client.query('COMMIT')` posterior?**  
   Si sí → muy probablemente el bug descrito en este ADR.

### Grep de detección

```bash
# Buscar posibles anti-patrones: client.query para audit/notif dentro de tx
grep -n "client\.query.*audit_log\|client\.query.*notification\|client\.query.*email" \
  server/routes/*.ts
```

---

## Alternativas consideradas

### A. Usar SAVEPOINTs de PostgreSQL
El INSERT de audit_log se wrappea en un SAVEPOINT; si falla, se hace ROLLBACK TO SAVEPOINT
y la transacción principal sigue. Rechazada: más compleja, y si el audit es tan crítico
como para estar en la misma transacción, debe fallar atómicamente con el principal.

### B. Tabla `audit_log` como append-only con trigger
El UPDATE financiero dispara un trigger que inserta en audit_log. Rechazada: los triggers
corren dentro de la transacción del DML → mismo problema de rollback silencioso si el
INSERT falla. Además, los triggers son difíciles de observar y depurar.

### C. Tolerancia a FK nullable en audit_log
Hacer `user_id` nullable sin FK hard constraint. Rechazada: pierde la referential integrity
y enmascara el problema en lugar de resolverlo.

### D. Dos fases explícitas (2PC)
Overhead excesivo para un registro de auditoría no crítico para la atomicidad financiera.

---

## Referencias

- `server/audit-retry.ts` — implementación de la cola de reintentos
- `server/tests/bug-audit-log-rollback.test.ts` — test de regresión que verifica el bug
- `server/routes/conciliacion.ts` líneas 656-693 — implementación correcta de referencia
- PostgreSQL docs: [Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- @neondatabase/serverless: comportamiento de COMMIT en conexión abortada (no lanza en JS)
