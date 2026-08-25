# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 14-portal-padres-pago-completo.spec.ts >> PP-02 — Doble clic: 1 llamada al API, 1 payment en DB (sin duplicado) >> PP-02: dblclick → apiCallCount=1 y historial += nPendBefore (no duplicado)
- Location: e2e/14-portal-padres-pago-completo.spec.ts:294:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/¡pago exitoso!/i)
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByText(/¡pago exitoso!/i)

```

```yaml
- heading "Mi Portal de Pagos" [level=1]
- paragraph: Instituto JFR — Ciclo 2025-2026
- button "Pagar"
- button "Historial"
- text: 1. Seleccionar → 2. Método → 3. Confirmar
- button:
  - img
- heading "Confirmar pago" [level=2]
- paragraph: $2,450.00 MXN
- text: Resumen del pago
- paragraph: Colegiatura Mensual Secundaria
- paragraph: Mateo Alejandro García Ruiz
- paragraph: $2,450.00
- img
- text: Datos de tarjeta
- iframe
- iframe
- paragraph: "🧪 Tarjetas de prueba:"
- code: 4242 4242 4242 4242
- text: → Pago exitoso
- code: 4000 0000 0000 9995
- text: → Fondos insuficientes
- code: 4000 0000 0000 0002
- text: → Tarjeta declinada
- paragraph: "CVV y vencimiento: cualquier valor válido"
- img
- text: Tarjeta de crédito/débito
- img
- text: Pago seguro con encriptación SSL
- img
- text: Se generará factura CFDI automáticamente y será enviada a su email.
- button "Confirmar pago $2,450.00"
- region "Notifications (F8)":
  - list
