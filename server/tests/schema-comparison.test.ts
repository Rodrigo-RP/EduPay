import { describe, expect, it } from "vitest";
import { CATALOG_QUERIES, compareSchemaCatalog } from "../../scripts/lib/schema-catalog";

describe("comparación exacta del catálogo", () => {
  it("compara las 12 categorías y conserva diferencias textuales", () => {
    expect(Object.keys(CATALOG_QUERIES)).toHaveLength(12);
    expect(Object.values(CATALOG_QUERIES).some(sql => sql.includes("NOT LIKE 'pg_%'"))).toBe(false);
    expect(compareSchemaCatalog({ columns: [{ type: "bigint" }] }, { columns: [{ type: "numeric" }] })).toEqual(["columns"]);
    expect(compareSchemaCatalog({ constraints: [{ definition: "CHECK (a::text)" }] }, { constraints: [{ definition: "CHECK ((a)::text)" }] })).toEqual(["constraints"]);
  });
  it("no omite esquemas, objetos extra ni estados NOT VALID", () => {
    expect(compareSchemaCatalog({ schemas: [] }, { schemas: [], extra: [] })).toEqual(["extra"]);
    expect(compareSchemaCatalog({ constraints: [{ validated: true }] }, { constraints: [{ validated: false }] })).toEqual(["constraints"]);
    expect(compareSchemaCatalog({ indexes: [] }, { indexes: [] })).toEqual([]);
  });
});
