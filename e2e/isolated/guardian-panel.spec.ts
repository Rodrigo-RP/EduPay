import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/e2e/isolated/guardian-panel.html");
  await page.evaluate(() => {
    const original = window.fetch;
    (window as any).guardianWrites = [];
    window.fetch = async (input, init) => {
      if (init?.method === "PUT") (window as any).guardianWrites.push({
        url: String(input), method: init.method, body: JSON.parse(String(init.body)),
      });
      return original(input, init);
    };
  });
});

test("cancelar la advertencia no cambia el tutor ni manda PUT", async ({ page }) => {
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("Tutor B ya es responsable del 100 %");
    await dialog.dismiss();
  });
  const toggle = page.getByRole("switch", { name: "Responsable de pago: Tutor A" });
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  expect(await page.evaluate(() => (window as any).guardianWrites)).toEqual([]);
});

test("confirmar activa el tutor con el PUT esperado y refresca", async ({ page }) => {
  page.once("dialog", (dialog) => dialog.accept());
  const toggle = page.getByRole("switch", { name: "Responsable de pago: Tutor A" });
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(page.getByText("El cambio se guardó correctamente.").first()).toBeVisible();
  await expect(page.getByRole("switch", { name: "Responsable de pago: Tutor B" })).toBeChecked();
  expect(await page.evaluate(() => (window as any).guardianWrites)).toEqual([{
    url: "/api/admin/students/1/tutores/2", method: "PUT", body: { es_responsable_pago: true },
  }]);
});

test("error de guardado conserva el estado y muestra error, sin éxito falso", async ({ page }) => {
  // Reemplaza sólo la respuesta del harness; nunca llama una API real.
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => init?.method === "PUT"
      ? Response.json({ message: "No se pudo guardar" }, { status: 500 })
      : original(input, init);
  });
  page.once("dialog", (dialog) => dialog.accept());
  const toggle = page.getByRole("switch", { name: "Responsable de pago: Tutor A" });
  await toggle.click();
  await expect(page.getByText("No se pudo actualizar").first()).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await expect(page.getByText("Responsable actualizado")).toHaveCount(0);
});
