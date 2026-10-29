import { ACTIONS, MODULES, canEditUser, type UserRole } from "@shared/permissions";
import { hasPermissionForUser } from "../routes/shared";

type Identity = { id?: number; role?: string; is_super_admin?: boolean | null; tenant_id?: number | null; campus_id?: number | null };
type Denial = { status: number; message: string };
const denied = (): Denial => ({ status: 403, message: "No tienes permiso para gestionar este usuario o asignar ese rol" });
export const BASIC_USER_FIELDS = ["name", "email", "telefono", "foto_url"] as const;

export function userInSessionScope<T extends Identity>(actor: Identity, target: T | undefined | null): target is T {
  return Boolean(actor.tenant_id && actor.campus_id && target &&
    target.tenant_id === actor.tenant_id && target.campus_id === actor.campus_id);
}

export function authorizeUserCreation(actor: Identity, body: Record<string, unknown>): Denial | null {
  if (!actor.tenant_id || !actor.campus_id ||
    !hasPermissionForUser(actor, MODULES.USERS, ACTIONS.CREATE) ||
    !canEditUser(actor.role as UserRole, body.role as UserRole)) return denied();
  // Un rol inferior no puede convertirse en superadministrador mediante flags.
  if (body.is_super_admin || (Array.isArray(body.platform_permissions) && body.platform_permissions.length)) return denied();
  return null;
}

export function authorizeUserMutation(
  actor: Identity, target: Identity | undefined | null, body: Record<string, unknown>,
  action: "edit" | "delete" | "status" | "password",
): Denial | null {
  body = body ?? {};
  if (!userInSessionScope(actor, target)) return { status: 404, message: "Usuario no encontrado" };
  if (actor.id === target!.id) {
    if (action === "edit" && Object.keys(body).every(k => BASIC_USER_FIELDS.includes(k as any))) return null;
    if (action === "password") return { status: 400, message: "Usa /api/profile/password para cambiar tu propia contraseña" };
    if (action === "delete") return { status: 400, message: "No puedes eliminar tu propia cuenta" };
    return denied();
  }
  if (!hasPermissionForUser(actor, MODULES.USERS, action === "delete" ? ACTIONS.DELETE : ACTIONS.UPDATE) ||
    !canEditUser(actor.role as UserRole, (target!.is_super_admin ? "super_admin" : target!.role) as UserRole)) return denied();
  if (body.role !== undefined && !canEditUser(actor.role as UserRole, body.role as UserRole)) return denied();
  if (body.is_super_admin || (Array.isArray(body.platform_permissions) && body.platform_permissions.length)) return denied();
  return null;
}

export function userUpdateData(body: Record<string, any>, target: any): Record<string, any> {
  const allowed = [...BASIC_USER_FIELDS, "role", "is_active", "custom_permissions"];
  const data = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key as any)));
  // Los cambios de rol/estado invalidan sesiones anteriores con el mecanismo existente.
  if ((data.role !== undefined && data.role !== target.role) ||
    (data.is_active !== undefined && data.is_active !== target.is_active)) data.password_changed_at = new Date();
  return data;
}
