import { afterEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../db", () => ({ pool: mock }));
vi.mock("../assistant-validation", () => ({ runAllProbes: vi.fn() }));
import { executeAction } from "../assistant-actions";

const originalTZ = process.env.TZ;
afterEach(() => {
  vi.useRealTimers();
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

for (const tz of ["UTC", "America/Mexico_City"]) {
  describe(`Resumen mensual con TZ=${tz}`, () => {
    it.each([
      ["2026-11-01T00:31:00Z", "2026-10-01", "2026-11-01"],
      ["2026-11-01T06:01:00Z", "2026-11-01", "2026-12-01"],
    ])("%s consulta el periodo escolar %s a %s", async (instant, from, to) => {
      process.env.TZ = tz;
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(instant));
      mock.query.mockReset().mockResolvedValue({ rows: [{}] });
      const result = await executeAction("query:resumen_ejecutivo_mes", {}, {
        tenantId: 29, campusId: 48, userId: 80,
      });
      expect(result.success).toBe(true);
      expect(mock.query).toHaveBeenCalledOnce();
      expect(mock.query.mock.calls[0][1]).toEqual(expect.arrayContaining([from, to]));
    });
  });
}
