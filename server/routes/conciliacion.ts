import type { Express } from "express";
import { pool, db } from "../db";
import { enqueueAuditLog } from "../audit-retry";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";
import { authenticateToken, requireAuth, checkCampusTenant, hasPermissionForUser, upload, uploadBinary } from "./shared";
import { getParser } from "../lib/bank-parsers/index";
import { MODULES, ACTIONS } from "@shared/permissions";
import { payments, charges, students, invoices, guardians } from "@shared/schema";

function fechaCiudadDeMexico(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function esFechaIsoValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const parsed = new Date(`${fecha}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === fecha;
}

// ── Motor de scoring de conciliación bancaria ─────────────────────────────────
//
// Tres señales: monto_score (0-70) + clabe_score (0-20) + nombre_score (0-15),
// techo 100. Niveles de acción:
//   100     → auto-concilia sin revisión
//   90-99   → auto-concilia + queda en cola de auditoría 24h
//   70-89   → no aplica; devuelve sugerencia esperando un clic del operador
//   0-69    → bandeja de aclaración sin sugerencia

interface CandidatoScore {
  chargeIds: number[];
  familyId: number | null;
  montoTotal: number;
  montoScore: number;
  clabeScore: number;
  nombreScore: number;
  score: number;
}

const _PARTICULAS = new Set(['DE','DEL','LA','LAS','LOS','Y','MC','MAC','E']);

/** Tokeniza un nombre: NFD → sin diacríticos → mayúsculas → filtra partículas */
function _tokenizar(s: string): string[] {
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z\s]/g, '')
    .split(/\s+/).filter(t => t.length > 1 && !_PARTICULAS.has(t));
}

/** Similitud Jaccard a nivel de tokens */
function jaccardNombre(a: string, b: string): number {
  if (!a || !b) return 0;
  const ta = new Set(_tokenizar(a));
  const tb = new Set(_tokenizar(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) { if (tb.has(t)) inter++; }
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** monto_score según tabla de diseño aprobada */
function _montoScore(diff: number, n: number): number {
  if (n === 1) return diff === 0 ? 70 : diff < 100 ? 65 : 0;
  if (n === 2) return diff === 0 ? 70 : diff < 100 ? 60 : 0;
  /* n=3|4 */ return diff === 0 ? 65 : diff < 100 ? 55 : 0;
}

/** Genera todos los sub-arreglos de tamaño k */
function _subsets<T>(arr: T[], k: number): T[][] {
  const result: T[][] = [];
  function helper(start: number, curr: T[]) {
    if (curr.length === k) { result.push([...curr]); return; }
    for (let i = start; i < arr.length; i++) {
      curr.push(arr[i]); helper(i + 1, curr); curr.pop();
    }
  }
  helper(0, []);
  return result;
}

/** Carga en memoria los datos necesarios para evaluar un lote de transacciones */
async function _cargarContextoScoring(tenantId: number, campusId: number): Promise<{
  charges: Array<{id: number; monto_neto: number; family_id: number | null}>;
  fpsByClabe: Map<string, {family_id: number; confirmaciones: number}>;
  tutoresByFamilyId: Map<number, string[]>;
}> {
  const [chargesR, fpsR] = await Promise.all([
    pool.query(`
      SELECT c.id,
             (ROUND(c.monto_base_centavos * (1 - COALESCE(c.beca_aplicada,0)::numeric/100))
               + COALESCE(c.recargo_aplicado_centavos, 0))::bigint AS monto_neto,
             (SELECT fs.family_id FROM family_students fs
              WHERE fs.student_id = c.student_id LIMIT 1) AS family_id
      FROM charges c
      JOIN students s ON s.id = c.student_id
      WHERE s.campus_id = $1 AND c.estado = 'pendiente'
      ORDER BY c.fecha_vencimiento ASC, c.id ASC
    `, [campusId]),
    pool.query(`
      SELECT family_id, clabe, confirmaciones
      FROM family_payment_sources WHERE tenant_id = $1
    `, [tenantId]),
  ]);

  const charges = (chargesR.rows as any[]).map(r => ({
    id: Number(r.id), monto_neto: Number(r.monto_neto),
    family_id: r.family_id != null ? Number(r.family_id) : null,
  }));

  const fpsByClabe = new Map<string, {family_id: number; confirmaciones: number}>();
  for (const r of fpsR.rows as any[]) {
    fpsByClabe.set(String(r.clabe), {
      family_id: Number(r.family_id), confirmaciones: Number(r.confirmaciones),
    });
  }

  // Tutores (nombre_completo) de cada familia con cargos pendientes — para Jaccard
  const familyIds = [...new Set(
    charges.map(c => c.family_id).filter((id): id is number => id !== null)
  )];
  const tutoresByFamilyId = new Map<number, string[]>();
  if (familyIds.length > 0) {
    const tutoresR = await pool.query(`
      SELECT DISTINCT fs.family_id, g.nombre_completo
      FROM family_students fs
      JOIN student_guardian sg ON sg.student_id = fs.student_id
      JOIN guardians g ON g.id = sg.guardian_id
      WHERE fs.family_id = ANY($1::int[]) AND g.nombre_completo IS NOT NULL
    `, [familyIds]);
    for (const r of tutoresR.rows as any[]) {
      const fid = Number(r.family_id);
      if (!tutoresByFamilyId.has(fid)) tutoresByFamilyId.set(fid, []);
      tutoresByFamilyId.get(fid)!.push(String(r.nombre_completo));
    }
  }

  return { charges, fpsByClabe, tutoresByFamilyId };
}

/** Retorna el mejor candidato de match para una transacción (null si score = 0) */
function _buscarMejorCandidato(
  tx: {monto_centavos: number; clabe_ordenante: string | null; nombre_ordenante: string | null},
  charges: Array<{id: number; monto_neto: number; family_id: number | null}>,
  fpsByClabe: Map<string, {family_id: number; confirmaciones: number}>,
  tutoresByFamilyId: Map<number, string[]>,
  consumedIds: Set<number>,
): CandidatoScore | null {
  const disponibles = charges.filter(c => !consumedIds.has(c.id));
  if (!disponibles.length) return null;

  // Detectar ambigüedad: ≥2 cargos individuales de distintas familias coinciden en monto
  let singlesMatch = 0;
  for (const c of disponibles) {
    if (Math.abs(c.monto_neto - tx.monto_centavos) < 100) singlesMatch++;
  }
  const ambiguo = singlesMatch >= 2;

  // Agrupar por family_id (−1 para cargos sin familia)
  const byFamily = new Map<number, typeof disponibles>();
  for (const c of disponibles) {
    const key = c.family_id ?? -1;
    if (!byFamily.has(key)) byFamily.set(key, []);
    byFamily.get(key)!.push(c);
  }

  let mejor: CandidatoScore | null = null;

  for (const [fkey, fCharges] of byFamily) {
    const pool4 = fCharges.slice(0, 4); // K=4 máx por familia
    const familyId = fkey > 0 ? fkey : null;

    // clabe_score: se evalúa una vez por familia
    let clabeScore = 0;
    if (tx.clabe_ordenante && familyId !== null) {
      const fps = fpsByClabe.get(tx.clabe_ordenante);
      if (fps && fps.family_id === familyId) {
        clabeScore = fps.confirmaciones >= 2 ? 20 : 15;
      }
    }

    // nombre_score: Jaccard máximo contra tutores de la familia
    let nombreScore = 0;
    if (tx.nombre_ordenante && familyId !== null) {
      const tutores = tutoresByFamilyId.get(familyId) ?? [];
      let maxJ = 0;
      for (const t of tutores) { const j = jaccardNombre(tx.nombre_ordenante, t); if (j > maxJ) maxJ = j; }
      nombreScore = maxJ >= 0.70 ? 15 : maxJ >= 0.50 ? 10 : maxJ >= 0.30 ? 5 : 0;
    }

    // Probar subsets 1..4
    for (let k = 1; k <= pool4.length; k++) {
      for (const subset of _subsets(pool4, k)) {
        const suma = subset.reduce((acc, c) => acc + c.monto_neto, 0);
        const diff = Math.abs(suma - tx.monto_centavos);
        const montoScore = (ambiguo && k === 1) ? (diff < 100 ? 50 : 0) : _montoScore(diff, k);
        if (montoScore === 0) continue;
        const score = Math.min(100, montoScore + clabeScore + nombreScore);
        if (!mejor || score > mejor.score) {
          mejor = {
            chargeIds: subset.map(c => c.id), familyId,
            montoTotal: suma, montoScore, clabeScore, nombreScore, score,
          };
        }
      }
    }
  }
  return mejor;
}

// ── Interfaz de cliente DB (compatible con pool.connect()) ───────────────────
interface DbClient {
  query(text: string, values?: any[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

/**
 * Núcleo atómico compartido: crea un pago SPEI, registra la payment_application
 * y marca el cargo como 'pagado'. Debe llamarse DENTRO de una transacción ya
 * abierta por el caller (el caller también es responsable de bloquear las filas
 * antes de llamar y de actualizar bank_transactions después).
 *
 * Se extrae aquí para eliminar la duplicación entre applyReconciliation() (multi-
 * cargo, auto-conciliación) y el resolver manual de excepciones (un solo cargo).
 * Si la fórmula de monto_neto o los campos de payments cambian, solo se edita aquí.
 *
 * @returns payment_id creado
 */
async function insertarPagoYCerrarCargo(
  client: DbClient,
  params: {
    tenantId: number;
    chargeId: number;
    montoNetoCentavos: number; // pre-calculado por el caller (beca + recargo ya aplicados)
    metodo: 'spei';
    referencia: string;
  }
): Promise<number> {
  const payRow = await client.query(
    `INSERT INTO payments
       (tenant_id, charge_id, guardian_id, metodo, referencia_pasarela,
        monto_centavos, fecha_pago, estado)
     VALUES ($1,$2,NULL,'spei',$3,$4,NOW(),'exitoso') RETURNING id`,
    [params.tenantId, params.chargeId, params.referencia, params.montoNetoCentavos]
  );
  const pid: number = payRow.rows[0].id;

  await client.query(
    `INSERT INTO payment_applications (payment_id, charge_id, amount_centavos, applied_at)
     VALUES ($1,$2,$3,NOW())`,
    [pid, params.chargeId, params.montoNetoCentavos]
  );

  await client.query(`UPDATE charges SET estado='pagado' WHERE id=$1`, [params.chargeId]);

  return pid;
}

/**
 * Fase 1 (transacción atómica) + Fase 2 (fuera de txn, ADR-001).
 * Devuelve el primer payment_id creado, o null si no pudo adquirir los locks.
 */
export async function applyReconciliation(params: {
  txId: number;
  chargeIds: number[];
  score: number;
  familyId: number | null;
  tenantId: number;
  referencia: string | null;
  clabe_ordenante: string | null;
  nombre_ordenante: string | null;
  monto_tx_centavos: number;
  userId: number | null;
}): Promise<number | null> {
  // ── Fase 1: transacción atómica ────────────────────────────────────────────
  const client = await pool.connect();
  let firstPaymentId: number | null = null;
  try {
    await client.query('BEGIN');

    // Bloquear la bank_transaction
    const txLock = await client.query(
      `SELECT id FROM bank_transactions
       WHERE id = $1 AND estado_conciliacion = 'pendiente'
         AND tipo = 'credito' AND monto_centavos > 0
       FOR UPDATE SKIP LOCKED`,
      [params.txId]
    );
    if (!txLock.rows.length) { await client.query('ROLLBACK'); return null; }

    // Bloquear todos los cargos (en orden ascendente de ID para evitar deadlocks)
    const sortedIds = [...params.chargeIds].sort((a, b) => a - b);
    for (const chargeId of sortedIds) {
      const lock = await client.query(
        `SELECT id FROM charges WHERE id = $1 AND estado = 'pendiente' FOR UPDATE SKIP LOCKED`,
        [chargeId]
      );
      if (!lock.rows.length) { await client.query('ROLLBACK'); return null; }
    }

    // Un payment + payment_application por cargo (via helper compartido)
    const paymentIds: number[] = [];
    for (const chargeId of params.chargeIds) {
      const mnRow = await client.query(
        `SELECT ROUND(monto_base_centavos*(1-COALESCE(beca_aplicada,0)::numeric/100))
                + COALESCE(recargo_aplicado_centavos,0) AS mn FROM charges WHERE id=$1`,
        [chargeId]
      );
      const montoNeto = Number(mnRow.rows[0]?.mn ?? 0);
      const pid = await insertarPagoYCerrarCargo(client, {
        tenantId: params.tenantId,
        chargeId,
        montoNetoCentavos: montoNeto,
        metodo: 'spei',
        referencia: params.referencia || `AUTO-${params.txId}`,
      });
      paymentIds.push(pid);
    }

    firstPaymentId = paymentIds[0];
    const notaHermanos = params.chargeIds.length > 1
      ? `Hermanos: cargos #${params.chargeIds.join(', #')} — score ${params.score}`
      : null;

    const upd = await client.query(
      `UPDATE bank_transactions
       SET estado_conciliacion='conciliado', charge_id=$1, payment_id=$2,
           confianza_pct=$3, nota_conciliacion=COALESCE($4, nota_conciliacion),
           conciliado_at = NOW()
       WHERE id=$5 AND estado_conciliacion='pendiente'`,
      [params.chargeIds[0], firstPaymentId, params.score, notaHermanos, params.txId]
    );
    if ((upd as any).rowCount !== 1) { await client.query('ROLLBACK'); return null; }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // ── Fase 2: fuera de la txn comprometida (ADR-001) ────────────────────────
  if (firstPaymentId !== null && params.familyId && params.clabe_ordenante) {
    pool.query(
      `INSERT INTO family_payment_sources
         (tenant_id, family_id, clabe, nombre_inferido, confirmaciones, primera_vez_at, ultima_vez_at)
       VALUES ($1,$2,$3,$4,1,NOW(),NOW())
       ON CONFLICT (family_id, clabe) DO UPDATE
         SET confirmaciones  = family_payment_sources.confirmaciones + 1,
             nombre_inferido = COALESCE($4, family_payment_sources.nombre_inferido),
             ultima_vez_at   = NOW()`,
      [params.tenantId, params.familyId, params.clabe_ordenante, params.nombre_ordenante || null]
    ).catch(() => {}); // fire-and-forget — no revierte el pago ya commitado
  }

  if (firstPaymentId !== null && params.userId && params.tenantId) {
    const ap = {
      tenant_id: params.tenantId, user_id: params.userId,
      action: 'conciliar_pago_spei' as const, entity_type: 'bank_transaction' as const,
      entity_id: params.txId,
      metadata: {
        charge_ids: params.chargeIds, payment_id: firstPaymentId,
        score: params.score, monto_centavos: params.monto_tx_centavos,
        referencia: params.referencia, clabe_ordenante: params.clabe_ordenante,
      },
    };
    pool.query(
      `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata, created_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,NOW())`,
      [ap.tenant_id, ap.user_id, ap.action, ap.entity_type, ap.entity_id, JSON.stringify(ap.metadata)]
    ).catch((err) => { enqueueAuditLog(ap, err); });
  }

  // ── Cerrar acción de seguimiento para auto-conciliación (score ≥ 90) ────────
  // fire-and-forget — usa subquery para campus_id porque applyReconciliation no
  // lo recibe como parámetro (campus_id no es operacionalmente necesario en Fase 1).
  if (firstPaymentId !== null) {
    pool.query(
      `UPDATE acciones_seguimiento a
       SET status           = 'resuelto'::accion_status,
           resolved_at      = NOW(),
           resolution_notes = 'Auto-conciliado (score ' || $1 || ')'
       FROM bank_transactions bt
       WHERE a.entity_type   = 'bank_transaction'
         AND a.entity_id     = bt.id
         AND bt.id           = $2
         AND a.campus_id     = bt.campus_id
         AND a.status NOT IN ('resuelto','ignorado')`,
      [params.score, params.txId]
    ).catch(() => {});
  }

  return firstPaymentId;
}

// ── Helper compartido: inserción atómica de filas ya validadas ────────────────
// Usado por /importar (JSON) y /importar-pdf (PDF parseado).
// Recibe filas con monto_centavos ya en enteros — no hace conversión de string.
// Devuelve contadores; la transacción BEGIN/COMMIT la maneja el caller.
async function insertBankRows(
  client: any,
  campusId: number,
  tenantId: number | null,
  rows: Array<{
    fecha:            string;
    descripcion:      string | null;
    monto_centavos:   number;
    tipo:             string;
    referencia:       string | null;
    clabe_ordenante:  string | null;
    nombre_ordenante: string | null;
  }>,
): Promise<{ successful: number; skipped: number; failed: string[]; inserted_ids: number[] }> {
  let successful = 0;
  let skipped    = 0;
  const failed:       string[] = [];
  const inserted_ids: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row    = rows[i];
    const rowNum = i + 1;
    const sp     = `sp_bt_${i}`;

    await client.query(`SAVEPOINT ${sp}`);
    try {
      const result = await client.query(`
        INSERT INTO bank_transactions
          (campus_id, tenant_id, fecha, descripcion, monto_centavos, tipo,
           referencia, clabe_ordenante, nombre_ordenante, estado_conciliacion)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pendiente')
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [
        campusId,               tenantId,
        row.fecha,              row.descripcion      ?? null,
        row.monto_centavos,     row.tipo             || "credito",
        row.referencia          ?? null,
        row.clabe_ordenante     ?? null,
        row.nombre_ordenante    ?? null,
      ]);
      await client.query(`RELEASE SAVEPOINT ${sp}`);
      if ((result.rowCount ?? 0) === 1) {
        successful++;
        inserted_ids.push(result.rows[0].id);
      } else {
        skipped++;
      }
    } catch (rowErr: any) {
      await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
      failed.push(`Fila ${rowNum}: ${rowErr.message}`);
    }
  }

  return { successful, skipped, failed, inserted_ids };
}

// ── Helper compartido: crear acciones_seguimiento para bank_transactions ──────
// Se llama en fire-and-forget después del COMMIT de importación CSV/PDF y de
// la inserción manual de transferencias. ON CONFLICT DO NOTHING garantiza
// idempotencia: doble importación del mismo estado de cuenta no crea duplicados.
async function crearAccionesParaBankTx(
  campusId: number,
  tenantId: number,
  txIds: number[],
  createdBy: number | null,
): Promise<void> {
  if (!txIds.length) return;
  pool.query(
    `INSERT INTO acciones_seguimiento
       (tenant_id, campus_id, entity_type, entity_id, tipo_hallazgo,
        status, titulo, metadata, created_by)
     SELECT
       $1, $2, 'bank_transaction', bt.id, 'excepcion_conciliacion',
       'pendiente',
       'Transferencia sin conciliar — ' ||
         TO_CHAR(bt.monto_centavos::numeric / 100, 'FM$999,999,990.00'),
       jsonb_build_object(
         'monto_centavos',   bt.monto_centavos,
         'referencia',       bt.referencia,
         'nombre_ordenante', bt.nombre_ordenante,
         'fecha',            bt.fecha::text
       ),
       $3
     FROM bank_transactions bt
     WHERE bt.id = ANY($4::int[])
     ON CONFLICT (entity_type, entity_id, campus_id) DO NOTHING`,
    [tenantId, campusId, createdBy, txIds]
  ).catch(() => {}); // fire-and-forget — no revierte el import ya commitado
}

// ── Helper compartido: cerrar acción de seguimiento de una bank_transaction ───
// Se llama en fire-and-forget desde el resolver y applyReconciliation.
// El status puede ser 'resuelto' o 'ignorado'; notes es opcional.
function cerrarAccionBankTx(
  txId: number,
  campusId: number,
  status: 'resuelto' | 'ignorado',
  notes: string | null,
): void {
  pool.query(
    `UPDATE acciones_seguimiento
     SET status           = $1::accion_status,
         resolved_at      = NOW(),
         resolution_notes = $2
     WHERE entity_type = 'bank_transaction'
       AND entity_id   = $3
       AND campus_id   = $4
       AND status NOT IN ('resuelto','ignorado')`,
    [status, notes, txId, campusId]
  ).catch(() => {}); // fire-and-forget
}

// ── Fórmula canónica de scoring de riesgo ─────────────────────────────────────
// Exportada para ser reutilizada por RPT-08 sin duplicar la lógica.
// NUNCA modificar esta función sin actualizar también los tests RSG-14
// (consistencia de score entre semáforo y reporte).
export function computeRiesgoScore(params: {
  diasVencido:     number;
  adeudoCentavos:  number;
  tasaPago:        number;
}): { score: number; semaforo: "verde" | "amarillo" | "rojo"; historial_descripcion: string } {
  const { diasVencido, adeudoCentavos, tasaPago } = params;
  let score = 100;
  if (diasVencido > 0) score -= Math.min(diasVencido, 40);
  if (adeudoCentavos > 500000) score -= 20;
  else if (adeudoCentavos > 200000) score -= 10;
  score = Math.max(0, score - (100 - tasaPago) * 0.3);
  score = Math.round(Math.max(0, Math.min(100, score)));
  const semaforo = score >= 75 ? "verde" : score >= 50 ? "amarillo" : "rojo";
  const historial_descripcion =
    tasaPago >= 90 ? "Excelente historial" :
    tasaPago >= 70 ? "Historial regular"   : "Historial irregular";
  return { score, semaforo, historial_descripcion };
}

export function registerConciliacionRoutes(app: Express): void {
  // ── 1. CENTRO DE COMANDOS ─────────────────────────────────────────────────
  app.get("/api/dashboard/comandos/:campusId", authenticateToken, async (req: any, res) => {
    if (!hasPermissionForUser(req.user, MODULES.FINANCIAL, ACTIONS.READ)) {
      return res.status(403).json({ message: "Sin permisos para ver KPIs financieros del campus" });
    }
    try {
      const campusId = parseInt(req.params.campusId) || req.user?.campus_id;
      if (!await checkCampusTenant(campusId, req.user?.tenant_id, res)) return;
      const [studentsRows, paymentsRows, chargesRows] = await Promise.all([
        pool.query(`SELECT COUNT(*) as total FROM students WHERE campus_id = $1 AND status = 'activo'`, [campusId]).catch(() => ({ rows: [{ total: 0 }] })),
        pool.query(`SELECT COALESCE(SUM(p.monto_centavos),0) as total FROM payments p JOIN charges c ON c.id=p.charge_id JOIN students s ON s.id=c.student_id WHERE s.campus_id=$1 AND p.created_at>=date_trunc('month',NOW())`, [campusId]).catch(() => ({ rows: [{ total: 0 }] })),
        pool.query(`SELECT COALESCE(SUM(c.monto_base_centavos),0) as total, COUNT(*) as cnt FROM charges c JOIN students s ON s.id=c.student_id WHERE s.campus_id=$1 AND c.estado='pendiente'`, [campusId]).catch(() => ({ rows: [{ total: 0, cnt: 0 }] })),
      ]);
      const ingresosRaw = Number((paymentsRows.rows[0] as any)?.total || 0);
      const pendienteRaw = Number((chargesRows.rows[0] as any)?.total || 0);
      const totalRaw = ingresosRaw + pendienteRaw;
      const tasaCobro = totalRaw > 0 ? Math.round((ingresosRaw / totalRaw) * 100) : 0;
      const mora = totalRaw > 0 ? Math.round((pendienteRaw / totalRaw) * 100) : 0;

      const [speiRows, cfdiRows] = await Promise.all([
        pool.query(`SELECT COUNT(*) as cnt FROM bank_transactions WHERE campus_id = $1 AND estado_conciliacion = 'pendiente'`, [campusId]).catch(() => ({ rows: [{cnt: 0}] })),
        pool.query(`SELECT COUNT(*) as cnt FROM payments p JOIN charges c ON c.id=p.charge_id JOIN students s ON s.id=c.student_id LEFT JOIN invoices i ON i.payment_id=p.id WHERE s.campus_id=$1 AND i.id IS NULL`, [campusId]).catch(() => ({ rows: [{cnt: 0}] })),
      ]);

      res.json({
        resumen: {
          facturado_mes: ingresosRaw,
          tasa_cobro: tasaCobro,
          mora,
          estudiantes: Number((studentsRows.rows[0] as any)?.total || 0),
          spei_pendientes: Number((speiRows.rows[0] as any)?.cnt || 0),
          cfdi_pendientes: Number((cfdiRows.rows[0] as any)?.cnt || 0),
          deudores_criticos: 0,
          cuotas_vencidas: 0,
          becas_por_vencer: 0,
        },
        tareas_hoy: [],
        alertas: [],
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── 2. SEMÁFORO DE RIESGO ─────────────────────────────────────────────────
  app.get("/api/riesgo/semaforo/:campusId", authenticateToken, async (req: any, res) => {
    if (!hasPermissionForUser(req.user, MODULES.RECEIVABLES, ACTIONS.READ)) {
      return res.status(403).json({ message: "Sin permisos para ver el semáforo de riesgo" });
    }
    try {
      const campusId = parseInt(req.params.campusId) || req.user?.campus_id;
      if (!await checkCampusTenant(campusId, req.user?.tenant_id, res)) return;
      const rows = await pool.query(`
        SELECT
          s.id AS student_id,
          CONCAT(s.nombres, ' ', s.apellido_paterno) AS estudiante,
          CONCAT(g.nombres, ' ', g.apellido_paterno) AS nombre_familia,
          s.nivel_escolar AS nivel,
          COALESCE(SUM(CASE WHEN c.estado='pendiente' THEN c.monto_base_centavos ELSE 0 END), 0) AS adeudo_centavos,
          COALESCE(MAX(EXTRACT(DAY FROM (NOW()-c.fecha_vencimiento::date))) FILTER (WHERE c.estado='pendiente' AND c.fecha_vencimiento<NOW()::date), 0) AS dias_vencido,
          COALESCE(
            ROUND(
              (COUNT(p.id) FILTER (WHERE p.created_at > NOW() - INTERVAL '6 months'))::numeric /
              NULLIF(COUNT(c2.id) FILTER (WHERE c2.created_at > NOW() - INTERVAL '6 months'), 0) * 100
            ), 0
          ) AS tasa_pago_historica
        FROM students s
        LEFT JOIN student_guardian sg ON sg.student_id = s.id
        LEFT JOIN guardians g ON g.id = sg.guardian_id
        LEFT JOIN charges c ON c.student_id = s.id AND c.estado='pendiente'
        LEFT JOIN payments p ON p.charge_id IN (SELECT id FROM charges WHERE student_id=s.id)
        LEFT JOIN charges c2 ON c2.student_id = s.id
        WHERE s.campus_id = $1
        GROUP BY s.id, s.nombres, s.apellido_paterno, g.nombres, g.apellido_paterno, s.nivel_escolar
        ORDER BY adeudo_centavos DESC
        LIMIT 200
      `, [campusId]);

      const familias = (rows.rows as any[]).map(f => {
        const diasVencido = Number(f.dias_vencido || 0);
        const adeudo      = Number(f.adeudo_centavos || 0);
        const tasaPago    = Number(f.tasa_pago_historica || 0);
        const { score, semaforo, historial_descripcion } = computeRiesgoScore({
          diasVencido,
          adeudoCentavos: adeudo,
          tasaPago,
        });
        return {
          ...f,
          adeudo_centavos:      adeudo,
          dias_vencido:         diasVencido,
          tasa_pago_historica:  tasaPago,
          score,
          semaforo,
          historial_descripcion,
        };
      });
      res.json(familias);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── MÓDULO DE CAJA ────────────────────────────────────────────────────────

  /**
   * POST /api/caja/pago-efectivo
   *
   * Registra un cobro en efectivo en caja.
   * Selecciona automáticamente el cargo más antiguo pendiente del alumno.
   * SOPORTA PAGOS PARCIALES: el operador introduce el monto recibido;
   *   si cubre el saldo completo → charge queda 'pagado'
   *   si es menor → charge queda 'parcial' y un pago posterior puede completarlo
   *
   * Usa transacción atómica con FOR UPDATE para prevenir doble cobro concurrente.
   */
  app.post("/api/caja/pago-efectivo", authenticateToken, async (req, res) => {
    try {
      const role = (req as any).user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.PAYMENTS, ACTIONS.PROCESS)) {
        return res.status(403).json({ message: "Sin permisos para procesar pagos" });
      }
      const campusId     = (req as any).user?.campus_id;
      const tenantIdCaja = (req as any).user?.tenant_id;
      const userIdCaja   = (req as any).user?.id;
      // charge_id es opcional: si el operador lo provee, paga ese cargo directamente;
      // si no, auto-selecciona el más antiguo no-terminal del alumno.
      const { estudiante_id, charge_id: chargeIdOverride, monto, recibido_por, observaciones } = req.body;

      if (!monto || parseFloat(monto) <= 0) {
        return res.status(400).json({ message: "El monto debe ser mayor que cero" });
      }
      const montoOperador = Math.round(parseFloat(monto) * 100); // centavos

      let chargeId: number | undefined;
      if (chargeIdOverride) {
        // Cargo explícito: verificar que pertenezca al alumno y campus correctos
        const explicitRow = await pool.query(
          `SELECT c.id FROM charges c
           JOIN students s ON s.id = c.student_id
           WHERE c.id = $1 AND s.id = $2 AND s.campus_id = $3
             AND c.estado NOT IN ('pagado','cancelado')`,
          [chargeIdOverride, estudiante_id, campusId]
        ).catch(() => ({ rows: [] as any[] }));
        chargeId = (explicitRow.rows as any[])[0]?.id;
      } else {
        // Auto-selección: cargo más antiguo no-terminal del alumno (fuera de la txn — lectura)
        const candidateRow = await pool.query(
          `SELECT c.id FROM charges c
           JOIN students s ON s.id = c.student_id
           WHERE s.id = $1 AND s.campus_id = $2
             AND c.estado NOT IN ('pagado','cancelado')
           ORDER BY c.fecha_vencimiento ASC LIMIT 1`,
          [estudiante_id, campusId]
        ).catch(() => ({ rows: [] as any[] }));
        chargeId = (candidateRow.rows as any[])[0]?.id;
      }
      if (!chargeId) {
        if (chargeIdOverride) {
          // El operador especificó un cargo que no existe o no pertenece al alumno/campus
          return res.status(404).json({ message: "Cargo no encontrado", payment_id: null, monto_centavos: montoOperador });
        }
        return res.json({ message: "No hay cargos pendientes para este alumno", payment_id: null, monto_centavos: montoOperador });
      }

      // ── Transacción atómica ──────────────────────────────────────────────
      const client = await pool.connect();
      let paymentId!: number;
      let montoAplicado!: number;
      let newEstado!: string;
      try {
        await client.query("BEGIN");

        // Lock del cargo — serializa doble cobro concurrente
        const lockRes = await client.query(
          `SELECT id, monto_base_centavos, estado
           FROM charges WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
          [chargeId, tenantIdCaja]
        );
        if (!(lockRes.rows as any[]).length) {
          await client.query("ROLLBACK");
          return res.status(404).json({ message: "Cargo no encontrado", payment_id: null, monto_centavos: montoOperador });
        }
        const locked = (lockRes.rows as any[])[0];

        if (["pagado", "cancelado"].includes(locked.estado)) {
          await client.query("ROLLBACK");
          return res.status(409).json({ message: "El cargo ya fue pagado o cancelado", payment_id: null, monto_centavos: montoOperador });
        }

        // Saldo pendiente real (dentro del mismo client)
        const saldoRes = await client.query(
          `SELECT COALESCE(SUM(pa.amount_centavos), 0)::bigint AS ya_pagado
           FROM payment_applications pa WHERE pa.charge_id = $1`,
          [chargeId]
        );
        const yaPagado = Number((saldoRes.rows as any[])[0].ya_pagado);
        const saldoPendiente = Number(locked.monto_base_centavos) - yaPagado;

        if (saldoPendiente <= 0) {
          await client.query("ROLLBACK");
          return res.status(422).json({ message: "El cargo ya tiene saldo cero", payment_id: null, monto_centavos: montoOperador });
        }

        // Calcular cuánto se aplica al cargo y cuánto sobra
        montoAplicado = Math.min(montoOperador, saldoPendiente);
        const excedente = montoOperador - montoAplicado; // 0 si no sobra nada
        newEstado = montoAplicado >= saldoPendiente ? "pagado" : "parcial";

        const referencia = `CAJA-${Date.now()}`;
        // El payment registra el MONTO TOTAL COBRADO (efectivo recibido en caja)
        // — importante para cuadre de caja. La payment_application aplica solo
        // lo que cubre el cargo.
        const payRow = await client.query(
          `INSERT INTO payments
             (tenant_id, charge_id, guardian_id, metodo, referencia_pasarela,
              monto_centavos, fecha_pago, estado)
           VALUES ($1,$2,NULL,'efectivo',$3,$4,CURRENT_DATE,'exitoso') RETURNING id`,
          [tenantIdCaja, chargeId, referencia, montoOperador]
        );
        paymentId = (payRow.rows as any[])[0].id;

        // Ledger entry: solo la parte que cubre el cargo
        await client.query(
          `INSERT INTO payment_applications (payment_id, charge_id, amount_centavos, applied_at)
           VALUES ($1,$2,$3,NOW())`,
          [paymentId, chargeId, montoAplicado]
        );

        await client.query(
          `UPDATE charges SET estado = $1, updated_at = NOW() WHERE id = $2`,
          [newEstado, chargeId]
        );

        // Si hubo excedente → registrar como saldo a favor de la familia
        if (excedente > 0) {
          // Buscar la familia del alumno (puede no tener ninguna)
          const familyRow = await client.query(
            `SELECT family_id FROM family_students WHERE student_id = $1 LIMIT 1`,
            [estudiante_id]
          );
          const creditFamilyId = (familyRow.rows as any[])[0]?.family_id ?? null;

          await client.query(
            `INSERT INTO family_credits
               (tenant_id, campus_id, family_id, student_id, payment_id,
                amount_centavos, origen, descripcion)
             VALUES ($1,$2,$3,$4,$5,$6,'excedente_caja',$7)`,
            [
              tenantIdCaja, campusId, creditFamilyId, estudiante_id, paymentId,
              excedente,
              `Cambio en cobro de caja — pago $${(montoOperador / 100).toFixed(2)}, cargo $${(saldoPendiente / 100).toFixed(2)}`,
            ]
          );
        }

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      // ── Audit fuera de la transacción (ADR-001) ──────────────────────────
      const auditPayloadCaja: import("../audit-retry").AuditLogPayload = {
        tenant_id:  tenantIdCaja,
        user_id:    userIdCaja,
        action:     "charge.status_changed",
        entity_type: "charge",
        entity_id:  chargeId,
        new_value:  { estado: newEstado },
        metadata:   {
          flujo: "caja_efectivo", payment_id: paymentId,
          monto_operador: montoOperador, monto_aplicado: montoAplicado,
          recibido_por, observaciones,
        },
      };
      pool.query(
        `INSERT INTO audit_log
           (tenant_id, user_id, action, entity_type, entity_id, new_value, metadata)
         VALUES ($1,$2,'charge.status_changed','charge',$3,$4,$5)`,
        [
          tenantIdCaja, userIdCaja, chargeId,
          JSON.stringify(auditPayloadCaja.new_value),
          JSON.stringify(auditPayloadCaja.metadata),
        ]
      ).catch((err) => enqueueAuditLog(auditPayloadCaja, err));

      const excedente = montoOperador - montoAplicado;
      res.json({
        message: `Pago en efectivo registrado (${newEstado})${excedente > 0 ? ` — $${(excedente / 100).toFixed(2)} de cambio registrado como saldo a favor` : ""}`,
        payment_id:              paymentId,
        monto_aplicado_centavos: montoAplicado,
        monto_centavos:          montoOperador,
        excedente_centavos:      excedente,
        charge_nuevo_estado:     newEstado,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // Pagos en efectivo confirmados por fecha. El campus se deriva del JWT y el
  // tenant se valida en payments para no mezclar la operación de otras escuelas.
  app.get("/api/caja/pagos-efectivo", authenticateToken, async (req: any, res) => {
    if (!hasPermissionForUser(req.user, MODULES.PAYMENTS, ACTIONS.READ)) {
      return res.status(403).json({ message: "Sin permisos para ver pagos en efectivo" });
    }

    const fecha = typeof req.query.fecha === "string" ? req.query.fecha : fechaCiudadDeMexico();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return res.status(400).json({ message: "La fecha debe tener el formato AAAA-MM-DD" });
    }

    try {
      const result = await pool.query(
        `SELECT p.id,
                p.created_at,
                p.monto_centavos,
                s.nombre_completo AS estudiante,
                s.grado,
                s.id_referencia,
                COALESCE(con.nombre, 'Concepto no disponible') AS concepto
           FROM payments p
           JOIN charges c ON c.id = p.charge_id
           JOIN students s ON s.id = c.student_id
           LEFT JOIN concepts con ON con.id = c.concept_id
          WHERE p.tenant_id = $1
            AND s.campus_id = $2
            AND p.metodo = 'efectivo'
            AND p.estado = 'exitoso'
            AND DATE(p.created_at) = $3::date
          ORDER BY p.created_at DESC, p.id DESC`,
        [req.user?.tenant_id, req.user?.campus_id, fecha],
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // Get bank movements
  app.get("/api/caja/movimientos-banco", authenticateToken, async (req, res) => {
    if (!hasPermissionForUser((req as any).user, MODULES.PAYMENTS, ACTIONS.READ)) {
      return res.status(403).json({ message: "Sin permisos para ver movimientos bancarios" });
    }
    try {
      const campusId = (req as any).user?.campus_id;
      const rows = await pool.query(`SELECT * FROM bank_transactions WHERE campus_id = $1 ORDER BY fecha DESC, id DESC LIMIT 100`, [campusId]).catch(() => ({ rows: [] }));
      res.json(rows.rows);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // Register manual transfer
  // tenant_id desde JWT (fix: antes se dejaba NULL), auditoría post-INSERT
  app.post("/api/caja/transferencia-manual", authenticateToken, async (req: any, res) => {
    try {
      const user      = req.user;
      if (!hasPermissionForUser(user, MODULES.PAYMENTS, ACTIONS.PROCESS)) {
        return res.status(403).json({ message: "Sin permisos para procesar pagos" });
      }
      const campusId = user?.campus_id;
      const tenantId = user?.tenant_id ?? null;
      const userId   = user?.id        ?? null;
      const { fecha, descripcion, monto, tipo, referencia, clabe, nombre } = req.body;
      const montoCentavos = Math.round(parseFloat(monto || '0') * 100);
      const row = await pool.query(`
        INSERT INTO bank_transactions
          (campus_id, tenant_id, fecha, descripcion, monto_centavos, tipo,
           referencia, clabe_ordenante, nombre_ordenante, estado_conciliacion)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pendiente') RETURNING *
      `, [
        campusId, tenantId,
        fecha || new Date().toISOString().split('T')[0],
        descripcion, montoCentavos, tipo || 'credito',
        referencia || null, clabe || null, nombre || null,
      ]);
      const tx = (row.rows as any[])[0];

      // ── Acción de seguimiento — fire-and-forget post-INSERT ───────────────
      if (tx?.id && tenantId && campusId) {
        crearAccionesParaBankTx(campusId, tenantId, [tx.id], userId ?? null);
      }

      // Auditoría — fire-and-forget (ADR-001)
      const auditPayload = {
        tenant_id:   tenantId,
        user_id:     userId,
        action:      'BANK_TRANSACTION_MANUAL',
        entity_type: 'bank_transactions',
        entity_id:   tx.id,
        metadata:    { monto_centavos: montoCentavos, tipo: tipo || 'credito', referencia: referencia || null },
      };
      pool.query(
        `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [auditPayload.tenant_id, auditPayload.user_id, auditPayload.action,
         auditPayload.entity_type, auditPayload.entity_id, JSON.stringify(auditPayload.metadata)],
      ).catch((err) => enqueueAuditLog(auditPayload, err));

      res.json({ message: "Transferencia registrada", transaccion: tx });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // Get conciliation statistics
  app.get("/api/caja/estadisticas-conciliacion", authenticateToken, async (req, res) => {
    if (!hasPermissionForUser((req as any).user, MODULES.PAYMENTS, ACTIONS.READ)) {
      return res.status(403).json({ message: "No tienes permiso para ver estadísticas de conciliación" });
    }
    try {
      const campusId = (req as any).user?.campus_id;
      const [totalRows, conciliadosRows, pendientesRows] = await Promise.all([
        pool.query(`SELECT COUNT(*) as total, COALESCE(SUM(monto_centavos),0) as monto FROM bank_transactions WHERE campus_id=$1`, [campusId]).catch(() => ({ rows: [{ total: 0, monto: 0 }] })),
        pool.query(`SELECT COUNT(*) as total, COALESCE(SUM(monto_centavos),0) as monto FROM bank_transactions WHERE campus_id=$1 AND estado_conciliacion='conciliado'`, [campusId]).catch(() => ({ rows: [{ total: 0, monto: 0 }] })),
        pool.query(`SELECT COUNT(*) as total, COALESCE(SUM(monto_centavos),0) as monto FROM bank_transactions WHERE campus_id=$1 AND estado_conciliacion='pendiente'`, [campusId]).catch(() => ({ rows: [{ total: 0, monto: 0 }] })),
      ]);
      res.json({
        total_transacciones: Number((totalRows.rows[0] as any)?.total || 0),
        monto_total: Number((totalRows.rows[0] as any)?.monto || 0),
        conciliadas: Number((conciliadosRows.rows[0] as any)?.total || 0),
        monto_conciliado: Number((conciliadosRows.rows[0] as any)?.monto || 0),
        pendientes: Number((pendientesRows.rows[0] as any)?.total || 0),
        monto_pendiente: Number((pendientesRows.rows[0] as any)?.monto || 0),
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // Execute automatic conciliation (FIFO)
  app.post("/api/caja/ejecutar-conciliacion", authenticateToken, async (req, res) => {
    try {
      const user     = (req as any).user;
      const campusId = user?.campus_id;
      const tenantId = user?.tenant_id;
      const ROLES_CAJA = ['administrador_general','administrador_campus','super_admin','caja','auxiliar_caja'];
      if (!user?.is_super_admin && !ROLES_CAJA.includes(user?.role)) {
        return res.status(403).json({ message: "Sin permisos para ejecutar conciliación automática" });
      }

      const txRows = await pool.query(`
        SELECT id, monto_centavos, referencia, clabe_ordenante, nombre_ordenante
        FROM bank_transactions
        WHERE campus_id = $1 AND estado_conciliacion = 'pendiente'
          AND tipo = 'credito' AND monto_centavos > 0
        ORDER BY fecha ASC, id ASC
      `, [campusId]).catch(() => ({ rows: [] }));

      const { charges, fpsByClabe, tutoresByFamilyId } =
        await _cargarContextoScoring(tenantId, campusId);

      const consumedIds = new Set<number>();
      let conciliados   = 0;
      let en_revision   = 0; // subset de conciliados con score 90-99
      const sugerencias: any[] = [];

      for (const tx of (txRows.rows as any[])) {
        const candidato = _buscarMejorCandidato(
          { monto_centavos: Number(tx.monto_centavos),
            clabe_ordenante: tx.clabe_ordenante ?? null,
            nombre_ordenante: tx.nombre_ordenante ?? null },
          charges, fpsByClabe, tutoresByFamilyId, consumedIds
        );
        if (!candidato || candidato.score === 0) continue;

        if (candidato.score === 100) {
          // score=100: auto-aplica, confianza máxima — sin revisión adicional
          const pid = await applyReconciliation({
            txId: Number(tx.id), chargeIds: candidato.chargeIds,
            score: candidato.score, familyId: candidato.familyId,
            tenantId, referencia: tx.referencia ?? null,
            clabe_ordenante: tx.clabe_ordenante ?? null,
            nombre_ordenante: tx.nombre_ordenante ?? null,
            monto_tx_centavos: Number(tx.monto_centavos), userId: user?.id ?? null,
          });
          if (pid !== null) {
            candidato.chargeIds.forEach(id => consumedIds.add(id));
            conciliados++;
          }
        } else if (candidato.score >= 90) {
          // score=90-99: auto-aplica, pero queda en cola de revisión de supervisor 24h
          const pid = await applyReconciliation({
            txId: Number(tx.id), chargeIds: candidato.chargeIds,
            score: candidato.score, familyId: candidato.familyId,
            tenantId, referencia: tx.referencia ?? null,
            clabe_ordenante: tx.clabe_ordenante ?? null,
            nombre_ordenante: tx.nombre_ordenante ?? null,
            monto_tx_centavos: Number(tx.monto_centavos), userId: user?.id ?? null,
          });
          if (pid !== null) {
            candidato.chargeIds.forEach(id => consumedIds.add(id));
            conciliados++;
            en_revision++;
          }
        } else if (candidato.score >= 70) {
          // 70-89: sugerencia pre-calculada — el operador confirma con un clic
          sugerencias.push({
            tx_id: Number(tx.id),
            monto_centavos: Number(tx.monto_centavos),
            score: candidato.score,
            charge_ids: candidato.chargeIds,
            family_id: candidato.familyId,
            detalle: {
              monto: candidato.montoScore,
              clabe: candidato.clabeScore,
              nombre: candidato.nombreScore,
            },
          });
        }
        // 0-69: sin acción — queda en la bandeja de aclaración
      }

      res.json({
        conciliados,
        en_revision,
        sugerencias,
        mensaje: `${conciliados} transacciones conciliadas automáticamente`,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  const seleccionarCierreCaja = `
    SELECT cc.id, cc.fecha, cc.efectivo_capturado_centavos,
           cc.efectivo_registrado_centavos, cc.ingresos_bancarios_centavos,
           cc.total_cobrado_centavos, cc.diferencia_efectivo_centavos,
           cc.pagos_procesados, cc.observaciones, cc.created_at,
           cc.closed_by_user_id, u.name AS cerrado_por
    FROM cash_closures cc
    JOIN users u ON u.id = cc.closed_by_user_id
  `;
  const serializarCierreCaja = (cierre: any) => {
    if (!cierre) return null;
    const fecha = cierre.fecha instanceof Date
      ? cierre.fecha.toISOString().slice(0, 10)
      : String(cierre.fecha).slice(0, 10);
    return {
      ...cierre,
      fecha,
      efectivo_capturado_centavos: Number(cierre.efectivo_capturado_centavos),
      efectivo_registrado_centavos: Number(cierre.efectivo_registrado_centavos),
      ingresos_bancarios_centavos: Number(cierre.ingresos_bancarios_centavos),
      total_cobrado_centavos: Number(cierre.total_cobrado_centavos),
      diferencia_efectivo_centavos: Number(cierre.diferencia_efectivo_centavos),
      pagos_procesados: Number(cierre.pagos_procesados),
    };
  };

  // Devuelve el corte confirmado para que la UI no invite a cerrar dos veces.
  app.get("/api/caja/cierre-dia", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!hasPermissionForUser(user, MODULES.PAYMENTS, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para consultar cierres de caja" });
      }
      const campusId = Number(user?.campus_id);
      const tenantId = Number(user?.tenant_id);
      const fecha = typeof req.query.fecha === "string"
        ? req.query.fecha
        : fechaCiudadDeMexico();
      if (!campusId || !tenantId || !esFechaIsoValida(fecha)) {
        return res.status(400).json({ message: "Fecha de cierre inválida" });
      }
      if (!await checkCampusTenant(campusId, tenantId, res)) return;

      const result = await pool.query(
        `${seleccionarCierreCaja}
         WHERE cc.campus_id = $1 AND cc.tenant_id = $2 AND cc.fecha = $3::date
         LIMIT 1`,
        [campusId, tenantId, fecha],
      );
      res.json({ cierre: serializarCierreCaja((result.rows as any[])[0]) });
    } catch {
      res.status(500).json({ message: "Error al consultar el cierre de caja" });
    }
  });

  // Cierre diario: snapshot persistido y auditable. La restricción única de DB
  // garantiza que dos solicitudes concurrentes no cierren el mismo día dos veces.
  app.post("/api/caja/cerrar-dia", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (!hasPermissionForUser(user, MODULES.PAYMENTS, ACTIONS.PROCESS)) {
      return res.status(403).json({ message: "Sin permisos para cerrar caja" });
    }

    const campusId = Number(user?.campus_id);
    const tenantId = Number(user?.tenant_id);
    const userId = Number(user?.id);
    const { fecha: fechaBody, efectivo_capturado_centavos, observaciones } = req.body ?? {};
    const fecha = typeof fechaBody === "string"
      ? fechaBody
      : fechaCiudadDeMexico();
    const efectivoCapturado = Number(efectivo_capturado_centavos);

    if (!campusId || !tenantId || !userId) {
      return res.status(401).json({ message: "La sesión no identifica al usuario que realiza el cierre" });
    }
    if (!esFechaIsoValida(fecha)) {
      return res.status(400).json({ message: "La fecha de cierre no es válida" });
    }
    if (!Number.isSafeInteger(efectivoCapturado) || efectivoCapturado < 0) {
      return res.status(400).json({ message: "Captura un importe de efectivo válido, en centavos" });
    }
    if (observaciones != null && (typeof observaciones !== "string" || observaciones.length > 2_000)) {
      return res.status(400).json({ message: "Las observaciones no son válidas" });
    }
    if (!await checkCampusTenant(campusId, tenantId, res)) return;

    const client = await pool.connect();
    let cierre: any;
    let duplicate = false;
    let transactionError: unknown = null;
    try {
      await client.query("BEGIN");
      const resumen = await client.query(
        `SELECT COUNT(*)::int AS pagos_procesados,
                COALESCE(SUM(p.monto_centavos), 0)::bigint AS total_cobrado_centavos,
                COALESCE(SUM(p.monto_centavos) FILTER (WHERE p.metodo = 'efectivo'), 0)::bigint
                  AS efectivo_registrado_centavos,
                COALESCE(SUM(p.monto_centavos) FILTER (WHERE p.metodo <> 'efectivo'), 0)::bigint
                  AS ingresos_bancarios_centavos
           FROM payments p
           JOIN charges c ON c.id = p.charge_id
           JOIN students s ON s.id = c.student_id
          WHERE s.campus_id = $1
            AND p.estado = 'exitoso'
            AND DATE(p.created_at) = $2::date`,
        [campusId, fecha],
      );
      const snapshot = (resumen.rows as any[])[0];
      const efectivoRegistrado = Number(snapshot.efectivo_registrado_centavos);
      const ingresosBancarios = Number(snapshot.ingresos_bancarios_centavos);
      const totalCobrado = Number(snapshot.total_cobrado_centavos);
      const pagosProcesados = Number(snapshot.pagos_procesados);

      const inserted = await client.query(
        `INSERT INTO cash_closures (
           tenant_id, campus_id, closed_by_user_id, fecha,
           efectivo_capturado_centavos, efectivo_registrado_centavos,
           ingresos_bancarios_centavos, total_cobrado_centavos,
           diferencia_efectivo_centavos, pagos_procesados, observaciones
         ) VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id, fecha, efectivo_capturado_centavos, efectivo_registrado_centavos,
                   ingresos_bancarios_centavos, total_cobrado_centavos,
                   diferencia_efectivo_centavos, pagos_procesados, observaciones, created_at,
                   closed_by_user_id`,
        [
          tenantId, campusId, userId, fecha,
          efectivoCapturado, efectivoRegistrado, ingresosBancarios, totalCobrado,
          efectivoCapturado - efectivoRegistrado, pagosProcesados,
          observaciones?.trim() || null,
        ],
      );
      cierre = (inserted.rows as any[])[0];
      await client.query("COMMIT");
    } catch (error: any) {
      await client.query("ROLLBACK").catch(() => {});
      if (error?.code === "23505") {
        duplicate = true;
      } else {
        transactionError = error;
      }
    } finally {
      client.release();
    }

    if (duplicate) {
      const existente = await pool.query(
        `${seleccionarCierreCaja}
         WHERE cc.campus_id = $1 AND cc.tenant_id = $2 AND cc.fecha = $3::date
         LIMIT 1`,
        [campusId, tenantId, fecha],
      );
      return res.status(409).json({
        message: "La caja de esta fecha ya fue cerrada; no se puede registrar un segundo corte",
        cierre: serializarCierreCaja((existente.rows as any[])[0]),
      });
    }
    if (transactionError) {
      console.error("Error al persistir cierre de caja:", transactionError);
      return res.status(500).json({ message: "Error al registrar el cierre de caja" });
    }

    const auditPayloadCierre: import("../audit-retry").AuditLogPayload = {
      tenant_id: tenantId,
      user_id: userId,
      action: "cash_closure.created",
      entity_type: "cash_closure",
      entity_id: cierre.id,
      new_value: {
        fecha,
        efectivo_capturado_centavos: cierre.efectivo_capturado_centavos,
        diferencia_efectivo_centavos: cierre.diferencia_efectivo_centavos,
      },
      metadata: {
        campus_id: campusId,
        pagos_procesados: cierre.pagos_procesados,
        total_cobrado_centavos: cierre.total_cobrado_centavos,
        ingresos_bancarios_centavos: cierre.ingresos_bancarios_centavos,
      },
    };
    pool.query(
      `INSERT INTO audit_log
         (tenant_id, user_id, action, entity_type, entity_id, new_value, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        auditPayloadCierre.tenant_id, auditPayloadCierre.user_id,
        auditPayloadCierre.action, auditPayloadCierre.entity_type, auditPayloadCierre.entity_id,
        JSON.stringify(auditPayloadCierre.new_value), JSON.stringify(auditPayloadCierre.metadata),
      ],
    ).catch((error) => enqueueAuditLog(auditPayloadCierre, error));

    res.status(201).json({
      message: "Caja cerrada y registrada correctamente",
      cierre: {
        ...serializarCierreCaja(cierre),
        cerrado_por: user?.name ?? user?.email ?? null,
      },
    });
  });

  // ── 3. CONCILIACIÓN BANCARIA SPEI ─────────────────────────────────────────

  // Alias without campusId param (reads from JWT)
  app.get("/api/conciliacion/transacciones", authenticateToken, async (req, res) => {
    if (!hasPermissionForUser((req as any).user, MODULES.PAYMENTS, ACTIONS.READ)) {
      return res.status(403).json({ message: "Sin permisos para ver transacciones bancarias" });
    }
    try {
      const campusId = (req as any).user?.campus_id;
      const rows = await pool.query(`SELECT * FROM bank_transactions WHERE campus_id = $1 ORDER BY fecha DESC, id DESC LIMIT 200`, [campusId]);
      res.json(rows.rows);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  app.get("/api/conciliacion/transacciones/:campusId", authenticateToken, async (req: any, res) => {
    if (!hasPermissionForUser(req.user, MODULES.PAYMENTS, ACTIONS.READ)) {
      return res.status(403).json({ message: "Sin permisos para ver transacciones bancarias" });
    }
    try {
      const campusId = parseInt(req.params.campusId) || req.user?.campus_id;
      if (!await checkCampusTenant(campusId, req.user?.tenant_id, res)) return;
      const rows = await pool.query(`SELECT * FROM bank_transactions WHERE campus_id = $1 ORDER BY fecha DESC, id DESC LIMIT 200`, [campusId]);
      res.json(rows.rows);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── POST /api/conciliacion/importar ──────────────────────────────────────
  //
  // Guard    : PAYMENTS.PROCESS  (mismo que transferencia-manual — dominio financiero)
  // Atomicidad: BEGIN + SAVEPOINT por fila + COMMIT|ROLLBACK  (patrón admin.ts §importar)
  //   • Fila inválida (fecha ausente / monto no numérico) → failed[], continúa
  //   • ON CONFLICT (dedup por referencia, mig-016) → skipped++, no es error
  //   • Error fatal de DB → ROLLBACK completo, 500
  // dry_run  : ROLLBACK + committed=false, mismos conteos
  // tenant_id: desde el JWT (fix — antes se dejaba NULL)
  // Auditoría: enqueueAuditLog post-COMMIT (fire-and-forget, patrón ADR-001)
  app.post("/api/conciliacion/importar", authenticateToken, async (req: any, res) => {
    try {
      const user     = req.user;
      const campusId = user?.campus_id;
      const tenantId = user?.tenant_id ?? null;
      const userId   = user?.id        ?? null;

      // ── Guard ─────────────────────────────────────────────────────────────
      if (!hasPermissionForUser(user, MODULES.PAYMENTS, ACTIONS.PROCESS)) {
        return res.status(403).json({ message: "Sin permisos para importar transacciones bancarias" });
      }

      const { transacciones } = req.body;
      if (!Array.isArray(transacciones) || transacciones.length === 0) {
        return res.status(400).json({ message: "No hay transacciones para importar" });
      }

      // ── dry_run ───────────────────────────────────────────────────────────
      const isDryRun =
        req.query.dry_run === 'true' || req.query.dry_run === '1' ||
        req.body?.dry_run === true   || req.body?.dry_run === 'true';

      // Convertir al formato de insertBankRows (centavos enteros)
      // Validación de fecha/monto permanece aquí para mantener mensajes idénticos
      // a la versión original (los tests IBT comprueban esos mensajes exactos).
      const rowsToInsert: Parameters<typeof insertBankRows>[3] = [];
      const preFailed: string[] = [];

      for (let i = 0; i < transacciones.length; i++) {
        const tx     = transacciones[i];
        const rowNum = i + 1;
        if (!tx.fecha) {
          preFailed.push(`Fila ${rowNum}: fecha requerida`);
          continue;
        }
        const montoNum = parseFloat(tx.monto ?? '0');
        if (isNaN(montoNum)) {
          preFailed.push(`Fila ${rowNum}: monto inválido ("${tx.monto}")`);
          continue;
        }
        rowsToInsert.push({
          fecha:           tx.fecha,
          descripcion:     tx.descripcion      ?? null,
          monto_centavos:  Math.round(montoNum * 100),
          tipo:            tx.tipo             || 'credito',
          referencia:      tx.referencia       ?? null,
          clabe_ordenante: tx.clabe            ?? null,
          nombre_ordenante: tx.nombre          ?? null,
        });
      }

      let successful    = 0;
      let skipped       = 0;
      let failed: string[] = [...preFailed];
      let insertedIds:  number[] = [];

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const ins = await insertBankRows(client, campusId, tenantId, rowsToInsert);
        successful  = ins.successful;
        skipped     = ins.skipped;
        failed      = [...preFailed, ...ins.failed];
        insertedIds = ins.inserted_ids;

        if (isDryRun) {
          await client.query('ROLLBACK');
          return res.json({
            successful,
            skipped,
            failed,
            committed: false,
            mensaje: `dry_run: ${successful} se insertarían, ${skipped} ya existirían, ${failed.length} con error`,
          });
        }

        await client.query('COMMIT');
      } catch (fatalError: any) {
        await client.query('ROLLBACK').catch(() => {});
        client.release();
        return res.status(500).json({ message: "Error interno del servidor" });
      } finally {
        try { client.release(); } catch {}
      }

      // ── Acciones de seguimiento — fire-and-forget post-COMMIT ─────────────
      // Crea una entrada en acciones_seguimiento por cada transacción nueva.
      // ON CONFLICT DO NOTHING garantiza idempotencia: doble importación = sin duplicados.
      if (insertedIds.length > 0 && tenantId && campusId) {
        crearAccionesParaBankTx(campusId, tenantId, insertedIds, userId ?? null);
      }

      // ── Auditoría — fire-and-forget post-COMMIT (ADR-001) ─────────────────
      const auditPayload = {
        tenant_id:   tenantId,
        user_id:     userId,
        action:      'BANK_TRANSACTIONS_IMPORT',
        entity_type: 'bank_transactions',
        entity_id:   campusId,
        metadata:    {
          total:      transacciones.length,
          successful,
          skipped,
          failed_count: failed.length,
        },
      };
      pool.query(
        `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [auditPayload.tenant_id, auditPayload.user_id, auditPayload.action,
         auditPayload.entity_type, auditPayload.entity_id, JSON.stringify(auditPayload.metadata)],
      ).catch((err) => enqueueAuditLog(auditPayload, err));

      res.json({
        successful,
        skipped,
        failed,
        committed: true,
        mensaje: `${successful} transacciones importadas, ${skipped} ya existían, ${failed.length} con error`,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── POST /api/conciliacion/importar-pdf ──────────────────────────────────
  //
  // Recibe un PDF de estado de cuenta bancario (multipart/form-data, campo "pdf"),
  // extrae las transacciones de abono usando el parser del banco indicado, y las
  // inserta en bank_transactions reutilizando insertBankRows.
  //
  // Query params / body:
  //   banco    : "BBVA" (requerido; "Santander" lanza 400 hasta tener CSV)
  //   dry_run  : "true" | "1" → ROLLBACK, devuelve conteos sin commitear
  //
  // Guard    : PAYMENTS.PROCESS (mismo dominio que /importar)
  // Atomicidad: BEGIN + SAVEPOINT por fila + COMMIT|ROLLBACK (via insertBankRows)
  // Seguridad : PDF en memoria (multer memoryStorage) — nunca se persiste en disco
  // Auditoría : enqueueAuditLog post-COMMIT, acción BANK_PDF_IMPORT
  app.post("/api/conciliacion/importar-pdf",
    authenticateToken,
    uploadBinary.single("pdf"),
    async (req: any, res) => {
      try {
        const user     = req.user;
        const campusId = user?.campus_id;
        const tenantId = user?.tenant_id ?? null;
        const userId   = user?.id        ?? null;

        // ── Guard ───────────────────────────────────────────────────────────
        if (!hasPermissionForUser(user, MODULES.PAYMENTS, ACTIONS.PROCESS)) {
          return res.status(403).json({ message: "Sin permisos para importar transacciones bancarias" });
        }

        if (!req.file) {
          return res.status(400).json({ message: "Se requiere un archivo PDF (campo: pdf)" });
        }

        const banco    = ((req.body?.banco ?? req.query.banco ?? "BBVA") as string).trim();
        const isDryRun =
          req.query.dry_run === "true" || req.query.dry_run === "1" ||
          req.body?.dry_run === true   || req.body?.dry_run === "true";

        // ── Parser — lanza si banco no soportado ────────────────────────────
        let parser;
        try {
          parser = getParser(banco);
        } catch (e: any) {
          return res.status(400).json({ message: e.message });
        }

        // ── Parseo del PDF — lanza si sin capa de texto ─────────────────────
        let parseResult;
        try {
          parseResult = await parser.parse(req.file.buffer);
        } catch (e: any) {
          return res.status(422).json({ message: e.message });
        }

        const { transactions, errors: parseErrors, metadata } = parseResult;

        // Sin movimientos ni errores → el PDF estaba vacío o sin tabla
        if (transactions.length === 0 && parseErrors.length === 0) {
          return res.json({
            successful: 0, skipped: 0, failed: [],
            parse_errors: [],
            committed:    false,
            metadata,
            mensaje: "No se encontraron transacciones de abono en el PDF",
          });
        }

        // ── Inserción atómica ────────────────────────────────────────────────
        let successful    = 0;
        let skipped       = 0;
        let failed: string[] = [];
        let insertedIds:  number[] = [];

        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          const ins = await insertBankRows(client, campusId, tenantId, transactions);
          successful  = ins.successful;
          skipped     = ins.skipped;
          failed      = ins.failed;
          insertedIds = ins.inserted_ids;

          if (isDryRun) {
            await client.query("ROLLBACK");
            return res.json({
              successful, skipped, failed,
              parse_errors: parseErrors,
              committed:    false,
              metadata,
              mensaje: `dry_run: ${successful} se insertarían, ${skipped} ya existirían, ${failed.length} con error`,
            });
          }

          await client.query("COMMIT");
        } catch (fatalError: any) {
          await client.query("ROLLBACK").catch(() => {});
          client.release();
          return res.status(500).json({ message: "Error interno del servidor" });
        } finally {
          try { client.release(); } catch {}
        }

        // ── Acciones de seguimiento — fire-and-forget post-COMMIT ─────────────
        if (insertedIds.length > 0 && tenantId && campusId) {
          crearAccionesParaBankTx(campusId, tenantId, insertedIds, userId ?? null);
        }

        // ── Auditoría post-COMMIT (ADR-001) ──────────────────────────────────
        const auditPayload = {
          tenant_id:   tenantId,
          user_id:     userId,
          action:      "BANK_PDF_IMPORT",
          entity_type: "bank_transactions",
          entity_id:   campusId,
          metadata: {
            banco,
            total_parseados:   transactions.length,
            successful,
            skipped,
            failed_count:      failed.length,
            parse_errors:      parseErrors.length,
            periodo_inicio:    metadata.periodo_inicio,
            periodo_fin:       metadata.periodo_fin,
          },
        };
        pool.query(
          `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [auditPayload.tenant_id, auditPayload.user_id, auditPayload.action,
           auditPayload.entity_type, auditPayload.entity_id, JSON.stringify(auditPayload.metadata)],
        ).catch((err) => enqueueAuditLog(auditPayload, err));

        res.json({
          successful, skipped, failed,
          parse_errors: parseErrors,
          committed:    true,
          metadata,
          mensaje: `${successful} transacciones importadas desde PDF ${banco}, ${skipped} ya existían, ${failed.length} con error`,
        });
      } catch (error: any) {
        res.status(500).json({ message: "Error interno del servidor" });
      }
    }
  );

  app.post("/api/conciliacion/auto-match/:campusId", authenticateToken, async (req: any, res) => {
    try {
      const user     = req.user;
      const campusId = parseInt(req.params.campusId) || user?.campus_id;
      const tenantId = user?.tenant_id;
      if (!await checkCampusTenant(campusId, tenantId, res)) return;

      const ROLES_CAJA = ['administrador_general','administrador_campus','super_admin','caja','auxiliar_caja'];
      if (!user?.is_super_admin && !ROLES_CAJA.includes(user?.role)) {
        return res.status(403).json({ message: "Sin permisos para ejecutar conciliación automática" });
      }

      const txRows = await pool.query(`
        SELECT id, monto_centavos, referencia, clabe_ordenante, nombre_ordenante
        FROM bank_transactions
        WHERE campus_id = $1 AND estado_conciliacion = 'pendiente'
          AND tipo = 'credito' AND monto_centavos > 0
        ORDER BY fecha ASC, id ASC
      `, [campusId]);

      const { charges, fpsByClabe, tutoresByFamilyId } =
        await _cargarContextoScoring(tenantId, campusId);

      const consumedIds = new Set<number>();
      let conciliados   = 0;
      let en_revision   = 0; // subset de conciliados con score 90-99
      const sugerencias: any[] = [];

      for (const tx of (txRows.rows as any[])) {
        const candidato = _buscarMejorCandidato(
          { monto_centavos: Number(tx.monto_centavos),
            clabe_ordenante: tx.clabe_ordenante ?? null,
            nombre_ordenante: tx.nombre_ordenante ?? null },
          charges, fpsByClabe, tutoresByFamilyId, consumedIds
        );
        if (!candidato || candidato.score === 0) continue;

        if (candidato.score === 100) {
          // score=100: auto-aplica, confianza máxima — sin revisión adicional
          const pid = await applyReconciliation({
            txId: Number(tx.id), chargeIds: candidato.chargeIds,
            score: candidato.score, familyId: candidato.familyId,
            tenantId, referencia: tx.referencia ?? null,
            clabe_ordenante: tx.clabe_ordenante ?? null,
            nombre_ordenante: tx.nombre_ordenante ?? null,
            monto_tx_centavos: Number(tx.monto_centavos), userId: user?.id ?? null,
          });
          if (pid !== null) {
            candidato.chargeIds.forEach(id => consumedIds.add(id));
            conciliados++;
          }
        } else if (candidato.score >= 90) {
          // score=90-99: auto-aplica, pero queda en cola de revisión de supervisor 24h
          const pid = await applyReconciliation({
            txId: Number(tx.id), chargeIds: candidato.chargeIds,
            score: candidato.score, familyId: candidato.familyId,
            tenantId, referencia: tx.referencia ?? null,
            clabe_ordenante: tx.clabe_ordenante ?? null,
            nombre_ordenante: tx.nombre_ordenante ?? null,
            monto_tx_centavos: Number(tx.monto_centavos), userId: user?.id ?? null,
          });
          if (pid !== null) {
            candidato.chargeIds.forEach(id => consumedIds.add(id));
            conciliados++;
            en_revision++;
          }
        } else if (candidato.score >= 70) {
          sugerencias.push({
            tx_id: Number(tx.id),
            monto_centavos: Number(tx.monto_centavos),
            score: candidato.score,
            charge_ids: candidato.chargeIds,
            family_id: candidato.familyId,
            detalle: {
              monto: candidato.montoScore,
              clabe: candidato.clabeScore,
              nombre: candidato.nombreScore,
            },
          });
        }
      }

      const total = (txRows.rows as any[]).length;
      const noConciliados = total - conciliados - sugerencias.length;
      res.json({
        conciliados,
        en_revision,
        sugerencias,
        no_conciliados: noConciliados,
        no_coinciden: noConciliados,
        total,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── Cola de revisión de supervisor (score 90-99, ventana 24h) ───────────────
  //
  // Devuelve las transacciones que fueron auto-conciliadas con confianza 90-99
  // y cuyo conciliado_at está dentro de las últimas 24 horas.
  // Requiere rol administrativo.  Sin tabla adicional: la cola es una view SQL
  // sobre bank_transactions filtrando confianza_pct BETWEEN 90 AND 99.
  app.get("/api/conciliacion/revision-supervisor", authenticateToken, async (req: any, res) => {
    if (!hasPermissionForUser(req.user, MODULES.PAYMENTS, ACTIONS.PROCESS)) {
      return res.status(403).json({ message: "Sin permisos para ver la cola de revisión de supervisor" });
    }
    try {
      const campusId = req.user?.campus_id;
      if (!campusId) return res.status(400).json({ message: "Campus requerido" });

      const rows = await pool.query(`
        SELECT bt.id, bt.fecha, bt.descripcion, bt.monto_centavos,
               bt.clabe_ordenante, bt.nombre_ordenante,
               bt.confianza_pct, bt.conciliado_at,
               bt.charge_id, bt.payment_id, bt.nota_conciliacion
        FROM bank_transactions bt
        WHERE bt.campus_id = $1
          AND bt.estado_conciliacion = 'conciliado'
          AND bt.confianza_pct BETWEEN 90 AND 99
          AND bt.conciliado_at >= NOW() - INTERVAL '24 hours'
        ORDER BY bt.conciliado_at DESC
      `, [campusId]);

      res.json({
        total: rows.rows.length,
        items: rows.rows,
        ventana_horas: 24,
        descripcion: "Transacciones auto-conciliadas con confianza 90-99 en las últimas 24h. Requieren revisión de supervisor.",
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── GET /api/conciliacion/excepciones/count ───────────────────────────────
  // Conteo mínimo para la insignia de navegación. Evita descargar el dashboard
  // completo sólo para saber cuántas excepciones bancarias hay.
  app.get("/api/conciliacion/excepciones/count", authenticateToken, async (req: any, res) => {
    try {
      const user = req.user;
      const campusId = user?.campus_id;
      const ROLES_OK = ['administrador_general','administrador_campus','super_admin','caja','auxiliar_caja','contador_general','asistente'];
      if (!campusId) return res.status(400).json({ message: "Campus requerido" });
      if (!user?.is_super_admin && !ROLES_OK.includes(user?.role)) {
        return res.status(403).json({ message: "Sin permisos para ver excepciones de conciliación" });
      }

      const result = await pool.query(
        `SELECT COUNT(*)::int AS total_pendiente
         FROM bank_transactions
         WHERE campus_id = $1 AND estado_conciliacion = 'pendiente'`,
        [campusId],
      );
      res.json({ total_pendiente: Number(result.rows[0]?.total_pendiente ?? 0) });
    } catch {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── GET /api/conciliacion/excepciones ─────────────────────────────────────
  // Devuelve transacciones bancarias sin conciliar del campus del usuario.
  // Requiere rol administrativo (no disponible para roles de sólo lectura).
  app.get("/api/conciliacion/excepciones", authenticateToken, async (req: any, res) => {
    try {
      const user      = req.user;
      const campusId  = user?.campus_id;
      const ROLES_OK  = ['administrador_general','administrador_campus','super_admin','caja','auxiliar_caja','contador_general','asistente'];
      if (!campusId) return res.status(400).json({ message: "Campus requerido" });
      if (!user?.is_super_admin && !ROLES_OK.includes(user?.role)) {
        return res.status(403).json({ message: "Sin permisos para ver excepciones de conciliación" });
      }

      const rows = await pool.query(`
        SELECT bt.id, bt.fecha, bt.descripcion, bt.monto_centavos, bt.tipo,
               bt.referencia, bt.clabe_ordenante, bt.nombre_ordenante,
               bt.estado_conciliacion, bt.nota_conciliacion,
               GREATEST(0, NOW()::date - bt.fecha::date) AS dias_sin_conciliar
        FROM bank_transactions bt
        WHERE bt.campus_id = $1 AND bt.estado_conciliacion = 'pendiente'
        ORDER BY bt.fecha ASC, bt.id ASC
      `, [campusId]);

      const cargosRows = await pool.query(`
        SELECT c.id, c.fecha_vencimiento,
               CONCAT(s.nombres, ' ', s.apellido_paterno) AS alumno,
               s.grado,
               ROUND(c.monto_base_centavos * (1 - COALESCE(c.beca_aplicada,0)::numeric/100))
                 + COALESCE(c.recargo_aplicado_centavos,0) AS monto_neto,
               con.nombre AS concepto
        FROM charges c
        JOIN students s ON s.id = c.student_id
        LEFT JOIN concepts con ON con.id = c.concept_id
        WHERE s.campus_id = $1 AND c.estado = 'pendiente'
        ORDER BY c.fecha_vencimiento ASC, s.apellido_paterno ASC
      `, [campusId]);

      res.json({
        excepciones:        rows.rows,
        cargos_disponibles: cargosRows.rows,
        total_pendiente:    rows.rows.length,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── POST /api/conciliacion/excepciones/:id/resolver ───────────────────────
  // Aplica o descarta manualmente una excepción bancaria.
  // Atómico: usa transacción DB con bloqueo de filas para evitar concurrencia.
  // Requiere rol administrativo de caja.
  app.post("/api/conciliacion/excepciones/:id/resolver", authenticateToken, async (req: any, res) => {
    const user      = req.user;
    const txId      = parseInt(req.params.id);
    const campusId  = user?.campus_id;
    const tenantId  = user?.tenant_id;
    const { accion: accionRaw, charge_id, nota, motivo } = req.body;
    // 'descartar' es el alias moderno de 'ignorar'
    const accion = accionRaw === 'descartar' ? 'ignorar' : accionRaw;

    // ── Autorización ──────────────────────────────────────────────────────────
    const ROLES_RESOLVER = ['administrador_general','administrador_campus','super_admin','caja','auxiliar_caja'];
    if (!user?.is_super_admin && !ROLES_RESOLVER.includes(user?.role)) {
      return res.status(403).json({ message: "Sin permisos para resolver excepciones de conciliación" });
    }

    // ── Validación de parámetros (antes de abrir la transacción) ─────────────
    if (!['aplicar', 'ignorar'].includes(accion)) {
      return res.status(400).json({ message: "accion debe ser 'aplicar', 'ignorar' o 'descartar'" });
    }
    if (accion === 'ignorar' && !nota?.trim() && !motivo?.trim()) {
      return res.status(400).json({ message: "Se requiere motivo o nota para descartar" });
    }
    if (accion === 'aplicar' && !charge_id) {
      return res.status(400).json({ message: "Se requiere charge_id para aplicar el pago" });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // ── Bloquear la transacción bancaria (FOR UPDATE) y verificar que sigue pendiente
      const txLock = await client.query(
        `SELECT id, monto_centavos, referencia, campus_id, estado_conciliacion,
                clabe_ordenante, nombre_ordenante
         FROM bank_transactions WHERE id = $1 FOR UPDATE`,
        [txId]
      );
      if (!txLock.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: "Transacción no encontrada" });
      }
      const tx = txLock.rows[0] as any;
      if (tx.campus_id !== campusId) {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: "La transacción no pertenece a tu campus" });
      }
      if (tx.estado_conciliacion !== 'pendiente') {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: `La transacción ya fue ${tx.estado_conciliacion} por otra operación` });
      }

      if (accion === 'aplicar') {
        // ── Bloquear el cargo y verificar que está pendiente
        const chargeLock = await client.query(
          `SELECT c.id,
                  ROUND(c.monto_base_centavos * (1 - COALESCE(c.beca_aplicada,0)::numeric/100))
                    + COALESCE(c.recargo_aplicado_centavos,0) AS monto_neto
           FROM charges c JOIN students s ON s.id = c.student_id
           WHERE c.id = $1 AND s.campus_id = $2 AND c.estado = 'pendiente'
           FOR UPDATE`,
          [charge_id, campusId]
        );
        if (!chargeLock.rows.length) {
          await client.query('ROLLBACK');
          return res.status(404).json({ message: "Cargo no encontrado o ya pagado" });
        }
        const cargo = chargeLock.rows[0] as any;

        // ── Validar que el importe bancario cubre el monto neto del cargo (±100 centavos)
        const diff = Math.abs(Number(tx.monto_centavos) - Number(cargo.monto_neto));
        if (diff > 100) {
          await client.query('ROLLBACK');
          return res.status(422).json({
            message:
              `El importe bancario ($${(Number(tx.monto_centavos)/100).toFixed(2)}) ` +
              `no coincide con el monto neto del cargo ($${(Number(cargo.monto_neto)/100).toFixed(2)}). ` +
              `Diferencia: $${(diff/100).toFixed(2)}. ` +
              `Si es un pago parcial, usa "Marcar como no escolar" con nota y gestiona el cobro por separado.`,
            diff_centavos: diff,
            monto_banco:   Number(tx.monto_centavos),
            monto_cargo:   Number(cargo.monto_neto),
          });
        }

        // ── Crear pago + ledger + cerrar cargo (helper compartido, dentro de la txn) ──
        // El helper hace: INSERT payments, INSERT payment_applications, UPDATE charges.
        // La actualización de bank_transactions se hace abajo porque sus campos difieren
        // de los de applyReconciliation() (sin confianza_pct en txn, nota distinta).
        const paymentId = await insertarPagoYCerrarCargo(client, {
          tenantId,
          chargeId:           charge_id,
          montoNetoCentavos:  Number(cargo.monto_neto),
          metodo:             'spei',
          referencia:         tx.referencia || `BANK-${txId}`,
        });

        // ── Marcar la transacción como conciliada, enlazando charge_id y payment_id
        await client.query(
          `UPDATE bank_transactions
           SET estado_conciliacion = 'conciliado', charge_id = $1, payment_id = $2,
               nota_conciliacion = $3
           WHERE id = $4`,
          [charge_id, paymentId, nota?.trim() || 'Aplicado manualmente por administrador', txId]
        );

        await client.query('COMMIT');
        res.json({ message: "Pago aplicado correctamente al cargo seleccionado", payment_id: paymentId });

        // ── Cerrar acción de seguimiento (fire-and-forget, ADR-001) ────────────
        cerrarAccionBankTx(txId, campusId, 'resuelto',
          nota?.trim() || 'Aplicado manualmente por administrador');

        // ── Audit log (fire-and-forget, ADR-001) ─────────────────────────────
        // Bug corregido: la rama "aplicar" no registraba nada en audit_log.
        // La acción 'resolver_excepcion_manual' distingue esta conciliación manual
        // de 'conciliar_pago_spei' (auto-conciliación con score ≥ 90/100).
        if (tenantId && user?.id) {
          const auditPayloadAplicar = {
            tenant_id:   tenantId,
            user_id:     user.id,
            action:      'resolver_excepcion_manual' as const,
            entity_type: 'bank_transaction' as const,
            entity_id:   txId,
            metadata: {
              charge_id:      charge_id,
              payment_id:     paymentId,
              monto_centavos: Number(tx.monto_centavos),
              monto_neto:     Number(cargo.monto_neto),
              referencia:     tx.referencia || null,
              nota:           nota?.trim() || null,
            },
          };
          pool.query(
            `INSERT INTO audit_log
               (tenant_id, user_id, action, entity_type, entity_id, metadata, created_at)
             VALUES ($1,$2,$3,$4,$5,$6::jsonb,NOW())`,
            [
              auditPayloadAplicar.tenant_id,
              auditPayloadAplicar.user_id,
              auditPayloadAplicar.action,
              auditPayloadAplicar.entity_type,
              auditPayloadAplicar.entity_id,
              JSON.stringify(auditPayloadAplicar.metadata),
            ]
          ).catch((err) => { enqueueAuditLog(auditPayloadAplicar, err); });
        }

        // ── Fase 2: upsert CLABE aprendida + confianza_pct (ADR-001, fuera de txn) ──
        // Se ejecuta SIEMPRE en conciliación exitosa — incluso en aplicación manual.
        if (tx.clabe_ordenante) {
          pool.query(
            `SELECT fs.family_id FROM family_students fs
             JOIN charges c ON c.student_id = fs.student_id
             WHERE c.id = $1 LIMIT 1`,
            [charge_id]
          ).then(famR => {
            const fid = famR.rows[0]?.family_id;
            if (!fid) return;
            pool.query(
              `INSERT INTO family_payment_sources
                 (tenant_id, family_id, clabe, nombre_inferido, confirmaciones, primera_vez_at, ultima_vez_at)
               VALUES ($1,$2,$3,$4,1,NOW(),NOW())
               ON CONFLICT (family_id, clabe) DO UPDATE
                 SET confirmaciones  = family_payment_sources.confirmaciones + 1,
                     nombre_inferido = COALESCE($4, family_payment_sources.nombre_inferido),
                     ultima_vez_at   = NOW()`,
              [tenantId, fid, tx.clabe_ordenante, tx.nombre_ordenante ?? null]
            ).catch(() => {});
            // Guardar monto_score como confianza_pct (aplicación manual = solo señal de monto)
            const diff = Math.abs(Number(tx.monto_centavos) - Number(cargo.monto_neto));
            const ms = _montoScore(diff, 1);
            pool.query(
              `UPDATE bank_transactions SET confianza_pct=$1 WHERE id=$2`,
              [ms, txId]
            ).catch(() => {});
          }).catch(() => {});
        }

      } else {
        // ── descartar/ignorar: marcar como no escolar (motivo obligatorio)
        const notaFinal = nota?.trim() || motivo?.trim() || 'Descartado manualmente';
        await client.query(
          `UPDATE bank_transactions
           SET estado_conciliacion = 'ignorado', nota_conciliacion = $1
           WHERE id = $2`,
          [notaFinal, txId]
        );

        // ── COMMIT primero — el UPDATE debe persistir incluso si el audit falla
        await client.query('COMMIT');
        res.json({ message: "Excepción descartada y registrada en auditoría" });

        // ── Cerrar acción de seguimiento (fire-and-forget, ADR-001) ────────────
        cerrarAccionBankTx(txId, campusId, 'ignorado',
          motivo?.trim() || nota?.trim() || 'Descartado manualmente');

        // ── Audit log FUERA de la transacción ya commitada (fire-and-forget).
        // Usa pool.query() (conexión separada) para que un fallo de FK u otro
        // error de escritura secundaria NO revierta el UPDATE ya persistido.
        // Esto corrige el bug de rollback silencioso: antes el INSERT usaba
        // client.query() dentro de la tx abierta; si fallaba (p.ej. user_id
        // eliminado → FK violation), la pg connection quedaba en estado abortado
        // y el COMMIT posterior ejecutaba un ROLLBACK silencioso, respondiendo
        // HTTP 200 mientras la bank_tx seguía en 'pendiente'.
        if (tenantId && user?.id) {
          const auditPayload = {
            tenant_id:   tenantId,
            user_id:     user.id,
            action:      'descartar_excepcion' as const,
            entity_type: 'bank_transaction' as const,
            entity_id:   txId,
            metadata: {
              motivo:         motivo?.trim() || null,
              nota:           nota?.trim() || null,
              monto_centavos: Number(tx.monto_centavos),
              referencia:     tx.referencia || null,
            },
          };
          pool.query(
            `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata, created_at)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())`,
            [
              auditPayload.tenant_id,
              auditPayload.user_id,
              auditPayload.action,
              auditPayload.entity_type,
              auditPayload.entity_id,
              JSON.stringify(auditPayload.metadata),
            ]
          ).catch((err) => {
            // Primer intento fallido → encolar para reintento con backoff.
            // Si los reintentos también fallan, audit-retry.ts emite log nivel ERROR
            // visible en logs/audit-error.log y en consola (Winston).
            enqueueAuditLog(auditPayload, err);
          });
        }
      }
    } catch (error: any) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(500).json({ message: "Error interno del servidor" });
    } finally {
      client.release();
    }
  });

  // ── 4. FACTURACIÓN MASIVA CFDI ────────────────────────────────────────────
}
