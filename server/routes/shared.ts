/**
 * server/routes/shared.ts
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

// ── Mensaje canónico de sesión invalidada (#138) ──────────────────────────────
export const MSG_SESSION_INVALIDATED =
  "Tu sesión ya no es válida, tu contraseña cambió. Inicia sesión de nuevo.";

// ── Helper: verificar iat vs password_changed_at (#138) ──────────────────────
// Devuelve true si el token se emitió ANTES del último cambio de contraseña.
// iat es Unix seconds; passwordChangedAt es Date (ms).
export function isSessionInvalidated(
  iat: number | undefined,
  passwordChangedAt: Date | null,
): boolean {
  if (!passwordChangedAt || iat == null) return false;
  return iat < Math.floor(passwordChangedAt.getTime() / 1000);
}

// ── Helper: cargar custom_permissions + password_changed_at en una sola query ─
// ADR-003: fuente de verdad en DB (no JWT). La consulta ya existía para
// custom_permissions (#138 extiende el SELECT para no agregar un round-trip).
interface UserAuthData {
  customPermissions: string[];
  passwordChangedAt: Date | null;
}
export async function loadUserAuthData(
  userId: number | undefined,
): Promise<UserAuthData> {
  if (!userId) return { customPermissions: [], passwordChangedAt: null };
  try {
    const row = await pool.query(
      `SELECT custom_permissions, password_changed_at
         FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    const r = row.rows[0] as any;
    return {
      customPermissions: Array.isArray(r?.custom_permissions)
        ? r.custom_permissions
        : [],
      passwordChangedAt: r?.password_changed_at
        ? new Date(r.password_changed_at)
        : null,
    };
  } catch {
    return { customPermissions: [], passwordChangedAt: null };
  }
}

// ── Helper: cargar password_changed_at de guardian ───────────────────────────
// authenticateGuardian no tenía consulta DB previa; esta es la única query
// que se agrega (#138). PK lookup de una sola columna — impacto mínimo.
export async function loadGuardianPasswordChangedAt(
  guardianId: number | undefined,
): Promise<Date | null> {
  if (!guardianId) return null;
  try {
    const row = await pool.query(
      `SELECT password_changed_at FROM guardians WHERE id = $1 LIMIT 1`,
      [guardianId],
    );
    const raw = (row.rows[0] as any)?.password_changed_at;
    return raw ? new Date(raw) : null;
  } catch {
    return null;
  }
}

// ── Middleware: autenticación de usuarios (admin/staff) ──────────────────────
export const authenticateToken = async (req: any, res: any, next: any) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Token requerido" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    // Una sola query obtiene custom_permissions Y password_changed_at (ADR-003 + #138).
    const { customPermissions, passwordChangedAt } = await loadUserAuthData(decoded.id);
    if (isSessionInvalidated(decoded.iat, passwordChangedAt)) {
      return res.status(401).json({
        message: MSG_SESSION_INVALIDATED,
        code:    "SESSION_INVALIDATED",
      });
    }
    req.user = { ...decoded, custom_permissions: customPermissions };
    req.tenantId = decoded.tenant_id ?? null;
    next();
  } catch {
    return res.status(403).json({ message: "Token inválido" });
  }
};

// ── Middleware: autenticación de tutores (guardian JWT) ──────────────────────
// Agrega un PK-lookup ligero para verificar password_changed_at (#138).
// No existía ninguna consulta DB en este middleware antes de #138.
export const authenticateGuardian = async (req: any, res: any, next: any) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded.type !== "guardian") return res.sendStatus(403);
    const passwordChangedAt = await loadGuardianPasswordChangedAt(decoded.id);
    if (isSessionInvalidated(decoded.iat, passwordChangedAt)) {
      return res.status(401).json({
        message: MSG_SESSION_INVALIDATED,
        code:    "SESSION_INVALIDATED",
      });
    }
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
    return res.status(401).json({
      error:   "Acceso denegado",
      message: "Token de autenticación requerido",
    });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    // Misma fuente de verdad que authenticateToken (ADR-003 + #138).
    const { customPermissions, passwordChangedAt } = await loadUserAuthData(decoded.id);
    if (isSessionInvalidated(decoded.iat, passwordChangedAt)) {
      return res.status(401).json({
        error:   "Sesión inválida",
        message: MSG_SESSION_INVALIDATED,
        code:    "SESSION_INVALIDATED",
      });
    }
    req.user = { ...decoded, custom_permissions: customPermissions };
    req.tenantId = decoded.tenant_id ?? null;
    next();
  } catch {
    return res.status(403).json({
      error:   "Token inválido",
      message: "Credenciales de acceso no válidas",
    });
  }
};

// ── Middleware: Super Admin ───────────────────────────────────────────────────
// requireSuperAdmin ya carga el usuario completo vía storage.getUser() —
// password_changed_at llega en ese objeto sin round-trip adicional (#138).
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
    if (isSessionInvalidated(decoded.iat, (user as any).password_changed_at ?? null)) {
      return res.status(401).json({
        message: MSG_SESSION_INVALIDATED,
        code:    "SESSION_INVALIDATED",
      });
    }
    if (!user.is_super_admin) {
      return res.status(403).json({ message: "Acceso denegado - Super Admin requerido" });
    }
    req.user = user;
    next();
  } catch (error: any) {
    console.error("Error en middleware requireSuperAdmin:", error);
    if (error.name === "JsonWebTokenError")
      return res.status(401).json({ message: "Token JWT inválido" });
    if (error.name === "TokenExpiredError")
      return res.status(401).json({ message: "Token expirado" });
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
  res: any,
): Promise<boolean> {
  if (!tenantId) return true;
  const owned = await storage.getCampusScoped(campusId, tenantId);
  if (!owned) {
    res.status(403).json({
      message: "Acceso denegado: campus no pertenece a este tenant",
    });
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
export function hasPermissionForUser(
  user: any,
  module: string,
  action: string,
  scope?: string,
): boolean {
  if (hasPermission(user?.role, module, action, scope)) return true;
  const key = `${module}.${action}`;
  return (
    Array.isArray(user?.custom_permissions) &&
    user.custom_permissions.includes(key)
  );
}

// ── 2FA role guard ────────────────────────────────────────────────────────────
export function require2faRole(req: any, res: any, next: any) {
  const role = req.user?.role;
  const allowed = ["administrador_general", "administrador_campus", "contador_general"];
  if (!allowed.includes(role)) {
    return res.status(403).json({
      message: "Solo administradores y contadores pueden gestionar 2FA",
    });
  }
  next();
}
