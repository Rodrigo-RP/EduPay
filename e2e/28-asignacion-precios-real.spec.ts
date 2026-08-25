/**
 * Asignación de precios.
 *
 * Usa catálogo y alumnos temporales reales. Comprueba que la previsualización
 * no persiste y que los precios por nivel viajan UI → API → Neon.
 */
import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin, ADMIN_EMAIL } from "./helpers/auth";
import { pool as db } from "../server/db";

const suffix = `${Date.now()}`;
const dueDate = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const productCode = `E2E-PRECIO-${suffix}`;
const productName = `Producto E2E Precios ${suffix}`;
const primaryPrice = 111_111;
const secondaryPrice = 222_222;

let authToken = "";
let authUser = "";
let tenantId = 0;
let campusId = 0;
let productId = 0;
let primaryStudentId = 0;
let secondaryStudentId = 0;

const primaryStudentName = `Alumna E2E Precio Primaria ${suffix}`;
const secondaryStudentName = `Alumno E2E Precio Secundaria ${suffix}`;

async function restoreSession(page: Page) {
  await page.goto("/");
  await page.evaluate(({ token, user }) => {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_type", "user");
    localStorage.setItem("auth_user", user);
  }, { token: authToken, user: authUser });
  await page.reload();
  await page.waitForLoadState("networkidle");
}

test.describe.configure({ mode: "serial" });

