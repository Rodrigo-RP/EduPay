/**
 * import-bank-transactions.test.ts
 *
 * Tests de regresión para POST /api/conciliacion/importar (blindaje completo)
 * y correcciones a POST /api/caja/transferencia-manual.
 *
 * IBT-00    sin token → 401
 * IBT-00b   asistente (sin PAYMENTS.PROCESS) → 403  [regresión Bug A]
 * IBT-01    array vacío → 400
 * IBT-02    fila válida sin referencia → successful=1, tenant_id=tenantId en DB
 * IBT-03    dry_run=true → successful=1 en respuesta, cero filas en DB, committed=false
 * IBT-04    dedup: misma referencia 2 veces → successful=1, skipped=1, 1 fila en DB  [regresión Bug B]
 * IBT-05    fila sin fecha (failed) seguida de fila válida → failed=1, successful=1, atomicidad
 * IBT-06    audit_log escrito post-COMMIT con acción BANK_TRANSACTIONS_IMPORT
 * IBT-07    transferencia-manual: tenant_id escrito desde JWT (no NULL)
 * IBT-08    transferencia-manual sin token → 401
 * IBT-09    transferencia-manual con asistente → 403
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";

const BASE       = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// Tenant / campus exclusivos para este archivo
let tenantId:  number;
let campusId:  number;
let adminToken:    string;
let asistenteToken: string;

function makeToken(role: string, cid: number, tid: number) {
  return jwt.sign(
    { role, campus_id: cid, tenant_id: tid, type: "user" },
    JWT_SECRET, { expiresIn: "1h" }
  );
}

async function postImportar(token: string | null, body: object, dryRun = false) {
  const url = `${BASE}/api/conciliacion/importar${dryRun ? "?dry_run=true" : ""}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() as any };
}

async function postTransferencia(token: string | null, body: object) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE}/api/caja/transferencia-manual`, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() as any };
}

beforeAll(async () => {
  const ts = Date.now().toString().slice(-7);
  const ten = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`IBT Tenant ${ts}`, `IBT${ts}`]
  );
  tenantId = ten.rows[0].id;
  const cam = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1,$2) RETURNING id`,
    [tenantId, `IBT Campus ${ts}`]
  );
  campusId = cam.rows[0].id;
  adminToken     = makeToken("administrador_campus", campusId, tenantId);
  asistenteToken = makeToken("asistente",             campusId, tenantId);
});

afterAll(async () => {
  await pool.query(`DELETE FROM bank_transactions WHERE campus_id = $1`, [campusId]);
  await pool.query(`DELETE FROM campuses  WHERE id = $1`, [campusId]);
  await pool.query(`DELETE FROM tenants   WHERE id = $1`, [tenantId]);
});

// ── IBT-00: sin token → 401 ───────────────────────────────────────────────────
it("IBT-00: sin token → 401", async () => {
  const { status } = await postImportar(null, { transacciones: [{ fecha: "2026-08-01", monto: "100" }] });
  expect(status).toBe(401);
});

// ── IBT-00b: asistente → 403 (regresión Bug A) ───────────────────────────────
it("IBT-00b: asistente (sin PAYMENTS.PROCESS) → 403", async () => {
  const { status } = await postImportar(asistenteToken, {
    transacciones: [{ fecha: "2026-08-01", monto: "100" }],
  });
  expect(status, "Bug A: asistente no debe poder importar").toBe(403);
});

// ── IBT-01: array vacío → 400 ─────────────────────────────────────────────────
it("IBT-01: array vacío → 400", async () => {
  const { status } = await postImportar(adminToken, { transacciones: [] });
  expect(status).toBe(400);
});

// ── IBT-02: fila válida → successful=1, tenant_id en DB ──────────────────────
it("IBT-02: fila válida sin referencia → successful=1, tenant_id escrito desde JWT", async () => {
  const ref = null; // sin referencia — no hay dedup
  const { status, body } = await postImportar(adminToken, {
    transacciones: [{ fecha: "2026-08-01", descripcion: "Pago colegiatura", monto: "2500.00" }],
  });
  expect(status).toBe(200);
  expect(body.successful).toBe(1);
  expect(body.skipped).toBe(0);
  expect(body.committed).toBe(true);

  // tenant_id debe ser el del JWT, no NULL
  const row = await pool.query(
    `SELECT tenant_id FROM bank_transactions WHERE campus_id=$1 AND descripcion='Pago colegiatura' ORDER BY id DESC LIMIT 1`,
    [campusId]
  );
  expect(row.rows[0]?.tenant_id, "tenant_id debe ser el del JWT").toBe(tenantId);
});

// ── IBT-03: dry_run → cero filas en DB, committed=false ──────────────────────
it("IBT-03: dry_run=true → cero filas en DB, successful correcto, committed=false", async () => {
  const refDry = `DRY-${Date.now()}`;
  const before = await pool.query(
    `SELECT COUNT(*)::int AS n FROM bank_transactions WHERE campus_id=$1`, [campusId]
  );
  const countBefore = before.rows[0].n as number;

  const { status, body } = await postImportar(adminToken, {
    transacciones: [{ fecha: "2026-08-03", monto: "1000.00", referencia: refDry }],
  }, /* dryRun= */ true);

  expect(status).toBe(200);
  expect(body.successful).toBe(1);
  expect(body.committed).toBe(false);

  const after = await pool.query(
    `SELECT COUNT(*)::int AS n FROM bank_transactions WHERE campus_id=$1`, [campusId]
  );
  expect(after.rows[0].n, "dry_run no debe insertar filas").toBe(countBefore);
});

