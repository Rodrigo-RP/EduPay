# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 14-portal-padres-pago-completo.spec.ts >> PP-01 — Flujo 3 clics: seleccionar → método → confirmar → DB verificada >> PP-01: pago completo → ¡Pago exitoso! → pendingCharges=0 y balance=0 en DB
- Location: e2e/14-portal-padres-pago-completo.spec.ts:138:3

# Error details

```
TimeoutError: locator.click: Timeout 10000ms exceeded.
Call log:
  - waiting for getByText(/autocompletar tarjeta exitosa/i)

```

# Page snapshot

```yaml
- generic [ref=f2e2]:
  - generic [ref=f2e3]:
    - generic [ref=f2e5]:
      - generic [ref=f2e6]:
        - heading "Mi Portal de Pagos" [level=1] [ref=f2e7]
        - paragraph [ref=f2e8]: Instituto JFR — Ciclo 2025-2026
      - generic [ref=f2e9]:
        - button "Pagar" [ref=f2e10] [cursor=pointer]
        - button "Historial" [ref=f2e11] [cursor=pointer]
      - generic [ref=f2e12]:
        - generic [ref=f2e13]:
          - generic [ref=f2e14]: 1. Seleccionar
          - generic [ref=f2e15]: →
        - generic [ref=f2e16]:
          - generic [ref=f2e17]: 2. Método
          - generic [ref=f2e18]: →
        - generic [ref=f2e19]: 3. Confirmar
      - generic [ref=f2e22]:
        - generic [ref=f2e23]:
          - button [ref=f2e24] [cursor=pointer]
          - heading "Método de pago" [level=2] [ref=f2e27]
        - paragraph [ref=f2e29]: "Total a pagar: $1,400.00 MXN"
        - generic [ref=f2e30]:
          - generic [ref=f2e31] [cursor=pointer]: Transferencia SPEI
          - generic [ref=f2e37] [cursor=pointer]: Tarjeta de crédito/débito
          - generic [ref=f2e44] [cursor=pointer]: Pago en OXXO
        - generic [ref=f2e55]:
          - paragraph [ref=f2e56]: Pago seguro con Stripe
          - paragraph [ref=f2e57]: Ingresarás los datos de tu tarjeta en el siguiente paso de forma segura. Nunca almacenamos datos de tarjeta.
        - button "Continuar" [ref=f2e58] [cursor=pointer]
    - region "Notifications (F8)":
      - list
  - generic [ref=f2e59]: Desconectado
```

# Test source

