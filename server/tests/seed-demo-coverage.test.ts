import { beforeAll, describe, expect, it } from "vitest";
import { pool } from "../db";
import { seedDemoData } from "../seed-demo";

const REQUIRED_TABLES = [
  "bank_transactions",
  "late_fee_calculations",
  "payment_plan_installments",
  "payment_plans",
  "family_payment_sources",
  "family_credits",
  "invoices",
  "scholarships",
  "discounts",
  "notifications",
  "payment_rules",
  "payment_surcharge_rules",
  "payment_due_dates",
  "scholarship_auto_rules",
  "scholarship_types",
  "pending_approvals",
  "approval_notifications",
  "approval_workflow_logs",
  "acciones_seguimiento",
  "magic_link_tokens",
  "payment_applications",
  "payment_events",
] as const;

describe("SEED-02: datos demo completos para pantallas reales", () => {
  let tableCounts: Record<string, number>;

  beforeAll(async () => {
    const result = await seedDemoData();
    expect(result.success, result.error ?? result.logs.at(-1)).toBe(true);
    tableCounts = result.tableCounts;
  }, 90_000);

  it("puebla cada tabla que el seed limpia", () => {
    for (const table of REQUIRED_TABLES) {
      expect(tableCounts[table], `${table} debe tener fixtures demo`).toBeGreaterThan(0);
    }
    expect(tableCounts.scholarship_criteria).toBeGreaterThan(0);
    expect(tableCounts.scholarship_benefits).toBeGreaterThan(0);
    expect(tableCounts.products).toBeGreaterThan(0);
  });

  it("crea los casos de beca, calendario, hermanos y ledger", async () => {
    const { rows } = await pool.query<{
      scholarships: number;
      charges_with_scholarship: number;
      scheduled: number;
      partial: number;
      multi_student_guardians: number;
      multi_charge_payments: number;
      active_credits: number;
    }>(`
      SELECT
        (SELECT COUNT(*)::int FROM scholarships) AS scholarships,
        (SELECT COUNT(*)::int FROM charges WHERE beca_aplicada > 0) AS charges_with_scholarship,
        (SELECT COUNT(*)::int FROM charges WHERE estado = 'scheduled') AS scheduled,
        (SELECT COUNT(*)::int FROM charges WHERE estado = 'parcial') AS partial,
        (SELECT COUNT(*)::int
           FROM (SELECT guardian_id FROM student_guardian GROUP BY guardian_id HAVING COUNT(*) >= 2) rel) AS multi_student_guardians,
        (SELECT COUNT(*)::int
           FROM (SELECT payment_id FROM payment_applications GROUP BY payment_id HAVING COUNT(*) >= 2) ledger) AS multi_charge_payments,
        (SELECT COUNT(*)::int FROM family_credits WHERE status = 'activo') AS active_credits
    `);

    expect(rows[0].scholarships).toBeGreaterThanOrEqual(3);
    expect(rows[0].charges_with_scholarship).toBeGreaterThan(0);
    expect(rows[0].scheduled).toBeGreaterThan(0);
    expect(rows[0].partial).toBeGreaterThan(0);
    expect(rows[0].multi_student_guardians).toBeGreaterThan(0);
    expect(rows[0].multi_charge_payments).toBeGreaterThan(0);
    expect(rows[0].active_credits).toBeGreaterThan(0);
  });

  it("reparte alumnos y productos entre ambos campus", async () => {
    const { rows } = await pool.query<{
      campus_name: string;
      students: number;
      products: number;
    }>(`
      SELECT c.nombre AS campus_name,
             COUNT(DISTINCT s.id)::int AS students,
             COUNT(DISTINCT p.id)::int AS products
      FROM campuses c
      LEFT JOIN students s ON s.campus_id = c.id
      LEFT JOIN products p ON p.campus_id = c.id
      WHERE c.nombre IN ('Campus Norte', 'Campus Sur')
      GROUP BY c.id, c.nombre
      ORDER BY c.nombre
    `);

    expect(rows).toHaveLength(2);
    for (const campus of rows) {
      expect(campus.students, `${campus.campus_name} requiere alumnos demo`).toBeGreaterThan(0);
      expect(campus.products, `${campus.campus_name} requiere productos demo`).toBeGreaterThan(0);
    }
  });
});