// ── IBT-04: dedup — misma referencia dos veces (regresión Bug B) ──────────────
it("IBT-04: dedup con referencia duplicada → successful=1, skipped=1, 1 fila en DB", async () => {
  const refDedup = `DEDUP-${Date.now()}`;
  const { status, body } = await postImportar(adminToken, {
    transacciones: [
      { fecha: "2026-08-04", descripcion: "SPEI", monto: "3000.00", referencia: refDedup },
      { fecha: "2026-08-04", descripcion: "SPEI", monto: "3000.00", referencia: refDedup },
    ],
  });
  expect(status).toBe(200);
  expect(body.successful, "solo la primera fila debe insertarse").toBe(1);
  expect(body.skipped,    "la segunda debe ser skipped por dedup").toBe(1);
  expect(body.failed.length).toBe(0);

  const row = await pool.query(
    `SELECT COUNT(*)::int AS n FROM bank_transactions WHERE campus_id=$1 AND referencia=$2`,
    [campusId, refDedup]
  );
  expect(row.rows[0].n, "exactamente 1 fila en DB").toBe(1);
});

// ── IBT-05: fila inválida (sin fecha) + fila válida → failed=1, successful=1 ──
it("IBT-05: fila sin fecha (failed) + fila válida → continúa, atomicidad por fila", async () => {
  const ref5 = `IBT05-${Date.now()}`;
  const { status, body } = await postImportar(adminToken, {
    transacciones: [
      { descripcion: "Sin fecha", monto: "500.00" },              // fila inválida
      { fecha: "2026-08-05", monto: "750.00", referencia: ref5 }, // fila válida
    ],
  });
  expect(status).toBe(200);
  expect(body.failed.length).toBe(1);
  expect(body.successful).toBe(1);

  const row = await pool.query(
    `SELECT COUNT(*)::int AS n FROM bank_transactions WHERE campus_id=$1 AND referencia=$2`,
    [campusId, ref5]
  );
  expect(row.rows[0].n).toBe(1);
});

// ── IBT-06: audit_log escrito post-COMMIT ─────────────────────────────────────
it("IBT-06: audit_log registra BANK_TRANSACTIONS_IMPORT post-COMMIT", async () => {
  const ref6 = `AUDIT-${Date.now()}`;
  await postImportar(adminToken, {
    transacciones: [{ fecha: "2026-08-06", monto: "100.00", referencia: ref6 }],
  });

  // Sondeo con pequeña espera para el fire-and-forget
  let auditRow: any = null;
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 150));
    const r = await pool.query(
      `SELECT metadata::text AS meta FROM audit_log
       WHERE action='BANK_TRANSACTIONS_IMPORT' AND entity_id=$1
       ORDER BY id DESC LIMIT 1`,
      [campusId]
    );
    if (r.rows.length > 0) { auditRow = r.rows[0]; break; }
  }
  expect(auditRow, "audit_log debe tener entrada BANK_TRANSACTIONS_IMPORT").not.toBeNull();
  expect(auditRow.meta).toContain('"successful"');
});

// ── IBT-07: transferencia-manual escribe tenant_id desde JWT ──────────────────
it("IBT-07: transferencia-manual escribe tenant_id desde JWT (no NULL)", async () => {
  const { status, body } = await postTransferencia(adminToken, {
    fecha: "2026-08-07", descripcion: "Transferencia test", monto: "500.00",
  });
  expect(status).toBe(200);
  const txId = body.transaccion?.id;
  expect(txId).toBeDefined();

  const row = await pool.query(
    `SELECT tenant_id FROM bank_transactions WHERE id=$1`, [txId]
  );
  expect(row.rows[0]?.tenant_id, "tenant_id debe ser el del JWT").toBe(tenantId);
});

// ── IBT-08: transferencia-manual sin token → 401 ──────────────────────────────
it("IBT-08: transferencia-manual sin token → 401", async () => {
  const { status } = await postTransferencia(null, { fecha: "2026-08-07", monto: "100" });
  expect(status).toBe(401);
});

// ── IBT-09: transferencia-manual con asistente → 403 ─────────────────────────
it("IBT-09: transferencia-manual con asistente → 403", async () => {
  const { status } = await postTransferencia(asistenteToken, { fecha: "2026-08-07", monto: "100" });
  expect(status).toBe(403);
});
