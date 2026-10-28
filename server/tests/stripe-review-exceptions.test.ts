import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { pool } from "../db";
import { registerConciliacionRoutes } from "../routes/conciliacion";
import { reviewFixture } from "./helpers/stripe-review-fixtures";

const app = express();
registerConciliacionRoutes(app);
let own: Awaited<ReturnType<typeof reviewFixture>>;
let foreign: Awaited<ReturnType<typeof reviewFixture>>;
let otherCampus: number;
let actor: number;
const user = () => ({ id: actor, tenant_id: own.tenant, campus_id: own.campus, role: "administrador_general" });
async function invoke(path: string, actor = user(), body = {}, id?: number) {
  const route = app._router.stack.find((layer: any) => layer.route?.path === path).route;
  const res: any = { statusCode: 200, status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; return this; } };
  await route.stack.at(-1).handle({ user: actor, params: { id: String(id) }, body }, res);
  return res;
}
const resolvePath = "/api/conciliacion/excepciones/stripe/:id/resolver";
const body = { accion: "resolved_manual", justificacion: "  Revisado con la familia  ",
  confirmacion_inicial: true, confirmacion_final: true };
const auditCount = async (id: number) => Number((await pool.query(
  "SELECT COUNT(*) AS n FROM audit_log WHERE entity_type='payment_event' AND entity_id=$1 AND action='STRIPE_REVIEW_RESOLVED_MANUAL'", [id])).rows[0].n);

beforeAll(async () => {
  own = await reviewFixture();
  foreign = await reviewFixture();
  actor = (await pool.query("SELECT id FROM users ORDER BY id LIMIT 1")).rows[0].id;
  otherCampus = (await pool.query("INSERT INTO campuses (tenant_id,nombre) VALUES ($1,'Otro campus de prueba Stripe') RETURNING id", [own.tenant])).rows[0].id;
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  if (otherCampus) await pool.query("DELETE FROM campuses WHERE id=$1", [otherCampus]);
  await foreign?.cleanup();
  await own?.cleanup();
});

describe("Cobros Stripe por revisar: aislamiento, resolución e integridad", () => {
  it("incluye datos y contador; ignora metadata.campus_id y usa el campus del cargo", async () => {
    const event = await own.event({ metadataCampus: foreign.campus });
    const list = await invoke("/api/conciliacion/excepciones");
    const item = list.body.excepciones.find((item: any) => item.event_id === event.id);
    expect(list.statusCode).toBe(200);
    expect(item).toMatchObject({ alumno: own.name, monto_centavos: 12345,
      fecha: "2026-10-28", payment_intent_id: event.pi.id,
      descripcion: "Stripe cobró, pero el pago no se pudo aplicar al cargo" });
    expect(item.concepto).toContain("Concepto Stripe");
    const count = await invoke("/api/conciliacion/excepciones/count");
    expect(count.body.total_pendiente).toBe(list.body.total_pendiente);
    for (const scope of [{ tenant_id: foreign.tenant, campus_id: foreign.campus },
      { tenant_id: own.tenant, campus_id: otherCampus }]) {
      const denied = await invoke("/api/conciliacion/excepciones", { ...user(), ...scope });
      expect(denied.body.excepciones.some((item: any) => item.event_id === event.id)).toBe(false);
      expect((await invoke("/api/conciliacion/excepciones/count", { ...user(), ...scope })).body.total_pendiente).toBe(0);
      expect((await invoke(resolvePath, { ...user(), ...scope }, body, event.id)).statusCode).toBe(404);
    }
  });
  it("acepta payload de webhook, omite JSON roto y estados no pendientes", async () => {
    const event = await own.event({ wrapper: true });
    const broken = await own.event({ payload: "no es JSON" });
    const processed = await own.event({ status: "processed" });
    const oversized = await own.event();
    await pool.query("UPDATE payment_events SET payload=$1 WHERE id=$2",
      [JSON.stringify({ ...oversized.pi, metadata: { ...oversized.pi.metadata, charge_id: String(Number.MAX_SAFE_INTEGER) } }), oversized.id]);
    const result = await invoke("/api/conciliacion/excepciones");
    const ids = result.body.excepciones.map((item: any) => item.event_id);
    expect(ids).toContain(event.id);
    expect(ids).not.toContain(broken.id);
    expect(ids).not.toContain(processed.id);
    expect(ids).not.toContain(oversized.id);
  });
  it("sin permiso no lista, cuenta ni resuelve", async () => {
    const denied = { ...user(), role: "guardian" };
    for (const path of ["/api/conciliacion/excepciones", "/api/conciliacion/excepciones/count", resolvePath]) {
      expect((await invoke(path, denied, body, 1)).statusCode).toBe(403);
    }
  });
  it("sin justificación o sin ambas confirmaciones devuelve 400 sin cambios", async () => {
    const event = await own.event();
    const before = await own.snapshot();
    for (const invalid of [{ ...body, justificacion: " " }, { ...body, confirmacion_inicial: false },
      { ...body, confirmacion_final: false }, { ...body, accion: "saldo_a_favor" }]) {
      expect((await invoke(resolvePath, user(), invalid, event.id)).statusCode).toBe(400);
    }
    expect(await own.snapshot()).toEqual(before);
    expect(await auditCount(event.id)).toBe(0);
    expect((await invoke(resolvePath, user(), body, Number.MAX_SAFE_INTEGER)).statusCode).toBe(400);
  });
  it("reintento y concurrencia: una transición, una auditoría y ningún pago/cambio de cargo", async () => {
    const event = await own.event();
    const before = await own.snapshot();
    const replies = await Promise.all([invoke(resolvePath, user(), body, event.id), invoke(resolvePath, user(), body, event.id)]);
    expect(replies.map(r => r.statusCode)).toEqual([200, 200]);
    expect(replies.map(r => r.body.duplicate).sort()).toEqual([false, true]);
    expect((await invoke(resolvePath, user(), body, event.id)).body.duplicate).toBe(true);
    expect(await auditCount(event.id)).toBe(1);
    expect((await pool.query("SELECT status FROM payment_events WHERE id=$1", [event.id])).rows[0].status).toBe("resolved_manual");
    expect(await own.snapshot()).toEqual(before);
    expect((await invoke("/api/conciliacion/excepciones")).body.excepciones.some((e: any) => e.event_id === event.id)).toBe(false);
  });
  it("si falla auditoría revierte resolución, sin guardar éxito parcial", async () => {
    const event = await own.event();
    const before = await own.snapshot();
    const client = await pool.connect();
    const query = client.query.bind(client);
    vi.spyOn(pool, "connect").mockResolvedValueOnce({
      query: (sql: any, params?: any) => String(sql).includes("INSERT INTO audit_log")
        ? Promise.reject(new Error("Fallo simulado de auditoría")) : query(sql, params),
      release: () => client.release(),
    } as any);
    expect((await invoke(resolvePath, user(), body, event.id)).statusCode).toBe(500);
    expect((await pool.query("SELECT status FROM payment_events WHERE id=$1", [event.id])).rows[0].status).toBe("requires_review");
    expect(await auditCount(event.id)).toBe(0);
    expect(await own.snapshot()).toEqual(before);
  });
});
