/**
 * Regresión visual del widget:
 * - las tablas GFM de Claude se convierten en HTML;
 * - el panel permite respuestas largas;
 * - minimizar y restaurar conserva el historial.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./helpers/auth";

test("renderiza tablas Markdown y conserva la conversación al minimizar", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#email").fill(ADMIN_EMAIL);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Ingresar al Sistema" }).click();

  const assistantButton = page.getByRole("button", { name: "Abrir asistente EduPay" });
  await expect(assistantButton).toBeVisible();
  await assistantButton.click();

  const dialog = page.getByRole("dialog", { name: "Asistente EduPay" });
  await expect(dialog).toBeVisible();

  await page.route("**/api/assistant/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        reply: [
          "Encontré estos adeudos:",
          "",
          "| Alumno | Nivel | Saldo pendiente |",
          "| --- | --- | ---: |",
          "| Alma Prueba | Primaria | $1,250 |",
          "| Bruno Prueba | Secundaria | $980 |",
          "",
          "**Total:** $2,230",
        ].join("\n"),
      }),
    });
  });

  await dialog.getByPlaceholder("¿Dónde está...? / No funciona...").fill("muéstrame los adeudos");
  await dialog.getByRole("button", { name: "Enviar mensaje" }).click();

  const table = dialog.locator("table");
  await expect(table).toBeVisible();
  await expect(table.locator("thead th")).toHaveCount(3);
  await expect(table.locator("tbody tr")).toHaveCount(2);
  await expect(table).toContainText("Alma Prueba");
  await expect(dialog).toContainText("$2,230");
  await expect(dialog.locator("text=| Alumno | Nivel | Saldo pendiente |")).toHaveCount(0);

  const panelWidth = await dialog.evaluate((element) => element.getBoundingClientRect().width);
  expect(panelWidth).toBeGreaterThanOrEqual(600);

  await dialog.getByRole("button", { name: "Minimizar chat" }).click();
  await expect(dialog).toBeHidden();

  const minimized = page.getByRole("button", { name: "Reabrir asistente" });
  await expect(minimized).toBeVisible();
  await minimized.click();

  const restoredDialog = page.getByRole("dialog", { name: "Asistente EduPay" });
  await expect(restoredDialog).toBeVisible();
  await expect(restoredDialog.locator("table")).toContainText("Alma Prueba");
  await expect(restoredDialog).toContainText("muéstrame los adeudos");
});