import type { Express } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db, pool } from "../db";
import { eq, and } from "drizzle-orm";
import { userInSessionScope } from "../lib/user-authorization";
import { users } from "@shared/schema";
import { storage } from "../storage";
import { guardianHasActiveFamily } from "../lib/family-access";
import { registerTwoFactorRoutes } from "./two-factor";
import { validTotp, consumeBackupCode } from "../lib/totp-service";
import { signStaffSession, staffSessionExpired, STAFF_SESSION_SECONDS } from "../lib/staff-session";
import {
  authenticateToken,
  esmRequire,
  JWT_SECRET,
  serializeUser,
  loadUserAuthData,
  loadGuardianPasswordChangedAt,
  isSessionInvalidated,
  passwordVersion,
  MSG_SESSION_INVALIDATED,
} from "./shared";

export function registerAuthRoutes(app: Express): void {
  registerTwoFactorRoutes(app);
  app.post("/api/auth/login", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const { email, password, totp_code } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password required" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user || user.is_active === false || !await bcrypt.compare(password, user.password_hash)) {
        return res.status(401).json({ message: "Credenciales inválidas" });
      }
      const { requiresPasswordChange } = await loadUserAuthData(user.id);

      // ── Verificación TOTP (2FA) ──────────────────────────────────────────
      if (user.twofa_secret) {
        if (!totp_code) {
          // Primer paso correcto; indicar al cliente que se necesita el código TOTP
          return res.json({ requires_totp: true });
        }
        const verified = validTotp(user.twofa_secret, user.id, totp_code) ||
          await consumeBackupCode(pool, { id: user.id, twofa_secret: user.twofa_secret }, totp_code);
        if (!verified) {
          return res.status(401).json({ message: "Código de verificación incorrecto. Intenta de nuevo." });
        }
      }

      const token = signStaffSession(user, JWT_SECRET, !!user.twofa_secret);

      res.json({ token, user: { id: user.id, email: user.email, name: user.name ?? "", role: user.role, campus_id: user.campus_id, tenant_id: user.tenant_id, requires_password_change: requiresPasswordChange, requires_twofa_setup: !user.twofa_secret } });
    } catch (error: any) {
      res.status(500).json({ message: "Login failed" });
    }
  });

  // GET /api/auth/user — perfil del usuario autenticado (usado por caja-conciliacion y fiscal-contable)
  app.get("/api/auth/user", authenticateToken, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const userId = (req as any).user?.id;
      const user = await storage.getUserById(userId);
      if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
      res.json({ ...serializeUser(user), requires_password_change: (req as any).user.requires_password_change,
        requires_twofa_setup: (req as any).user.twofa_verified !== true });
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  // Refresh token endpoint
  app.post("/api/auth/refresh", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Token requerido' });
      }
      
      const token = authHeader.split(' ')[1];
      
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;

        // Verificar que la contraseña no cambió después de que se emitió el token (#138).
        const isGuardian = decoded.type === 'guardian';
        if (!isGuardian && staffSessionExpired(decoded)) return res.status(401).json({ message: "Tu sesión terminó. Inicia sesión de nuevo." });
        const userAuth = isGuardian ? null : await loadUserAuthData(decoded.id);
        const passwordChangedAt = isGuardian
          ? await loadGuardianPasswordChangedAt(decoded.id)
          : userAuth!.passwordChangedAt;
        if ((!isGuardian && !userAuth!.active) || isSessionInvalidated(decoded.password_version, passwordChangedAt)) {
          return res.status(401).json({ message: MSG_SESSION_INVALIDATED, code: 'SESSION_INVALIDATED' });
        }

        const newToken = jwt.sign(
          {
            id:        decoded.id,
            email:     decoded.email,
            role:      decoded.role,
            campus_id: decoded.campus_id,
            tenant_id: decoded.tenant_id,
            type:      decoded.type || 'user',
            password_version: passwordVersion(passwordChangedAt),
            ...(!isGuardian ? { twofa_verified: decoded.twofa_verified === true, session_started_at: decoded.session_started_at ?? decoded.iat, is_super_admin: decoded.is_super_admin } : {}),
          },
          JWT_SECRET,
          { expiresIn: isGuardian ? 86400 : Math.max(1, (decoded.session_started_at ?? decoded.iat) + STAFF_SESSION_SECONDS - Math.floor(Date.now() / 1000)) }
        );
        res.json({ token: newToken });
      } catch (jwtError) {
        // El único caso legítimo de refresh es un token con firma VÁLIDA pero expirado.
        // jwt.verify con ignoreExpiration:true verifica la firma criptográfica pero
        // tolera que el claim exp haya vencido — es el único camino que debe pasar.
        // Cualquier otro error (firma inválida, token malformado, algoritmo incorrecto)
        // lanza de nuevo y se rechaza con 401 — sin ningún camino alterno (fix bypass).
        try {
          const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true }) as any;

          // Verificar que la contraseña no cambió después de que se emitió el token (#138).
          const isGuardian = decoded.type === 'guardian';
          if (!isGuardian && staffSessionExpired(decoded)) return res.status(401).json({ message: "Tu sesión terminó. Inicia sesión de nuevo." });
          const userAuth = isGuardian ? null : await loadUserAuthData(decoded.id);
          const passwordChangedAt = isGuardian
            ? await loadGuardianPasswordChangedAt(decoded.id)
            : userAuth!.passwordChangedAt;
          if ((!isGuardian && !userAuth!.active) || isSessionInvalidated(decoded.password_version, passwordChangedAt)) {
            return res.status(401).json({ message: MSG_SESSION_INVALIDATED, code: 'SESSION_INVALIDATED' });
          }

          // Verificar que el usuario aún existe en DB
          const user = isGuardian ? null : await storage.getUser(decoded.id);
          if (!isGuardian && !user) return res.status(401).json({ message: 'Usuario no encontrado' });

          const newToken = jwt.sign(
            {
              id:        isGuardian ? decoded.id : user!.id,
              email:     isGuardian ? decoded.email : user!.email,
              role:      isGuardian ? decoded.role : user!.role,
              campus_id: isGuardian ? decoded.campus_id : user!.campus_id,
              tenant_id: isGuardian ? decoded.tenant_id : user!.tenant_id,
              type:      decoded.type || 'user',
              password_version: passwordVersion(passwordChangedAt),
              ...(!isGuardian ? { twofa_verified: decoded.twofa_verified === true, session_started_at: decoded.session_started_at ?? decoded.iat, is_super_admin: user!.is_super_admin } : {}),
            },
            JWT_SECRET,
            { expiresIn: isGuardian ? 86400 : Math.max(1, (decoded.session_started_at ?? decoded.iat) + STAFF_SESSION_SECONDS - Math.floor(Date.now() / 1000)) }
          );
          return res.json({ token: newToken });
        } catch {
          // Firma inválida, token malformado o cualquier otro error JWT → 401
          return res.status(401).json({ message: 'Token inválido' });
        }
      }
    } catch (error: any) {
      res.status(500).json({ message: "Token refresh failed" });
    }
  });

  // Guardian login
  app.post("/api/auth/guardian-login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password required" });
      }

      const guardian = await storage.getGuardianByEmail(email);
      if (!guardian || !guardian.password_hash || !await bcrypt.compare(password, guardian.password_hash)) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      if (!await guardianHasActiveFamily(guardian.id, Number((guardian as any).tenant_id))) {
        return res.status(403).json({
          message: "El acceso de este tutor está suspendido porque no pertenece a una familia activa.",
          code: "GUARDIAN_FAMILY_ARCHIVED",
        });
      }

      const token = jwt.sign(
        {
          id:        guardian.id,
          email:     guardian.email,
          tenant_id: (guardian as any).tenant_id,
          campus_id: (guardian as any).campus_id,   // requerido por /api/guardian/pagar → getActiveStripeAccountForCampus
          type:      'guardian',
          password_version: passwordVersion(guardian.password_changed_at),
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({ token, guardian: { id: guardian.id, email: guardian.email, nombre_completo: guardian.nombre_completo, tenant_id: (guardian as any).tenant_id, campus_id: (guardian as any).campus_id } });
    } catch (error: any) {
      res.status(500).json({ message: "Login failed" });
    }
  });

  // ── POST /api/admin/magic-link ─────────────────────────────────────────────
  // Genera una liga mágica de acceso para un tutor (72 h, máx 3 usos).
  // Requiere autenticación de administrador (type==="user", no guardian JWT).
  app.post("/api/admin/magic-link", authenticateToken, async (req: any, res) => {
    try {
      const user      = req.user;
      const tenantId  = user?.tenant_id;
      const { guardian_id } = req.body;

      // Solo personal del plantel con rol de administración o caja puede emitir ligas.
      // Bloquea explícitamente: JWTs de tutores, y usuarios sin rol autorizado.
      const ROLES_MAGIC_ISSUE = ['administrador_general','administrador_campus','super_admin',
                                  'caja','auxiliar_caja','asistente','admisiones'];
      if (user?.type === "guardian" || (!user?.is_super_admin && !ROLES_MAGIC_ISSUE.includes(user?.role))) {
        return res.status(403).json({ message: "Solo los administradores pueden generar ligas de pago" });
      }

      if (!guardian_id) return res.status(400).json({ message: "guardian_id requerido" });

      // Verificar que el tutor pertenece al tenant del usuario
      const guardianCheck = await pool.query(
        `SELECT id, nombres, apellido_paterno, correo_institucional_familiar, email, celular, tenant_id
         FROM guardians WHERE id = $1 AND tenant_id = $2`,
        [guardian_id, tenantId]
      );
      if (!guardianCheck.rows.length) {
        return res.status(404).json({ message: "Tutor no encontrado" });
      }
      const guardian = guardianCheck.rows[0] as any;
      if (!await guardianHasActiveFamily(guardian.id, tenantId)) {
        return res.status(409).json({
          message: "No se puede emitir una liga para un tutor sin familia activa.",
          code: "GUARDIAN_FAMILY_ARCHIVED",
        });
      }

      // Crear tabla si no existe (idempotente — migración puede no haberse corrido)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS magic_link_tokens (
          id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, guardian_id INTEGER NOT NULL,
          token VARCHAR(128) NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL,
          uses INTEGER NOT NULL DEFAULT 0, max_uses INTEGER NOT NULL DEFAULT 3,
          revoked_at TIMESTAMPTZ,
          created_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `).catch(() => {});

      // Generar token único (48 bytes aleatorios = 96 hex chars en la URL).
      // Solo se almacena el SHA-256 del token en la BD; si la BD se compromete,
      // los tokens crudos siguen sin ser utilizables directamente.
      const crypto = await import("crypto");
      const rawToken  = crypto.randomBytes(48).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 horas

      await pool.query(
        `INSERT INTO magic_link_tokens (tenant_id, guardian_id, token, expires_at, uses, max_uses, created_by)
         VALUES ($1, $2, $3, $4, 0, 3, $5)`,
        [tenantId, guardian_id, tokenHash, expiresAt, user.id]
      );

      // Construir URL usando REPLIT_DEV_DOMAIN si está disponible, o el host de la request
      const host = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `${req.protocol}://${req.get("host")}`;
      const url = `${host}/pagar/${rawToken}`;  // URL lleva el token crudo, no el hash

      res.json({
        url,
        expires_at: expiresAt.toISOString(),
        contact_message: guardian.correo_institucional_familiar || guardian.email ? null
          : guardian.celular
            ? "Este tutor no tiene correo. Comparte la liga por su celular registrado; no se envió automáticamente."
            : "Este tutor no tiene correo ni celular. Copia la liga para compartirla por otro medio.",
        guardian: {
          id:     guardian.id,
          nombre: `${guardian.nombres} ${guardian.apellido_paterno}`.trim(),
          email:  guardian.correo_institucional_familiar || guardian.email || null,
          celular: guardian.celular || null,
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── GET /api/auth/magic/:token ─────────────────────────────────────────────
  // Canjea una liga mágica; devuelve JWT de tutor (4 h) si el token es válido.
  // Ruta PÚBLICA — no requiere autenticación previa.
  app.get("/api/auth/magic/:token", async (req, res) => {
    try {
      const rawToken = req.params.token;

      // Asegurar que la tabla existe
      await pool.query(`
        CREATE TABLE IF NOT EXISTS magic_link_tokens (
          id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, guardian_id INTEGER NOT NULL,
          token VARCHAR(128) NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL,
          uses INTEGER NOT NULL DEFAULT 0, max_uses INTEGER NOT NULL DEFAULT 3,
          revoked_at TIMESTAMPTZ,
          created_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `).catch(() => {});

      // Hashear el token recibido en la URL para buscarlo en la BD.
      // La BD solo almacena el hash SHA-256 — el token crudo nunca se persiste.
      const cryptoLib = await import("crypto");
      const tokenHash = cryptoLib.createHash("sha256").update(rawToken).digest("hex");

      // Canje atómico: incrementa uses solo si el token aún es válido.
      // Un solo UPDATE con condición + RETURNING evita la race condition de
      // lecturas concurrentes que podrían superar max_uses.
      const redeemResult = await pool.query(
        `UPDATE magic_link_tokens
         SET uses = uses + 1
         WHERE token = $1
           AND expires_at > NOW()
           AND uses < max_uses
            AND revoked_at IS NULL
         RETURNING id, guardian_id, expires_at, uses, max_uses, tenant_id`,
        [tokenHash]
      );

      if (!redeemResult.rows.length) {
        // Determinar si el token existe pero está agotado/expirado, o no existe
        const check = await pool.query(
          `SELECT expires_at, uses, max_uses, revoked_at FROM magic_link_tokens WHERE token = $1`,
          [tokenHash]
        );
        if (!check.rows.length) {
          return res.status(404).json({ message: "Liga de acceso no encontrada o inválida" });
        }
        const r = check.rows[0] as any;
        if (r.revoked_at) {
          return res.status(410).json({ message: "Esta liga fue revocada. Solicita una nueva al plantel." });
        }
        if (new Date() > new Date(r.expires_at)) {
          return res.status(410).json({ message: "Esta liga expiró. Solicita una nueva al plantel." });
        }
        return res.status(410).json({ message: "Esta liga ya fue utilizada el máximo de veces permitido. Solicita una nueva." });
      }

      const row = redeemResult.rows[0] as any;

      // Obtener datos del guardian con verificación de tenant para garantizar
      // que el guardian_id pertenece al mismo tenant que el token.
      // Si el guardian fue eliminado/reasignado después de emitir el token,
      // fallamos aquí sin emitir un JWT con identidad inconsistente.
      const gResult = await pool.query(
        `SELECT nombres, apellido_paterno, correo_institucional_familiar, email, nombre_completo, password_changed_at
         FROM guardians WHERE id = $1 AND tenant_id = $2`,
        [row.guardian_id, row.tenant_id]
      );
      if (!gResult.rows.length) {
        // Guardian no encontrado en el tenant del token — no emitir JWT
        return res.status(410).json({ message: "El acceso de este tutor ya no está disponible. Solicita una nueva liga al plantel." });
      }
      if (!await guardianHasActiveFamily(row.guardian_id, row.tenant_id)) {
        return res.status(410).json({
          message: "Esta liga ya no se puede usar porque la familia del tutor está archivada.",
        });
      }
      const g = gResult.rows[0] as any;

      // Generar JWT de tutor (4 horas)
      const guardianEmail = g.correo_institucional_familiar || g.email || null;
      const guardianJwt = jwt.sign(
        { id: row.guardian_id, email: guardianEmail, tenant_id: row.tenant_id, type: 'guardian', password_version: passwordVersion(g.password_changed_at) },
        JWT_SECRET,
        { expiresIn: '4h' }
      );

      res.json({
        token: guardianJwt,
        guardian: {
          id:             row.guardian_id,
          email:          guardianEmail,
          nombre_completo: g.nombre_completo || `${g.nombres || ''} ${g.apellido_paterno || ''}`.trim(),
          tenant_id:      row.tenant_id,
        },
        usos_restantes: row.max_uses - row.uses,   // uses ya fue incrementado por el UPDATE
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── GET /api/admin/magic-link/history/:guardianId ─────────────────────────
  // Historial de ligas generadas para un tutor (auditoría).
  // Solo usuarios del panel admin — bloquear JWTs de tutores.
  app.get("/api/admin/magic-link/history/:guardianId", authenticateToken, async (req: any, res) => {
    try {
      const ROLES_MAGIC_ISSUE = ['administrador_general','administrador_campus','super_admin',
                                   'caja','auxiliar_caja','asistente','admisiones'];
      if (req.user?.type === "guardian" || (!req.user?.is_super_admin && !ROLES_MAGIC_ISSUE.includes(req.user?.role))) {
        return res.status(403).json({ message: "Acceso restringido a administradores" });
      }
      const tenantId    = req.user?.tenant_id;
      const guardianId  = parseInt(req.params.guardianId);

      const rows = await pool.query(
        `SELECT mlt.id, mlt.token, mlt.created_at, mlt.expires_at, mlt.uses, mlt.max_uses,
                u.name AS creado_por
         FROM magic_link_tokens mlt
         LEFT JOIN users u ON u.id = mlt.created_by
         WHERE mlt.guardian_id = $1 AND mlt.tenant_id = $2
         ORDER BY mlt.created_at DESC LIMIT 10`,
        [guardianId, tenantId]
      );

      res.json(rows.rows.map((r: any) => ({
        id:           r.id,
        creado_en:    r.created_at,
        expira_en:    r.expires_at,
        usos:         r.uses,
        max_usos:     r.max_uses,
        expirada:     new Date() > new Date(r.expires_at),
        agotada:      r.uses >= r.max_uses,
        creado_por:   r.creado_por || "Sistema",
      })));
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── Dev-only: resetear rate limiters de autenticación ────────────────────────
  // Solo disponible en desarrollo (NODE_ENV !== "production").
  // Usado por E2E tests para limpiar contadores entre runs consecutivos.
  // Protocolo §5: ruta condicional con export de función, sin NODE_ENV en handlers.

}