- img
- text: Desconectado
```

# Test source

```ts
  247 |       // 2. totalPendingBalance = 0 — saldo real (no el de antes de pagar)
  248 |       expect(
  249 |         after.totalPendingBalance ?? 999,
  250 |         `totalPendingBalance = ${after.totalPendingBalance} MXN; debe ser 0`
  251 |       ).toBe(0);
  252 | 
  253 |       // 3. Historial tiene al menos nPendBefore pagos nuevos
  254 |       const nHistory = after.paymentHistory?.length ?? 0;
  255 |       expect(
  256 |         nHistory,
  257 |         "El historial debe tener ≥ los pagos realizados en este test"
  258 |       ).toBeGreaterThanOrEqual(nPendBefore);
  259 | 
  260 |       // 4. Al menos nPendBefore pagos con referencia sim_* y estado 'exitoso'
  261 |       //    (filtramos por sim_* porque el historial incluye pagos del seed con ref_demo_*)
  262 |       const simPayments = (after.paymentHistory ?? []).filter(
  263 |         (p: { referencia_pasarela?: string }) =>
  264 |           p.referencia_pasarela?.startsWith("sim_")
  265 |       );
  266 |       expect(
  267 |         simPayments.length,
  268 |         "Debe haber al menos 1 pago sim_* en el historial tras el pago del test"
  269 |       ).toBeGreaterThanOrEqual(nPendBefore);
  270 |       for (const p of simPayments.slice(0, nPendBefore)) {
  271 |         expect(
  272 |           (p as any).estado,
  273 |           `Pago ${(p as any).id} debe estar 'exitoso'`
  274 |         ).toBe("exitoso");
  275 |       }
  276 | 
  277 |       // ── VERIFICACIÓN EN PANTALLA: balance actualizado tras volver al inicio ─
  278 |       await page.getByRole("button", { name: /volver al inicio/i }).click();
  279 | 
  280 |       // Después de invalidateQueries + re-fetch, la UI debe mostrar "¡Todo al corriente!"
  281 |       // (el componente SelectCharges muestra ese mensaje cuando pendingCharges.length === 0)
  282 |       await expect(
  283 |         page.getByText(/todo al corriente/i)
  284 |       ).toBeVisible({ timeout: 10_000 });
  285 |     }
  286 |   );
  287 | });
  288 | 
  289 | // ─────────────────────────────────────────────────────────────────────────────
  290 | // PP-02 — Doble clic en "Confirmar pago" no duplica el pago
  291 | // ─────────────────────────────────────────────────────────────────────────────
  292 | test.describe("PP-02 — Doble clic: 1 llamada al API, 1 payment en DB (sin duplicado)", () => {
  293 | 
  294 |   test(
  295 |     "PP-02: dblclick → apiCallCount=1 y historial += nPendBefore (no duplicado)",
  296 |     async ({ page }) => {
  297 |       const token = await loginTutor(page, G2_EMAIL);
  298 | 
  299 |       const before = await getDashboard(page, token);
  300 |       const nPendBefore = before.pendingCharges?.length ?? 0;
  301 |       expect(
  302 |         nPendBefore,
  303 |         "Familia García debe tener cargos pendientes para el test"
  304 |       ).toBeGreaterThan(0);
  305 | 
  306 |       const historialAntes = before.paymentHistory?.length ?? 0;
  307 | 
  308 |       // Interceptar /api/guardian/pagar para contar cuántas veces llega al servidor
  309 |       let apiCallCount = 0;
  310 |       await page.route("**/api/guardian/pagar", async (route) => {
  311 |         apiCallCount++;
  312 |         await route.continue(); // dejar pasar la petición real al servidor
  313 |       });
  314 | 
  315 |       // ── Navegar al paso 3 (confirmar) vía UI ─────────────────────────────
  316 |       await expect(
  317 |         page.getByText(/saldo pendiente total/i).first()
  318 |       ).toBeVisible({ timeout: 10_000 });
  319 | 
  320 |       // Pagar todo → paso 2
  321 |       await page.getByRole("button", { name: /pagar todo/i }).click();
  322 | 
  323 |       await expect(
  324 |         page.getByText(/método de pago/i).first()
  325 |       ).toBeVisible({ timeout: 8_000 });
  326 | 
  327 |       // Selección de método → paso de confirmación → tarjeta real de Stripe.
  328 |       await page.getByText(/tarjeta de crédito\/débito/i).first().click();
  329 |       await page.getByRole("button", { name: /continuar/i }).click();
  330 | 
  331 |       await expect(
  332 |         page.getByText(/confirmar pago/i).first()
  333 |       ).toBeVisible({ timeout: 8_000 });
  334 |       await completarTarjetaStripe(page);
  335 | 
  336 |       // ── DOBLE CLIC ────────────────────────────────────────────────────────
  337 |       //   dblclick() envía mousedown, mouseup, click, mousedown, mouseup, click, dblclick
  338 |       //   El primer click llama procesarPagoFinal → setProcessing(true) → botón disabled
  339 |       //   El segundo click llega al DOM pero el botón está disabled → no dispara mutate
  340 |       const btnConfirmar = page.getByRole("button", { name: /confirmar pago/i });
  341 |       await expect(btnConfirmar).toBeVisible({ timeout: 5_000 });
  342 |       await btnConfirmar.dblclick();
  343 | 
  344 |       // Esperar que el pago se procese y llegue al paso de éxito
  345 |       await expect(
  346 |         page.getByText(/¡pago exitoso!/i)
> 347 |       ).toBeVisible({ timeout: 15_000 });
      |         ^ Error: expect(locator).toBeVisible() failed
  348 | 
  349 |       // ── VERIFICACIÓN 1: UI protegió el doble envío ──────────────────────
  350 |       //   Solo debe haber llegado 1 request al servidor.
  351 |       expect(
  352 |         apiCallCount,
  353 |         `El servidor recibió ${apiCallCount} llamadas; la UI debe enviar solo 1`
  354 |       ).toBe(1);
  355 | 
  356 |       // ── VERIFICACIÓN 2: DB — nPendBefore pagos nuevos, sin duplicados ──
  357 |       const after = await getDashboard(page, token);
  358 |       const historialDespues = after.paymentHistory?.length ?? 0;
  359 | 
  360 |       expect(
  361 |         historialDespues - historialAntes,
  362 |         `Se registraron ${historialDespues - historialAntes} pagos; debían ser ${nPendBefore} (1 por cargo, sin duplicado)`
  363 |       ).toBe(nPendBefore);
  364 | 
  365 |       // No quedan cargos pendientes
  366 |       expect(
  367 |         after.pendingCharges?.length ?? -1,
  368 |         "No deben quedar cargos pendientes tras el pago"
  369 |       ).toBe(0);
  370 |     }
  371 |   );
  372 | });
  373 | 
```