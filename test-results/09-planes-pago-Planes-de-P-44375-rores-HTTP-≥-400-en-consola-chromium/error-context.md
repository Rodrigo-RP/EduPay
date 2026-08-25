# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 09-planes-pago.spec.ts >> Planes de Pago — E2E (ADR-002) >> PP-01: /planes-pago carga sin errores HTTP ≥ 400 en consola
- Location: e2e/09-planes-pago.spec.ts:89:3

# Error details

```
Error: expect(received).toBeTruthy()

Received: undefined
```

# Test source

```ts
  1   | /**
  2   |  * E2E — Planes de Pago (ADR-002)
  3   |  *
  4   |  * Verifica:
  5   |  *  1. La página /planes-pago carga sin errores de consola
  6   |  *  2. Un plan creado vía API aparece en la lista con el alumno correcto
  7   |  *  3. Expandir el plan muestra las cuotas (charges reales del ledger)
  8   |  *  4. "Marcar pagada" llama a /api/admin/charges/:id/pagar-manual (NO al 410)
  9   |  *  5. Después de pagar, la cuota muestra el badge "Pagado" y el progreso sube
  10  |  *  6. No aparece ningún error 410 ni ningún otro error HTTP ≥400 en la consola
  11  |  *
  12  |  * ESTRATEGIA:
  13  |  *  El plan se pre-crea vía API antes de navegar, igual que en 08-excepciones.spec.ts.
  14  |  *  Así el fetch inicial de la página ya incluye el plan sin depender del modal.
  15  |  */
  16  | 
  17  | import { test, expect, type Page, type BrowserContext } from "@playwright/test";
  18  | import { loginAsAdmin } from "./helpers/auth";
  19  | 
  20  | const BASE = "http://localhost:5000";
  21  | 
  22  | // ── Helpers API ───────────────────────────────────────────────────────────────
  23  | async function getAdminToken(request: any): Promise<string> {
  24  |   const res = await request.post(`${BASE}/api/auth/login`, {
  25  |     data: { email: "admin.campus@jfr.edu.mx", password: "Demo2025!" },
  26  |   });
  27  |   const body = await res.json();
  28  |   return body.token as string;
  29  | }
  30  | 
  31  | /**
  32  |  * Crea un plan de pago Modo B (futuro) vía API y devuelve { planId, cuotas }.
  33  |  * Usa campus_id=48, concept_id=88 (Colegiatura Mensual Primaria $2,800),
  34  |  * student_id=121 (Sofía Valentina López Hernández) — datos de demo seed.
  35  |  */
  36  | async function crearPlanViaApi(
  37  |   request: any,
  38  |   token: string
  39  | ): Promise<{ planId: number; cuotas: any[] }> {
  40  |   const res = await request.post(`${BASE}/api/planes-pago`, {
  41  |     headers: { Authorization: `Bearer ${token}` },
  42  |     data: {
  43  |       concept_id:   88,   // Colegiatura Mensual Primaria
  44  |       student_id:   121,  // Sofía Valentina López Hernández
  45  |       numero_pagos: 3,
  46  |       frecuencia:   "mensual",
  47  |       fecha_inicio: new Date().toISOString().slice(0, 10),
  48  |       observaciones: "Plan E2E — creado por test automatizado",
  49  |     },
  50  |   });
  51  |   const body = await res.json();
  52  |   return { planId: body.id, cuotas: body.cuotas || [] };
  53  | }
  54  | 
  55  | /** Navega a /planes-pago usando pushState (SPA con wouter). */
  56  | async function goToPlanesPago(page: Page) {
  57  |   await page.evaluate(() => window.history.pushState({}, "", "/planes-pago"));
  58  |   await page.waitForLoadState("networkidle");
  59  |   // Esperar el título de la página
  60  |   await page.waitForSelector('h1:has-text("Planes de Pago")', { timeout: 10_000 });
  61  | }
  62  | 
  63  | // ── Suite ─────────────────────────────────────────────────────────────────────
  64  | test.describe("Planes de Pago — E2E (ADR-002)", () => {
  65  |   let token: string;
  66  |   let planId: number;
  67  |   let cuotaId: number; // charge id de la primera cuota
  68  | 
  69  |   test.beforeAll(async ({ request }) => {
  70  |     token = await getAdminToken(request);
  71  |     const { planId: pid, cuotas } = await crearPlanViaApi(request, token);
  72  |     planId  = pid;
  73  |     cuotaId = cuotas[0]?.id;
> 74  |     expect(planId).toBeTruthy();
      |                    ^ Error: expect(received).toBeTruthy()
  75  |     expect(cuotaId).toBeTruthy();
  76  |   });
  77  | 
  78  |   test.afterAll(async ({ request }) => {
  79  |     // Cancelar el plan creado para limpiar datos
  80  |     if (planId) {
  81  |       await request.patch(`${BASE}/api/planes-pago/${planId}/cancelar`, {
  82  |         headers: { Authorization: `Bearer ${token}` },
  83  |         data: { motivo: "Limpieza post-test E2E automatizado planes pago" },
  84  |       }).catch(() => {});
  85  |     }
  86  |   });
  87  | 
  88  |   // ── 1. Página carga sin error 410 ─────────────────────────────────────────
  89  |   test("PP-01: /planes-pago carga sin errores HTTP ≥ 400 en consola", async ({ page }) => {
  90  |     const errors4xx: string[] = [];
  91  | 
  92  |     // Capturar respuestas HTTP con error
  93  |     page.on("response", resp => {
  94  |       if (resp.status() >= 400) {
  95  |         errors4xx.push(`${resp.status()} ${resp.url()}`);
  96  |       }
  97  |     });
  98  | 
  99  |     await loginAsAdmin(page);
  100 |     await goToPlanesPago(page);
  101 | 
  102 |     // Filtrar 401 a rutas de otras páginas que puedan cargar en background
  103 |     const erroresCriticos = errors4xx.filter(e =>
  104 |       !e.includes("/api/guardian") &&
  105 |       !e.includes("/api/auth/me") &&
  106 |       !e.includes("favicon")
  107 |     );
  108 |     expect(erroresCriticos, `Errores HTTP encontrados: ${erroresCriticos.join(", ")}`).toHaveLength(0);
  109 |   });
  110 | 
  111 |   // ── 2. Plan pre-creado aparece en la lista ───────────────────────────────
  112 |   test("PP-02: El plan creado aparece en la lista con nombre del alumno", async ({ page }) => {
  113 |     await loginAsAdmin(page);
  114 |     await goToPlanesPago(page);
  115 | 
  116 |     // Buscar el nombre del alumno en la tarjeta
  117 |     const planCard = page.locator("text=Sofía Valentina").first();
  118 |     await expect(planCard).toBeVisible({ timeout: 10_000 });
  119 | 
  120 |     // Debe mostrar el badge "Activo"
  121 |     const badge = page.locator(".bg-blue-100").filter({ hasText: "Activo" }).first();
  122 |     await expect(badge).toBeVisible();
  123 |   });
  124 | 
  125 |   // ── 3. Expandir muestra cuotas como charges reales ───────────────────────
  126 |   test("PP-03: Expandir el plan muestra las 3 cuotas del ledger (monto_base_centavos)", async ({ page }) => {
  127 |     await loginAsAdmin(page);
  128 |     await goToPlanesPago(page);
  129 | 
  130 |     // Hacer clic en el botón de expandir del primer plan del alumno
  131 |     const card = page.locator("div.space-y-3 > div").filter({ hasText: "Sofía Valentina" }).first();
  132 |     await card.locator("button[variant=ghost], button:has(.lucide-chevron-down)").click();
  133 | 
  134 |     // Deben aparecer 3 filas de cuota
  135 |     const filasConCuota = card.locator("div.space-y-2 > div");
  136 |     await expect(filasConCuota).toHaveCount(3, { timeout: 8_000 });
  137 | 
  138 |     // El monto debe ser ~$933.33 (2,800,000 / 3 cuotas en centavos → 933,333 → $933.33)
  139 |     // Verificamos que hay texto con $ en las cuotas
  140 |     const montoTexto = card.locator("p.font-medium").filter({ hasText: "$" }).first();
  141 |     await expect(montoTexto).toBeVisible();
  142 |   });
  143 | 
  144 |   // ── 4 & 5. Marcar pagada usa pagar-manual, NO el 410 ────────────────────
  145 |   test("PP-04: 'Marcar pagada' llama a pagar-manual (no 410) y actualiza el badge a Pagado", async ({ page }) => {
  146 |     const requests410: string[] = [];
  147 |     const requests200: string[] = [];
  148 | 
  149 |     page.on("response", resp => {
  150 |       if (resp.url().includes("/cuotas/") && resp.url().includes("/pagar")) {
  151 |         requests410.push(`${resp.status()} ${resp.url()}`);
  152 |       }
  153 |       if (resp.url().includes("/pagar-manual")) {
  154 |         requests200.push(`${resp.status()} ${resp.url()}`);
  155 |       }
  156 |     });
  157 | 
  158 |     await loginAsAdmin(page);
  159 |     await goToPlanesPago(page);
  160 | 
  161 |     // Expandir el plan del alumno de prueba
  162 |     const card = page.locator("div.space-y-3 > div").filter({ hasText: "Sofía Valentina" }).first();
  163 |     await card.locator("button").filter({ has: page.locator(".lucide-chevron-down") }).click();
  164 | 
  165 |     // Esperar que aparezcan los botones "Marcar pagada"
  166 |     const btnMarcar = card.locator("button:has-text('Marcar pagada')").first();
  167 |     await expect(btnMarcar).toBeVisible({ timeout: 8_000 });
  168 | 
  169 |     // Capturar la request de pago
  170 |     const [response] = await Promise.all([
  171 |       page.waitForResponse(r => r.url().includes("/pagar-manual"), { timeout: 10_000 }),
  172 |       btnMarcar.click(),
  173 |     ]);
  174 | 
```