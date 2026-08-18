/**
 * RPT-08 — Reporte de Riesgo de Cobranza
 *
 * GET  /api/reportes/riesgo          guard RECEIVABLES.READ
 * POST /api/reportes/riesgo/exportar guard REPORTS.EXPORT
 *
 * ─── Scoring (computeRiesgoScore — exportado de conciliacion.ts) ──────────────
 *
 *   score = 100
 *   - MIN(diasVencido, 40)              si diasVencido > 0
 *   - 20                                si adeudo > 500 000 ¢
 *     ó 10                              si adeudo > 200 000 ¢
 *   - (100 - tasaPago) × 0.3
 *   Redondeado y acotado [0, 100].
 *   semáforo: score ≥ 75 → verde  |  ≥ 50 → amarillo  |  < 50 → rojo
 *
 * ─── Fixture (campus aislado por TS) ─────────────────────────────────────────
 *
 *   sRojo     nivel='primaria'     grado='1' grupo='A' ciclo='2025-2026'
 *             cargo pendiente hoy−41d, monto=600 000 ¢ (> 500 000)
 *             sin pagos → tasa=0  → score = 100−40−20−30 = 10  → rojo
 *
 *   sAmarillo nivel='secundaria'   grado='2' grupo='B' ciclo='2025-2026'
 *             cargo pendiente hoy−20d, monto=50 000 ¢ (< 200 000)
 *             sin pagos → tasa=0  → score = 100−20−0−30 = 50   → amarillo
 *
 *   sVerde    nivel='preparatoria' grado='3' grupo='C' ciclo='2026-2027'
 *             cargo estado='pagado' (creado ahora) + payment exitoso (creado ahora)
 *             → adeudo=0, dias_vencido=0, tasa_pago=100%
 *             → score = 100−0−0−0 = 100 → verde
 *
 * ─── Tests ────────────────────────────────────────────────────────────────────
 *
 *   RSG-01  sin token                          → 401
 *   RSG-02  rol sin RECEIVABLES.READ           → 403
 *   RSG-03  asistente (RECEIVABLES.READ)       → 200
 *   RSG-04  admin → 200 + {resumen, detalle, total_adeudo_centavos, filters}
 *   RSG-05  resumen contiene exactamente 3 entries (rojo/amarillo/verde)
 *   RSG-06  detalle incluye los 3 alumnos del fixture
 *   RSG-07  filtro semáforo=rojo    → solo sRojo    en detalle
 *   RSG-08  filtro semáforo=amarillo → solo sAmarillo
 *   RSG-09  filtro semáforo=verde   → solo sVerde
 *   RSG-10  resumen.rojo.monto_centavos = Σ detalle[rojo].adeudo_centavos
 *   RSG-11  filtro nivel=primaria    → solo sRojo
 *   RSG-12  filtro grupo=B          → solo sAmarillo
 *   RSG-13  filtro ciclo=2026-2027  → solo sVerde
 *   RSG-14  score consistency: RPT-08 devuelve mismo score que computeRiesgoScore() JS
 *   RSG-15  exportar Excel → 200 + magic bytes PK
 *   RSG-16  exportar PDF   → 200 + magic bytes %PDF
 *   RSG-17  sin REPORTS.EXPORT → 403 al intentar exportar
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import { pool } from "../db";
import { computeRiesgoScore } from "../routes/conciliacion";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── Estado compartido ─────────────────────────────────────────────────────────

const TS = Date.now().toString().slice(-6);

let tenantId:    number;
let campusId:    number;
let conceptId:   number;

let sIdRojo:     number;
let sIdAmarillo: number;
let sIdVerde:    number;

let chIdRojo:     number;
let chIdAmarillo: number;
let chIdVerde:    number; // estado='pagado'
let pIdVerde:     number; // payment para sVerde

let tokAdmin:        string; // administrador_campus  — RECEIVABLES.READ + REPORTS.EXPORT
let tokAsistente:    string; // asistente            — RECEIVABLES.READ, sin REPORTS.EXPORT
let tokSinPermisos:  string; // rol inexistente       — sin ningún permiso

function makeToken(userId: number, role: string): string {
  return jwt.sign(
    { id: userId, email: `u${userId}@rsg${TS}.test`, role,
      campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const bcrypt = await import("bcrypt");
  const hash   = await bcrypt.hash("Test2025!", 10);

  const tR = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`RPT08 Tenant ${TS}`, `R8T${TS}`],
  );
  tenantId = tR.rows[0].id;

  const cR = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1,$2) RETURNING id`,
    [tenantId, `Campus-RPT08-${TS}`],
  );
  campusId = cR.rows[0].id;

  async function createUser(name: string, role: string, pfx: string): Promise<number> {
    const r = await pool.query(
      `INSERT INTO users (tenant_id, campus_id, name, email, password_hash, role, is_active, custom_permissions)
       VALUES ($1,$2,$3,$4,$5,$6,true,'{}') RETURNING id`,
      [tenantId, campusId, name, `${pfx}.${TS}@rsg.test`, hash, role],
    );
    return r.rows[0].id as number;
  }

  const adminId = await createUser("Admin RSG",    "administrador_campus", "adm");
  const asiId   = await createUser("Asist RSG",    "auxiliar_contable",   "asi");
  const sinId   = await createUser("SinPerm RSG",  "bodega",              "sin"); // rol inexistente

  tokAdmin       = makeToken(adminId, "administrador_campus");
  tokAsistente   = makeToken(asiId,   "auxiliar_contable");
  tokSinPermisos = makeToken(sinId,   "bodega");

  // Concepto compartido
  const coR = await pool.query(
    `INSERT INTO concepts (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1,$2,$3,'ingreso','mensual',10000) RETURNING id`,
    [campusId, tenantId, `Colegiatura-RSG-${TS}`],
  );
  conceptId = coR.rows[0].id;

  async function insertStudent(nombre: string, nivel: string, grado: string, grupo: string): Promise<number> {
    const r = await pool.query(
      `INSERT INTO students
         (tenant_id, campus_id, nombres, apellido_paterno, nombre_completo,
          id_referencia, nivel_escolar, grado, grupo, status)
       VALUES ($1,$2,$3,'RSG-${TS}',$4,$5,$6,$7,$8,'activo') RETURNING id`,
      [tenantId, campusId, nombre, `${nombre} RSG-${TS}`, `REF-${nombre}-${TS}`, nivel, grado, grupo],
    );
    return r.rows[0].id as number;
  }

  // ── sRojo: pendiente 41 días, monto > 500 000 ¢ ───────────────────────────
  sIdRojo    = await insertStudent("AluRojo",    "primaria",     "1", "A");
  const emRojo = daysAgo(71); // emision 30 días antes
  const vcRojo = daysAgo(41);
  const chRojo = await pool.query(
    `INSERT INTO charges
       (tenant_id, student_id, concept_id, ciclo_escolar,
        fecha_emision, fecha_vencimiento,
        monto_base_centavos, beca_aplicada, recargo_aplicado_centavos, estado)
     VALUES ($1,$2,$3,'2025-2026',$4,$5,600000,'0',0,'pendiente') RETURNING id`,
    [tenantId, sIdRojo, conceptId, emRojo, vcRojo],
  );
  chIdRojo = chRojo.rows[0].id;

  // ── sAmarillo: pendiente 20 días, monto < 200 000 ¢ ──────────────────────
  sIdAmarillo = await insertStudent("AluAmarillo", "secundaria",  "2", "B");
  const emAmar = daysAgo(50);
  const vcAmar = daysAgo(20);
  const chAmar = await pool.query(
    `INSERT INTO charges
       (tenant_id, student_id, concept_id, ciclo_escolar,
        fecha_emision, fecha_vencimiento,
        monto_base_centavos, beca_aplicada, recargo_aplicado_centavos, estado)
     VALUES ($1,$2,$3,'2025-2026',$4,$5,50000,'0',0,'pendiente') RETURNING id`,
    [tenantId, sIdAmarillo, conceptId, emAmar, vcAmar],
  );
  chIdAmarillo = chAmar.rows[0].id;

  // ── sVerde: cargo pagado + payment → tasa=100%, adeudo=0, score=100 ────────
  sIdVerde   = await insertStudent("AluVerde",   "preparatoria", "3", "C");
  const emVerde = daysAgo(30);
  const vcVerde = daysAgo(1); // venció ayer pero está pagado
  const chVerde = await pool.query(
    `INSERT INTO charges
       (tenant_id, student_id, concept_id, ciclo_escolar,
        fecha_emision, fecha_vencimiento,
        monto_base_centavos, beca_aplicada, recargo_aplicado_centavos, estado)
     VALUES ($1,$2,$3,'2026-2027',$4,$5,10000,'0',0,'pagado') RETURNING id`,
    [tenantId, sIdVerde, conceptId, emVerde, vcVerde],
  );
  chIdVerde = chVerde.rows[0].id;

  // Payment asociado al cargo pagado → tasa_pago_historica=100%
  const pVerde = await pool.query(
    `INSERT INTO payments (tenant_id, charge_id, metodo, monto_centavos, estado)
     VALUES ($1,$2,'transferencia',10000,'exitoso') RETURNING id`,
    [tenantId, chIdVerde],
  );
  pIdVerde = pVerde.rows[0].id;
});

afterAll(async () => {
  if (pIdVerde)     await pool.query(`DELETE FROM payments WHERE id=$1`,  [pIdVerde]).catch(() => {});
  for (const id of [chIdRojo, chIdAmarillo, chIdVerde]) {
    if (id) await pool.query(`DELETE FROM charges WHERE id=$1`, [id]).catch(() => {});
  }
  for (const id of [sIdRojo, sIdAmarillo, sIdVerde]) {
    if (id) await pool.query(`DELETE FROM students WHERE id=$1`, [id]).catch(() => {});
  }
  if (conceptId) await pool.query(`DELETE FROM concepts WHERE id=$1`, [conceptId]).catch(() => {});
  await pool.query(`DELETE FROM users    WHERE tenant_id=$1`, [tenantId]).catch(() => {});
  await pool.query(`DELETE FROM campuses WHERE id=$1`,        [campusId]).catch(() => {});
  await pool.query(`DELETE FROM tenants  WHERE id=$1`,        [tenantId]).catch(() => {});
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const H = (t: string) => ({ Authorization: `Bearer ${t}`, "Content-Type": "application/json" });

async function getRSG(params: string, token: string) {
  const url = `${BASE}/api/reportes/riesgo${params ? `?${params}` : ""}`;
  const r   = await fetch(url, { headers: H(token) });
  const body = r.status !== 204 ? await r.json().catch(() => ({})) : {};
  return { status: r.status, body };
}

async function postExportar(token: string, format: string) {
  const r = await fetch(`${BASE}/api/reportes/riesgo/exportar`, {
    method:  "POST",
    headers: H(token),
    body:    JSON.stringify({ formato: format }),
  });
  return { status: r.status, headers: r.headers, buf: Buffer.from(await r.arrayBuffer()) };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RPT-08 — Reporte de Riesgo de Cobranza", () => {

  // ── Guards ──────────────────────────────────────────────────────────────────

  it("RSG-01: sin token → 401", async () => {
    const r = await fetch(`${BASE}/api/reportes/riesgo`);
    expect(r.status).toBe(401);
  });

  it("RSG-02: rol sin RECEIVABLES.READ → 403", async () => {
    const { status } = await getRSG("", tokSinPermisos);
    expect(status).toBe(403);
  });

  it("RSG-03: asistente (RECEIVABLES.READ) → 200", async () => {
    const { status } = await getRSG("", tokAsistente);
    expect(status).toBe(200);
  });

  // ── Forma de la respuesta ───────────────────────────────────────────────────

  it("RSG-04: admin → 200 + {resumen, detalle, total_adeudo_centavos, filters}", async () => {
    const { status, body } = await getRSG("", tokAdmin);
    expect(status).toBe(200);
    expect(Array.isArray(body.resumen)).toBe(true);
    expect(Array.isArray(body.detalle)).toBe(true);
    expect(typeof body.total_adeudo_centavos).toBe("number");
    expect(body.filters).toBeDefined();
  });

  it("RSG-05: resumen contiene exactamente 3 entries (rojo/amarillo/verde)", async () => {
    const { body } = await getRSG("", tokAdmin);
    expect(body.resumen.length).toBe(3);
    const colores = body.resumen.map((r: any) => r.semaforo).sort();
    expect(colores).toEqual(["amarillo", "rojo", "verde"]);
  });

  it("RSG-06: detalle incluye los 3 alumnos del fixture", async () => {
    const { body } = await getRSG("", tokAdmin);
    const ids = body.detalle.map((r: any) => r.student_id);
    expect(ids).toContain(sIdRojo);
    expect(ids).toContain(sIdAmarillo);
    expect(ids).toContain(sIdVerde);
  });

  // ── Filtros de semáforo ─────────────────────────────────────────────────────

  it("RSG-07: filtro semáforo=rojo → solo sRojo en detalle del fixture", async () => {
    const { body } = await getRSG("semaforo=rojo", tokAdmin);
    const ids = body.detalle.map((r: any) => r.student_id);
    expect(ids).toContain(sIdRojo);
    expect(ids).not.toContain(sIdAmarillo);
    expect(ids).not.toContain(sIdVerde);
    // resumen: verde y amarillo = 0 alumnos del fixture
    const resR = body.resumen.find((r: any) => r.semaforo === "rojo");
    expect(resR.count_alumnos).toBeGreaterThanOrEqual(1);
  });

  it("RSG-08: filtro semáforo=amarillo → solo sAmarillo en detalle del fixture", async () => {
    const { body } = await getRSG("semaforo=amarillo", tokAdmin);
    const ids = body.detalle.map((r: any) => r.student_id);
    expect(ids).toContain(sIdAmarillo);
    expect(ids).not.toContain(sIdRojo);
    expect(ids).not.toContain(sIdVerde);
  });

  it("RSG-09: filtro semáforo=verde → solo sVerde en detalle del fixture", async () => {
    const { body } = await getRSG("semaforo=verde", tokAdmin);
    const ids = body.detalle.map((r: any) => r.student_id);
    expect(ids).toContain(sIdVerde);
    expect(ids).not.toContain(sIdRojo);
    expect(ids).not.toContain(sIdAmarillo);
  });

  // ── Consistencia resumen ↔ detalle ─────────────────────────────────────────

  it("RSG-10: resumen.rojo.monto_centavos = Σ detalle[rojo].adeudo_centavos", async () => {
    const { body } = await getRSG("", tokAdmin);
    const sumaDetalle = (body.detalle as any[])
      .filter((r: any) => r.semaforo === "rojo")
      .reduce((acc: number, r: any) => acc + r.adeudo_centavos, 0);
    const resR = body.resumen.find((r: any) => r.semaforo === "rojo");
    expect(resR.monto_centavos).toBe(sumaDetalle);
    // Verificamos contra el fixture: sRojo tiene 600 000 ¢
    expect(sumaDetalle).toBeGreaterThanOrEqual(600_000);
  });

  // ── Filtros server-side ─────────────────────────────────────────────────────

  it("RSG-11: filtro nivel=primaria → solo sRojo del fixture (nivel único en primaria)", async () => {
    const { body } = await getRSG("nivel=primaria", tokAdmin);
    const ids = body.detalle.map((r: any) => r.student_id);
    expect(ids).toContain(sIdRojo);
    expect(ids).not.toContain(sIdAmarillo);
    expect(ids).not.toContain(sIdVerde);
  });

  it("RSG-12: filtro grupo=B → solo sAmarillo del fixture (grupo único B)", async () => {
    const { body } = await getRSG("grupo=B", tokAdmin);
    const ids = body.detalle.map((r: any) => r.student_id);
    expect(ids).toContain(sIdAmarillo);
    expect(ids).not.toContain(sIdRojo);
    expect(ids).not.toContain(sIdVerde);
  });

  it("RSG-13: filtro ciclo=2026-2027 → solo sVerde del fixture (ciclo único 2026-2027)", async () => {
    const { body } = await getRSG("ciclo=2026-2027", tokAdmin);
    const ids = body.detalle.map((r: any) => r.student_id);
    expect(ids).toContain(sIdVerde);
    expect(ids).not.toContain(sIdRojo);
    expect(ids).not.toContain(sIdAmarillo);
  });

  // ── Consistencia de score con la fórmula canónica ──────────────────────────

  it("RSG-14: score del reporte = computeRiesgoScore() JS (misma fórmula que semáforo)", async () => {
    const { body } = await getRSG("", tokAdmin);

    const rowRojo = (body.detalle as any[]).find((r: any) => r.student_id === sIdRojo);
    expect(rowRojo, "sRojo no encontrado en detalle").toBeDefined();

    // Reproducir el score con la función exportada
    const { score: expectedScore, semaforo: expectedSemaforo } = computeRiesgoScore({
      diasVencido:    rowRojo.dias_vencido,
      adeudoCentavos: rowRojo.adeudo_centavos,
      tasaPago:       rowRojo.tasa_pago_historica,
    });

    expect(rowRojo.score).toBe(expectedScore);
    expect(rowRojo.semaforo).toBe(expectedSemaforo);

    // Verificación de valores absolutos para el fixture conocido
    // diasVencido ≈ 41, adeudo = 600 000, tasa = 0
    // score = 100 − 40 − 20 − 30 = 10 → rojo
    expect(rowRojo.score).toBe(10);
    expect(rowRojo.semaforo).toBe("rojo");
  });

  // ── Exportación con magic bytes ─────────────────────────────────────────────

  it("RSG-15: exportar Excel → 200 + magic bytes PK (xlsx real)", async () => {
    const { status, buf } = await postExportar(tokAdmin, "excel");
    expect(status).toBe(200);
    expect(buf.length).toBeGreaterThan(4);
    expect(buf.slice(0, 2).toString("utf8")).toBe("PK");
  });

  it("RSG-16: exportar PDF → 200 + magic bytes %PDF (pdf real)", async () => {
    const { status, buf } = await postExportar(tokAdmin, "pdf");
    expect(status).toBe(200);
    expect(buf.length).toBeGreaterThan(4);
    expect(buf.slice(0, 4).toString("utf8")).toBe("%PDF");
  });

  it("RSG-17: asistente POST exportar → 403 (sin REPORTS.EXPORT)", async () => {
    const { status } = await postExportar(tokAsistente, "excel");
    expect(status).toBe(403);
  });
});
