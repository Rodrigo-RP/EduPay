import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { WebSocket } from "ws";
import bcrypt from "bcrypt";
import { pool } from "../server/db";
import { assertTestDatabase } from "../server/lib/database-safety";
import { enrollmentCodeForTest } from "../server/test-support/staff-totp";
import { staffApiLogin } from "./helpers/auth";

const suffix = randomBytes(6).toString("hex");
const password = randomBytes(24).toString("base64");
const replacement = randomBytes(24).toString("base64");
const staffEmail = `staff-${suffix}@example.invalid`, adminEmail = `admin-${suffix}@example.invalid`;
let tenant = 0, campus = 0, staff = 0, admin = 0;
test.beforeAll(async () => {
  await assertTestDatabase(pool);
  tenant = (await pool.query("INSERT INTO tenants (nombre_legal,rfc) VALUES ($1,$2) RETURNING id", [`Prueba 2FA ${suffix}`, "XAXX010101000"])).rows[0].id;
  campus = (await pool.query("INSERT INTO campuses (tenant_id,nombre,onboarding_completado) VALUES ($1,$2,true) RETURNING id", [tenant, `Campus 2FA ${suffix}`])).rows[0].id;
  const hash = await bcrypt.hash(password, 10);
  for (const [email, role] of [[staffEmail, "asistente"], [adminEmail, "administrador_general"]]) {
    const id = (await pool.query(`INSERT INTO users (tenant_id,campus_id,email,name,role,password_hash,is_active)
      VALUES ($1,$2,$3,$3,$4,$5,true) RETURNING id`, [tenant, campus, email, role, hash])).rows[0].id;
    if (email === staffEmail) staff = id; else admin = id;
  }
});
test.afterAll(async () => {
  await assertTestDatabase(pool);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM audit_retry_queue WHERE (payload->>'user_id')::int=ANY($1::int[])", [[staff, admin]]);
    await client.query("DELETE FROM audit_log WHERE user_id=ANY($1::int[])", [[staff, admin]]);
    await client.query("DELETE FROM users WHERE id=ANY($1::int[])", [[staff, admin]]);
    if (campus) await client.query("DELETE FROM campuses WHERE id=$1", [campus]);
    if (tenant) await client.query("DELETE FROM tenants WHERE id=$1", [tenant]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
});

async function openSocket(token: string) {
  const socket = new WebSocket("ws://127.0.0.1:5000/ws/realtime");
  await once(socket, "open");
  const authenticated = new Promise<void>((resolve, reject) => {
    socket.on("message", raw => {
      const data = JSON.parse(String(raw));
      if (data.type === "auth_success") resolve();
      if (data.type === "auth_error") reject(new Error("WS rechazó sesión de prueba"));
    });
  });
  socket.send(JSON.stringify({ type: "auth", token }));
  await authenticated;
  return socket;
}

test("personal: registro obligatorio, respaldo de un uso y cierre WS por contraseña y reset", async ({ page, request }) => {
  await page.goto("/");
  await page.locator("#email").fill(staffEmail);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole("heading", { name: "Configura la autenticación de dos factores" })).toBeVisible();
  await expect(page.locator("aside")).toHaveCount(0);
  const limited = await page.evaluate(() => localStorage.getItem("auth_token"));
  const blocked = await request.get("/api/students", { headers: { Authorization: `Bearer ${limited}` } });
  expect(blocked.status()).toBe(403);
  expect((await blocked.json()).code).toBe("TWOFA_SETUP_REQUIRED");
  await page.getByRole("button", { name: "Comenzar registro" }).click();
  const secret = await page.getByTestId("totp-manual-code").innerText();
  await page.getByLabel("Código de 6 dígitos de tu autenticador").fill(enrollmentCodeForTest(secret));
  const confirmResponse = page.waitForResponse(response => response.url().endsWith("/api/auth/2fa/confirm"));
  await page.getByRole("button", { name: "Confirmar dos factores", exact: true }).click();
  const confirmedResponse = await confirmResponse;
  const confirmed = await confirmedResponse.json();
  expect(confirmedResponse.headers()["cache-control"]).toBe("no-store");
  expect(confirmed.backup_codes).toHaveLength(10);
  expect(JSON.stringify(confirmed)).not.toContain(secret);
  const saved = (await pool.query("SELECT twofa_secret,twofa_backup_hashes FROM users WHERE id=$1", [staff])).rows[0];
  expect(saved.twofa_secret).toMatch(/^v1:/);
  expect(saved.twofa_secret).not.toContain(secret);
  expect(saved.twofa_backup_hashes).toHaveLength(10);
  for (const code of confirmed.backup_codes) expect(JSON.stringify(saved)).not.toContain(code);
  await page.getByLabel("Ya guardé mis códigos").check();
  await page.getByRole("button", { name: "Continuar a EduPay" }).click();
  await expect(page.locator("aside").first()).toBeVisible();
  const headers = { Authorization: `Bearer ${confirmed.token}` };
  const alreadySetup = await request.post("/api/auth/2fa/setup", { headers });
  expect(alreadySetup.status()).toBe(409);
  expect(JSON.stringify(await alreadySetup.json())).not.toContain(secret);
  const profile = await request.get("/api/profile", { headers });
  expect(JSON.stringify(await profile.json())).not.toContain(secret);
  const backupLogin = await request.post("/api/auth/login", { data: { email: staffEmail, password, totp_code: confirmed.backup_codes[0] } });
  expect(backupLogin.status()).toBe(200);
  expect((await request.post("/api/auth/login", { data: { email: staffEmail, password, totp_code: confirmed.backup_codes[0] } })).status()).toBe(401);
  const fullToken = (await backupLogin.json()).token;
  const socket = await openSocket(fullToken);
  try {
    const closed = once(socket, "close");
    const change = await request.put("/api/profile/password", { headers: { Authorization: `Bearer ${fullToken}` },
      data: { currentPassword: password, newPassword: replacement } });
    expect(change.status()).toBe(200);
    expect((await closed)[0]).toBe(4001);
  } finally { socket.terminate(); }
  const newLogin = await staffApiLogin(request, staffEmail, replacement);
  expect(newLogin.status()).toBe(200);
  const freshToken = (await newLogin.json()).token;
  expect((await request.post(`/api/admin/users/${admin}/2fa/reset-preview`, { headers: { Authorization: `Bearer ${freshToken}` },
    data: { reason: "Dispositivo perdido", confirmation: true } })).status()).toBe(403);
  const adminSession = await (await staffApiLogin(request, adminEmail, password)).json();
  const adminHeaders = { Authorization: `Bearer ${adminSession.token}` };
  expect((await request.post(`/api/admin/users/${staff}/2fa/reset-preview`, { headers: adminHeaders,
    data: { reason: "", confirmation: true } })).status()).toBe(400);
  const preview = await request.post(`/api/admin/users/${staff}/2fa/reset-preview`, { headers: adminHeaders,
    data: { reason: "Dispositivo perdido", confirmation: true } });
  expect(preview.status()).toBe(200);
  const resetBody = { confirmation_token: (await preview.json()).confirmation_token, confirmation: true };
  const freshSocket = await openSocket(freshToken);
  try {
    const closed = once(freshSocket, "close");
    expect((await request.post(`/api/admin/users/${staff}/2fa/reset`, { headers: adminHeaders, data: resetBody })).status()).toBe(200);
    expect((await closed)[0]).toBe(4001);
  } finally { freshSocket.terminate(); }
  expect((await request.post(`/api/admin/users/${staff}/2fa/reset`, { headers: adminHeaders, data: resetBody })).status()).toBe(409);
  const row = (await pool.query("SELECT twofa_secret,twofa_backup_hashes FROM users WHERE id=$1", [staff])).rows[0];
  expect(row.twofa_secret).toBeNull(); expect(row.twofa_backup_hashes).toBeNull();
  expect((await request.get("/api/profile", { headers: { Authorization: `Bearer ${freshToken}` } })).status()).toBe(401);
  const nextLogin = await request.post("/api/auth/login", { data: { email: staffEmail, password: replacement } });
  expect((await nextLogin.json()).user.requires_twofa_setup).toBe(true);
});
