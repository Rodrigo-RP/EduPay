/**
 * E2E real — fallback de Claude con datos aislados.
 * No simula Anthropic: usa ANTHROPIC_API_KEY configurada en Replit, el endpoint
 * real del asistente y herramientas read-only contra la base de desarrollo.
 */
import { test, expect } from "@playwright/test";
import jwt from "jsonwebtoken";
import { executeAction } from "../server/assistant-actions";
import { pool } from "../server/db";

const BASE = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET;
if (!JWT_SECRET) throw new Error("Se requiere JWT_SECRET o SESSION_SECRET para E2E.");
const CURRENT_YEAR = new Date().getFullYear();

let tenantId: number;
let campusId: number;
let otherCampusId: number;
let studentIds: number[] = [];
let chargeIds: number[] = [];
let familyIds: number[] = [];
let token: string;
let fixtureNames: string[] = [];

test.describe("Claude real — consulta de adeudos con tool use", () => {
  test.skip(!process.env.ANTHROPIC_API_KEY, "Requiere ANTHROPIC_API_KEY configurada.");
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    const suffix = Date.now().toString().slice(-8);
    tenantId = (await pool.query(
      "INSERT INTO tenants (nombre_legal, rfc) VALUES ($1, $2) RETURNING id",
      [`E2E Claude ${suffix}`, `EC${suffix}`],
    )).rows[0].id;
    campusId = (await pool.query(
      "INSERT INTO campuses (nombre, tenant_id) VALUES ($1, $2) RETURNING id",
      [`Campus Claude ${suffix}`, tenantId],
    )).rows[0].id;
    otherCampusId = (await pool.query(
      "INSERT INTO campuses (nombre, tenant_id) VALUES ($1, $2) RETURNING id",
      [`Campus Claude secundario ${suffix}`, tenantId],
    )).rows[0].id;
    familyIds = (await pool.query(
      `INSERT INTO families (tenant_id, campus_id, nombre)
       VALUES ($1, $2, $3), ($1, $4, $5)
       RETURNING id`,
      [tenantId, campusId, `Familia Claude A ${suffix}`, otherCampusId, `Familia Claude B ${suffix}`],
    )).rows.map((row: any) => row.id);

    fixtureNames = ["Alma Claude", "Bruno Claude"];
    const students = await pool.query(
      `INSERT INTO students
        (tenant_id, campus_id, nombres, apellido_paterno, nombre_completo, nivel_escolar, grado, grupo, status, id_referencia)
       VALUES
        ($1, $2, 'Alma', 'Claude', $3, 'Primaria', 4, 'A', 'activo', $4),
        ($1, $2, 'Bruno', 'Claude', $5, 'Secundaria', 2, 'B', 'activo', $6)
       RETURNING id`,
      [tenantId, campusId, fixtureNames[0], `CLAUDE-${suffix}-A`, fixtureNames[1], `CLAUDE-${suffix}-B`],
    );
    studentIds = students.rows.map((row: any) => row.id);

    const charges = await pool.query(
      `INSERT INTO charges
        (tenant_id, student_id, fecha_emision, fecha_vencimiento, monto_base_centavos, estado)
       VALUES
        ($1, $2, $4::date, $4::date, 125000, 'pendiente'),
        ($1, $3, $4::date, $4::date, 98000, 'vencido')
       RETURNING id`,
      [tenantId, studentIds[0], studentIds[1], `${CURRENT_YEAR}-08-15`],
    );
    chargeIds = charges.rows.map((row: any) => row.id);
    token = jwt.sign(
      { role: "super_admin", tenant_id: tenantId, campus_id: campusId },
      JWT_SECRET,
      { expiresIn: "10m" },
    );
  });

  test.afterAll(async () => {
    if (!tenantId) return;
    await pool.query("DELETE FROM audit_log WHERE tenant_id = $1", [tenantId]);
    if (chargeIds.length) await pool.query("DELETE FROM charges WHERE id = ANY($1::int[])", [chargeIds]);
    if (studentIds.length) await pool.query("DELETE FROM students WHERE id = ANY($1::int[])", [studentIds]);
    if (familyIds.length) await pool.query("DELETE FROM families WHERE id = ANY($1::int[])", [familyIds]);
    await pool.query("DELETE FROM campuses WHERE id = $1", [otherCampusId]);
    await pool.query("DELETE FROM campuses WHERE id = $1", [campusId]);
    await pool.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
  });

  test("la pregunta amplia usa Claude y la herramienta de adeudos real", async ({ request }) => {
    const directToolResult = await executeAction(
      "query:adeudos_nivel_periodo",
      { mes: 8, anio: CURRENT_YEAR, nivel: "" },
      { campusId, tenantId, userId: 0 },
    );
    expect(directToolResult.rows?.map((row) => row.label).join("\n")).toContain(fixtureNames[0]);
    expect(directToolResult.rows?.map((row) => row.label).join("\n")).toContain(fixtureNames[1]);
    const campusFamilyCount = await executeAction(
      "query:contar",
      { entity: "familias" },
      { campusId, tenantId, userId: 0 },
    );
    expect(campusFamilyCount.summary).toContain("**1 familias**");

    const response = await request.post(`${BASE}/api/assistant/chat`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      data: {
        message: "qué alumnos faltan de pagar la colegiatura de agosto de todos los niveles",
      },
      failOnStatusCode: false,
      timeout: 60_000,
    });
    const body = await response.json();

    expect(response.status()).toBe(200);
    expect(body.claude).toMatchObject({
      provider: "anthropic",
      model: "claude-sonnet-5",
    });
    expect(body.claude.toolCalls).toContain("query_adeudos_nivel_periodo");
    expect(body.claude.adeudosPeriodos).toContainEqual({
      mes: 8,
      anio: CURRENT_YEAR,
      nivel: "todos",
    });
    expect(body.reply).toContain(fixtureNames[0]);
    expect(body.reply).toContain(fixtureNames[1]);

    let audit: Awaited<ReturnType<typeof pool.query>> | undefined;
    for (let attempt = 0; attempt < 20; attempt++) {
      audit = await pool.query(
        `SELECT metadata::text AS metadata
           FROM audit_log
          WHERE tenant_id = $1
            AND action = 'assistant_chat_interaction'
            AND metadata::text LIKE '%"intentType":"claude_fallback"%'
          ORDER BY created_at DESC
          LIMIT 1`,
        [tenantId],
      );
      if (audit.rows.length) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].metadata).toContain("query_adeudos_nivel_periodo");
    expect(audit.rows[0].metadata).not.toMatch(/ANTHROPIC_API_KEY|sk-ant/i);

    console.log("[e2e][claude-real]", JSON.stringify({
      request: {
        model: body.claude.model,
        toolCalls: body.claude.toolCalls,
      },
      response: body.reply,
    }));
  });
});