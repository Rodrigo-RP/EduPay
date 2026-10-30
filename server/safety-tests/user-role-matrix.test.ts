import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
vi.mock("../db", () => ({ pool: { query: vi.fn() }, db: {} }));
import { ROLE_HIERARCHY, canEditUser, type UserRole } from "@shared/permissions";
import { authorizeUserCreation, authorizeUserMutation, userUpdateData } from "../lib/user-authorization";

const roles = ["admisiones", "asistente", "auxiliar_contable", "contador_general",
  "administrador_campus", "administrador_general", "super_admin"] as UserRole[];
const actor = (role: UserRole) => ({ id: 1, tenant_id: 29, campus_id: 48, role });
const target = (role: UserRole) => ({ id: 2, tenant_id: 29, campus_id: 48, role });
const pairs = roles.flatMap((a, rank) => roles.map((b, otherRank) => ({ a, b, rank, otherRank })));
// ÚNICA excepción autorizada: reemplazo demo que crea super_admin, sólo con
// superadministrador, APP_ENV no production, ALLOW_DEMO_SEED=true y marcador
// edupay:test o edupay:demo. No eximir prefijos, alias ni otros endpoints.
const hierarchyExceptions = new Set(["POST /api/demo/seed"]);

describe("Matriz completa: roles, acciones y relación jerárquica", () => {
  it("cubre exactamente el catálogo canónico existente", () => {
    expect([...roles].sort()).toEqual(Object.keys(ROLE_HIERARCHY).sort());
  });
  it("todas las rutas que escriben usuarios tienen guarda, salvo la excepción demo por nombre", () => {
    const found: string[] = [];
    const directory = path.resolve(process.cwd(), "routes");
    for (const filename of readdirSync(directory).filter(n => n.endsWith(".ts"))) {
      const source = ts.createSourceFile(filename, readFileSync(path.join(directory, filename), "utf8"), ts.ScriptTarget.Latest, true);
      function visit(node: ts.Node) {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
          ["post", "put", "patch", "delete"].includes(node.expression.name.text) &&
          node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
          const body = node.getText(source);
          if (/\b(?:createSuperAdmin|createUser|updateUser(?:Profile|Password|Status)?|deleteUser|seedDemoData|confirmTotp)\s*\(|\.update\s*\(\s*users\s*\)|\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+users\b/i.test(body)) {
            const route = `${node.expression.name.text.toUpperCase()} ${node.arguments[0].text}`;
            found.push(route);
            if (!hierarchyExceptions.has(route)) {
              expect(body, `${filename}: ${route}`).toMatch(/\b(?:authorizeUserCreation|authorizeUserMutation|userInSessionScope)\s*\(/);
            }
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect(found).toContain("POST /api/demo/seed");
    // Desactivar 2FA ya no escribe; confirmTotp persiste desde el servicio y reset es nueva.
    expect(found.filter(route => !hierarchyExceptions.has(route))).toHaveLength(14);
    expect(found).toContain("POST /api/admin/users/:id/2fa/reset");
    expect(Array.from(hierarchyExceptions)).toEqual(["POST /api/demo/seed"]);
  });
  for (const { a, b, rank, otherRank } of pairs) {
    const relation = rank > otherRank ? "inferior" : rank === otherRank ? "igual" : "superior";
    const permitted = rank > otherRank && rank >= 4;
    it(`${a} crea ${b} (${relation}): ${permitted ? "permitir" : "403"}`, () => {
      expect(authorizeUserCreation(actor(a), { role: b }) === null).toBe(permitted);
    });
    for (const action of ["edit", "status", "delete"] as const) {
      it(`${a} ${action} ${b} (${relation}): ${permitted ? "permitir" : "403"}`, () => {
        expect(authorizeUserMutation(actor(a), target(b), {}, action) === null).toBe(permitted);
      });
    }
    for (const newRole of roles) {
      const canAssign = permitted && roles.indexOf(newRole) < rank;
      it(`${a} cambia ${b} a ${newRole}: ${canAssign ? "permitir" : "403"}`, () => {
        expect(authorizeUserMutation(actor(a), target(b), { role: newRole }, "edit") === null).toBe(canAssign);
      });
    }
  }
  it.each(roles)("datos propios de %s: básicos sí, rol/estado/permisos no", role => {
    const own = actor(role);
    expect(authorizeUserMutation(own, own, { name: "Propio" }, "edit")).toBeNull();
    for (const body of [{ role }, { role: "super_admin" }, { is_active: false }, { custom_permissions: ["users.create"] }]) {
      expect(authorizeUserMutation(own, own, body, "edit")?.status).toBe(403);
    }
    expect(authorizeUserMutation(own, own, {}, "status")?.status).toBe(403);
  });
  it.each(roles)("%s no ve destinos fuera de tenant o campus", role => {
    for (const foreign of [{ tenant_id: 30 }, { campus_id: 49 }]) {
      for (const action of ["edit", "status", "delete", "password"] as const) {
        expect(authorizeUserMutation(actor(role), { ...target("admisiones"), ...foreign }, {}, action)?.status).toBe(404);
      }
    }
  });
  it("niega roles desconocidos y flags privilegiados heredados", () => {
    expect(canEditUser("super_admin", "desconocido" as UserRole)).toBe(false);
    expect(authorizeUserMutation(actor("super_admin"), { ...target("contador_general"), is_super_admin: true }, {}, "edit")?.status).toBe(403);
  });
  it("invalidación de sesiones sólo al cambiar rol/estado", () => {
    expect(userUpdateData({ role: "asistente" }, target("contador_general")).password_changed_at).toBeInstanceOf(Date);
    expect(userUpdateData({ name: "Básico" }, target("contador_general"))).not.toHaveProperty("password_changed_at");
  });
});
