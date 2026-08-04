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

// ── createRequire para paquetes CJS en módulo ESM ────────────────────────────
// "type":"module" en package.json rompe require(); usar esmRequire en su lugar.
export const esmRequire = createRequire(import.meta.url);

export const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-key";

// ── Multer (upload de archivos) ───────────────────────────────────────────────
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (req.path === "/api/profile/photo") {
      const allowed = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
      cb(null, allowed.includes(file.mimetype) ? true : (new Error("Solo imágenes (JPEG, PNG, GIF, WebP)") as any));
    } else {
      const allowed = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "text/csv",
      ];
      cb(null, allowed.includes(file.mimetype) ? true : (new Error("Solo archivos Excel (.xlsx, .xls) o CSV (.csv)") as any));
    }
  },
});

// ── Middleware: autenticación de usuarios (admin/staff) ──────────────────────
export const authenticateToken = async (req: any, res: any, next: any) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Token requerido" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
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
    req.user = decoded;
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
