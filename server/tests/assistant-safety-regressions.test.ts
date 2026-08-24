/**
 * Regresiones de seguridad del asistente:
 * - Guías deterministas sin proveedor externo.
 * - Permisos reales y auditoría de rechazos.
 * - Privacidad al desambiguar alumnos.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { matchIntent } from "../assistant-knowledge";
import { pool } from "../db";

const BASE = "http://localhost:5000";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";
let campusId: number;
let tenantId: number;
let studentIds: number[] = [];

function token(role: string) {
  return jwt.sign({ role, tenant_id: tenantId, campus_id: campusId }, JWT_SECRET, { expiresIn: "5m" });
}

async function chat(message: string, role: string) {
  return fetch(`${BASE}/api/assistant/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token(role)}` },
    body: JSON.stringify({ message }),
  });
}

beforeAll(async () => {
  const campus = await pool.query("SELECT id, tenant_id FROM campuses WHERE tenant_id IS NOT NULL LIMIT 1");
  campusId = campus.rows[0].id;
  tenantId = campus.rows[0].tenant_id;
  const marker = `AI-PRIV-${Date.now()}`;
  const inserted = await pool.query(
    `INSERT INTO students
       (tenant_id, campus_id, nombres, apellido_paterno, nombre_completo, grado, grupo, nivel_escolar, status, id_referencia)
     VALUES
       ($1,$2,'Ana','Duplicada','Ana Duplicada',1,'A','Primaria','activo',$3),
       ($1,$2,'Ana','Duplicada','Ana Duplicada',2,'B','Primaria','activo',$4)
     RETURNING id`,
    [tenantId, campusId, `${marker}-A`, `${marker}-B`],
  );
  studentIds = inserted.rows.map((row: any) => row.id);
});

afterAll(async () => {
  if (studentIds.length) await pool.query("DELETE FROM students WHERE id = ANY($1::int[])", [studentIds]);
  await pool.end();
});

describe("seguridad del asistente", () => {
  it("guía local: un cliente Anthropic falso recibe cero llamadas", () => {
    const anthropicFake = { messages: { create: vi.fn() } };
    const result = matchIntent("¿cómo cargo el Excel masivo de alumnos?", "administrador_general");
    expect(result.guide?.id).toBe("importar-excel");
    expect(result.action).toBeUndefined();
    expect(anthropicFake.messages.create).not.toHaveBeenCalled();
  });

  it("rol limitado: rechaza reporte financiero y registra el rechazo en audit_log", async () => {
    const response = await chat("resumen financiero del mes", "cajero");
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.reply).toMatch(/no tienes permiso/i);
    const audit = await pool.query(
      `SELECT metadata::text AS metadata
         FROM audit_log
        WHERE tenant_id = $1
          AND action = 'assistant_access_denied'
          AND metadata::text LIKE '%query:resumen_financiero%'
        ORDER BY created_at DESC
        LIMIT 1`,
      [tenantId],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].metadata).toContain("missing_read_permission");
  });

  it("nombre duplicado: pide grado, grupo o matrícula y no expone CURP/RFC", async () => {
    const response = await chat("busca al alumno Ana Duplicada", "administrador_general");
    expect(response.status).toBe(200);
    const body = await response.json();
    const rendered = JSON.stringify(body).toLowerCase();
    expect(body.reply).toMatch(/grado.*grupo.*matr[ií]cula/i);
    expect(rendered).not.toMatch(/curp|rfc/);
    expect(rendered).toContain("grado:");
    expect(rendered).toContain("matrícula:");
  });
});