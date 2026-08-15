/**
 * Reproducción empírica de bugs en POST /api/conciliacion/importar
 * Ejecutar ANTES del fix: npx tsx scripts/reproduce-importar-bugs.mts
 *
 * Bug A: rol sin PAYMENTS.PROCESS → 200 (debe ser 403)
 * Bug B: misma referencia importada 2 veces → endpoint dice importadas=2, DB tiene 1 fila
 */
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

const BASE       = 'http://localhost:5000';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
const CAMPUS_ID  = 48;   // campus demo existente
const TENANT_ID  = 29;
const REF        = `REPRO-BUG-${Date.now()}`;

function tok(role: string) {
  return jwt.sign(
    { role, campus_id: CAMPUS_ID, tenant_id: TENANT_ID, type: 'user' },
    JWT_SECRET, { expiresIn: '1h' }
  );
}

async function postImportar(token: string, body: object) {
  const r = await fetch(`${BASE}/api/conciliacion/importar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

// ── Bug A ─────────────────────────────────────────────────────────────────────
console.log('\n── Bug A: asistente sin PAYMENTS.PROCESS llama a /api/conciliacion/importar ──');
const resA = await postImportar(tok('asistente'), {
  transacciones: [{ fecha: '2026-08-01', descripcion: 'test A', monto: '100.00' }],
});
console.log(`  HTTP status obtenido : ${resA.status}   (esperado: 403)`);
console.log(`  Body                 : ${JSON.stringify(resA.body)}`);
if (resA.status === 200) {
  console.log('  ⚠️  BUG A CONFIRMADO — rol sin permiso recibe 200');
} else {
  console.log('  ✅ Bug A ya corregido');
}

// ── Bug B ─────────────────────────────────────────────────────────────────────
console.log('\n── Bug B: misma referencia importada 2 veces — contador vs DB ──');
const txDup = [
  { fecha: '2026-08-02', descripcion: 'SPEI entrada', monto: '1500.00', referencia: REF },
  { fecha: '2026-08-02', descripcion: 'SPEI entrada', monto: '1500.00', referencia: REF },
];
const resB = await postImportar(tok('administrador_campus'), { transacciones: txDup });
console.log(`  HTTP status : ${resB.status}`);
console.log(`  Body        : ${JSON.stringify(resB.body)}`);

const { rows } = await pool.query(
  `SELECT COUNT(*)::int AS n FROM bank_transactions WHERE campus_id = $1 AND referencia = $2`,
  [CAMPUS_ID, REF]
);
const realRows  = rows[0].n as number;
const reported  = (resB.body as any).importadas ?? (resB.body as any).successful ?? '(campo no encontrado)';
console.log(`  Endpoint reporta como insertadas : ${reported}`);
console.log(`  Filas reales en DB               : ${realRows}`);
if (String(reported) !== String(realRows)) {
  console.log('  ⚠️  BUG B CONFIRMADO — contador no coincide con filas reales en DB');
} else {
  console.log('  ✅ Bug B ya corregido');
}

// Cleanup
await pool.query(
  `DELETE FROM bank_transactions WHERE campus_id = $1 AND referencia = $2`,
  [CAMPUS_ID, REF]
);
await pool.end();
console.log('\nCleanup OK');