test.describe("Asignación de precios — catálogo persistente", () => {
  test.beforeAll(async ({ browser }) => {
    const scope = await db.query(
      "SELECT tenant_id, campus_id FROM users WHERE email = $1 LIMIT 1",
      [ADMIN_EMAIL],
    );
    expect(scope.rows).toHaveLength(1);
    tenantId = Number(scope.rows[0].tenant_id);
    campusId = Number(scope.rows[0].campus_id);

    const product = await db.query(
      `INSERT INTO products
         (tenant_id, campus_id, codigo, nombre, categoria, unidad_medida, activo,
          precio_kinder, precio_primaria, precio_secundaria, precio_bachillerato)
       VALUES ($1,$2,$3,$4,'OTROS','SERVICIO',true,0,$5,$6,0)
       RETURNING id`,
      [tenantId, campusId, productCode, productName, primaryPrice, secondaryPrice],
    );
    productId = Number(product.rows[0].id);

    const students = await db.query(
      `INSERT INTO students
         (tenant_id, campus_id, nombres, apellido_paterno, nombre_completo, id_referencia, grado, grupo, status)
       VALUES
         ($1,$2,'Alumna','Primaria',$3,$4,'3° PRIMARIA','E2E','activo'),
         ($1,$2,'Alumno','Secundaria',$5,$6,'1° SECUNDARIA','E2E','activo')
       RETURNING id, nombre_completo`,
      [
        tenantId, campusId,
        primaryStudentName, `E2E-PRECIO-P-${suffix}`,
        secondaryStudentName, `E2E-PRECIO-S-${suffix}`,
      ],
    );
    primaryStudentId = Number(students.rows.find((row) => row.nombre_completo === primaryStudentName)?.id);
    secondaryStudentId = Number(students.rows.find((row) => row.nombre_completo === secondaryStudentName)?.id);

    const page = await browser.newPage();
    await loginAsAdmin(page);
    ({ authToken, authUser } = await page.evaluate(() => ({
      authToken: localStorage.getItem("auth_token") || "",
      authUser: localStorage.getItem("auth_user") || "",
    })));
    await page.close();
    expect(authToken).not.toBe("");
  });

  test.beforeEach(async ({ page }) => {
    await restoreSession(page);
    await page.evaluate(() => {
      window.history.pushState({}, "", "/asignacion-precios");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page.getByRole("heading", { name: /asignación automática de precios/i })).toBeVisible();
  });

  test.afterAll(async () => {
    const concept = await db.query(
      "SELECT id FROM concepts WHERE campus_id = $1 AND nombre = $2",
      [campusId, productName],
    );
    if (concept.rows[0]?.id) {
      await db.query("DELETE FROM charges WHERE concept_id = $1", [concept.rows[0].id]);
      await db.query("DELETE FROM concepts WHERE id = $1", [concept.rows[0].id]);
    }
    await db.query("DELETE FROM products WHERE id = $1", [productId]);
    await db.query("DELETE FROM students WHERE id = ANY($1)", [[primaryStudentId, secondaryStudentId]]);
  });

  test("AP-01: muestra catálogo/alumnos reales, no persiste preview y confirma precios por nivel", async ({ page }) => {
    await page.getByTestId("catalog-product-select").click();
    await page.getByRole("option", { name: new RegExp(productCode) }).click();
    await page.getByLabel(/fecha de vencimiento/i).fill(dueDate);

    const chargesBeforePreview = await db.query(
      `SELECT COUNT(*)::int AS count
         FROM charges c JOIN concepts con ON con.id = c.concept_id
        WHERE con.nombre = $1`,
      [productName],
    );
    expect(Number(chargesBeforePreview.rows[0].count)).toBe(0);

    await page.getByTestId("preview-price-assignment").click();
    await expect(page.getByText(primaryStudentName, { exact: true })).toBeVisible();
    await expect(page.getByText(secondaryStudentName, { exact: true })).toBeVisible();
    await expect(page.getByText(/1,111\.11/).first()).toBeVisible();
    await expect(page.getByText(/2,222\.22/).first()).toBeVisible();

    const chargesAfterPreview = await db.query(
      `SELECT COUNT(*)::int AS count
         FROM charges c JOIN concepts con ON con.id = c.concept_id
        WHERE con.nombre = $1`,
      [productName],
    );
    expect(Number(chargesAfterPreview.rows[0].count)).toBe(0);

    const applyRequest = page.waitForResponse((response) =>
      response.url().includes("/api/admin/cargos/desde-catalogo") && response.request().method() === "POST",
    );
    await page.getByTestId("apply-price-assignment").click();
    const applyResponse = await applyRequest;
    expect(applyResponse.status()).toBe(201);
    const applyBody = await applyResponse.json() as { charges_created: number; product_name: string };
    expect(applyBody.charges_created).toBeGreaterThanOrEqual(2);
    expect(applyBody.product_name).toBe(productName);
    await expect(page.getByText("Cargos aplicados correctamente", { exact: true })).toBeVisible();

    const persisted = await db.query(
      `SELECT c.student_id, c.monto_base_centavos, c.estado,
              c.fecha_vencimiento::text AS fecha_vencimiento, con.nombre
         FROM charges c
         JOIN concepts con ON con.id = c.concept_id
        WHERE c.student_id = ANY($1) AND con.nombre = $2
        ORDER BY c.student_id`,
      [[primaryStudentId, secondaryStudentId], productName],
    );
    expect(persisted.rows).toHaveLength(2);
    expect(Number(persisted.rows.find((row) => Number(row.student_id) === primaryStudentId)?.monto_base_centavos)).toBe(primaryPrice);
    expect(Number(persisted.rows.find((row) => Number(row.student_id) === secondaryStudentId)?.monto_base_centavos)).toBe(secondaryPrice);
    expect(persisted.rows.every((row) => row.estado === "pendiente")).toBe(true);
    expect(persisted.rows.every((row) => String(row.fecha_vencimiento).slice(0, 10) === dueDate)).toBe(true);

    await page.reload();
    await page.getByTestId("catalog-product-select").click();
    await page.getByRole("option", { name: new RegExp(productCode) }).click();
    await page.getByTestId("preview-price-assignment").click();
    await expect(page.getByText(primaryStudentName, { exact: true })).toBeVisible();
    await expect(page.getByText(secondaryStudentName, { exact: true })).toBeVisible();
  });
});