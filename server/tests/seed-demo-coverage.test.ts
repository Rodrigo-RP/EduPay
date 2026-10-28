import { beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import { registerAdminRoutes } from "../routes/admin";
import { pool } from "../db";
import { seedDemoData } from "../seed-demo";
import { executeAction } from "../assistant-actions";
import { scholarshipDashboard } from "../../shared/scholarship-dashboard";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../routes/shared";

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
    expect(tableCounts.payment_due_dates).toBe(2);
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

  it("crea familias y alumnos en kinder, primaria, secundaria y bachillerato por campus", async () => {
    const { rows } = await pool.query<{
      campus_name: string;
      niveles: string[];
      familias: number;
      alumnos_familia: number;
    }>(`
      SELECT c.nombre AS campus_name,
             ARRAY_AGG(DISTINCT s.nivel_escolar) AS niveles,
             COUNT(DISTINCT f.id)::int AS familias,
             COUNT(DISTINCT fs.student_id)::int AS alumnos_familia
      FROM campuses c
      INNER JOIN students s ON s.campus_id = c.id AND s.status = 'activo'
      INNER JOIN family_students fs ON fs.student_id = s.id
      INNER JOIN families f ON f.id = fs.family_id AND f.campus_id = c.id
      WHERE c.nombre IN ('Campus Norte', 'Campus Sur')
      GROUP BY c.id, c.nombre
      ORDER BY c.nombre
    `);

    expect(rows).toHaveLength(2);
    for (const campus of rows) {
      expect(campus.niveles, `${campus.campus_name} debe incluir Kinder`).toContain("Kinder");
      expect(campus.niveles, `${campus.campus_name} debe incluir Primaria`).toContain("Primaria");
      expect(campus.niveles, `${campus.campus_name} debe incluir Secundaria`).toContain("Secundaria");
      expect(campus.niveles, `${campus.campus_name} debe incluir Bachillerato`).toContain("Bachillerato");
      expect(campus.familias, `${campus.campus_name} requiere familias demo`).toBeGreaterThanOrEqual(4);
      expect(campus.alumnos_familia, `${campus.campus_name} requiere alumnos relacionados a familias`).toBeGreaterThanOrEqual(4);
    }
  });

  it("da al asistente el mismo número de beneficiarios vigentes que el panel", async () => {
    const { rows: campusRows } = await pool.query<{ id: number; tenant_id: number }>(
      `SELECT id, tenant_id FROM campuses WHERE nombre IN ('Campus Norte', 'Campus Sur') ORDER BY nombre`,
    );
    expect(campusRows).toHaveLength(2);
    for (const campus of campusRows) {

    const { rows: expectedRows } = await pool.query<{ asignaciones: number; beneficiarios: number }>(
      `SELECT COUNT(*)::int AS asignaciones,
              COUNT(DISTINCT sh.student_id)::int AS beneficiarios
       FROM scholarships sh
       INNER JOIN students s ON s.id = sh.student_id
       WHERE s.campus_id = $1
         AND s.status = 'activo'
         AND sh.tenant_id = $2
         AND COALESCE(sh.estado, 'activa') = 'activa'
         AND sh.vigencia_inicio <= CURRENT_DATE
         AND (sh.vigencia_fin IS NULL OR sh.vigencia_fin >= CURRENT_DATE)`,
      [campus.id, campus.tenant_id],
    );

    const result = await executeAction("query:contar", { entity: "becas" }, {
      campusId: campus.id,
      tenantId: campus.tenant_id,
      userId: 0,
    });
    expect(result.success).toBe(true);
    expect(Number(result.rows?.find((row) => row.label === "Asignaciones vigentes")?.value))
      .toBe(expectedRows[0].asignaciones);
    expect(Number(result.rows?.find((row) => row.label === "Alumnos beneficiados")?.value))
      .toBe(expectedRows[0].beneficiarios);
    const token = jwt.sign({ campus_id: campus.id, tenant_id: campus.tenant_id, role: "administrador_campus" }, JWT_SECRET);
    const response = await fetch("http://127.0.0.1:5000/api/scholarships", { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status).toBe(200);
    const dashboard = scholarshipDashboard(await response.json());
    expect(dashboard.beneficiaries).toBe(expectedRows[0].beneficiarios);
    expect(dashboard.assignments).toBe(expectedRows[0].asignaciones);
    const discrepancy = await executeAction("query:discrepancia", {}, { campusId: campus.id, tenantId: campus.tenant_id, userId: 0 });
    expect(discrepancy.success).toBe(true);
    expect(Number(discrepancy.rows?.find((row) => row.label === "Alumnos beneficiados")?.value)).toBe(dashboard.beneficiaries);
    }
  });

  it("cada nivel tiene hogar completo, concepto y cargos compatibles y beca vigente", async () => {
    const { rows } = await pool.query(`
      SELECT c.nombre, s.nivel_escolar,
        COUNT(DISTINCT s.id)::int AS alumnos
      FROM campuses c
      JOIN students s ON s.campus_id = c.id AND s.tenant_id = c.tenant_id AND s.status = 'activo'
      JOIN family_students fs ON fs.student_id = s.id
      JOIN families f ON f.id = fs.family_id AND f.campus_id = c.id AND f.tenant_id = c.tenant_id
      JOIN student_guardian sg ON sg.student_id = s.id
      JOIN guardians g ON g.id = sg.guardian_id AND g.campus_id = c.id AND g.tenant_id = c.tenant_id
      JOIN charges ch ON ch.student_id = s.id AND ch.tenant_id = c.tenant_id
      JOIN concepts co ON co.id = ch.concept_id AND co.campus_id = c.id AND co.tenant_id = c.tenant_id
        AND LOWER(co.nombre) LIKE '%' || LOWER(s.nivel_escolar) || '%'
      JOIN scholarships sh ON sh.student_id = s.id AND sh.tenant_id = c.tenant_id
        AND COALESCE(sh.estado, 'activa') = 'activa'
        AND sh.vigencia_inicio <= CURRENT_DATE
        AND (sh.vigencia_fin IS NULL OR sh.vigencia_fin >= CURRENT_DATE)
      WHERE c.nombre IN ('Campus Norte', 'Campus Sur')
        AND EXISTS (SELECT 1 FROM student_guardian r JOIN guardians p ON p.id = r.guardian_id
                    WHERE r.student_id = s.id AND p.tipo_guardian = 'padre')
        AND EXISTS (SELECT 1 FROM student_guardian r JOIN guardians m ON m.id = r.guardian_id
                    WHERE r.student_id = s.id AND m.tipo_guardian = 'madre')
      GROUP BY c.nombre, s.nivel_escolar
    `);
    expect(rows).toHaveLength(8);
    for (const row of rows) expect(row.alumnos).toBeGreaterThan(0);
  });

  it("API y asistente excluyen suspendidas, futuras, vencidas, inactivos y otro campus/tenant; distinguen duplicados", async () => {
    const client = await pool.connect();
    await client.query("BEGIN");
    const spy = vi.spyOn(pool, "query").mockImplementation(((...args: any[]) => (client.query as any)(...args)) as any);
    const app = express();
    registerAdminRoutes(app);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${(server.address() as any).port}`;
    try {
      const { rows: [campus] } = await client.query(
        `SELECT id, tenant_id FROM campuses WHERE nombre = 'Campus Norte'`,
      );
      const { rows: [student] } = await client.query(
        `SELECT student_id FROM scholarships sh JOIN students s ON s.id = sh.student_id
         WHERE s.campus_id = $1 ORDER BY sh.id LIMIT 1`, [campus.id],
      );
      // All changes stay on this connection and are rolled back, including
      // HTTP reads below (the in-process route shares this pool spy).
      await client.query(
        `INSERT INTO scholarships (student_id, tenant_id, porcentaje, estado, vigencia_inicio, vigencia_fin)
         VALUES ($1,$2,10,'activa',CURRENT_DATE,CURRENT_DATE),
                ($1,$2,10,'activa',CURRENT_DATE,CURRENT_DATE+365),
                ($1,$2,10,'suspendida',CURRENT_DATE-1,CURRENT_DATE+1),
                ($1,$2,10,'activa',CURRENT_DATE+1,CURRENT_DATE+2),
                ($1,$2,10,'activa',CURRENT_DATE-2,CURRENT_DATE-1)`,
        [student.student_id, campus.tenant_id],
      );
      const { rows: [inactive] } = await client.query(
        `INSERT INTO students (campus_id,tenant_id,nombre_completo,status,nivel_escolar)
         VALUES ($1,$2,'Alumno inactivo de prueba','inactivo','Primaria') RETURNING id`,
        [campus.id, campus.tenant_id],
      );
      await client.query(
        `INSERT INTO scholarships (student_id,tenant_id,porcentaje,vigencia_inicio,vigencia_fin)
         VALUES ($1,$2,20,CURRENT_DATE,CURRENT_DATE+365)`, [inactive.id, campus.tenant_id],
      );
      const { rows: [expected] } = await client.query(
        `SELECT COUNT(*)::int AS assignments, COUNT(DISTINCT sh.student_id)::int AS beneficiaries
         FROM scholarships sh JOIN students s ON s.id = sh.student_id
         WHERE s.campus_id=$1 AND sh.tenant_id=$2 AND s.status='activo'
           AND COALESCE(sh.estado,'activa')='activa' AND sh.vigencia_inicio <= CURRENT_DATE
           AND (sh.vigencia_fin IS NULL OR sh.vigencia_fin >= CURRENT_DATE)`,
        [campus.id, campus.tenant_id],
      );
      const token = (role = "administrador_campus", tenant = campus.tenant_id) => jwt.sign({
        role, campus_id: campus.id, tenant_id: tenant,
      }, JWT_SECRET);
      const get = (auth?: string) => fetch(`${base}/api/scholarships`, {
        headers: auth ? { Authorization: `Bearer ${auth}` } : {},
      });
      const response = await get(token());
      expect(response.status).toBe(200);
      const dashboard = scholarshipDashboard(await response.json());
      expect(dashboard.assignments).toBe(expected.assignments);
      expect(dashboard.beneficiaries).toBe(expected.beneficiaries);
      expect(dashboard.assignments).toBeGreaterThan(dashboard.beneficiaries);
      for (const action of ["query:contar", "query:discrepancia"]) {
        const result = await executeAction(action, { entity: "becas" }, {
          campusId: campus.id, tenantId: campus.tenant_id, userId: 0,
        });
        expect(result.success).toBe(true);
        expect(Number(result.rows?.find(r => r.label === "Alumnos beneficiados")?.value)).toBe(expected.beneficiaries);
        expect(Number(result.rows?.find(r => r.label === "Asignaciones vigentes")?.value)).toBe(expected.assignments);
      }
      expect((await get()).status).toBe(401);
      expect((await get(token("docente"))).status).toBe(403);
      const foreignTenant = await get(token("administrador_campus", campus.tenant_id + 9999));
      expect(await foreignTenant.json()).toEqual([]);
      const foreignAssistant = await executeAction("query:contar", { entity: "becas" }, {
        campusId: campus.id, tenantId: campus.tenant_id + 9999, userId: 0,
      });
      expect(Number(foreignAssistant.rows?.find(r => r.label === "Alumnos beneficiados")?.value)).toBe(0);
      // A failed read must not masquerade as an empty campus.
      spy.mockRejectedValueOnce(new Error("DB unavailable"));
      expect((await get(token())).status).toBe(500);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      spy.mockRestore();
      await client.query("ROLLBACK");
      client.release();
    }
  });
});