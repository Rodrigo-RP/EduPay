/**
 * Regresión de sesión nueva: login real de navegador + widget del asistente.
 * Verifica que el JWT emitido por login autentica tanto HTTP como WebSocket.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./helpers/auth";

test.describe("Asistente desde una sesión nueva", () => {
  test("responde desde el widget sin rechazar el JWT recién emitido", async ({ page }) => {
    const assistantStatuses: number[] = [];
    const consoleMessages: string[] = [];

    page.on("response", (response) => {
      if (response.url().includes("/api/assistant/chat")) {
        assistantStatuses.push(response.status());
      }
    });
    page.on("console", (message) => consoleMessages.push(message.text()));

    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("#email").fill(ADMIN_EMAIL);
    await page.locator("#password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Ingresar al Sistema" }).click();

    const assistantButton = page.getByRole("button", { name: "Abrir asistente EduPay" });
    await expect(assistantButton).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem("auth_token")))).toBe(true);

    await assistantButton.click();
    const dialog = page.getByRole("dialog", { name: "Asistente EduPay" });
    await dialog.getByPlaceholder("¿Dónde está...? / No funciona...").fill("dime quiénes son los deudores");
    await dialog.getByRole("button", { name: "Enviar mensaje" }).click();

    await expect.poll(() => assistantStatuses.at(-1), { timeout: 60_000 }).toBe(200);
    await expect(dialog).not.toContainText("Ocurrió un error al conectar con el asistente. Intenta de nuevo.");
    await expect(dialog).toContainText("Alumnos con adeudo");
    await expect.poll(
      () => consoleMessages.some((message) => message.includes("auth_success")),
      { timeout: 15_000 },
    ).toBe(true);
    expect(consoleMessages.some((message) => message.includes("auth_error"))).toBe(false);
  });
});