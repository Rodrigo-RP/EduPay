import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import path from "node:path";

// ÚNICA excepción aprobada: reemplazo demo con superadministrador,
// APP_ENV no production, ALLOW_DEMO_SEED=true y marcador test/demo.
const exceptions = new Set(["POST /api/demo/seed"]);

describe("Las rutas de expedientes no borran familias, tutores ni alumnos", () => {
  it("no hay DELETE de entidades ni SQL destructivo en las rutas, salvo el seed autorizado por nombre", () => {
    const directory = path.resolve(process.cwd(), "routes");
    const inspected: string[] = [];
    for (const name of readdirSync(directory).filter(n => n.endsWith(".ts"))) {
      const text = readFileSync(path.join(directory, name), "utf8");
      const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
      function visit(node: ts.Node) {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
            ["get", "post", "patch", "put", "delete"].includes(node.expression.name.text) &&
            node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
          const method = node.expression.name.text.toUpperCase();
          const route = `${method} ${node.arguments[0].text}`;
          inspected.push(route);
          if (!exceptions.has(route)) {
            expect(method === "DELETE" && /\/(?:families|guardians|students|familias|tutores|alumnos)(?:\/|$)/.test(node.arguments[0].text), route).toBe(false);
            expect(node.getText(source), route).not.toMatch(
              /\bDELETE\s+FROM\s+(?:families|guardians|students)\b|\bTRUNCATE\b|seedDemoData\s*\(|(?:delete|remove)(?:Family|Guardian|Student)\s*\(/i,
            );
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect(inspected).toContain("POST /api/demo/seed");
    expect(inspected).toContain("PATCH /api/admin/families/:familyId/status");
    expect(Array.from(exceptions)).toEqual(["POST /api/demo/seed"]);
  });
});
