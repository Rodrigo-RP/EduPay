# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 12-antiguedad-saldos.spec.ts >> Antigüedad de Saldos — E2E (RPT-07) >> T3: botón Excel dispara descarga con magic bytes PK (xlsx real, no JSON stub)
- Location: e2e/12-antiguedad-saldos.spec.ts:125:3

# Error details

```
TimeoutError: page.waitForSelector: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('nav, aside, [class*=\'sidebar\']') to be visible

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - generic [ref=e7]:
          - heading "Edupay" [level=1] [ref=e11]
          - paragraph [ref=e12]: Plataforma Administrativa SaaS
        - generic [ref=e13]:
          - heading "Roles Administrativos" [level=3] [ref=e14]
          - generic [ref=e15]:
            - generic [ref=e20]:
              - paragraph [ref=e21]: Super Administrador
              - paragraph [ref=e22]: Control total del sistema
            - generic [ref=e30]:
              - paragraph [ref=e31]: Administrador General
              - paragraph [ref=e32]: Gestión completa de la institución
            - generic [ref=e39]:
              - paragraph [ref=e40]: Administrador de Campus
              - paragraph [ref=e41]: Administración de campus específico
            - generic [ref=e46]:
              - paragraph [ref=e47]: Contador General
              - paragraph [ref=e48]: Gestión financiera y contable
            - generic [ref=e55]:
              - paragraph [ref=e56]: Auxiliar Contable
              - paragraph [ref=e57]: Asistencia en procesos contables
            - generic [ref=e63]:
              - paragraph [ref=e64]: Asistente Administrativo
              - paragraph [ref=e65]: Apoyo en tareas administrativas
            - generic [ref=e71]:
              - paragraph [ref=e72]: Personal de Admisiones
              - paragraph [ref=e73]: Gestión de procesos de admisión
      - generic [ref=e74]:
        - generic [ref=e75]:
          - generic [ref=e76]:
            - generic [ref=e77]: Acceso Administrativo
            - paragraph [ref=e80]: Sistema restringido para personal autorizado
          - generic [ref=e82]:
            - generic [ref=e83]:
              - text: Correo Institucional
              - textbox "Correo Institucional" [ref=e84]:
                - /placeholder: usuario@institucion.edu.mx
                - text: admin.campus@jfr.edu.mx
            - generic [ref=e85]:
              - text: Contraseña
              - generic [ref=e86]:
                - textbox "Contraseña" [ref=e87]:
                  - /placeholder: ••••••••••
                  - text: Demo2025!
                - button [ref=e88] [cursor=pointer]
            - button "Ingresar al Sistema" [ref=e89] [cursor=pointer]
        - generic [ref=e90]:
          - generic [ref=e91]: Conexión segura y cifrada
          - paragraph [ref=e95]: © 2024 Edupay SaaS. Sistema exclusivo para instituciones educativas.
    - region "Notifications (F8)":
      - list
  - generic [ref=e96]: Desconectado
```

# Test source

```ts
  1  | /**
  2  |  * e2e/helpers/auth.ts
  3  |  * Utilidades de autenticación compartidas entre tests E2E.
  4  |  */
  5  | import { type Page } from "@playwright/test";
  6  | 
  7  | export const ADMIN_EMAIL = "admin.campus@jfr.edu.mx";
  8  | export const ADMIN_PASSWORD = "Demo2025!";
  9  | export const GUARDIAN_EMAIL = "guardian@demo.edupay.mx";
  10 | export const GUARDIAN_PASSWORD = "Demo2025!";
  11 | 
  12 | /** Inicia sesión como administrador y espera que aparezca el panel.
  13 |  *
  14 |  * ARQUITECTURA: La app es una SPA con wouter. Después del login NO cambia la URL,
  15 |  * sino que re-renderiza condicionalmente mostrando el dashboard en vez del form.
  16 |  * Por eso esperamos contenido del panel, no un cambio de URL.
  17 |  */
  18 | export async function loginAsAdmin(page: Page) {
  19 |   await page.goto("/");
  20 |   await page.waitForLoadState("domcontentloaded");
  21 |   // Si ya hay sesión activa (token en localStorage) puede que el panel ya esté visible
  22 |   const alreadyIn = page.locator("nav, aside, [class*='sidebar'], [class*='Sidebar']").first();
  23 |   if (await alreadyIn.isVisible({ timeout: 2_000 }).catch(() => false)) {
  24 |     return; // ya autenticado
  25 |   }
  26 |   // Llenar credenciales
  27 |   await page.locator("#email").fill(ADMIN_EMAIL);
  28 |   await page.locator("#password").fill(ADMIN_PASSWORD);
  29 |   await page.locator('button[type="submit"]').click();
  30 |   // Esperar a que desaparezca el form y aparezca el sidebar del panel
> 31 |   await page.waitForSelector("nav, aside, [class*='sidebar']", { timeout: 15_000 });
     |              ^ TimeoutError: page.waitForSelector: Timeout 15000ms exceeded.
  32 | }
  33 | 
  34 | /** Inicia sesión como tutor/guardian y espera el portal de pagos. */
  35 | export async function loginAsGuardian(page: Page) {
  36 |   await page.goto("/");
  37 |   await page.waitForLoadState("domcontentloaded");
  38 |   // El portal de padres reutiliza el mismo form — usar guardianLogin
  39 |   // Por ahora no hay forma directa en la UI: usar la API directamente
  40 |   const res = await page.request.post("/api/auth/guardian-login", {
  41 |     data: { email: GUARDIAN_EMAIL, password: GUARDIAN_PASSWORD },
  42 |     failOnStatusCode: false,
  43 |   });
  44 |   if (res.status() === 200) {
  45 |     const body = await res.json();
  46 |     await page.evaluate((token) => {
  47 |       localStorage.setItem("auth_token", token);
  48 |       localStorage.setItem("auth_type", "guardian");
  49 |     }, body.token);
  50 |     await page.reload();
  51 |     await page.waitForSelector("[class*='portal'], [class*='Portal'], main", { timeout: 10_000 });
  52 |   }
  53 | }
  54 | 
```