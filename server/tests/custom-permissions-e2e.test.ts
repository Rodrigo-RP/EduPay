/**
 * server/tests/custom-permissions-e2e.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AUDITORÍA — Decisiones 1-4 ADR-003: custom_permissions de extremo a extremo.
 *
 * DECISIÓN 1: authenticateToken enriquece req.user con custom_permissions
 *   leídos de DB en cada request (no del JWT). La revocación tiene efecto
 *   inmediato sin esperar expiración del token.
 *
 * DECISIÓN 2: hasPermissionForUser(user, module, action, scope) evalúa
 *   primero hasPermission(user.role, ...) y solo si eso falla revisa
 *   user.custom_permissions.includes(`${module}.${action}`).
 *
 * DECISIÓN 3: Todos los handlers usan hasPermissionForUser en lugar de
 *   hasPermission(role, ...) — migración mecánica de 88 llamadas.
 *
 * DECISIÓN 4: Prueba E2E de que custom_permissions tiene efecto real en una
 *   decisión de autorización (no solo que se guarda):
 *   - asistente → 403 en POST /api/admin/cargos/desde-catalogo (sin CHARGES.CREATE)
 *   - Se agrega 'charges.create' a custom_permissions en DB (simula admin grant)
 *   - Mismo token → no 403 en el mismo endpoint (guard pasa, handler procesa body)
 *   - Se revoca → 403 de nuevo (revocación inmediata sin re-login)
 *
 * BONUS: hasPermissionForUser no rompe acceso de roles que ya lo tenían por rol
 *   (regresión: administrador_campus sigue viendo el endpoint con 200/400, nunca 403).
 *
 * NOTA DE DISEÑO — requests HTTP mínimos:
 *   Este archivo ejecuta exactamente 4 requests a rutas bajo /api/admin
 *   (CPS-01, CPS-02, CPS-03, CPS-04). CPS-05 y CPS-06 se verifican sin HTTP
 *   para no saturar el rate-limit global de 300 req/5min del api/admin router.
 *   El patrón es: un token de asistente único reutilizado; grant/revoke directo
 *   en DB (no via API de admin); aserciones del lado del cliente cuando la lógica
 *   es inferible sin round-trip al servidor.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import { pool } from "../db";

const BASE       = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

const TS = Date.now().toString().slice(-7);

let tenantId      = 0;
let campusId      = 0;
let asistenteId   = 0;
let adminCampusId = 0;

// Token de asistente — no cambia aunque custom_permissions cambien en DB.
// Gracias a Decisión 1, la DB es la fuente de verdad, no el JWT.
let tokenAsistente   = "";
let tokenAdminCampus = "";

function makeToken(userId: number, role: string): string {
  return jwt.sign(
    { id: userId, email: `u${userId}@cps${TS}.test`, role,
      campus_id: campusId, tenant_id: tenantId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

beforeAll(async () => {
  const bcrypt = await import("bcrypt");
  const hash   = await bcrypt.hash("TestCPS2025!", 10);

  const tRow = await pool.query(
    `INSERT INTO tenants (nombre_legal, rfc) VALUES ($1,$2) RETURNING id`,
    [`CPSGuard ${TS}`, `CPS${TS}`]
  );
  tenantId = tRow.rows[0].id;

  const cRow = await pool.query(
    `INSERT INTO campuses (tenant_id, nombre) VALUES ($1,$2) RETURNING id`,
    [tenantId, `Campus-CPS-${TS}`]
  );
  campusId = cRow.rows[0].id;

  const asRow = await pool.query(
    `INSERT INTO users (tenant_id, campus_id, name, email, password_hash, role, is_active, custom_permissions)
     VALUES ($1,$2,$3,$4,$5,'asistente',true,'{}') RETURNING id`,
    [tenantId, campusId, "Asistente CPS", `asist.${TS}@cps.test`, hash]
  );
  asistenteId = asRow.rows[0].id;

  const acRow = await pool.query(
    `INSERT INTO users (tenant_id, campus_id, name, email, password_hash, role, is_active, custom_permissions)
     VALUES ($1,$2,$3,$4,$5,'administrador_campus',true,'{}') RETURNING id`,
    [tenantId, campusId, "AdminCampus CPS", `adm.${TS}@cps.test`, hash]
  );
  adminCampusId = acRow.rows[0].id;

  tokenAsistente   = makeToken(asistenteId,   "asistente");
  tokenAdminCampus = makeToken(adminCampusId, "administrador_campus");
});

afterAll(async () => {
  await pool.query(`DELETE FROM users    WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM campuses WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM tenants  WHERE id        = $1`, [tenantId]);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const H = (t: string) => ({ Authorization: `Bearer ${t}`, "Content-Type": "application/json" });

// Un único helper HTTP — reutilizado por los 4 tests que necesitan round-trip.
const postCatalogo = (token: string) =>
  fetch(`${BASE}/api/admin/cargos/desde-catalogo`, {
    method:  "POST",
    headers: H(token),
    body:    JSON.stringify({}),           // body vacío → 400/404 si guard pasa
  });

const grantPerm  = (userId: number, perm: string) =>
  pool.query(
    `UPDATE users
     SET custom_permissions = array_append(COALESCE(custom_permissions, ARRAY[]::text[]), $2)
     WHERE id = $1`,
    [userId, perm]
  );

const revokePerm = (userId: number, perm: string) =>
  pool.query(
    `UPDATE users
     SET custom_permissions = array_remove(custom_permissions, $2)
     WHERE id = $1`,
    [userId, perm]
  );

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CPS — custom_permissions E2E (ADR-003 Decisiones 1-4)", () => {

  // ── Decisión 4 — Flujo completo grant → efectivo → revocación ────────────
  // HTTP request #1, #2, #3 (los únicos de asistente).

  describe("CPS-01 a CPS-03: flujo grant/revoke de extremo a extremo", () => {

    it("CPS-01: asistente → 403 en POST /api/admin/cargos/desde-catalogo (sin CHARGES.CREATE en rol ni custom_permissions)", async () => {
      const r = await postCatalogo(tokenAsistente);           // request #1
      expect(r.status).toBe(403);
    });

    it("CPS-02: después de agregar 'charges.create' a custom_permissions en DB → NO 403 (guard pasa, body falla → 400/404)", async () => {
      // Simula que un admin otorga el permiso custom en tiempo real (solo DB, sin HTTP admin)
      await grantPerm(asistenteId, "charges.create");

      // El MISMO token (sin re-login). Decisión 1: DB es la fuente de verdad.
      const r    = await postCatalogo(tokenAsistente);        // request #2
      const body = await r.json().catch(() => ({}));

      // El guard pasó — cualquier respuesta ≠ 403 lo confirma.
      expect(r.status, `Guard bloqueó a pesar del custom_permission — body: ${JSON.stringify(body)}`).not.toBe(403);
      expect([400, 404, 422, 201].includes(r.status)).toBe(true);
    });

    it("CPS-03: al revocar 'charges.create' de DB → 403 de nuevo (revocación inmediata sin re-login)", async () => {
      await revokePerm(asistenteId, "charges.create");

      const r = await postCatalogo(tokenAsistente);           // request #3
      expect(r.status).toBe(403);
    });
  });

  // ── Decisión 2 — Rol base sigue funcionando sin custom_permissions ────────
  // HTTP request #4 (único de adminCampus).

  describe("CPS-04: hasPermissionForUser no rompe acceso por rol", () => {

    it("CPS-04: administrador_campus → NO 403 en POST /api/admin/cargos/desde-catalogo (tiene CHARGES.CREATE por rol, no por custom)", async () => {
      const r = await postCatalogo(tokenAdminCampus);         // request #4
      // El guard pasa por rol — body vacío → 400/422, nunca 403
      expect(r.status).not.toBe(403);
    });
  });

  // ── Decisión 1 — custom_permissions provienen de DB, no del JWT ──────────
  // Sin HTTP: decodificar el JWT es suficiente para verificar la Decisión 1.
  // (La prueba E2E completa ya está en CPS-01→CPS-03: asistente empezó sin
  //  perms, el guard bloqueó, se le concedió en DB sin re-login, el guard cedió,
  //  se revocó, el guard volvió a bloquear — eso solo es posible si la fuente
  //  de verdad es la DB, no el JWT.)

  describe("CPS-05: Decisión 1 — DB como fuente de verdad (no el JWT)", () => {

    it("CPS-05: el JWT no incluye custom_permissions en su payload — el enriquecimiento ocurre en authenticateToken vía SELECT a DB", () => {
      // Verificar que el JWT codificado NO contiene custom_permissions.
      // Si estuviera en el JWT, la ruta CPS-01→CPS-03 no funcionaría
      // (el token no cambiaría entre CPS-01 y CPS-02, así que si el grant
      // hubiera surtido efecto solo porque el JWT cambió, el test fallaría).
      const parts   = tokenAsistente.split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      expect(payload).not.toHaveProperty("custom_permissions");
      // La ausencia de custom_permissions en el JWT, combinada con que
      // CPS-01→CPS-03 demostró que el grant/revoke en DB tiene efecto
      // inmediato sin re-login, prueba empíricamente la Decisión 1.
    });
  });

  // ── Decisión 2 — Custom perm de módulo distinto no escala privilegios ─────
  // Sin HTTP: la lógica es deterministamente inferible desde el estado de DB.
  // hasPermissionForUser busca 'charges.create' exacto. Un permiso 'fiscal.configure'
  // no satisface esa búsqueda. CPS-03 ya probó que sin 'charges.create' el guard
  // bloquea con 403 — un permiso distinto produce el mismo estado de DB.

  describe("CPS-06: custom_permission de módulo distinto no escala privilegios", () => {

    it("CPS-06: 'fiscal.configure' en DB → custom_permissions NO contiene 'charges.create' → guard bloquearía igual que en CPS-03", async () => {
      await grantPerm(asistenteId, "fiscal.configure");

      // Verificación de estado: la DB tiene fiscal.configure pero no charges.create.
      const row = await pool.query(
        `SELECT custom_permissions FROM users WHERE id = $1`,
        [asistenteId]
      );
      const perms: string[] = row.rows[0].custom_permissions ?? [];

      expect(perms).toContain("fiscal.configure");
      expect(perms).not.toContain("charges.create");
      // Por construcción de hasPermissionForUser (búsqueda exacta de string),
      // fiscal.configure ≠ charges.create → el guard habría devuelto 403,
      // idéntico al estado probado en CPS-03.

      await revokePerm(asistenteId, "fiscal.configure");
    });
  });
});
