import { afterAll, beforeAll, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { pool } from "../db";
import { JWT_SECRET } from "../routes/shared";

const BASE = "http://localhost:5000";
let tenantId: number;
let campusId: number;
let conceptId: number;
let ruleId: number;
let token: string;

async function api(method: string, path: string, body?: object) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  const suffix = String(Date.now()).slice(-8);
  tenantId = Number((await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`Tenant config acumulación ${suffix}`, `TCA${suffix}`],
  )).rows[0].id);
  campusId = Number((await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1,$2) RETURNING id`,
    [tenantId, `Campus config acumulación ${suffix}`],
  )).rows[0].id);
  conceptId = Number((await pool.query(
    `INSERT INTO concepts
      (tenant_id, campus_id, nombre, tipo, periodicidad, monto_centavos, iva)
     VALUES ($1,$2,$3,'colegiatura','mensual',10000,false)
     RETURNING id`,
    [tenantId, campusId, `Colegiatura configuración ${suffix}`],
  )).rows[0].id);
  token = jwt.sign(
    { role: "administrador_campus", tenant_id: tenantId, campus_id: campusId },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
});

afterAll(async () => {
  await pool.query(`DELETE FROM payment_surcharge_rules WHERE campus_id = $1`, [campusId]);
  await pool.query(`DELETE FROM concepts WHERE id = $1`, [conceptId]);
  await pool.query(`DELETE FROM campuses WHERE id = $1`, [campusId]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
});

describe("API de configuración de recargos acumulables", () => {
  it("crea y devuelve un incremento fijo mensual", async () => {
    const result = await api("POST", "/api/payment-config/surcharge-rules-complete", {
      concepto_id: conceptId,
      dias_gracia: 3,
      tipo_calculo: "porcentaje_fijo",
      porcentaje_recargo: 10,
      monto_maximo: 500,
      modo_acumulacion: "incremento_fijo",
      tipo_incremento_mensual: "monto",
      incremento_mensual: 150,
      fecha_inicio_acumulacion: "2026-08-01",
      activo: true,
    });

    expect(result.status).toBe(201);
    expect(result.body.modo_acumulacion).toBe("incremento_fijo");
    expect(result.body.tipo_incremento_mensual).toBe("monto");
    expect(result.body.incremento_mensual).toBe(150);
    expect(result.body.fecha_inicio_acumulacion).toBe("2026-08-01");
    ruleId = result.body.id;

    const persisted = await pool.query(
      `SELECT modo_acumulacion, tipo_incremento_mensual, incremento_mensual_centavos,
              fecha_inicio_acumulacion
         FROM payment_surcharge_rules WHERE id = $1`,
      [ruleId],
    );
    expect(persisted.rows[0]).toMatchObject({
      modo_acumulacion: "incremento_fijo",
      tipo_incremento_mensual: "monto",
      incremento_mensual_centavos: 15_000,
    });
  });

  it("expone esos campos en la lectura de configuración", async () => {
    const result = await api("GET", "/api/payment-config/surcharge-rules-complete");
    expect(result.status).toBe(200);
    expect(result.body).toContainEqual(expect.objectContaining({
      id: ruleId,
      modo_acumulacion: "incremento_fijo",
      incremento_mensual: 150,
    }));
  });

  it("permite cambiar a compuesto y limpia los datos del incremento fijo", async () => {
    const result = await api("PUT", `/api/payment-config/surcharge-rules-complete/${ruleId}`, {
      concepto_id: conceptId,
      dias_gracia: 3,
      tipo_calculo: "porcentaje_fijo",
      porcentaje_recargo: 10,
      monto_maximo: 500,
      modo_acumulacion: "compuesto",
      fecha_inicio_acumulacion: "2026-08-01",
      activo: true,
    });

    expect(result.status).toBe(200);
    expect(result.body.modo_acumulacion).toBe("compuesto");
    expect(result.body.tipo_incremento_mensual).toBeNull();
    expect(result.body.incremento_mensual).toBe("");
  });

  it("rechaza acumulación fija sin fecha de activación", async () => {
    const result = await api("POST", "/api/payment-config/surcharge-rules-complete", {
      concepto_id: conceptId,
      dias_gracia: 0,
      tipo_calculo: "porcentaje_fijo",
      porcentaje_recargo: 10,
      modo_acumulacion: "incremento_fijo",
      tipo_incremento_mensual: "monto",
      incremento_mensual: 150,
      activo: true,
    });

    expect(result.status).toBe(400);
    expect(result.body.message).toMatch(/fecha de inicio/i);
  });
});