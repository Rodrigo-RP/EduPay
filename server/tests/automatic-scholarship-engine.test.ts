import { afterAll, beforeAll, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { pool } from "../db";
import { JWT_SECRET } from "../routes/shared";
import { currentSchoolYear, schoolYearDates } from "../lib/scholarship-engine";

const BASE = "http://localhost:5000";

let tenantId: number;
let campusId: number;
let guardianId: number;
let manualStudentId: number;
let automaticStudentId: number;
let conceptId: number;
let ruleId: number;
let token: string;
const cycle = currentSchoolYear();
const dates = schoolYearDates(cycle);

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

beforeAll(async () => {
  const suffix = `${Date.now()}`.slice(-8);
  const tenant = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Motor becas ${suffix}`, `MBA${suffix.slice(-7)}`],
  );
  tenantId = Number(tenant.rows[0].id);
  const campus = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1,$2) RETURNING id`,
    [tenantId, `Campus motor ${suffix}`],
  );
  campusId = Number(campus.rows[0].id);

  const students = await pool.query(
    `INSERT INTO students (tenant_id, campus_id, nombres, apellido_paterno, nombre_completo, status)
     VALUES ($1,$2,'Manual','Motor',$3,'activo'),
            ($1,$2,'Auto','Motor',$4,'activo')
     RETURNING id`,
    [tenantId, campusId, `Manual Motor ${suffix}`, `Auto Motor ${suffix}`],
  );
  manualStudentId = Number(students.rows[0].id);
  automaticStudentId = Number(students.rows[1].id);
  const guardian = await pool.query(
    `INSERT INTO guardians
      (tenant_id, campus_id, correo_institucional_familiar, email, nombres, nombre_completo)
     VALUES ($1,$2,$3,$3,'Tutor',$4) RETURNING id`,
    [tenantId, campusId, `motor-${suffix}@test.invalid`, `Tutor Motor ${suffix}`],
  );
  guardianId = Number(guardian.rows[0].id);
  await pool.query(
    `INSERT INTO student_guardian (student_id, guardian_id)
     VALUES ($1,$3),($2,$3)`,
    [manualStudentId, automaticStudentId, guardianId],
  );
  const concept = await pool.query(
    `INSERT INTO concepts (tenant_id, campus_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1,$2,'Colegiatura motor','colegiatura','mensual',100000) RETURNING id`,
    [tenantId, campusId],
  );
  conceptId = Number(concept.rows[0].id);
  const rule = await pool.query(
    `INSERT INTO scholarship_auto_rules
      (tenant_id, campus_id, nombre, tipo, descuento_porcentaje, aplica_a,
       ciclo_escolar, vigencia_inicio, vigencia_fin)
     VALUES ($1,$2,'Hermanos motor','hermanos',25,'todos',$3,$4,$5) RETURNING id`,
    [tenantId, campusId, cycle, dates.start, dates.end],
  );
  ruleId = Number(rule.rows[0].id);

  await pool.query(
    `INSERT INTO scholarships
      (tenant_id, student_id, porcentaje, motivo, vigencia_inicio, vigencia_fin)
     VALUES ($1,$2,10,'Manual vigente',$3,$4)`,
    [tenantId, manualStudentId, dates.start, dates.end],
  );
  await pool.query(
    `INSERT INTO charges
      (tenant_id, student_id, concept_id, ciclo_escolar, fecha_emision, fecha_vencimiento,
       monto_base_centavos, beca_aplicada, recargo_aplicado_centavos, estado)
     VALUES
      ($1,$2,$3,$4,$5,$5,100000,0,0,'pendiente'),
      ($1,$2,$3,$4,$5,$5,100000,0,0,'parcial'),
      ($1,$6,$3,$4,$5,$5,100000,0,0,'pendiente')`,
    [tenantId, manualStudentId, conceptId, cycle, dates.start, automaticStudentId],
  );
  token = jwt.sign(
    { role: "administrador_campus", campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
});

afterAll(async () => {
  await pool.query(`DELETE FROM audit_log WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM charge_scholarship_applications WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM scholarship_auto_assignments WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM charges WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM scholarships WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM scholarship_auto_rules WHERE id = $1`, [ruleId]);
  await pool.query(`DELETE FROM concepts WHERE id = $1`, [conceptId]);
  await pool.query(`DELETE FROM student_guardian WHERE guardian_id = $1`, [guardianId]);
  await pool.query(`DELETE FROM guardians WHERE id = $1`, [guardianId]);
  await pool.query(`DELETE FROM students WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM campuses WHERE id = $1`, [campusId]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
});

describe("motor de becas automáticas idempotente", () => {
  it("prioriza beca manual, aplica una automática y excluye un cargo parcial", async () => {
    const result = await request("/api/becas-auto/ejecutar", { method: "POST", body: "{}" });
    expect(result.status).toBe(200);
    expect(result.body.becas_creadas).toBe(1);
    expect(result.body.omitidas_prioridad_manual).toBe(1);
    expect(result.body.cargos_actualizados).toBe(1);
    expect(result.body.cargos_excluidos).toBe(0);
    expect(result.body.alertas).toHaveLength(1);
    expect(result.body.alertas[0].student_id).toBe(manualStudentId);

    const charges = await pool.query(
      `SELECT student_id, estado, beca_aplicada::numeric AS pct
         FROM charges WHERE tenant_id = $1 ORDER BY student_id, estado`,
      [tenantId],
    );
    const manualPending = charges.rows.find((row: any) =>
      Number(row.student_id) === manualStudentId && row.estado === "pendiente",
    );
    const manualPartial = charges.rows.find((row: any) =>
      Number(row.student_id) === manualStudentId && row.estado === "parcial",
    );
    const automaticPending = charges.rows.find((row: any) =>
      Number(row.student_id) === automaticStudentId,
    );
    expect(Number(manualPending.pct)).toBe(0);
    expect(Number(manualPartial.pct)).toBe(0);
    expect(Number(automaticPending.pct)).toBe(25);

    const applications = await pool.query(
      `SELECT COUNT(*)::int AS count FROM charge_scholarship_applications WHERE tenant_id = $1`,
      [tenantId],
    );
    expect(Number(applications.rows[0].count)).toBe(1);
  });

  it("no duplica asignaciones al ejecutar el mismo ciclo una segunda vez", async () => {
    const result = await request("/api/becas-auto/ejecutar", { method: "POST", body: "{}" });
    expect(result.status).toBe(200);
    expect(result.body.becas_creadas).toBe(0);
    expect(result.body.asignaciones_existentes).toBe(1);
    expect(result.body.omitidas_prioridad_manual).toBe(1);
    const assignments = await pool.query(
      `SELECT COUNT(*)::int AS count FROM scholarship_auto_assignments
        WHERE rule_id = $1 AND ciclo_escolar = $2`,
      [ruleId, cycle],
    );
    expect(Number(assignments.rows[0].count)).toBe(2);

    const alerts = await request(`/api/becas-auto/alertas?ciclo_escolar=${cycle}`);
    expect(alerts.status).toBe(200);
    expect(alerts.body).toHaveLength(1);
    expect(Number(alerts.body[0].student_id)).toBe(manualStudentId);
  });

  it("aplica el mismo resolvedor al generar un cargo futuro de colegiatura", async () => {
    const result = await request("/api/charges/generate", {
      method: "POST",
      body: JSON.stringify({
        concepto: "Colegiatura motor",
        student_id: automaticStudentId,
        ciclo_escolar: cycle,
        fecha_emision: dates.start,
        fecha_vencimiento: dates.start,
        aplicar_becas: true,
      }),
    });
    expect(result.status).toBe(201);
    expect(result.body.summary).toHaveLength(1);
    expect(Number(result.body.summary[0].beca_porcentaje)).toBe(25);

    const applications = await pool.query(
      `SELECT COUNT(*)::int AS count FROM charge_scholarship_applications WHERE tenant_id = $1`,
      [tenantId],
    );
    expect(Number(applications.rows[0].count)).toBe(2);
  });

  it("rechaza reglas fuera del alcance o porcentajes financieros inválidos", async () => {
    const invalidPercentage = await request("/api/becas-auto/reglas", {
      method: "POST",
      body: JSON.stringify({
        nombre: "Regla inválida",
        tipo: "hermanos",
        descuento_porcentaje: 101,
        aplica_a: "todos",
      }),
    });
    expect(invalidPercentage.status).toBe(400);

    const unsupported = await request("/api/becas-auto/reglas", {
      method: "POST",
      body: JSON.stringify({
        nombre: "Regla fuera de alcance",
        tipo: "deportiva",
        descuento_porcentaje: 10,
        aplica_a: "todos",
      }),
    });
    expect(unsupported.status).toBe(422);

    const crossCampus = await request(`/api/becas-auto/reglas/${campusId + 999999}`);
    expect(crossCampus.status).toBe(403);
  });

  it("confirma el borrado de una regla y responde 404 si ya no existe", async () => {
    const created = await request("/api/becas-auto/reglas", {
      method: "POST",
      body: JSON.stringify({
        nombre: "Regla temporal para borrar",
        tipo: "hermanos",
        descuento_porcentaje: 15,
        aplica_a: "todos",
      }),
    });
    expect(created.status).toBe(200);

    const deleted = await request(`/api/becas-auto/reglas/${created.body.id}`, { method: "DELETE" });
    expect(deleted.status).toBe(200);
    expect(deleted.body.message).toMatch(/eliminada/i);

    const missing = await request(`/api/becas-auto/reglas/${created.body.id}`, { method: "DELETE" });
    expect(missing.status).toBe(404);
  });
});