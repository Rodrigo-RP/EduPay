import type { Express } from "express";
import { pool, db } from "../db";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";
import { authenticateToken, requireAuth, checkCampusTenant, hasPermissionForUser, JWT_SECRET} from "./shared";
import { MODULES, ACTIONS } from "@shared/permissions";
import { students, guardians, charges, payments, concepts, invoices, families, family_students, payment_applications, payment_events, audit_log } from "@shared/schema";
import { enqueueAuditLog } from "../audit-retry";
import { z } from "zod";
import jwt from "jsonwebtoken";

// ── ADR-002: Helpers para planes de pago integrados al ledger ─────────────────

/** Devuelve el id del concepto sentinel 'cuota_plan' del campus, creándolo si no existe. */
async function getOrCreateCuotaPlanConcept(
  campusId: number, tenantId: number
): Promise<number> {
  const existing = await pool.query(
    `SELECT id FROM concepts WHERE campus_id = $1 AND tipo = 'cuota_plan' LIMIT 1`,
    [campusId]
  );
  if ((existing.rows as any[]).length > 0) return (existing.rows as any[])[0].id;
  const ins = await pool.query(
    `INSERT INTO concepts (campus_id, tenant_id, nombre, tipo, periodicidad, monto_centavos)
     VALUES ($1, $2, 'Cuota Plan de Pago', 'cuota_plan', 'eventual', 1) RETURNING id`,
    [campusId, tenantId]
  );
  return (ins.rows as any[])[0].id;
}

/** Genera N charges de cuota dentro de una transacción ya abierta. */
async function generarCuotaCharges(
  client: any,
  opts: {
    plan: any; studentId: number; conceptId: number;
    totalAdeudo: number; montoInicial: number;
    numeroPagos: number; frecuencia: string; fechaInicio: string; tenantId: number;
  }
): Promise<any[]> {
  const base      = opts.totalAdeudo - opts.montoInicial;
  const porCuota  = Math.floor(base / opts.numeroPagos);
  const ajuste    = base - porCuota * opts.numeroPagos; // absorbido en última cuota
  const diasFrec  = opts.frecuencia === 'semanal' ? 7 : opts.frecuencia === 'quincenal' ? 15 : 30;
  const fechaBase = new Date(opts.fechaInicio + "T12:00:00");
  const cuotas: any[] = [];
  for (let i = 0; i < opts.numeroPagos; i++) {
    const fv    = new Date(fechaBase.getTime() + (i + 1) * diasFrec * 86400000);
    const monto = i === opts.numeroPagos - 1 ? porCuota + ajuste : porCuota;
    const r = await client.query(
      `INSERT INTO charges
         (tenant_id, student_id, concept_id, plan_id,
          fecha_emision, fecha_vencimiento, monto_base_centavos, estado)
       VALUES ($1,$2,$3,$4, CURRENT_DATE,$5,$6,'pendiente') RETURNING *`,
      [opts.tenantId, opts.studentId, opts.conceptId, opts.plan.id,
       fv.toISOString().split("T")[0], monto]
    );
    cuotas.push((r.rows as any[])[0]);
  }
  return cuotas;
}

