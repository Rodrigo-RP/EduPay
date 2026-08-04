import type { Express } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db, pool } from "../db";
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";
import { storage } from "../storage";
import { authenticateToken, esmRequire, JWT_SECRET, serializeUser } from "./shared";

// Estado de enrolamiento 2FA — TTL 10 min, solo accesible dentro de este módulo
const pendingTwofaEnrollment = new Map<number, { secret: string; expiresAt: number }>();

// Roles autorizados para 2FA
const ROLES_2FA = ['administrador_general','administrador_campus','super_admin',
                   'contador_general','auxiliar_contable','asistente','admisiones'];
const require2faRole = (req: any, res: any, next: any) => {
  const u = req.user;
  if (u?.type === "guardian" || (!u?.is_super_admin && !ROLES_2FA.includes(u?.role))) {
    return res.status(403).json({ message: "Solo los administradores pueden configurar 2FA" });
  }
  next();
};

export function registerAuthRoutes(app: Express): void {
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password, totp_code } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password required" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user || !await bcrypt.compare(password, user.password_hash)) {
        return res.status(401).json({ message: "Credenciales inválidas" });
      }

      // ── Verificación TOTP (2FA) ──────────────────────────────────────────
      if (user.twofa_secret) {
        if (!totp_code) {
          // Primer paso correcto; indicar al cliente que se necesita el código TOTP
          return res.json({ requires_totp: true });
        }
        const speakeasy = esmRequire("speakeasy") as typeof import("speakeasy");
        const verified = speakeasy.totp.verify({
          secret:   user.twofa_secret,
          encoding: "base32",
          token:    String(totp_code),
          window:   1,  // tolera ±30 s de desfase de reloj
        });
        if (!verified) {
          return res.status(401).json({ message: "Código de verificación incorrecto. Intenta de nuevo." });
        }
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role, campus_id: user.campus_id, tenant_id: user.tenant_id, is_super_admin: user.is_super_admin, type: 'user' },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({ token, user: { id: user.id, email: user.email, role: user.role, campus_id: user.campus_id, tenant_id: user.tenant_id } });
    } catch (error: any) {
      res.status(500).json({ message: "Login failed" });
    }
  });

  // ── POST /api/auth/2fa/setup ───────────────────────────────────────────────
  // Genera un secreto TOTP temporal, lo almacena server-side vinculado al
  // user_id con TTL de 10 min, y devuelve el QR. El cliente NUNCA maneja
  // el secreto — /2fa/confirm lo lee del Map, no del body.
  app.post("/api/auth/2fa/setup", authenticateToken, require2faRole, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user?.id);
      if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

      const speakeasy = esmRequire("speakeasy") as typeof import("speakeasy");
      const qrcode    = esmRequire("qrcode") as typeof import("qrcode");

      const secret = speakeasy.generateSecret({
        name:   `Instituto JFR (${user.email})`,
        length: 32,
        issuer: "Edupay",
      });

      // Guardar estado de enrolamiento pendiente — expira en 10 minutos
      pendingTwofaEnrollment.set(req.user.id, {
        secret:    secret.base32 as string,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });

      const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url as string);
      // No se devuelve el secreto base32 al cliente — solo el QR y el código manual
      res.json({ qr_data_url: qrDataUrl, manual_code: secret.base32 });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── POST /api/auth/2fa/confirm ─────────────────────────────────────────────
  // Verifica el primer código TOTP contra el secreto pendiente guardado
  // server-side. Ignora cualquier secreto enviado por el cliente.
  app.post("/api/auth/2fa/confirm", authenticateToken, require2faRole, async (req: any, res) => {
    try {
      const { totp_code } = req.body;
      if (!totp_code) return res.status(400).json({ message: "totp_code requerido" });

      // Leer secreto del estado server-side — el cliente no puede inyectar uno
      const pending = pendingTwofaEnrollment.get(req.user.id);
      if (!pending) {
        return res.status(400).json({ message: "No hay enrolamiento pendiente. Inicia el proceso desde Perfil > Seguridad." });
      }
      if (Date.now() > pending.expiresAt) {
        pendingTwofaEnrollment.delete(req.user.id);
        return res.status(410).json({ message: "El enrolamiento expiró. Escanea el QR de nuevo." });
      }

      const speakeasy = esmRequire("speakeasy") as typeof import("speakeasy");
      const verified = speakeasy.totp.verify({ secret: pending.secret, encoding: "base32", token: String(totp_code), window: 1 });
      if (!verified) return res.status(401).json({ message: "Código incorrecto. Verifica tu app de autenticación." });

      // Persistir y limpiar estado pendiente (consumo único)
      await db.update(users)
        .set({ twofa_secret: pending.secret, updated_at: new Date() })
        .where(eq(users.id, req.user.id));
      pendingTwofaEnrollment.delete(req.user.id);

      res.json({ message: "Autenticación de dos factores activada correctamente." });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── DELETE /api/auth/2fa ───────────────────────────────────────────────────
  // Desactiva el 2FA después de verificar el código TOTP actual.
  app.delete("/api/auth/2fa", authenticateToken, require2faRole, async (req: any, res) => {
    try {
      const { totp_code } = req.body;
      if (!totp_code) return res.status(400).json({ message: "totp_code requerido" });

      const user = await storage.getUser(req.user.id);
      if (!user?.twofa_secret) return res.status(400).json({ message: "El 2FA no está activado en esta cuenta." });

      const speakeasy = esmRequire("speakeasy") as typeof import("speakeasy");
      const verified = speakeasy.totp.verify({ secret: user.twofa_secret, encoding: "base32", token: String(totp_code), window: 1 });
      if (!verified) return res.status(401).json({ message: "Código incorrecto. No se desactivó el 2FA." });

      await db.update(users)
        .set({ twofa_secret: null, updated_at: new Date() })
        .where(eq(users.id, req.user.id));

      res.json({ message: "Autenticación de dos factores desactivada." });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // GET /api/auth/user — perfil del usuario autenticado (usado por caja-conciliacion y fiscal-contable)
  app.get("/api/auth/user", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      const user = await storage.getUserById(userId);
      if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
      res.json(serializeUser(user));
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
        
        // Generate new token with same payload but fresh expiration
        const newToken = jwt.sign(
          { 
            id: decoded.id, 
            email: decoded.email, 
            role: decoded.role, 
            campus_id: decoded.campus_id,
            tenant_id: decoded.tenant_id,
            type: decoded.type || 'user' 
          },
          JWT_SECRET,
          { expiresIn: '24h' }
        );
        
        res.json({ token: newToken });
      } catch (jwtError) {
        // Token is expired or invalid, try to decode without verification to get user info
        const decoded = jwt.decode(token) as any;
        
        if (decoded && decoded.id) {
          // Verify user still exists
          const user = await storage.getUser(decoded.id);
          if (user) {
            const newToken = jwt.sign(
              { 
                id: user.id, 
                email: user.email, 
                role: user.role, 
                campus_id: user.campus_id,
                tenant_id: user.tenant_id,
                type: decoded.type || 'user' 
              },
              JWT_SECRET,
              { expiresIn: '24h' }
            );
            
            res.json({ token: newToken });
          } else {
            res.status(401).json({ message: 'Usuario no encontrado' });
          }
        } else {
          res.status(401).json({ message: 'Token inválido' });
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

      const token = jwt.sign(
        { id: guardian.id, email: guardian.email, tenant_id: (guardian as any).tenant_id, type: 'guardian' },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({ token, guardian: { id: guardian.id, email: guardian.email, nombre_completo: guardian.nombre_completo, tenant_id: (guardian as any).tenant_id } });
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
        `SELECT id, nombres, apellido_paterno, correo_institucional_familiar, email, tenant_id
         FROM guardians WHERE id = $1 AND tenant_id = $2`,
        [guardian_id, tenantId]
      );
      if (!guardianCheck.rows.length) {
        return res.status(404).json({ message: "Tutor no encontrado" });
      }
      const guardian = guardianCheck.rows[0] as any;

      // Crear tabla si no existe (idempotente — migración puede no haberse corrido)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS magic_link_tokens (
          id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, guardian_id INTEGER NOT NULL,
          token VARCHAR(128) NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL,
          uses INTEGER NOT NULL DEFAULT 0, max_uses INTEGER NOT NULL DEFAULT 3,
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
        guardian: {
          id:     guardian.id,
          nombre: `${guardian.nombres} ${guardian.apellido_paterno}`.trim(),
          email:  guardian.correo_institucional_familiar || guardian.email,
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
         RETURNING id, guardian_id, expires_at, uses, max_uses, tenant_id`,
        [tokenHash]
      );

      if (!redeemResult.rows.length) {
        // Determinar si el token existe pero está agotado/expirado, o no existe
        const check = await pool.query(
          `SELECT expires_at, uses, max_uses FROM magic_link_tokens WHERE token = $1`,
          [tokenHash]
        );
        if (!check.rows.length) {
          return res.status(404).json({ message: "Liga de acceso no encontrada o inválida" });
        }
        const r = check.rows[0] as any;
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
        `SELECT nombres, apellido_paterno, correo_institucional_familiar, email, nombre_completo
         FROM guardians WHERE id = $1 AND tenant_id = $2`,
        [row.guardian_id, row.tenant_id]
      );
      if (!gResult.rows.length) {
        // Guardian no encontrado en el tenant del token — no emitir JWT
        return res.status(410).json({ message: "El acceso de este tutor ya no está disponible. Solicita una nueva liga al plantel." });
      }
      const g = gResult.rows[0] as any;

      // Generar JWT de tutor (4 horas)
      const guardianEmail = g.correo_institucional_familiar || g.email || `guardian_${row.guardian_id}@noemail`;
      const guardianJwt = jwt.sign(
        { id: row.guardian_id, email: guardianEmail, tenant_id: row.tenant_id, type: 'guardian' },
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
      ).catch(() => ({ rows: [] }));

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
}
