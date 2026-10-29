import { AsyncLocalStorage } from "node:async_hooks";
import { pool } from "../db";

export type AssistantScope = { tenantId: number; campusId: number };
const scopes = new AsyncLocalStorage<Readonly<AssistantScope>>();

export function withAssistantScope<T>(ctx: AssistantScope, operation: () => T): T {
  if (![ctx.tenantId, ctx.campusId].every(n => Number.isSafeInteger(n) && n > 0)) {
    throw new Error("El asistente requiere tenant y campus de sesión");
  }
  const parent = scopes.getStore();
  if (parent && (parent.tenantId !== ctx.tenantId || parent.campusId !== ctx.campusId)) {
    throw new Error("No se permite cambiar el ámbito del asistente");
  }
  return scopes.run(Object.freeze({ tenantId: ctx.tenantId, campusId: ctx.campusId }), operation);
}

/**
 * SQL interno parametrizado, nunca SQL recibido del cliente/LLM.
 * Las CTE acotan las relaciones ANTES de joins, agregados y subconsultas.
 * Se conserva el SQL original y sus parámetros; el ámbito se añade al final.
 * Una tabla no inventariada se niega en lugar de ejecutar una lectura global.
 */
export function scopeAssistantRead(sql: string, values: readonly unknown[], ctx: AssistantScope) {
  if (![ctx.tenantId, ctx.campusId].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error("Ámbito inválido");
  if (!/^\s*(SELECT|WITH)\b/i.test(sql) || /\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER)\b/i.test(sql) ||
    sql.trim().replace(/;$/, "").includes(";")) {
    throw new Error("El lector del asistente sólo admite consultas de lectura");
  }
  const tenant = `$${values.length + 1}::integer`, campus = `$${values.length + 2}::integer`;
  // Datos históricos con tenant nulo sólo se admiten si el padre ya filtrado
  // acredita su pertenencia; un tenant explícito distinto siempre se excluye.
  const tenantMatches = `(t.tenant_id = ${tenant} OR t.tenant_id IS NULL)`;
  const direct = (table: string) => `SELECT t.* FROM public.${table} t WHERE ${tenantMatches} AND t.campus_id = ${campus} AND EXISTS (SELECT 1 FROM campuses)`;
  const student = (table: string) => `SELECT t.* FROM public.${table} t WHERE ${tenantMatches} AND t.student_id IN (SELECT id FROM students)`;
  const policies: Record<string, { dependencies: string[]; sql: string }> = {
    campuses: { dependencies: [], sql: `SELECT t.* FROM public.campuses t WHERE t.tenant_id = ${tenant} AND t.id = ${campus}` },
    students: { dependencies: ["campuses"], sql: direct("students") },
    families: { dependencies: ["campuses"], sql: direct("families") },
    guardians: { dependencies: ["campuses"], sql: direct("guardians") },
    users: { dependencies: ["campuses"], sql: direct("users") },
    concepts: { dependencies: ["campuses"], sql: direct("concepts") },
    products: { dependencies: ["campuses"], sql: direct("products") },
    institutional_settings: { dependencies: ["campuses"], sql: direct("institutional_settings") },
    bank_transactions: { dependencies: ["campuses"], sql: direct("bank_transactions") },
    pending_approvals: { dependencies: ["campuses"], sql: direct("pending_approvals") },
    payment_plans: { dependencies: ["students", "campuses"], sql: `${direct("payment_plans")} AND t.student_id IN (SELECT id FROM students)` },
    charges: { dependencies: ["students"], sql: student("charges") },
    scholarships: { dependencies: ["students"], sql: student("scholarships") },
    payments: { dependencies: ["charges"], sql: `SELECT t.* FROM public.payments t WHERE ${tenantMatches} AND t.charge_id IN (SELECT id FROM charges)` },
    invoices: { dependencies: ["payments"], sql: `SELECT t.* FROM public.invoices t WHERE ${tenantMatches} AND t.payment_id IN (SELECT id FROM payments)` },
    payment_applications: { dependencies: ["payments", "charges"], sql: "SELECT t.* FROM public.payment_applications t WHERE t.payment_id IN (SELECT id FROM payments) AND t.charge_id IN (SELECT id FROM charges)" },
    family_students: { dependencies: ["families", "students"], sql: "SELECT t.* FROM public.family_students t WHERE t.family_id IN (SELECT id FROM families) AND t.student_id IN (SELECT id FROM students)" },
    student_guardian: { dependencies: ["students", "guardians"], sql: "SELECT t.* FROM public.student_guardian t WHERE t.student_id IN (SELECT id FROM students) AND t.guardian_id IN (SELECT id FROM guardians)" },
    approval_notifications: { dependencies: ["users", "pending_approvals"], sql: "SELECT t.* FROM public.approval_notifications t WHERE t.recipient_id IN (SELECT id FROM users) AND t.approval_id IN (SELECT id FROM pending_approvals)" },
    audit_log: { dependencies: [], sql: `SELECT t.* FROM public.audit_log t WHERE t.tenant_id = ${tenant} AND ((t.metadata::jsonb->>'campus_id') = (${campus})::text OR (t.entity_type IN ('assistant','system') AND t.entity_id = ${campus}))` },
  };
  const local = new Set(Array.from(sql.matchAll(/\b(\w+)\s+AS\s*\(/gi), m => m[1].toLowerCase()));
  const definitions = new Map<string, string>();
  function include(table: string) {
    if (definitions.has(table)) return;
    for (const dependency of policies[table].dependencies) include(dependency);
    definitions.set(table, `${table} AS (${policies[table].sql})`);
  }
  const tablePattern = /\b(?:FROM|JOIN)\s+((?:"?[a-z_]\w*"?\.)?"?[a-z_]\w*"?)/gi;
  // FROM en EXTRACT no introduce una relación (SQL interno del periodo escolar).
  const relationsSql = sql.replace(/\bEXTRACT\s*\(\s*\w+\s+FROM\s+/gi, "EXTRACT(");
  for (const match of Array.from(relationsSql.matchAll(tablePattern))) {
    const qualified = match[1].replace(/"/g, "").toLowerCase();
    const table = qualified.replace(/^public\./, "");
    if (policies[table]) {
      if (local.has(table)) throw new Error("Una CTE no puede ocultar una relación protegida");
      include(table);
    } else if (!local.has(table) && !["information_schema.columns", "pg_catalog.pg_constraint"].includes(qualified)) {
      throw new Error("Relación no inventariada para el asistente");
    }
  }
  if (!definitions.size) return { text: sql, values: [...values] };
  const body = sql.replace(/\b(FROM|JOIN)\s+"?public"?\."?([a-z_]\w*)"?/gi, "$1 $2");
  const prefix = Array.from(definitions.values()).join(", ");
  return {
    text: /^\s*WITH\b/i.test(body)
      ? body.replace(/^(\s*WITH(?:\s+RECURSIVE)?\s+)/i, `$1${prefix}, `)
      : `WITH ${prefix} ${body}`,
    values: [...values, ctx.tenantId, ctx.campusId],
  };
}

export const assistantScopedPool = {
  query(sql: string, values: readonly unknown[] = []) {
    const ctx = scopes.getStore();
    if (!ctx) throw new Error("Consulta de asistente fuera de un ámbito de sesión");
    const scoped = scopeAssistantRead(sql, values, ctx);
    return pool.query(scoped.text, scoped.values);
  },
};

export function requestedForeignCampus(message: string, ctx: AssistantScope): number | null {
  for (const match of Array.from(message.matchAll(/\bcampus(?:_id)?\s*(?:n[uú]mero\s*|id\s*|#\s*|[:=]\s*)?(\d+)\b/gi))) {
    if (Number(match[1]) !== ctx.campusId) return Number(match[1]);
  }
  return null;
}
