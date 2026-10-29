import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ execute: vi.fn(async (_statement: unknown) => ({ rows: [] })) }));
vi.mock("../db", () => ({ db: { execute: mocks.execute } }));
import { cleanupObsoleteData } from "../optimize-database";
import { SECURITY_EVENTS_RETENTION_DAYS } from "../lib/security-retention";
it("cleanup usa el único plazo de 365 días; sólo tres operaciones no financieras", async () => {
  expect(SECURITY_EVENTS_RETENTION_DAYS).toBe(365);
  expect((await cleanupObsoleteData()).success).toBe(true);
  const statements = mocks.execute.mock.calls.map(call => JSON.stringify(call[0]));
  expect(statements).toHaveLength(3);
  expect(statements[1]).toContain("security_events");
  expect((mocks.execute.mock.calls[1][0] as any).queryChunks).toContain(365);
  expect(statements[1]).not.toContain("90 days");
  expect(statements[0]).toContain("sessions");
  expect(statements[2]).toContain("approval_notifications");
});
