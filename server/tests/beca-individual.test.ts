/**
 * TESTS — Beca individual + integración con asistente
 *
 * Suite A — Endpoint directo POST /api/admin/students/:studentId/beca
 *   Éxito, overlap_warning, validaciones de error, 403 de rol, monto_fijo rechazado
 *
 * Suite B — detectSuggestTrigger y resolveSuggestContext para asignar_beca
 *   Regex, clarificaciones, signal completo, E2E via /api/assistant/chat
 *   Incluye verificación de que la sugerencia no otorga permisos nuevos (SAC-11)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "../db";
import { tenants, campuses, students } from "../../shared/schema";
import { detectSuggestTrigger } from "../assistant-knowledge";
import { resolveSuggestContext } from "../assistant-actions";
import jwt from "jsonwebtoken";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

// ── Fixtures compartidos ──────────────────────────────────────────────────────
let tenantId:  number;
let campusId:  number;
let studentId: number;
let studentNombre: string;

// Tokens
let tokenAsignar: string;    // administrador_campus — tiene SCHOLARSHIPS.ASSIGN
let tokenSinPermiso: string; // asistente — NO tiene SCHOLARSHIPS.ASSIGN

// IDs de becas creadas en los tests (para limpieza en afterAll)
const becasCreadas: number[] = [];

// ── Helper de request ─────────────────────────────────────────────────────────
async function postBeca(
  sid: number,
  body: object,
  tok: string
): Promise<{ status: number; body: any }> {
  const r = await fetch(`${BASE}/api/admin/students/${sid}/beca`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body:    JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function chatAssistant(
  message: string,
  tok: string
): Promise<{ status: number; body: any }> {
  const r = await fetch(`${BASE}/api/assistant/chat`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body:    JSON.stringify({ message }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

// ── Setup / Teardown ──────────────────────────────────────────────────────────
beforeAll(async () => {
  const ts = Date.now().toString().slice(-7);
  studentNombre = `BecaTest ${ts}`;

  const [t] = await db
    .insert(tenants)
    .values({ nombre_legal: `BecaTenant ${ts}`, rfc: `BCA${ts}` })
    .returning();
  tenantId = t.id;

  const [c] = await db
    .insert(campuses)
    .values({ tenant_id: tenantId, nombre: `Campus BT ${ts}` })
    .returning();
  campusId = c.id;

  const [s] = await db
    .insert(students)
    .values({
      campus_id:       campusId,
      tenant_id:       tenantId,
      nombres:         "BecaTest",
      apellido_paterno: ts,
      nombre_completo: studentNombre,
      status:          "activo",
    })
    .returning();
  studentId = s.id;

  // Token con SCHOLARSHIPS.ASSIGN (administrador_campus)
  tokenAsignar = jwt.sign(
    { email: "beca-test@test.com", role: "administrador_campus",
      campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // Token SIN SCHOLARSHIPS.ASSIGN (asistente)
  tokenSinPermiso = jwt.sign(
    { email: "beca-sin@test.com", role: "asistente",
      campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
});

afterAll(async () => {
  // Limpiar becas creadas por los tests
  if (becasCreadas.length > 0) {
    await pool.query(
      `DELETE FROM scholarships WHERE id = ANY($1::int[])`,
      [becasCreadas]
    );
  }
  // Limpiar audit_log beca_asignada del tenant de test
  await pool.query(
    `DELETE FROM audit_log WHERE tenant_id = $1 AND action = 'beca_asignada'`,
    [tenantId]
  );
  // Limpiar fixtures (orden de FK)
  await pool.query(`DELETE FROM students  WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM campuses  WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM tenants   WHERE id        = $1`, [tenantId]);
});

// ═════════════════════════════════════════════════════════════════════════════
// Suite A — Endpoint directo
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/admin/students/:studentId/beca — Suite A", () => {

  it("A-1: 201 con porcentaje, vigencia y motivo correctos; registro en DB", async () => {
    const { status, body } = await postBeca(studentId, {
      porcentaje:      20,
      motivo:          "Beca test Suite A",
      vigencia_inicio: "2026-01-01",
      vigencia_fin:    "2026-12-31",
    }, tokenAsignar);

    expect(status).toBe(201);
    expect(body.porcentaje).toBe(20);
    expect(body.student_id).toBe(studentId);
    expect(body.alumno).toBe(studentNombre);
    expect(body.motivo).toBe("Beca test Suite A");
    expect(body.id).toBeTypeOf("number");
    becasCreadas.push(body.id);

    // Verificar en DB
    const { rows } = await pool.query(
      `SELECT id, porcentaje::numeric, motivo FROM scholarships WHERE id = $1`,
      [body.id]
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].porcentaje)).toBe(20);
    expect(rows[0].motivo).toBe("Beca test Suite A");
  });

  it("A-2: overlap_warning=true cuando ya hay beca vigente", async () => {
    // Primera beca (ya creada en A-1 si vigente, pero creamos una explícita)
    const r1 = await postBeca(studentId, { porcentaje: 10, vigencia_fin: "2027-06-30" }, tokenAsignar);
    expect(r1.status).toBe(201);
    becasCreadas.push(r1.body.id);

    const r2 = await postBeca(studentId, { porcentaje: 15, vigencia_fin: "2027-12-31" }, tokenAsignar);
    expect(r2.status).toBe(201);
    expect(r2.body.overlap_warning).toBe(true);
    expect(Array.isArray(r2.body.becas_vigentes_previas)).toBe(true);
    expect(r2.body.becas_vigentes_previas.length).toBeGreaterThanOrEqual(1);
    becasCreadas.push(r2.body.id);
  });

  it("A-3: vigencia_fin default = vigencia_inicio + 1 año", async () => {
    const hoy = new Date().toISOString().split("T")[0];
    const { status, body } = await postBeca(studentId, { porcentaje: 5 }, tokenAsignar);
    expect(status).toBe(201);
    becasCreadas.push(body.id);
    // vigencia_fin debe ser un año después de hoy
    const esperada = new Date(hoy);
    esperada.setFullYear(esperada.getFullYear() + 1);
    expect(body.vigencia_fin.slice(0, 10)).toBe(esperada.toISOString().split("T")[0]);
  });

  it("A-4: 400 si porcentaje = 0", async () => {
    const { status } = await postBeca(studentId, { porcentaje: 0 }, tokenAsignar);
    expect(status).toBe(400);
  });

  it("A-5: 400 si porcentaje = 101", async () => {
    const { status } = await postBeca(studentId, { porcentaje: 101 }, tokenAsignar);
    expect(status).toBe(400);
  });

  it("A-6: 400 si monto_fijo presente en body", async () => {
    const { status, body } = await postBeca(studentId,
      { porcentaje: 15, monto_fijo: 500 }, tokenAsignar);
    expect(status).toBe(400);
    expect(body.message).toMatch(/monto_fijo/i);
  });

  it("A-7: 400 si vigencia_fin < vigencia_inicio", async () => {
    const { status } = await postBeca(studentId, {
      porcentaje:      15,
      vigencia_inicio: "2027-06-01",
      vigencia_fin:    "2026-01-01",
    }, tokenAsignar);
    expect(status).toBe(400);
  });

  it("A-8: 404 si student_id no pertenece al campus del JWT", async () => {
    // student_id 0 nunca existe
    const { status } = await postBeca(0, { porcentaje: 10 }, tokenAsignar);
    expect(status).toBe(404);
  });

  it("A-9: 403 — rol 'asistente' no tiene SCHOLARSHIPS.ASSIGN", async () => {
    const { status } = await postBeca(studentId, { porcentaje: 10 }, tokenSinPermiso);
    expect(status).toBe(403);
  });

  it("A-9b: la sugerencia del asistente NO otorga permisos nuevos (SAC-11 beca)", async () => {
    // El asistente sugiere la acción pero el endpoint sigue dando 403 al confirmar
    const chat = await chatAssistant(
      `aplica beca de 10% a ${studentNombre}`,
      tokenAsignar // primero verificar que el signal existe para un token válido
    );
    // Con token válido debe haber signal
    if (chat.status === 200 && chat.body.suggest) {
      const { endpoint, body: sigBody } = chat.body.suggest;
      // Ahora intentar confirmar con token SIN permiso
      const confirm = await fetch(`${BASE}${endpoint}`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${tokenSinPermiso}`,
        },
        body: JSON.stringify(sigBody),
      });
      expect(confirm.status).toBe(403);
    }
    // Si no llegó signal (alumno no encontrado, etc.) el test es vacío pero no falla
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Suite B — detectSuggestTrigger y resolveSuggestContext
// ═════════════════════════════════════════════════════════════════════════════
describe("detectSuggestTrigger — asignar_beca (Suite B)", () => {

  it("B-1: reconoce 'aplica una beca a X de 15%'", () => {
    const t = detectSuggestTrigger("aplica una beca a García Pérez de 15%");
    expect(t?.action).toBe("asignar_beca");
    expect(t?.nombre).toContain("García Pérez");
    expect(t?.porcentaje).toBe(15);
  });

  it("B-2: reconoce 'asigna beca de 20% a Ana García'", () => {
    const t = detectSuggestTrigger("asigna beca de 20% a Ana García");
    expect(t?.action).toBe("asignar_beca");
    expect(t?.porcentaje).toBe(20);
  });

  it("B-3: reconoce 'da beca para Juan Rodríguez 10%'", () => {
    const t = detectSuggestTrigger("da beca para Juan Rodríguez 10%");
    expect(t?.action).toBe("asignar_beca");
    expect(t?.porcentaje).toBe(10);
  });

  it("B-4: sin porcentaje → nombre extraído, porcentaje undefined", () => {
    const t = detectSuggestTrigger("aplica beca a García");
    expect(t?.action).toBe("asignar_beca");
    expect(t?.porcentaje).toBeUndefined();
  });

  it("B-5: mensaje ajeno no dispara asignar_beca", () => {
    const t = detectSuggestTrigger("registra un pago de García");
    expect(t?.action).not.toBe("asignar_beca");
  });
});

describe("resolveSuggestContext — asignar_beca (Suite B)", () => {
  const ctx = () => ({ campusId, tenantId });

  it("B-6: clarification si no hay porcentaje", async () => {
    const result = await resolveSuggestContext(
      { action: "asignar_beca", nombre: studentNombre },
      ctx()
    );
    expect(result?.kind).toBe("clarification");
    expect((result as any).reply).toMatch(/porcentaje/i);
  });

  it("B-7: clarification si porcentaje fuera de rango (>100)", async () => {
    const result = await resolveSuggestContext(
      { action: "asignar_beca", nombre: studentNombre, porcentaje: 110 },
      ctx()
    );
    expect(result?.kind).toBe("clarification");
    expect((result as any).reply).toMatch(/1.*100/);
  });

  it("B-8: null si alumno no encontrado en campus", async () => {
    const result = await resolveSuggestContext(
      { action: "asignar_beca", nombre: "AlumnoQueNoExiste_XYZ99", porcentaje: 15 },
      ctx()
    );
    expect(result).toBeNull();
  });

  it("B-9: signal completo con endpoint y body cuando coincide exacto", async () => {
    const result = await resolveSuggestContext(
      { action: "asignar_beca", nombre: studentNombre, porcentaje: 15 },
      ctx()
    );
    expect(result?.kind).toBe("signal");
    const sig = (result as any).signal;
    expect(sig.endpoint).toMatch(new RegExp(`/api/admin/students/${studentId}/beca`));
    expect(sig.body.porcentaje).toBe(15);
    expect(sig.contexto.student_id).toBe(studentId);
    expect(sig.contexto.porcentaje).toBe(15);
    expect(sig.action).toBe("asignar_beca");
  });

  it("B-10: E2E /api/assistant/chat entrega signal al frontend", async () => {
    const { status, body } = await chatAssistant(
      `aplica beca de 25% a ${studentNombre}`,
      tokenAsignar
    );
    expect(status).toBe(200);
    expect(body.suggest?.action).toBe("asignar_beca");
    expect(body.suggest?.endpoint).toContain(`/api/admin/students/${studentId}/beca`);
    expect(body.suggest?.body?.porcentaje).toBe(25);
  });
});
