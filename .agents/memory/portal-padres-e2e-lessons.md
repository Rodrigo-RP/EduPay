---
name: Portal Padres E2E — lecciones
description: Bugs encontrados al hacer pasar PP-01 y PP-02 (flujo 3 clics de pago de tutores)
---

## apiRequest devuelve Response, no JSON

`client/src/lib/queryClient.ts` → `apiRequest()` retorna `Promise<Response>`, NO el JSON parseado.

Las mutations en React Query que usen `apiRequest` deben parsear explícitamente:
```typescript
mutationFn: async (data) => {
  const res = await apiRequest("/api/...", { method: "POST", body: JSON.stringify(data) });
  return res.json();  // ← obligatorio
},
```

**Why:** `onSuccess(data)` recibiría un objeto `Response` si no se parsea; `data.payments` sería `undefined`, los componentes de success screen quedan vacíos.

## Seed-demo.ts: tenant_id y campus_id en guardians y charges

El endpoint `/api/guardian/pagar` tiene una query de lock:
```sql
SELECT ... FROM charges WHERE id = $1 AND tenant_id = $2 FOR UPDATE
```

Si `tenant_id` es `null` en la fila (o en el JWT), la condición `tenant_id = null` nunca es TRUE en SQL → 0 filas → "Cargo no encontrado".

**Fix aplicado en seed-demo.ts:**
- `guardians`: incluir `campus_id: f.campus.id` y `tenant_id: tenant.id`
- `charges` (colegiatura e inscripción): incluir `tenant_id: tenant.id`

**Why:** El seed original insertaba guardians y charges sin tenant_id (columnas nullable). El endpoint necesita que ambos coincidan para el lock.

## E2E: paymentHistory ordena ASC, no DESC

La aserción `slice(0, nPendBefore)` sobre `paymentHistory` asume orden DESC (más reciente primero), pero el endpoint devuelve ASC (más antiguo primero). El historial incluye pagos del seed con `ref_demo_*` antes que los del test con `sim_*`.

**Fix:** filtrar por `referencia_pasarela.startsWith("sim_")` en vez de tomar los primeros N items.

## Baseline de fallos en vitest

Antes de los fixes de esta sesión el baseline (commit 8bba6ea) tenía **128 tests fallando**. Después: **15 fallando** (todos pre-existentes — no relacionados con seed/guardian/portal). No es una regresión.
