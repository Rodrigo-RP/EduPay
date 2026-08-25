import type { Express } from "express";
import { pool, db } from "../db";
import { enqueueAuditLog } from "../audit-retry";
import { eq, and, gte, lt, count } from "drizzle-orm";
import { storage } from "../storage";
import { authenticateToken, requireAuth, requireSuperAdmin, authenticateGuardian, checkCampusTenant, upload, esmRequire, JWT_SECRET, hasPermissionForUser} from "./shared";
import { MODULES, ACTIONS } from "@shared/permissions";
import { students, guardians, student_guardian, charges, payments, concepts, scholarships, invoices, payment_due_dates, payment_surcharge_rules, families, family_students, payment_applications, payment_events, institutional_credentials, institutional_info } from "@shared/schema";
import { insertPaymentSchema, insertChargeSchema } from "@shared/schema";
import { getAcademicLevel } from "@shared/academic-levels";
import { wsManager } from "../websocket-manager";
import { seedDemoData } from "../seed-demo";
import { seedAdmissionsData } from "../seed-admissions-data";
import * as XLSX from "xlsx";
import { z } from "zod";
import bcrypt from "bcrypt";
import { NotificationSystem as ServerNotificationSystem } from '../notification-system';
import Stripe from "stripe";
import { getActiveStripeAccountForCampus } from "./campus-payment";

/**
 * Subconjunto de la API de Stripe necesario para guardian/pagar.
 * Permite inyectar un mock en tests sin tocar el singleton global.
 */
export type StripeGuardianClient = {
  customers?: {
    create: (params: {
      name?: string;
      email?: string;
      phone?: string;
      metadata?: Record<string, string>;
    }) => Promise<{ id: string }>;
  };
  paymentIntents: {
    create: (params: {
      amount: number;
      currency: string;
      customer?: string;
      payment_method?: string;
      confirm?: boolean;
      payment_method_types?: Array<"customer_balance" | "card">;
      payment_method_options?: {
        customer_balance?: {
          funding_type: "bank_transfer";
          bank_transfer: { type: "mx_bank_transfer" };
        };
      };
      automatic_payment_methods?: { enabled: boolean; allow_redirects?: "always" | "never" };
      transfer_data?: { destination: string };
      application_fee_amount?: number;
      metadata?: Record<string, string>;
    }) => Promise<{ id: string; status: string; client_secret?: string | null }>;
    cancel: (id: string) => Promise<{ id: string }>;
  };
};

// SDK inicializado una sola vez por módulo (misma clave que campus-payment.ts).
const defaultStripeGuardian: StripeGuardianClient = new Stripe(
  process.env.STRIPE_SECRET_KEY!,
  { apiVersion: "2025-05-28.basil" as any }
) as unknown as StripeGuardianClient;

