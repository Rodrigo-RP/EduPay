/**
 * CONTEXTO DE TENANT — Utilidades para Multi-tenancy Seguro
 *
 * Proporciona dos capas de defensa:
 * 1. Filtrado explícito: storage scoped por tenant_id derivado del JWT (capa primaria)
 * 2. RLS de PostgreSQL: activo cuando set_config('app.current_tenant') está seteado (capa secundaria)
 *
 * Uso en operaciones sensibles:
 *   await withTenantContext(tenantId, (tx) => tx.select()...);
 *
 * El tenant_id SIEMPRE se deriva del JWT, nunca del cuerpo de la petición.
 */

import { db } from "./db";
import { sql } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

/**
 * Ejecuta una función dentro de una transacción con el tenant seteado vía SET LOCAL.
 * Activa las políticas RLS de PostgreSQL para la duración de la transacción.
 * El parámetro `tx` recibido por `fn` debe usarse en lugar del `db` global.
 */
export async function withTenantContext<T>(
  tenantId: number,
  fn: (tx: any) => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.current_tenant', ${tenantId.toString()}, true)`
    );
    return await fn(tx);
  });
}

/**
 * Middleware de Express: extrae tenant_id del JWT verificado y lo expone como req.tenantId.
 * Debe ejecutarse DESPUÉS de authenticateToken / requireAuth.
 * Si el token no tiene tenant_id (tokens antiguos), req.tenantId queda como null.
 */
export function setTenantFromRequest(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user;
  if (user?.tenant_id) {
    (req as any).tenantId = Number(user.tenant_id);
  } else {
    (req as any).tenantId = null;
  }
  next();
}

/**
 * Valida que el tenant del recurso coincida con el tenant del token autenticado.
 * Cuando el token tiene tenant:
 *   - el recurso DEBE tener tenant_id, y
 *   - ambos deben coincidir.
 *   Cualquier otro caso lanza 403 (sin tenant en recurso = dato inconsistente = acceso denegado).
 * Cuando el token NO tiene tenant (super admin sin tenant asignado), la validación se omite.
 */
export function assertTenantOwnership(
  reqTenantId: number | null | undefined,
  resourceTenantId: number | null | undefined,
  resourceName = "recurso"
): void {
  if (!reqTenantId) return;  // Super admin: sin restricción de tenant

  // Recursos sin tenant_id en base a datos son datos inconsistentes: denegar acceso
  if (!resourceTenantId) {
    const error = new Error(`Acceso denegado: ${resourceName} no tiene tenant asignado — ejecutar backfill`) as any;
    error.status = 403;
    throw error;
  }

  if (reqTenantId !== resourceTenantId) {
    const error = new Error(`Acceso denegado: ${resourceName} no pertenece a este tenant`) as any;
    error.status = 403;
    throw error;
  }
}
