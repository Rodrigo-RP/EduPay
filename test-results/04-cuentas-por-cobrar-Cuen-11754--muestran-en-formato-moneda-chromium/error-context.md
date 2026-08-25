# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 04-cuentas-por-cobrar.spec.ts >> Cuentas por Cobrar >> los montos de adeudo se muestran en formato moneda
- Location: e2e/04-cuentas-por-cobrar.spec.ts:29:3

# Error details

```
TimeoutError: page.waitForLoadState: Timeout 15000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - complementary [ref=e5]:
        - generic [ref=e7]:
          - generic [ref=e8]: 
          - generic [ref=e10]:
            - heading "Instituto JFR" [level=1] [ref=e11]
            - paragraph [ref=e12]: Campus Principal
        - navigation [ref=e13]:
          - generic [ref=e14]:
            - generic [ref=e15]:
              - heading " Principal" [level=3] [ref=e16]:
                - generic [ref=e17]: 
                - text: Principal
              - link " Dashboard" [ref=e19] [cursor=pointer]:
                - /url: /admin
                - generic [ref=e20]: 
                - text: Dashboard
            - generic [ref=e21]:
              - heading " Académico" [level=3] [ref=e22]:
                - generic [ref=e23]: 
                - text: Académico
              - generic [ref=e24]:
                - link " Estudiantes" [ref=e25] [cursor=pointer]:
                  - /url: /estudiantes
                  - generic [ref=e26]: 
                  - text: Estudiantes
                - link " Familias" [ref=e27] [cursor=pointer]:
                  - /url: /familias
                  - generic [ref=e28]: 
                  - text: Familias
            - generic [ref=e29]:
              - heading "$ Financiero" [level=3] [ref=e30]:
                - generic [ref=e31]: $
                - text: Financiero
              - generic [ref=e32]:
                - link " Cargos" [ref=e33] [cursor=pointer]:
                  - /url: /cargos
                  - generic [ref=e34]: 
                  - generic [ref=e35]: Cargos
                - link " Pagos" [ref=e36] [cursor=pointer]:
                  - /url: /pagos
                  - generic [ref=e37]: 
                  - generic [ref=e38]: Pagos
                - link " Cuentas por Cobrar" [ref=e39] [cursor=pointer]:
                  - /url: /cuentas-por-cobrar
                  - generic [ref=e40]: 
                  - generic [ref=e41]: Cuentas por Cobrar
                - link " Caja y Conciliación" [ref=e42] [cursor=pointer]:
                  - /url: /caja-conciliacion
                  - generic [ref=e43]: 
                  - generic [ref=e44]: Caja y Conciliación
                - link " Excepciones bancarias 2" [ref=e45] [cursor=pointer]:
                  - /url: /excepciones-conciliacion
                  - generic [ref=e46]: 
                  - generic [ref=e47]: Excepciones bancarias
                  - generic [ref=e48]: "2"
                - link " Reportes Financieros" [ref=e49] [cursor=pointer]:
                  - /url: /reportes-financieros
                  - generic [ref=e50]: 
                  - generic [ref=e51]: Reportes Financieros
                - link " Catálogo Productos" [ref=e52] [cursor=pointer]:
                  - /url: /catalogo-productos
                  - generic [ref=e53]: 
                  - generic [ref=e54]: Catálogo Productos
                - link " Asignación de Precios" [ref=e55] [cursor=pointer]:
                  - /url: /asignacion-precios
                  - generic [ref=e56]: 
                  - generic [ref=e57]: Asignación de Precios
                - link "% Becas y Descuentos" [ref=e58] [cursor=pointer]:
                  - /url: /becas
                  - generic [ref=e59]: "%"
                  - generic [ref=e60]: Becas y Descuentos
                - link " Fiscal y Contable" [ref=e61] [cursor=pointer]:
                  - /url: /fiscal-contable
                  - generic [ref=e62]: 
                  - generic [ref=e63]: Fiscal y Contable
            - generic [ref=e64]:
              - heading " Administrativo" [level=3] [ref=e65]:
                - generic [ref=e66]: 
                - text: Administrativo
              - link " Gestión de Usuarios" [ref=e68] [cursor=pointer]:
                - /url: /usuarios
                - generic [ref=e69]: 
                - text: Gestión de Usuarios
            - generic [ref=e70]:
              - heading " Sistema" [level=3] [ref=e71]:
                - generic [ref=e72]: 
                - text: Sistema
              - generic [ref=e73]:
                - link " Notificaciones" [ref=e74] [cursor=pointer]:
                  - /url: /notificaciones
                  - generic [ref=e75]: 
                  - text: Notificaciones
                - link " Reportes" [ref=e76] [cursor=pointer]:
                  - /url: /reportes
                  - generic [ref=e77]: 
                  - text: Reportes
                - link " Configuración" [ref=e78] [cursor=pointer]:
                  - /url: /configuracion
                  - generic [ref=e79]: 
                  - text: Configuración
                - link " Configuración de Pagos" [ref=e80] [cursor=pointer]:
                  - /url: /configuracion-pagos-completa
                  - generic [ref=e81]: 
                  - text: Configuración de Pagos
                - link " Historial" [ref=e82] [cursor=pointer]:
                  - /url: /historial
                  - generic [ref=e83]: 
                  - text: Historial
                - button " Capacitación" [ref=e84] [cursor=pointer]:
                  - generic [ref=e85]: 
                  - text: Capacitación
        - generic [ref=e87]:
          - generic [ref=e88]: A
          - generic [ref=e90]:
            - paragraph [ref=e91]: admin.campus@jfr.edu.mx
            - paragraph [ref=e92]: administrador_campus
          - button "" [ref=e93] [cursor=pointer]
      - generic [ref=e95]:
        - banner [ref=e96]:
          - generic [ref=e98]:
            - generic [ref=e99]:
              - generic [ref=e102]: "Ciclo:"
              - combobox [ref=e103] [cursor=pointer]:
                - generic: 2026-2027
            - generic [ref=e106]:
              - generic [ref=e110]: "Nivel:"
              - combobox [ref=e111] [cursor=pointer]:
                - generic: Todos los niveles
            - generic [ref=e114]:
              - generic [ref=e117]: "Período:"
              - combobox [ref=e118] [cursor=pointer]:
                - generic: Este mes
            - textbox "Buscar alumno, tutor, pago…" [ref=e123]
            - button "Abrir asistente EduPay" [ref=e124] [cursor=pointer]: Asistente
            - button [ref=e128] [cursor=pointer]:
              - generic [ref=e131]:
                - paragraph [ref=e132]: admin.campus@jfr.edu.mx
                - paragraph [ref=e133]: Administrador Campus
        - main [ref=e134]:
          - generic [ref=e135]:
            - heading "Cuentas por Cobrar" [level=1] [ref=e141]
            - generic [ref=e142]:
              - generic [ref=e143]:
                - generic [ref=e144]: Total por Cobrar
                - generic [ref=e146]:
                  - generic [ref=e147]: $1,219,568,110.00
                  - paragraph [ref=e148]: 18 cuenta(s) vencida(s)
              - generic [ref=e149]:
                - generic [ref=e150]: Promesas activas
                - generic [ref=e152]:
                  - generic [ref=e153]: "0"
                  - paragraph [ref=e154]: registradas en el historial
              - generic [ref=e155]:
                - generic [ref=e156]: Cuentas morosas
                - generic [ref=e158]:
                  - generic [ref=e159]: "9"
                  - paragraph [ref=e160]: requieren gestión prioritaria
            - generic [ref=e161]:
              - button "Generar Reporte TXT" [ref=e162] [cursor=pointer]
              - button "Generar Excel (CSV)" [ref=e163] [cursor=pointer]
              - button "Generar PDF" [ref=e164] [cursor=pointer]
            - generic [ref=e165]:
              - tablist [ref=e166]:
                - tab "Lista de cuentas" [ref=e167] [cursor=pointer]
                - tab "Seguimiento" [ref=e168] [cursor=pointer]
                - tab "Reportes" [selected] [ref=e169] [cursor=pointer]
              - tabpanel "Reportes" [ref=e170]:
                - generic [ref=e171]:
                  - generic [ref=e172]:
                    - generic [ref=e173]: Reportes de Cobranza Disponibles
                    - paragraph [ref=e174]: Descarga reportes especializados de gestión de cartera por cobrar
                  - generic [ref=e176]:
                    - generic [ref=e178]:
                      - heading "Antigüedad de Saldos" [level=3] [ref=e179]
                      - paragraph [ref=e180]: Análisis detallado por rangos de días vencidos
                      - generic [ref=e181]:
                        - generic [ref=e182]:
                          - generic [ref=e183]: "Formato:"
                          - generic [ref=e184]: PDF
                        - generic [ref=e185]:
                          - generic [ref=e186]: "Tamaño:"
                          - generic [ref=e187]: 189 KB
                        - generic [ref=e188]:
                          - generic [ref=e189]: "Fecha:"
                          - generic [ref=e190]: 23/01/2025
                      - generic [ref=e191]:
                        - button "Descargar" [ref=e192] [cursor=pointer]
                        - button [ref=e193] [cursor=pointer]
                    - generic [ref=e195]:
                      - heading "Cartera Vencida" [level=3] [ref=e196]
                      - paragraph [ref=e197]: Reporte de cuentas morosas y vencidas
                      - generic [ref=e198]:
                        - generic [ref=e199]:
                          - generic [ref=e200]: "Formato:"
                          - generic [ref=e201]: Excel
                        - generic [ref=e202]:
                          - generic [ref=e203]: "Tamaño:"
                          - generic [ref=e204]: 156 KB
                        - generic [ref=e205]:
                          - generic [ref=e206]: "Fecha:"
                          - generic [ref=e207]: 23/01/2025
                      - generic [ref=e208]:
                        - button "Descargar" [ref=e209] [cursor=pointer]
                        - button [ref=e210] [cursor=pointer]
                    - generic [ref=e212]:
                      - heading "Eficiencia de Cobranza" [level=3] [ref=e213]
                      - paragraph [ref=e214]: Métricas de gestión y recuperación
                      - generic [ref=e215]:
                        - generic [ref=e216]:
                          - generic [ref=e217]: "Formato:"
                          - generic [ref=e218]: PDF
                        - generic [ref=e219]:
                          - generic [ref=e220]: "Tamaño:"
                          - generic [ref=e221]: 201 KB
                        - generic [ref=e222]:
                          - generic [ref=e223]: "Fecha:"
                          - generic [ref=e224]: 22/01/2025
                      - generic [ref=e225]:
                        - button "Descargar" [ref=e226] [cursor=pointer]
                        - button [ref=e227] [cursor=pointer]
                    - generic [ref=e229]:
                      - heading "Seguimiento de Promesas" [level=3] [ref=e230]
                      - paragraph [ref=e231]: Control de fechas comprometidas de pago
                      - generic [ref=e232]:
                        - generic [ref=e233]:
                          - generic [ref=e234]: "Formato:"
                          - generic [ref=e235]: Excel
                        - generic [ref=e236]:
                          - generic [ref=e237]: "Tamaño:"
                          - generic [ref=e238]: 143 KB
                        - generic [ref=e239]:
                          - generic [ref=e240]: "Fecha:"
                          - generic [ref=e241]: 23/01/2025
                      - generic [ref=e242]:
                        - button "Descargar" [ref=e243] [cursor=pointer]
                        - button [ref=e244] [cursor=pointer]
                    - generic [ref=e246]:
                      - heading "Análisis de Morosidad" [level=3] [ref=e247]
                      - paragraph [ref=e248]: Tendencias y patrones de comportamiento
                      - generic [ref=e249]:
                        - generic [ref=e250]:
                          - generic [ref=e251]: "Formato:"
                          - generic [ref=e252]: PDF
                        - generic [ref=e253]:
                          - generic [ref=e254]: "Tamaño:"
                          - generic [ref=e255]: 187 KB
                        - generic [ref=e256]:
                          - generic [ref=e257]: "Fecha:"
                          - generic [ref=e258]: 22/01/2025
                      - generic [ref=e259]:
                        - button "Descargar" [ref=e260] [cursor=pointer]
                        - button [ref=e261] [cursor=pointer]
                    - generic [ref=e263]:
                      - heading "Reporte Ejecutivo Cobranza" [level=3] [ref=e264]
                      - paragraph [ref=e265]: Resumen gerencial de gestión
                      - generic [ref=e266]:
                        - generic [ref=e267]:
                          - generic [ref=e268]: "Formato:"
                          - generic [ref=e269]: PDF
                        - generic [ref=e270]:
                          - generic [ref=e271]: "Tamaño:"
                          - generic [ref=e272]: 164 KB
                        - generic [ref=e273]:
                          - generic [ref=e274]: "Fecha:"
                          - generic [ref=e275]: 23/01/2025
                      - generic [ref=e276]:
                        - button "Descargar" [ref=e277] [cursor=pointer]
                        - button [ref=e278] [cursor=pointer]
    - region "Notifications (F8)":
      - list
  - generic [ref=e279]: Conectado
```

