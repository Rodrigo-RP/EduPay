/**
 * server/tests/nit-narrative-insights.test.ts — Panel Narrativo NI-01…NI-05
 *
 * NIT-01  NI-01 fires — concentración ≥75% por nivel → critico
 * NIT-02  NI-02 fires — mora >80% de cartera con >90 días → critico
 * NIT-03  NI-03 fires — ≥5 alumnos en semáforo rojo → atencion
 * NIT-04  NI-04 fires — caída de 100 pp tasa cobranza vs mes anterior → critico
 * NIT-05  NI-05 fires — 4 familias con >$5,000 y >60 días → atencion
 * NIT-06  Campus sin datos → insights = [] (zero alertas)
 * NIT-07  NI-03 count coincide exactamente con RPT-08 resumen.rojo.count
 *         (invariante RSG-14-like: misma fórmula computeRiesgoScore en ambos)
 *
 * ─── Campus "trigger": fixture completo ──────────────────────────────────────
 *
 *  s1-s4  Primaria, prev_charge pagado (600k¢, prevMid) + curr_charge pendiente
 *         (600k¢, NOW, fecha_vencimiento=daysAgo(95)) — 4 alumnos con >90d vencido
 *  s5     Primaria, prev_charge pagado (600k¢, prevMid) + curr_charge pendiente
 *         (600k¢, NOW, fecha_vencimiento=daysAgo(41)) — 1 alumno con 41d vencido
 *  s6     Secundaria, curr_charge pendiente solo (10k¢, NOW, vence daysAgo(10))
 *
 *  NI-01: Primaria = round(3000000/3010000*100) = 100% → critico, dato=100
 *  NI-02: pct_90d  = round(2400000/3010000*100) =  80% → critico, dato=80
 *  NI-03: countRojo = 5 (s1-s5, computeRiesgoScore: score≈25 → rojo)   dato=5
 *  NI-04: tasa_ant=100%, tasa_actual=0%, delta=100pp                     dato=100
 *  NI-05: count_criticos = 4 (s1-s4: >60d y adeudo>500k)                dato=4
 *
 * ─── Campus "clean": sin cargos → insights = [] ──────────────────────────────
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";
const TS         = Date.now().toString().slice(-6);

// ─── Fechas helpers ────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

const now         = new Date();
const currStart   = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
const currEnd     = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));

// Mes anterior
const prevLast    = new Date(now.getFullYear(), now.getMonth(), 0);
const prevFirst   = new Date(prevLast.getFullYear(), prevLast.getMonth(), 1);
const prevMid     = isoDate(new Date(prevLast.getFullYear(), prevLast.getMonth(), 15));
const prevStart   = isoDate(prevFirst);
const prevEnd     = isoDate(prevLast);

// ─── Estado compartido: campus trigger ────────────────────────────────────────

let tTenantId:  number;
let tCampusId:  number;
let tConceptId: number;
let tStudentIds: number[] = [];
let tPrevChargeIds: number[] = [];
let tPrevPayIds:    number[] = [];
let tCurrChargeIds: number[] = [];
let tokTrigAdmin: string;

// ─── Estado compartido: campus clean ─────────────────────────────────────────

let cTenantId: number;
let cCampusId: number;
let tokClean:  string;

// ─── Token helper ─────────────────────────────────────────────────────────────

function makeToken(userId: number, role: string, campusId: number, tenantId: number): string {
  return jwt.sign(
    { id: userId, role, campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // ── Campus trigger ──────────────────────────────────────────────────────────
  const tTR = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant NIT ${TS}`, `NIT${TS}`],
  );
  tTenantId = tTR.rows[0].id;

  const tCR = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1,$2) RETURNING id`,
    [tTenantId, `Campus-NIT-${TS}`],
  );
  tCampusId = tCR.rows[0].id;

  const tCoR = await pool.query(
    `INSERT INTO concepts (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1,$2,$3,'mensualidad','mensual',60000) RETURNING id`,
    [tCampusId, tTenantId, `Colegiatura-NIT-${TS}`],
  );
  tConceptId = tCoR.rows[0].id;

  // Usuario admin del campus trigger
  const tUR = await pool.query(
    `INSERT INTO users (tenant_id, campus_id, name, email, password_hash, role, is_active)
     VALUES ($1,$2,$3,$4,'hash','administrador_campus',true) RETURNING id`,
    [tTenantId, tCampusId, `Admin NIT ${TS}`, `admin.nit.${TS}@test.mx`],
  );
  tokTrigAdmin = makeToken(tUR.rows[0].id, "administrador_campus", tCampusId, tTenantId);

  async function insertStudent(nombre: string, nivel: string): Promise<number> {
    const r = await pool.query(
      `INSERT INTO students
         (tenant_id, campus_id, nombres, apellido_paterno, nombre_completo,
          id_referencia, nivel_escolar, grado, grupo, status)
       VALUES ($1,$2,$3,'NIT-${TS}',$4,$5,$6,'1','A','activo') RETURNING id`,
      [tTenantId, tCampusId, nombre, `${nombre} NIT-${TS}`, `REF-${nombre}-${TS}`, nivel],
    );
    return r.rows[0].id as number;
  }

  // ── Alumnos Primaria s1-s4: prev_charge pagado + curr_charge pendiente
  //    fecha_vencimiento=daysAgo(95) → dias_vencido=95 → rojo, >90d para NI-02

  for (let i = 1; i <= 4; i++) {
    const sid = await insertStudent(`AlumP${i}`, "Primaria");
    tStudentIds.push(sid);

    // prev_charge: estado='pagado', created_at=prevMid
    const pcR = await pool.query(
      `INSERT INTO charges
         (tenant_id, student_id, concept_id, ciclo_escolar,
          fecha_emision, fecha_vencimiento,
          monto_base_centavos, beca_aplicada, recargo_aplicado_centavos,
          estado, created_at)
       VALUES ($1,$2,$3,'2025-2026',$4,$5,600000,'0',0,'pagado',$6::date)
       RETURNING id`,
      [tTenantId, sid, tConceptId, prevStart, prevEnd, prevMid],
    );
    const prevChId = pcR.rows[0].id as number;
    tPrevChargeIds.push(prevChId);

    // prev_payment: created_at=prevMid  ($3=fecha_pago, $4=created_at — mismo valor, tipos distintos)
    const ppR = await pool.query(
      `INSERT INTO payments
         (tenant_id, charge_id, metodo, monto_centavos, fecha_pago, estado, created_at)
       VALUES ($1,$2,'transferencia',600000,$3,'exitoso',$4::date)
       RETURNING id`,
      [tTenantId, prevChId, prevMid, prevMid],
    );
    tPrevPayIds.push(ppR.rows[0].id as number);

    // curr_charge: estado='pendiente', created_at=default(NOW), fecha_vencimiento=daysAgo(95)
    const ccR = await pool.query(
      `INSERT INTO charges
         (tenant_id, student_id, concept_id, ciclo_escolar,
          fecha_emision, fecha_vencimiento,
          monto_base_centavos, beca_aplicada, recargo_aplicado_centavos, estado)
       VALUES ($1,$2,$3,'2025-2026',CURRENT_DATE,$4,600000,'0',0,'pendiente')
       RETURNING id`,
      [tTenantId, sid, tConceptId, daysAgo(95)],
    );
    tCurrChargeIds.push(ccR.rows[0].id as number);
  }

  // ── Alumno Primaria s5: same pero fecha_vencimiento=daysAgo(41) (no >90d)
  {
    const sid = await insertStudent("AlumP5", "Primaria");
    tStudentIds.push(sid);

    const pcR = await pool.query(
      `INSERT INTO charges
         (tenant_id, student_id, concept_id, ciclo_escolar,
          fecha_emision, fecha_vencimiento,
          monto_base_centavos, beca_aplicada, recargo_aplicado_centavos,
          estado, created_at)
       VALUES ($1,$2,$3,'2025-2026',$4,$5,600000,'0',0,'pagado',$6::date)
       RETURNING id`,
      [tTenantId, sid, tConceptId, prevStart, prevEnd, prevMid],
    );
    const prevChId = pcR.rows[0].id as number;
    tPrevChargeIds.push(prevChId);

    const ppR = await pool.query(
      `INSERT INTO payments
         (tenant_id, charge_id, metodo, monto_centavos, fecha_pago, estado, created_at)
       VALUES ($1,$2,'transferencia',600000,$3,'exitoso',$4::date)
       RETURNING id`,
      [tTenantId, prevChId, prevMid, prevMid],
    );
    tPrevPayIds.push(ppR.rows[0].id as number);

    const ccR = await pool.query(
      `INSERT INTO charges
         (tenant_id, student_id, concept_id, ciclo_escolar,
          fecha_emision, fecha_vencimiento,
          monto_base_centavos, beca_aplicada, recargo_aplicado_centavos, estado)
       VALUES ($1,$2,$3,'2025-2026',CURRENT_DATE,$4,600000,'0',0,'pendiente')
       RETURNING id`,
      [tTenantId, sid, tConceptId, daysAgo(41)],
    );
    tCurrChargeIds.push(ccR.rows[0].id as number);
  }

  // ── Alumno Secundaria s6: curr_charge solo, monto=10k, daysAgo(10)
  {
    const sid = await insertStudent("AlumS6", "Secundaria");
    tStudentIds.push(sid);

    const ccR = await pool.query(
      `INSERT INTO charges
         (tenant_id, student_id, concept_id, ciclo_escolar,
          fecha_emision, fecha_vencimiento,
          monto_base_centavos, beca_aplicada, recargo_aplicado_centavos, estado)
       VALUES ($1,$2,$3,'2025-2026',CURRENT_DATE,$4,10000,'0',0,'pendiente')
       RETURNING id`,
      [tTenantId, sid, tConceptId, daysAgo(10)],
    );
    tCurrChargeIds.push(ccR.rows[0].id as number);
    // s6 NOT in tStudentIds — add for cleanup
    tStudentIds.push(sid);
  }

  // ── Campus clean: tenant + campus + admin, sin cargos ──────────────────────
  const cTR = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant NIT Clean ${TS}`, `NTC${TS}`],
  );
  cTenantId = cTR.rows[0].id;

  const cCR = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1,$2) RETURNING id`,
    [cTenantId, `Campus-NIT-Clean-${TS}`],
  );
  cCampusId = cCR.rows[0].id;

  const cUR = await pool.query(
    `INSERT INTO users (tenant_id, campus_id, name, email, password_hash, role, is_active)
     VALUES ($1,$2,$3,$4,'hash','administrador_campus',true) RETURNING id`,
    [cTenantId, cCampusId, `Admin NIT Clean ${TS}`, `admin.clean.${TS}@test.mx`],
  );
  tokClean = makeToken(cUR.rows[0].id, "administrador_campus", cCampusId, cTenantId);
});

afterAll(async () => {
  if (tPrevPayIds.length)  await pool.query(`DELETE FROM payments WHERE id = ANY($1::int[])`, [tPrevPayIds]).catch(() => {});
  const allCharges = [...tPrevChargeIds, ...tCurrChargeIds];
  if (allCharges.length)   await pool.query(`DELETE FROM charges  WHERE id = ANY($1::int[])`, [allCharges]).catch(() => {});
  if (tStudentIds.length)  await pool.query(`DELETE FROM students WHERE id = ANY($1::int[])`, [tStudentIds]).catch(() => {});
  if (tConceptId)          await pool.query(`DELETE FROM concepts  WHERE campus_id = $1`, [tCampusId]).catch(() => {});
  await pool.query(`DELETE FROM users    WHERE tenant_id = $1`, [tTenantId]).catch(() => {});
  await pool.query(`DELETE FROM campuses WHERE id = $1`,        [tCampusId]).catch(() => {});
  await pool.query(`DELETE FROM tenants  WHERE id = $1`,        [tTenantId]).catch(() => {});

  // clean campus
  await pool.query(`DELETE FROM users    WHERE tenant_id = $1`, [cTenantId]).catch(() => {});
  await pool.query(`DELETE FROM campuses WHERE id = $1`,        [cCampusId]).catch(() => {});
  await pool.query(`DELETE FROM tenants  WHERE id = $1`,        [cTenantId]).catch(() => {});
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getConsejo(token: string, qs = ""): Promise<{ status: number; body: any }> {
  const base = `/api/reportes/consejo?fecha_desde=${currStart}&fecha_hasta=${currEnd}`;
  const r = await fetch(`${BASE}${base}${qs ? "&" + qs : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

async function getRiesgo(token: string): Promise<{ status: number; body: any }> {
  const r = await fetch(`${BASE}/api/reportes/riesgo`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("NIT — Panel Narrativo generateNarrativeInsights", () => {

  // Llamada base compartida: la hacemos una vez y verificamos cada regla en
  // tests separados (el orden garantizado por fileParallelism:false).
  let trigInsights: any[] = [];

  it("precondición: GET /api/reportes/consejo → 200 con campo insights", async () => {
    const { status, body } = await getConsejo(tokTrigAdmin);
    expect(status, `status inesperado: ${JSON.stringify(body)}`).toBe(200);
    expect(Array.isArray(body.insights), "insights debe ser array").toBe(true);
    trigInsights = body.insights;
  });

  // ── NIT-01: NI-01 — concentración por nivel ─────────────────────────────────
  it("NIT-01: NI-01 fires — Primaria concentra ≥75% del adeudo → critico", () => {
    const ni01 = trigInsights.find((i: any) => i.regla === "NI-01");
    expect(ni01, "NI-01 debe estar en insights").toBeTruthy();
    expect(ni01.severidad).toBe("critico");
    // pct = round(3000000/3010000*100) = 100
    expect(ni01.dato_numerico).toBe(100);
    expect(ni01.dato_label).toContain("Primaria");
    expect(ni01.texto).toMatch(/100%/);
  });

  // ── NIT-02: NI-02 — antigüedad de cartera ────────────────────────────────────
  it("NIT-02: NI-02 fires — mora_90d ≥50% de cartera → critico", () => {
    const ni02 = trigInsights.find((i: any) => i.regla === "NI-02");
    expect(ni02, "NI-02 debe estar en insights").toBeTruthy();
    expect(ni02.severidad).toBe("critico");
    // pct = round(2400000/3010000*100) = 80
    expect(ni02.dato_numerico).toBe(80);
    expect(ni02.texto).toMatch(/80%/);
  });

  // ── NIT-03: NI-03 — alumnos en semáforo rojo ─────────────────────────────────
  it("NIT-03: NI-03 fires — 5 alumnos rojo → atencion", () => {
    const ni03 = trigInsights.find((i: any) => i.regla === "NI-03");
    expect(ni03, "NI-03 debe estar en insights").toBeTruthy();
    expect(ni03.severidad).toBe("atencion");
    expect(ni03.dato_numerico).toBe(5);
    expect(ni03.texto).toMatch(/5 alumnos/);
  });

  // ── NIT-04: NI-04 — caída en tasa de cobranza ────────────────────────────────
  it("NIT-04: NI-04 fires — caída 100 pp (de 100% a 0%) → critico", () => {
    const ni04 = trigInsights.find((i: any) => i.regla === "NI-04");
    expect(ni04, "NI-04 debe estar en insights").toBeTruthy();
    expect(ni04.severidad).toBe("critico");
    expect(ni04.dato_numerico).toBe(100);
    expect(ni04.texto).toMatch(/100 pp/);
    expect(ni04.texto).toMatch(/100%.*0%|0%.*100%/);
  });

  // ── NIT-05: NI-05 — deudores críticos ────────────────────────────────────────
  it("NIT-05: NI-05 fires — 4 familias con >$5000 y >60 días → atencion", () => {
    const ni05 = trigInsights.find((i: any) => i.regla === "NI-05");
    expect(ni05, "NI-05 debe estar en insights").toBeTruthy();
    expect(ni05.severidad).toBe("atencion");
    expect(ni05.dato_numerico).toBe(4);
    expect(ni05.texto).toMatch(/4 familias/);
  });

  // ── NIT-06: campus sin cargos → insights vacío ────────────────────────────────
  it("NIT-06: campus limpio → insights = [] (zero alertas)", async () => {
    const { status, body } = await getConsejo(tokClean);
    expect(status).toBe(200);
    expect(Array.isArray(body.insights)).toBe(true);
    expect(
      body.insights.length,
      `Campus limpio no debería tener insights, pero tiene: ${JSON.stringify(body.insights)}`,
    ).toBe(0);
  });

  // ── NIT-07: consistencia NI-03 con GET /api/reportes/riesgo ──────────────────
  it("NIT-07: NI-03 count coincide exactamente con resumen.rojo.count de RPT-08", async () => {
    const ni03 = trigInsights.find((i: any) => i.regla === "NI-03");
    expect(ni03, "NI-03 debe existir en los insights del campus trigger").toBeTruthy();

    const { status: rsgStatus, body: rsgBody } = await getRiesgo(tokTrigAdmin);
    expect(rsgStatus, `RPT-08 status inesperado: ${JSON.stringify(rsgBody)}`).toBe(200);

    const rsgRojo = (rsgBody.resumen as any[]).find((r: any) => r.semaforo === "rojo");
    expect(rsgRojo, "RPT-08 debe tener entrada rojo en resumen").toBeTruthy();

    expect(
      ni03.dato_numerico,
      `NI-03 count=${ni03.dato_numerico} != RPT-08 rojo.count_alumnos=${rsgRojo?.count_alumnos}. ` +
      `Divergencia: ambos deben usar exactamente computeRiesgoScore().`,
    ).toBe(rsgRojo.count_alumnos);
  });

});
