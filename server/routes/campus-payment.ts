/**
 * campus-payment.ts — Stripe Connect Express onboarding para campus
 *
 * Endpoints:
 *   POST /api/webhooks/stripe                        — recibe eventos de Stripe (raw body, no auth)
 *   POST /api/admin/campus-payment/conectar-stripe   — crea o reutiliza cuenta Express
 *   POST /api/admin/campus-payment/refresh-link      — genera Account Link nuevo
 *   GET  /api/admin/campus-payment/estado            — estado actual del campus
 *
 * Diseño:
 *   • Guard en escritura: SETTINGS.CONFIGURE + checkCampusTenant (cross-campus)
 *   • Guard en lectura:   SETTINGS.CONFIGURE (mínimo práctico incluye READ)
 *   • Webhook: sin auth, con verificación de firma cuando STRIPE_WEBHOOK_SECRET está presente.
 *   • Idempotencia: Stripe idempotency key `campus-connect-{campusId}` en accounts.create.
 *   • Race condition: INSERT ... ON CONFLICT DO NOTHING + re-SELECT autoritative.
 *   • Sincronización: /estado llama accounts.retrieve si stripe_account_id existe y los
 *     flags están en false (fallback para webhooks perdidos).
 *   • Protocolo §5: sin rutas condicionadas por NODE_ENV.
 *   • Audit: fuera de transacción (ADR-001).
 *
 * API Stripe verificada con stripe@18.2.1 — version: 2025-05-28.basil (agosto 2026).
 *
 * registerCampusPaymentRoutes acepta un stripeOverride opcional para inyectar un
 * cliente de prueba en tests de integración.
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
const defaultStripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-05-28.basil" as any,
});

/** Tipo mínimo del cliente Stripe que este módulo necesita (facilita mocking en tests). */
export type StripeClient = {
  accounts: {
    create:   (params: Stripe.AccountCreateParams, opts?: { idempotencyKey?: string }) => Promise<{ id: string }>;
    retrieve: (id: string) => Promise<{
      id: string;
      charges_enabled:   boolean;
      payouts_enabled:   boolean;
      details_submitted: boolean;
    }>;
  };
  accountLinks: {
    create: (params: Stripe.AccountLinkCreateParams) => Promise<{ url: string }>;
  };
  webhooks: {
    constructEvent: (body: Buffer | string, sig: string, secret: string) => Stripe.Event;
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
  const s: StripeClient = stripeOverride ?? (defaultStripe as unknown as StripeClient);

  // ── WEBHOOK: POST /api/webhooks/stripe ─────────────────────────────────────
  /**
   * Recibe eventos de Stripe. Esta ruta:
   *   • No requiere auth (Stripe llama desde sus servidores).
   *   • Verifica firma con STRIPE_WEBHOOK_SECRET si está configurado.
   *   • Si no hay secret (dev/test), parsea el body directamente.
   *   • El cuerpo raw (Buffer) debe ser proporcionado por express.raw() registrado en
   *     routes.ts antes de los middlewares globales.
   *   • Maneja: account.updated → persiste charges_enabled, payouts_enabled, details_submitted.
   */
  app.post(
    "/api/webhooks/stripe",
    async (req: any, res) => {
      const sig           = req.headers["stripe-signature"] as string | undefined;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      let event: Stripe.Event;
      try {
        if (webhookSecret && sig) {
          // Producción: verificar firma con el secret configurado.
          event = s.webhooks.constructEvent(req.body, sig, webhookSecret);
        } else if (!webhookSecret) {
          // Sin secret configurado (dev/test): parsear directamente sin verificar.
          const rawBody = req.body;
          const parsed  = Buffer.isBuffer(rawBody)
            ? JSON.parse(rawBody.toString())
            : (typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody);
          event = parsed as Stripe.Event;
        } else {
          // Secret configurado pero falta el header stripe-signature: rechazar.
          return res.status(400).json({ message: "Falta el header stripe-signature" });
        }
      } catch (err: any) {
        console.error("[campus-payment] webhook signature:", err.message);
        return res.status(400).json({ message: `Webhook inválido: ${err.message}` });
      }

      // Manejar el evento account.updated
      if (event.type === "account.updated") {
        const account = event.data.object as Stripe.Account;
        try {
          const result = await pool.query(
            `UPDATE campus_payment_config
                SET charges_enabled   = $1,
                    payouts_enabled   = $2,
                    details_submitted = $3,
                    updated_at        = NOW()
              WHERE stripe_account_id = $4`,
            [
              account.charges_enabled,
              account.payouts_enabled,
              account.details_submitted,
              account.id,
            ]
          );
          if (result.rowCount === 0) {
            // Cuenta no registrada en esta plataforma — ignorar silenciosamente.
            console.warn("[campus-payment] webhook: account.id no encontrado:", account.id);
          }
        } catch (err: any) {
          console.error("[campus-payment] webhook DB error:", err.message);
          // Devolver 200 para que Stripe no reintente (el error es nuestro, no de Stripe).
        }
      }

      return res.json({ received: true });
    }
  );

  // ── A. POST /api/admin/campus-payment/conectar-stripe ─────────────────────
  /**
   * Tres sub-casos:
   *   1. Sin fila en campus_payment_config          → crear cuenta Express + UPSERT
   *   2. Fila existe, stripe_account_id, !charges_enabled → reutilizar cuenta
   *   3. Fila existe, charges_enabled=true          → 409
   *
   * Idempotencia:
   *   • Stripe idempotency key = "campus-connect-{campusId}" → misma cuenta aunque
   *     dos requests concurrent llamen a accounts.create simultáneamente.
   *   • INSERT ON CONFLICT (campus_id) DO NOTHING → solo una fila por campus.
   *   • Re-SELECT autoritativo después del upsert → ambos requests ven el mismo acct_.
   *
   * Devuelve: { onboarding_url, stripe_account_id, expires_in }
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

        // Leer estado actual (sin FOR UPDATE — la idempotencia se maneja via Stripe key + ON CONFLICT)
        const { rows: existing } = await pool.query(
          `SELECT id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted
           FROM campus_payment_config WHERE campus_id = $1`,
          [campusId]
        );
        const cfg = existing[0] as any | undefined;

        // Sub-caso completo: ya activo → 409 (cortocircuito; nunca llama Stripe)
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
          // Sub-caso incompleto: reutilizar cuenta existente
          stripeAccountId = cfg.stripe_account_id;
        } else {
          // Sub-caso null: crear cuenta Express nueva
          // Leer datos institucionales del campus para pre-llenar el perfil
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

          // Idempotency key: misma clave → misma cuenta aunque se llame dos veces.
          // Stripe devuelve el mismo objeto Account si la clave ya fue usada.
          const account = await s.accounts.create(accountParams, {
            idempotencyKey: `campus-connect-${campusId}`,
          });
          stripeAccountId = account.id;

          // Upsert seguro contra race conditions:
          // ON CONFLICT DO NOTHING: si dos requests insertan simultáneamente, solo uno gana.
          // El re-SELECT posterior lee la fila autoritativa (sea propia o del otro request).
          await pool.query(
            `INSERT INTO campus_payment_config (campus_id, tenant_id, stripe_account_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (campus_id) DO NOTHING`,
            [campusId, tenantId, stripeAccountId]
          );

          // Re-leer la fila autoritativa (puede diferir si otro request ganó el INSERT)
          const { rows: fresh } = await pool.query(
            `SELECT stripe_account_id FROM campus_payment_config WHERE campus_id = $1`,
            [campusId]
          );
          // Si por alguna razón aún no hay fila (error de inserción), usar el de Stripe
          stripeAccountId = fresh[0]?.stripe_account_id ?? stripeAccountId;
        }

        // Construir Account Link (siempre: tanto sub-caso null como sub-caso incompleto)
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
   *
   * Sincronización activa (fallback para webhooks perdidos):
   *   Si existe stripe_account_id y algún flag sigue en false, se llama
   *   accounts.retrieve para obtener el estado en vivo de Stripe y actualizar la DB.
   *   Si Stripe falla, se devuelve el estado cacheado en DB sin error.
   *
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
        let cfg = rows[0] as any;

        // Sincronización activa: si la cuenta existe pero los flags siguen en false,
        // consultamos Stripe en vivo para capturar onboardings completados sin webhook.
        if (cfg?.stripe_account_id && !cfg.charges_enabled) {
          try {
            const liveAccount = await s.accounts.retrieve(cfg.stripe_account_id);
            if (
              liveAccount.charges_enabled   !== cfg.charges_enabled   ||
              liveAccount.payouts_enabled   !== cfg.payouts_enabled   ||
              liveAccount.details_submitted !== cfg.details_submitted
            ) {
              await pool.query(
                `UPDATE campus_payment_config
                    SET charges_enabled   = $1,
                        payouts_enabled   = $2,
                        details_submitted = $3,
                        updated_at        = NOW()
                  WHERE campus_id = $4`,
                [
                  liveAccount.charges_enabled,
                  liveAccount.payouts_enabled,
                  liveAccount.details_submitted,
                  campusId,
                ]
              );
              cfg = {
                ...cfg,
                charges_enabled:   liveAccount.charges_enabled,
                payouts_enabled:   liveAccount.payouts_enabled,
                details_submitted: liveAccount.details_submitted,
              };
            }
          } catch (syncErr: any) {
            // Stripe no disponible: devolver estado cacheado sin fallar.
            console.warn("[campus-payment] No se pudo sincronizar con Stripe:", syncErr.message);
          }
        }

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
