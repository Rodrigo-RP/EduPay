---
name: Playwright page.route para tests de onError toast
description: Patrón E2E para verificar que un onError de React Query muestra el toast correcto, usando page.route() para forzar un error sin provocarlo en el servidor real.
---

# Playwright: interceptar endpoint y verificar toast de error

## El patrón
```typescript
// 1. Registrar interceptor ANTES del clic
await page.route("**/api/caja/cerrar-dia", async (route) => {
  await route.fulfill({
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({ message: "Error interno del servidor" }),
  });
});

// 2. Navegar al tab que contiene el botón (si es necesario)
await page.getByRole("tab", { name: /conciliación automática/i }).click();
await expect(page.getByText(/cierre de caja diario/i).first()).toBeVisible({ timeout: 8_000 });

// 3. Clic en el botón real
await page.getByRole("button", { name: /cerrar caja del día/i }).click();

// 4. Toast de error debe aparecer
await expect(page.getByText("Error al cerrar caja")).toBeVisible({ timeout: 8_000 });

// 5. Toast de éxito NO debe aparecer (onSuccess no corrió)
await expect(page.getByText("Caja cerrada")).not.toBeVisible({ timeout: 2_000 });
```

**Why:** Confirma la cadena completa frontend: HTTP non-2xx → `throwIfResNotOk` lanza → React Query llama `onError` → `toast({ variant: "destructive" })` → shadcn renderiza el nodo en el DOM. Los tests de Vitest solo prueban el servidor; este test prueba que el mensaje llega al usuario.

## How to apply
- El botón "Cerrar caja del día" está en `ConciliacionAutomatica` (sub-componente), montado solo cuando el tab `value="conciliacion"` está activo.
- El archivo del test: `e2e/10-caja-onerror.spec.ts`
- Ejecutar con: `npx playwright test e2e/10-caja-onerror.spec.ts`

## Resultado validado
`1 passed (9.1s)` — sin timeouts en ninguno de los dos `expect`.
