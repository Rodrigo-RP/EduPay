/**
 * TESTS — PUT /api/profile/photo (system.ts:119)
 *
 * Verifica con multipart/form-data real:
 *   PPH-01  camino feliz PNG válido → 200, foto_url en DB, sin chars base64 codificados
 *   PPH-02  sin archivo  → 400
 *   PPH-03  MIME no imagen → 400 (fileFilter corregido: cb(Error) en lugar de cb(null,Error))
 *   PPH-04  aislamiento de userId — subir con token de otro usuario NO muta el perfil propio
 *   PPH-05  imagen de tamaño realista (~300 KB) → 200, persiste íntegra en DB (TEXT sin límite)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool, db } from "../db";
import { users } from "../../shared/schema";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const BASE = "http://localhost:5000";
import { JWT_SECRET } from "../routes/shared";

// ── Imagen sintética mínima: 1×1 px PNG (67 bytes) ───────────────────────────
// Multer acepta por MIME type, no por contenido. Buffer válido para pruebas de upload.
const PNG_1X1 = Buffer.from(
  "89504e470d0a1a0a" +
  "0000000d49484452" +
  "00000001" +
  "00000001" +
  "08020000009077" +
  "53de0000000c" +
  "4944415408d7" +
  "636860000000" +
  "020001e221bc" +
  "330000000049" +
  "454e44ae426082",
  "hex",
);

// ── Imagen sintética "real": ~300 KB de datos JPEG simulados ─────────────────
// No es un JPEG válido decodificable, pero multer y el endpoint no inspeccionan
// el contenido — solo el MIME type declarado en el multipart. 307 200 bytes
// producen ~409 KB de base64 + prefijo, muy por encima de los 500 chars de
// varchar(500) original. Confirma que la migración a TEXT funciona.
const JPEG_300K = (() => {
  // Cabecera JPEG SOI + APP0 real (20 bytes) + relleno aleatorio-pero-determinista
  const header = Buffer.from(
    "ffd8ffe000104a464946000101000001000100",  // SOI + JFIF APP0 (19 bytes)
    "hex",
  );
  // Relleno de 0xAB repetido hasta alcanzar ~300 KB total
  const padding = Buffer.alloc(307200 - header.length, 0xab);
  return Buffer.concat([header, padding]);
})();

// ── Estado compartido ─────────────────────────────────────────────────────────
let testUserId: number;
let testUserToken: string;
let testCampusId: number;
let testTenantId: number;
let cleanupUserId2: number | null = null;

// ── Fixture setup ─────────────────────────────────────────────────────────────
beforeAll(async () => {
  const { rows: tRows } = await pool.query<{ id: number }>(
    "SELECT id FROM tenants ORDER BY id LIMIT 1",
  );
  if (!tRows.length) throw new Error("No hay tenants en la DB de prueba");
  testTenantId = tRows[0].id;

  const { rows: cRows } = await pool.query<{ id: number }>(
    "SELECT id FROM campuses WHERE tenant_id = $1 LIMIT 1",
    [testTenantId],
  );
  if (!cRows.length) throw new Error("No hay campuses para el tenant");
  testCampusId = cRows[0].id;

  const ts = Date.now().toString().slice(-8);
  const hash = await bcrypt.hash("TestPass123!", 10);

  const [u] = await db
    .insert(users)
    .values({
      email: `photo_test_${ts}@test.com`,
      password_hash: hash,
      role: "administrador_campus",
      campus_id: testCampusId,
      tenant_id: testTenantId,
      nombre_completo: "Photo Test User",
    })
    .returning();

  testUserId = u.id;
  testUserToken = jwt.sign(
    { id: testUserId, email: u.email, role: u.role, campus_id: testCampusId, tenant_id: testTenantId, type: "user" },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, testUserId)).catch(() => {});
  if (cleanupUserId2 !== null) {
    await db.delete(users).where(eq(users.id, cleanupUserId2)).catch(() => {});
  }
});

// ── Helper ────────────────────────────────────────────────────────────────────
async function uploadPhoto(
  blob: Blob,
  filename: string,
  token: string,
): Promise<{ status: number; body: any }> {
  const form = new FormData();
  form.append("photo", blob, filename);
  const res = await fetch(`${BASE}/api/profile/photo`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("PUT /api/profile/photo — multipart/form-data real", () => {

  it("PPH-01: PNG válido (67 B) → 200, foto_url en DB es data URI, sin %2F %2B %3D", async () => {
    const blob = new Blob([PNG_1X1], { type: "image/png" });
    const { status, body } = await uploadPhoto(blob, "avatar.png", testUserToken);

    expect(status).toBe(200);
    expect(body.foto_url).toMatch(/^data:image\/png;base64,/);

    // Verificación en DB — persiste correctamente
    const [row] = await db
      .select({ foto_url: users.foto_url })
      .from(users)
      .where(eq(users.id, testUserId));
    expect(row.foto_url).toBe(body.foto_url);

    // El sanitizador global no debe URL-encodear los caracteres propios de base64
    expect(body.foto_url).not.toContain("%2F");
    expect(body.foto_url).not.toContain("%2B");
    expect(body.foto_url).not.toContain("%3D");
  });

  it("PPH-02: multipart sin campo 'photo' → 400", async () => {
    const form = new FormData();
    const res = await fetch(`${BASE}/api/profile/photo`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${testUserToken}` },
      body: form,
    });
    expect(res.status).toBe(400);
    const body = await res.json().catch(() => ({}));
    expect(body.message).toMatch(/no se subió/i);
  });

  it("PPH-03: MIME application/pdf → 400 (fileFilter rechaza con cb(Error))", async () => {
    // Bug original: cb(null, new Error(...)) → Error es truthy → multer aceptaba.
    // Fix: cb(new Error(...)) → multer rechaza con MulterError → Express devuelve 400.
    const blob = new Blob([Buffer.from("fake-pdf-content")], { type: "application/pdf" });
    const { status } = await uploadPhoto(blob, "malicious.pdf", testUserToken);
    expect(status).toBe(400);
  });

  it("PPH-04: JWT de usuario B → actualiza perfil de B, no el de A (aislamiento)", async () => {
    const ts = Date.now().toString().slice(-8);
    const hash = await bcrypt.hash("TestPass123!", 10);
    const [u2] = await db
      .insert(users)
      .values({
        email: `photo_other_${ts}@test.com`,
        password_hash: hash,
        role: "administrador_campus",
        campus_id: testCampusId,
        tenant_id: testTenantId,
        nombre_completo: "Other User",
      })
      .returning();
    cleanupUserId2 = u2.id;

    const token2 = jwt.sign(
      { id: u2.id, email: u2.email, role: u2.role, campus_id: testCampusId, tenant_id: testTenantId, type: "user" },
      JWT_SECRET,
      { expiresIn: "1h" },
    );

    // foto_url de testUser antes de la subida ajena
    const [before] = await db
      .select({ foto_url: users.foto_url })
      .from(users)
      .where(eq(users.id, testUserId));

    const blob = new Blob([PNG_1X1], { type: "image/png" });
    const { status } = await uploadPhoto(blob, "avatar.png", token2);
    expect(status).toBe(200);

    // testUser.foto_url no cambió
    const [after] = await db
      .select({ foto_url: users.foto_url })
      .from(users)
      .where(eq(users.id, testUserId));
    expect(after.foto_url).toBe(before.foto_url);

    // u2.foto_url sí se actualizó
    const [u2row] = await db
      .select({ foto_url: users.foto_url })
      .from(users)
      .where(eq(users.id, u2.id));
    expect(u2row.foto_url).toMatch(/^data:image\/png;base64,/);
  });

  it("PPH-05: imagen JPEG ~300 KB → 200, foto_url persiste íntegra en DB (columna TEXT, sin límite)", async () => {
    // JPEG_300K tiene 307 200 bytes → base64 ≈ 409 600 chars + prefijo "data:image/jpeg;base64,"
    // = ~409 623 chars. Muy por encima del varchar(500) original.
    // Confirma que la migración 009 (varchar → TEXT) funciona y no hay truncamiento.
    const blob = new Blob([JPEG_300K], { type: "image/jpeg" });
    const { status, body } = await uploadPhoto(blob, "photo.jpg", testUserToken);

    expect(status).toBe(200);
    expect(body.foto_url).toMatch(/^data:image\/jpeg;base64,/);

    // Longitud mínima esperada: prefijo (23) + base64 de 307200 bytes = ceil(307200/3)*4 = 409600
    expect(body.foto_url.length).toBeGreaterThan(400_000);

    // Verificación en DB — la columna TEXT almacena el valor completo sin truncar
    const [row] = await db
      .select({ foto_url: users.foto_url })
      .from(users)
      .where(eq(users.id, testUserId));

    // Longitud en DB idéntica a la respuesta
    expect(row.foto_url).not.toBeNull();
    expect(row.foto_url!.length).toBe(body.foto_url.length);

    // El contenido en DB es idéntico byte a byte (no truncado)
    expect(row.foto_url).toBe(body.foto_url);
  });

});
