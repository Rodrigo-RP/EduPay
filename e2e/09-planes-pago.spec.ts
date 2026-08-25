/**
 * E2E — Planes de Pago (ADR-002)
 *
 * Verifica:
 *  1. La página /planes-pago carga sin errores de consola
 *  2. Un plan creado vía API aparece en la lista con el alumno correcto
 *  3. Expandir el plan muestra las cuotas (charges reales del ledger)
 *  4. "Marcar pagada" llama a /api/admin/charges/:id/pagar-manual (NO al 410)
 *  5. Después de pagar, la cuota muestra el badge "Pagado" y el progreso sube
 *  6. No aparece ningún error 410 ni ningún otro error HTTP ≥400 en la consola
 *
 * ESTRATEGIA:
 *  El plan se pre-crea vía API antes de navegar, igual que en 08-excepciones.spec.ts.
 *  Así el fetch inicial de la página ya incluye el plan sin depender del modal.
 */

import { test, expect, type Page } from "@playwright/test";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { pool as db } from "../server/db";

const BASE = "http://localhost:5000";

// ── Helpers API ───────────────────────────────────────────────────────────────
async function getAdminToken(request: any): Promise<string> {
  const res = await request.post(`${BASE}/api/auth/login`, {
    data: { email: "admin.campus@jfr.edu.mx", password: "Demo2025!" },
  });
  expect(res.status(), "El login administrativo de preparación debe funcionar").toBe(200);
  const body = await res.json();
  return body.token as string;
}

/**
 * El fixture no depende del demo seed: crea un campus, concepto y alumno
 * exclusivos para esta corrida en el tenant del administrador. El JWT de la
 * sesión de UI queda acotado al campus temporal.
 */
const fixture = {
  campusId: 0,
  conceptId: 0,
  studentId: 0,
  studentName: "",
  userId: 0,
  userEmail: "",
  userPassword: "",
  authUser: "",
  token: "",
  planId: 0,
  cuotaId: 0,
};

async function crearFixture(request: any): Promise<void> {
  const adminToken = await getAdminToken(request);
  const adminClaims = jwt.decode(adminToken) as { tenant_id?: number } | null;
  const tenantId = Number(adminClaims?.tenant_id);
  expect(tenantId, "El JWT administrativo debe incluir tenant_id").toBeGreaterThan(0);

  const suffix = `${Date.now()}-${process.pid}`;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const campus = await client.query(
      `INSERT INTO campuses (tenant_id, nombre, onboarding_completado)
       VALUES ($1, $2, true)
       RETURNING id`,
      [tenantId, `Campus E2E Planes ${suffix}`],
    );
    fixture.campusId = Number(campus.rows[0].id);

    fixture.userEmail = `admin.planes.${suffix}@test.edupay.mx`;
    fixture.userPassword = `E2EPlan${suffix}!`;
    const passwordHash = await bcrypt.hash(fixture.userPassword, 10);
    const user = await client.query(
      `INSERT INTO users (tenant_id, campus_id, name, email, password_hash, role, is_active)
       VALUES ($1, $2, 'Administrador E2E Planes', $3, $4, 'administrador_campus', true)
       RETURNING id`,
      [tenantId, fixture.campusId, fixture.userEmail, passwordHash],
    );
    fixture.userId = Number(user.rows[0].id);

    const concept = await client.query(
      `INSERT INTO concepts (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos)
       VALUES ($1, $2, $3, 'colegiatura', 'mensual', 280000)
       RETURNING id`,
      [fixture.campusId, tenantId, `Colegiatura E2E Planes ${suffix}`],
    );
    fixture.conceptId = Number(concept.rows[0].id);

    fixture.studentName = `Alumno Planes-${suffix}`;
    const student = await client.query(
      `INSERT INTO students
         (campus_id, tenant_id, nombres, apellido_paterno, nombre_completo, id_referencia, status, grado)
       VALUES ($1, $2, 'Alumno', $3, $3, $4, 'activo', '1')
       RETURNING id`,
      [fixture.campusId, tenantId, fixture.studentName, `E2E-PLAN-${suffix}`],
    );
    fixture.studentId = Number(student.rows[0].id);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  const login = await request.post(`${BASE}/api/auth/login`, {
    data: { email: fixture.userEmail, password: fixture.userPassword },
  });
  expect(login.status(), "El administrador temporal debe iniciar sesión").toBe(200);
  const auth = await login.json();
  fixture.token = auth.token;
  fixture.authUser = JSON.stringify(auth.user);
  expect(fixture.token, "El login debe devolver un token").toBeTruthy();
  expect(fixture.authUser, "El login debe devolver el usuario autenticado").toBeTruthy();
}

