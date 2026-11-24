/**
 * e2e/41-sso-sesion-inactividad.spec.ts
 * Módulo: SSO desde el Dashboard — sesión con inactividad de 1 h, renovación con uso y regreso al Dashboard.
 * Capa: Playwright (E2E)
 *
 * Necesita un servidor arrancado con el SSO activo y la llave pública de un par de PRUEBA, y la llave privada
 * en SSO_E2E_PRIVATE_KEY (PEM). Sin esa variable la suite se omite, así que no afecta al CI normal.
 * Solo corre contra la base desechable local (edupay_ci, marcada edupay:test): nunca contra producción.
 *
 * El reloj del navegador se adelanta con `page.clock`; el del servidor no. Por eso las pruebas de tiempo largo
 * (más de 1 h de uso continuo) y el tope de 4 h se cubren en las pruebas aisladas del servidor, no aquí.
 */
import { test, expect, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import pg from "pg";

const PRIVATE_KEY = (process.env.SSO_E2E_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
const DASHBOARD_URL = "http://localhost:5000/__dashboard_e2e";
const ESCUELA = "ESC_E2E";
const SUBJECT = "uidE2eTutor";

test.skip(!PRIVATE_KEY, "SSO_E2E_PRIVATE_KEY no está definida: se omite la suite del SSO.");

function assertSafeDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? "postgresql://x@invalida/x");
  if (process.env.APP_ENV !== "test" || url.hostname !== "127.0.0.1" || url.pathname !== "/edupay_ci") {
    throw new Error("Esta suite solo corre contra la base desechable local edupay_ci (APP_ENV=test).");
  }
}

const mintAssertion = () =>
  jwt.sign(
    { sub: SUBJECT, jti: randomBytes(16).toString("hex"), idEscuela: ESCUELA, email: "tutor.e2e@example.com", rol: "Padre de familia", purpose: "sso_login" },
    PRIVATE_KEY,
    { algorithm: "ES256", issuer: "dashboard-refereence", audience: "edupay", expiresIn: 60 },
  );

let pool: pg.Pool;
let tenantId: number;
let previousEscuela: string | null;
let guardianId: number;

test.beforeAll(async () => {
  assertSafeDatabase();
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const found = await pool.query(
    `SELECT g.id, g.tenant_id
       FROM guardians g
       JOIN student_guardian sg ON sg.guardian_id = g.id
       JOIN family_students fs ON fs.student_id = sg.student_id
       JOIN families f ON f.id = fs.family_id AND f.tenant_id = g.tenant_id
      WHERE f.status = 'activo'
      ORDER BY g.id LIMIT 1`,
  );
  if (!found.rows[0]) throw new Error("La base de demostración no tiene un tutor con familia activa para la prueba.");
  guardianId = Number(found.rows[0].id);
  tenantId = Number(found.rows[0].tenant_id);
  const t = await pool.query(`SELECT firebase_id_escuela FROM tenants WHERE id = $1`, [tenantId]);
  previousEscuela = t.rows[0]?.firebase_id_escuela ?? null;
  await pool.query(`UPDATE tenants SET firebase_id_escuela = $1 WHERE id = $2`, [ESCUELA, tenantId]);
  await pool.query(`DELETE FROM external_identities WHERE provider = 'firebase' AND subject = $1`, [SUBJECT]);
  await pool.query(
    `INSERT INTO external_identities (provider, subject, tenant_id, guardian_id) VALUES ('firebase', $1, $2, $3)`,
    [SUBJECT, tenantId, guardianId],
  );
});

test.afterAll(async () => {
  if (!pool) return;
  await pool.query(`DELETE FROM external_identities WHERE provider = 'firebase' AND subject = $1`, [SUBJECT]).catch(() => undefined);
  await pool.query(`UPDATE tenants SET firebase_id_escuela = $1 WHERE id = $2`, [previousEscuela, tenantId]).catch(() => undefined);
  await pool.end();
});

async function stubDashboard(page: Page) {
  await page.route("**/__dashboard_e2e**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Dashboard (simulado)</h1>" }));
}

async function enterBySso(page: Page) {
  await stubDashboard(page);
  await page.goto(`/sso#a=${mintAssertion()}`);
  await page.waitForURL(/portal-3clics/, { timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => localStorage.getItem("auth_token"))).not.toBeNull();
}