export async function registerGuardianRoutes(
  app: Express,
  stripeOverride?: StripeGuardianClient
): Promise<void> {
  const sg = stripeOverride ?? defaultStripeGuardian;
  // ── DEMO DATA SEED — solo super_admin ───────────────────────────────────────
  app.post("/api/demo/seed", requireSuperAdmin, async (req, res) => {
    try {
      const result = await seedDemoData();
      res.json(result);
    } catch (error: any) {
      console.error("Error seeding demo data:", error);
      res.status(500).json({ success: false, error: "Error ejecutando seed" });
    }
  });

  /**
   * POST /api/guardian/spei-intent
   *
   * Crea un PaymentIntent SPEI pendiente; NO marca cargos como pagados. El
   * webhook firmado payment_intent.succeeded completa después el mismo ledger
   * atómico que los otros pagos (payment_application + charges = pagado).
   *
   * Tarjeta conserva el flujo existente POST /api/guardian/pagar sin cambios.
   */
  app.post("/api/guardian/spei-intent", authenticateGuardian, async (req: any, res: any) => {
    try {
      const guardianId = Number(req.guardian.id);
      const tenantId = Number(req.guardian.tenant_id);
      const campusId = Number(req.guardian.campus_id);
      const { charge_ids } = req.body as { charge_ids?: unknown };

      if (!Array.isArray(charge_ids) || charge_ids.length === 0) {
        return res.status(400).json({ message: "Se requiere al menos un cargo" });
      }

      const uniqueChargeIds = Array.from(new Set(charge_ids.map(Number)));
      if (uniqueChargeIds.some((id) => !Number.isInteger(id) || id <= 0)) {
        return res.status(400).json({ message: "Los cargos seleccionados no son válidos" });
      }

      const stripeConnectAccountId = await getActiveStripeAccountForCampus(campusId);
      if (!stripeConnectAccountId) {
        return res.status(409).json({
          message: "Tu plantel aún no tiene pagos por transferencia habilitados",
        });
      }

      // IDOR: todos los cargos deben corresponder al tutor autenticado. Calculamos
      // el monto de cada uno antes de la llamada remota; lo confirmamos de nuevo
      // con FOR UPDATE antes de persistir los pagos pendientes.
      const requestedCharges: Array<{ id: number; amount: number }> = [];
      for (const chargeId of uniqueChargeIds) {
        const charge = await storage.getChargeByGuardian(chargeId, guardianId);
        if (!charge) {
          return res.status(403).json({
            message: `Acceso denegado: el cargo ${chargeId} no pertenece a tus alumnos`,
          });
        }

        const balance = await pool.query(
          `SELECT c.monto_base_centavos, c.recargo_aplicado_centavos,
                  COALESCE(SUM(pa.amount_centavos), 0)::bigint AS ya_pagado
             FROM charges c
             LEFT JOIN payment_applications pa ON pa.charge_id = c.id
            WHERE c.id = $1 AND c.tenant_id = $2
            GROUP BY c.monto_base_centavos, c.recargo_aplicado_centavos`,
          [chargeId, tenantId],
        );
        if (!balance.rows.length) {
          return res.status(404).json({ message: `Cargo ${chargeId} no encontrado` });
        }
        const row = balance.rows[0] as any;
        const amount =
          Number(row.monto_base_centavos) +
          Number(row.recargo_aplicado_centavos || 0) -
          Number(row.ya_pagado);
        if (amount <= 0) {
          return res.status(409).json({ message: `El cargo ${chargeId} ya no tiene saldo pendiente` });
        }
        requestedCharges.push({ id: chargeId, amount });
      }

      const guardianResult = await pool.query(
        `SELECT id, stripe_customer_id,
                COALESCE(nombre_completo, CONCAT_WS(' ', nombres, apellido_paterno, apellido_materno)) AS nombre,
                COALESCE(email, correo_institucional_familiar) AS email,
                COALESCE(telefono, celular) AS telefono
           FROM guardians
          WHERE id = $1`,
        [guardianId],
      );
      if (!guardianResult.rows.length) {
        return res.status(401).json({ message: "Tutor no encontrado" });
      }

      const guardian = guardianResult.rows[0] as {
        id: number;
        stripe_customer_id: string | null;
        nombre: string | null;
        email: string | null;
        telefono: string | null;
      };
      let customerId = guardian.stripe_customer_id;
      if (!customerId) {
        if (!sg.customers) {
          throw new Error("El cliente Stripe no soporta creación de Customers");
        }
        const customer = await sg.customers.create({
          name: guardian.nombre || undefined,
          email: guardian.email || undefined,
          phone: guardian.telefono || undefined,
          metadata: { guardian_id: String(guardianId) },
        });

        // El WHERE evita reemplazar el Customer persistido por una petición
        // concurrente. Si otra petición ganó, reutilizamos su id canónico.
        const persisted = await pool.query(
          `UPDATE guardians
              SET stripe_customer_id = $1, updated_at = NOW()
            WHERE id = $2 AND stripe_customer_id IS NULL
          RETURNING stripe_customer_id`,
          [customer.id, guardianId],
        );
        customerId =
          (persisted.rows[0] as { stripe_customer_id?: string } | undefined)?.stripe_customer_id ??
          (await pool.query(
            `SELECT stripe_customer_id FROM guardians WHERE id = $1`,
            [guardianId],
          )).rows[0]?.stripe_customer_id;
      }
      if (!customerId) {
        throw new Error("No se pudo asociar el Customer de Stripe al tutor");
      }

      const amount = requestedCharges.reduce((sum, charge) => sum + charge.amount, 0);
      const paymentIntent = await sg.paymentIntents.create({
        amount,
        currency: "mxn",
        customer: customerId,
        payment_method_types: ["customer_balance", "card"],
        payment_method_options: {
          customer_balance: {
            funding_type: "bank_transfer",
            bank_transfer: { type: "mx_bank_transfer" },
          },
        },
        transfer_data: { destination: stripeConnectAccountId },
        // Regla de negocio: EduPay no descuenta comisión transaccional.
        application_fee_amount: 0,
        metadata: {
          edupay_payment_flow: "spei_bank_transfer",
          guardian_id: String(guardianId),
          campus_id: String(campusId),
          tenant_id: String(tenantId),
          charge_ids: requestedCharges.map((charge) => charge.id).join(","),
        },
      });
      if (!paymentIntent.client_secret) {
        throw new Error("Stripe no devolvió el secreto del intento de pago");
      }

      // No sostenemos locks mientras hablamos con Stripe. La segunda lectura,
      // con FOR UPDATE, hace que no guardemos un intento para un saldo cambiado.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const persistedAmounts: Array<{ chargeId: number; amount: number }> = [];
        for (const requested of [...requestedCharges].sort((a, b) => a.id - b.id)) {
          const locked = await client.query(
            `SELECT id, monto_base_centavos, recargo_aplicado_centavos, estado
               FROM charges
              WHERE id = $1 AND tenant_id = $2
              FOR UPDATE`,
            [requested.id, tenantId],
          );
          if (!locked.rows.length) {
            throw new Error(`Cargo ${requested.id} no encontrado al registrar SPEI`);
          }
          const row = locked.rows[0] as any;
          if (["pagado", "cancelado"].includes(row.estado)) {
            throw new Error(`El cargo ${requested.id} ya fue ${row.estado}`);
          }
          const applied = await client.query(
            `SELECT COALESCE(SUM(amount_centavos), 0)::bigint AS ya_pagado
               FROM payment_applications
              WHERE charge_id = $1`,
            [requested.id],
          );
          const actualAmount =
            Number(row.monto_base_centavos) +
            Number(row.recargo_aplicado_centavos || 0) -
            Number((applied.rows[0] as { ya_pagado: string | number }).ya_pagado);
          if (actualAmount !== requested.amount || actualAmount <= 0) {
            throw new Error(`El saldo del cargo ${requested.id} cambió; inicia el pago nuevamente`);
          }
          persistedAmounts.push({ chargeId: requested.id, amount: actualAmount });
        }

        const pending = await client.query(
          `SELECT charge_id
             FROM payments
            WHERE charge_id = ANY($1::int[]) AND estado = 'pendiente'
            FOR UPDATE`,
          [persistedAmounts.map((entry) => entry.chargeId)],
        );
        if (pending.rows.length) {
          throw new Error("Ya hay una transferencia pendiente para uno de los cargos seleccionados");
        }

        for (const entry of persistedAmounts) {
          await client.query(
            `INSERT INTO payments
               (tenant_id, charge_id, guardian_id, metodo, referencia_pasarela,
                monto_centavos, fecha_pago, estado)
             VALUES ($1, $2, $3, 'spei', $4, $5, CURRENT_DATE, 'pendiente')`,
            [tenantId, entry.chargeId, guardianId, paymentIntent.id, entry.amount],
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        sg.paymentIntents.cancel(paymentIntent.id).catch((cancelError: any) =>
          console.error("[guardian/spei-intent] No se pudo cancelar PI:", cancelError.message),
        );
        throw error;
      } finally {
        client.release();
      }

      return res.status(201).json({
        payment_intent_id: paymentIntent.id,
        client_secret: paymentIntent.client_secret,
        status: paymentIntent.status,
        message: "Transferencia lista. Sigue las instrucciones de tu banco para completar el pago.",
      });
    } catch (error: any) {
      console.error("[guardian/spei-intent] No se pudo crear intento:", error.message);
      return res.status(422).json({
        message: error.message || "No se pudo preparar la transferencia",
      });
    }
  });

  // Guardian pagar alias — acepta array de charge_ids y procesa cada uno
  /**
   * POST /api/guardian/pagar
   *
   * Paga uno o varios cargos en un array de charge_ids.
   * Cada cargo se procesa en su propia transacción atómica:
   *   BEGIN → SELECT FOR UPDATE (lock) → saldo real → INSERT payment →
   *   INSERT payment_application → UPDATE charges → COMMIT
   * El lock con FOR UPDATE serializa requests concurrentes: si dos peticiones
   * llegan simultáneamente para el mismo cargo, la segunda leerá estado='pagado'
   * después de que la primera haga commit y recibirá 409.
   * No soporta pagos parciales: paga siempre el saldo pendiente completo.
   */
  app.post("/api/guardian/pagar", authenticateGuardian, async (req: any, res: any) => {
    try {
      const guardianId = req.guardian.id;
      const tenantId   = req.guardian.tenant_id;

      const { charge_ids, metodo_pago = "tarjeta", payment_method_id } = req.body;
      if (!charge_ids || !Array.isArray(charge_ids) || charge_ids.length === 0) {
        return res.status(400).json({ message: "Se requiere al menos un cargo" });
      }

      // ── Check Stripe Connect una vez por request (una query, todos los cargos) ───
      const guardianCampusId: number = req.guardian.campus_id;
      const stripeConnectAccountId = await getActiveStripeAccountForCampus(guardianCampusId);
      // Cobro real via Connect solo si: campus activo + frontend envió payment_method_id.
      const useStripeConnect = !!(stripeConnectAccountId && payment_method_id);

      const results: {
        charge_id: number;
        payment_id: number;
        monto_centavos: number;
        cfdi: string;
        via_stripe_connect: boolean;
        needs_liquidacion_manual: boolean;
      }[] = [];

      for (const chargeId of charge_ids) {
        // ── IDOR: el cargo debe pertenecer a un alumno del guardián (lectura, fuera de txn) ──
        const chargeOwned = await storage.getChargeByGuardian(chargeId, guardianId);
        if (!chargeOwned) {
          return res.status(403).json({
            message: `Acceso denegado: el cargo ${chargeId} no pertenece a los alumnos de este tutor`,
          });
        }
        const tenantIdLote = (chargeOwned as any).tenant_id ?? tenantId;

        // ── Stripe PaymentIntent ANTES de la transacción DB ─────────────────
        // Se crea fuera de la txn para no mantener locks DB durante red externa.
        let piId: string | null = null;
        let referencia: string;
        let saldoPrevio: number | null = null; // usado para detectar race condition

        if (useStripeConnect) {
          // Pre-leer saldo (optimista, sin lock) solo para el monto del PaymentIntent.
          // La txn DB lo reconfirma con FOR UPDATE antes de insertar el pago.
          const preRes = await pool.query(
            `SELECT c.monto_base_centavos, c.recargo_aplicado_centavos,
                    COALESCE(SUM(pa.amount_centavos), 0)::bigint AS ya_pagado
               FROM charges c
               LEFT JOIN payment_applications pa ON pa.charge_id = c.id
              WHERE c.id = $1 AND c.tenant_id = $2
              GROUP BY c.monto_base_centavos, c.recargo_aplicado_centavos`,
            [chargeId, tenantIdLote]
          );
          if (!preRes.rows.length) {
            return res.status(404).json({ message: `Cargo ${chargeId} no encontrado` });
          }
          const pre = preRes.rows[0] as any;
          saldoPrevio =
            Number(pre.monto_base_centavos) +
            Number(pre.recargo_aplicado_centavos || 0) -
            Number(pre.ya_pagado);
          if (saldoPrevio <= 0) {
            return res.status(409).json({ message: `El cargo ${chargeId} ya tiene saldo cero` });
          }

          try {
            const pi = await sg.paymentIntents.create({
              amount:   saldoPrevio,
              currency: "mxn",
              payment_method: payment_method_id as string,
              confirm:  true,
              // Requerido con confirm:true para no necesitar return_url.
              // allow_redirects:"never" garantiza que solo se usen métodos no-redirect
              // (tarjeta), que es el único método que soporta el portal de padres.
              automatic_payment_methods: { enabled: true, allow_redirects: "never" },
              transfer_data: { destination: stripeConnectAccountId! },
              // application_fee_amount = 0: decisión de arquitectura permanente.
              // Refereence monetiza con cuota SaaS por número de alumnos, facturada
              // directamente a la escuela y completamente fuera del flujo de Stripe Connect.
              // Cobrar comisión por transacción encarecería el producto al padre, lo que
              // contradice el modelo de negocio. Este campo NO es un placeholder olvidado.
              application_fee_amount: 0,
              metadata: {
                charge_id:   chargeId.toString(),
                guardian_id: guardianId.toString(),
                campus_id:   guardianCampusId.toString(),
              },
            });
            piId      = pi.id;
            referencia = pi.id;
          } catch (stripeErr: any) {
            // Stripe rechazó: DB intacta, sin locks, sin transacciones abiertas.
            console.error(`[guardian/pagar] Stripe rechazó cargo ${chargeId}:`, stripeErr.message);
            return res.status(402).json({
              message:   "El pago fue rechazado por el procesador de pagos",
              detalle:   stripeErr.message,
              charge_id: chargeId,
            });
          }
        } else {
          // Flujo de simulación: campus sin Connect activo o frontend sin payment_method_id.
          referencia = `sim_${Date.now()}_${chargeId}`;
        }

        // ── Transacción atómica ──────────────────────────────────────────────
        const client = await pool.connect();
        let paymentId!: number;
        let montoAplicadoCentavos = 0;
        try {
          await client.query("BEGIN");

          // 1. Lock del cargo — serializa peticiones concurrentes
          const lockRes = await client.query(
            `SELECT id, monto_base_centavos, recargo_aplicado_centavos, estado
             FROM charges WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
            [chargeId, tenantIdLote]
          );
          if (!(lockRes.rows as any[]).length) {
            await client.query("ROLLBACK");
            return res.status(403).json({ message: `Cargo ${chargeId} no encontrado` });
          }
          const locked = (lockRes.rows as any[])[0];

          // 2. Guard: estado terminal
          if (["pagado", "cancelado"].includes(locked.estado)) {
            await client.query("ROLLBACK");
            return res.status(409).json({
              message: `El cargo ${chargeId} ya fue pagado o está cancelado`,
            });
          }

          // 3. Saldo pendiente real (lectura dentro del mismo client para consistencia)
          const saldoRes = await client.query(
            `SELECT COALESCE(SUM(pa.amount_centavos), 0)::bigint AS ya_pagado
             FROM payment_applications pa WHERE pa.charge_id = $1`,
            [chargeId]
          );
          const yaPagado = Number((saldoRes.rows as any[])[0].ya_pagado);
          const saldo =
            Number(locked.monto_base_centavos) +
            Number(locked.recargo_aplicado_centavos || 0) -
            yaPagado;

          if (saldo <= 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: `El cargo ${chargeId} ya tiene saldo cero` });
          }
          montoAplicadoCentavos = saldo;

          // 4a. Guard race condition: si usamos Stripe Connect, verificar que el saldo
          //     no cambió entre la pre-lectura (para el PI) y el lock FOR UPDATE.
          //     Si cambió, el cargo fue parcialmente pagado por otra petición concurrente:
          //     cancelamos el PI y rechazamos limpiamente.
          if (piId && saldoPrevio !== null && saldo !== saldoPrevio) {
            await client.query("ROLLBACK");
            // Fire-and-forget: finally libera el client
            sg.paymentIntents.cancel(piId).catch((e: any) =>
              console.error("[guardian/pagar] No se pudo cancelar PI tras race condition:", e.message)
            );
            return res.status(409).json({
              message:   `El monto del cargo ${chargeId} cambió mientras se procesaba. Intente de nuevo.`,
              charge_id: chargeId,
            });
          }

          // 4b. Crear pago directamente en 'exitoso' (atomicidad garantizada por la txn)
          const payRow = await client.query(
            `INSERT INTO payments
               (tenant_id, charge_id, guardian_id, metodo, referencia_pasarela,
                monto_centavos, fecha_pago, estado)
             VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE,'exitoso') RETURNING id`,
            [tenantIdLote, chargeId, guardianId, metodo_pago, referencia, saldo]
          );
          paymentId = (payRow.rows as any[])[0].id;

          // 5. Ledger entry (payment_application)
          await client.query(
            `INSERT INTO payment_applications (payment_id, charge_id, amount_centavos, applied_at)
             VALUES ($1,$2,$3,NOW())`,
            [paymentId, chargeId, saldo]
          );

          // 6. Marcar cargo como pagado
          await client.query(
            `UPDATE charges SET estado = 'pagado', updated_at = NOW() WHERE id = $1`,
            [chargeId]
          );

          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          // Si el PI de Stripe ya fue creado y la DB falla, cancelarlo (best-effort).
          if (piId) {
            sg.paymentIntents.cancel(piId).catch((ce: any) =>
              console.error("[guardian/pagar] No se pudo cancelar PI tras error DB:", ce.message)
            );
          }
          throw err;
        } finally {
          client.release();
        }

        // ── Audit fuera de la transacción financiera (ADR-001) ──────────────
        const auditPayloadLote: import("../audit-retry").AuditLogPayload = {
          tenant_id:      tenantIdLote,
          user_id:        null,
          guardian_id:    guardianId,
          action:         "charge.status_changed",
          entity_type:    "charge",
          entity_id:      chargeId,
          previous_value: { estado: "pendiente" },
          new_value:      { estado: "pagado" },
          metadata: {
            flujo:                      "guardian_pagar_lote",
            payment_id:                 paymentId,
            monto_centavos:             montoAplicadoCentavos,
            via_stripe_connect:         useStripeConnect,
            stripe_payment_intent_id:   piId ?? undefined,
            needs_liquidacion_manual:   !useStripeConnect && stripeConnectAccountId === null,
          },
        };
        pool.query(
          `INSERT INTO audit_log
             (tenant_id, guardian_id, action, entity_type, entity_id, previous_value, new_value, metadata)
           VALUES ($1,$2,'charge.status_changed','charge',$3,$4,$5,$6)`,
          [
            tenantIdLote, guardianId, chargeId,
            JSON.stringify(auditPayloadLote.previous_value),
            JSON.stringify(auditPayloadLote.new_value),
            JSON.stringify(auditPayloadLote.metadata),
          ]
        ).catch((err) => enqueueAuditLog(auditPayloadLote, err));

        // ── CFDI simulada (documento, no crítico para la integridad financiera) ──
        const cfdiUUID = `${Date.now()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
        try {
          const [newInvoice] = await db.insert(invoices).values({
            payment_id: paymentId,
            tenant_id:  tenantIdLote,
            uuid_cfdi:  cfdiUUID,
            xml_url:    `/api/demo/cfdi/${cfdiUUID}.xml`,
            pdf_url:    `/api/demo/cfdi/${cfdiUUID}.pdf`,
            estado:     "pendiente",
          }).returning();

          await storage.updateInvoiceStatus(newInvoice.id, "emitido", {
            tenantId:   tenantIdLote,
            guardianId: guardianId,
            ip:         req.ip,
            metadata:   { flujo: "guardian_pagar_lote_cfdi", uuid: cfdiUUID },
          });
        } catch {
          // Si el CFDI falla el pago ya está registrado — no revertir
        }

        results.push({
          charge_id:                chargeId,
          payment_id:               paymentId,
          monto_centavos:           montoAplicadoCentavos,
          cfdi:                     cfdiUUID,
          via_stripe_connect:       useStripeConnect,
          needs_liquidacion_manual: !useStripeConnect && stripeConnectAccountId === null,
        });
      }

      wsManager.notifyPaymentUpdate(results[0], "create", {
        campus_id:  req.guardian.campus_id,
        tenant_id:  req.guardian.tenant_id,
        created_by: guardianId,
      });

      res.json({
        success: true,
        payments: results,
        message: `${results.length} pago(s) procesados correctamente`,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error procesando pago" });
    }
  });

  // ADMISSIONS DATA SEEDING - ENDPOINT ESPECÍFICO
  app.post("/api/seed-admissions-data", authenticateToken, async (req, res) => {
    try {
      await seedAdmissionsData();
      res.json({ message: "Datos de admisiones generados exitosamente" });
    } catch (error: any) {
      res.status(500).json({ error: "Error generando datos de admisiones", details: "Ver logs del servidor" });
    }
  });

  // R5 RETIRADO — GET /api/charges/export eliminado (migrado a RPT-03)
  // Usar POST /api/reportes/cobranza/exportar (formato: 'excel' | 'pdf')
  // Implementación en server/routes/reportes-cobranza.ts

  // GENERATE CHARGES - ENDPOINT PARA GENERAR CARGOS CON CONFIGURACIÓN FLEXIBLE
  app.post("/api/charges/generate", authenticateToken, async (req: any, res: any) => {
    try {
      const {
        concepto,
        tipo_generacion,
        nivel_academico,
        fecha_emision,
        fecha_vencimiento,
        aplicar_becas,
        incluir_recargos,
        dry_run,             // si true: calcula y devuelve preview sin crear nada en BD
        ciclo_escolar,       // ciclo opcional; por defecto el actual
        descripcion,         // para cargos extraordinarios
        monto_manual,        // monto en centavos para cargos extraordinarios manuales
        product_id,          // ID de producto del catálogo → precio derivado por nivel; gana sobre monto_manual
        es_adeudo_migrado,   // bandera de adeudo heredado — exime de recargo sin importar el concepto
      } = req.body;
      const esAdeudoMigrado = !!es_adeudo_migrado;

      const userCampusId  = req.user.campus_id;
      const userTenantId  = req.user.tenant_id;
      const isDryRun      = !!dry_run;

      // Validación básica de montos para cargos extraordinarios
      if (monto_manual !== undefined) {
        const montoNum = Number(monto_manual);
        if (!Number.isFinite(montoNum) || montoNum <= 0) {
          return res.status(400).json({ message: "El monto debe ser un número positivo mayor a cero" });
        }
      }

      // Validar fechas
      if (fecha_emision && fecha_vencimiento && fecha_vencimiento < fecha_emision) {
        return res.status(400).json({ message: "La fecha de vencimiento no puede ser anterior a la fecha de emisión" });
      }

      // ── Validar producto del catálogo (si viene product_id) ─────────────────
      // product_id gana sobre monto_manual: si ambos vienen, el precio del catálogo
      // se usa y monto_manual se ignora silenciosamente para evitar que un operador
      // pueda sobreescribir el precio oficial por error de UI.
      let productForPricing: any = null;
      if (product_id !== undefined && product_id !== null) {
        const productRow = await pool.query(
          `SELECT id, campus_id, nombre,
                  precio_kinder, precio_primaria, precio_secundaria, precio_bachillerato
           FROM products WHERE id = $1`,
          [Number(product_id)],
        );
        if (productRow.rows.length === 0) {
          return res.status(404).json({ message: "Producto no encontrado en el catálogo" });
        }
        const prod = productRow.rows[0] as any;
        if (Number(prod.campus_id) !== Number(userCampusId)) {
          return res.status(403).json({ message: "El producto pertenece a otro campus" });
        }
        productForPricing = prod;
      }

      // Resolver concepto: por nombre para cargos normales, o crear ad-hoc para extraordinarios
      let concept: any = null;
      if (concepto) {
        const allConcepts = await storage.getConceptsByCampus(userCampusId);
        concept = allConcepts.find((c: any) => c.nombre === concepto);
        if (!concept) return res.status(404).json({ message: "Concepto no encontrado" });
      } else if (descripcion && monto_manual && !isDryRun) {
        // Cargo extraordinario: crear un concepto ad-hoc para que los JOINs funcionen
        const montoNum = Math.round(Number(monto_manual));
        const existingConcept = await pool.query(
          `SELECT id FROM concepts WHERE campus_id = $1 AND nombre = $2 AND tipo = 'extra' LIMIT 1`,
          [userCampusId, descripcion]
        ).catch(() => ({ rows: [] }));
        if ((existingConcept.rows as any[]).length > 0) {
          concept = { id: (existingConcept.rows as any[])[0].id, monto_centavos: montoNum };
        } else {
          const newConcept = await pool.query(
            `INSERT INTO concepts (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos, iva)
             VALUES ($1, $2, $3, 'extra', 'eventual', $4, false) RETURNING id`,
            [userCampusId, userTenantId, descripcion, montoNum]
          );
          concept = { id: (newConcept.rows as any[])[0].id, monto_centavos: montoNum };
        }
      }

      // Filtrar alumnos
      const allStudents = await storage.getStudentsByCampus(userCampusId);
      let targetStudents = allStudents.filter((s: any) => s.status === 'activo');
      if (nivel_academico && nivel_academico !== 'todos') {
        targetStudents = targetStudents.filter((student: any) => {
          return getAcademicLevel(student.grado) === nivel_academico;
        });
      }

      // Cargar becas activas del campus — vigencia_inicio <= hoy <= vigencia_fin
      // Columnas reales: porcentaje (numeric, NOT NULL). Sin columna 'estado' en la DB.
      // vigencia_fin es NOT NULL en la DB — no se necesita IS NULL check.
      const becasRows = aplicar_becas
        ? await pool.query(
            `SELECT s.student_id, s.porcentaje
             FROM scholarships s
             JOIN students stu ON stu.id = s.student_id
             WHERE stu.campus_id = $1
               AND s.vigencia_inicio <= CURRENT_DATE
               AND s.vigencia_fin >= CURRENT_DATE`,
            [userCampusId]
          ).catch((err: any) => {
            console.error("[guardian charges/generate] becas DB error:", err.message);
            return { rows: [] };
          })
        : { rows: [] };

      // Índice student_id → beca (la más beneficiosa si hay varias).
      // monto_fijo siempre 0: la columna monto_fijo_aplicado_centavos no existe en la DB actual.
      // La rama `else if (beca.monto_fijo > 0)` queda como placeholder para implementación futura.
      const becaMap: Record<number, { porcentaje_exacto: number; monto_fijo: number }> = {};
      for (const b of (becasRows.rows as any[])) {
        const pct = Number(b.porcentaje || 0);
        if (!becaMap[b.student_id] || pct > becaMap[b.student_id].porcentaje_exacto) {
          becaMap[b.student_id] = { porcentaje_exacto: pct, monto_fijo: 0 };
        }
      }

      const chargesCreated: any[] = [];
      const chargesSummary: any[] = [];

      for (const student of targetStudents) {
        const academicLevel = getAcademicLevel((student as any).grado);

        // Monto base
        // Si hay product_id, el precio del catálogo gana siempre; monto_manual se ignora.
        let baseAmount: number;
        if (productForPricing) {
          const nivelCol = `precio_${academicLevel.toLowerCase()}`;
          const precio = Number(productForPricing[nivelCol] ?? 0);
          if (!precio || precio <= 0) {
            return res.status(422).json({
              message: `El producto "${productForPricing.nombre}" no tiene precio configurado para el nivel ${academicLevel}`,
              nivel:      academicLevel,
              student_id: student.id,
            });
          }
          baseAmount = precio;
        } else {
          baseAmount = monto_manual
            ? Math.round(Number(monto_manual))
            : concept?.monto_centavos ?? 0;
          if (concept && !monto_manual) {
            const levelPrice = (concept as any)[`monto_${academicLevel}`];
            if (levelPrice && levelPrice > 0) baseAmount = levelPrice;
          }
        }

        // Beca real — precisión a 2 decimales para no perder centavos
        let discountPct     = 0;   // porcentaje exacto con 2 decimales
        let discountCentavos = 0;  // fuente de verdad para el monto descontado
        if (aplicar_becas && becaMap[student.id]) {
          const beca = becaMap[student.id];
          if (beca.porcentaje_exacto > 0) {
            discountPct      = beca.porcentaje_exacto;
            discountCentavos = Math.round(baseAmount * beca.porcentaje_exacto / 100);
          } else if (beca.monto_fijo > 0) {
            // Monto fijo: calcular porcentaje exacto con 2 decimales
            discountCentavos = Math.min(beca.monto_fijo, baseAmount);
            // Guardar hasta 2 decimales para poder recuperar el descuento
            discountPct = parseFloat((discountCentavos / baseAmount * 100).toFixed(2));
            // Verificar que el porcentaje reconstruya exactamente el descuento
            // Si hay error de redondeo, ajustar el centavo
            const reconstructed = Math.round(baseAmount * discountPct / 100);
            if (reconstructed !== discountCentavos) {
              // Usar 4 decimales para mayor precisión
              discountPct = parseFloat((discountCentavos / baseAmount * 100).toFixed(4));
            }
          }
        }

        // Exención de recargo para adeudos migrados: un charge importado de sistemas
        // anteriores hereda el importe original sin acumular mora adicional.
        // La bandera esAdeudoMigrado (req.body.es_adeudo_migrado) es ortogonal al
        // concept_id: el concepto puede seguir siendo 'Colegiatura Agosto' para CFDI
        // mientras la exención de recargo actúa independientemente.
        const lateFee = (incluir_recargos && !esAdeudoMigrado)
          ? Math.floor(baseAmount * 0.05)
          : 0;
        const finalAmount = baseAmount - discountCentavos + lateFee;

        chargesSummary.push({
          student_id:         student.id,
          student_name:       (student as any).nombre_completo,
          grade:              (student as any).grado,
          academic_level:     academicLevel,
          base_amount:        baseAmount,
          beca_porcentaje:    discountPct,
          descuento_centavos: discountCentavos,
          recargo_centavos:   lateFee,
          total_centavos:     finalAmount,
          tiene_beca:         discountCentavos > 0,
        });

        if (!isDryRun) {
          const charge = await storage.createCharge({
            student_id:                student.id,
            concept_id:                concept?.id ?? null,
            tenant_id:                 userTenantId ?? (student as any).tenant_id,
            ciclo_escolar:             ciclo_escolar || (() => { const y = new Date().getFullYear(); const m = new Date().getMonth() + 1; return m >= 8 ? `${y}-${y+1}` : `${y-1}-${y}`; })(),
            fecha_emision:             fecha_emision,
            fecha_vencimiento:         fecha_vencimiento,
            monto_base_centavos:       baseAmount,
            beca_aplicada:             discountPct.toFixed(2),
            recargo_aplicado_centavos: lateFee,
            estado:                    "pendiente",
            es_adeudo_migrado:         esAdeudoMigrado,
          });
          chargesCreated.push(charge);
        }
      }

      if (!isDryRun && chargesCreated.length > 0) {
        wsManager.notifyPaymentUpdate({
          charge_generation: true,
          charges_created: chargesCreated.length,
          concepto: concepto || descripcion,
          nivel_academico,
        }, 'create', {
          campus_id: userCampusId,
          tenant_id: userTenantId,
          created_by: req.user.id,
        });
      }

      const totalCentavos = chargesSummary.reduce((s, c) => s + c.total_centavos, 0);
      const conBeca       = chargesSummary.filter(c => c.tiene_beca).length;

      const response: any = {
        dry_run: isDryRun,
        total_alumnos:  chargesSummary.length,
        total_centavos: totalCentavos,
        alumnos_con_beca: conBeca,
        concepto:       concepto || descripcion || "Cargo manual",
        tipo_generacion,
        nivel_academico,
        summary: chargesSummary,
      };
      if (!isDryRun) {
        response.charges_created = chargesCreated.length;
        response.message = `Se generaron ${chargesCreated.length} cargos exitosamente`;
      }

      res.status(isDryRun ? 200 : 201).json(response);

    } catch (error: any) {
      console.error("Error generating charges:", error);
      res.status(500).json({ message: "Error al generar cargos" });
    }
  });

  // INSTITUTIONAL CREDENTIALS ROUTES
  // Get institutional credentials for current user
  app.get("/api/profile/institutional-credentials", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const campusId = (req as any).user.campus_id;
      
      const credentials = await db.select()
        .from(institutional_credentials)
        .where(and(
          eq(institutional_credentials.user_id, userId),
          eq(institutional_credentials.campus_id, campusId),
          eq(institutional_credentials.is_active, true)
        ));
      
      // Don't return encrypted passwords
      const safeCredentials = credentials.map(cred => ({
        ...cred,
        password_encrypted: undefined
      }));
      
      res.json(safeCredentials);
    } catch (error: any) {
      console.error("Error fetching institutional credentials:", error);
      res.status(500).json({ message: "Error fetching credentials" });
    }
  });

  // Create new institutional credential
  app.post("/api/profile/institutional-credentials", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const campusId = (req as any).user.campus_id;
      const { credential_type, credential_name, username, password, expiration_date } = req.body;
      
      // Encrypt password if provided
      let password_encrypted = null;
      if (password) {
        password_encrypted = await bcrypt.hash(password, 12);
      }
      
      const credential = await db.insert(institutional_credentials).values({
        user_id: userId,
        campus_id: campusId,
        credential_type,
        credential_name,
        username,
        password_encrypted,
        expiration_date: expiration_date || null,
      }).returning();
      
      // Don't return encrypted password
      const safeCredential = {
        ...credential[0],
        password_encrypted: undefined
      };
      
      res.status(201).json(safeCredential);
    } catch (error: any) {
      console.error("Error creating institutional credential:", error);
      res.status(500).json({ message: "Error creating credential" });
    }
  });

  // Update institutional credential
  app.put("/api/profile/institutional-credentials/:id", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const credentialId = parseInt(req.params.id);
      const { credential_type, credential_name, username, password, expiration_date } = req.body;
      
      // Check if credential belongs to user
      const existing = await db.select()
        .from(institutional_credentials)
        .where(and(
          eq(institutional_credentials.id, credentialId),
          eq(institutional_credentials.user_id, userId)
        ));
      
      if (existing.length === 0) {
        return res.status(404).json({ message: "Credential not found" });
      }
      
      // Prepare update data
      const updateData: any = {
        credential_type,
        credential_name,
        username,
        expiration_date: expiration_date || null,
        updated_at: new Date(),
      };
      
      // Only update password if provided
      if (password) {
        updateData.password_encrypted = await bcrypt.hash(password, 12);
      }
      
      const updated = await db.update(institutional_credentials)
        .set(updateData)
        .where(eq(institutional_credentials.id, credentialId))
        .returning();
      
      // Don't return encrypted password
      const safeCredential = {
        ...updated[0],
        password_encrypted: undefined
      };
      
      res.json(safeCredential);
    } catch (error: any) {
      console.error("Error updating institutional credential:", error);
      res.status(500).json({ message: "Error updating credential" });
    }
  });

  // Delete institutional credential
  app.delete("/api/profile/institutional-credentials/:id", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const credentialId = parseInt(req.params.id);
      
      // Check if credential belongs to user
      const existing = await db.select()
        .from(institutional_credentials)
        .where(and(
          eq(institutional_credentials.id, credentialId),
          eq(institutional_credentials.user_id, userId)
        ));
      
      if (existing.length === 0) {
        return res.status(404).json({ message: "Credential not found" });
      }
      
      await db.delete(institutional_credentials)
        .where(eq(institutional_credentials.id, credentialId));
      
      res.json({ message: "Credential deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting institutional credential:", error);
      res.status(500).json({ message: "Error deleting credential" });
    }
  });

  // INSTITUTIONAL INFO ROUTES
  
  // Get institutional info by campus
  app.get("/api/profile/institutional-info", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user.campus_id;
      
      const institutionalInfoData = await db.select()
        .from(institutional_info)
        .where(eq(institutional_info.campus_id, campusId));
      
      res.json(institutionalInfoData);
    } catch (error: any) {
      console.error("Error fetching institutional info:", error);
      res.status(500).json({ message: "Error fetching institutional info" });
    }
  });

  // Create or update institutional info for a section
  app.post("/api/profile/institutional-info", authenticateToken, async (req, res) => {
    try {
      // ── Guard de rol ──────────────────────────────────────────────────────
      if (!hasPermissionForUser((req as any).user, MODULES.SETTINGS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para modificar la información institucional" });
      }

      const campusId = (req as any).user.campus_id;
      const { seccion_educativa, rfc, cct } = req.body;
      
      // Check if record exists for this campus and section
      const existing = await db.select()
        .from(institutional_info)
        .where(and(
          eq(institutional_info.campus_id, campusId),
          eq(institutional_info.seccion_educativa, seccion_educativa)
        ));
      
      if (existing.length > 0) {
        // Update existing record
        const updated = await db.update(institutional_info)
          .set({ rfc, cct, updated_at: new Date() })
          .where(and(
            eq(institutional_info.campus_id, campusId),
            eq(institutional_info.seccion_educativa, seccion_educativa)
          ))
          .returning();
        
        res.json(updated[0]);
      } else {
        // Create new record
        const created = await db.insert(institutional_info)
          .values({
            campus_id: campusId,
            seccion_educativa,
            rfc,
            cct,
          })
          .returning();
        
        res.status(201).json(created[0]);
      }
    } catch (error: any) {
      console.error("Error saving institutional info:", error);
      res.status(500).json({ message: "Error saving institutional info" });
    }
  });

  // Update institutional info for a section
  app.put("/api/profile/institutional-info/:id", authenticateToken, async (req, res) => {
    try {
      // ── Guard de rol ──────────────────────────────────────────────────────
      if (!hasPermissionForUser((req as any).user, MODULES.SETTINGS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para modificar la información institucional" });
      }

      const campusId = (req as any).user.campus_id;
      const infoId = parseInt(req.params.id);
      const { seccion_educativa, rfc, cct } = req.body;
      
      // Check if record belongs to user's campus
      const existing = await db.select()
        .from(institutional_info)
        .where(and(
          eq(institutional_info.id, infoId),
          eq(institutional_info.campus_id, campusId)
        ));
      
      if (existing.length === 0) {
        return res.status(404).json({ message: "Información institucional no encontrada" });
      }
      
      // campus_id incluido en WHERE para defensa en profundidad (pre-check + WHERE)
      const updated = await db.update(institutional_info)
        .set({ seccion_educativa, rfc, cct, updated_at: new Date() })
        .where(and(
          eq(institutional_info.id, infoId),
          eq(institutional_info.campus_id, campusId)
        ))
        .returning();
      
      res.json(updated[0]);
    } catch (error: any) {
      console.error("Error updating institutional info:", error);
      res.status(500).json({ message: "Error updating institutional info" });
    }
  });

  // Delete institutional info
  app.delete("/api/profile/institutional-info/:id", authenticateToken, async (req, res) => {
    try {
      // ── Guard de rol ──────────────────────────────────────────────────────
      if (!hasPermissionForUser((req as any).user, MODULES.SETTINGS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para modificar la información institucional" });
      }

      const campusId = (req as any).user.campus_id;
      const infoId = parseInt(req.params.id);
      
      // Check if record belongs to user's campus
      const existing = await db.select()
        .from(institutional_info)
        .where(and(
          eq(institutional_info.id, infoId),
          eq(institutional_info.campus_id, campusId)
        ));
      
      if (existing.length === 0) {
        return res.status(404).json({ message: "Información institucional no encontrada" });
      }
      
      // campus_id incluido en WHERE para defensa en profundidad
      await db.delete(institutional_info)
        .where(and(
          eq(institutional_info.id, infoId),
          eq(institutional_info.campus_id, campusId)
        ));
      
      res.json({ message: "Información institucional eliminada correctamente" });
    } catch (error: any) {
      console.error("Error deleting institutional info:", error);
      res.status(500).json({ message: "Error deleting institutional info" });
    }
  });

  // Get credential expiration notifications
  app.get("/api/profile/credential-notifications", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const campusId = (req as any).user.campus_id;
      
      const notifications = await ServerNotificationSystem.checkExpiringCredentials(userId, campusId);
      res.json(notifications);
    } catch (error: any) {
      console.error("Error fetching credential notifications:", error);
      res.status(500).json({ message: "Error fetching notifications" });
    }
  });

  // Get notification statistics
  app.get("/api/profile/notification-stats", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const campusId = (req as any).user.campus_id;
      
      const stats = await ServerNotificationSystem.getNotificationStats(userId, campusId);
      res.json(stats);
    } catch (error: any) {
      console.error("Error fetching notification stats:", error);
      res.status(500).json({ message: "Error fetching stats" });
    }
  });

  // Mark notification as seen
  app.post("/api/profile/credential-notifications/:id/seen", authenticateToken, async (req, res) => {
    try {
      const credentialId = parseInt(req.params.id);
      await ServerNotificationSystem.markNotificationSeen(credentialId);
      res.json({ message: "Notification marked as seen" });
    } catch (error: any) {
      console.error("Error marking notification as seen:", error);
      res.status(500).json({ message: "Error marking notification" });
    }
  });

  // ========================================
  // PAYMENT CONFIGURATION ROUTES
  // ========================================

  // Get payment due dates configuration - ALWAYS FRESH DATA  
  app.get("/api/payment-config/due-dates", (req, res, next) => {
    // Force no caching for this route
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('ETag', '');
    next();
  }, authenticateToken, async (req, res) => {
    const campusId = (req as any).user.campus_id;
    const timestamp = Date.now();
    console.log(`🔍 [${timestamp}] FRESH GET due-dates for campus:`, campusId);
    
    // Get fresh data directly from database
    const dueDates = await db
      .select()
      .from(payment_due_dates)
      .where(eq(payment_due_dates.campus_id, campusId));
    
    // Fix HTML encoding and force fresh response
    const cleanedDueDates = dueDates.map(dueDate => ({
      ...dueDate,
      mes_aplicacion: typeof dueDate.mes_aplicacion === 'string' 
        ? dueDate.mes_aplicacion.replace(/&quot;/g, '"') 
        : dueDate.mes_aplicacion
    }));
    
    console.log(`🔍 [${timestamp}] FRESH data from DB: ${cleanedDueDates.length} records`);
    res.json(cleanedDueDates);
  });

  // Payment Configuration - Complete System Endpoints
  
  // Get all concepts
  app.get("/api/concepts", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user.campus_id;
      const conceptsList = await db
        .select()
        .from(concepts)
        .where(eq(concepts.campus_id, campusId));
      
      res.json(conceptsList);
    } catch (error: any) {
      console.error("Error fetching concepts:", error);
      res.status(500).json({ message: "Error fetching concepts" });
    }
  });

  // Create new concept
  app.post("/api/concepts", authenticateToken, async (req: any, res) => {
    try {
      const role = req.user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.CONCEPTS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para gestionar conceptos" });
      }
      // campus_id y tenant_id SIEMPRE del JWT — nunca del body
      const campusId = req.user.campus_id;
      const tenantId = req.user.tenant_id;
      const { nombre, tipo, periodicidad, monto_centavos, iva } = req.body;
      
      const [newConcept] = await db
        .insert(concepts)
        .values({
          campus_id: campusId,
          tenant_id: tenantId,
          nombre,
          tipo,
          periodicidad,
          monto_centavos,
          iva: iva !== undefined ? iva : false
        })
        .returning();
      
      res.status(201).json(newConcept);
    } catch (error: any) {
      console.error("Error creating concept:", error);
      res.status(500).json({ message: "Error creating concept" });
    }
  });

  // Update concept by id
  app.put("/api/concepts/:id", authenticateToken, async (req, res) => {
    try {
      const role = (req as any).user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.CONCEPTS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para gestionar conceptos" });
      }
      const campusId = (req as any).user.campus_id;
      const id = parseInt(req.params.id);
      const { nombre, tipo, periodicidad, monto_centavos, iva } = req.body;
      const [updated] = await db
        .update(concepts)
        .set({ nombre, tipo, periodicidad, monto_centavos, iva: iva !== undefined ? iva : false })
        .where(and(eq(concepts.id, id), eq(concepts.campus_id, campusId)))
        .returning();
      if (!updated) return res.status(404).json({ message: "Concepto no encontrado" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: "Error updating concept" });
    }
  });

  // Delete concept by id
  app.delete("/api/concepts/:id", authenticateToken, async (req, res) => {
    try {
      const role = (req as any).user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.CONCEPTS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para gestionar conceptos" });
      }
      const campusId = (req as any).user.campus_id;
      const id = parseInt(req.params.id);

      // Verificar que el concepto existe y pertenece al campus
      const [concepto] = await db
        .select({ id: concepts.id, nombre: concepts.nombre })
        .from(concepts)
        .where(and(eq(concepts.id, id), eq(concepts.campus_id, campusId)));

      if (!concepto) {
        return res.status(404).json({ message: "Concepto no encontrado" });
      }

      // --- Verificación de integridad referencial previa al DELETE ---
      // charges: FK real (concept_id). Sin pre-check, la DB rechaza con FK
      //   violation que el catch convertía en 500 opaco.
      // payment_due_dates / payment_surcharge_rules: referencia por nombre
      //   (texto libre, sin FK). Sin pre-check, el DELETE procede dejando
      //   registros huérfanos apuntando a un concepto inexistente.
      const [[{ n: nCargos }], [{ n: nFechas }], [{ n: nRecargos }]] =
        await Promise.all([
          db.select({ n: count() }).from(charges)
            .where(eq(charges.concept_id, id)),
          db.select({ n: count() }).from(payment_due_dates)
            .where(and(
              eq(payment_due_dates.concepto, concepto.nombre),
              eq(payment_due_dates.campus_id, campusId),
            )),
          db.select({ n: count() }).from(payment_surcharge_rules)
            .where(and(
              eq(payment_surcharge_rules.concepto, concepto.nombre),
              eq(payment_surcharge_rules.campus_id, campusId),
            )),
        ]);

      const totalDependientes = Number(nCargos) + Number(nFechas) + Number(nRecargos);

      if (totalDependientes > 0) {
        return res.status(409).json({
          message: `No se puede eliminar: ${totalDependientes} registro(s) dependen de este concepto`,
          dependientes: {
            cargos: Number(nCargos),
            fechas_vencimiento: Number(nFechas),
            reglas_recargo: Number(nRecargos),
            total: totalDependientes,
          },
        });
      }

      await db
        .delete(concepts)
        .where(and(eq(concepts.id, id), eq(concepts.campus_id, campusId)));
      res.json({ message: "Concepto eliminado" });
    } catch (error: any) {
      res.status(500).json({ message: "Error deleting concept" });
    }
  });

  // Get complete due dates configuration
  app.get("/api/payment-config/due-dates-complete", authenticateToken, async (req, res) => {
    try {
      const role = (req as any).user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.SETTINGS, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver configuración de fechas de vencimiento" });
      }
      const campusId = (req as any).user.campus_id;
      
      // Using left join to get concept names
      const dueDatesComplete = await db
        .select({
          id: payment_due_dates.id,
          concepto_id: payment_due_dates.concepto,
          concepto_nombre: concepts.nombre,
          dia_vencimiento: payment_due_dates.dia_vencimiento,
          meses_aplicacion: payment_due_dates.mes_aplicacion,
          activo: payment_due_dates.activo
        })
        .from(payment_due_dates)
        .leftJoin(concepts, eq(payment_due_dates.concepto, concepts.nombre))
        .where(eq(payment_due_dates.campus_id, campusId));
      
      // Parse meses_aplicacion from JSON string to array
      const processedData = dueDatesComplete.map(item => ({
        ...item,
        meses_aplicacion: typeof item.meses_aplicacion === 'string' 
          ? (item.meses_aplicacion === 'todos' ? ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] : JSON.parse(item.meses_aplicacion))
          : item.meses_aplicacion || []
      }));
      
      res.json(processedData);
    } catch (error: any) {
      console.error("Error fetching complete due dates:", error);
      res.status(500).json({ message: "Error fetching due dates" });
    }
  });

  // Create complete due date
  app.post("/api/payment-config/due-dates-complete", authenticateToken, async (req, res) => {
    try {
      const role = (req as any).user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.SETTINGS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para gestionar fechas de vencimiento" });
      }
      const campusId = (req as any).user.campus_id;
      const { concepto_id, dia_vencimiento, meses_aplicacion, activo } = req.body;
      
      // Find the concept name by ID
      const [conceptData] = await db
        .select({ nombre: concepts.nombre })
        .from(concepts)
        .where(eq(concepts.id, concepto_id))
        .limit(1);

      if (!conceptData) {
        return res.status(400).json({ message: "Concepto no encontrado" });
      }
      
      const [newDueDate] = await db
        .insert(payment_due_dates)
        .values({
          campus_id: campusId,
          concepto: conceptData.nombre,
          dia_vencimiento,
          mes_aplicacion: meses_aplicacion.length === 12 ? 'todos' : JSON.stringify(meses_aplicacion),
          activo: activo !== undefined ? activo : true
        })
        .returning();
      
      res.status(201).json(newDueDate);
    } catch (error: any) {
      console.error("Error creating due date:", error);
      res.status(500).json({ message: "Error creating due date" });
    }
  });

  // Update complete due date
  app.put("/api/payment-config/due-dates-complete/:id", authenticateToken, async (req: any, res) => {
    try {
      const role = req.user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.SETTINGS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para gestionar fechas de vencimiento" });
      }
      const dueDateId = parseInt(req.params.id);
      if (!dueDateId || isNaN(dueDateId)) return res.status(400).json({ message: "ID inválido" });
      const campusId = req.user?.campus_id;
      const tenantId = req.user?.tenant_id;
      if (!campusId) return res.status(400).json({ message: "Campus requerido" });

      // Ownership check: el registro debe pertenecer al campus del usuario
      const [existing] = await db.select({ id: payment_due_dates.id })
        .from(payment_due_dates)
        .where(and(eq(payment_due_dates.id, dueDateId), eq(payment_due_dates.campus_id, campusId)))
        .limit(1);
      if (!existing) return res.status(404).json({ message: "Fecha de vencimiento no encontrada" });

      const { concepto_id, dia_vencimiento, meses_aplicacion, activo } = req.body;
      
      let conceptName = null;
      if (concepto_id) {
        const [conceptData] = await db
          .select({ nombre: concepts.nombre })
          .from(concepts)
          .where(and(eq(concepts.id, concepto_id), eq(concepts.campus_id, campusId)))
          .limit(1);
        if (conceptData) conceptName = conceptData.nombre;
      }
      
      const updateData: any = { updated_at: new Date() };
      if (conceptName) updateData.concepto = conceptName;
      if (dia_vencimiento) updateData.dia_vencimiento = dia_vencimiento;
      if (meses_aplicacion) updateData.mes_aplicacion = meses_aplicacion.length === 12 ? 'todos' : JSON.stringify(meses_aplicacion);
      if (activo !== undefined) updateData.activo = activo;
      
      const [updated] = await db
        .update(payment_due_dates)
        .set(updateData)
        .where(and(eq(payment_due_dates.id, dueDateId), eq(payment_due_dates.campus_id, campusId)))
        .returning();
      
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating due date:", error);
      res.status(500).json({ message: "Error actualizando fecha de vencimiento" });
    }
  });

  // Delete complete due date
  app.delete("/api/payment-config/due-dates-complete/:id", authenticateToken, async (req: any, res) => {
    try {
      const role = req.user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.SETTINGS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para gestionar fechas de vencimiento" });
      }
      const dueDateId = parseInt(req.params.id);
      if (!dueDateId || isNaN(dueDateId)) return res.status(400).json({ message: "ID inválido" });
      const campusId = req.user?.campus_id;
      if (!campusId) return res.status(400).json({ message: "Campus requerido" });

      const [deleted] = await db
        .delete(payment_due_dates)
        .where(and(eq(payment_due_dates.id, dueDateId), eq(payment_due_dates.campus_id, campusId)))
        .returning({ id: payment_due_dates.id });
      
      if (!deleted) return res.status(404).json({ message: "Fecha de vencimiento no encontrada" });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting due date:", error);
      res.status(500).json({ message: "Error eliminando fecha de vencimiento" });
    }
  });

  // Get complete surcharge rules
  app.get("/api/payment-config/surcharge-rules-complete", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user.campus_id;
      
      const surchargeRulesComplete = await db
        .select({
          id: payment_surcharge_rules.id,
          concepto_id: concepts.id,
          concepto_nombre: payment_surcharge_rules.concepto,
          dias_gracia: payment_surcharge_rules.dias_gracia,
          porcentaje_recargo: payment_surcharge_rules.porcentaje,
          monto_fijo: payment_surcharge_rules.monto_fijo_centavos,
          tipo_calculo: payment_surcharge_rules.tipo,
          activo: payment_surcharge_rules.activo
        })
        .from(payment_surcharge_rules)
        .leftJoin(concepts, eq(payment_surcharge_rules.concepto, concepts.nombre))
        .where(eq(payment_surcharge_rules.campus_id, campusId));
      
      // Convert data and map types
      const processedData = surchargeRulesComplete.map(rule => {
        // Map database types to frontend types
        let frontendType = 'porcentaje_fijo';
        if (rule.tipo_calculo === 'porcentaje') frontendType = 'porcentaje_fijo';
        if (rule.tipo_calculo === 'fijo') frontendType = 'monto_fijo';
        if (rule.tipo_calculo === 'progresivo') frontendType = 'porcentaje_diario';

        return {
          ...rule,
          monto_fijo: rule.monto_fijo ? rule.monto_fijo / 100 : 0,
          porcentaje_recargo: parseFloat(rule.porcentaje_recargo?.toString() || '0'),
          tipo_calculo: frontendType
        };
      });
      
      res.json(processedData);
    } catch (error: any) {
      console.error("Error fetching complete surcharge rules:", error);
      res.status(500).json({ message: "Error fetching surcharge rules" });
    }
  });

  // Create complete surcharge rule
  app.post("/api/payment-config/surcharge-rules-complete", authenticateToken, async (req, res) => {
    try {
      const role = (req as any).user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.SETTINGS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para gestionar reglas de recargo" });
      }
      const campusId = (req as any).user.campus_id;
      const { concepto_id, dias_gracia, porcentaje_recargo, monto_fijo, tipo_calculo, activo } = req.body;
      
      // Get concept name
      const [conceptData] = await db
        .select({ nombre: concepts.nombre })
        .from(concepts)
        .where(eq(concepts.id, concepto_id))
        .limit(1);

      if (!conceptData) {
        return res.status(400).json({ message: "Concepto no encontrado" });
      }

      // Map frontend types to database types
      let dbType = 'porcentaje';
      if (tipo_calculo === 'porcentaje_fijo') dbType = 'porcentaje';
      if (tipo_calculo === 'monto_fijo') dbType = 'fijo';
      if (tipo_calculo === 'porcentaje_diario') dbType = 'progresivo';

      const montoFijoCentavos = tipo_calculo === 'monto_fijo' ? Math.round((parseFloat(monto_fijo) || 0) * 100) : null;
      const porcentajeDecimal = tipo_calculo !== 'monto_fijo' ? (porcentaje_recargo || 0) : null;
      
      const [newRule] = await db
        .insert(payment_surcharge_rules)
        .values({
          campus_id: campusId,
          concepto: conceptData.nombre,
          nombre: `Regla de recargo para ${conceptData.nombre}`,
          tipo: dbType,
          dias_gracia: dias_gracia || 0,
          porcentaje: porcentajeDecimal,
          monto_fijo_centavos: montoFijoCentavos,
          activo: activo !== undefined ? activo : true
        })
        .returning();
      
      // Map database type back to frontend type
      let frontendType = 'porcentaje_fijo';
      if (newRule.tipo === 'porcentaje') frontendType = 'porcentaje_fijo';
      if (newRule.tipo === 'fijo') frontendType = 'monto_fijo';
      if (newRule.tipo === 'progresivo') frontendType = 'porcentaje_diario';

      res.status(201).json({
        id: newRule.id,
        concepto_id,
        concepto_nombre: conceptData.nombre,
        dias_gracia: newRule.dias_gracia,
        porcentaje_recargo: parseFloat(newRule.porcentaje?.toString() || '0'),
        monto_fijo: newRule.monto_fijo_centavos ? newRule.monto_fijo_centavos / 100 : 0,
        tipo_calculo: frontendType,
        activo: newRule.activo
      });
    } catch (error: any) {
      console.error("Error creating surcharge rule:", error);
      res.status(500).json({ message: "Error creating surcharge rule" });
    }
  });

  // Update complete surcharge rule
  app.put("/api/payment-config/surcharge-rules-complete/:id", authenticateToken, async (req, res) => {
    try {
      const ruleId = parseInt(req.params.id);
      if (!ruleId || isNaN(ruleId)) return res.status(400).json({ message: "ID inválido" });

      // ── Guard de rol ──────────────────────────────────────────────────────
      if (!hasPermissionForUser((req as any).user, MODULES.SETTINGS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para configurar reglas de recargo" });
      }

      const campusId = (req as any).user?.campus_id;
      if (!campusId) return res.status(400).json({ message: "Campus requerido" });

      // ── Ownership check: la regla debe pertenecer al campus del solicitante ─
      // Sin esta verificación el UPDATE filtraría solo por id, permitiendo que
      // un admin de cualquier campus sobreescriba reglas de otro campus (IDOR).
      const [existing] = await db
        .select({ id: payment_surcharge_rules.id })
        .from(payment_surcharge_rules)
        .where(and(
          eq(payment_surcharge_rules.id, ruleId),
          eq(payment_surcharge_rules.campus_id, campusId)
        ))
        .limit(1);
      if (!existing) return res.status(404).json({ message: "Regla no encontrada" });

      const { concepto_id, dias_gracia, porcentaje_recargo, monto_fijo, tipo_calculo, activo } = req.body;
      
      // Get concept name if provided
      let conceptName = null;
      if (concepto_id) {
        const [conceptData] = await db
          .select({ nombre: concepts.nombre })
          .from(concepts)
          .where(eq(concepts.id, concepto_id))
          .limit(1);
        
        if (conceptData) {
          conceptName = conceptData.nombre;
        }
      }

      // Map frontend types to database types
      let dbType = 'porcentaje';
      if (tipo_calculo === 'porcentaje_fijo') dbType = 'porcentaje';
      if (tipo_calculo === 'monto_fijo') dbType = 'fijo';
      if (tipo_calculo === 'porcentaje_diario') dbType = 'progresivo';

      const montoFijoCentavos = tipo_calculo === 'monto_fijo' ? Math.round((parseFloat(monto_fijo) || 0) * 100) : null;
      const porcentajeDecimal = tipo_calculo !== 'monto_fijo' ? (porcentaje_recargo || 0) : null;

      const updateData: any = {};
      if (conceptName) {
        updateData.concepto = conceptName;
        updateData.nombre = `Regla de recargo para ${conceptName}`;
      }
      if (dias_gracia !== undefined) updateData.dias_gracia = dias_gracia;
      if (tipo_calculo) updateData.tipo = dbType;
      if (porcentajeDecimal !== null) updateData.porcentaje = porcentajeDecimal;
      if (montoFijoCentavos !== null) updateData.monto_fijo_centavos = montoFijoCentavos;
      if (activo !== undefined) updateData.activo = activo;
      updateData.updated_at = new Date();
      
      const [updated] = await db
        .update(payment_surcharge_rules)
        .set(updateData)
        .where(and(
          eq(payment_surcharge_rules.id, ruleId),
          eq(payment_surcharge_rules.campus_id, campusId)
        ))
        .returning();
      
      // Map database type back to frontend type
      let frontendType = 'porcentaje_fijo';
      if (updated.tipo === 'porcentaje') frontendType = 'porcentaje_fijo';
      if (updated.tipo === 'fijo') frontendType = 'monto_fijo';
      if (updated.tipo === 'progresivo') frontendType = 'porcentaje_diario';

      res.json({
        id: updated.id,
        concepto_id,
        concepto_nombre: conceptName || "Concepto actualizado",
        dias_gracia: updated.dias_gracia,
        porcentaje_recargo: parseFloat(updated.porcentaje?.toString() || '0'),
        monto_fijo: updated.monto_fijo_centavos ? updated.monto_fijo_centavos / 100 : 0,
        tipo_calculo: frontendType,
        activo: updated.activo
      });
    } catch (error: any) {
      console.error("Error updating surcharge rule:", error);
      res.status(500).json({ message: "Error updating surcharge rule" });
    }
  });

  // Delete complete surcharge rule
  app.delete("/api/payment-config/surcharge-rules-complete/:id", authenticateToken, async (req: any, res) => {
    try {
      const ruleId = parseInt(req.params.id);
      if (!ruleId || isNaN(ruleId)) return res.status(400).json({ message: "ID inválido" });
      const campusId = req.user?.campus_id;

      // ── Guard de rol ──────────────────────────────────────────────────────
      if (!hasPermissionForUser(req.user, MODULES.SETTINGS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para configurar reglas de recargo" });
      }
      if (!campusId) return res.status(400).json({ message: "Campus requerido" });

      const [deleted] = await db
        .delete(payment_surcharge_rules)
        .where(and(eq(payment_surcharge_rules.id, ruleId), eq(payment_surcharge_rules.campus_id, campusId)))
        .returning({ id: payment_surcharge_rules.id });
      
      if (!deleted) return res.status(404).json({ message: "Regla de recargo no encontrada" });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting surcharge rule:", error);
      res.status(500).json({ message: "Error eliminando regla de recargo" });
    }
  });

  // TEST endpoint - verify requests reach server
  app.post("/api/test-create", authenticateToken, async (req, res) => {
    res.json({ success: true, message: "Test endpoint works", receivedData: req.body });
  });

  // Create payment due date configuration
  app.post("/api/payment-config/due-dates", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      const { concepto, dia_vencimiento, mes_aplicacion, activo } = req.body;

      // Fix HTML entity encoding issue
      const cleanedMesAplicacion = typeof mes_aplicacion === 'string' 
        ? mes_aplicacion.replace(/&quot;/g, '"') 
        : mes_aplicacion;

      const dueDateData = {
        campus_id: campusId,
        concepto,
        dia_vencimiento: parseInt(dia_vencimiento) || dia_vencimiento,
        mes_aplicacion: Array.isArray(cleanedMesAplicacion) ? JSON.stringify(cleanedMesAplicacion) : cleanedMesAplicacion,
        activo: activo !== undefined ? activo : true
      };

      const createdDueDate = await storage.createPaymentDueDate(dueDateData);
      
      // Verify creation by querying database
      const verification = await db
        .select()
        .from(payment_due_dates)
        .where(eq(payment_due_dates.id, createdDueDate.id));
      
      res.status(201).json({ message: "Fecha de vencimiento creada correctamente", data: createdDueDate });
    } catch (error: any) {
      console.error("🚀 Error creating payment due date:", error);
      res.status(500).json({ message: "Error creating payment due date" });
    }
  });

  // Update payment due date configuration
  app.put("/api/payment-config/due-dates/:id", authenticateToken, async (req: any, res) => {
    try {
      const dueDateId = parseInt(req.params.id);
      if (!dueDateId || isNaN(dueDateId)) return res.status(400).json({ message: "ID inválido" });
      const campusId = req.user?.campus_id;
      if (!campusId) return res.status(400).json({ message: "Campus requerido" });

      // Ownership check: verificar que el registro pertenece al campus del usuario
      const [existing] = await db.select({ id: payment_due_dates.id })
        .from(payment_due_dates)
        .where(and(eq(payment_due_dates.id, dueDateId), eq(payment_due_dates.campus_id, campusId)))
        .limit(1);
      if (!existing) return res.status(404).json({ message: "Fecha de vencimiento no encontrada" });

      const { concepto, dia_vencimiento, mes_aplicacion, activo } = req.body;

      // Fix HTML entity encoding issue
      const cleanedMesAplicacion = typeof mes_aplicacion === 'string' 
        ? mes_aplicacion.replace(/&quot;/g, '"') 
        : mes_aplicacion;

      const updates = {
        concepto,
        dia_vencimiento: parseInt(dia_vencimiento) || dia_vencimiento,
        mes_aplicacion: Array.isArray(cleanedMesAplicacion) ? JSON.stringify(cleanedMesAplicacion) : cleanedMesAplicacion,
        activo: activo !== undefined ? activo : true
      };

      const updatedDueDate = await storage.updatePaymentDueDate(dueDateId, updates);
      
      if (!updatedDueDate) {
        return res.status(404).json({ message: "Fecha de vencimiento no encontrada" });
      }
      
      res.json({ message: "Fecha de vencimiento actualizada correctamente", data: updatedDueDate });
    } catch (error: any) {
      console.error("Error updating payment due date:", error);
      res.status(500).json({ message: "Error actualizando fecha de vencimiento" });
    }
  });

  // Delete payment due date configuration
  app.delete("/api/payment-config/due-dates/:id", authenticateToken, async (req: any, res) => {
    try {
      const dueDateId = parseInt(req.params.id);
      if (!dueDateId || isNaN(dueDateId)) return res.status(400).json({ message: "ID inválido" });
      const campusId = req.user?.campus_id;
      if (!campusId) return res.status(400).json({ message: "Campus requerido" });

      // Ownership check antes de delegar a storage
      const [existing] = await db.select({ id: payment_due_dates.id })
        .from(payment_due_dates)
        .where(and(eq(payment_due_dates.id, dueDateId), eq(payment_due_dates.campus_id, campusId)))
        .limit(1);
      if (!existing) return res.status(404).json({ message: "Fecha de vencimiento no encontrada" });

      const deleted = await storage.deletePaymentDueDate(dueDateId);
      if (!deleted) return res.status(404).json({ message: "Fecha de vencimiento no encontrada" });
      
      res.json({ message: "Fecha de vencimiento eliminada correctamente" });
    } catch (error: any) {
      console.error("Error deleting payment due date:", error);
      res.status(500).json({ message: "Error eliminando fecha de vencimiento" });
    }
  });

  // Get surcharge rules configuration
  app.get("/api/payment-config/surcharge-rules", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user.campus_id;
      const rules = await storage.getSurchargeRulesByCampus(campusId);
      res.json(rules);
    } catch (error: any) {
      console.error("Error fetching surcharge rules:", error);
      res.status(500).json({ message: "Error fetching surcharge rules" });
    }
  });

  // Create surcharge rule
  app.post("/api/payment-config/surcharge-rules", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user.campus_id;
      const { 
        nombre, tipo, dias_gracia, porcentaje, monto_fijo_centavos, 
        reglas_progresivas, aplica_fines_semana, aplica_festivos, 
        monto_maximo_centavos, activo 
      } = req.body;
      
      const ruleData = {
        campus_id: campusId,
        nombre,
        tipo,
        concepto: nombre, // Use nombre as concepto for compatibility
        dias_gracia,
        porcentaje,
        monto_fijo_centavos,
        reglas_progresivas: reglas_progresivas ? JSON.stringify(reglas_progresivas) : null,
        aplica_fines_semana,
        aplica_festivos,
        monto_maximo_centavos,
        activo
      };

      const createdRule = await storage.createSurchargeRule(ruleData);
      res.status(201).json(createdRule);
    } catch (error: any) {
      console.error("Error creating surcharge rule:", error);
      res.status(500).json({ message: "Error creating surcharge rule" });
    }
  });

  // Update surcharge rule
  app.put("/api/payment-config/surcharge-rules/:id", authenticateToken, async (req: any, res) => {
    try {
      const ruleId = parseInt(req.params.id);
      if (!ruleId || isNaN(ruleId)) return res.status(400).json({ message: "ID inválido" });
      const campusId = req.user?.campus_id;
      if (!campusId) return res.status(400).json({ message: "Campus requerido" });

      // ── Guard de rol ──────────────────────────────────────────────────────
      if (!hasPermissionForUser(req.user, MODULES.SETTINGS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para configurar reglas de recargo" });
      }

      // Ownership check
      const [existing] = await db.select({ id: payment_surcharge_rules.id })
        .from(payment_surcharge_rules)
        .where(and(eq(payment_surcharge_rules.id, ruleId), eq(payment_surcharge_rules.campus_id, campusId)))
        .limit(1);
      if (!existing) return res.status(404).json({ message: "Regla de recargo no encontrada" });

      const { 
        nombre, tipo, dias_gracia, porcentaje, monto_fijo_centavos, 
        reglas_progresivas, aplica_fines_semana, aplica_festivos, 
        monto_maximo_centavos, activo 
      } = req.body;
      
      const updates = {
        nombre,
        tipo,
        dias_gracia,
        porcentaje,
        monto_fijo_centavos,
        reglas_progresivas: reglas_progresivas ? JSON.stringify(reglas_progresivas) : null,
        aplica_fines_semana,
        aplica_festivos,
        monto_maximo_centavos,
        activo
      };

      const updatedRule = await storage.updateSurchargeRule(ruleId, updates);
      if (!updatedRule) return res.status(404).json({ message: "Regla de recargo no encontrada" });
      res.json(updatedRule);
    } catch (error: any) {
      console.error("Error updating surcharge rule:", error);
      res.status(500).json({ message: "Error actualizando regla de recargo" });
    }
  });

  // Delete surcharge rule
  app.delete("/api/payment-config/surcharge-rules/:id", authenticateToken, async (req: any, res) => {
    try {
      const ruleId = parseInt(req.params.id);
      if (!ruleId || isNaN(ruleId)) return res.status(400).json({ message: "ID inválido" });
      const campusId = req.user?.campus_id;
      if (!campusId) return res.status(400).json({ message: "Campus requerido" });

      // ── Guard de rol ──────────────────────────────────────────────────────
      if (!hasPermissionForUser(req.user, MODULES.SETTINGS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para configurar reglas de recargo" });
      }

      // Ownership check
      const [existing] = await db.select({ id: payment_surcharge_rules.id })
        .from(payment_surcharge_rules)
        .where(and(eq(payment_surcharge_rules.id, ruleId), eq(payment_surcharge_rules.campus_id, campusId)))
        .limit(1);
      if (!existing) return res.status(404).json({ message: "Regla de recargo no encontrada" });

      const deleted = await storage.deleteSurchargeRule(ruleId);
      if (!deleted) return res.status(404).json({ message: "Regla de recargo no encontrada" });
      res.json({ message: "Regla de recargo eliminada correctamente" });
    } catch (error: any) {
      console.error("Error deleting surcharge rule:", error);
      res.status(500).json({ message: "Error eliminando regla de recargo" });
    }
  });

  // MIGRATION API ROUTES - Para que Refeerence pueda migrar EDUPAY desde Replit
  app.use('/api/migration', (await import('../replit-migration-api')).default);
}
