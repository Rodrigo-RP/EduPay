import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { completeStaffLogin } from "./helpers/auth";
import bcrypt from "bcrypt";
import { pool } from "../server/db";
import { assertTestDatabase } from "../server/lib/database-safety";

let tenantId: number;
let campusId: number;
let userId: number;
const email = `initial-${randomBytes(8).toString("hex")}@example.invalid`;
const temporary = randomBytes(24).toString("base64url");
const replacement = randomBytes(24).toString("base64url");

test.beforeAll(async () => {
  await assertTestDatabase(pool);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    tenantId = (await client.query("INSERT INTO tenants (nombre_legal,rfc) VALUES ($1,$2) RETURNING id", ["Fixture inicial", "XAXX010101000"])).rows[0].id;
    campusId = (await client.query("INSERT INTO campuses (tenant_id,nombre) VALUES ($1,$2) RETURNING id", [tenantId, "Fixture inicial"])).rows[0].id;
    userId = (await client.query(`INSERT INTO users (tenant_id,campus_id,email,name,password_hash,role)
      VALUES ($1,$2,$3,$4,$5,'administrador_general') RETURNING id`,
    [tenantId, campusId, email, "Fixture inicial", await bcrypt.hash(temporary, 10)])).rows[0].id;
    await client.query(`UPDATE campuses SET onboarding_steps_completados=jsonb_build_object('_bootstrap',
      jsonb_build_object('completed',true,'user_id',$1::int)) WHERE id=$2`, [userId,campusId]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
});

test.afterAll(async () => {
  await assertTestDatabase(pool);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM audit_retry_queue WHERE (payload->>'user_id')=$1 AND (payload->>'tenant_id')=$2", [String(userId),String(tenantId)]);
    await client.query("DELETE FROM users WHERE id=$1 AND tenant_id=$2", [userId,tenantId]);
    await client.query("DELETE FROM campuses WHERE id=$1 AND tenant_id=$2", [campusId,tenantId]);
    await client.query("DELETE FROM tenants WHERE id=$1", [tenantId]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
});

test("el primer administrador debe cambiar la temporal antes de usar el sistema", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/correo institucional/i).fill(email);
  await page.locator('input[type="password"]').fill(temporary);
  await page.getByRole("button", { name: /ingresar al sistema/i }).click();
  await expect(page.getByRole("heading", { name: "Cambia tu contraseña temporal" })).toBeVisible();
  await expect(page.getByRole("link", { name: /estudiantes/i })).toHaveCount(0);
  const oldToken = await page.evaluate(() => localStorage.getItem("auth_token"));
  const denied = await page.request.get("/api/profile", { headers: { Authorization: `Bearer ${oldToken}` } });
  expect(denied.status()).toBe(403);
  expect((await denied.json()).code).toBe("PASSWORD_CHANGE_REQUIRED");
  await page.getByLabel("Contraseña temporal", { exact: true }).fill(temporary);
  await page.getByLabel("Nueva contraseña", { exact: true }).fill(replacement);
  await page.getByLabel("Confirma la nueva contraseña", { exact: true }).fill(replacement);
  await page.getByRole("button", { name: "Cambiar contraseña", exact: true }).click();
  await expect(page.getByRole("button", { name: /ingresar al sistema/i })).toBeVisible();
  const invalid = await page.request.get("/api/profile", { headers: { Authorization: `Bearer ${oldToken}` } });
  expect(invalid.status()).toBe(401);
  await page.getByLabel(/correo institucional/i).fill(email);
  await page.locator('input[type="password"]').fill(replacement);
  await page.getByRole("button", { name: /ingresar al sistema/i }).click();
  await expect(page.getByRole("heading", { name: "Cambia tu contraseña temporal" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Configura la autenticación de dos factores" })).toBeVisible();
  await completeStaffLogin(page, email);
  await expect.poll(async () => {
    const token = await page.evaluate(() => localStorage.getItem("auth_token"));
    return (await page.request.get("/api/profile", { headers: { Authorization: `Bearer ${token}` } })).status();
  }).toBe(200);
});