const storedToken = (page: Page) => page.evaluate(() => localStorage.getItem("auth_token"));

test.describe("SSO: sesión por inactividad y regreso al Dashboard", () => {
  test("entrar por SSO guarda un token de 1 h marcado como SSO y registra la actividad", async ({ page }) => {
    await enterBySso(page);
    const token = (await storedToken(page))!;
    const claims = jwt.decode(token) as any;
    expect(claims).toMatchObject({ sso: true, type: "guardian", id: guardianId });
    expect(claims.exp - claims.session_started_at).toBeLessThanOrEqual(3600);
    expect(claims.exp - claims.session_started_at).toBeGreaterThan(3500);
    const lastActivity = Number(await page.evaluate(() => localStorage.getItem("sso_last_activity")));
    expect(Date.now() - lastActivity).toBeLessThan(60_000);
  });

  test("con uso, la sesión se renueva (token nuevo, mismo inicio de sesión)", async ({ page }) => {
    await page.clock.install();
    await enterBySso(page);
    const before = (await storedToken(page))!;
    const startedAt = (jwt.decode(before) as any).session_started_at;

    // Pasan 15 min (el token ya tiene menos de 50 min de vida) y la persona vuelve a usar la pantalla.
    await page.clock.fastForward(15 * 60 * 1000);
    const renewal = page.waitForResponse((r) => r.url().includes("/api/auth/sso/renew"), { timeout: 15_000 });
    await page.mouse.move(120, 140);
    await page.mouse.move(260, 300);
    const res = await renewal;
    expect(res.status()).toBe(200);

    await expect.poll(() => storedToken(page)).not.toBe(before);
    const after = jwt.decode((await storedToken(page))!) as any;
    expect(after).toMatchObject({ sso: true, id: guardianId, session_started_at: startedAt });
    expect(page.url()).toContain("portal-3clics");
  });

  test("sin uso durante más de 1 h cierra la sesión y regresa al Dashboard", async ({ page }) => {
    await page.clock.install();
    await enterBySso(page);
    await page.clock.fastForward(61 * 60 * 1000);
    await page.waitForURL(DASHBOARD_URL, { timeout: 20_000 });
    expect(await storedToken(page)).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem("sso_last_activity"))).toBeNull();
  });

  test("un token de SSO vencido regresa al Dashboard al abrir EduPay", async ({ page }) => {
    await stubDashboard(page);
    const expired = jwt.sign(
      { id: guardianId, type: "guardian", sso: true, tenant_id: tenantId, session_started_at: Math.floor(Date.now() / 1000) - 7200 },
      process.env.JWT_SECRET!, { expiresIn: -60 },
    );
    await page.goto("/");
    await page.evaluate((t) => {
      localStorage.setItem("auth_token", t);
      localStorage.setItem("auth_type", "guardian");
      localStorage.setItem("auth_user", JSON.stringify({ id: 1, email: "x@example.com" }));
    }, expired);
    await page.goto("/portal-3clics");
    await page.waitForURL(DASHBOARD_URL, { timeout: 20_000 });
    expect(await storedToken(page)).toBeNull();
  });

  test("una sesión que NO es de SSO vencida no te manda al Dashboard", async ({ page }) => {
    await stubDashboard(page);
    const expired = jwt.sign(
      { id: 999999, type: "user", role: "asistente", session_started_at: Math.floor(Date.now() / 1000) - 7200 },
      process.env.JWT_SECRET!, { expiresIn: -60 },
    );
    await page.goto("/");
    await page.evaluate((t) => {
      localStorage.setItem("auth_token", t);
      localStorage.setItem("auth_type", "user");
      localStorage.setItem("auth_user", JSON.stringify({ id: 999999, email: "x@example.com" }));
    }, expired);
    await page.goto("/");
    await expect(page.locator("#email")).toBeVisible({ timeout: 15_000 });
    expect(page.url()).not.toContain("__dashboard_e2e");
  });

  test("una aserción reutilizada no abre sesión (un solo uso)", async ({ page, request }) => {
    const assertion = mintAssertion();
    const first = await request.post("/api/auth/sso/exchange", { data: { assertion } });
    expect(first.status()).toBe(200);
    const again = await request.post("/api/auth/sso/exchange", { data: { assertion } });
    expect(again.status()).toBe(401);
    expect((await again.json()).code).toBe("SSO_REPLAYED");
    void page;
  });
});
