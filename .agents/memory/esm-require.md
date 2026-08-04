---
name: ESM require fix
description: package.json "type":"module" rompe require() — solución con createRequire
---

## Regla
El proyecto tiene `"type": "module"` en package.json. Esto hace que `require()` no esté disponible globalmente en server/routes.ts.

**Solución aplicada:**
```ts
import { createRequire } from "module";
const esmRequire = createRequire(import.meta.url);
// Luego usar:
const speakeasy = esmRequire("speakeasy") as typeof import("speakeasy");
const qrcode    = esmRequire("qrcode") as typeof import("qrcode");
const ExcelJS   = esmRequire("exceljs");
```

**Why:** tsx compila TypeScript pero respeta el tipo de módulo ES. `require()` no existe en módulos ES. `createRequire` proporciona acceso a paquetes CommonJS desde ESM.

**How to apply:** Cualquier paquete CJS nuevo en server/routes.ts debe usar `esmRequire(...)` en lugar de `require(...)`. El `esmRequire` ya está declarado en routes.ts.
