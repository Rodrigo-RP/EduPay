import type { Express } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { db, pool } from "../db";
import { eq, and } from "drizzle-orm";
import { users, institutional_info, institutional_credentials, guardians } from "@shared/schema";
import { insertUserSchema, insertGuardianSchema, insertInstitutionalInfoSchema } from "@shared/schema";
import { canEditUser, UserRole } from "@shared/permissions";
import { storage } from "../storage";
import { wsManager } from "../websocket-manager";
import { authenticateToken, authenticateGuardian, requireSuperAdmin, serializeUser, esmRequire, JWT_SECRET } from "./shared";
import { enqueueAuditLog, type AuditLogPayload } from "../audit-retry";

export function registerUserRoutes(app: Express): void {
  app.get("/api/profile", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Return user profile without password or 2FA secret; expose only has_twofa flag
      const { password_hash, twofa_secret, ...profile } = user;
      res.json({ ...profile, has_twofa: !!twofa_secret });
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching profile" });
    }
  });

  // Update user profile
  app.put("/api/profile", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      const { name, email, telefono, foto_url } = req.body;
      
      // Get current user data
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (telefono !== undefined) updates.telefono = telefono;
      if (foto_url !== undefined) updates.foto_url = foto_url;
      
      // Check if email is being changed and if it's already in use
      if (email !== undefined && email !== currentUser.email) {
        const existingUser = await storage.getUserByEmail(email);
        if (existingUser && existingUser.id !== userId) {
          return res.status(400).json({ 
            message: "Este email ya está en uso por otro usuario" 
          });
        }
        updates.email = email;
      }
      
      await storage.updateUserProfile(userId, updates);
      
      // Get updated user data
      const updatedUser = await storage.getUser(userId);
      if (updatedUser) {
        res.json({ message: "Perfil actualizado exitosamente", profile: serializeUser(updatedUser) });
      } else {
        res.status(404).json({ message: "Usuario no encontrado" });
      }
    } catch (error: any) {
      console.error("Error updating profile:", error);
      res.status(500).json({ 
        message: "Error actualizando perfil: " + (error.message || "Error desconocido")
      });
    }
  });

  // Update user password
  app.put("/api/profile/password", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password are required" });
      }
      
      // Verify current password
      const user = await storage.getUser(userId);
      if (!user || !await bcrypt.compare(currentPassword, user.password_hash)) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }
      
      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUserPassword(userId, hashedPassword);
      
      res.json({ message: "Password updated successfully" });
    } catch (error: any) {
      res.status(500).json({ message: "Error updating password" });
    }
  });

  // Get guardian profile
  app.get("/api/guardian/profile", authenticateGuardian, async (req: any, res) => {
    try {
      const guardianId = req.guardian?.id;
      const tenantId = req.guardian?.tenant_id;
      // getGuardianScoped verifica que el guardián pertenece al tenant del JWT
      const guardian = await storage.getGuardianScoped(guardianId, tenantId);
      if (!guardian) {
        return res.status(404).json({ message: "Guardian not found" });
      }
      // Nunca serializar password_hash
      const { password_hash, ...profile } = guardian as any;
      res.json(profile);
    } catch (error: any) {
      res.status(500).json({ message: "Error fetching profile" });
    }
  });

  // Update guardian profile
  app.put("/api/guardian/profile", authenticateGuardian, async (req: any, res) => {
    try {
      const guardianId = req.guardian?.id;
      const tenantId = req.guardian?.tenant_id;

      // Verificar ownership antes de actualizar
      const existing = await storage.getGuardianScoped(guardianId, tenantId);
      if (!existing) {
        return res.status(403).json({ message: "Acceso denegado" });
      }

      const { nombre_completo, email, telefono, foto_url } = req.body;
      const updates: any = {};
      if (nombre_completo !== undefined) updates.nombre_completo = nombre_completo;
      if (email !== undefined) updates.email = email;
      if (telefono !== undefined) updates.telefono = telefono;
      if (foto_url !== undefined) updates.foto_url = foto_url;
      
      await storage.updateGuardianProfile(guardianId, updates);
      
      const updatedGuardian = await storage.getGuardianScoped(guardianId, tenantId);
      if (updatedGuardian) {
        const { password_hash, ...profile } = updatedGuardian as any;
        res.json({ message: "Profile updated successfully", profile });
      } else {
        res.status(404).json({ message: "Guardian not found" });
      }
    } catch (error: any) {
      res.status(500).json({ message: "Error updating profile" });
    }
  });

  // Update guardian password
  app.put("/api/guardian/profile/password", authenticateGuardian, async (req: any, res) => {
    try {
      const guardianId = req.guardian?.id;
      const tenantId = req.guardian?.tenant_id;
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password are required" });
      }
      
      // Verificar ownership y luego contraseña actual
      const guardian = await storage.getGuardianScoped(guardianId, tenantId);
      if (!guardian) {
        return res.status(403).json({ message: "Acceso denegado" });
      }
      const fullGuardian = await storage.getGuardian(guardianId);
      if (!fullGuardian?.password_hash || !await bcrypt.compare(currentPassword, fullGuardian.password_hash)) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }
      
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateGuardianProfile(guardianId, { password_hash: hashedPassword } as any);
      
      res.json({ message: "Password updated successfully" });
    } catch (error: any) {
      res.status(500).json({ message: "Error updating password" });
    }
  });

  // Get users for current campus (for campus admin management)
  app.get("/api/users", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      const campusId = user.campus_id;
      
      if (!campusId) {
        return res.status(400).json({ message: "Campus ID requerido" });
      }
      
      const users = await storage.getUsersByCampus(campusId);
      res.json(users.map(serializeUser));
    } catch (error: any) {
      res.status(500).json({ message: "Error obteniendo usuarios" });
    }
  });

  // Create new user
  app.post("/api/users", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      const campusId = user.campus_id;
      
      if (!campusId) {
        return res.status(400).json({ message: "Campus ID requerido" });
      }

      // Validate request body first
      // twofa_secret se excluye intencionalmente — solo se puede configurar
      // a través del flujo seguro de /api/auth/2fa/setup + /confirm
      const { name, email, password_hash, role, telefono, foto_url, is_active, is_super_admin, platform_permissions, custom_permissions } = req.body;
      
      // SEGURIDAD: Verificar que el usuario actual puede crear usuarios con el rol especificado
      if (user.role !== 'super_admin' && !canEditUser(user.role as UserRole, role as UserRole)) {
        return res.status(403).json({ 
          message: "No tienes permisos para crear usuarios con este rol",
          detail: `Un ${user.role} no puede crear usuarios con rol ${role}`
        });
      }
      
      // Prepare user data with required fields
      const userData = {
        name,
        email,
        password_hash,
        role,
        campus_id: campusId,
        tenant_id: user.tenant_id,
        telefono: telefono || null,
        foto_url: foto_url || null,
        twofa_secret: null,   // siempre null — se configura via /api/auth/2fa/setup
        is_active: is_active !== undefined ? is_active : true,
        is_super_admin: is_super_admin || false,
        platform_permissions: platform_permissions || [],
        custom_permissions: custom_permissions || []
      };

      const newUser = await storage.createUser(userData);
      
      // Notify real-time update
      wsManager.notifyUserUpdate(newUser, 'create', {
        campus_id: campusId,
        tenant_id: user.tenant_id,
        created_by: user.id
      });
      
      res.status(201).json(serializeUser(newUser));
    } catch (error: any) {
      console.error('Error creating user:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos de usuario inválidos", errors: error.errors });
      }
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // Update existing user
  app.put("/api/users/:id", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      const userId = parseInt(req.params.id);
      
      if (isNaN(userId)) {
        return res.status(400).json({ message: "ID de usuario inválido" });
      }

      // Only allow updating users from the same campus
      const existingUser = await storage.getUser(userId);
      if (!existingUser || existingUser.campus_id !== user.campus_id) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }
      
      // SEGURIDAD: Verificar que el usuario actual puede editar al usuario objetivo
      if (user.role !== 'super_admin' && !canEditUser(user.role as UserRole, existingUser.role as UserRole)) {
        return res.status(403).json({ 
          message: "No tienes permisos para editar este usuario",
          detail: `Un ${user.role} no puede editar usuarios con rol ${existingUser.role}`
        });
      }

      // Eliminar campos protegidos del cuerpo de actualización.
      // twofa_secret solo se puede modificar via /api/auth/2fa/* (flujo seguro).
      const { id, campus_id, tenant_id, created_at, updated_at, password_hash, twofa_secret: _ignored, ...updateData } = req.body;

      const updatedUser = await storage.updateUser(userId, updateData);
      if (!updatedUser) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }

      // Notify real-time update
      wsManager.notifyUserUpdate(updatedUser, 'update', {
        campus_id: user.campus_id,
        tenant_id: user.tenant_id,
        created_by: user.id
      });

      res.json(serializeUser(updatedUser));
    } catch (error: any) {
      console.error('Error updating user:', error);
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // Delete user
  app.delete("/api/users/:id", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      const userId = parseInt(req.params.id);
      
      if (isNaN(userId)) {
        return res.status(400).json({ message: "ID de usuario inválido" });
      }

      // Only allow deleting users from the same campus
      const existingUser = await storage.getUser(userId);
      if (!existingUser || existingUser.campus_id !== user.campus_id) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }

      // Prevent deleting yourself
      if (userId === user.id) {
        return res.status(400).json({ message: "No puedes eliminar tu propia cuenta" });
      }
      
      // SEGURIDAD: Verificar que el usuario actual puede eliminar al usuario objetivo
      if (user.role !== 'super_admin' && !canEditUser(user.role as UserRole, existingUser.role as UserRole)) {
        return res.status(403).json({ 
          message: "No tienes permisos para eliminar este usuario",
          detail: `Un ${user.role} no puede eliminar usuarios con rol ${existingUser.role}`
        });
      }

      const deleted = await storage.deleteUser(userId);
      if (!deleted) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }

      // Auditoría: fire-and-forget fuera de transacción (ADR-001)
      const auditPayload1: AuditLogPayload = {
        tenant_id:   user.tenant_id,
        user_id:     user.id ?? null,
        action:      "user_deleted",
        entity_type: "user",
        entity_id:   userId,
        metadata: {
          deleted_user_id:    userId,
          deleted_user_role:  existingUser.role,
          deleted_user_email: existingUser.email,
          actor_role:         user.role,
          endpoint:           "DELETE /api/users/:id",
        },
      };
      pool.query(
        `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [auditPayload1.tenant_id, auditPayload1.user_id, auditPayload1.action,
         auditPayload1.entity_type, auditPayload1.entity_id, JSON.stringify(auditPayload1.metadata)]
      ).catch((err) => enqueueAuditLog(auditPayload1, err));

      // Notify real-time update
      wsManager.notifyUserUpdate({ id: userId }, 'delete', {
        campus_id: user.campus_id,
        tenant_id: user.tenant_id,
        created_by: user.id
      });

      res.json({ message: "Usuario eliminado exitosamente" });
    } catch (error: any) {
      console.error('Error deleting user:', error);
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // /api/admin/users/:id DELETE — alias usado por usuarios-unificado.tsx
  app.delete("/api/admin/users/:id", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) return res.status(400).json({ message: "ID inválido" });
      const existingUser = await storage.getUser(userId);
      if (!existingUser || existingUser.campus_id !== user.campus_id) return res.status(404).json({ message: "Usuario no encontrado" });
      if (userId === user.id) return res.status(400).json({ message: "No puedes eliminar tu propia cuenta" });
      // SEGURIDAD: misma guardia de jerarquía que /api/users/:id (línea 329).
      // Sin este check cualquier usuario autenticado podía borrar a uno de mayor rango.
      if (user.role !== 'super_admin' && !canEditUser(user.role as UserRole, existingUser.role as UserRole)) {
        return res.status(403).json({
          message: "No tienes permisos para eliminar este usuario",
          detail: `Un ${user.role} no puede eliminar usuarios con rol ${existingUser.role}`
        });
      }
      const deleted = await storage.deleteUser(userId);
      if (!deleted) return res.status(404).json({ message: "Usuario no encontrado" });

      // Auditoría: fire-and-forget fuera de transacción (ADR-001)
      const auditPayload2: AuditLogPayload = {
        tenant_id:   user.tenant_id,
        user_id:     user.id ?? null,
        action:      "user_deleted",
        entity_type: "user",
        entity_id:   userId,
        metadata: {
          deleted_user_id:    userId,
          deleted_user_role:  existingUser.role,
          deleted_user_email: existingUser.email,
          actor_role:         user.role,
          endpoint:           "DELETE /api/admin/users/:id",
        },
      };
      pool.query(
        `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [auditPayload2.tenant_id, auditPayload2.user_id, auditPayload2.action,
         auditPayload2.entity_type, auditPayload2.entity_id, JSON.stringify(auditPayload2.metadata)]
      ).catch((err) => enqueueAuditLog(auditPayload2, err));

      res.json({ message: "Usuario eliminado exitosamente" });
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  // PLATFORM LOGIN for Support and Implementation users
  app.post("/api/auth/platform-login", async (req, res) => {
    try {
      const { email, password, profile_type } = req.body;

      if (!email || !password || !profile_type) {
        return res.status(400).json({ message: "Email, password and profile type are required" });
      }

      // Demo users for testing
      const platformUsers = {
        "ana.soporte@edupay.com": {
          id: 100,
          email: "ana.soporte@edupay.com",
          name: "Ana García",
          role: "support",
          password: "Support123!",
          profile: {
            profile_type: "support",
            specialization: "technical_support",
            access_level: "read_write",
            support_tier: "tier2",
            assigned_schools: ["16", "17", "18"],
            permissions: ["view_tickets", "respond_tickets", "escalate_tickets", "view_metrics"]
          }
        },
        "carlos.implementacion@edupay.com": {
          id: 101,
          email: "carlos.implementacion@edupay.com",
          name: "Carlos Ramírez",
          role: "implementation",
          password: "Implement123!",
          profile: {
            profile_type: "implementation",
            specialization: "onboarding_specialist",
            access_level: "full_access",
            implementation_phase: "all_phases",
            assigned_schools: ["16", "17", "19"],
            permissions: ["manage_projects", "configure_systems", "train_users", "go_live_support"]
          }
        },
        "luis.configuracion@edupay.com": {
          id: 102,
          email: "luis.configuracion@edupay.com",
          name: "Luis Martínez",
          role: "implementation",
          password: "Config123!",
          profile: {
            profile_type: "implementation",
            specialization: "integration_expert",
            access_level: "read_write",
            implementation_phase: "setup",
            assigned_schools: ["20", "21"],
            permissions: ["configure_systems", "data_migration", "integration_setup"]
          }
        }
      };

      const user = platformUsers[email as keyof typeof platformUsers];
      
      if (!user || user.password !== password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Verify profile type matches
      if (user.role !== profile_type) {
        return res.status(403).json({ message: "Access denied for this profile type" });
      }

      const token = jwt.sign(
        { 
          id: user.id, 
          email: user.email, 
          role: user.role,
          profile_type: user.profile.profile_type
        },
        JWT_SECRET,
        { expiresIn: '8h' }
      );

      res.json({ 
        token, 
        user: { 
          id: user.id, 
          email: user.email, 
          name: user.name, 
          role: user.role 
        },
        profile: user.profile
      });
    } catch (error: any) {
      res.status(500).json({ message: "Platform login failed" });
    }
  });

  // Get institutional information
  app.get("/api/institutional-info", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      const settings = await storage.getInstitutionalSettings(user.campus_id);
      
      res.json(settings || {});
    } catch (error) {
      console.error('Error fetching institutional info:', error);
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // Save institutional information
  app.post("/api/institutional-info", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      const {
        rfc,
        direccion_fiscal,
        ciudad,
        codigo_postal,
        telefono_principal,
        email_institucional,
        sitio_web,
        nombre_legal,
        logo_url
      } = req.body;

      // Get user data to ensure we have tenant_id and campus_id
      const userData = await storage.getUserById(user.id);
      if (!userData || !userData.campus_id || !userData.tenant_id) {
        return res.status(404).json({ message: "Usuario no encontrado o datos incompletos" });
      }

      const institutionalData = {
        campus_id: userData.campus_id,
        tenant_id: userData.tenant_id,
        rfc,
        direccion_fiscal,
        ciudad,
        codigo_postal,
        telefono_principal,
        email_institucional,
        sitio_web,
        nombre_legal,
        logo_url
      };

      const savedSettings = await storage.saveInstitutionalSettings(institutionalData);
      
      res.json({ 
        message: "Información institucional guardada correctamente",
        data: savedSettings
      });
    } catch (error) {
      console.error('Error saving institutional info:', error);
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });
}
