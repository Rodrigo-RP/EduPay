/**
 * campus-payment.ts — Stripe Connect Express onboarding para campus
 *
 * Endpoints:
 *   POST /api/admin/campus-payment/conectar-stripe   — crea o reutiliza cuenta Express
 *   POST /api/admin/campus-payment/refresh-link      — genera Account Link nuevo
 *   GET  /api/admin/campus-payment/estado            — estado actual del campus
 *
 * Diseño:
 *   • Guard en escritura: SETTINGS.CONFIGURE + checkCampusTenant (cross-campus)
 *   • Guard en lectura:   SETTINGS.CONFIGURE (mínimo práctico incluye READ)
 *   • stripe_account_id (acct_…) se guarda en campus_payment_config — no es secreto.
 *   • La clave secreta (STRIPE_SECRET_KEY) vive en Replit Secrets, nunca en DB.
 *   • URL construction: patrón canónico de auth.ts (REPLIT_DEV_DOMAIN con fallback).
 *   • Protocolo §5: sin rutas condicionadas por NODE_ENV.
 *   • Audit: fuera de transacción (ADR-001).
 *
 * Sub-casos en POST /conectar-stripe:
 *   null (sin fila)    → crear cuenta Express en Stripe, INSERT campus_payment_config
 *   incompleto (acct_, charges_enabled=false) → reutilizar cuenta, solo generar Account Link
 *   completo (charges_enabled=true)           → 409
 *
 * API Stripe verificada con stripe@18.2.1 — version: 2025-05-28.basil (agosto 2026).
 *
 * registerCampusPaymentRoutes acepta un stripeOverride opcional para inyectar un
 * cliente de prueba en tests de integración, sin exponer rutas adicionales ni
 * violar el Protocolo §5 (sin condicionales NODE_ENV).
 */

import type { Express } from "express";
import Stripe from "stripe";
import { pool } from "../db";
import {
  authenticateToken,
  checkCampusTenant,
  hasPermissionForUser,
} from "./shared";
import { MODULES, ACTIONS } from "../../shared/permissions";

// SDK inicializado una sola vez por módulo.
// apiVersion cast a any porque el tipo literal cambia entre versiones del SDK.
const defaultStripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-05-28.basil" as any,
});

/** Tipo mínimo del cliente Stripe que este módulo necesita (facilita mocking en tests). */
export type StripeClient = {
  accounts: {
    create: (params: Stripe.AccountCreateParams) => Promise<{ id: string }>;
  };
  accountLinks: {
    create: (params: Stripe.AccountLinkCreateParams) => Promise<{ url: string }>;
  };
};

/** Construye la URL base de la misma forma que auth.ts:312-316. */
function buildHost(req: any): string {
  return process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : `${req.protocol}://${req.get("host")}`;
}

/**
 * Registra las rutas de pagos de campus en la aplicación Express.
 *
 * @param app            La instancia de Express donde montar las rutas.
 * @param stripeOverride Cliente Stripe alternativo (útil para tests de integración).
 *                       Si se omite, se usa el cliente por defecto con STRIPE_SECRET_KEY.
 */
