/**
 * Cierre diario de Caja — persistencia y control de duplicados.
 *
 * Verifica el contrato completo: el operador capturado, la fecha y el usuario
 * quedan guardados; el audit log recibe evidencia; el índice único evita un
 * segundo cierre aunque la UI o dos solicitudes intenten enviarlo.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { pool } from "../db";
import { JWT_SECRET } from "../routes/shared";

const BASE = "http://localhost:5000";

let tenantId: number;
let campusId: number;
let userId: number;
let token: string;
let closureId: number;

async function post(path: string, body: object) {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function get(path: string) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: response.status, body: await response.json() };
}

async function esperarAuditoriaCierre(id: number): Promise<boolean> {
  for (let intentos = 0; intentos < 20; intentos++) {
    const result = await pool.query(
      `SELECT 1 FROM audit_log
        WHERE tenant_id = $1 AND entity_type = 'cash_closure' AND entity_id = $2
        LIMIT 1`,
      [tenantId, id],
    );
    if (result.rows.length > 0) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

beforeAll(async () => {
  const suffix = String(Date.now()).slice(-9);
  const tenant = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1, $2) RETURNING id`,
    [`Cierre Caja Test ${suffix}`, `CCT${suffix}`],
  );
  tenantId = Number((tenant.rows as any[])[0].id);

  const campus = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1, $2) RETURNING id`,
    [tenantId, "Campus Cierre Caja"],
  );
  campusId = Number((campus.rows as any[])[0].id);

  const user = await pool.query(
    `INSERT INTO users (email, password_hash, name, role, campus_id, tenant_id)
     VALUES ($1, $2, $3, 'administrador_campus', $4, $5)
     RETURNING id`,
    [`cierre-caja-${suffix}@test.edu.mx`, "test-hash", "Operador de cierre", campusId, tenantId],
  );
  userId = Number((user.rows as any[])[0].id);
  token = jwt.sign(
    {
      id: userId,
      email: `cierre-caja-${suffix}@test.edu.mx`,
      role: "administrador_campus",
      campus_id: campusId,
      tenant_id: tenantId,
      type: "user",
    },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
});

afterAll(async () => {
  await pool.query(`DELETE FROM audit_log WHERE tenant_id = $1`, [tenantId]).catch(() => {});
  await pool.query(`DELETE FROM cash_closures WHERE campus_id = $1`, [campusId]).catch(() => {});
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]).catch(() => {});
  await pool.query(`DELETE FROM campuses WHERE id = $1`, [campusId]).catch(() => {});
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]).catch(() => {});
});

describe("POST /api/caja/cerrar-dia", () => {
  const fecha = "2026-08-25";

  it("persiste el efectivo capturado, el usuario, la fecha y la auditoría", async () => {
    const result = await post("/api/caja/cerrar-dia", {
      fecha,
      efectivo_capturado_centavos: 12_345,
      observaciones: "Conteo verificado por operador",
    });

    expect(result.status).toBe(201);
    expect(result.body.cierre).toMatchObject({
      fecha,
      efectivo_capturado_centavos: 12_345,
      efectivo_registrado_centavos: 0,
      ingresos_bancarios_centavos: 0,
      diferencia_efectivo_centavos: 12_345,
      pagos_procesados: 0,
      closed_by_user_id: userId,
      observaciones: "Conteo verificado por operador",
    });
    closureId = Number(result.body.cierre.id);

    const persisted = await pool.query(
      `SELECT fecha, efectivo_capturado_centavos, closed_by_user_id, observaciones
         FROM cash_closures
        WHERE id = $1 AND campus_id = $2 AND tenant_id = $3`,
      [closureId, campusId, tenantId],
    );
    expect(persisted.rows).toHaveLength(1);
    const fechaPersistida = persisted.rows[0].fecha instanceof Date
      ? persisted.rows[0].fecha.toISOString().slice(0, 10)
      : String(persisted.rows[0].fecha).slice(0, 10);
    expect(fechaPersistida).toBe(fecha);
    expect(Number(persisted.rows[0].efectivo_capturado_centavos)).toBe(12_345);
    expect(Number(persisted.rows[0].closed_by_user_id)).toBe(userId);
    expect(persisted.rows[0].observaciones).toBe("Conteo verificado por operador");
    expect(await esperarAuditoriaCierre(closureId)).toBe(true);
  });

  it("expone el cierre confirmado y bloquea un segundo cierre del mismo día", async () => {
    const consulta = await get(`/api/caja/cierre-dia?fecha=${fecha}`);
    expect(consulta.status).toBe(200);
    expect(consulta.body.cierre).toMatchObject({
      id: closureId,
      fecha,
      efectivo_capturado_centavos: 12_345,
      closed_by_user_id: userId,
      cerrado_por: "Operador de cierre",
    });

    const duplicado = await post("/api/caja/cerrar-dia", {
      fecha,
      efectivo_capturado_centavos: 99_999,
    });
    expect(duplicado.status).toBe(409);
    expect(duplicado.body.message).toMatch(/ya fue cerrada/i);
    expect(duplicado.body.cierre).toMatchObject({
      id: closureId,
      efectivo_capturado_centavos: 12_345,
    });

    const count = await pool.query(
      `SELECT COUNT(*)::int AS total
         FROM cash_closures
        WHERE campus_id = $1 AND fecha = $2::date`,
      [campusId, fecha],
    );
    expect(Number((count.rows as any[])[0].total)).toBe(1);
  });

  it("rechaza un cierre que no incluya efectivo capturado", async () => {
    const result = await post("/api/caja/cerrar-dia", { fecha: "2026-08-26" });
    expect(result.status).toBe(400);
    expect(result.body.message).toMatch(/importe de efectivo/i);
  });
});