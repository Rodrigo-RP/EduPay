/**
 * campus-payment.ts — Stripe Connect Express onboarding para campus
 *
 * Exports:
 *   registerStripeWebhookRoute(app, stripe?)  — solo el webhook; sin auth; debe
 *                                               registrarse ANTES de sanitizeInput
 *   registerCampusPaymentRoutes(app, stripe?) — tres endpoints admin (después de middleware)
 *
 * Endpoints:
 *   POST /api/webhooks/stripe                        — recibe eventos de Stripe (raw body)
 *   POST /api/admin/campus-payment/conectar-stripe   — crea o reutiliza cuenta Express
 *   POST /api/admin/campus-payment/refresh-link      — genera Account Link nuevo
 *   GET  /api/admin/campus-payment/estado            — estado actual del campus
 *
 * Diseño:
 *   • Webhook: sin auth; requiere STRIPE_WEBHOOK_SECRET (503 si no configurado);
 *     verifica firma HMAC con stripe.webhooks.constructEvent usando el Buffer crudo.
 *   • Guard admin: SETTINGS.CONFIGURE + checkCampusTenant.
 *   • Idempotencia: Stripe idempotency key "campus-connect-{campusId}".
 *   • Race condition: INSERT ON CONFLICT (campus_id) DO UPDATE SET stripe_account_id = EXCLUDED.stripe_account_id
 *     WHERE campus_payment_config.stripe_account_id IS NULL + re-SELECT autoritativo.
 *     (Si ya existe fila con cuenta activa, el WHERE no aplica y la fila ganadora no se toca.)
 *   • Sync activa: /estado llama accounts.retrieve si stripe_account_id existe y
 *     charges_enabled=false (fallback para webhooks perdidos).
 *   • Protocolo §5: sin rutas condicionadas por NODE_ENV.
 *   • Audit: fuera de transacción (ADR-001).
 *
 * Orden de registro en producción (routes.ts):
 *   1. registerStripeWebhookRoute(app)    ← antes de sanitizeInput
 *   2. app.use(secureCors, sanitizeInput, integrityCheck)
 *   3. registerCampusPaymentRoutes(app)   ← después de sanitizeInput
 *
 * El body crudo (Buffer) llega porque server/index.ts registra express.raw()
 * para /api/webhooks/stripe ANTES de express.json().
 *
 * API Stripe verificada con stripe@18.2.1 — version: 2025-05-28.basil (agosto 2026).
 */

import type { Express } from "express";
import Stripe from "stripe";
import { pool } from "../db";
import { settleStripeSpeiPaymentIntent } from "../lib/stripe-spei-settlement";
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

function resolveStripe(override?: StripeClient): StripeClient {
  return override ?? (defaultStripe as unknown as StripeClient);
}

/** Construye la URL base de la misma forma que auth.ts:312-316. */
function buildHost(req: any): string {
  return process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : `${req.protocol}://${req.get("host")}`;
}

// ── WEBHOOK ───────────────────────────────────────────────────────────────────

/**
 * Registra únicamente la ruta POST /api/webhooks/stripe.
 *
 * Debe llamarse en routes.ts ANTES de app.use(sanitizeInput) para que
 * req.body llegue como Buffer (preservado por express.raw en server/index.ts).
 *
 * Seguridad:
 *   • STRIPE_WEBHOOK_SECRET es OBLIGATORIO. Sin él, la ruta responde 503.
 *   • stripe-signature es OBLIGATORIO. Sin él → 400.
 *   • La firma HMAC se verifica con stripe.webhooks.constructEvent en cada request.
 *   • No hay fallback ni modo "sin firma" en ningún entorno.
 *
 * @param app            Instancia de Express.
 * @param stripeOverride Cliente Stripe alternativo para tests (inyecta mock de constructEvent).
 */