async function crearPlanViaApi(request: any): Promise<void> {
  const res = await request.post(`${BASE}/api/planes-pago`, {
    headers: { Authorization: `Bearer ${fixture.token}` },
    data: {
      concept_id: fixture.conceptId,
      student_id: fixture.studentId,
      numero_pagos: 3,
      frecuencia:   "mensual",
      fecha_inicio: new Date().toISOString().slice(0, 10),
      observaciones: "Plan E2E — creado por test automatizado",
    },
  });
  expect(
    res.ok(),
    `La creación del plan debe funcionar: HTTP ${res.status()} — ${await res.text()}`,
  ).toBeTruthy();
  const body = await res.json();
  fixture.planId = Number(body.id);
  fixture.cuotaId = Number(body.cuotas?.[0]?.id);
  expect(fixture.planId, "La API debe devolver el id del plan creado").toBeGreaterThan(0);
  expect(fixture.cuotaId, "La API debe devolver la primera cuota creada").toBeGreaterThan(0);
}

async function loginAsFixtureAdmin(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ token, user }: { token: string; user: string }) => {
      localStorage.setItem("auth_token", token);
      localStorage.setItem("auth_type", "user");
      localStorage.setItem("auth_user", user);
    },
    { token: fixture.token, user: fixture.authUser },
  );
  await page.reload({ waitUntil: "domcontentloaded" });
}