export function registerCampusPaymentRoutes(
  app: Express,
  stripeOverride?: StripeClient
): void {
  const s = stripeOverride ?? defaultStripe;

  // ── A. POST /api/admin/campus-payment/conectar-stripe ─────────────────────
  /**
   * Tres sub-casos:
   *   1. Sin fila en campus_payment_config          → crear cuenta Express + INSERT
   *   2. Fila existe, stripe_account_id, !charges_enabled → reutilizar cuenta
   *   3. Fila existe, charges_enabled=true          → 409
   * Devuelve { onboarding_url, stripe_account_id, expires_in }
   */
  app.post(
    "/api/admin/campus-payment/conectar-stripe",
    authenticateToken,
    async (req: any, res) => {
      try {
        const campusId: number = req.user?.campus_id;
        const tenantId: number = req.user?.tenant_id;

        if (!hasPermissionForUser(req.user, MODULES.SETTINGS, ACTIONS.CONFIGURE)) {
          return res.status(403).json({ message: "Sin permisos para configurar pagos" });
        }
        if (!(await checkCampusTenant(campusId, tenantId, res))) return;

        // Estado actual de campus_payment_config
        const { rows: existing } = await pool.query(
          `SELECT id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted
           FROM campus_payment_config WHERE campus_id = $1`,
          [campusId]
        );
        const cfg = existing[0] as any | undefined;

        // Sub-caso completo: ya activo → 409
        if (cfg?.charges_enabled) {
          return res.status(409).json({
            message: "Este campus ya tiene Stripe Connect activo. No se requiere re-onboarding.",
            estado: {
              stripe_account_id:  cfg.stripe_account_id,
              charges_enabled:    cfg.charges_enabled,
              payouts_enabled:    cfg.payouts_enabled,
              details_submitted:  cfg.details_submitted,
            },
          });
        }

        let stripeAccountId: string;

        if (cfg?.stripe_account_id) {
          // Sub-caso incompleto: reutilizar cuenta existente sin crear una nueva
          stripeAccountId = cfg.stripe_account_id;
        } else {
          // Sub-caso null: crear cuenta Express nueva
          const { rows: settingsRows } = await pool.query(
            `SELECT is2.nombre_legal,
                    is2.email_institucional,
                    is2.sitio_web,
                    is2.telefono_principal,
                    is2.rfc,
                    c.nombre          AS campus_nombre,
                    t.rfc             AS tenant_rfc
             FROM   campuses c
             JOIN   tenants  t   ON t.id  = c.tenant_id
             LEFT JOIN institutional_settings is2 ON is2.campus_id = c.id
             WHERE  c.id = $1`,
            [campusId]
          );
          const st = settingsRows[0] as any;

          const accountParams: Stripe.AccountCreateParams = {
            type:    "express",
            country: "MX",
            business_profile: {
              name: st?.nombre_legal || st?.campus_nombre || `Campus ${campusId}`,
              ...(st?.sitio_web          ? { url:           st.sitio_web }          : {}),
              ...(st?.telefono_principal ? { support_phone: st.telefono_principal } : {}),
            },
            capabilities: {
              card_payments: { requested: true },
              transfers:     { requested: true },
            },
            metadata: {
              campus_id: campusId.toString(),
              tenant_id: tenantId.toString(),
              rfc:       st?.rfc || st?.tenant_rfc || "",
            },
          };
          if (st?.email_institucional) {
            accountParams.email = st.email_institucional;
          }

          const account = await s.accounts.create(accountParams);
          stripeAccountId = account.id;

          // Persistir — INSERT si no hay fila, UPDATE si ya había fila sin stripe_account_id
          if (cfg) {
            await pool.query(
              `UPDATE campus_payment_config
                  SET stripe_account_id = $1, updated_at = NOW()
                WHERE campus_id = $2`,
              [stripeAccountId, campusId]
            );
          } else {
            await pool.query(
              `INSERT INTO campus_payment_config (campus_id, tenant_id, stripe_account_id)
               VALUES ($1, $2, $3)`,
              [campusId, tenantId, stripeAccountId]
            );
          }
        }

        // Construir Account Link
        const host       = buildHost(req);
        const return_url  = `${host}/configuracion-pagos-completa?stripe=completado`;
        const refresh_url = `${host}/configuracion-pagos-completa?stripe=refresco`;

        const accountLink = await s.accountLinks.create({
          account:     stripeAccountId,
          refresh_url,
          return_url,
          type:        "account_onboarding",
        });

        return res.json({
          onboarding_url:    accountLink.url,
          stripe_account_id: stripeAccountId,
          expires_in:        300,
        });
      } catch (err: any) {
        console.error("[campus-payment] conectar-stripe:", err.message);
        return res.status(500).json({ message: "Error interno al conectar Stripe" });
      }
    }
  );

  // ── B. POST /api/admin/campus-payment/refresh-link ─────────────────────────
  /**
   * Genera un Account Link fresco para una cuenta Express ya existente que aún
   * no completó el onboarding (charges_enabled = false).
   * 400 si no existe stripe_account_id.
   * 409 si la cuenta ya está activa.
   */
  app.post(
    "/api/admin/campus-payment/refresh-link",
    authenticateToken,
    async (req: any, res) => {
      try {
        const campusId: number = req.user?.campus_id;
        const tenantId: number = req.user?.tenant_id;

        if (!hasPermissionForUser(req.user, MODULES.SETTINGS, ACTIONS.CONFIGURE)) {
          return res.status(403).json({ message: "Sin permisos para configurar pagos" });
        }
        if (!(await checkCampusTenant(campusId, tenantId, res))) return;

        const { rows } = await pool.query(
          `SELECT stripe_account_id, charges_enabled
           FROM campus_payment_config WHERE campus_id = $1`,
          [campusId]
        );
        const cfg = rows[0] as any;

        if (!cfg?.stripe_account_id) {
          return res.status(400).json({
            message: "No hay cuenta Stripe configurada para este campus. Use /conectar-stripe primero.",
          });
        }
        if (cfg.charges_enabled) {
          return res.status(409).json({
            message: "La cuenta Stripe ya está activa; no se necesita refresco.",
          });
        }

        const host       = buildHost(req);
        const return_url  = `${host}/configuracion-pagos-completa?stripe=completado`;
        const refresh_url = `${host}/configuracion-pagos-completa?stripe=refresco`;

        const accountLink = await s.accountLinks.create({
          account:     cfg.stripe_account_id,
          refresh_url,
          return_url,
          type:        "account_onboarding",
        });

        return res.json({ onboarding_url: accountLink.url, expires_in: 300 });
      } catch (err: any) {
        console.error("[campus-payment] refresh-link:", err.message);
        return res.status(500).json({ message: "Error interno al refrescar enlace" });
      }
    }
  );

  // ── C. GET /api/admin/campus-payment/estado ─────────────────────────────────
  /**
   * Devuelve el estado actual de campus_payment_config para el campus del JWT.
   * Si no existe fila, todos los booleans son false y stripe_account_id es null.
   */
  app.get(
    "/api/admin/campus-payment/estado",
    authenticateToken,
    async (req: any, res) => {
      try {
        const campusId: number = req.user?.campus_id;
        const tenantId: number = req.user?.tenant_id;

        if (!hasPermissionForUser(req.user, MODULES.SETTINGS, ACTIONS.CONFIGURE)) {
          return res.status(403).json({ message: "Sin permisos para ver configuración de pagos" });
        }
        if (!(await checkCampusTenant(campusId, tenantId, res))) return;

        const { rows } = await pool.query(
          `SELECT stripe_account_id, charges_enabled, payouts_enabled, details_submitted
           FROM campus_payment_config WHERE campus_id = $1`,
          [campusId]
        );
        const cfg = rows[0] as any;

        return res.json({
          conectado:          cfg?.charges_enabled    ?? false,
          stripe_account_id:  cfg?.stripe_account_id  ?? null,
          charges_enabled:    cfg?.charges_enabled    ?? false,
          payouts_enabled:    cfg?.payouts_enabled    ?? false,
          details_submitted:  cfg?.details_submitted  ?? false,
        });
      } catch (err: any) {
        console.error("[campus-payment] estado:", err.message);
        return res.status(500).json({ message: "Error interno al obtener estado" });
      }
    }
  );
}
