import { beforeEach, describe, expect, it, vi } from "vitest";
import { initAuditRetryQueue } from "../audit-retry";

const query = vi.hoisted(() => vi.fn<
  (sql: string) => Promise<{ rows: unknown[] }>
>());
vi.mock("../db", () => ({ pool: { query } }));

beforeEach(() => {
  query.mockReset();
});

describe("Comprobación de audit_retry_queue sin DDL de arranque", () => {
  it("comprueba las ocho columnas mediante SELECT sin crear ni alterar objetos", async () => {
    query.mockResolvedValue({ rows: [] });
    await initAuditRetryQueue();
    expect(query).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[0][0].replace(/\s+/g, " ").trim();
    expect(sql).toBe(
      "SELECT id, payload, attempts, max_attempts, last_error, status, " +
      "created_at, next_retry_at FROM audit_retry_queue LIMIT 0",
    );
    expect(sql).not.toMatch(/\b(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\b/i);
  });

  it("propaga el error si la tabla no está disponible, sin intentar crearla", async () => {
    const missingTable = new Error("La tabla requerida no existe");
    query.mockRejectedValue(missingTable);
    await expect(initAuditRetryQueue()).rejects.toBe(missingTable);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