```ts
  84  | 
  85  |   // Esperar texto que solo existe en el portal de padres, NO en el login admin
  86  |   // (el login admin muestra "Acceso Administrativo", el portal muestra "Mi Portal de Pagos")
  87  |   await page.waitForFunction(
  88  |     () => document.body.innerText.includes("Mi Portal de Pagos"),
  89  |     { timeout: 15_000 }
  90  |   );
  91  | 
  92  |   return token;
  93  | }
  94  | 
  95  | /** Llama a /api/guardian/dashboard con el JWT del tutor y retorna el body. */
  96  | async function getDashboard(page: Page, token: string) {
  97  |   const r = await page.request.get(`${BASE}/api/guardian/dashboard`, {
  98  |     headers: { Authorization: `Bearer ${token}` },
  99  |   });
  100 |   expect(r.status(), "GET /api/guardian/dashboard debe devolver 200").toBe(200);
  101 |   return r.json() as Promise<{
  102 |     pendingCharges:    Array<{ id: number; total_amount_centavos: number }>;
  103 |     totalPendingBalance: number;
  104 |     paymentHistory:    Array<{ id: number; estado: string; referencia_pasarela: string }>;
  105 |   }>;
  106 | }
  107 | 
  108 | // ─── beforeAll: re-seed para datos frescos ────────────────────────────────────
  109 | 
  110 | test.beforeAll(async ({ request }) => {
  111 |   // 0. Resetear rate limiters de auth para evitar 429 por corridas consecutivas
  112 |   await request.post(`${BASE}/api/test/reset-auth-rate-limit`);
  113 | 
  114 |   // 1. Login superadmin
  115 |   const lr = await request.post(`${BASE}/api/auth/login`, {
  116 |     data: { email: "superadmin@edupay.mx", password: DEMO_PASSWORD },
  117 |   });
  118 |   expect(lr.status(), "Login superadmin debe devolver 200 para re-seed").toBe(200);
  119 |   const { token: superToken } = await lr.json();
  120 | 
  121 |   // 2. Re-seed — garantiza datos limpios incluso si el test ya corrió antes
  122 |   const sr = await request.post(`${BASE}/api/demo/seed`, {
  123 |     headers: { Authorization: `Bearer ${superToken}` },
  124 |   });
  125 |   expect(sr.status(), "POST /api/demo/seed debe devolver 200").toBe(200);
  126 |   const body = await sr.json();
  127 |   expect(body.success, "seed.success debe ser true").toBe(true);
  128 | 
  129 |   // 3. Resetear rate limiters nuevamente post-seed (seed puede generar requests internas)
  130 |   await request.post(`${BASE}/api/test/reset-auth-rate-limit`);
  131 | });
  132 | 
  133 | // ─────────────────────────────────────────────────────────────────────────────
  134 | // PP-01 — Flujo real de 3 clics
  135 | // ─────────────────────────────────────────────────────────────────────────────
  136 | test.describe("PP-01 — Flujo 3 clics: seleccionar → método → confirmar → DB verificada", () => {
  137 | 
  138 |   test(
  139 |     "PP-01: pago completo → ¡Pago exitoso! → pendingCharges=0 y balance=0 en DB",
  140 |     async ({ page }) => {
  141 |       const token = await loginTutor(page, G1_EMAIL);
  142 | 
  143 |       // ── PRECONDICIÓN: snapshot inicial vía API ────────────────────────────
  144 |       const before = await getDashboard(page, token);
  145 |       // getPendingChargesByGuardian solo devuelve estado='pendiente', no 'vencido'
  146 |       // Seed: Junio=pendiente (vence 2026-06-10 → overdue, muestra badge), Julio=vencido → no aparece
  147 |       expect(
  148 |         before.pendingCharges?.length,
  149 |         "Familia López debe tener ≥1 cargo pendiente (Junio estado=pendiente)"
  150 |       ).toBeGreaterThanOrEqual(1);
  151 |       expect(
  152 |         before.totalPendingBalance,
  153 |         "Balance inicial debe ser > 0 MXN"
  154 |       ).toBeGreaterThan(0);
  155 |       const nPendBefore = before.pendingCharges.length;
  156 | 
  157 |       // ── CLIC 1: ver cargos y seleccionar todos ────────────────────────────
  158 |       await expect(
  159 |         page.getByText(/saldo pendiente total/i).first()
  160 |       ).toBeVisible({ timeout: 10_000 });
  161 | 
  162 |       // Cargos reales del fixture deben aparecer
  163 |       await expect(
  164 |         page.getByText(/colegiatura/i).first()
  165 |       ).toBeVisible({ timeout: 8_000 });
  166 | 
  167 |       // Familia índice 0 tiene julio vencido → badge "Vencido" visible
  168 |       await expect(
  169 |         page.getByText("Vencido").first()
  170 |       ).toBeVisible({ timeout: 5_000 });
  171 | 
  172 |       // "Pagar todo" selecciona todos los cargos pendientes y avanza al paso 2
  173 |       await page.getByRole("button", { name: /pagar todo/i }).click();
  174 | 
  175 |       // ── CLIC 2: seleccionar método de pago ───────────────────────────────
  176 |       await expect(
  177 |         page.getByText(/método de pago/i).first()
  178 |       ).toBeVisible({ timeout: 8_000 });
  179 | 
  180 |       // Seleccionar tarjeta
  181 |       await page.getByText(/tarjeta de crédito\/débito/i).first().click();
  182 | 
  183 |       // Autocompletar tarjeta exitosa (4242 4242 4242 4242)
> 184 |       await page.getByText(/autocompletar tarjeta exitosa/i).click();
      |                                                              ^ TimeoutError: locator.click: Timeout 10000ms exceeded.
  185 | 
  186 |       // Verificar que el campo quedó con el número de tarjeta correcto
  187 |       const cardInput = page.locator("input[placeholder='0000 0000 0000 0000']");
  188 |       await expect(cardInput).toHaveValue("4242 4242 4242 4242", { timeout: 3_000 });
  189 | 
  190 |       // "Continuar" → paso 3
  191 |       await page.getByRole("button", { name: /continuar/i }).click();
  192 | 
  193 |       // ── CLIC 3: confirmar pago ────────────────────────────────────────────
  194 |       await expect(
  195 |         page.getByText(/confirmar pago/i).first()
  196 |       ).toBeVisible({ timeout: 8_000 });
  197 | 
  198 |       // El botón muestra el monto real: "Confirmar pago $X,XXX.XX"
  199 |       const btnConfirmar = page.getByRole("button", { name: /confirmar pago/i });
  200 |       await expect(btnConfirmar).toBeVisible({ timeout: 5_000 });
  201 |       await btnConfirmar.click();
  202 | 
  203 |       // ── VERIFICACIÓN UI ───────────────────────────────────────────────────
  204 |       await expect(
  205 |         page.getByText(/¡pago exitoso!/i)
  206 |       ).toBeVisible({ timeout: 15_000 });
  207 | 
  208 |       // Folio de pago real (payment_id de la DB) visible en pantalla
  209 |       await expect(
  210 |         page.getByText(/folio de pago/i).first()
  211 |       ).toBeVisible({ timeout: 5_000 });
  212 | 
  213 |       // UUID CFDI simulado visible
  214 |       await expect(
  215 |         page.getByText(/uuid cfdi/i).first()
  216 |       ).toBeVisible({ timeout: 5_000 });
  217 | 
  218 |       // ── VERIFICACIÓN DB vía API ───────────────────────────────────────────
  219 |       const after = await getDashboard(page, token);
  220 | 
  221 |       // 1. pendingCharges = [] — todos los cargos están pagados
  222 |       expect(
  223 |         after.pendingCharges?.length ?? -1,
  224 |         `Aún quedan ${after.pendingCharges?.length} cargos pendientes; debe ser 0`
  225 |       ).toBe(0);
  226 | 
  227 |       // 2. totalPendingBalance = 0 — saldo real (no el de antes de pagar)
  228 |       expect(
  229 |         after.totalPendingBalance ?? 999,
  230 |         `totalPendingBalance = ${after.totalPendingBalance} MXN; debe ser 0`
  231 |       ).toBe(0);
  232 | 
  233 |       // 3. Historial tiene al menos nPendBefore pagos nuevos
  234 |       const nHistory = after.paymentHistory?.length ?? 0;
  235 |       expect(
  236 |         nHistory,
  237 |         "El historial debe tener ≥ los pagos realizados en este test"
  238 |       ).toBeGreaterThanOrEqual(nPendBefore);
  239 | 
  240 |       // 4. Al menos nPendBefore pagos con referencia sim_* y estado 'exitoso'
  241 |       //    (filtramos por sim_* porque el historial incluye pagos del seed con ref_demo_*)
  242 |       const simPayments = (after.paymentHistory ?? []).filter(
  243 |         (p: { referencia_pasarela?: string }) =>
  244 |           p.referencia_pasarela?.startsWith("sim_")
  245 |       );
  246 |       expect(
  247 |         simPayments.length,
  248 |         "Debe haber al menos 1 pago sim_* en el historial tras el pago del test"
  249 |       ).toBeGreaterThanOrEqual(nPendBefore);
  250 |       for (const p of simPayments.slice(0, nPendBefore)) {
  251 |         expect(
  252 |           (p as any).estado,
  253 |           `Pago ${(p as any).id} debe estar 'exitoso'`
  254 |         ).toBe("exitoso");
  255 |       }
  256 | 
  257 |       // ── VERIFICACIÓN EN PANTALLA: balance actualizado tras volver al inicio ─
  258 |       await page.getByRole("button", { name: /volver al inicio/i }).click();
  259 | 
  260 |       // Después de invalidateQueries + re-fetch, la UI debe mostrar "¡Todo al corriente!"
  261 |       // (el componente SelectCharges muestra ese mensaje cuando pendingCharges.length === 0)
  262 |       await expect(
  263 |         page.getByText(/todo al corriente/i)
  264 |       ).toBeVisible({ timeout: 10_000 });
  265 |     }
  266 |   );
  267 | });
  268 | 
  269 | // ─────────────────────────────────────────────────────────────────────────────
  270 | // PP-02 — Doble clic en "Confirmar pago" no duplica el pago
  271 | // ─────────────────────────────────────────────────────────────────────────────
  272 | test.describe("PP-02 — Doble clic: 1 llamada al API, 1 payment en DB (sin duplicado)", () => {
  273 | 
  274 |   test(
  275 |     "PP-02: dblclick → apiCallCount=1 y historial += nPendBefore (no duplicado)",
  276 |     async ({ page }) => {
  277 |       const token = await loginTutor(page, G2_EMAIL);
  278 | 
  279 |       const before = await getDashboard(page, token);
  280 |       const nPendBefore = before.pendingCharges?.length ?? 0;
  281 |       expect(
  282 |         nPendBefore,
  283 |         "Familia García debe tener cargos pendientes para el test"
  284 |       ).toBeGreaterThan(0);
```