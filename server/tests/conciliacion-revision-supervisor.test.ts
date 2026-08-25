/**
 * conciliacion-revision-supervisor.test.ts
 *
 * Pruebas para la cola de revisión de supervisor (score 90-99, ventana 24h).
 *
 * CSC-09  score=100 → auto-aplica, en_revision=0 en respuesta,
 *          NO aparece en /api/conciliacion/revision-supervisor
 * CSC-10  score=90  → auto-aplica, en_revision=1 en respuesta,
 *          SÍ aparece en cola; conciliado_at escrito en DB
 * CSC-11  score=90 pero conciliado_at > 24h → NO aparece en cola (ventana expirada)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

// CLABE exclusiva de este archivo para no colisionar con conciliacion-scoring.test.ts
const CLABE_100 = "002180077000001111"; // usada para score=100
const CLABE_90  = "002180077000002222"; // usada para score=90

let tenantId:  number;
let campusId:  number;
let conceptId: number;
let studentId: number;
let guardianId: number;
let familyId:  number;
let adminToken: string;

function makeToken() {
  return jwt.sign(
    { role: "administrador_campus", campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET, { expiresIn: "1h" }
  );
}

async function httpPost(path: string, body: object, token: string) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

async function httpGet(path: string, token: string) {
  return fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function mkCharge(montoCentavos: number): Promise<number> {
  const r = await pool.query(
    `INSERT INTO charges (tenant_id, student_id, concept_id, fecha_emision, fecha_vencimiento,
                          monto_base_centavos, estado)
     VALUES ($1,$2,$3,CURRENT_DATE,CURRENT_DATE+30,$4,'pendiente') RETURNING id`,
    [tenantId, studentId, conceptId, montoCentavos]
  );
  return r.rows[0].id;
}

async function mkBankTx(
  montoCentavos: number,
  opts: { clabe?: string; nombre?: string } = {}
): Promise<number> {
  const r = await pool.query(
    `INSERT INTO bank_transactions
       (campus_id, tenant_id, fecha, descripcion, monto_centavos, tipo,
        clabe_ordenante, nombre_ordenante, estado_conciliacion)
     VALUES ($1,$2,CURRENT_DATE,'TX revision test',$3,'credito',$4,$5,'pendiente')
     RETURNING id`,
    [campusId, tenantId, montoCentavos, opts.clabe ?? null, opts.nombre ?? null]
  );
  return r.rows[0].id;
}

async function seedFps(clabe: string, confirmaciones: number) {
  await pool.query(
    `INSERT INTO family_payment_sources
       (tenant_id, family_id, clabe, nombre_inferido, confirmaciones, primera_vez_at, ultima_vez_at)
     VALUES ($1,$2,$3,NULL,$4,NOW(),NOW())
     ON CONFLICT (family_id, clabe) DO UPDATE SET confirmaciones=$4`,
    [tenantId, familyId, clabe, confirmaciones]
  );
}

// ── Setup / Teardown ──────────────────────────────────────────────────────────
beforeAll(async () => {
  const ts = Date.now().toString().slice(-7);

  const [ten] = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Revision Supervisor Test ${ts}`, `RST${ts}`]
  ).then(r => r.rows);
  tenantId = ten.id;

  const [cam] = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1,$2) RETURNING id`,
    [tenantId, `Campus Revision ${ts}`]
  ).then(r => r.rows);
  campusId = cam.id;

  const [con] = await pool.query(
    `INSERT INTO concepts (tenant_id, campus_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1,$2,'Cuota Revision','colegiatura','mensual',100000) RETURNING id`,
    [tenantId, campusId]
  ).then(r => r.rows);
  conceptId = con.id;

  const [stu] = await pool.query(
    `INSERT INTO students (tenant_id, campus_id, nombres, apellido_paterno, nombre_completo, status)
     VALUES ($1,$2,'Alumno','Revision','Alumno Revision ${ts}','activo') RETURNING id`,
    [tenantId, campusId]
  ).then(r => r.rows);
  studentId = stu.id;

  // Guardian: "Perez Lopez Juan Carlos" — se usa en score=100 (Jaccard=1.0 con "JUAN CARLOS PEREZ LOPEZ")
  const [grd] = await pool.query(
    `INSERT INTO guardians (tenant_id, campus_id, nombres, apellido_paterno, nombre_completo,
                            email, correo_institucional_familiar)
     VALUES ($1,$2,'Juan Carlos','Perez','Juan Carlos Perez Lopez',$3,$4) RETURNING id`,
    [tenantId, campusId, `jcpl-${ts}@test.com`, `jcpl-${ts}@test.com`]
  ).then(r => r.rows);
  guardianId = grd.id;

  const [fam] = await pool.query(
    `INSERT INTO families (tenant_id, campus_id, nombre, guardian_id_principal)
     VALUES ($1,$2,'Familia Revision Test',$3) RETURNING id`,
    [tenantId, campusId, guardianId]
  ).then(r => r.rows);
  familyId = fam.id;

  await pool.query(
    `INSERT INTO family_students (family_id, student_id) VALUES ($1,$2)`,
    [familyId, studentId]
  );
  await pool.query(
    `INSERT INTO student_guardian (student_id, guardian_id) VALUES ($1,$2)`,
    [studentId, guardianId]
  );

  adminToken = makeToken();
});

afterAll(async () => {
  // Orden: bank_tx → payment_applications → payments → charges → FPS → familia → alumno/tutor → concept
  await pool.query(`DELETE FROM bank_transactions WHERE campus_id=$1`, [campusId]);
  await pool.query(
    `DELETE FROM payment_applications WHERE payment_id IN
       (SELECT id FROM payments WHERE tenant_id=$1)`, [tenantId]
  );
  await pool.query(`DELETE FROM payments WHERE tenant_id=$1`, [tenantId]);
  await pool.query(`DELETE FROM charges WHERE tenant_id=$1`, [tenantId]);
  await pool.query(`DELETE FROM family_students WHERE family_id=$1`, [familyId]);
  await pool.query(`DELETE FROM student_guardian WHERE student_id=$1`, [studentId]);
  await pool.query(`DELETE FROM families WHERE id=$1`, [familyId]);
  await pool.query(`DELETE FROM guardians WHERE id=$1`, [guardianId]);
  await pool.query(`DELETE FROM students WHERE id=$1`, [studentId]);
  await pool.query(`DELETE FROM concepts WHERE id=$1`, [conceptId]);
  await pool.query(`DELETE FROM campuses WHERE id=$1`, [campusId]);
  await pool.query(`DELETE FROM tenants WHERE id=$1`, [tenantId]);
});

// ── CSC-09: score=100 → en_revision=0, NO aparece en cola ────────────────────
it("CSC-09: score=100 → auto-aplica sin revisión, no aparece en cola de supervisor", async () => {
  // Configurar CLABE_100 con confirmaciones=2: clabe_score=20
  // Guardian "Juan Carlos Perez Lopez" + nombre_ordenante "JUAN CARLOS PEREZ LOPEZ"
  // Tokens: [JUAN, CARLOS, PEREZ, LOPEZ] (ambos) → Jaccard=1.0 → nombre_score=15
  // Total: 70 (monto exacto) + 20 (clabe conf≥2) + 15 (nombre) = 105 → cap 100
  await seedFps(CLABE_100, 2);

  const chargeId = await mkCharge(100_000);
  const txId = await mkBankTx(100_000, {
    clabe:  CLABE_100,
    nombre: "JUAN CARLOS PEREZ LOPEZ",
  });

  const rMatch = await httpPost(`/api/conciliacion/auto-match/${campusId}`, {}, adminToken);
  expect(rMatch.status).toBe(200);
  const matchBody = await rMatch.json() as any;

  expect(matchBody.conciliados).toBeGreaterThanOrEqual(1);
  expect(matchBody.en_revision, "score=100 no debe incrementar en_revision").toBe(0);

  // DB: confianza_pct = 100, conciliado_at escrito
  const txRow = await pool.query(
    `SELECT confianza_pct, conciliado_at, estado_conciliacion FROM bank_transactions WHERE id=$1`,
    [txId]
  );
  expect(txRow.rows[0].confianza_pct).toBe(100);
  expect(txRow.rows[0].conciliado_at, "conciliado_at debe escribirse").not.toBeNull();

  // Cola de revisión: NO debe contener esta tx (score=100 excluido por la query 90-99)
  const rQueue = await httpGet(`/api/conciliacion/revision-supervisor`, adminToken);
  expect(rQueue.status).toBe(200);
  const queueBody = await rQueue.json() as any;
  const enCola = (queueBody.items as any[]).some((item: any) => item.id === txId);
  expect(enCola, "score=100 no debe aparecer en la cola de revisión").toBe(false);
});

// ── CSC-10: score=90 → auto-aplica con en_revision=1, SÍ aparece en cola ──────
// ── CSC-11: misma tx pero conciliado_at > 24h → ya NO aparece en cola ────────
it("CSC-10/CSC-11: score=90 → en cola; conciliado_at backdateado 25h → sale de cola", async () => {
  // CLABE_90 con confirmaciones=2: clabe_score=20
  // Sin nombre_ordenante: nombre_score=0
  // Total: 70 (monto exacto) + 20 (clabe conf≥2) + 0 = 90 → 90 ∈ [90,99]
  await seedFps(CLABE_90, 2);

  const chargeId = await mkCharge(100_000);
  const txId = await mkBankTx(100_000, { clabe: CLABE_90 }); // sin nombre

  // ── CSC-10 ────────────────────────────────────────────────────────────────
  const rMatch = await httpPost(`/api/conciliacion/auto-match/${campusId}`, {}, adminToken);
  expect(rMatch.status).toBe(200);
  const matchBody = await rMatch.json() as any;

  expect(matchBody.conciliados).toBeGreaterThanOrEqual(1);
  expect(matchBody.en_revision, "score=90 debe incrementar en_revision").toBeGreaterThanOrEqual(1);

  // DB: confianza_pct=90, conciliado_at escrito
  const txRow = await pool.query(
    `SELECT confianza_pct, conciliado_at FROM bank_transactions WHERE id=$1`, [txId]
  );
  expect(txRow.rows[0].confianza_pct).toBe(90);
  expect(txRow.rows[0].conciliado_at).not.toBeNull();

  // Cola: tx DEBE aparecer (conciliado_at = NOW(), dentro de 24h)
  const rQueue1 = await httpGet(`/api/conciliacion/revision-supervisor`, adminToken);
  const qBody1 = await rQueue1.json() as any;
  const enCola = (qBody1.items as any[]).some((item: any) => item.id === txId);
  expect(enCola, "CSC-10: score=90 debe aparecer en la cola de revisión").toBe(true);

  // ── CSC-11: simular expiración de la ventana de 24h ──────────────────────
  await pool.query(
    `UPDATE bank_transactions SET conciliado_at = NOW() - INTERVAL '25 hours' WHERE id=$1`,
    [txId]
  );

  const rQueue2 = await httpGet(`/api/conciliacion/revision-supervisor`, adminToken);
  const qBody2 = await rQueue2.json() as any;
  const enCola2 = (qBody2.items as any[]).some((item: any) => item.id === txId);
  expect(enCola2, "CSC-11: tras 25h la tx debe salir de la cola automáticamente").toBe(false);
});
