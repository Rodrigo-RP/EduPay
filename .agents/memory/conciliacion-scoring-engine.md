---
name: Motor de scoring de conciliación bancaria
description: Decisiones de diseño, deudas técnicas y patrones del motor de scoring en conciliacion.ts
---

# Motor de scoring de conciliación bancaria

## Reglas

- **`_applyReconciliacion`** vive en `server/routes/conciliacion.ts` línea ~204. Es file-scoped (sin `export`). Llamada desde dos handlers auto-match y desde Fase 2 del resolver manual. Si necesitas llamarla desde fuera del archivo, hay que exportarla primero.

- **Branches score en ambos endpoints** (ejecutar-conciliacion y auto-match):
  - `score === 100` → auto-aplica, `en_revision` no incrementa
  - `score >= 90 && score < 100` → auto-aplica, `en_revision++` en respuesta
  - `score >= 70` → sugerencia en array, no se aplica
  - `< 70` → sin acción (bandeja de aclaración)

- **Cola de revisión supervisor** = `GET /api/conciliacion/revision-supervisor`. Sin tabla nueva. Query:
  ```sql
  WHERE confianza_pct BETWEEN 90 AND 99
    AND estado_conciliacion = 'conciliado'
    AND conciliado_at >= NOW() - INTERVAL '24 hours'
  ```

- **`conciliado_at`** escrito por `_applyReconciliacion` en el UPDATE de `bank_transactions` (migración 015).

- **`excepciones/:id/resolver` (accion=aplicar)**: tiene Fase 2 (upsert FPS + confianza_pct), pero la Fase 1 sigue siendo inline — NO llama a `_applyReconciliacion`. Deuda técnica registrada en tarea #167.

## Por qué `_applyReconciliacion` no es exportada

Decisión implícita: el patrón del archivo usa prefijo `_` para helpers internos. No se discutió con el usuario. Si se necesita desde un worker externo, exportar explícitamente.

## Neon + psql

Neon usa WebSocket (driver serverless). `psql` con protocolo estándar falla con "endpoint disabled" aunque el servidor esté corriendo. Aplicar migraciones via:
```typescript
// server/scripts/nombre.ts
import { pool } from "../db.js";
async function main() { await pool.query(`ALTER TABLE ...`); await pool.end(); }
main();
// npx tsx scripts/nombre.ts
```

## Cómo aplicar

- Al escribir tests que usan `bank_transactions.conciliado_at`: verificar que la columna existe (migración 015 ya aplicada en producción).
- `en_revision` es el contador de autos-aplicados con score 90-99 — incluirlo en assertions de respuesta de auto-match cuando el test tenga ese rango.
