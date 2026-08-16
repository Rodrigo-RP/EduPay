---
name: E2E blob download pattern
description: Playwright pattern for testing blob-URL downloads (XLSX/PDF); rate-limit failure mode in full suite.
---

# E2E blob download pattern

## The rule

Para testear botones de exportación que usan `createObjectURL + a.click()`:

```typescript
import fs from "node:fs/promises";

const [download] = await Promise.all([
  page.waitForEvent("download", { timeout: 20_000 }),
  page.getByRole("button", { name: /excel/i }).click(),
]);
const filePath = await download.path();
const buf = await fs.readFile(filePath!);
expect(buf.slice(0, 2).toString("utf8")).toBe("PK");   // XLSX
// o
expect(buf.slice(0, 4).toString("utf8")).toBe("%PDF"); // PDF
```

Playwright captura el download event aunque venga de un blob URL con `a.download` — `download.path()` devuelve la ruta al archivo temporal en disco.

**Why:** Los botones de exportación de EduPay usan el patrón `fetch → blob → createObjectURL → a.click()`. Sin `waitForEvent("download")` no hay forma de capturar el archivo generado; `page.route()` no intercepta blob URLs.

**How to apply:** Usar en cualquier spec E2E que pruebe exportación de reportes. El `Promise.all` es obligatorio — iniciar la espera ANTES del click para no perder el evento.

## Fallo en suite completa

Los tests de descarga pasan 4/4 en aislamiento (`npm run test:e2e -- e2e/12-...`) pero fallan en `npm run test:e2e` completo porque el rate limiter `/api/auth/login` (300 req/5min) se agota tras el run de Vitest previo. La raíz es la misma que afecta los otros 11 specs E2E: todos los `loginAsAdmin()` reciben 429 una vez agotado el limiter.

La solución correcta está documentada en `e2e-auth-session-pattern.md`: login UNA SOLA VEZ en `beforeAll` + restaurar `localStorage` en cada `beforeEach`, evitando llamadas repetidas a `/api/auth/login`. No existe ni debe existir un endpoint HTTP `/api/test/reset-rate-limits` — ver PROTOCOLO-AUDITORIA.md §5 y la sección "Por qué NO hay endpoint HTTP de reset" en ese archivo de memoria.

## Referencia

Archivo canónico: `e2e/12-antiguedad-saldos.spec.ts` — T3 (Excel) y T4 (PDF).
