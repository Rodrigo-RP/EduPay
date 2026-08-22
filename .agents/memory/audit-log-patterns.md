---
name: Audit log patterns
description: Lessons from implementing audit_log table, logAuditEvent, and payment/student route atomicity
---

# Audit Log Implementation Patterns

## logAuditEvent signature
`logAuditEvent(clientOrPool: { query: Function }, opts: {...})` — takes a pool or transaction client as first arg. **Propagates errors** (no internal try/catch). Callers own the error policy.

## Atomicity policy by operation type
- **Student create/update/delete, bulk import**: `pool.connect()` + `BEGIN/COMMIT` wrapping both the data change (raw SQL) and `logAuditEvent(client, ...)` on the same client. Rollback on any failure.
- **Payment processing**: same transaction pattern — `FOR UPDATE OF c` on the charges row prevents concurrent double-payment; amount validated against `Math.round(base*(1−discount/100))+surcharge`.
- **Charge generation, bulk import aggregate**: best-effort `.catch()` logging to stderr — charges already committed in loop, audit failure must NOT return 500 (would trigger duplicate retries).

## campus_id enforcement
Always override `campus_id` from the JWT (`user.campus_id`), never trust the request body. Applies to student create, bulk import, and audit inserts.

## Student update allowlist
`studentUpdateSchema` uses Zod `.strict()` with explicitly typed fields per column (not `z.any()`). Column names come only from this allowlist — never from `req.body` keys — preventing SQL injection via identifier interpolation.

## storage.createStudent uses Drizzle db (different connection)
`storage.createStudent` uses Drizzle's `db` object, which operates on a separate pool connection from a `pool.connect()` client. If you need both insert + audit in the same transaction, use raw SQL directly on the `client`, not `storage.createStudent`.

## nombre_completo NOT NULL
The `students` table has `nombre_completo NOT NULL` in the DB even if schema says nullable. Always compute it before insert: `body.nombre_completo || [nombres, apellido_paterno, apellido_materno].filter(Boolean).join(" ") || nombres || ""`.

## requireStaffAuth middleware
Rejects guardian tokens (`type === 'guardian'`), rejects tokens without `role`, resolves `is_super_admin` from the DB (JWT doesn't carry it), enforces mandatory `campus_id` scoping for non-super-admins.

## Test file location
`server/tests/audit-log.test.ts` — run with `npx tsx server/tests/audit-log.test.ts`. Includes cleanup of test data at start for idempotent runs.

**Why:** Multiple code review cycles rejected silent audit failures, campus isolation bugs, and SQL injection via dynamic column names. These patterns are the approved solutions.
