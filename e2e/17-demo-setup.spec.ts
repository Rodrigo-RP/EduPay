import { expect, test } from "@playwright/test";

test("el setup demo muestra conteos y accesos destacados después de poblar", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("/demo-setup");
  await page.getByRole("button", { name: "Cargar datos demo" }).click();

  await expect(page.getByText("Casos destacados para probar")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Registros generados por tabla")).toBeVisible();
  await expect(page.getByText("Pago de hermanos")).toBeVisible();
  await expect(page.getByText("Beca aplicada")).toBeVisible();
  await expect(page.locator("code").filter({ hasText: "payment_applications" })).toBeVisible();
  await expect(page.getByText("Completado", { exact: true })).toBeVisible();
});