# Test source

```ts
  1  | /**
  2  |  * e2e/04-cuentas-por-cobrar.spec.ts
  3  |  * Módulo: Cuentas por Cobrar
  4  |  * Capa: Playwright (E2E)
  5  |  *
  6  |  * Cubre:
  7  |  *   - La lista de adeudos carga sin error
  8  |  *   - Los montos se muestran en formato moneda
  9  |  *   - El filtro o búsqueda existe y responde
  10 |  */
  11 | import { test, expect } from "@playwright/test";
  12 | import { loginAsAdmin } from "./helpers/auth";
  13 | 
  14 | test.describe("Cuentas por Cobrar", () => {
  15 |   test.beforeEach(async ({ page }) => {
  16 |     await loginAsAdmin(page);
  17 |     await page.evaluate(() => { window.history.pushState({}, "", "/cuentas-por-cobrar"); });
> 18 |     await page.waitForLoadState("networkidle", { timeout: 15_000 });
     |                ^ TimeoutError: page.waitForLoadState: Timeout 15000ms exceeded.
  19 |   });
  20 | 
  21 |   test("la página carga y no muestra error de servidor", async ({ page }) => {
  22 |     await expect(page.getByText(/error 500|internal server|algo salió mal/i)).toHaveCount(0);
  23 |     const hasContent =
  24 |       (await page.locator("table, [class*='list'], [class*='grid']").count()) > 0 ||
  25 |       (await page.getByText(/sin adeudos|al corriente|0 cuentas|cuentas por cobrar/i).count()) > 0;
  26 |     expect(hasContent, "La página no tiene contenido visible").toBeTruthy();
  27 |   });
  28 | 
  29 |   test("los montos de adeudo se muestran en formato moneda", async ({ page }) => {
  30 |     const moneyPattern = page.getByText(/\$[\d,]+(\.\d{2})?/);
  31 |     const count = await moneyPattern.count();
  32 |     if (count > 0) {
  33 |       await expect(moneyPattern.first()).toBeVisible();
  34 |     }
  35 |     // Si no hay adeudos, la prueba pasa trivialmente (estado válido)
  36 |   });
  37 | 
  38 |   test("existe algún control de filtrado o búsqueda", async ({ page }) => {
  39 |     const filter = page
  40 |       .getByRole("combobox")
  41 |       .or(page.getByPlaceholder(/filtrar|buscar|alumno/i))
  42 |       .or(page.getByRole("searchbox"))
  43 |       .first();
  44 |     if (!(await filter.count())) {
  45 |       test.skip(true, "No hay control de filtro en esta vista");
  46 |       return;
  47 |     }
  48 |     await expect(filter).toBeVisible();
  49 |     await expect(filter).toBeEnabled();
  50 |   });
  51 | });
  52 | 
```