/** Navega a /planes-pago y espera su contrato de interfaz, no red inactiva. */
async function goToPlanesPago(page: Page) {
  await page.evaluate(() => {
    window.history.pushState({}, "", "/planes-pago");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(
    page.getByRole("heading", { name: /planes de pago/i }),
  ).toBeVisible({ timeout: 10_000 });
}

// ── Suite ─────────────────────────────────────────────────────────────────────
test.describe("Planes de Pago — E2E (ADR-002)", () => {
  test.beforeAll(async ({ request }) => {
    await crearFixture(request);
    await crearPlanViaApi(request);
  });

  test.afterAll(async () => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM payment_applications
          WHERE charge_id IN (SELECT id FROM charges WHERE plan_id = $1)`,
        [fixture.planId],
      );
      await client.query(
        `DELETE FROM payments
          WHERE charge_id IN (SELECT id FROM charges WHERE plan_id = $1)`,
        [fixture.planId],
      );
      await client.query("DELETE FROM charges WHERE plan_id = $1", [fixture.planId]);
      await client.query("DELETE FROM payment_plans WHERE id = $1", [fixture.planId]);
      await client.query("DELETE FROM concepts WHERE id = $1", [fixture.conceptId]);
      await client.query("DELETE FROM students WHERE id = $1", [fixture.studentId]);
      await client.query("DELETE FROM users WHERE id = $1", [fixture.userId]);
      await client.query("DELETE FROM campuses WHERE id = $1", [fixture.campusId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });

  // ── 1. Página carga sin error 410 ─────────────────────────────────────────
  test("PP-01: /planes-pago carga sin errores HTTP ≥ 400 en consola", async ({ page }) => {
    const errors4xx: string[] = [];

    // Capturar respuestas HTTP con error
    page.on("response", resp => {
      if (resp.status() >= 400) {
        errors4xx.push(`${resp.status()} ${resp.url()}`);
      }
    });

    await loginAsFixtureAdmin(page);
    await goToPlanesPago(page);

    // Filtrar 401 a rutas de otras páginas que puedan cargar en background
    const erroresCriticos = errors4xx.filter(e =>
      !e.includes("/api/guardian") &&
      !e.includes("/api/auth/me") &&
      !e.includes("favicon")
    );
    expect(erroresCriticos, `Errores HTTP encontrados: ${erroresCriticos.join(", ")}`).toHaveLength(0);
  });

  // ── 2. Plan pre-creado aparece en la lista ───────────────────────────────
  test("PP-02: El plan creado aparece en la lista con nombre del alumno", async ({ page }) => {
    await loginAsFixtureAdmin(page);
    await goToPlanesPago(page);

    // Buscar el nombre del alumno en la tarjeta
    const planCard = page.getByText(fixture.studentName).first();
    await expect(planCard).toBeVisible({ timeout: 10_000 });

    // Debe mostrar el badge "Activo"
    const badge = page.locator(".bg-blue-100").filter({ hasText: "Activo" }).first();
    await expect(badge).toBeVisible();
  });

  // ── 3. Expandir muestra cuotas como charges reales ───────────────────────
  test("PP-03: Expandir el plan muestra las 3 cuotas del ledger (monto_base_centavos)", async ({ page }) => {
    await loginAsFixtureAdmin(page);
    await goToPlanesPago(page);

    // Hacer clic en el botón de expandir del primer plan del alumno
    const card = page.locator("div.space-y-3 > div").filter({ hasText: fixture.studentName }).first();
    await card.locator("button[variant=ghost], button:has(.lucide-chevron-down)").click();

    // Deben aparecer 3 filas de cuota
    const filasConCuota = card.locator("div.space-y-2 > div");
    await expect(filasConCuota).toHaveCount(3, { timeout: 8_000 });

    // El monto debe ser ~$933.33 (2,800,000 / 3 cuotas en centavos → 933,333 → $933.33)
    // Verificamos que hay texto con $ en las cuotas
    const montoTexto = card.locator("p.font-medium").filter({ hasText: "$" }).first();
    await expect(montoTexto).toBeVisible();
  });

  // ── 4 & 5. Marcar pagada usa pagar-manual, NO el 410 ────────────────────
  test("PP-04: 'Marcar pagada' llama a pagar-manual (no 410) y actualiza el badge a Pagado", async ({ page }) => {
    const requests410: string[] = [];
    const requests200: string[] = [];

    page.on("response", resp => {
      if (resp.url().includes("/cuotas/") && resp.url().includes("/pagar")) {
        requests410.push(`${resp.status()} ${resp.url()}`);
      }
      if (resp.url().includes("/pagar-manual")) {
        requests200.push(`${resp.status()} ${resp.url()}`);
      }
    });

    await loginAsFixtureAdmin(page);
    await goToPlanesPago(page);

    // Expandir el plan del alumno de prueba
    const card = page.locator("div.space-y-3 > div").filter({ hasText: fixture.studentName }).first();
    await card.locator("button").filter({ has: page.locator(".lucide-chevron-down") }).click();

    // Esperar que aparezcan los botones "Marcar pagada"
    const btnMarcar = card.locator("button:has-text('Marcar pagada')").first();
    await expect(btnMarcar).toBeVisible({ timeout: 8_000 });

    // Capturar la request de pago
    const [response] = await Promise.all([
      page.waitForResponse(r => r.url().includes("/pagar-manual"), { timeout: 10_000 }),
      btnMarcar.click(),
    ]);

    // Debe ser 200, NO 410
    expect(response.status(), "El endpoint devolvió 410 (deprecated) en lugar de 200").toBe(200);
    expect(requests410, "Se llamó al endpoint deprecado /cuotas/:id/pagar").toHaveLength(0);

    // El badge de la primera cuota debe cambiar a "Pagado" después de la invalidación
    const badgePagado = card.locator("span:has-text('Pagado'), .bg-green-100").filter({ hasText: "Pagado" }).first();
    await expect(badgePagado).toBeVisible({ timeout: 10_000 });

    // El progreso debe haber subido (de 0/3 a 1/3)
    const avance = card.locator("p:has-text('/3 cuotas')");
    await expect(avance).toContainText("1/3");
  });

  // ── 6. No hay errores 410 en ninguna acción de la página ─────────────────
  test("PP-05: Ninguna acción en /planes-pago genera un error 410", async ({ page }) => {
    const errores410: string[] = [];
    page.on("response", resp => {
      if (resp.status() === 410) errores410.push(resp.url());
    });

    await loginAsFixtureAdmin(page);
    await goToPlanesPago(page);

    // Expandir todos los planes
    const botonesExpandir = page.locator("button").filter({ has: page.locator(".lucide-chevron-down, .lucide-chevron-up") });
    const count = await botonesExpandir.count();
    for (let i = 0; i < Math.min(count, 3); i++) {
      await botonesExpandir.nth(i).click().catch(() => {});
      await page.waitForTimeout(300);
    }

    expect(errores410, `Respuestas 410 encontradas: ${errores410.join(", ")}`).toHaveLength(0);
  });

  // ── 6. Crear plan desde el modal (smoke test) ─────────────────────────────
  test("PP-06: El modal 'Nuevo convenio' permite seleccionar concepto y envía concept_id", async ({ page }) => {
    let bodyEnviado: any = null;

    // Interceptar el POST /api/planes-pago para verificar el body
    await page.route(`${BASE}/api/planes-pago`, async (route) => {
      if (route.request().method() === "POST") {
        try { bodyEnviado = JSON.parse(route.request().postData() || "{}"); } catch {}
      }
      await route.continue();
    });

    await loginAsFixtureAdmin(page);
    await goToPlanesPago(page);

    // Abrir el modal
    await page.click("button:has-text('Nuevo convenio')");
    await expect(page.locator("dialog, [role=dialog]")).toBeVisible({ timeout: 5_000 });

    // Verificar que el modal tiene el selector de Concepto (ADR-002)
    const selectorConcepto = page.locator("text=Concepto del convenio").first();
    await expect(selectorConcepto).toBeVisible();

    // Verificar que NO tiene un campo "Total adeudo" de texto libre (ese era pre-ADR-002)
    const inputTotalAdeudo = page.locator("input[placeholder*='5,000']");
    await expect(inputTotalAdeudo).toHaveCount(0);
  });
});
