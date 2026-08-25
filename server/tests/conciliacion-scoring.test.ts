/**
 * conciliacion-scoring.test.ts
 *
 * Pruebas de integración del motor de scoring de conciliación bancaria.
 *
 * CSC-01  jaccardNombre — normalización y similitud correctas
 * CSC-02  _montoScore   — tabla completa de scores
 * CSC-03  Hermanos: manual resolver con tx por la suma → 422 (bug pre-fix confirmado)
 * CSC-04  Hermanos: auto-match detecta la combinación → sugerencias con score 70
 * CSC-05  Curva aprendizaje paso 1: primera txn sin CLABE → score 70 → sugerencia
 *           operador confirma → family_payment_sources.confirmaciones = 1
 * CSC-06  Curva aprendizaje paso 2: segunda txn misma CLABE (conf=1) → score 85 → sugerencia
 *           operador confirma → confirmaciones = 2
 * CSC-07  Curva aprendizaje paso 3: tercera txn misma CLABE (conf=2) → score 90 → auto-aplica
 * CSC-08  Regresión: pago simple, CLABE conf≥2, nombre coincidente → score 100 → auto-aplica
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";

const BASE        = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";
const TEST_CLABE  = "002180099000001234"; // CLABE para curva de aprendizaje
const TEST_CLABE2 = "002180099000005678"; // CLABE para test de regresión (conf=2 manual)

// ── Fixtures compartidos ──────────────────────────────────────────────────────
let tenantId:   number;
let campusId:   number;
let conceptId:  number;
let studentId1: number; // hermano A
let studentId2: number; // hermano B
let guardianId: number;
let familyId:   number;
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

async function mkCharge(studentId: number, montoCentavos: number): Promise<number> {
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
     VALUES ($1,$2,CURRENT_DATE,'TX scoring test',$3,'credito',$4,$5,'pendiente')
     RETURNING id`,
    [campusId, tenantId, montoCentavos, opts.clabe ?? null, opts.nombre ?? null]
  );
  return r.rows[0].id;
}

async function cleanCharge(chargeId: number) {
  await pool.query(
    `DELETE FROM payment_applications WHERE charge_id=$1`, [chargeId]
  );
  await pool.query(
    `DELETE FROM payments WHERE charge_id=$1`, [chargeId]
  );
  await pool.query(`DELETE FROM charges WHERE id=$1`, [chargeId]);
}

async function cleanBankTx(txId: number) {
  await pool.query(`DELETE FROM bank_transactions WHERE id=$1`, [txId]);
}

// ── Setup / Teardown global ────────────────────────────────────────────────────
beforeAll(async () => {
  const ts = Date.now().toString().slice(-7);

  const [tenRow] = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Scoring Test ${ts}`, `SCT${ts}`]
  ).then(r => r.rows);
  tenantId = tenRow.id;

  const [camRow] = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1,$2) RETURNING id`,
    [tenantId, `Campus Scoring ${ts}`]
  ).then(r => r.rows);
  campusId = camRow.id;

  // Concepto base para todos los cargos del test
  const [conRow] = await pool.query(
    `INSERT INTO concepts (tenant_id, campus_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1,$2,'Colegiatura Scoring','colegiatura','mensual',100000) RETURNING id`,
    [tenantId, campusId]
  ).then(r => r.rows);
  conceptId = conRow.id;

  // Dos alumnos (hermanos)
  const [s1] = await pool.query(
    `INSERT INTO students (tenant_id, campus_id, nombres, apellido_paterno, nombre_completo, status)
     VALUES ($1,$2,'Ana','Hernandez','Ana Hernandez ${ts}','activo') RETURNING id`,
    [tenantId, campusId]
  ).then(r => r.rows);
  studentId1 = s1.id;

  const [s2] = await pool.query(
    `INSERT INTO students (tenant_id, campus_id, nombres, apellido_paterno, nombre_completo, status)
     VALUES ($1,$2,'Luis','Hernandez','Luis Hernandez ${ts}','activo') RETURNING id`,
    [tenantId, campusId]
  ).then(r => r.rows);
  studentId2 = s2.id;

  // Tutor — nombre diseñado para que Jaccard ≥ 0.70 vs "CARLOS HERNANDEZ GARCIA"
  const [gRow] = await pool.query(
    `INSERT INTO guardians (tenant_id, campus_id, nombres, apellido_paterno, nombre_completo,
                            email, correo_institucional_familiar)
     VALUES ($1,$2,'Carlos','Hernandez','Carlos Hernandez Garcia',$3,$4) RETURNING id`,
    [tenantId, campusId, `csg-${ts}@test.com`, `csg-${ts}@test.com`]
  ).then(r => r.rows);
  guardianId = gRow.id;

  // Familia (une ambos hermanos)
  const [fRow] = await pool.query(
    `INSERT INTO families (tenant_id, campus_id, nombre, guardian_id_principal)
     VALUES ($1,$2,'Familia Hernandez Test',$3) RETURNING id`,
    [tenantId, campusId, guardianId]
  ).then(r => r.rows);
  familyId = fRow.id;

  // Vincular alumnos a la familia
  await pool.query(
    `INSERT INTO family_students (family_id, student_id) VALUES ($1,$2),($1,$3)`,
    [familyId, studentId1, studentId2]
  );

  // Vincular tutor a ambos alumnos (para que el nombre aparezca en tutoresByFamilyId)
  await pool.query(
    `INSERT INTO student_guardian (student_id, guardian_id) VALUES ($1,$2),($3,$2)`,
    [studentId1, guardianId, studentId2]
  );

  adminToken = makeToken();
});

afterAll(async () => {
  // bank_transactions.payment_id tiene FK a payments — borrar bank_tx PRIMERO.
  await pool.query(`DELETE FROM bank_transactions WHERE campus_id=$1`, [campusId]);
  await pool.query(
    `DELETE FROM payment_applications WHERE payment_id IN
       (SELECT id FROM payments WHERE tenant_id=$1)`, [tenantId]
  );
  await pool.query(`DELETE FROM payments WHERE tenant_id=$1`, [tenantId]);
  await pool.query(`DELETE FROM charges WHERE tenant_id=$1`, [tenantId]);
  // family_payment_sources: CASCADE con family
  await pool.query(`DELETE FROM family_students WHERE family_id=$1`, [familyId]);
  await pool.query(`DELETE FROM student_guardian WHERE student_id IN ($1,$2)`,
    [studentId1, studentId2]);
  await pool.query(`DELETE FROM families WHERE id=$1`, [familyId]);
  await pool.query(`DELETE FROM guardians WHERE id=$1`, [guardianId]);
  await pool.query(`DELETE FROM students WHERE id IN ($1,$2)`, [studentId1, studentId2]);
  await pool.query(`DELETE FROM concepts WHERE id=$1`, [conceptId]);
  await pool.query(`DELETE FROM campuses WHERE id=$1`, [campusId]);
  await pool.query(`DELETE FROM tenants WHERE id=$1`, [tenantId]);
});

// ── CSC-01: jaccardNombre — prueba de normalización ────────────────────────────
describe("jaccardNombre — normalización y similitud", () => {
  it("CSC-01a: tokens idénticos → 1.0", async () => {
    // Validación empírica vía endpoint real: tx con nombre igual al tutor
    // y cargo exacto → nombre_score = 15 (jaccard ≥ 0.70)
    // Se prueba indirectamente porque jaccardNombre no es exportada.
    // El endpoint devuelve `detalle.nombre` en las sugerencias.
    const chargeId = await mkCharge(studentId1, 50000);
    const txId     = await mkBankTx(50000, { nombre: "CARLOS HERNANDEZ GARCIA" });
    try {
      const r = await httpPost(
        `/api/conciliacion/auto-match/${campusId}`, {}, adminToken
      );
      expect(r.status).toBe(200);
      const body = await r.json() as any;
      // La tx debe aparecer como sugerencia (score 70 monto + 0 clabe + 15 nombre = 85)
      const sug = (body.sugerencias as any[]).find((s: any) => s.tx_id === txId);
      expect(sug, "La tx con nombre coincidente debe aparecer como sugerencia").toBeDefined();
      expect(sug.detalle.nombre).toBe(15);
      expect(sug.score).toBe(85); // 70 monto + 0 clabe + 15 nombre
    } finally {
      await cleanBankTx(txId);
      await cleanCharge(chargeId);
    }
  });

  it("CSC-01b: tokens sin solapamiento → nombre_score = 0", async () => {
    const chargeId = await mkCharge(studentId1, 55000);
    const txId     = await mkBankTx(55000, { nombre: "PEREZ LOPEZ MARIO JOSE" }); // sin solapamiento
    try {
      const r = await httpPost(
        `/api/conciliacion/auto-match/${campusId}`, {}, adminToken
      );
      expect(r.status).toBe(200);
      const body = await r.json() as any;
      const sug = (body.sugerencias as any[]).find((s: any) => s.tx_id === txId);
      expect(sug, "Debe aparecer como sugerencia solo por monto").toBeDefined();
      expect(sug.detalle.nombre).toBe(0);
      expect(sug.score).toBe(70); // solo monto
    } finally {
      await cleanBankTx(txId);
      await cleanCharge(chargeId);
    }
  });
});

// ── CSC-02: _montoScore — tabla de scores ──────────────────────────────────────
describe("_montoScore — niveles de scoring de monto", () => {
  it("CSC-02a: cargo único monto exacto → monto_score=70 (score total ≥ 70)", async () => {
    const chargeId = await mkCharge(studentId1, 75000);
    const txId     = await mkBankTx(75000);
    try {
      const r    = await httpPost(`/api/conciliacion/auto-match/${campusId}`, {}, adminToken);
      const body = await r.json() as any;
      const sug  = (body.sugerencias as any[]).find((s: any) => s.tx_id === txId);
      expect(sug).toBeDefined();
      expect(sug.detalle.monto).toBe(70);
    } finally {
      await cleanBankTx(txId);
      await cleanCharge(chargeId);
    }
  });

  it("CSC-02b: cargo único ±$0.50 (50 centavos) → monto_score=65 (nombre boost lleva a sugerencia)", async () => {
    // monto_score=65 por sí solo cae en el cubo 0-69 (aclaración, sin sugerencia).
    // Se agrega nombre coincidente → nombre_score=15 → total=80 → sugerencia visible.
    // Esto permite verificar que monto_score=65 se calculó correctamente.
    const chargeId = await mkCharge(studentId1, 76000);
    const txId     = await mkBankTx(76050, { nombre: "CARLOS HERNANDEZ GARCIA" }); // diff=50c
    try {
      const r    = await httpPost(`/api/conciliacion/auto-match/${campusId}`, {}, adminToken);
      const body = await r.json() as any;
      const sug  = (body.sugerencias as any[]).find((s: any) => s.tx_id === txId);
      expect(sug, "Debe aparecer como sugerencia (monto=65 + nombre=15 = 80)").toBeDefined();
      expect(sug.detalle.monto).toBe(65);   // ←  lo que se quiere verificar
      expect(sug.detalle.nombre).toBe(15);
      expect(sug.score).toBe(80);
    } finally {
      await cleanBankTx(txId);
      await cleanCharge(chargeId);
    }
  });
});

// ── CSC-03/04: Hermanos ────────────────────────────────────────────────────────
describe("Hermanos — bug pre-fix y resolución con nuevo motor", () => {
  let charge1Id: number;
  let charge2Id: number;
  let sumaTxId:  number;
  const MONTO_A = 80_000; // centavos
  const MONTO_B = 120_000;
  const SUMA    = MONTO_A + MONTO_B; // 200,000

  beforeAll(async () => {
    charge1Id = await mkCharge(studentId1, MONTO_A);
    charge2Id = await mkCharge(studentId2, MONTO_B);
    sumaTxId  = await mkBankTx(SUMA); // tx por la suma exacta de ambos hermanos
  });

  afterAll(async () => {
    await cleanBankTx(sumaTxId);
    // Los cargos pueden haber sido marcados pagado por CSC-04 si auto-match los aplica
    // → cleanCharge maneja el caso de charges ya pagados
    await cleanCharge(charge1Id).catch(() => {});
    await cleanCharge(charge2Id).catch(() => {});
  });

  it("CSC-03: manual resolver con un solo charge_id → 422 (diff > $1)", async () => {
    // El operador intenta enlazar la tx de $2,000 al cargo de $800: diff=$1,200 > $1 → 422.
    // Esto reproduce el comportamiento antes del fix: la suma de hermanos no podía aplicarse.
    const r = await httpPost(
      `/api/conciliacion/excepciones/${sumaTxId}/resolver`,
      { accion: "aplicar", charge_id: charge1Id },
      adminToken
    );
    expect(r.status).toBe(422);
    const body = await r.json() as any;
    expect(body.diff_centavos).toBeGreaterThan(100);

    // La tx sigue pendiente — no se aplicó nada
    const txRow = await pool.query(
      `SELECT estado_conciliacion FROM bank_transactions WHERE id=$1`, [sumaTxId]
    );
    expect(txRow.rows[0].estado_conciliacion).toBe("pendiente");
  });

  it("CSC-04: auto-match detecta la combinación de hermanos → sugerencia score=70", async () => {
    // Primera vez: sin CLABE conocida → clabeScore=0, nombreScore=0
    // 2 cargos exactos → montoScore=70 → total=70 → sugerencia (no auto-aplica)
    const r = await httpPost(
      `/api/conciliacion/auto-match/${campusId}`, {}, adminToken
    );
    expect(r.status).toBe(200);
    const body = await r.json() as any;

    const sug = (body.sugerencias as any[]).find((s: any) => s.tx_id === sumaTxId);
    expect(sug, "La tx de hermanos debe aparecer como sugerencia").toBeDefined();
    expect(sug.charge_ids).toHaveLength(2);
    expect(sug.charge_ids).toContain(charge1Id);
    expect(sug.charge_ids).toContain(charge2Id);
    expect(sug.detalle.monto).toBe(70);
    expect(sug.score).toBe(70);

    // La tx sigue pendiente — el motor solo sugiere, no aplica (score < 90)
    const txRow = await pool.query(
      `SELECT estado_conciliacion FROM bank_transactions WHERE id=$1`, [sumaTxId]
    );
    expect(txRow.rows[0].estado_conciliacion).toBe("pendiente");
  });
});

// ── CSC-05/06/07: Curva de aprendizaje ────────────────────────────────────────
describe("Curva de aprendizaje — tres pasos para alcanzar auto-conciliación", () => {
  // Cada paso crea su propio cargo + tx para poder verificar el estado exacto.
  // El estado de family_payment_sources se acumula entre pasos (es el objetivo del test).

  it("CSC-05: primera txn sin CLABE conocida → score=70, revisión; operador confirma → confirmaciones=1", async () => {
    const chargeId = await mkCharge(studentId1, 100_000);
    const txId     = await mkBankTx(100_000, { clabe: TEST_CLABE });
    try {
      // STEP 1: auto-match → sugerencia
      const r1    = await httpPost(`/api/conciliacion/auto-match/${campusId}`, {}, adminToken);
      const body1 = await r1.json() as any;
      const sug   = (body1.sugerencias as any[]).find((s: any) => s.tx_id === txId);
      expect(sug, "Debe aparecer como sugerencia (score 70)").toBeDefined();
      expect(sug.score).toBe(70);

      // STEP 2: operador confirma manualmente (simula el clic en la bandeja)
      const r2 = await httpPost(
        `/api/conciliacion/excepciones/${txId}/resolver`,
        { accion: "aplicar", charge_id: chargeId },
        adminToken
      );
      expect(r2.status).toBe(200);

      // STEP 3: verificar que family_payment_sources se actualizó (Fase 2)
      // La Fase 2 es fire-and-forget; esperar brevemente
      await new Promise(r => setTimeout(r, 200));
      const fps = await pool.query(
        `SELECT confirmaciones FROM family_payment_sources
         WHERE family_id=$1 AND clabe=$2`, [familyId, TEST_CLABE]
      );
      expect(fps.rows.length, "family_payment_sources debe tener una fila").toBe(1);
      expect(fps.rows[0].confirmaciones).toBe(1);
    } finally {
      // No limpiar charge/tx aquí: el pago ya los marcó como pagado/conciliado
      // y el afterAll global limpia payments/bank_transactions por tenant_id/campus_id
    }
  });

  it("CSC-06: segunda txn misma CLABE (conf=1) → score=85, aún revisión; confirma → confirmaciones=2", async () => {
    // Verificar precondición: confirmaciones=1 del paso anterior
    const fps0 = await pool.query(
      `SELECT confirmaciones FROM family_payment_sources WHERE family_id=$1 AND clabe=$2`,
      [familyId, TEST_CLABE]
    );
    expect(fps0.rows[0]?.confirmaciones).toBe(1);

    const chargeId = await mkCharge(studentId1, 100_000);
    const txId     = await mkBankTx(100_000, { clabe: TEST_CLABE });

    // auto-match: clabeScore=15 (conf=1) + montoScore=70 = 85 → sugerencia
    const r1    = await httpPost(`/api/conciliacion/auto-match/${campusId}`, {}, adminToken);
    const body1 = await r1.json() as any;
    const sug   = (body1.sugerencias as any[]).find((s: any) => s.tx_id === txId);
    expect(sug, "Debe aparecer como sugerencia (score 85)").toBeDefined();
    expect(sug.detalle.clabe).toBe(15);
    expect(sug.score).toBe(85);

    // Operador confirma
    const r2 = await httpPost(
      `/api/conciliacion/excepciones/${txId}/resolver`,
      { accion: "aplicar", charge_id: chargeId },
      adminToken
    );
    expect(r2.status).toBe(200);

    // Fase 2: confirmaciones sube a 2
    await new Promise(r => setTimeout(r, 200));
    const fps1 = await pool.query(
      `SELECT confirmaciones FROM family_payment_sources WHERE family_id=$1 AND clabe=$2`,
      [familyId, TEST_CLABE]
    );
    expect(fps1.rows[0].confirmaciones).toBe(2);
  });

  it("CSC-07: tercera txn misma CLABE (conf=2) → score=90, auto-aplica sin intervención", async () => {
    // Verificar precondición: confirmaciones=2
    const fps0 = await pool.query(
      `SELECT confirmaciones FROM family_payment_sources WHERE family_id=$1 AND clabe=$2`,
      [familyId, TEST_CLABE]
    );
    expect(fps0.rows[0]?.confirmaciones).toBe(2);

    const chargeId = await mkCharge(studentId1, 100_000);
    const txId     = await mkBankTx(100_000, { clabe: TEST_CLABE });

    // auto-match: clabeScore=20 (conf=2) + montoScore=70 = 90 → auto-aplica
    const r = await httpPost(`/api/conciliacion/auto-match/${campusId}`, {}, adminToken);
    expect(r.status).toBe(200);
    const body = await r.json() as any;

    expect(body.conciliados, "Debe haber al menos 1 conciliado automáticamente").toBeGreaterThanOrEqual(1);
    const enSugerencias = (body.sugerencias as any[]).some((s: any) => s.tx_id === txId);
    expect(enSugerencias, "La tx NO debe quedar en sugerencias — debe auto-conciliarse").toBe(false);

    // La tx está conciliada y el cargo pagado
    const txRow = await pool.query(
      `SELECT estado_conciliacion, confianza_pct FROM bank_transactions WHERE id=$1`, [txId]
    );
    expect(txRow.rows[0].estado_conciliacion).toBe("conciliado");
    expect(txRow.rows[0].confianza_pct).toBe(90);

    const chargeRow = await pool.query(`SELECT estado FROM charges WHERE id=$1`, [chargeId]);
    expect(chargeRow.rows[0].estado).toBe("pagado");

    // confirmaciones sube a 3 (Fase 2 del auto-apply)
    await new Promise(r => setTimeout(r, 200));
    const fps1 = await pool.query(
      `SELECT confirmaciones FROM family_payment_sources WHERE family_id=$1 AND clabe=$2`,
      [familyId, TEST_CLABE]
    );
    expect(fps1.rows[0].confirmaciones).toBe(3);
  });
});

// ── CSC-08: Regresión ──────────────────────────────────────────────────────────
describe("Regresión — pago simple con CLABE conf≥2 y nombre coincidente → score 100, sin fricción", () => {
  it("CSC-08: score=100 (monto=70 + clabe=20 + nombre=15 → cap 100), auto-aplica", async () => {
    // Pre-seed: CLABE2 con confirmaciones=2 para esta familia
    await pool.query(
      `INSERT INTO family_payment_sources
         (tenant_id, family_id, clabe, nombre_inferido, confirmaciones, primera_vez_at, ultima_vez_at)
       VALUES ($1,$2,$3,'Carlos Hernandez Garcia',2,NOW(),NOW())
       ON CONFLICT (family_id, clabe) DO UPDATE SET confirmaciones=2`,
      [tenantId, familyId, TEST_CLABE2]
    );

    const chargeId = await mkCharge(studentId1, 100_000);
    // nombre_ordenante diseñado para Jaccard ≥ 0.70 vs "Carlos Hernandez Garcia"
    // Tokens guardian: [CARLOS, HERNANDEZ, GARCIA]
    // Tokens ordenante: [CARLOS, HERNANDEZ, GARCIA] → Jaccard = 3/3 = 1.0 → score=15
    const txId = await mkBankTx(100_000, {
      clabe:  TEST_CLABE2,
      nombre: "CARLOS HERNANDEZ GARCIA",
    });

    try {
      const r = await httpPost(`/api/conciliacion/auto-match/${campusId}`, {}, adminToken);
      expect(r.status).toBe(200);
      const body = await r.json() as any;

      // Debe auto-conciliarse (no en sugerencias)
      expect(body.conciliados).toBeGreaterThanOrEqual(1);
      const enSugerencias = (body.sugerencias as any[]).some((s: any) => s.tx_id === txId);
      expect(enSugerencias).toBe(false);

      // Verificar confianza_pct = 100 (cap)
      const txRow = await pool.query(
        `SELECT estado_conciliacion, confianza_pct FROM bank_transactions WHERE id=$1`, [txId]
      );
      expect(txRow.rows[0].estado_conciliacion).toBe("conciliado");
      expect(txRow.rows[0].confianza_pct).toBe(100);

      // Cargo pagado
      const chargeRow = await pool.query(`SELECT estado FROM charges WHERE id=$1`, [chargeId]);
      expect(chargeRow.rows[0].estado).toBe("pagado");
    } finally {
      // La limpieza global maneja bank_transactions y charges del tenant
      // Limpiar el FPS pre-seeded de CLABE2 explícitamente
      await pool.query(
        `DELETE FROM family_payment_sources WHERE family_id=$1 AND clabe=$2`,
        [familyId, TEST_CLABE2]
      );
    }
  });
});
