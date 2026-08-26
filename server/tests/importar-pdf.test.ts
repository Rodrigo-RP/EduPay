/**
 * server/tests/importar-pdf.test.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Tests de integración HTTP para POST /api/conciliacion/importar-pdf.
 *
 * Patrón de fixture: idéntico a import-bank-transactions.test.ts (IBT):
 *   tenant + campus propios del archivo, tokens generados sin usuario real,
 *   cleanup en afterAll.
 *
 * IPF-00   sin token → 401
 * IPF-00b  asistente (sin PAYMENTS.PROCESS) → 403
 * IPF-01   sin archivo adjunto → 400
 * IPF-02   banco no reconocido → 400 con mensaje accionable
 * IPF-03   buffer no-PDF → 422 (parser falla al extraer texto)
 * IPF-04   PDF BBVA válido + dry_run=true → 200, committed:false, sin filas en DB
 * IPF-05   commit sin preview o con archivo distinto → 409
 * IPF-05b  PDF BBVA con token de preview → 200, committed:true, fila en DB
 * IPF-06   reenvío del mismo PDF → successful:0, skipped:1 (dedup ON CONFLICT)
 * IPF-07   audit_log registra BANK_PDF_IMPORT con banco, periodo y contadores
 * IPF-08   XML Santander realista + dry_run=true → preview sin filas en DB
 * IPF-09   mismo XML Santander → commit real y fila normalizada en DB
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

let tenantId:       number;
let campusId:       number;
let adminToken:     string;
let asistenteToken: string;

function makeToken(role: string, cid: number, tid: number) {
  return jwt.sign(
    { role, campus_id: cid, tenant_id: tid, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

// ── PDF builder ───────────────────────────────────────────────────────────────
//
// Construye un Buffer PDF mínimo válido con una transacción BBVA posicionada
// en las coordenadas X reales del formato (x=16/61 fechas, x=107 descripción,
// x=420 monto). BBVAParser.parse() lo procesa igual que un PDF real.
//
// Con `referencia`: genera un bloque SPEI de 5 líneas (extrae referencia, CLABE
// y nombre_ordenante). Sin `referencia`: ABONO simple, sin bloque de continuación.
//
// Todos los valores son 100% sintéticos.

function buildBbvaPdf(opts: { monto: string; referencia?: string }): Buffer {
  const { monto, referencia } = opts;

  const cmds: string[] = [];

  // Línea principal (y=700): fecha | fecha | descripcion | monto
  cmds.push(`1 0 0 1 16  700 Tm (14/MAR) Tj`);
  cmds.push(`1 0 0 1 61  700 Tm (14/MAR) Tj`);
  cmds.push(`1 0 0 1 107 700 Tm (${referencia ? "SPEI RECIBIDOBANORTE" : "ABONO RECIBIDO"}) Tj`);
  cmds.push(`1 0 0 1 420 700 Tm (${monto}) Tj`);

  if (referencia) {
    // Continuación SPEI (5 líneas): rastreo+referencia / CLABE / rastreo largo / nombre
    cmds.push(`1 0 0 1 16 690 Tm (PAGO PRUEBA 220033 Referencia ${referencia} 021) Tj`);
    cmds.push(`1 0 0 1 16 680 Tm (072180000101234567) Tj`);
    cmds.push(`1 0 0 1 16 670 Tm (20260314700000TEST000012345) Tj`);
    cmds.push(`1 0 0 1 16 660 Tm (EMPRESA EJEMPLO S.A. DE C.V.) Tj`);
  }

  const stream    = `BT /F1 8 Tf\n${cmds.join("\n")}\nET`;
  const streamLen = Buffer.byteLength(stream, "latin1");

  const objs = [
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n`,
    `4 0 obj\n<< /Length ${streamLen} >>\nstream\n${stream}\nendstream\nendobj\n`,
    `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
  ];

  const header = "%PDF-1.4\n";
  const offsets: number[] = [];
  let pos = Buffer.byteLength(header, "latin1");
  for (const obj of objs) {
    offsets.push(pos);
    pos += Buffer.byteLength(obj, "latin1");
  }

  const xrefPos = pos;
  let xref = `xref\n0 6\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;

  return Buffer.from(header + objs.join("") + xref + trailer, "latin1");
}

function buildSantanderXml(opts: { referencia: string; monto: string }): Buffer {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4">
  <cfdi:Addenda>
    <Santander:addendaECB xmlns:Santander="http://www.santander.com.mx/schemas/xsd/addendaECB">
      <Santander:EstadoDeCuentaBancario version="1.0" numeroCuenta="99887700001" nombreCliente="COLEGIO PRUEBA" periodo="2026-08-31">
        <Santander:Movimientos>
          <Santander:MovimientoECB IdMovto="${opts.referencia}" fecha="2026-08-14" descripcion="ABONO TRANSFERENCIA SPEI PRUEBA" importe="${opts.monto}" monMov="MXN" />
          <Santander:MovimientoECB IdMovto="${opts.referencia}-CARGO" fecha="2026-08-15" descripcion="CARGO PAGO TARJETA CREDITO" importe="125.00" monMov="MXN" />
        </Santander:Movimientos>
      </Santander:EstadoDeCuentaBancario>
    </Santander:addendaECB>
  </cfdi:Addenda>
</cfdi:Comprobante>`, "utf-8");
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function postPdf(
  token:  string | null,
  opts:   {
    file?: Buffer;
    banco?: string;
    dryRun?: boolean;
    fileName?: string;
    mimeType?: string;
    previewToken?: string;
  } = {},
) {
  const {
    file,
    banco = "BBVA",
    dryRun = false,
    fileName = "test.pdf",
    mimeType = "application/pdf",
    previewToken,
  } = opts;
  const params = new URLSearchParams({ banco });
  if (dryRun) params.set("dry_run", "true");
  const url = `${BASE}/api/conciliacion/importar-pdf?${params}`;

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (file !== undefined) {
    const form = new FormData();
    form.append("pdf", new Blob([file], { type: mimeType }), fileName);
    if (previewToken) form.append("preview_token", previewToken);
    body = form;
  }

  const r = await fetch(url, { method: "POST", headers, body });
  return { status: r.status, body: await r.json() as any };
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  const ts = Date.now().toString().slice(-7);
  const ten = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`IPF Tenant ${ts}`, `IPF${ts}`],
  );
  tenantId = ten.rows[0].id;
  const cam = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1,$2) RETURNING id`,
    [tenantId, `IPF Campus ${ts}`],
  );
  campusId = cam.rows[0].id;
  adminToken     = makeToken("administrador_campus", campusId, tenantId);
  asistenteToken = makeToken("asistente",            campusId, tenantId);
});

afterAll(async () => {
  await pool.query(`DELETE FROM bank_transactions WHERE campus_id = $1`, [campusId]);
  await pool.query(`DELETE FROM campuses WHERE id = $1`,  [campusId]);
  await pool.query(`DELETE FROM tenants  WHERE id = $1`,  [tenantId]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

it("IPF-00: sin token → 401", async () => {
  const { status } = await postPdf(null);
  expect(status).toBe(401);
});

it("IPF-00b: asistente (sin PAYMENTS.PROCESS) → 403", async () => {
  const { status } = await postPdf(asistenteToken);
  expect(status, "asistente no debe poder importar PDF bancario").toBe(403);
});

it("IPF-01: sin archivo adjunto → 400", async () => {
  // Admin con token válido pero sin campo 'pdf' en el form
  const { status, body } = await postPdf(adminToken);
  expect(status).toBe(400);
  expect(body.message).toMatch(/archivo/i);
});

it("IPF-02: banco no reconocido → 400 con mensaje accionable", async () => {
  const cualquierBuffer = Buffer.from("x");
  const { status, body } = await postPdf(adminToken, { file: cualquierBuffer, banco: "HSBC" });
  expect(status).toBe(400);
  expect(body.message).toMatch(/HSBC/i);
});

it("IPF-03: buffer no-PDF → 422 (parser no puede extraer texto)", async () => {
  const noEsPdf = Buffer.from("esto no es un archivo PDF valido");
  const { status } = await postPdf(adminToken, { file: noEsPdf, dryRun: true });
  expect(status).toBe(422);
});

it("IPF-04: PDF BBVA válido con dry_run=true → 200, committed:false, sin filas en DB", async () => {
  const pdf = buildBbvaPdf({ monto: "4,200.00" });

  const before = await pool.query(
    `SELECT COUNT(*)::int AS n FROM bank_transactions WHERE campus_id = $1`,
    [campusId],
  );
  const countBefore = before.rows[0].n as number;

  const { status, body } = await postPdf(adminToken, { file: pdf, dryRun: true });

  expect(status).toBe(200);
  expect(body.committed).toBe(false);
  expect(body.successful).toBeGreaterThanOrEqual(1);

  const after = await pool.query(
    `SELECT COUNT(*)::int AS n FROM bank_transactions WHERE campus_id = $1`,
    [campusId],
  );
  expect(after.rows[0].n, "dry_run no debe insertar filas").toBe(countBefore);
});

it("IPF-05: commit sin preview o con archivo distinto → 409 y no inserta", async () => {
  const original = buildBbvaPdf({ monto: "8,100.00", referencia: `TOKEN${Date.now()}` });
  const distinto = buildBbvaPdf({ monto: "8,200.00", referencia: `OTRO${Date.now()}` });

  const direct = await postPdf(adminToken, { file: original });
  expect(direct.status).toBe(409);
  expect(direct.body.message).toMatch(/vista previa/i);

  const preview = await postPdf(adminToken, { file: original, dryRun: true });
  expect(preview.status).toBe(200);
  expect(preview.body.preview_token).toEqual(expect.any(String));

  const mismatch = await postPdf(adminToken, {
    file: distinto,
    previewToken: preview.body.preview_token,
  });
  expect(mismatch.status).toBe(409);
  expect(mismatch.body.message).toMatch(/no corresponde/i);
});

it("IPF-05b: PDF BBVA con token de preview → 200, committed:true, fila en bank_transactions", async () => {
  const pdf = buildBbvaPdf({ monto: "9,000.00" });
  const preview = await postPdf(adminToken, { file: pdf, dryRun: true });
  expect(preview.status).toBe(200);
  expect(preview.body.preview_token).toEqual(expect.any(String));

  const { status, body } = await postPdf(adminToken, {
    file: pdf,
    previewToken: preview.body.preview_token,
  });

  expect(status).toBe(200);
  expect(body.committed).toBe(true);
  expect(body.successful).toBeGreaterThanOrEqual(1);
  expect(body.failed ?? []).toHaveLength(0);

  const row = await pool.query(
    `SELECT tenant_id FROM bank_transactions
     WHERE campus_id = $1 ORDER BY id DESC LIMIT 1`,
    [campusId],
  );
  expect(row.rows[0]?.tenant_id).toBe(tenantId);
});

it("IPF-06: reenvío del mismo PDF → successful:0, skipped≥1 (dedup ON CONFLICT)", async () => {
  // Genera una referencia única por corrida para evitar colisiones con otros tests
  const ref = `IPFREF${Date.now()}`;
  const pdf = buildBbvaPdf({ monto: "3,500.00", referencia: ref });

  const firstPreview = await postPdf(adminToken, { file: pdf, dryRun: true });
  const first = await postPdf(adminToken, {
    file: pdf,
    previewToken: firstPreview.body.preview_token,
  });
  expect(first.status).toBe(200);
  expect(first.body.successful).toBeGreaterThanOrEqual(1);

  const secondPreview = await postPdf(adminToken, { file: pdf, dryRun: true });
  const second = await postPdf(adminToken, {
    file: pdf,
    previewToken: secondPreview.body.preview_token,
  });
  expect(second.status).toBe(200);
  expect(second.body.successful,
    "el segundo import del mismo PDF no debe insertar filas nuevas").toBe(0);
  expect(second.body.skipped).toBeGreaterThanOrEqual(1);
});

it("IPF-07: audit_log registra BANK_PDF_IMPORT con banco, periodo y contadores", async () => {
  const pdf = buildBbvaPdf({ monto: "2,100.00" });
  const preview = await postPdf(adminToken, { file: pdf, dryRun: true });
  await postPdf(adminToken, { file: pdf, previewToken: preview.body.preview_token });

  // Sondeo con espera corta para el INSERT fire-and-forget post-COMMIT (ADR-001)
  let auditRow: any = null;
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 150));
    const r = await pool.query(
      `SELECT metadata::text AS meta FROM audit_log
       WHERE action = 'BANK_PDF_IMPORT' AND entity_id = $1
       ORDER BY id DESC LIMIT 1`,
      [campusId],
    );
    if (r.rows.length > 0) { auditRow = r.rows[0]; break; }
  }

  expect(auditRow, "audit_log debe tener entrada BANK_PDF_IMPORT").not.toBeNull();
  expect(auditRow.meta).toContain('"banco"');
  expect(auditRow.meta).toContain('"successful"');
  expect(auditRow.meta).toContain('"periodo_inicio"');
});

it("IPF-08: XML Santander realista con dry_run=true → preview sin filas en DB", async () => {
  const referencia = `SAN-DRY-${Date.now()}`;
  const xml = buildSantanderXml({ referencia, monto: "4321.09" });
  const before = await pool.query(
    `SELECT COUNT(*)::int AS n FROM bank_transactions WHERE campus_id = $1 AND referencia = $2`,
    [campusId, referencia],
  );

  const { status, body } = await postPdf(adminToken, {
    file: xml,
    banco: "Santander",
    dryRun: true,
    fileName: "estado-cuenta-santander.xml",
    mimeType: "application/xml",
  });

  expect(status).toBe(200);
  expect(body.committed).toBe(false);
  expect(body.successful).toBe(1);
  expect(body.skipped).toBe(0);
  expect(body.failed).toEqual([]);
  expect(body.parse_errors).toEqual([]);
  expect(body.metadata).toMatchObject({
    banco: "Santander",
    periodo_inicio: "2026-08-14",
    periodo_fin: "2026-08-31",
    total_abonos_centavos: 432109,
  });

  const after = await pool.query(
    `SELECT COUNT(*)::int AS n FROM bank_transactions WHERE campus_id = $1 AND referencia = $2`,
    [campusId, referencia],
  );
  expect(after.rows[0].n).toBe(before.rows[0].n);
});

it("IPF-09: XML Santander realista → commit real y fila normalizada en DB", async () => {
  const referencia = `SAN-COMMIT-${Date.now()}`;
  const xml = buildSantanderXml({ referencia, monto: "7654.32" });

  const preview = await postPdf(adminToken, {
    file: xml,
    banco: "Santander",
    dryRun: true,
    fileName: "estado-cuenta-santander.xml",
    mimeType: "application/xml",
  });
  expect(preview.status).toBe(200);
  expect(preview.body.committed).toBe(false);
  expect(preview.body.successful).toBe(1);

  const committed = await postPdf(adminToken, {
    file: xml,
    banco: "Santander",
    fileName: "estado-cuenta-santander.xml",
    mimeType: "application/xml",
    previewToken: preview.body.preview_token,
  });
  expect(committed.status).toBe(200);
  expect(committed.body.committed).toBe(true);
  expect(committed.body.successful).toBe(1);
  expect(committed.body.skipped).toBe(0);
  expect(committed.body.failed).toEqual([]);
  expect(committed.body.parse_errors).toEqual([]);

  const row = await pool.query(
    `SELECT tenant_id, fecha::text, descripcion, monto_centavos, tipo, referencia,
            clabe_ordenante, nombre_ordenante
       FROM bank_transactions
      WHERE campus_id = $1 AND referencia = $2`,
    [campusId, referencia],
  );
  expect(row.rows).toHaveLength(1);
  expect(row.rows[0]).toMatchObject({
    tenant_id: tenantId,
    fecha: "2026-08-14",
    descripcion: "ABONO TRANSFERENCIA SPEI PRUEBA",
    monto_centavos: "765432",
    tipo: "credito",
    referencia,
    clabe_ordenante: null,
    nombre_ordenante: null,
  });
});
