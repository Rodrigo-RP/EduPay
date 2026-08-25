/**
 * Caja — banca, importación y conciliación.
 *
 * Todas las acciones financieras se inician desde la UI. Neon se consulta
 * directamente sólo como evidencia posterior de persistencia y reglas de score.
 */
import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin, ADMIN_EMAIL } from "./helpers/auth";
import { pool as db } from "../server/db";

const suffix = `${Date.now()}`;
const fechaHoy = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Mexico_City",
}).format(new Date());
const BASE_CLABE = `90${suffix}`.slice(0, 18);
const REVIEW_CLABE = `91${suffix}`.slice(0, 18);

let authToken = "";
let authUser = "";
let tenantId = 0;
let campusId = 0;
let conceptId = 0;
let studentId = 0;
let guardianId = 0;
let familyId = 0;
let onboardingWasComplete = false;
const chargeIds: number[] = [];
const bankTransactionIds: number[] = [];
const studentName = `Alumna E2E Conciliación ${suffix}`;
const guardianName = `Carlos E2E Conciliación ${suffix}`;

async function irACaja(page: Page) {
  await page.evaluate(() => {
    window.history.pushState({}, "", "/caja-conciliacion");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByText(/caja y conciliación/i).first()).toBeVisible();
}

async function restaurarSesion(page: Page) {
  await page.goto("/");
  await page.evaluate(({ token, user }) => {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_type", "user");
    localStorage.setItem("auth_user", user);
  }, { token: authToken, user: authUser });
  await page.reload();
  await page.waitForLoadState("networkidle");
}

async function crearCargo(amountCentavos: number): Promise<number> {
  const charge = await db.query(
    `INSERT INTO charges
       (tenant_id, student_id, concept_id, fecha_emision, fecha_vencimiento, monto_base_centavos, estado)
     VALUES ($1,$2,$3,CURRENT_DATE,CURRENT_DATE,$4,'pendiente') RETURNING id`,
    [tenantId, studentId, conceptId, amountCentavos],
  );
  const id = Number(charge.rows[0].id);
  chargeIds.push(id);
  return id;
}

async function crearMovimiento(params: {
  referencia: string;
  montoCentavos: number;
  clabe?: string;
  nombre?: string;
  descripcion?: string;
}): Promise<number> {
  const tx = await db.query(
    `INSERT INTO bank_transactions
       (campus_id, tenant_id, fecha, descripcion, monto_centavos, tipo, referencia,
        clabe_ordenante, nombre_ordenante, estado_conciliacion)
     VALUES ($1,$2,$3::date,$4,$5,'credito',$6,$7,$8,'pendiente') RETURNING id`,
    [
      campusId,
      tenantId,
      fechaHoy,
      params.descripcion || `Movimiento E2E ${params.referencia}`,
      params.montoCentavos,
      params.referencia,
      params.clabe || null,
      params.nombre || null,
    ],
  );
  const id = Number(tx.rows[0].id);
  bankTransactionIds.push(id);
  return id;
}

test.describe.configure({ mode: "serial" });

test.describe("Caja — transferencias e importación/conciliación bancaria", () => {
  test.beforeAll(async ({ browser }) => {
    const scope = await db.query(
      "SELECT tenant_id, campus_id FROM users WHERE email = $1 LIMIT 1",
      [ADMIN_EMAIL],
    );
    expect(scope.rows).toHaveLength(1);
    tenantId = Number(scope.rows[0].tenant_id);
    campusId = Number(scope.rows[0].campus_id);

    const campus = await db.query(
      "SELECT onboarding_completado FROM campuses WHERE id = $1",
      [campusId],
    );
    onboardingWasComplete = Boolean(campus.rows[0]?.onboarding_completado);
    await db.query("UPDATE campuses SET onboarding_completado = true WHERE id = $1", [campusId]);

    conceptId = Number((await db.query(
      `INSERT INTO concepts (tenant_id, campus_id, nombre, tipo, periodicidad, monto_centavos)
       VALUES ($1,$2,$3,'colegiatura','mensual',100000) RETURNING id`,
      [tenantId, campusId, `Colegiatura E2E Conciliación ${suffix}`],
    )).rows[0].id);

    studentId = Number((await db.query(
      `INSERT INTO students (tenant_id, campus_id, nombres, apellido_paterno, nombre_completo, id_referencia, status)
       VALUES ($1,$2,'Alumna','Conciliación',$3,$4,'activo') RETURNING id`,
      [tenantId, campusId, studentName, `E2E-CONC-${suffix}`],
    )).rows[0].id);

    guardianId = Number((await db.query(
      `INSERT INTO guardians
         (tenant_id, campus_id, nombres, apellido_paterno, nombre_completo, email, correo_institucional_familiar)
       VALUES ($1,$2,'Carlos','Conciliación',$3,$4,$4) RETURNING id`,
      [tenantId, campusId, guardianName, `guardian-e2e-${suffix}@test.invalid`],
    )).rows[0].id);

    familyId = Number((await db.query(
      `INSERT INTO families (tenant_id, campus_id, nombre, guardian_id_principal)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [tenantId, campusId, `Familia E2E Conciliación ${suffix}`, guardianId],
    )).rows[0].id);
    await db.query(
      "INSERT INTO family_students (family_id, student_id) VALUES ($1,$2)",
      [familyId, studentId],
    );
    await db.query(
      "INSERT INTO student_guardian (student_id, guardian_id) VALUES ($1,$2)",
      [studentId, guardianId],
    );
    await db.query(
      `INSERT INTO family_payment_sources
         (tenant_id, family_id, clabe, nombre_inferido, confirmaciones)
       VALUES ($1,$2,$3,$4,2), ($1,$2,$5,$4,2)`,
      [tenantId, familyId, BASE_CLABE, guardianName, REVIEW_CLABE],
    );

    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);
    authToken = await page.evaluate(() => localStorage.getItem("auth_token") ?? "");
    authUser = await page.evaluate(() => localStorage.getItem("auth_user") ?? "");
    expect(authToken).not.toBe("");
    await context.close();
  });

  test.beforeEach(async ({ page }) => {
    await restaurarSesion(page);
    await irACaja(page);
  });

  test.afterAll(async () => {
    await db.query(
      `DELETE FROM bank_transactions
        WHERE campus_id = $1
          AND (id = ANY($2::int[]) OR referencia LIKE $3)`,
      [campusId, bankTransactionIds, `E2E-CAJA-${suffix}%`],
    );
    if (chargeIds.length) {
      await db.query("DELETE FROM payment_applications WHERE charge_id = ANY($1::int[])", [chargeIds]);
      await db.query("DELETE FROM payments WHERE charge_id = ANY($1::int[])", [chargeIds]);
      await db.query("DELETE FROM charges WHERE id = ANY($1::int[])", [chargeIds]);
    }
    await db.query("DELETE FROM family_payment_sources WHERE family_id = $1", [familyId]);
    await db.query("DELETE FROM family_students WHERE family_id = $1", [familyId]);
    await db.query("DELETE FROM student_guardian WHERE student_id = $1", [studentId]);
    await db.query("DELETE FROM families WHERE id = $1", [familyId]);
    await db.query("DELETE FROM guardians WHERE id = $1", [guardianId]);
    await db.query("DELETE FROM students WHERE id = $1", [studentId]);
    await db.query("DELETE FROM concepts WHERE id = $1", [conceptId]);
    await db.query("UPDATE campuses SET onboarding_completado = $1 WHERE id = $2", [
      onboardingWasComplete,
      campusId,
    ]);
  });

  test("CB-01: transferencia manual por UI queda pendiente y sobrevive recarga", async ({ page }) => {
    const referencia = `E2E-CAJA-${suffix}-TRANSFER`;
    const descripcion = `Transferencia E2E ${suffix}`;
    await page.getByRole("tab", { name: /control bancario/i }).click();
    await page.getByLabel(/referencia bancaria/i).fill(referencia);
    await page.getByLabel(/monto transferido/i).fill("321.45");
    await page.getByLabel(/fecha de transferencia/i).fill(fechaHoy);
    await page.getByLabel(/descripción del movimiento/i).fill(descripcion);

    const saved = page.waitForResponse((response) =>
      response.url().includes("/api/caja/transferencia-manual") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: /registrar transferencia manual/i }).click();
    const response = await saved;
    expect(response.status()).toBe(200);
    const body = await response.json() as { transaccion: { id: number } };
    const txId = Number(body.transaccion.id);
    bankTransactionIds.push(txId);

    await expect(page.getByText("Transferencia registrada", { exact: true }).first()).toBeVisible();
    const neon = await db.query(
      `SELECT referencia, descripcion, monto_centavos, tipo, estado_conciliacion
         FROM bank_transactions WHERE id = $1`,
      [txId],
    );
    expect(neon.rows).toHaveLength(1);
    expect(neon.rows[0].referencia).toBe(referencia);
    expect(neon.rows[0].descripcion).toBe(descripcion);
    expect(Number(neon.rows[0].monto_centavos)).toBe(32_145);
    expect(neon.rows[0].tipo).toBe("credito");
    expect(neon.rows[0].estado_conciliacion).toBe("pendiente");

    await page.reload();
    await page.getByRole("tab", { name: /control bancario/i }).click();
    await expect(page.getByText(referencia, { exact: true })).toBeVisible();
    await expect(page.getByText(new RegExp(descripcion))).toBeVisible();
  });

  test("CB-02: CSV por UI confirma importados, omitidos y fallidos reales", async ({ page }) => {
    const duplicateRef = `E2E-CAJA-${suffix}-DUP`;
    const importedRef = `E2E-CAJA-${suffix}-IMPORT`;
    await crearMovimiento({
      referencia: duplicateRef,
      montoCentavos: 10_000,
      descripcion: `Duplicado E2E ${suffix}`,
    });

    await page.getByRole("tab", { name: /importar spei/i }).click();
    const csv = [
      "fecha,descripcion,monto,referencia,nombre,clabe",
      `${fechaHoy},Importado E2E ${suffix},123.45,${importedRef},,`,
      `${fechaHoy},Duplicado E2E ${suffix},100.00,${duplicateRef},,`,
      `,Sin fecha E2E ${suffix},10.00,E2E-CAJA-${suffix}-NOFECHA,,`,
      `${fechaHoy},Monto inválido E2E ${suffix},no-numero,E2E-CAJA-${suffix}-NOMONTO,,`,
    ].join("\n");
    await page.locator("textarea").fill(csv);
    await page.getByRole("button", { name: /analizar csv/i }).click();
    await expect(page.getByText("4 transacciones detectadas", { exact: true })).toBeVisible();

    const imported = page.waitForResponse((response) =>
      response.url().includes("/api/conciliacion/importar") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: /importar 4 transacciones/i }).click();
    const importedResponse = await imported;
    expect(importedResponse.status()).toBe(200);
    const result = await importedResponse.json() as {
      successful: number;
      skipped: number;
      failed: string[];
    };
    expect(result.successful).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.failed).toHaveLength(2);
    await expect(page.getByText("Importación confirmada", { exact: true }).first()).toBeVisible();

    const neon = await db.query(
      `SELECT referencia, descripcion, monto_centavos, estado_conciliacion
         FROM bank_transactions WHERE campus_id = $1 AND referencia = $2`,
      [campusId, importedRef],
    );
    expect(neon.rows).toHaveLength(1);
    expect(neon.rows[0].descripcion).toBe(`Importado E2E ${suffix}`);
    expect(Number(neon.rows[0].monto_centavos)).toBe(12_345);
    expect(neon.rows[0].estado_conciliacion).toBe("pendiente");
    bankTransactionIds.push(Number((await db.query(
      "SELECT id FROM bank_transactions WHERE campus_id = $1 AND referencia = $2",
      [campusId, importedRef],
    )).rows[0].id));

    await page.reload();
    await page.getByRole("tab", { name: /importar spei/i }).click();
    await expect(page.getByText(`Importado E2E ${suffix}`, { exact: true })).toBeVisible();
  });

  test("CB-03: ejecutar conciliación aplica score 100 y sólo sugiere score 85", async ({ page }) => {
    const highChargeId = await crearCargo(777_777);
    const suggestionChargeId = await crearCargo(888_888);
    const highTxId = await crearMovimiento({
      referencia: `E2E-CAJA-${suffix}-S100`,
      montoCentavos: 777_777,
      clabe: BASE_CLABE,
      nombre: guardianName,
    });
    const suggestionTxId = await crearMovimiento({
      referencia: `E2E-CAJA-${suffix}-S85`,
      montoCentavos: 888_888,
      nombre: guardianName,
    });

    await page.getByRole("tab", { name: /conciliación automática/i }).click();
    const executed = page.waitForResponse((response) =>
      response.url().includes("/api/caja/ejecutar-conciliacion") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: /^ejecutar conciliación$/i }).click();
    const response = await executed;
    expect(response.status()).toBe(200);
    const result = await response.json() as {
      conciliados: number;
      sugerencias: Array<{ tx_id: number; score: number }>;
    };
    expect(result.conciliados).toBeGreaterThanOrEqual(1);
    expect(result.sugerencias).toEqual(expect.arrayContaining([
      expect.objectContaining({ tx_id: suggestionTxId, score: 85 }),
    ]));
    await expect(page.getByText("Conciliación ejecutada", { exact: true }).first()).toBeVisible();

    const highPersisted = await db.query(
      `SELECT bt.estado_conciliacion, bt.confianza_pct, bt.payment_id,
              p.metodo, p.estado AS payment_estado,
              COUNT(pa.id)::int AS applications, c.estado AS charge_estado
         FROM bank_transactions bt
         LEFT JOIN payments p ON p.id = bt.payment_id
         LEFT JOIN payment_applications pa ON pa.payment_id = p.id
         JOIN charges c ON c.id = bt.charge_id
        WHERE bt.id = $1
        GROUP BY bt.id, p.id, c.id`,
      [highTxId],
    );
    expect(highPersisted.rows).toHaveLength(1);
    expect(highPersisted.rows[0].estado_conciliacion).toBe("conciliado");
    expect(Number(highPersisted.rows[0].confianza_pct)).toBe(100);
    expect(highPersisted.rows[0].metodo).toBe("spei");
    expect(highPersisted.rows[0].payment_estado).toBe("exitoso");
    expect(Number(highPersisted.rows[0].applications)).toBe(1);
    expect(highPersisted.rows[0].charge_estado).toBe("pagado");

    const suggestionPersisted = await db.query(
      `SELECT bt.estado_conciliacion, bt.payment_id, c.estado AS charge_estado
         FROM bank_transactions bt
         JOIN charges c ON c.id = $2
        WHERE bt.id = $1`,
      [suggestionTxId, suggestionChargeId],
    );
    expect(suggestionPersisted.rows).toHaveLength(1);
    expect(suggestionPersisted.rows[0].estado_conciliacion).toBe("pendiente");
    expect(suggestionPersisted.rows[0].payment_id).toBeNull();
    expect(suggestionPersisted.rows[0].charge_estado).toBe("pendiente");
    expect(highChargeId).toBeGreaterThan(0);
  });

  test("CB-04: auto-match score 90 aplica SPEI y deja evidencia de revisión", async ({ page }) => {
    const reviewChargeId = await crearCargo(999_999);
    const reviewTxId = await crearMovimiento({
      referencia: `E2E-CAJA-${suffix}-S90`,
      montoCentavos: 999_999,
      clabe: REVIEW_CLABE,
    });

    await page.getByRole("tab", { name: /importar spei/i }).click();
    const autoMatch = page.waitForResponse((response) =>
      response.url().includes("/api/conciliacion/auto-match/") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: /auto-conciliar .*pendientes/i }).click();
    const response = await autoMatch;
    expect(response.status()).toBe(200);
    const result = await response.json() as { conciliados: number; en_revision: number };
    expect(result.conciliados).toBeGreaterThanOrEqual(1);
    expect(result.en_revision).toBeGreaterThanOrEqual(1);
    await expect(page.getByText("Conciliación automática completada", { exact: true }).first()).toBeVisible();

    const persisted = await db.query(
      `SELECT bt.estado_conciliacion, bt.confianza_pct, bt.conciliado_at, bt.payment_id,
              p.metodo, p.estado AS payment_estado,
              COUNT(pa.id)::int AS applications, c.estado AS charge_estado
         FROM bank_transactions bt
         LEFT JOIN payments p ON p.id = bt.payment_id
         LEFT JOIN payment_applications pa ON pa.payment_id = p.id
         JOIN charges c ON c.id = bt.charge_id
        WHERE bt.id = $1
        GROUP BY bt.id, p.id, c.id`,
      [reviewTxId],
    );
    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0].estado_conciliacion).toBe("conciliado");
    expect(Number(persisted.rows[0].confianza_pct)).toBe(90);
    expect(persisted.rows[0].conciliado_at).not.toBeNull();
    expect(persisted.rows[0].metodo).toBe("spei");
    expect(persisted.rows[0].payment_estado).toBe("exitoso");
    expect(Number(persisted.rows[0].applications)).toBe(1);
    expect(persisted.rows[0].charge_estado).toBe("pagado");
    expect(reviewChargeId).toBeGreaterThan(0);

    await page.reload();
    await page.getByRole("tab", { name: /importar spei/i }).click();
    await expect(page.getByText("✓ Conciliado", { exact: true }).first()).toBeVisible();
  });
});