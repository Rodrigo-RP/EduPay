---
name: Audit log metadata check in tests
description: Cómo verificar metadata de audit_log en tests Vitest sin depender de cómo pg parsea JSONB
---

## Regla

Nunca acceder a campos del objeto JSONB directamente (`meta.some_key`) para verificar contenido de audit_log en tests. En cambio, traer `metadata::text AS meta_text` y usar `toContain('"key"')` sobre el string.

**Why:** El driver `pg` a veces devuelve JSONB como objeto JS parseado y otras veces como string, dependiendo de la versión o configuración del pool. `meta.target_user_id` devuelve `undefined` cuando `meta` es un string, causando falsos negativos en las aserciones sin ningún error de tipo.

**How to apply:**

```typescript
const auditRow = await pool.query(
  `SELECT metadata, metadata::text AS meta_text
   FROM audit_log
   WHERE entity_id = $1 AND action = $2 AND tenant_id = $3
   ORDER BY id DESC LIMIT 1`,
  [entityId, 'some_action', tenantId]
);
expect(auditRow.rows.length).toBeGreaterThan(0);

const metaText: string = auditRow.rows[0].meta_text ?? JSON.stringify(auditRow.rows[0].metadata);
expect(metaText).toContain('"target_user_id"');
expect(metaText).toContain(String(entityId));
expect(metaText).not.toContain(sensitiveValue); // password, token, etc.
```

El fallback `?? JSON.stringify(...)` cubre el caso en que `meta_text` sea null (modo string ya parseado).

**Wait time:** El fire-and-forget de audit_log necesita ≥ 500ms de espera antes de la consulta, no 200ms. La cola de reintentos tarda 30s en procesar — no se puede verificar desde un test sin `stopAuditRetryWorker()`.
