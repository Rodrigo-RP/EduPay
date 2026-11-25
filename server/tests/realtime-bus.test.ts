/**
 * server/tests/realtime-bus.test.ts
 * Capa: Vitest contra PostgreSQL real desechable (marcador edupay:test; el globalSetup bloquea cualquier otra base).
 *
 * Valida con LISTEN/NOTIFY reales lo que las pruebas aisladas solo ven con una conexión simulada: que un aviso publicado
 * desde OTRA conexión (como haría el Job de sincronización o la otra instancia de Cloud Run) llega al oyente, que no
 * transporta datos y que tras detener el oyente ya no recibe nada.
 */
import { describe, expect, it } from "vitest";
import { pool } from "../db";
import { decodeChange, publishDataChange, startRealtimeListener, type DataChange } from "../lib/realtime-bus";

const waitFor = async (cond: () => boolean, ms = 5000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("tiempo agotado esperando el aviso");
    await new Promise((r) => setTimeout(r, 25));
  }
};

describe("Aviso de cambios entre conexiones (PostgreSQL real)", () => {
  it("un aviso publicado desde otra conexión llega al oyente, solo con escuela y origen", async () => {
    const seen: DataChange[] = [];
    const listener = startRealtimeListener(pool, (c) => seen.push(c));
    try {
      // Publica hasta que el LISTEN esté activo (la conexión del oyente se abre de forma asíncrona).
      let tries = 0;
      while (seen.length === 0 && tries++ < 80) {
        await publishDataChange(pool, { tenantId: 42, source: "sync" });
        await new Promise((r) => setTimeout(r, 50));
      }
      await waitFor(() => seen.length > 0);
      expect(seen[0]).toEqual({ tenantId: 42, source: "sync" });
      expect(decodeChange(JSON.stringify({ t: 42, s: "sync", extra: "ignorado" }))).toEqual({ tenantId: 42, source: "sync" });
    } finally {
      listener.stop();
    }
  });

  it("al detenerse, el oyente ya no recibe avisos", async () => {
    const seen: DataChange[] = [];
    const listener = startRealtimeListener(pool, (c) => seen.push(c));
    let tries = 0;
    while (seen.length === 0 && tries++ < 80) {
      await publishDataChange(pool, { tenantId: 7, source: "api" });
      await new Promise((r) => setTimeout(r, 50));
    }
    await waitFor(() => seen.length > 0);
    listener.stop();
    const before = seen.length;
    await publishDataChange(pool, { tenantId: 7, source: "api" });
    await new Promise((r) => setTimeout(r, 300));
    expect(seen.length).toBe(before);
  });
});
