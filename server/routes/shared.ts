/**
 * server/routes/shared.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Middleware, helpers y constantes compartidas por todos los módulos de rutas.
 * Importar desde aquí — nunca duplicar en módulos individuales.
 */

import jwt from "jsonwebtoken";
import multer from "multer";
import { createRequire } from "module";
import { storage } from "../storage";
import { pool } from "../db";
import { hasPermission } from "@shared/permissions";

// ── createRequire para paquetes CJS en módulo ESM ────────────────────────────
// "type":"module" en package.json rompe require(); usar esmRequire en su lugar.
export const esmRequire = createRequire(import.meta.url);

export const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── Multer (upload de archivos) ───────────────────────────────────────────────

/**
 * uploadBinary — acepta cualquier tipo de archivo (PDF, XML, binario).
 * Usar para endpoints que reciben estados de cuenta bancarios.
 */
export const uploadBinary = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (req.path === "/api/profile/photo") {
      const allowed = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        // cb(error) — primer argumento es el error; multer rechaza el archivo
        // y devuelve 400 al cliente. La forma incorrecta cb(null, new Error(...))
        // trata el objeto Error como truthy y lo acepta (bug original).
        cb(new Error("Solo imágenes (JPEG, PNG, GIF, WebP)"));
      }
    } else {
      const allowed = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "text/csv",
      ];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Solo archivos Excel (.xlsx, .xls) o CSV (.csv)"));
      }
    }
  },
});

// ── Helper: cargar custom_permissions desde DB ───────────────────────────────
// Decisión 1 ADR-003: la fuente de verdad es la DB, no el JWT.
// La revocación tiene efecto inmediato sin esperar la expiración del token.
// Si el usuario no existe en DB o la consulta falla, devuelve [] (no rompe auth).
async function loadCustomPermissions(userId: number | undefined): Promise<string[]> {
  if (!userId) return [];
  try {
    const row = await pool.query(
      `SELECT custom_permissions FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    const raw = (row.rows[0] as any)?.custom_permissions;
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

// ── Middleware: autenticación de usuarios (admin/staff) ──────────────────────
export const authenticateToken = async (req: any, res: any, next: any) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Token requerido" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    // Enriquecer req.user con custom_permissions leídos de DB (Decisión 1 ADR-003).
    // El JWT puede estar desactualizado; la DB siempre refleja el estado vigente.
    const customPermissions = await loadCustomPermissions(decoded.id);
    req.user = { ...decoded, custom_permissions: customPermissions };
    req.tenantId = decoded.tenant_id ?? null;
    next();
  } catch {
    return res.status(403).json({ message: "Token inválido" });
  }
};

// ── Middleware: autenticación de tutores (guardian JWT) ──────────────────────
export const authenticateGuardian = async (req: any, res: any, next: any) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded.type !== "guardian") return res.sendStatus(403);
    req.guardian = decoded;
    next();
  } catch {
    return res.sendStatus(403);
  }
};

// ── Middleware: autenticación unificada ──────────────────────────────────────
export const requireAuth = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Acceso denegado", message: "Token de autenticación requerido" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    // Misma fuente de verdad que authenticateToken (Decisión 1 ADR-003).
    const customPermissions = await loadCustomPermissions(decoded.id);
    req.user = { ...decoded, custom_permissions: customPermissions };
    req.tenantId = decoded.tenant_id ?? null;
    next();
  } catch {
    return res.status(403).json({ error: "Token inválido", message: "Credenciales de acceso no válidas" });
  }
};

// ── Middleware: Super Admin ───────────────────────────────────────────────────
export const requireSuperAdmin = async (req: any, res: any, next: any) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Token requerido" });
    }
    const token = authHeader.replace("Bearer ", "");
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (!decoded?.id) return res.status(401).json({ message: "Token inválido" });
    const user = await storage.getUser(decoded.id);
    if (!user) return res.status(401).json({ message: "Usuario no encontrado" });
    if (!user.is_super_admin) return res.status(403).json({ message: "Acceso denegado - Super Admin requerido" });
    req.user = user;
    next();
  } catch (error: any) {
    console.error("Error en middleware requireSuperAdmin:", error);
    if (error.name === "JsonWebTokenError") return res.status(401).json({ message: "Token JWT inválido" });
    if (error.name === "TokenExpiredError") return res.status(401).json({ message: "Token expirado" });
    res.status(401).json({ message: "Error de autenticación" });
  }
};

// ── Helper: serialización segura de usuario ──────────────────────────────────
// Nunca exponer password_hash ni twofa_secret en respuestas de API.
export function serializeUser(user: any): any {
  const { password_hash, twofa_secret, ...safe } = user ?? {};
  return { ...safe, has_twofa: !!twofa_secret };
}

// ── Helper: verificación campus/tenant ───────────────────────────────────────
// Retorna false y envía 403 si el campus no pertenece al tenant.
// Super admin (sin tenant_id en JWT) tiene acceso irrestricto.
export async function checkCampusTenant(
  campusId: number,
  tenantId: number | null | undefined,
  res: any
): Promise<boolean> {
  if (!tenantId) return true;
  const owned = await storage.getCampusScoped(campusId, tenantId);
  if (!owned) {
    res.status(403).json({ message: "Acceso denegado: campus no pertenece a este tenant" });
    return false;
  }
  return true;
}

// ── hasPermissionForUser ─────────────────────────────────────────────────────
// Decisión 2 ADR-003: extiende hasPermission con custom_permissions por usuario.
//
// Orden de evaluación:
//   1. hasPermission(user.role, module, action, scope) — permisos del rol base.
//      Si retorna true, acceso garantizado (comportamiento preexistente intacto).
//   2. Si el rol no concede acceso, busca "${module}.${action}" en
//      user.custom_permissions (array cargado desde DB por authenticateToken).
//      Permite granularidad individual sin cambiar el rol.
//
// Ningún usuario con permisos solo por rol pierde acceso.
// Ningún usuario con custom_permissions ganará acceso si el rol ya lo concede
// (sin efecto duplicado).
export function hasPermissionForUser(
  user: any,
  module: string,
  action: string,
  scope?: string
): boolean {
  // 1. Evaluación por rol base (sistema preexistente, intacto)
  if (hasPermission(user?.role, module, action, scope)) return true;
  // 2. Evaluación por permiso custom explícito
  const key = `${module}.${action}`;
  return Array.isArray(user?.custom_permissions) &&
    user.custom_permissions.includes(key);
}
