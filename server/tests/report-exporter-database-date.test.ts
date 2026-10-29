import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { assertTestDatabase } from "../lib/database-safety";
import { formatCellValue } from "../lib/report-exporter";
import { schoolDateSQL } from "../../shared/school-date";

neonConfig.webSocketConstructor = ws;
const reader = new Pool({ connectionString: process.env.DATABASE_URL });

beforeAll(async () => { await assertTestDatabase(reader); });
afterAll(async () => { await reader.end(); });

describe("Fechas reales del controlador PostgreSQL al exportar", () => {
  it("DATE devuelve Date y conserva 28/10/2026 con cualquier TZ del proceso", async () => {
    const { rows } = await reader.query<{ d: Date }>("SELECT '2026-10-28'::date AS d");
    expect(rows[0].d).toBeInstanceOf(Date);
    expect(formatCellValue(rows[0].d, "date")).toBe("28/10/2026");
  });

  it("timestamp de día de negocio conserva sus getters locales", async () => {
    const { rows } = await reader.query<{ d: Date }>(
      "SELECT '2026-10-28 00:00:00'::timestamp AS d",
    );
    expect(rows[0].d).toBeInstanceOf(Date);
    expect(formatCellValue(rows[0].d, "date")).toBe("28/10/2026");
  });

  it("un instante UTC sin zona se convierte en SQL antes de exportar", async () => {
    const { rows } = await reader.query<{ d: Date }>(
      `SELECT ${schoolDateSQL("'2026-10-29 01:30:00'::timestamp")} AS d`,
    );
    expect(rows[0].d).toBeInstanceOf(Date);
    expect(formatCellValue(rows[0].d, "date")).toBe("28/10/2026");
  });
});
