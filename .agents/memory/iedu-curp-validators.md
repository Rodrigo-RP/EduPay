---
name: IEDU complement validators & CURP validation
description: Decisiones de la migración 017 y módulo validators.ts — CURP regex, mapa claves SAT, fixtures de tests.
---

## Regla
Toda escritura de `students.curp` pasa por `validarCurp()` en `server/lib/validators.ts`.
- Edición individual (admin.ts): **bloqueante** → 400 si formato inválido.
- Bulk import CSV (admin.ts + payments.ts): **no-bloqueante** → agrega a `errors[]`, `failed++`, `continue`.

**Why:** El SAT exige el formato exacto (18 chars, patrón `CURP_RE`) para generar el complemento IEDU.

## Importación dinámica
Ambas rutas usan `await import("../lib/validators")` (ruta relativa desde `server/routes/`).
El path incorrecto `../../lib/validators` devuelve 500 silencioso — verificar si se vuelve a tocar.

## Fixtures de tests — formato CURP válido
Los tests de import de alumnos deben generar CURPs que pasen `CURP_RE`. Patrón canónico:

```typescript
// PREFIX(4): letra + vocal + letra + letra
// yy: 2 dígitos de unicidad por timestamp
const yy = String((Date.now() + offset) % 100).padStart(2, '0');
return `${PREFIX}${yy}0101HNENNNA0`; // 18 chars ✓
```

Prefijos en uso por archivo de test:
| Archivo | Prefijo | Cleanup |
|---------|---------|---------|
| students-import-atomicity | `SIAT` | `LIKE 'SIAT%'` |
| import-dry-run | `DIDR` | por CURP exact value |
| wizard-import-steps | `WISA`/`WISB` | `LIKE 'WIS%'` |
| import-guard-atomicity | `GUMA`/`GUMB`/`GUMC` | por CURP exact value |
| import-audit-log | `AUID` | por CURP exact value |

## CHECK constraint de rollback en tests
Para probar rollback por error fatal de DB (IGM-08, IAL-02), el CHECK constraint usa:
```sql
CHECK (curp NOT LIKE 'TEAT%')
```
El CURP que viola el constraint: `TEAT000101HNENNNA0` (válido en formato SAT, empieza con TEAT).
**No usar** `FATAL-%-TEST` — esas cadenas no pasan `validarCurp()` y el error ocurre en app, no en DB.

## Migración 017 aplicada
- invoices: +8 cols IEDU (curp_alumno, nivel_educativo, aut_rvoe, rfc_pago, uso_cfdi, forma_pago, clave_prod_serv, clave_unidad)
- institutional_info: +rvoe
- students: +nivel_educativo (CHECK: 'preescolar','primaria','secundaria','bachillerato','profesional_tecnico')
- payments: +subtipo_tarjeta
- fiscal_config: UPDATE uso_cfdi G03→D10 (idempotente con DO block)
- Diagnóstico: 28 alumnos activos sin nivel_educativo → revisión manual desde expediente.