export function registerMiscRoutes(app: Express): void {

  // ── PLANES DE PAGO — GET con campusId ────────────────────────────────────
  app.get("/api/planes-pago/:campusId", authenticateToken, async (req: any, res) => {
    if (!hasPermissionForUser(req.user, MODULES.RECEIVABLES, ACTIONS.READ)) {
      return res.status(403).json({ message: "Sin permisos para ver planes de pago" });
    }
    try {
      const campusId = parseInt(req.params.campusId) || req.user?.campus_id;
      if (!await checkCampusTenant(campusId, req.user?.tenant_id, res)) return;
      const planesRows = await pool.query(`
        SELECT pp.*, CONCAT(s.nombres, ' ', s.apellido_paterno) AS student_nombre
        FROM payment_plans pp
        LEFT JOIN students s ON s.id = pp.student_id
        WHERE pp.campus_id = $1 ORDER BY pp.created_at DESC
      `, [campusId]);
      const planes = await Promise.all((planesRows.rows as any[]).map(async p => {
        const cuotasR = await pool.query(
          `SELECT * FROM charges WHERE plan_id = $1 ORDER BY fecha_vencimiento ASC`, [p.id]
        ).catch(() => ({ rows: [] }));
        const cuotas = cuotasR.rows as any[];
        const cuotasPagadas = cuotas.filter(c => c.estado === 'pagado').length;
        const base = Number(p.total_adeudo_centavos) - Number(p.monto_inicial_centavos || 0);
        const cuotaCentavos = p.numero_pagos > 0 ? Math.round(base / p.numero_pagos) : 0;
        return { ...p, installments: cuotas, cuotas_pagadas: cuotasPagadas, cuota_centavos: cuotaCentavos };
      }));
      res.json(planes);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── PLANES DE PAGO — Crear (Modo A: reestructuración | Modo B: futuro) ───
  app.post("/api/planes-pago", authenticateToken, async (req: any, res) => {
    try {
      const role = req.user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.CHARGES, ACTIONS.CREATE)) {
        return res.status(403).json({ message: "Sin permisos para crear cargos" });
      }
      const campusId  = req.user?.campus_id;
      const tenantId  = req.user?.tenant_id;
      const userId    = req.user?.id;
      const {
        charge_ids, concept_id,
        monto_inicial_centavos = 0, numero_pagos,
        frecuencia = 'mensual', fecha_inicio,
        recargo_centavos = 0, observaciones,
        student_id, guardian_id,
      } = req.body;

      // Detectar modo: uno y solo uno debe estar presente
      const esModoA = Array.isArray(charge_ids) && charge_ids.length > 0;
      const esModoB = !!concept_id;
      if (esModoA && esModoB) {
        return res.status(400).json({
          message: "El plan debe especificar charge_ids (reestructuración) o concept_id (futuro), no ambos",
        });
      }
      if (!esModoA && !esModoB) {
        return res.status(400).json({
          message: "El plan debe especificar charge_ids (reestructuración) o concept_id (futuro), no ambos ni ninguno",
        });
      }

      // Validaciones comunes
      if (!numero_pagos || Number(numero_pagos) < 1) {
        return res.status(400).json({ message: "numero_pagos debe ser ≥ 1" });
      }
      if (!fecha_inicio) {
        return res.status(400).json({ message: "fecha_inicio es obligatorio" });
      }
      if (!['mensual', 'quincenal', 'semanal'].includes(frecuencia)) {
        return res.status(400).json({ message: "frecuencia debe ser 'mensual', 'quincenal' o 'semanal'" });
      }

      if (esModoA) {
        // ── MODO A: Reestructuración de Charges existentes ───────────────────
        if (Number(recargo_centavos) > 0 && !observaciones?.trim()) {
          return res.status(400).json({
            message: "observaciones es obligatorio cuando recargo_centavos > 0",
          });
        }

        // Calcular saldo pendiente real (monto_base − SUM(payment_applications))
        const saldoRes = await pool.query(`
          SELECT c.id, c.student_id, c.estado,
                 c.monto_base_centavos
                   - COALESCE(SUM(pa.amount_centavos), 0) AS saldo_pendiente_centavos
          FROM charges c
          LEFT JOIN payment_applications pa ON pa.charge_id = c.id
          WHERE c.id = ANY($1) AND c.tenant_id = $2
          GROUP BY c.id, c.monto_base_centavos, c.student_id, c.estado
        `, [charge_ids, tenantId]);

        if ((saldoRes.rows as any[]).length !== charge_ids.length) {
          return res.status(403).json({
            message: "Acceso denegado: uno o más cargos no pertenecen a este tenant",
          });
        }
        const saldoRows = saldoRes.rows as any[];

        // Todos deben tener estado pendiente o parcial
        const estadoInvalido = saldoRows.find(r => !['pendiente', 'parcial'].includes(r.estado));
        if (estadoInvalido) {
          return res.status(422).json({
            message: `El cargo ${estadoInvalido.id} tiene estado '${estadoInvalido.estado}' y no puede reestructurarse`,
          });
        }

        // Todos deben pertenecer al mismo alumno
        const uniqueStudents = [...new Set(saldoRows.map(r => r.student_id))];
        if (uniqueStudents.length > 1) {
          return res.status(422).json({ message: "Todos los cargos deben pertenecer al mismo alumno" });
        }
        const resolvedStudentId = Number(uniqueStudents[0]);

        // Ningún saldo debe ser ≤ 0
        const saldoCero = saldoRows.find(r => Number(r.saldo_pendiente_centavos) <= 0);
        if (saldoCero) {
          return res.status(422).json({
            message: `El cargo ${saldoCero.id} tiene saldo pendiente ≤ 0`,
          });
        }

        const sumSaldos = saldoRows.reduce((acc, r) => acc + Number(r.saldo_pendiente_centavos), 0);
        const totalAdeudo = sumSaldos + Number(recargo_centavos || 0);
        const montoInicial = Number(monto_inicial_centavos || 0);

        if (montoInicial >= totalAdeudo && totalAdeudo > 0) {
          return res.status(422).json({ message: "monto_inicial_centavos no puede superar el total adeudado" });
        }

        const conceptoId = await getOrCreateCuotaPlanConcept(campusId, tenantId);

        // Transacción: cancelar charges originales + crear cuotas en ledger
        const client = await pool.connect();
        let plan: any;
        let cuotas: any[];
        try {
          await client.query('BEGIN');

          const planRow = await client.query(`
            INSERT INTO payment_plans
              (campus_id, tenant_id, student_id, total_adeudo_centavos, monto_inicial_centavos,
               numero_pagos, frecuencia, fecha_inicio, observaciones, created_by,
               tipo_origen, charge_ids_origen)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'reestructuracion',$11) RETURNING *
          `, [campusId, tenantId, resolvedStudentId, totalAdeudo, montoInicial,
              Number(numero_pagos), frecuencia, fecha_inicio, observaciones || null,
              userId || null, JSON.stringify(charge_ids)]);
          plan = (planRow.rows as any[])[0];

          await client.query(
            `UPDATE charges SET estado = 'cancelado', updated_at = NOW()
             WHERE id = ANY($1) AND tenant_id = $2`,
            [charge_ids, tenantId]
          );

          cuotas = await generarCuotaCharges(client, {
            plan, studentId: resolvedStudentId, conceptId: conceptoId,
            totalAdeudo, montoInicial, numeroPagos: Number(numero_pagos),
            frecuencia, fechaInicio: fecha_inicio, tenantId,
          });

          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }

        // Audit FUERA de la transacción (ADR-001)
        if (tenantId && userId) {
          for (const chargeInfo of saldoRows) {
            pool.query(
              `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
               VALUES ($1,$2,'charge_cancelado_por_plan','charge',$3,$4)`,
              [tenantId, userId, chargeInfo.id, JSON.stringify({
                plan_id: plan.id,
                motivo: 'reestructurado en plan de pago',
                saldo_pendiente_centavos: Number(chargeInfo.saldo_pendiente_centavos),
                recargo_centavos: Number(recargo_centavos || 0),
              })]
            ).catch((err: any) =>
              enqueueAuditLog({ tenant_id: tenantId, user_id: userId, action: 'charge_cancelado_por_plan',
                entity_type: 'charge', entity_id: chargeInfo.id,
                metadata: { motivo: 'reestructurado en plan de pago' } }, err)
            );
          }
        }

        return res.json({ ...plan, cuotas, mensaje: `Plan de reestructuración creado con ${numero_pagos} cuotas` });
      }

      // ── MODO B: Acuerdo a futuro ──────────────────────────────────────────
      const concept = await storage.getConceptScoped(parseInt(concept_id), tenantId);
      if (!concept) {
        return res.status(403).json({ message: "Acceso denegado: concepto no pertenece a este tenant" });
      }
      if (concept.tipo === 'cuota_plan') {
        return res.status(422).json({
          message: "Un plan no puede originarse en otro plan (concept.tipo='cuota_plan' prohibido)",
        });
      }
      if (!student_id) {
        return res.status(400).json({ message: "student_id es obligatorio en planes de acuerdo futuro" });
      }
      const student = await storage.getStudentScoped(parseInt(student_id), tenantId);
      if (!student) {
        return res.status(403).json({ message: "Acceso denegado: alumno no pertenece a este tenant" });
      }
      if (guardian_id) {
        const g = await storage.getGuardianScoped(parseInt(guardian_id), tenantId);
        if (!g) return res.status(403).json({ message: "Acceso denegado: guardián no pertenece a este tenant" });
      }

      const totalAdeudoB = Number(concept.monto_centavos);
      const montoInicialB = Number(monto_inicial_centavos || 0);
      if (montoInicialB >= totalAdeudoB) {
        return res.status(422).json({
          message: "monto_inicial_centavos debe ser menor al monto total del concepto",
        });
      }

      const clientB = await pool.connect();
      let planB: any; let cuotasB: any[];
      try {
        await clientB.query('BEGIN');
        const planRow = await clientB.query(`
          INSERT INTO payment_plans
            (campus_id, tenant_id, student_id, guardian_id, total_adeudo_centavos,
             monto_inicial_centavos, numero_pagos, frecuencia, fecha_inicio,
             observaciones, created_by, tipo_origen)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'futuro') RETURNING *
        `, [campusId, tenantId, student.id, guardian_id || null, totalAdeudoB,
            montoInicialB, Number(numero_pagos), frecuencia, fecha_inicio,
            observaciones || null, userId || null]);
        planB = (planRow.rows as any[])[0];

        cuotasB = await generarCuotaCharges(clientB, {
          plan: planB, studentId: student.id, conceptId: concept.id,
          totalAdeudo: totalAdeudoB, montoInicial: montoInicialB,
          numeroPagos: Number(numero_pagos), frecuencia, fechaInicio: fecha_inicio, tenantId,
        });

        await clientB.query('COMMIT');
      } catch (err) {
        await clientB.query('ROLLBACK');
        throw err;
      } finally {
        clientB.release();
      }

      return res.json({ ...planB, cuotas: cuotasB, mensaje: `Plan de acuerdo futuro creado con ${numero_pagos} cuotas` });

    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── PLANES DE PAGO — Endpoint deprecado (ADR-002) ────────────────────────
  app.post("/api/planes-pago/cuotas/:cuotaId/pagar", authenticateToken, async (_req, res) => {
    res.status(410).json({
      message: "Endpoint deprecado (ADR-002). Use POST /api/guardian/pagar con el charge_id de la cuota.",
    });
  });

  // ── PLANES DE PAGO — Cancelar plan ───────────────────────────────────────
  app.patch("/api/planes-pago/:id/cancelar", authenticateToken, async (req: any, res) => {
    try {
      const role = req.user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.CHARGES, ACTIONS.UPDATE)) {
        return res.status(403).json({ message: "Sin permisos para modificar cargos" });
      }
      const tenantId = req.user?.tenant_id;
      const userId   = req.user?.id;
      const planId   = parseInt(req.params.id);
      const { motivo, destino_saldo_pendiente, motivo_condonacion } = req.body;

      if (!motivo || String(motivo).trim().length < 10) {
        return res.status(400).json({
          message: "El campo 'motivo' es obligatorio y debe tener mínimo 10 caracteres",
        });
      }

      const planRes = await pool.query(
        `SELECT * FROM payment_plans WHERE id = $1`, [planId]
      );
      if ((planRes.rows as any[]).length === 0) {
        return res.status(404).json({ message: "Plan no encontrado" });
      }
      const plan = (planRes.rows as any[])[0];

      if (Number(plan.tenant_id) !== Number(tenantId)) {
        return res.status(403).json({ message: "Acceso denegado: plan no pertenece a este tenant" });
      }
      if (plan.estado !== 'activo') {
        return res.status(409).json({ message: "El plan ya está cancelado" });
      }

      // Para planes de reestructuración, destino_saldo_pendiente es obligatorio
      if (plan.tipo_origen === 'reestructuracion') {
        if (!destino_saldo_pendiente || !['reinstalar', 'condonar'].includes(destino_saldo_pendiente)) {
          return res.status(400).json({
            message: "Los planes de reestructuración requieren destino_saldo_pendiente: 'reinstalar' | 'condonar'",
          });
        }
        if (destino_saldo_pendiente === 'condonar') {
          if (!motivo_condonacion || String(motivo_condonacion).trim().length < 10) {
            return res.status(400).json({
              message: "El campo 'motivo_condonacion' es obligatorio y debe tener mínimo 10 caracteres al condonar",
            });
          }
        }
      }

      // ── §8 Pre-check: detectar condonación repetida ANTES del BEGIN ───────
      // Las variables se declaran aquí para que el bloque post-commit pueda
      // leerlas sin repetir las queries.
      let alertaPreCheck           = false;
      let familyIdsPreCheck:       number[] = [];
      let incluyeHermanosPreCheck  = false;
      let overridePayload: any     = null;

      if (destino_saldo_pendiente === 'condonar' && tenantId) {
        try {
          // Paso 1: todos los alumnos de la misma familia (incluye al alumno actual)
          const familyRes = await pool.query(
            `SELECT DISTINCT fs2.student_id
             FROM family_students fs1
             JOIN family_students fs2 ON fs2.family_id = fs1.family_id
             WHERE fs1.student_id = $1`,
            [plan.student_id]
          );
          familyIdsPreCheck = (familyRes.rows as any[]).map((r: any) => r.student_id as number);
          if (!familyIdsPreCheck.includes(plan.student_id)) familyIdsPreCheck.push(plan.student_id);
          incluyeHermanosPreCheck = familyIdsPreCheck.length > 1;

          // Paso 2: ¿algún miembro de la familia fue condonado en los últimos 90 días?
          const prevCond = await pool.query(
            `SELECT id FROM audit_log
             WHERE tenant_id = $1
               AND action = 'saldo_condonado'
               AND created_at > NOW() - INTERVAL '90 days'
               AND (metadata::jsonb ->> 'student_id')::int = ANY($2::int[])
             LIMIT 1`,
            [tenantId, familyIdsPreCheck]
          );
          alertaPreCheck = (prevCond.rows as any[]).length > 0;
        } catch (_) { /* no bloquear el flujo */ }

        if (alertaPreCheck) {
          const rawToken = (req.body.override_token as string | undefined);

          if (!rawToken) {
            // Escribir ALERTA_CONDONACION_REPETIDA (o reutilizar la de las últimas 24 h)
            // para que admin_general pueda consultar el alerta_id y emitir el override_token.
            let alertaId: number | null = null;
            try {
              const existingAlert = await pool.query(
                `SELECT id FROM audit_log
                 WHERE tenant_id = $1
                   AND action = 'ALERTA_CONDONACION_REPETIDA'
                   AND entity_id = $2
                   AND created_at > NOW() - INTERVAL '24 hours'
                 ORDER BY created_at DESC LIMIT 1`,
                [tenantId, planId]
              );
              if ((existingAlert.rows as any[]).length > 0) {
                alertaId = (existingAlert.rows as any[])[0].id;
              } else {
                const alertaMeta = {
                  student_id:       plan.student_id,
                  plan_id:          planId,
                  incluye_hermanos: incluyeHermanosPreCheck,
                  prioridad:        'alta',
                  mensaje: incluyeHermanosPreCheck
                    ? 'Condonación bloqueada: repetición en 90 días detectada para alumno o hermano de la misma familia.'
                    : 'Condonación bloqueada: repetición en 90 días detectada para el mismo alumno.',
                };
                const alertaInsert = await pool.query(
                  `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
                   VALUES ($1,$2,'ALERTA_CONDONACION_REPETIDA','payment_plan',$3,$4) RETURNING id`,
                  [tenantId, userId ?? null, planId, JSON.stringify(alertaMeta)]
                );
                alertaId = (alertaInsert.rows as any[])[0].id;
              }
            } catch (_) { /* non-blocking */ }

            return res.status(409).json({
              message: "Se requiere autorización de administrador_general: este alumno o un familiar ya tiene una condonación registrada en los últimos 90 días",
              requiere_override: true,
              alerta_id: alertaId,
            });
          }

          // Validar el override_token
          try {
            overridePayload = jwt.verify(rawToken, JWT_SECRET) as any;
          } catch (err: any) {
            if (err.name === 'TokenExpiredError') {
              return res.status(409).json({ message: "El token de autorización ha expirado" });
            }
            return res.status(403).json({ message: "Token de autorización inválido o corrupto" });
          }

          // Verificar que el token pertenece exactamente a este plan y plantel
          if (
            overridePayload.action    !== 'override_condonacion'  ||
            Number(overridePayload.plan_id)   !== planId            ||
            Number(overridePayload.tenant_id) !== Number(tenantId)  ||
            Number(overridePayload.campus_id) !== Number(plan.campus_id)
          ) {
            return res.status(403).json({
              message: "El token de autorización no es válido para este plan o plantel",
            });
          }
        }
      }

      // Calcular cuotas pendientes antes del BEGIN
      const pendientesRes = await pool.query(
        `SELECT id, monto_base_centavos FROM charges WHERE plan_id = $1 AND estado = 'pendiente'`, [planId]
      );
      const pendientes = pendientesRes.rows as any[];
      const saldoPendiente = pendientes.reduce((acc: number, r: any) => acc + Number(r.monto_base_centavos), 0);

      const pagadasRes = await pool.query(
        `SELECT COUNT(*) AS cnt FROM charges WHERE plan_id = $1 AND estado = 'pagado'`, [planId]
      );
      const cuotasPagadas = Number((pagadasRes.rows as any[])[0]?.cnt || 0);

      const client = await pool.connect();
      let newChargeId: number | null = null;
      try {
        await client.query('BEGIN');

        const upd = await client.query(
          `UPDATE payment_plans SET estado = 'cancelado'
           WHERE id = $1 AND tenant_id = $2 AND estado = 'activo' RETURNING id`,
          [planId, tenantId]
        );
        if ((upd.rows as any[]).length === 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({ message: "El plan ya está cancelado" });
        }

        await client.query(
          `UPDATE charges SET estado = 'cancelado', updated_at = NOW()
           WHERE plan_id = $1 AND estado = 'pendiente'`,
          [planId]
        );

        // Reinstalar: crear nuevo charge con el saldo pendiente
        if (plan.tipo_origen === 'reestructuracion' &&
            destino_saldo_pendiente === 'reinstalar' &&
            saldoPendiente > 0) {
          const conceptRes = await client.query(
            `SELECT concept_id FROM charges WHERE plan_id = $1 LIMIT 1`, [planId]
          );
          const conceptIdReins = conceptRes.rows.length > 0
            ? (conceptRes.rows as any[])[0].concept_id
            : await getOrCreateCuotaPlanConcept(plan.campus_id, tenantId);

          const newCh = await client.query(
            `INSERT INTO charges (tenant_id, student_id, concept_id, plan_id,
               fecha_emision, fecha_vencimiento, monto_base_centavos, estado)
             VALUES ($1,$2,$3,NULL, CURRENT_DATE, CURRENT_DATE,$4,'pendiente') RETURNING id`,
            [tenantId, plan.student_id, conceptIdReins, saldoPendiente]
          );
          newChargeId = (newCh.rows as any[])[0].id;
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      // Audit FUERA de la transacción (ADR-001)
      const auditMeta: Record<string, any> = {
        motivo: String(motivo).trim(),
        destino_saldo_pendiente: destino_saldo_pendiente || 'N/A (futuro)',
        cuotas_canceladas: pendientes.length,
        cuotas_pagadas_preservadas: cuotasPagadas,
      };
      if (destino_saldo_pendiente === 'reinstalar') {
        auditMeta.saldo_reinstalado_centavos = saldoPendiente;
        auditMeta.nuevo_charge_id = newChargeId;
      }
      if (destino_saldo_pendiente === 'condonar') {
        auditMeta.motivo_condonacion = String(motivo_condonacion).trim();
        auditMeta.monto_condonado_centavos = saldoPendiente;
      }
      if (tenantId && userId) {
        pool.query(
          `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
           VALUES ($1,$2,'plan_cancelado','payment_plan',$3,$4)`,
          [tenantId, userId, planId, JSON.stringify(auditMeta)]
        ).catch((err: any) =>
          enqueueAuditLog({ tenant_id: tenantId, user_id: userId, action: 'plan_cancelado',
            entity_type: 'payment_plan', entity_id: planId, metadata: auditMeta }, err)
        );
      }

      // ── §8 Post-commit: escrituras de auditoría ───────────────────────────
      // La detección de condonación repetida ya se hizo en el pre-check (antes
      // del BEGIN). Aquí solo se escriben las entradas correspondientes.
      if (destino_saldo_pendiente === 'condonar' && tenantId) {
        // saldo_condonado se escribe siempre (con o sin override).
        // Si hubo override, el alerta_id queda en metadata para trazabilidad completa.
        const saldoCondonadoMeta: Record<string, any> = {
          student_id:               plan.student_id,
          monto_condonado_centavos: saldoPendiente,
          motivo_condonacion:       String(motivo_condonacion).trim(),
          campus_id:                plan.campus_id,
        };
        if (overridePayload) {
          saldoCondonadoMeta.override_alerta_id = overridePayload.alerta_id;
        }
        pool.query(
          `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
           VALUES ($1,$2,'saldo_condonado','payment_plan',$3,$4)`,
          [tenantId, userId ?? null, planId, JSON.stringify(saldoCondonadoMeta)]
        ).catch((err: any) =>
          enqueueAuditLog({
            tenant_id: tenantId, user_id: userId ?? null,
            action: 'saldo_condonado', entity_type: 'payment_plan',
            entity_id: planId, metadata: saldoCondonadoMeta,
          }, err)
        );

        if (alertaPreCheck && overridePayload) {
          // Override ejecutado correctamente: registrar con trazabilidad completa.
          // Cadena auditable: ALERTA_CONDONACION_REPETIDA → generacion_override_condonacion
          //                   → CONDONACION_OVERRIDE_EJECUTADA → saldo_condonado
          const overrideMeta = {
            student_id:               plan.student_id,
            plan_id:                  planId,
            alerta_id:                overridePayload.alerta_id,
            monto_condonado_centavos: saldoPendiente,
            incluye_hermanos:         incluyeHermanosPreCheck,
            nota: 'Condonación repetida ejecutada con autorización explícita de administrador_general',
          };
          pool.query(
            `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
             VALUES ($1,$2,'CONDONACION_OVERRIDE_EJECUTADA','payment_plan',$3,$4)`,
            [tenantId, userId ?? null, planId, JSON.stringify(overrideMeta)]
          ).catch((err: any) =>
            enqueueAuditLog({
              tenant_id: tenantId, user_id: userId ?? null,
              action: 'CONDONACION_OVERRIDE_EJECUTADA', entity_type: 'payment_plan',
              entity_id: planId, metadata: overrideMeta,
            }, err)
          );
        }
      }

      res.json({
        message: "Plan cancelado correctamente",
        plan_id: planId,
        cuotas_canceladas: pendientes.length,
        cuotas_pagadas_preservadas: cuotasPagadas,
        nuevo_charge_id: newChargeId,
        destino_saldo_pendiente: destino_saldo_pendiente || null,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── 7. CALENDARIO FINANCIERO ──────────────────────────────────────────────
  app.get("/api/calendario/eventos/:campusId", authenticateToken, async (req: any, res) => {
    if (!hasPermissionForUser(req.user, MODULES.CALENDAR, ACTIONS.READ)) {
      return res.status(403).json({ message: "Sin permisos para ver el calendario financiero" });
    }
    try {
      const campusId = parseInt(req.params.campusId) || req.user?.campus_id;
      if (!await checkCampusTenant(campusId, req.user?.tenant_id, res)) return;
      const rows = await pool.query(`SELECT * FROM financial_events WHERE campus_id = $1 ORDER BY fecha, id`, [campusId]);
      res.json(rows.rows);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // Alias sin campusId para el frontend que llama /api/calendario/eventos
  app.get("/api/calendario/eventos", authenticateToken, async (req: any, res) => {
    if (!hasPermissionForUser(req.user, MODULES.CALENDAR, ACTIONS.READ)) {
      return res.status(403).json({ message: "Sin permisos para ver el calendario financiero" });
    }
    try {
      const campusId = req.user?.campus_id;
      if (!await checkCampusTenant(campusId, req.user?.tenant_id, res)) return;
      const rows = await pool.query(`SELECT * FROM financial_events WHERE campus_id = $1 ORDER BY fecha, id`, [campusId]);
      res.json(rows.rows);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  app.post("/api/calendario/eventos", authenticateToken, async (req: any, res) => {
    try {
      const role = req.user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.CALENDAR, ACTIONS.CREATE)) {
        return res.status(403).json({ message: "No tienes permiso para crear eventos de calendario" });
      }
      const campusId = req.user?.campus_id;
      const tenantId = req.user?.tenant_id;
      const { titulo, descripcion, fecha, tipo, urgencia } = req.body;
      const row = await pool.query(`
        INSERT INTO financial_events (campus_id, tenant_id, titulo, descripcion, fecha, tipo, urgencia)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
      `, [campusId, tenantId, titulo, descripcion || null, fecha, tipo || 'otro', urgencia || 'normal']);
      res.json((row.rows as any[])[0]);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  app.post("/api/calendario/eventos/:id/completar", authenticateToken, async (req: any, res) => {
    try {
      const role = req.user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.CALENDAR, ACTIONS.CREATE)) {
        return res.status(403).json({ message: "No tienes permiso para completar eventos de calendario" });
      }
      const campusId = req.user?.campus_id;
      const tenantId = req.user?.tenant_id;
      await pool.query(
        `UPDATE financial_events SET completado = true WHERE id = $1 AND campus_id = $2 AND tenant_id = $3`,
        [parseInt(req.params.id), campusId, tenantId],
      );
      res.json({ message: "Evento marcado como completado" });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // RPT-05 Consejo Directivo migrado a server/routes/reportes-consejo.ts
  // GET  /api/reportes/consejo          — FINANCIAL.READ  (campus del JWT)
  // POST /api/reportes/consejo/exportar — REPORTS.EXPORT
  // R7 (:campusId) y R8 (alias) retirados; todos los tests migrados al canónico.

  // Alias /api/planes-pago sin campusId (ADR-002: lee cuotas de charges)
  app.get("/api/planes-pago", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (!hasPermissionForUser(user, MODULES.RECEIVABLES, ACTIONS.READ)) {
      return res.status(403).json({ message: "Sin permisos para ver planes de pago" });
    }
    try {
      const campusId = user?.campus_id;
      const planesRows = await pool.query(`
        SELECT pp.*, CONCAT(s.nombres, ' ', s.apellido_paterno) AS student_nombre
        FROM payment_plans pp
        LEFT JOIN students s ON s.id = pp.student_id
        WHERE pp.campus_id = $1 ORDER BY pp.created_at DESC
      `, [campusId]);
      const planes = await Promise.all((planesRows.rows as any[]).map(async p => {
        const cuotasR = await pool.query(
          `SELECT * FROM charges WHERE plan_id = $1 ORDER BY fecha_vencimiento ASC`, [p.id]
        ).catch(() => ({ rows: [] }));
        const cuotas = cuotasR.rows as any[];
        const cuotasPagadas = cuotas.filter((c: any) => c.estado === 'pagado').length;
        const base = Number(p.total_adeudo_centavos) - Number(p.monto_inicial_centavos || 0);
        const cuotaCentavos = p.numero_pagos > 0 ? Math.round(base / p.numero_pagos) : 0;
        return { ...p, installments: cuotas, cuotas_pagadas: cuotasPagadas, cuota_centavos: cuotaCentavos };
      }));
      res.json(planes);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // Alias /api/riesgo/semaforo sin campusId
  app.get("/api/riesgo/semaforo", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (!hasPermissionForUser(user, MODULES.RECEIVABLES, ACTIONS.READ)) {
      return res.status(403).json({ message: "Sin permisos para ver el semáforo de riesgo" });
    }
    const campusId = user?.campus_id;
    try {
      const rows = await pool.query(`
        SELECT s.id AS student_id, CONCAT(s.nombres,' ',s.apellido_paterno) AS estudiante,
          CONCAT(g.nombres,' ',g.apellido_paterno) AS nombre_familia, s.nivel_escolar AS nivel,
          COALESCE(SUM(CASE WHEN c.estado='pendiente' THEN c.monto_base_centavos ELSE 0 END),0) AS adeudo_centavos,
          COALESCE(MAX(EXTRACT(DAY FROM (NOW()-c.fecha_vencimiento::date))) FILTER (WHERE c.estado='pendiente' AND c.fecha_vencimiento < NOW()::date),0) AS dias_vencido,
          COALESCE(ROUND(COUNT(p.id) FILTER (WHERE p.created_at > NOW()-INTERVAL '6 months')::numeric /
            NULLIF(COUNT(c2.id) FILTER (WHERE c2.created_at > NOW()-INTERVAL '6 months'),0)*100),0) AS tasa_pago_historica
        FROM students s
        LEFT JOIN student_guardian sg ON sg.student_id=s.id
        LEFT JOIN guardians g ON g.id=sg.guardian_id
        LEFT JOIN charges c ON c.student_id=s.id AND c.estado='pendiente'
        LEFT JOIN payments p ON p.charge_id IN (SELECT id FROM charges WHERE student_id=s.id)
        LEFT JOIN charges c2 ON c2.student_id=s.id
        WHERE s.campus_id=$1 GROUP BY s.id,s.nombres,s.apellido_paterno,g.nombres,g.apellido_paterno,s.nivel_escolar
        ORDER BY adeudo_centavos DESC LIMIT 200
      `, [campusId]);
      const familias = (rows.rows as any[]).map(f => {
        const diasVencido = Number(f.dias_vencido||0), adeudo = Number(f.adeudo_centavos||0), tasaPago = Number(f.tasa_pago_historica||0);
        let score = 100;
        score -= Math.min(diasVencido, 40);
        if (adeudo > 500000) score -= 20; else if (adeudo > 200000) score -= 10;
        score = Math.round(Math.max(0, Math.min(100, score - (100-tasaPago)*0.3)));
        return { ...f, adeudo_centavos: adeudo, dias_vencido: diasVencido, tasa_pago_historica: tasaPago, score, semaforo: score>=75?"verde":score>=50?"amarillo":"rojo", historial_descripcion: tasaPago>=90?"Excelente historial":tasaPago>=70?"Historial regular":"Historial irregular" };
      });
      res.json(familias);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // Alias /api/dashboard/comandos sin campusId
  app.get("/api/dashboard/comandos", authenticateToken, async (req, res) => {
    if (!hasPermissionForUser((req as any).user, MODULES.FINANCIAL, ACTIONS.READ)) {
      return res.status(403).json({ message: "Sin permisos para ver KPIs financieros del campus" });
    }
    try {
      const campusId = (req as any).user?.campus_id;
      const [paymentsRows, chargesRows, studentsRows, speiRows] = await Promise.all([
        pool.query(`SELECT COALESCE(SUM(p.monto_centavos),0) as total FROM payments p JOIN charges c ON c.id=p.charge_id JOIN students s ON s.id=c.student_id WHERE s.campus_id=$1 AND p.created_at>=date_trunc('month',NOW())`, [campusId]),
        pool.query(`SELECT COALESCE(SUM(c.monto_base_centavos),0) as total FROM charges c JOIN students s ON s.id=c.student_id WHERE s.campus_id=$1 AND c.estado='pendiente'`, [campusId]),
        pool.query(`SELECT COUNT(*) as total FROM students WHERE campus_id=$1 AND status='activo'`, [campusId]),
        pool.query(`SELECT COUNT(*) as cnt FROM bank_transactions WHERE campus_id=$1 AND estado_conciliacion='pendiente'`, [campusId]).catch(()=>({rows:[{cnt:0}]})),
      ]);
      const ingresos = Number((paymentsRows.rows[0] as any)?.total||0);
      const pendiente = Number((chargesRows.rows[0] as any)?.total||0);
      const total = ingresos + pendiente;
      res.json({ resumen: { facturado_mes: ingresos, tasa_cobro: total>0?Math.round(ingresos/total*100):0, mora: total>0?Math.round(pendiente/total*100):0, estudiantes: Number((studentsRows.rows[0] as any)?.total||0), spei_pendientes: Number((speiRows.rows[0] as any)?.cnt||0), cfdi_pendientes: 0, deudores_criticos: 0, cuotas_vencidas: 0, becas_por_vencer: 0 }, tareas_hoy: [], alertas: [] });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // Alias /api/becas-auto/reglas sin campusId
  app.get("/api/becas-auto/reglas", authenticateToken, async (req, res) => {
    if (!hasPermissionForUser((req as any).user, MODULES.SCHOLARSHIPS, ACTIONS.ASSIGN)) {
      return res.status(403).json({ message: "Sin permisos para ver reglas de becas automáticas" });
    }
    try {
      const campusId = (req as any).user?.campus_id;
      const rows = await pool.query(`SELECT * FROM scholarship_auto_rules WHERE campus_id=$1 ORDER BY created_at DESC`, [campusId]);
      res.json(rows.rows);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── ENDPOINTS ADICIONALES FALTANTES ──────────────────────────────────────

  // /api/receivables — alias para cuentas por cobrar (dashboard-caja)
  app.get("/api/receivables", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      const rows = await pool.query(`
        SELECT c.id, c.monto_base_centavos, c.estado, c.fecha_vencimiento,
          CONCAT(s.nombres,' ',s.apellido_paterno) AS estudiante, s.id AS student_id
        FROM charges c
        JOIN students s ON s.id = c.student_id
        WHERE s.campus_id=$1 AND c.estado='pendiente'
        ORDER BY c.fecha_vencimiento ASC LIMIT 500
      `, [campusId]).catch(() => ({ rows: [] }));
      res.json(rows.rows);
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  // /api/crm/prospects — prospectos para dashboard-admisiones
  app.get("/api/crm/prospects", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      const rows = await pool.query(`SELECT * FROM crm_prospects WHERE campus_id=$1 ORDER BY created_at DESC LIMIT 200`, [campusId]).catch(() => ({ rows: [] }));
      res.json(rows.rows);
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  app.post("/api/crm/prospects", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      const { nombre, email, telefono, nivel_interes, nivel_escolar, notas } = req.body;
      const row = await pool.query(`
        INSERT INTO crm_prospects (campus_id, nombre, email, telefono, nivel_interes, nivel_escolar, notas)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
      `, [campusId, nombre, email || null, telefono || null, nivel_interes || 'medio', nivel_escolar || null, notas || null]).catch(() => ({ rows: [req.body] }));
      res.status(201).json((row.rows as any[])[0] || req.body);
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  // /api/admin/configuracion/escuela — setup inicial de escuela
  // CF-20: guard SETTINGS.CONFIGURE; persiste nombre en campuses y el resto en institutional_settings
  // nivel_educativo no tiene columna en ninguna tabla — se recibe pero se ignora sin error
  app.post("/api/admin/configuracion/escuela", authenticateToken, async (req, res) => {
    try {
      const role = (req as any).user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.SETTINGS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permiso para configurar ajustes institucionales" });
      }
      const campusId = (req as any).user?.campus_id;
      const tenantId = (req as any).user?.tenant_id;
      // BUG FIX (2026-08-13): el wizard envía 'nombre_legal' pero el backend solo extraía 'nombre'.
      // Ahora se acepta ambos: 'nombre' tiene prioridad por compatibilidad con código existente;
      // 'nombre_legal' (enviado por el wizard) se usa como fallback.
      // Además se persiste 'nombre_legal' en institutional_settings.nombre_legal.
      const { nombre, nombre_legal, rfc, direccion, telefono, email, logo_url } = req.body;
      // nivel_educativo, timbrado_sat, pac_proveedor, pasarela_pagos omitidos intencionalmente:
      // no existen en campuses ni en institutional_settings.
      // logo_url: sanitizeInput ya no codifica '/' → se guarda directo.

      const nombreEfectivo = nombre ?? nombre_legal ?? null;

      // 1. nombre vive en campuses
      await pool.query(
        `UPDATE campuses SET nombre = COALESCE($2, nombre), updated_at = NOW() WHERE id = $1`,
        [campusId, nombreEfectivo]
      );

      // 2. rfc, direccion, telefono, email, logo_url, nombre_legal viven en institutional_settings.
      // institutional_settings.campus_id solo tiene FK (no UNIQUE) → no se puede usar ON CONFLICT.
      // Patrón: UPDATE primero; si rowCount=0 la fila no existe, INSERT.
      const upd = await pool.query(`
        UPDATE institutional_settings SET
          nombre_legal        = COALESCE($2, nombre_legal),
          rfc                 = COALESCE($3, rfc),
          direccion_fiscal    = COALESCE($4, direccion_fiscal),
          telefono_principal  = COALESCE($5, telefono_principal),
          email_institucional = COALESCE($6, email_institucional),
          logo_url            = COALESCE($7, logo_url),
          updated_at          = NOW()
        WHERE campus_id = $1
      `, [campusId, nombre_legal ?? null, rfc ?? null, direccion ?? null, telefono ?? null, email ?? null, logo_url ?? null]);

      if ((upd.rowCount ?? 0) === 0) {
        await pool.query(`
          INSERT INTO institutional_settings
            (campus_id, tenant_id, nombre_legal, rfc, direccion_fiscal, telefono_principal, email_institucional, logo_url, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        `, [campusId, tenantId, nombre_legal ?? null, rfc ?? null, direccion ?? null, telefono ?? null, email ?? null, logo_url ?? null]);
      }

      res.json({ mensaje: "Configuración de escuela guardada", campus_id: campusId });
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  // /api/admin/configuracion/onboarding-status  — leer estado real desde DB
  // Devuelve: { completado, campus_id, steps }
  // 'steps' es el objeto jsonb onboarding_steps_completados (e.g. { escuela: true, alumnos: true })
  app.get("/api/admin/configuracion/onboarding-status", authenticateToken, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.SETTINGS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para ver el estado de onboarding" });
      }
      const campusId = (req as any).user?.campus_id;
      const row = await pool.query(
        `SELECT onboarding_completado, onboarding_steps_completados FROM campuses WHERE id = $1`,
        [campusId]
      );
      const completado = (row.rows[0] as any)?.onboarding_completado ?? false;
      // onboarding_steps_completados puede llegar como objeto o como string JSON según driver config
      let steps: Record<string, boolean> = {};
      const raw = (row.rows[0] as any)?.onboarding_steps_completados;
      if (raw) {
        steps = typeof raw === "string" ? JSON.parse(raw) : raw;
      }
      res.json({ completado, campus_id: campusId, steps });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // /api/admin/configuracion/completar-onboarding  — persistir en campuses
  app.post("/api/admin/configuracion/completar-onboarding", authenticateToken, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.SETTINGS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para completar el onboarding" });
      }
      const campusId = (req as any).user?.campus_id;
      await pool.query(
        `UPDATE campuses SET onboarding_completado = true, updated_at = NOW() WHERE id = $1`,
        [campusId]
      );
      res.json({ completado: true, campus_id: campusId });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // /api/admin/configuracion/onboarding-step/:stepId  — marcar un paso como confirmado
  // PATCH — idempotente: llamar dos veces al mismo stepId es seguro (jsonb merge).
  // stepId válidos: escuela | alumnos | familias | becas | adeudos | activar
  // Responde: { step_id, steps }  donde steps es el objeto completo actualizado.
  const VALID_ONBOARDING_STEPS = new Set(["escuela", "alumnos", "familias", "becas", "adeudos", "validar", "simular", "activar"]);

  app.patch("/api/admin/configuracion/onboarding-step/:stepId", authenticateToken, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.SETTINGS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para actualizar el progreso de onboarding" });
      }
      const { stepId } = req.params;
      if (!VALID_ONBOARDING_STEPS.has(stepId)) {
        return res.status(400).json({
          message: `stepId inválido: '${stepId}'. Válidos: ${[...VALID_ONBOARDING_STEPS].join(", ")}`,
        });
      }
      const campusId = (req as any).user?.campus_id;

      // jsonb merge: || no sobrescribe claves existentes distintas → operación segura e idempotente
      const upd = await pool.query(
        `UPDATE campuses
            SET onboarding_steps_completados = onboarding_steps_completados || jsonb_build_object($2::text, true),
                updated_at = NOW()
          WHERE id = $1
          RETURNING onboarding_steps_completados`,
        [campusId, stepId]
      );

      if (upd.rowCount === 0) {
        return res.status(404).json({ message: "Campus no encontrado" });
      }

      const raw = (upd.rows[0] as any).onboarding_steps_completados;
      const steps: Record<string, boolean> = typeof raw === "string" ? JSON.parse(raw) : raw;

      res.json({ step_id: stepId, steps });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── Validación de integridad de datos para el wizard de onboarding ──────────
  // GET /api/admin/configuracion/validacion-onboarding
  // Ejecuta 4 checks de integridad sobre el campus del JWT.
  // Responde: { errores: string[], warnings: string[], ok: boolean }
  // errores → bloqueantes (ok=false); warnings → informativos (ok puede ser true).
  app.get("/api/admin/configuracion/validacion-onboarding", authenticateToken, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.SETTINGS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para ver la validación de onboarding" });
      }
      const campusId = (req as any).user?.campus_id;

      const errores: string[] = [];
      const warnings: string[] = [];

      // 1. Alumnos activos sin familia asignada (error bloqueante — no se les puede cobrar)
      const alumnosSinFamilia = await pool.query<{ id: number; nombre_completo: string }>(
        `SELECT s.id, s.nombre_completo
         FROM students s
         LEFT JOIN family_students fs ON fs.student_id = s.id
         WHERE s.campus_id = $1
           AND COALESCE(s.status, 'activo') = 'activo'
           AND fs.student_id IS NULL`,
        [campusId],
      );
      if ((alumnosSinFamilia.rowCount ?? 0) > 0) {
        const n = alumnosSinFamilia.rowCount!;
        const muestra = alumnosSinFamilia.rows.slice(0, 3).map((r) => r.nombre_completo).join(", ");
        errores.push(`${n} alumno${n !== 1 ? "s" : ""} sin familia asignada: ${muestra}${n > 3 ? "…" : ""}`);
      }

      // 2. Familias de este campus sin correo_institucional_familiar en ningún tutor (warning)
      // Cadena: family_students → student_guardian → guardians (guardians no tiene family_id directamente)
      const familiasSinCorreo = await pool.query<{ family_id: number }>(
        `SELECT DISTINCT fs.family_id
         FROM family_students fs
         JOIN students s ON s.id = fs.student_id
         WHERE s.campus_id = $1
           AND NOT EXISTS (
             SELECT 1
             FROM family_students fs2
             JOIN student_guardian sg ON sg.student_id = fs2.student_id
             JOIN guardians g ON g.id = sg.guardian_id
             WHERE fs2.family_id = fs.family_id
               AND g.correo_institucional_familiar IS NOT NULL
               AND g.correo_institucional_familiar <> ''
           )`,
        [campusId],
      );
      if ((familiasSinCorreo.rowCount ?? 0) > 0) {
        const n = familiasSinCorreo.rowCount!;
        warnings.push(`${n} familia${n !== 1 ? "s" : ""} sin correo de tutor — no recibirán notificaciones automáticas`);
      }

      // 3. Becas asignadas a alumnos de OTRO campus del mismo tenant (error)
      const becasHuerfanas = await pool.query<{ id: number }>(
        `SELECT sch.id
         FROM scholarships sch
         JOIN students s ON s.id = sch.student_id
         JOIN campuses c ON c.id = s.campus_id
         WHERE c.tenant_id = (SELECT tenant_id FROM campuses WHERE id = $1)
           AND s.campus_id <> $1`,
        [campusId],
      );
      if ((becasHuerfanas.rowCount ?? 0) > 0) {
        const n = becasHuerfanas.rowCount!;
        errores.push(`${n} beca${n !== 1 ? "s" : ""} asignada${n !== 1 ? "s" : ""} a alumnos que no pertenecen a este campus`);
      }

      // 4. Adeudos migrados con monto_base_centavos = 0 (error — registro inválido)
      const adeudosCero = await pool.query<{ id: number }>(
        `SELECT c.id
         FROM charges c
         JOIN students s ON s.id = c.student_id
         WHERE s.campus_id = $1
           AND c.es_adeudo_migrado = TRUE
           AND c.monto_base_centavos = 0`,
        [campusId],
      );
      if ((adeudosCero.rowCount ?? 0) > 0) {
        const n = adeudosCero.rowCount!;
        errores.push(`${n} adeudo${n !== 1 ? "s" : ""} migrado${n !== 1 ? "s" : ""} con monto $0.00 — deben corregirse antes de activar`);
      }

      res.json({ errores, warnings, ok: errores.length === 0 });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── Simulación de cargos proyectados (lectura pura, sin escritura) ───────────
  // GET /api/admin/configuracion/simulacion-cargos
  // Cruza students activos × concepts del campus.
  // Responde: { total_alumnos, total_cargos_proyectados_centavos, sin_conceptos, desglose_por_concepto }
  app.get("/api/admin/configuracion/simulacion-cargos", authenticateToken, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.SETTINGS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para ver la simulación de cargos" });
      }
      const campusId = (req as any).user?.campus_id;

      const [alumnosRow, conceptosRow] = await Promise.all([
        pool.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM students WHERE campus_id = $1 AND COALESCE(status, 'activo') = 'activo'`,
          [campusId],
        ),
        pool.query<{ id: number; nombre: string; tipo: string; periodicidad: string; monto_centavos: string; iva: boolean }>(
          `SELECT id, nombre, tipo, periodicidad, monto_centavos, iva
           FROM concepts
           WHERE campus_id = $1
           ORDER BY nombre`,
          [campusId],
        ),
      ]);

      const total_alumnos = Number(alumnosRow.rows[0].count);

      const desglose_por_concepto = conceptosRow.rows.map((c) => {
        const montoBase = Number(c.monto_centavos);
        const montoConIva = c.iva ? Math.round(montoBase * 1.16) : montoBase;
        const subtotal = montoConIva * total_alumnos;
        return {
          concepto_id: c.id,
          nombre: c.nombre,
          tipo: c.tipo,
          periodicidad: c.periodicidad,
          monto_unitario_centavos: montoConIva,
          cargos_proyectados: total_alumnos,
          subtotal_centavos: subtotal,
        };
      });

      const total_cargos_proyectados_centavos = desglose_por_concepto.reduce(
        (sum, c) => sum + c.subtotal_centavos, 0,
      );

      // sin_conceptos = true cuando no hay conceptos configurados (y hay alumnos)
      // → el frontend muestra aviso especial con enlace a Ajustes Institucionales
      const sin_conceptos = (conceptosRow.rowCount ?? 0) === 0;

      res.json({
        total_alumnos,
        total_cargos_proyectados_centavos,
        sin_conceptos,
        desglose_por_concepto,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // /api/caja — alias resumen de caja (caja-conciliacion.tsx invalida esta key)
  app.get("/api/caja", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      const [pagosRows, txRows] = await Promise.all([
        pool.query(`SELECT COUNT(*) as cnt, COALESCE(SUM(p.monto_centavos),0) as total FROM payments p JOIN charges c ON c.id=p.charge_id JOIN students s ON s.id=c.student_id WHERE s.campus_id=$1 AND DATE(p.created_at)=CURRENT_DATE`, [campusId]).catch(()=>({rows:[{cnt:0,total:0}]})),
        pool.query(`SELECT COUNT(*) as cnt FROM bank_transactions WHERE campus_id=$1 AND estado_conciliacion='pendiente'`, [campusId]).catch(()=>({rows:[{cnt:0}]})),
      ]);
      res.json({ pagos_hoy: Number((pagosRows.rows[0] as any)?.cnt||0), total_hoy: Number((pagosRows.rows[0] as any)?.total||0), spei_pendientes: Number((txRows.rows[0] as any)?.cnt||0) });
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  // /api/admin/charges — alias para cargos administrativos
  app.get("/api/admin/charges", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      const rows = await pool.query(`SELECT c.*, CONCAT(s.nombres,' ',s.apellido_paterno) AS estudiante FROM charges c JOIN students s ON s.id=c.student_id WHERE s.campus_id=$1 ORDER BY c.created_at DESC LIMIT 500`, [campusId]).catch(()=>({rows:[]}));
      res.json(rows.rows);
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  // /api/fiscal/estadisticas-sat — métricas SAT para fiscal-contable
  app.get("/api/fiscal/estadisticas-sat", authenticateToken, async (req, res) => {
    if (!hasPermissionForUser((req as any).user, MODULES.FISCAL, ACTIONS.READ)) {
      return res.status(403).json({ message: "No tienes permiso para ver estadísticas fiscales SAT" });
    }
    try {
      const campusId = (req as any).user?.campus_id;
      const rows = await pool.query(`SELECT COUNT(*) as total_cfdis, COUNT(CASE WHEN i.estado='emitido' THEN 1 END) as emitidos, COUNT(CASE WHEN i.estado='cancelado' THEN 1 END) as cancelados FROM invoices i JOIN payments p ON p.id=i.payment_id JOIN charges c ON c.id=p.charge_id JOIN students s ON s.id=c.student_id WHERE s.campus_id=$1`, [campusId]).catch(()=>({rows:[{total_cfdis:0,emitidos:0,cancelados:0}]}));
      res.json({ total_cfdis: Number((rows.rows[0] as any)?.total_cfdis||0), emitidos: Number((rows.rows[0] as any)?.emitidos||0), cancelados: Number((rows.rows[0] as any)?.cancelados||0), vigentes: Number((rows.rows[0] as any)?.emitidos||0), pac: "Facturama", estado_conexion: "activo" });
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  // ── FAMILIAS ──────────────────────────────────────────────────────────────

  /**
   * GET /api/families/:campusId
   * Lista las familias del campus con su balance consolidado.
   * Exclusivo para usuarios de tipo 'user' (staff/admin). Los guardianes no tienen acceso.
   */
  app.get("/api/families/:campusId", authenticateToken, async (req, res) => {
    try {
      const { campusId: campusIdStr } = req.params;
      const campusId = Number(campusIdStr);
      if (isNaN(campusId)) return res.status(400).json({ message: "campusId inválido" });

      const user = (req as any).user;
      // Bloquear guardianes: type='guardian' no debe acceder a datos financieros de otras familias
      if (user?.type === 'guardian') {
        return res.status(403).json({ message: "Acceso denegado: solo personal administrativo puede ver la lista de familias" });
      }
      // Guard de rol: requiere FAMILIES.READ (mismo módulo que admin/students/guardians)
      if (!hasPermissionForUser(user, MODULES.FAMILIES, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver familias" });
      }
      const tenantId = user?.tenant_id;
      if (!tenantId) return res.status(403).json({ message: "Sin contexto de tenant" });

      // Validar que el campus pertenece al tenant del admin
      const campus = await storage.getCampusScoped(campusId, tenantId);
      if (!campus) return res.status(403).json({ message: "Campus no autorizado para este tenant" });

      // Obtener familias del campus
      const familyList = await storage.getFamiliesByTenant(tenantId, campusId);

      // Calcular balance para cada familia en paralelo
      const withBalance = await Promise.all(
        familyList.map(async (f) => {
          const balance = await storage.getFamilyBalance(f.id, tenantId);
          return { ...f, ...balance };
        })
      );

      // Añadir alumnos vinculados
      const withStudents = await Promise.all(
        withBalance.map(async (f) => {
          const rows = await pool.query(
            `SELECT s.id, s.nombre_completo, s.grado, s.grupo
             FROM family_students fs
             JOIN students s ON s.id = fs.student_id
             WHERE fs.family_id = $1`,
            [f.id]
          );
          const guardians = await pool.query(
            `SELECT DISTINCT g.id, g.tipo_guardian, g.nombres, g.apellido_paterno,
                    g.apellido_materno, g.nombre_completo, g.email,
                    g.correo_institucional_familiar, g.celular, g.calle,
                    g.numero_exterior, g.numero_interior, g.colonia,
                    g.codigo_postal, g.municipio, g.estado,
                    g.contacto_emergencia_nombre, g.contacto_emergencia_telefono,
                    g.contacto_emergencia_relacion, sg.es_responsable_pago,
                    sg.porcentaje_responsabilidad
               FROM family_students fs
               JOIN student_guardian sg ON sg.student_id = fs.student_id
               JOIN guardians g ON g.id = sg.guardian_id
              WHERE fs.family_id = $1
              ORDER BY g.id`,
            [f.id],
          );
          return { ...f, estudiantes: rows.rows, tutores: guardians.rows };
        })
      );

      res.json(withStudents);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  /**
   * GET /api/family/:id/balance
   * Retorna el balance detallado de una familia.
   * id = family id (no campus id).
   * Exclusivo para usuarios de tipo 'user' (staff/admin).
   */
  app.get("/api/family/:id/balance", authenticateToken, async (req, res) => {
    try {
      const familyId = Number(req.params.id);
      if (isNaN(familyId)) return res.status(400).json({ message: "id inválido" });

      const user = (req as any).user;
      if (user?.type === 'guardian') {
        return res.status(403).json({ message: "Acceso denegado: solo personal administrativo puede consultar balances de familia" });
      }
      // Guard de rol: requiere FAMILIES.READ
      if (!hasPermissionForUser(user, MODULES.FAMILIES, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para consultar balances de familia" });
      }
      const tenantId = user?.tenant_id;
      if (!tenantId) return res.status(403).json({ message: "Sin contexto de tenant" });

      const family = await storage.getFamilyScoped(familyId, tenantId);
      if (!family) return res.status(404).json({ message: "Familia no encontrada" });

      const balance = await storage.getFamilyBalance(familyId, tenantId);

      // Detalle de cargos y pagos aplicados
      const chargesDetail = await pool.query(
        `SELECT c.id, COALESCE(con.nombre, 'Sin concepto') AS concepto_nombre,
                c.monto_base_centavos, c.estado,
                s.nombre_completo AS alumno,
                COALESCE(SUM(pa.amount_centavos), 0) AS pagado_centavos
         FROM family_students fs
         JOIN students s ON s.id = fs.student_id
         JOIN charges c ON c.student_id = fs.student_id
         LEFT JOIN concepts con ON con.id = c.concept_id
         LEFT JOIN payment_applications pa ON pa.charge_id = c.id
         WHERE fs.family_id = $1
         GROUP BY c.id, con.nombre, c.monto_base_centavos, c.estado, s.nombre_completo
         ORDER BY c.id`,
        [familyId]
      );

      res.json({
        familia: {
          id: family.id,
          nombre: family.nombre,
          campus_id: family.campus_id,
          guardian_id_principal: family.guardian_id_principal,
        },
        balance,
        cargos: chargesDetail.rows,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  /**
   * POST /api/payment-events
   * Recibe eventos de pasarela de pagos de forma idempotente.
   * Retorna 200 si ya existía (duplicado silencioso), 201 si nuevo.
   * Exclusivo para personal administrativo. En producción también debe validarse
   * la firma HMAC del proveedor antes de llegar aquí.
   */
  app.post("/api/payment-events", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      if (user?.type === 'guardian') {
        return res.status(403).json({ message: "Acceso denegado: solo personal administrativo puede registrar eventos de pago" });
      }
      const tenantId = user?.tenant_id;
      if (!tenantId) return res.status(403).json({ message: "Sin contexto de tenant" });

      const { provider, provider_event_id, payload } = req.body;
      if (!provider || !provider_event_id) {
        return res.status(400).json({ message: "provider y provider_event_id son requeridos" });
      }

      const { created, event } = await storage.recordPaymentEvent({
        tenant_id: tenantId,
        provider: String(provider),
        provider_event_id: String(provider_event_id),
        payload: payload ? JSON.stringify(payload) : null,
        status: "received",
      });

      res.status(created ? 201 : 200).json({
        created,
        duplicate: !created,
        event_id: event.id,
        status: event.status,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── AUDIT LOG ────────────────────────────────────────────────────────────────

  /**
   * GET /api/audit-log
   * Devuelve el log de auditoría filtrable por fecha, acción, tipo de entidad y búsqueda.
   * Exclusivo para usuarios de tipo 'user' (staff/admin). Los guardianes no tienen acceso.
   *
   * Query params:
   *   limit  (default 50, max 200)
   *   offset (default 0)
   *   desde  (fecha YYYY-MM-DD)
   *   hasta  (fecha YYYY-MM-DD)
   *   action (ej. 'charge.status_changed')
   *   entityType
   *   userId
   *   search
   */
  app.get("/api/audit-log", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      if (user?.type === "guardian") {
        return res.status(403).json({ message: "Acceso denegado: solo personal administrativo puede ver el historial de auditoría" });
      }
      const tenantId = user?.tenant_id;
      if (!tenantId) return res.status(403).json({ message: "Sin contexto de tenant" });

      // El historial de auditoría expone eventos de seguridad, cambios de configuración
      // y operaciones financieras de todos los módulos. Solo roles con SECURITY.READ
      // pueden consultarlo. Roles excluidos: auxiliar_contable, asistente, admisiones.
      const role = user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.SECURITY, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver el historial de auditoría" });
      }

      const { limit, offset, desde, hasta, action, entityType, userId, search } = req.query as Record<string, string | undefined>;

      const result = await storage.getAuditLog(tenantId, {
        limit:      limit  ? Number(limit)  : undefined,
        offset:     offset ? Number(offset) : undefined,
        desde,
        hasta,
        action,
        entityType,
        userId:     userId ? Number(userId) : undefined,
        search,
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── GET /api/search?q= ────────────────────────────────────────────────────
  // Buscador universal: alumnos, tutores, pagos y cargos.
  //
  // Guard de rol: solo authenticateToken — búsqueda es funcionalidad UX esencial
  // para todos los roles; el aislamiento real lo provee el filtro campus_id/tenant_id,
  // no la restricción de acceso al endpoint.
  //
  // Aislamiento cross-campus:
  //   - administrador_general y super_admin: ven todos los campuses del tenant
  //     (necesitan buscar en toda la institución).
  //   - Todos los demás roles: resultados limitados a su propio campus_id.
  //
  // Bug corregido: antes las 4 queries filtraban solo por tenant_id, permitiendo
  // que administrador_campus de Campus A viera alumnos/tutores/pagos de Campus B
  // dentro del mismo tenant.
  app.get("/api/search", authenticateToken, async (req: any, res) => {
    try {
      const q        = ((req.query.q as string) || "").trim();
      const tenantId = req.user?.tenant_id;
      const campusId = req.user?.campus_id;
      const role     = req.user?.role;

      if (!q || q.length < 3) return res.json({ alumnos: [], tutores: [], pagos: [], cargos: [] });

      const like = `%${q}%`;

      // Roles con visibilidad tenant-wide (cross-campus intencional)
      const isTenantWide = role === 'super_admin' || role === 'administrador_general';

      // 4 búsquedas en paralelo
      const [studRows, guardRows, payRows, chargeRows] = await Promise.all([

        // Alumnos: por nombre completo o matrícula
        pool.query(
          isTenantWide
            ? `SELECT s.id,
                      CONCAT(s.nombres, ' ', s.apellido_paterno, COALESCE(' ' || s.apellido_materno, '')) AS label,
                      s.grado         AS sublabel,
                      s.id_referencia AS matricula,
                      s.status
               FROM   students s
               WHERE  s.tenant_id = $1
                 AND  (s.nombre_completo ILIKE $2
                   OR CONCAT(s.nombres, ' ', s.apellido_paterno) ILIKE $2
                   OR s.id_referencia ILIKE $2
                   OR s.nombres ILIKE $2)
               ORDER  BY s.apellido_paterno, s.nombres LIMIT 10`
            : `SELECT s.id,
                      CONCAT(s.nombres, ' ', s.apellido_paterno, COALESCE(' ' || s.apellido_materno, '')) AS label,
                      s.grado         AS sublabel,
                      s.id_referencia AS matricula,
                      s.status
               FROM   students s
               WHERE  s.tenant_id = $1
                 AND  s.campus_id = $3
                 AND  (s.nombre_completo ILIKE $2
                   OR CONCAT(s.nombres, ' ', s.apellido_paterno) ILIKE $2
                   OR s.id_referencia ILIKE $2
                   OR s.nombres ILIKE $2)
               ORDER  BY s.apellido_paterno, s.nombres LIMIT 10`,
          isTenantWide ? [tenantId, like] : [tenantId, like, campusId],
        ),

        // Tutores: por nombre o correo
        pool.query(
          isTenantWide
            ? `SELECT g.id,
                      CONCAT(g.nombres, ' ', g.apellido_paterno, COALESCE(' ' || g.apellido_materno, '')) AS label,
                      g.correo_institucional_familiar AS sublabel
               FROM   guardians g
               WHERE  g.tenant_id = $1
                 AND  (g.nombre_completo ILIKE $2
                   OR CONCAT(g.nombres, ' ', g.apellido_paterno) ILIKE $2
                   OR g.correo_institucional_familiar ILIKE $2
                   OR g.nombres ILIKE $2)
               ORDER  BY g.apellido_paterno, g.nombres LIMIT 10`
            : `SELECT g.id,
                      CONCAT(g.nombres, ' ', g.apellido_paterno, COALESCE(' ' || g.apellido_materno, '')) AS label,
                      g.correo_institucional_familiar AS sublabel
               FROM   guardians g
               WHERE  g.tenant_id = $1
                 AND  g.campus_id = $3
                 AND  (g.nombre_completo ILIKE $2
                   OR CONCAT(g.nombres, ' ', g.apellido_paterno) ILIKE $2
                   OR g.correo_institucional_familiar ILIKE $2
                   OR g.nombres ILIKE $2)
               ORDER  BY g.apellido_paterno, g.nombres LIMIT 10`,
          isTenantWide ? [tenantId, like] : [tenantId, like, campusId],
        ),

        // Pagos: por referencia de pasarela (join vía charges→students→campus)
        pool.query(
          isTenantWide
            ? `SELECT p.id,
                      p.referencia_pasarela AS label,
                      TO_CHAR(p.fecha_pago, 'DD/MM/YYYY') || ' — $' ||
                        TO_CHAR(p.monto_centavos / 100.0, 'FM999,999.00') AS sublabel,
                      p.estado, c.student_id
               FROM   payments p
               JOIN   charges  c ON c.id = p.charge_id
               JOIN   students s ON s.id = c.student_id
               WHERE  s.tenant_id = $1
                 AND  p.referencia_pasarela ILIKE $2
               ORDER  BY p.fecha_pago DESC LIMIT 10`
            : `SELECT p.id,
                      p.referencia_pasarela AS label,
                      TO_CHAR(p.fecha_pago, 'DD/MM/YYYY') || ' — $' ||
                        TO_CHAR(p.monto_centavos / 100.0, 'FM999,999.00') AS sublabel,
                      p.estado, c.student_id
               FROM   payments p
               JOIN   charges  c ON c.id = p.charge_id
               JOIN   students s ON s.id = c.student_id
               WHERE  s.tenant_id = $1
                 AND  s.campus_id = $3
                 AND  p.referencia_pasarela ILIKE $2
               ORDER  BY p.fecha_pago DESC LIMIT 10`,
          isTenantWide ? [tenantId, like] : [tenantId, like, campusId],
        ),

        // Cargos: por id numérico o nombre del concepto
        pool.query(
          isTenantWide
            ? `SELECT c.id,
                      CONCAT('#', c.id, ' — ', COALESCE(con.nombre, 'Cargo')) AS label,
                      CONCAT(s.nombres, ' ', s.apellido_paterno, ' — $',
                        TO_CHAR(c.monto_base_centavos / 100.0, 'FM999,999.00')) AS sublabel,
                      c.estado, c.student_id
               FROM   charges  c
               JOIN   students s   ON s.id  = c.student_id
               LEFT   JOIN concepts con ON con.id = c.concept_id
               WHERE  s.tenant_id = $1
                 AND  (CAST(c.id AS TEXT) = $3 OR con.nombre ILIKE $2)
               ORDER  BY c.fecha_vencimiento DESC LIMIT 10`
            : `SELECT c.id,
                      CONCAT('#', c.id, ' — ', COALESCE(con.nombre, 'Cargo')) AS label,
                      CONCAT(s.nombres, ' ', s.apellido_paterno, ' — $',
                        TO_CHAR(c.monto_base_centavos / 100.0, 'FM999,999.00')) AS sublabel,
                      c.estado, c.student_id
               FROM   charges  c
               JOIN   students s   ON s.id  = c.student_id
               LEFT   JOIN concepts con ON con.id = c.concept_id
               WHERE  s.tenant_id = $1
                 AND  s.campus_id = $3
                 AND  (CAST(c.id AS TEXT) = $4 OR con.nombre ILIKE $2)
               ORDER  BY c.fecha_vencimiento DESC LIMIT 10`,
          isTenantWide ? [tenantId, like, q] : [tenantId, like, campusId, q],
        ),
      ]);

      res.json({
        alumnos: studRows.rows,
        tutores: guardRows.rows,
        pagos:   payRows.rows,
        cargos:  chargeRows.rows,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CATÁLOGO DE PRODUCTOS  (CF-22)
  // Tabla: products — precios diferenciados por nivel académico + campos SAT
  // Guard: MODULES.PRODUCTS + ACTIONS.READ (GET) / ACTIONS.CONFIGURE (resto)
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/products  — lista del campus
  app.get("/api/products", authenticateToken, async (req: any, res) => {
    try {
      const { role, campus_id, tenant_id } = req.user ?? {};
      if (!hasPermissionForUser((req as any).user, MODULES.PRODUCTS, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para ver el catálogo de productos" });
      }
      const rows = await pool.query(
        `SELECT id, codigo, nombre, descripcion, categoria, unidad_medida, clave_sat, activo,
                precio_kinder, precio_primaria, precio_secundaria, precio_bachillerato,
                created_at, updated_at
           FROM products
          WHERE campus_id = $1 AND tenant_id = $2
          ORDER BY categoria, nombre`,
        [campus_id, tenant_id],
      );
      res.json(rows.rows);
    } catch (e: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // POST /api/products  — crear producto
  app.post("/api/products", authenticateToken, async (req: any, res) => {
    try {
      const { role, campus_id, tenant_id } = req.user ?? {};
      if (!hasPermissionForUser((req as any).user, MODULES.PRODUCTS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para crear productos" });
      }
      const {
        codigo, nombre, descripcion, categoria, unidad_medida, clave_sat, activo,
        precio_kinder = 0, precio_primaria = 0, precio_secundaria = 0, precio_bachillerato = 0,
      } = req.body ?? {};
      if (!codigo || !nombre || !categoria) {
        return res.status(400).json({ message: "codigo, nombre y categoria son obligatorios" });
      }
      const CATEGORIAS_VALIDAS = ["COLEGIATURAS","INSCRIPCIONES","REINSCRIPCIONES","SEGURO_ESCOLAR","LIBROS","OTROS"];
      if (!CATEGORIAS_VALIDAS.includes(categoria)) {
        return res.status(400).json({ message: `categoria debe ser una de: ${CATEGORIAS_VALIDAS.join(", ")}` });
      }
      const r = await pool.query(
        `INSERT INTO products
           (campus_id, tenant_id, codigo, nombre, descripcion, categoria, unidad_medida, clave_sat, activo,
            precio_kinder, precio_primaria, precio_secundaria, precio_bachillerato)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING *`,
        [campus_id, tenant_id, codigo, nombre, descripcion ?? null, categoria,
         unidad_medida ?? "SERVICIO", clave_sat ?? null, activo ?? true,
         precio_kinder, precio_primaria, precio_secundaria, precio_bachillerato],
      );
      res.status(201).json(r.rows[0]);
    } catch (e: any) {
      if (e.code === "23505") return res.status(409).json({ message: "Ya existe un producto con ese código en este campus" });
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // PUT /api/products/:id  — edición completa
  app.put("/api/products/:id", authenticateToken, async (req: any, res) => {
    try {
      const { role, campus_id, tenant_id } = req.user ?? {};
      if (!hasPermissionForUser((req as any).user, MODULES.PRODUCTS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para editar productos" });
      }
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ message: "id inválido" });

      const {
        codigo, nombre, descripcion, categoria, unidad_medida, clave_sat, activo,
        precio_kinder, precio_primaria, precio_secundaria, precio_bachillerato,
      } = req.body ?? {};

      // Verify ownership
      const exists = await pool.query(
        `SELECT id FROM products WHERE id=$1 AND campus_id=$2 AND tenant_id=$3`,
        [id, campus_id, tenant_id],
      );
      if (!exists.rows.length) return res.status(404).json({ message: "Producto no encontrado" });

      if (categoria) {
        const CATEGORIAS_VALIDAS = ["COLEGIATURAS","INSCRIPCIONES","REINSCRIPCIONES","SEGURO_ESCOLAR","LIBROS","OTROS"];
        if (!CATEGORIAS_VALIDAS.includes(categoria)) {
          return res.status(400).json({ message: `categoria debe ser una de: ${CATEGORIAS_VALIDAS.join(", ")}` });
        }
      }

      const r = await pool.query(
        `UPDATE products SET
           codigo              = COALESCE($4,  codigo),
           nombre              = COALESCE($5,  nombre),
           descripcion         = COALESCE($6,  descripcion),
           categoria           = COALESCE($7,  categoria),
           unidad_medida       = COALESCE($8,  unidad_medida),
           clave_sat           = COALESCE($9,  clave_sat),
           activo              = COALESCE($10, activo),
           precio_kinder       = COALESCE($11, precio_kinder),
           precio_primaria     = COALESCE($12, precio_primaria),
           precio_secundaria   = COALESCE($13, precio_secundaria),
           precio_bachillerato = COALESCE($14, precio_bachillerato),
           updated_at          = NOW()
         WHERE id=$1 AND campus_id=$2 AND tenant_id=$3
         RETURNING *`,
        [id, campus_id, tenant_id,
         codigo ?? null, nombre ?? null, descripcion ?? null, categoria ?? null,
         unidad_medida ?? null, clave_sat ?? null,
         activo !== undefined ? activo : null,
         precio_kinder !== undefined ? precio_kinder : null,
         precio_primaria !== undefined ? precio_primaria : null,
         precio_secundaria !== undefined ? precio_secundaria : null,
         precio_bachillerato !== undefined ? precio_bachillerato : null],
      );
      res.json(r.rows[0]);
    } catch (e: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // PATCH /api/products/:id  — toggle activo (y cualquier campo parcial)
  app.patch("/api/products/:id", authenticateToken, async (req: any, res) => {
    try {
      const { role, campus_id, tenant_id } = req.user ?? {};
      if (!hasPermissionForUser((req as any).user, MODULES.PRODUCTS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para modificar productos" });
      }
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ message: "id inválido" });
      const exists = await pool.query(
        `SELECT id FROM products WHERE id=$1 AND campus_id=$2 AND tenant_id=$3`,
        [id, campus_id, tenant_id],
      );
      if (!exists.rows.length) return res.status(404).json({ message: "Producto no encontrado" });

      const { activo } = req.body ?? {};
      const r = await pool.query(
        `UPDATE products SET activo = $4, updated_at = NOW()
          WHERE id=$1 AND campus_id=$2 AND tenant_id=$3 RETURNING *`,
        [id, campus_id, tenant_id, activo],
      );
      res.json(r.rows[0]);
    } catch (e: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // DELETE /api/products/:id  — eliminación permanente
  app.delete("/api/products/:id", authenticateToken, async (req: any, res) => {
    try {
      const { role, campus_id, tenant_id } = req.user ?? {};
      if (!hasPermissionForUser((req as any).user, MODULES.PRODUCTS, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para eliminar productos" });
      }
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ message: "id inválido" });
      const r = await pool.query(
        `DELETE FROM products WHERE id=$1 AND campus_id=$2 AND tenant_id=$3 RETURNING id`,
        [id, campus_id, tenant_id],
      );
      if (!r.rows.length) return res.status(404).json({ message: "Producto no encontrado" });
      res.json({ deleted: true, id });
    } catch (e: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // /api/admin/dashboard — alias sin campusId (lee del JWT)
  app.get("/api/admin/dashboard", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      const [studentsRows, paymentsRows, chargesRows] = await Promise.all([
        pool.query(`SELECT COUNT(*) as total FROM students WHERE campus_id=$1`, [campusId]).catch(() => ({ rows: [{ total: 0 }] })),
        pool.query(`SELECT COALESCE(SUM(p.monto_centavos),0) as total FROM payments p JOIN charges c ON c.id=p.charge_id JOIN students s ON s.id=c.student_id WHERE s.campus_id=$1`, [campusId]).catch(() => ({ rows: [{ total: 0 }] })),
        pool.query(`SELECT COALESCE(SUM(c.monto_base_centavos),0) as pendiente FROM charges c JOIN students s ON s.id=c.student_id WHERE s.campus_id=$1 AND c.estado='pendiente'`, [campusId]).catch(() => ({ rows: [{ pendiente: 0 }] })),
      ]);
      res.json({
        total_students: Number((studentsRows.rows[0] as any)?.total || 0),
        total_collected: Number((paymentsRows.rows[0] as any)?.total || 0),
        total_pending: Number((chargesRows.rows[0] as any)?.pendiente || 0),
      });
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

}