export function registerStripeWebhookRoute(
  app: Express,
  stripeOverride?: StripeClient
): void {
  const s = resolveStripe(stripeOverride);

  /**
   * POST /api/webhooks/stripe
   * Sin autenticación — Stripe llama desde sus servidores.
   * Verifica la firma HMAC con STRIPE_WEBHOOK_SECRET.
   * Maneja:
   *   • account.updated → persiste flags de Stripe Connect.
   *   • payment_intent.succeeded → liquida el ledger de SPEI previamente
   *     registrado como pendiente por el portal de padres.
   */
  app.post(
    "/api/webhooks/stripe",
    async (req: any, res) => {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      // El secret es obligatorio. Sin él, el endpoint no puede operar de forma segura.
      if (!webhookSecret) {
        console.error(
          "[campus-payment] STRIPE_WEBHOOK_SECRET no configurado — " +
          "el webhook está deshabilitado. Configura el secret en variables de entorno."
        );
        return res.status(503).json({
          message: "Webhook no disponible: STRIPE_WEBHOOK_SECRET no configurado",
        });
      }

      const sig = req.headers["stripe-signature"] as string | undefined;
      if (!sig) {
        return res.status(400).json({ message: "Falta el header stripe-signature" });
      }

      // req.body es un Buffer gracias a express.raw() en server/index.ts.
      let event: Stripe.Event;
      try {
        event = s.webhooks.constructEvent(req.body, sig, webhookSecret);
      } catch (err: any) {
        console.error("[campus-payment] webhook firma inválida:", err.message);
        return res.status(400).json({ message: `Firma inválida: ${err.message}` });
      }

      // Manejar account.updated → actualizar flags en campus_payment_config
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
            // Cuenta no registrada en esta plataforma — no es un error.
            console.warn(
              "[campus-payment] webhook account.updated: stripe_account_id no encontrado:",
              account.id
            );
          }
        } catch (dbErr: any) {
          console.error("[campus-payment] webhook DB error:", dbErr.message);
          // Devolver 200 de todas formas: el error es nuestro, no de Stripe.
          // Stripe no debe reintentar por errores de DB internos.
        }
      }

      if (event.type === "payment_intent.succeeded") {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        if (paymentIntent.metadata?.edupay_payment_flow === "spei_bank_transfer") {
          try {
            await settleStripeSpeiPaymentIntent(
              paymentIntent.id,
              event.id,
              JSON.stringify(event),
            );
          } catch (dbErr: any) {
            // 500 hace que Stripe reintente el evento firmado. No devolvemos 200
            // antes de que el ledger haya sido aplicado de manera atómica.
            console.error(
              "[campus-payment] No se pudo liquidar SPEI " +
                `${paymentIntent.id}: ${dbErr.message}`,
            );
            return res.status(500).json({ message: "No se pudo registrar el pago SPEI" });
          }
        }
      }

      return res.json({ received: true });
    }
  );
}

// ── RUTAS ADMIN ───────────────────────────────────────────────────────────────

/**
 * Registra los tres endpoints admin de campus-payment.
 * Debe llamarse DESPUÉS de app.use(sanitizeInput) ya que estos endpoints
 * reciben JSON normal (no raw body).
 *
 * @param app            Instancia de Express.
 * @param stripeOverride Cliente Stripe alternativo para tests.
 */
export function registerCampusPaymentRoutes(
  app: Express,
  stripeOverride?: StripeClient
): void {
  const s = resolveStripe(stripeOverride);

  // ── A. POST /api/admin/campus-payment/conectar-stripe ─────────────────────
  /**
   * Tres sub-casos:
   *   1. Sin fila en campus_payment_config → crear cuenta Express + UPSERT
   *   2. Fila existe, stripe_account_id, !charges_enabled → reutilizar cuenta
   *   3. Fila existe, charges_enabled=true → 409
   *
   * Idempotencia:
   *   • Stripe idempotency key = "campus-connect-{campusId}" → misma cuenta aunque
   *     dos requests concurrent llamen a accounts.create simultáneamente.
   *   • INSERT ON CONFLICT (campus_id) DO UPDATE SET stripe_account_id = EXCLUDED.stripe_account_id
   *     WHERE campus_payment_config.stripe_account_id IS NULL → actualiza fila sin cuenta;
   *     si ya existe cuenta activa, el WHERE no aplica y la fila ganadora no se toca.
   *   • Re-SELECT autoritativo después del upsert → ambos requests ven el mismo acct_.
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

        // Leer estado actual
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
          const account = await s.accounts.create(accountParams, {
            idempotencyKey: `campus-connect-${campusId}`,
          });
          stripeAccountId = account.id;

          // Upsert seguro:
          //   • Si no existe fila → INSERT.
          //   • Si existe fila con stripe_account_id NULL (p.ej. seed anterior sin
          //     cuenta activa) → actualizar con la cuenta recién creada.
          //   • Si existe fila con stripe_account_id ≠ NULL (otro request ganó la carrera)
          //     → DO NOTHING y leer la fila ganadora.
          await pool.query(
            `INSERT INTO campus_payment_config (campus_id, tenant_id, stripe_account_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (campus_id) DO UPDATE
               SET stripe_account_id = EXCLUDED.stripe_account_id,
                   tenant_id         = EXCLUDED.tenant_id
             WHERE campus_payment_config.stripe_account_id IS NULL`,
            [campusId, tenantId, stripeAccountId]
          );

          // Re-leer la fila autoritativa (puede diferir si otro request ganó la carrera)
          const { rows: fresh } = await pool.query(
            `SELECT stripe_account_id FROM campus_payment_config WHERE campus_id = $1`,
            [campusId]
          );
          stripeAccountId = fresh[0]?.stripe_account_id ?? stripeAccountId;
        }

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
   * Sincronización activa (fallback para webhooks perdidos):
   * Si existe stripe_account_id y algún flag sigue en false, llama
   * accounts.retrieve para obtener el estado en vivo de Stripe y actualizar la DB.
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

// ── HELPER EXPORTADO ──────────────────────────────────────────────────────────

/**
 * Devuelve el stripe_account_id del campus si tiene charges_enabled = true,
 * o null si el campus no tiene Stripe Connect activo.
 *
 * Usado por guardian.ts para enrutar PaymentIntents via transfer_data.
 */
export async function getActiveStripeAccountForCampus(
  campusId: number
): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT stripe_account_id
       FROM campus_payment_config
      WHERE campus_id = $1
        AND charges_enabled = true`,
    [campusId]
  );
  return (rows[0]?.stripe_account_id as string) ?? null;
}
