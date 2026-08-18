/**
 * CIC — campus_invoicing_config tabla, constraints, y comportamiento honesto de endpoints
 *
 * Pruebas:
 *   CIC-01  Tabla existe con todas las columnas y defaults esperados
 *   CIC-02  INSERT básico devuelve defaults correctos (estado='pendiente', proveedor='facturapi')
 *   CIC-03  Segundo INSERT para el mismo campus_id viola UNIQUE → error pg 23505
 *   CIC-04  UPSERT actualiza la fila existente sin duplicar
 *   CIC-05  Campuses distintos admiten filas independientes
 *   CIC-06  ON DELETE CASCADE: borrar el campus elimina la config de facturación
 *   CIC-07  invoices tiene las nuevas columnas xml_content y pdf_base64
 *   CIC-08  POST /api/fiscal/timbrar-lote → 503 cuando no hay adaptador configurado
 *   CIC-09  POST /api/fiscal/regenerar-cfdi/:id → 503 cuando no hay adaptador configurado
 *   CIC-10  POST /api/fiscal/cancelar-cfdi → 503 cuando no hay adaptador configurado
 *   CIC-11  POST /api/fiscal/registrar-organizacion → 503 cuando no hay adaptador configurado
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";
const BASE = "http://localhost:5000";

// ── fixtures ─────────────────────────────────────────────────────────────────
let tenantId:  number;
let campusA:   number;
let campusB:   number;
let configId:  number;

// JWT de admin para probar los endpoints HTTP
// Usa tenant/campus/user del seed demo (campus_id=48, tenant_id=29, user_id=80)
// para garantizar que FISCAL.CONFIGURE esté disponible
const adminToken = jwt.sign(
  { id: 80, role: 'administrador_campus', campus_id: 48, tenant_id: 29 },
  JWT_SECRET,
  { expiresIn: '1h' },
);

beforeAll(async () => {
  const ten = await pool.query<{ id: number }>(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ('Tenant CIC019', 'CIC019RFC001X') RETURNING id`,
  );
  tenantId = ten.rows[0].id;

  const [cA, cB] = await Promise.all([
    pool.query<{ id: number }>(
      `INSERT INTO campuses (tenant_id, nombre) VALUES ($1, 'Campus CIC-A') RETURNING id`,
      [tenantId],
    ),
    pool.query<{ id: number }>(
      `INSERT INTO campuses (tenant_id, nombre) VALUES ($1, 'Campus CIC-B') RETURNING id`,
      [tenantId],
    ),
  ]);
  campusA = cA.rows[0].id;
  campusB = cB.rows[0].id;
});

afterAll(async () => {
  // Cascade elimina campus_invoicing_config al borrar campuses
  await pool.query(`DELETE FROM campuses WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM tenants  WHERE id = $1`,        [tenantId]);
});

// ── tests de tabla ────────────────────────────────────────────────────────────

describe("campus_invoicing_config — tabla y constraints", () => {

  it("CIC-01: tabla existe con todas las columnas y defaults esperados", async () => {
    const res = await pool.query<{
      column_name: string; data_type: string;
      column_default: string | null; is_nullable: string;
    }>(
      `SELECT column_name, data_type, column_default, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'campus_invoicing_config'
       ORDER BY ordinal_position`,
    );
    const cols = res.rows.map((r) => r.column_name);

    // Columnas de identidad y FK
    expect(cols).toContain("id");
    expect(cols).toContain("campus_id");
    expect(cols).toContain("tenant_id");

    // Columnas de proveedor y organización
    expect(cols).toContain("proveedor");
    expect(cols).toContain("organizacion_id");
    expect(cols).toContain("rfc");
    expect(cols).toContain("razon_social");

    // Columnas de configuración fiscal
    expect(cols).toContain("regimen_fiscal");
    expect(cols).toContain("uso_cfdi_default");
    expect(cols).toContain("timbrado_automatico");
    expect(cols).toContain("ambiente");
    expect(cols).toContain("fecha_vencimiento_csd");

    // Columnas de estado
    expect(cols).toContain("estado");
    expect(cols).toContain("ultimo_error");
    expect(cols).toContain("created_at");
    expect(cols).toContain("updated_at");

    // Defaults
    const provRow = res.rows.find((r) => r.column_name === "proveedor");
    expect(provRow?.column_default).toContain("facturapi");

    const estadoRow = res.rows.find((r) => r.column_name === "estado");
    expect(estadoRow?.column_default).toContain("pendiente");

    const ambienteRow = res.rows.find((r) => r.column_name === "ambiente");
    expect(ambienteRow?.column_default).toContain("sandbox");

    const timbradoRow = res.rows.find((r) => r.column_name === "timbrado_automatico");
    expect(timbradoRow?.column_default).toMatch(/false/i);

    // organizacion_id es nullable (no se tiene hasta registrar el CSD)
    const orgRow = res.rows.find((r) => r.column_name === "organizacion_id");
    expect(orgRow?.is_nullable).toBe("YES");
  });

  it("CIC-02: INSERT básico devuelve defaults correctos", async () => {
    const res = await pool.query<{
      id: number; proveedor: string; organizacion_id: string | null;
      estado: string; ambiente: string; timbrado_automatico: boolean;
      regimen_fiscal: string; uso_cfdi_default: string;
    }>(
      `INSERT INTO campus_invoicing_config (campus_id, tenant_id)
       VALUES ($1, $2)
       RETURNING id, proveedor, organizacion_id, estado, ambiente,
                 timbrado_automatico, regimen_fiscal, uso_cfdi_default`,
      [campusA, tenantId],
    );
    const row = res.rows[0];
    configId = row.id;

    expect(row.proveedor).toBe("facturapi");
    expect(row.organizacion_id).toBeNull();
    expect(row.estado).toBe("pendiente");
    expect(row.ambiente).toBe("sandbox");
    expect(row.timbrado_automatico).toBe(false);
    expect(row.regimen_fiscal).toBe("601");
    expect(row.uso_cfdi_default).toBe("D10");
  });

  it("CIC-03: segundo INSERT para el mismo campus_id viola UNIQUE (pg 23505)", async () => {
    await expect(
      pool.query(
        `INSERT INTO campus_invoicing_config (campus_id, tenant_id) VALUES ($1, $2)`,
        [campusA, tenantId],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("CIC-04: UPSERT actualiza sin duplicar — ON CONFLICT (campus_id) DO UPDATE", async () => {
    const res = await pool.query<{ id: number; organizacion_id: string; estado: string }>(
      `INSERT INTO campus_invoicing_config
         (campus_id, tenant_id, organizacion_id, rfc, razon_social, estado)
       VALUES ($1, $2, 'org_test_CIC019', 'TST010101001', 'Test S.A. de C.V.', 'activo')
       ON CONFLICT (campus_id) DO UPDATE SET
         organizacion_id = EXCLUDED.organizacion_id,
         rfc             = EXCLUDED.rfc,
         razon_social    = EXCLUDED.razon_social,
         estado          = EXCLUDED.estado,
         updated_at      = now()
       RETURNING id, organizacion_id, estado`,
      [campusA, tenantId],
    );
    const row = res.rows[0];

    // Mismo id — no creó fila nueva
    expect(row.id).toBe(configId);
    expect(row.organizacion_id).toBe("org_test_CIC019");
    expect(row.estado).toBe("activo");

    // Verificar que solo hay UNA fila
    const count = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM campus_invoicing_config WHERE campus_id = $1`,
      [campusA],
    );
    expect(Number(count.rows[0].cnt)).toBe(1);
  });

  it("CIC-05: campuses distintos admiten filas independientes", async () => {
    await pool.query(
      `INSERT INTO campus_invoicing_config (campus_id, tenant_id) VALUES ($1, $2)`,
      [campusB, tenantId],
    );
    const count = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM campus_invoicing_config WHERE tenant_id = $1`,
      [tenantId],
    );
    expect(Number(count.rows[0].cnt)).toBe(2); // campusA + campusB
  });

  it("CIC-06: ON DELETE CASCADE — borrar campus elimina su config de facturación", async () => {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO campuses (tenant_id, nombre) VALUES ($1, 'Campus CIC-Ephemeral') RETURNING id`,
      [tenantId],
    );
    const ephId = rows[0].id;
    await pool.query(
      `INSERT INTO campus_invoicing_config (campus_id, tenant_id) VALUES ($1, $2)`,
      [ephId, tenantId],
    );
    const before = await pool.query(
      `SELECT id FROM campus_invoicing_config WHERE campus_id = $1`, [ephId],
    );
    expect(before.rowCount).toBe(1);

    await pool.query(`DELETE FROM campuses WHERE id = $1`, [ephId]);

    const after = await pool.query(
      `SELECT id FROM campus_invoicing_config WHERE campus_id = $1`, [ephId],
    );
    expect(after.rowCount).toBe(0);
  });

  it("CIC-07: invoices tiene las columnas xml_content y pdf_base64 (mig-019)", async () => {
    const res = await pool.query<{ column_name: string; is_nullable: string }>(
      `SELECT column_name, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'invoices' AND column_name IN ('xml_content','pdf_base64')
       ORDER BY column_name`,
    );
    const cols = res.rows.map((r) => r.column_name);
    expect(cols).toContain("xml_content");
    expect(cols).toContain("pdf_base64");

    // Ambas nullable — los CFDIs anteriores o simulados no tienen contenido real
    for (const row of res.rows) {
      expect(row.is_nullable).toBe("YES");
    }
  });
});

// ── tests de comportamiento honesto de endpoints ──────────────────────────────
// El campus 48 (seed demo) no tiene campus_invoicing_config con estado='activo',
// así que todos los endpoints de timbrado deben devolver 503 honestamente.

describe("endpoints de timbrado — 503 honesto sin adaptador real", () => {

  it("CIC-08: POST /api/fiscal/timbrar-lote → 503 sin adaptador", async () => {
    // Asegurarse de que no hay config activa para campus 48
    await pool.query(
      `DELETE FROM campus_invoicing_config WHERE campus_id = 48`,
    ).catch(() => {}); // no-op si no existe

    const r = await fetch(`${BASE}/api/fiscal/timbrar-lote`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ payment_ids: [1] }),
    });
    expect(r.status).toBe(503);
    const body = await r.json() as any;
    // Debe incluir un code explicativo, nunca un éxito simulado
    expect(body.code).toBeDefined();
    expect(body.message).toBeDefined();
    // Confirmar que NO hay UUID 'DEMO-...' ni 'REGEN-...' en la respuesta
    expect(JSON.stringify(body)).not.toMatch(/DEMO-|REGEN-/);
  });

  it("CIC-09: POST /api/fiscal/regenerar-cfdi/:id → 503 sin adaptador", async () => {
    const r = await fetch(`${BASE}/api/fiscal/regenerar-cfdi/1`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(503);
    const body = await r.json() as any;
    expect(body.code).toBeDefined();
    expect(JSON.stringify(body)).not.toMatch(/DEMO-|REGEN-/);
  });

  it("CIC-10: POST /api/fiscal/cancelar-cfdi → 503 sin adaptador", async () => {
    const r = await fetch(`${BASE}/api/fiscal/cancelar-cfdi`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ invoice_id: 1, motivo: '02' }),
    });
    expect(r.status).toBe(503);
    const body = await r.json() as any;
    expect(body.code).toBeDefined();
  });

  it("CIC-11: POST /api/fiscal/registrar-organizacion → 503 sin adaptador (no hay env var)", async () => {
    // Envía un multipart mínimo — debe fallar en el factory antes de llamar al proveedor
    const form = new FormData();
    // Simulamos archivos válidos en nombre/extensión
    form.append('cer', new Blob(['fake-cer-content'], { type: 'application/octet-stream' }), 'certificado.cer');
    form.append('key', new Blob(['fake-key-content'], { type: 'application/octet-stream' }), 'llave.key');
    form.append('password', 'contraseña-test');
    form.append('proveedor', 'facturapi');

    const r = await fetch(`${BASE}/api/fiscal/registrar-organizacion`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: form,
    });
    // Debe ser 503 (env var FACTURAPI_SECRET_KEY no configurada)
    // o 400 (si la validación de archivos falla antes del factory — también es honesto)
    expect([400, 503]).toContain(r.status);
    const body = await r.json() as any;
    // En ningún caso debe simular un éxito
    expect(body.organizacion_id).toBeUndefined();
    expect(body.estado).not.toBe('activo');
  });
});
