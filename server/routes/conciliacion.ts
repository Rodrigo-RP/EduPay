import type { Express } from "express";
import { pool, db } from "../db";
import { enqueueAuditLog } from "../audit-retry";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";
import { authenticateToken, requireAuth, checkCampusTenant } from "./shared";
import { payments, charges, students, invoices, guardians } from "@shared/schema";

export function registerConciliacionRoutes(app: Express): void {
  // ── 1. CENTRO DE COMANDOS ─────────────────────────────────────────────────
  app.get("/api/dashboard/comandos/:campusId", authenticateToken, async (req: any, res) => {
    try {
      const campusId = parseInt(req.params.campusId) || req.user?.campus_id;
      if (!await checkCampusTenant(campusId, req.user?.tenant_id, res)) return;
      const [studentsRows, paymentsRows, chargesRows] = await Promise.all([
        pool.query(`SELECT COUNT(*) as total FROM students WHERE campus_id = $1 AND status = 'activo'`, [campusId]).catch(() => ({ rows: [{ total: 0 }] })),
        pool.query(`SELECT COALESCE(SUM(p.monto_centavos),0) as total FROM payments p JOIN charges c ON c.id=p.charge_id JOIN students s ON s.id=c.student_id WHERE s.campus_id=$1 AND p.created_at>=date_trunc('month',NOW())`, [campusId]).catch(() => ({ rows: [{ total: 0 }] })),
        pool.query(`SELECT COALESCE(SUM(c.monto_base_centavos),0) as total, COUNT(*) as cnt FROM charges c JOIN students s ON s.id=c.student_id WHERE s.campus_id=$1 AND c.estado='pendiente'`, [campusId]).catch(() => ({ rows: [{ total: 0, cnt: 0 }] })),
      ]);
      const ingresosRaw = Number((paymentsRows.rows[0] as any)?.total || 0);
      const pendienteRaw = Number((chargesRows.rows[0] as any)?.total || 0);
      const totalRaw = ingresosRaw + pendienteRaw;
      const tasaCobro = totalRaw > 0 ? Math.round((ingresosRaw / totalRaw) * 100) : 0;
      const mora = totalRaw > 0 ? Math.round((pendienteRaw / totalRaw) * 100) : 0;

      const [speiRows, cfdiRows] = await Promise.all([
        pool.query(`SELECT COUNT(*) as cnt FROM bank_transactions WHERE campus_id = $1 AND estado_conciliacion = 'pendiente'`, [campusId]).catch(() => ({ rows: [{cnt: 0}] })),
        pool.query(`SELECT COUNT(*) as cnt FROM payments p JOIN charges c ON c.id=p.charge_id JOIN students s ON s.id=c.student_id LEFT JOIN invoices i ON i.payment_id=p.id WHERE s.campus_id=$1 AND i.id IS NULL`, [campusId]).catch(() => ({ rows: [{cnt: 0}] })),
      ]);

      res.json({
        resumen: {
          facturado_mes: ingresosRaw,
          tasa_cobro: tasaCobro,
          mora,
          estudiantes: Number((studentsRows.rows[0] as any)?.total || 0),
          spei_pendientes: Number((speiRows.rows[0] as any)?.cnt || 0),
          cfdi_pendientes: Number((cfdiRows.rows[0] as any)?.cnt || 0),
          deudores_criticos: 0,
          cuotas_vencidas: 0,
          becas_por_vencer: 0,
        },
        tareas_hoy: [],
        alertas: [],
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── 2. SEMÁFORO DE RIESGO ─────────────────────────────────────────────────
  app.get("/api/riesgo/semaforo/:campusId", authenticateToken, async (req: any, res) => {
    try {
      const campusId = parseInt(req.params.campusId) || req.user?.campus_id;
      if (!await checkCampusTenant(campusId, req.user?.tenant_id, res)) return;
      const rows = await pool.query(`
        SELECT
          s.id AS student_id,
          CONCAT(s.nombres, ' ', s.apellido_paterno) AS estudiante,
          CONCAT(g.nombres, ' ', g.apellido_paterno) AS nombre_familia,
          s.nivel_escolar AS nivel,
          COALESCE(SUM(CASE WHEN c.estado='pendiente' THEN c.monto_base_centavos ELSE 0 END), 0) AS adeudo_centavos,
          COALESCE(MAX(EXTRACT(DAY FROM (NOW()-c.fecha_vencimiento::date))) FILTER (WHERE c.estado='pendiente' AND c.fecha_vencimiento<NOW()::date), 0) AS dias_vencido,
          COALESCE(
            ROUND(
              (COUNT(p.id) FILTER (WHERE p.created_at > NOW() - INTERVAL '6 months'))::numeric /
              NULLIF(COUNT(c2.id) FILTER (WHERE c2.created_at > NOW() - INTERVAL '6 months'), 0) * 100
            ), 0
          ) AS tasa_pago_historica
        FROM students s
        LEFT JOIN student_guardian sg ON sg.student_id = s.id
        LEFT JOIN guardians g ON g.id = sg.guardian_id
        LEFT JOIN charges c ON c.student_id = s.id AND c.estado='pendiente'
        LEFT JOIN payments p ON p.charge_id IN (SELECT id FROM charges WHERE student_id=s.id)
        LEFT JOIN charges c2 ON c2.student_id = s.id
        WHERE s.campus_id = $1
        GROUP BY s.id, s.nombres, s.apellido_paterno, g.nombres, g.apellido_paterno, s.nivel_escolar
        ORDER BY adeudo_centavos DESC
        LIMIT 200
      `, [campusId]);

      const familias = (rows.rows as any[]).map(f => {
        const diasVencido = Number(f.dias_vencido || 0);
        const adeudo = Number(f.adeudo_centavos || 0);
        const tasaPago = Number(f.tasa_pago_historica || 0);
        let score = 100;
        if (diasVencido > 0) score -= Math.min(diasVencido, 40);
        if (adeudo > 500000) score -= 20;
        else if (adeudo > 200000) score -= 10;
        score = Math.max(0, score - (100 - tasaPago) * 0.3);
        score = Math.round(Math.max(0, Math.min(100, score)));
        const semaforo = score >= 75 ? "verde" : score >= 50 ? "amarillo" : "rojo";
        return {
          ...f,
          adeudo_centavos: adeudo,
          dias_vencido: diasVencido,
          tasa_pago_historica: tasaPago,
          score,
          semaforo,
          historial_descripcion: tasaPago >= 90 ? "Excelente historial" : tasaPago >= 70 ? "Historial regular" : "Historial irregular",
        };
      });
      res.json(familias);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── MÓDULO DE CAJA ────────────────────────────────────────────────────────

  /**
   * POST /api/caja/pago-efectivo
   *
   * Registra un cobro en efectivo en caja.
   * Selecciona automáticamente el cargo más antiguo pendiente del alumno.
   * SOPORTA PAGOS PARCIALES: el operador introduce el monto recibido;
   *   si cubre el saldo completo → charge queda 'pagado'
   *   si es menor → charge queda 'parcial' y un pago posterior puede completarlo
   *
   * Usa transacción atómica con FOR UPDATE para prevenir doble cobro concurrente.
   */
  app.post("/api/caja/pago-efectivo", authenticateToken, async (req, res) => {
    try {
      const campusId     = (req as any).user?.campus_id;
      const tenantIdCaja = (req as any).user?.tenant_id;
      const userIdCaja   = (req as any).user?.id;
      // charge_id es opcional: si el operador lo provee, paga ese cargo directamente;
      // si no, auto-selecciona el más antiguo no-terminal del alumno.
      const { estudiante_id, charge_id: chargeIdOverride, monto, recibido_por, observaciones } = req.body;

      if (!monto || parseFloat(monto) <= 0) {
        return res.status(400).json({ message: "El monto debe ser mayor que cero" });
      }
      const montoOperador = Math.round(parseFloat(monto) * 100); // centavos

      let chargeId: number | undefined;
      if (chargeIdOverride) {
        // Cargo explícito: verificar que pertenezca al alumno y campus correctos
        const explicitRow = await pool.query(
          `SELECT c.id FROM charges c
           JOIN students s ON s.id = c.student_id
           WHERE c.id = $1 AND s.id = $2 AND s.campus_id = $3
             AND c.estado NOT IN ('pagado','cancelado')`,
          [chargeIdOverride, estudiante_id, campusId]
        ).catch(() => ({ rows: [] as any[] }));
        chargeId = (explicitRow.rows as any[])[0]?.id;
      } else {
        // Auto-selección: cargo más antiguo no-terminal del alumno (fuera de la txn — lectura)
        const candidateRow = await pool.query(
          `SELECT c.id FROM charges c
           JOIN students s ON s.id = c.student_id
           WHERE s.id = $1 AND s.campus_id = $2
             AND c.estado NOT IN ('pagado','cancelado')
           ORDER BY c.fecha_vencimiento ASC LIMIT 1`,
          [estudiante_id, campusId]
        ).catch(() => ({ rows: [] as any[] }));
        chargeId = (candidateRow.rows as any[])[0]?.id;
      }
      if (!chargeId) {
        return res.json({ message: "No hay cargos pendientes para este alumno", payment_id: null, monto_centavos: montoOperador });
      }

      // ── Transacción atómica ──────────────────────────────────────────────
      const client = await pool.connect();
      let paymentId!: number;
      let montoAplicado!: number;
      let newEstado!: string;
      try {
        await client.query("BEGIN");

        // Lock del cargo — serializa doble cobro concurrente
        const lockRes = await client.query(
          `SELECT id, monto_base_centavos, estado
           FROM charges WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
          [chargeId, tenantIdCaja]
        );
        if (!(lockRes.rows as any[]).length) {
          await client.query("ROLLBACK");
          return res.json({ message: "Cargo no encontrado", payment_id: null, monto_centavos: montoOperador });
        }
        const locked = (lockRes.rows as any[])[0];

        if (["pagado", "cancelado"].includes(locked.estado)) {
          await client.query("ROLLBACK");
          return res.json({ message: "El cargo ya fue pagado o cancelado", payment_id: null, monto_centavos: montoOperador });
        }

        // Saldo pendiente real (dentro del mismo client)
        const saldoRes = await client.query(
          `SELECT COALESCE(SUM(pa.amount_centavos), 0)::bigint AS ya_pagado
           FROM payment_applications pa WHERE pa.charge_id = $1`,
          [chargeId]
        );
        const yaPagado = Number((saldoRes.rows as any[])[0].ya_pagado);
        const saldoPendiente = Number(locked.monto_base_centavos) - yaPagado;

        if (saldoPendiente <= 0) {
          await client.query("ROLLBACK");
          return res.json({ message: "El cargo ya tiene saldo cero", payment_id: null, monto_centavos: montoOperador });
        }

        // Calcular cuánto se aplica al cargo y cuánto sobra
        montoAplicado = Math.min(montoOperador, saldoPendiente);
        const excedente = montoOperador - montoAplicado; // 0 si no sobra nada
        newEstado = montoAplicado >= saldoPendiente ? "pagado" : "parcial";

        const referencia = `CAJA-${Date.now()}`;
        // El payment registra el MONTO TOTAL COBRADO (efectivo recibido en caja)
        // — importante para cuadre de caja. La payment_application aplica solo
        // lo que cubre el cargo.
        const payRow = await client.query(
          `INSERT INTO payments
             (tenant_id, charge_id, guardian_id, metodo, referencia_pasarela,
              monto_centavos, fecha_pago, estado)
           VALUES ($1,$2,NULL,'efectivo',$3,$4,CURRENT_DATE,'exitoso') RETURNING id`,
          [tenantIdCaja, chargeId, referencia, montoOperador]
        );
        paymentId = (payRow.rows as any[])[0].id;

        // Ledger entry: solo la parte que cubre el cargo
        await client.query(
          `INSERT INTO payment_applications (payment_id, charge_id, amount_centavos, applied_at)
           VALUES ($1,$2,$3,NOW())`,
          [paymentId, chargeId, montoAplicado]
        );

        await client.query(
          `UPDATE charges SET estado = $1, updated_at = NOW() WHERE id = $2`,
          [newEstado, chargeId]
        );

        // Si hubo excedente → registrar como saldo a favor de la familia
        if (excedente > 0) {
          // Buscar la familia del alumno (puede no tener ninguna)
          const familyRow = await client.query(
            `SELECT family_id FROM family_students WHERE student_id = $1 LIMIT 1`,
            [estudiante_id]
          );
          const creditFamilyId = (familyRow.rows as any[])[0]?.family_id ?? null;

          await client.query(
            `INSERT INTO family_credits
               (tenant_id, campus_id, family_id, student_id, payment_id,
                amount_centavos, origen, descripcion)
             VALUES ($1,$2,$3,$4,$5,$6,'excedente_caja',$7)`,
            [
              tenantIdCaja, campusId, creditFamilyId, estudiante_id, paymentId,
              excedente,
              `Cambio en cobro de caja — pago $${(montoOperador / 100).toFixed(2)}, cargo $${(saldoPendiente / 100).toFixed(2)}`,
            ]
          );
        }

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      // ── Audit fuera de la transacción (ADR-001) ──────────────────────────
      pool.query(
        `INSERT INTO audit_log
           (tenant_id, user_id, action, entity_type, entity_id, new_value, metadata)
         VALUES ($1,$2,'charge.status_changed','charge',$3,$4,$5)`,
        [
          tenantIdCaja, userIdCaja, chargeId,
          JSON.stringify({ estado: newEstado }),
          JSON.stringify({
            flujo: "caja_efectivo", payment_id: paymentId,
            monto_operador: montoOperador, monto_aplicado: montoAplicado,
            recibido_por, observaciones,
          }),
        ]
      ).catch(() => {});

      const excedente = montoOperador - montoAplicado;
      res.json({
        message: `Pago en efectivo registrado (${newEstado})${excedente > 0 ? ` — $${(excedente / 100).toFixed(2)} de cambio registrado como saldo a favor` : ""}`,
        payment_id:              paymentId,
        monto_aplicado_centavos: montoAplicado,
        monto_centavos:          montoOperador,
        excedente_centavos:      excedente,
        charge_nuevo_estado:     newEstado,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // Get bank movements
  app.get("/api/caja/movimientos-banco", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      const rows = await pool.query(`SELECT * FROM bank_transactions WHERE campus_id = $1 ORDER BY fecha DESC, id DESC LIMIT 100`, [campusId]).catch(() => ({ rows: [] }));
      res.json(rows.rows);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // Register manual transfer
  app.post("/api/caja/transferencia-manual", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      const { fecha, descripcion, monto, tipo, referencia, clabe, nombre } = req.body;
      const montoCentavos = Math.round(parseFloat(monto || '0') * 100);
      const row = await pool.query(`
        INSERT INTO bank_transactions (campus_id, fecha, descripcion, monto_centavos, tipo, referencia, clabe_ordenante, nombre_ordenante, estado_conciliacion)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pendiente') RETURNING *
      `, [campusId, fecha || new Date().toISOString().split('T')[0], descripcion, montoCentavos, tipo || 'credito', referencia || null, clabe || null, nombre || null]);
      res.json({ message: "Transferencia registrada", transaccion: (row.rows as any[])[0] });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // Get conciliation statistics
  app.get("/api/caja/estadisticas-conciliacion", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      const [totalRows, conciliadosRows, pendientesRows] = await Promise.all([
        pool.query(`SELECT COUNT(*) as total, COALESCE(SUM(monto_centavos),0) as monto FROM bank_transactions WHERE campus_id=$1`, [campusId]).catch(() => ({ rows: [{ total: 0, monto: 0 }] })),
        pool.query(`SELECT COUNT(*) as total, COALESCE(SUM(monto_centavos),0) as monto FROM bank_transactions WHERE campus_id=$1 AND estado_conciliacion='conciliado'`, [campusId]).catch(() => ({ rows: [{ total: 0, monto: 0 }] })),
        pool.query(`SELECT COUNT(*) as total, COALESCE(SUM(monto_centavos),0) as monto FROM bank_transactions WHERE campus_id=$1 AND estado_conciliacion='pendiente'`, [campusId]).catch(() => ({ rows: [{ total: 0, monto: 0 }] })),
      ]);
      res.json({
        total_transacciones: Number((totalRows.rows[0] as any)?.total || 0),
        monto_total: Number((totalRows.rows[0] as any)?.monto || 0),
        conciliadas: Number((conciliadosRows.rows[0] as any)?.total || 0),
        monto_conciliado: Number((conciliadosRows.rows[0] as any)?.monto || 0),
        pendientes: Number((pendientesRows.rows[0] as any)?.total || 0),
        monto_pendiente: Number((pendientesRows.rows[0] as any)?.monto || 0),
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // Execute automatic conciliation (FIFO)
  app.post("/api/caja/ejecutar-conciliacion", authenticateToken, async (req, res) => {
    try {
      const user      = (req as any).user;
      const campusId  = user?.campus_id;
      const tenantId  = user?.tenant_id;
      const ROLES_CAJA = ['administrador_general','administrador_campus','super_admin','caja','auxiliar_caja'];
      if (!user?.is_super_admin && !ROLES_CAJA.includes(user?.role)) {
        return res.status(403).json({ message: "Sin permisos para ejecutar conciliación automática" });
      }

      // Solo créditos/entradas con monto positivo pueden liquidar cargos
      const txRows = await pool.query(`
        SELECT id, monto_centavos, referencia FROM bank_transactions
        WHERE campus_id = $1 AND estado_conciliacion = 'pendiente'
          AND tipo = 'credito' AND monto_centavos > 0
        ORDER BY fecha ASC, id ASC
      `, [campusId]).catch(() => ({ rows: [] }));

      const chargeRows = await pool.query(`
        SELECT c.id,
               ROUND(c.monto_base_centavos * (1 - COALESCE(c.beca_aplicada,0)::numeric/100))
                 + COALESCE(c.recargo_aplicado_centavos, 0) AS monto_neto
        FROM charges c
        JOIN students s ON s.id = c.student_id
        WHERE s.campus_id = $1 AND c.estado = 'pendiente'
        ORDER BY c.fecha_vencimiento ASC, c.id ASC
      `, [campusId]).catch(() => ({ rows: [] }));

      const consumedIds = new Set<number>();
      let conciliados   = 0;

      for (const tx of (txRows.rows as any[])) {
        const match = (chargeRows.rows as any[]).find(c =>
          !consumedIds.has(c.id) &&
          Math.abs(Number(c.monto_neto) - Number(tx.monto_centavos)) < 100
        );
        if (!match) continue;
        consumedIds.add(match.id);

        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          // Bloquear la transacción bancaria primero (SKIP LOCKED evita espera en concurrencia)
          const txLock = await client.query(
            `SELECT id FROM bank_transactions
             WHERE id = $1 AND estado_conciliacion = 'pendiente'
               AND tipo = 'credito' AND monto_centavos > 0
             FOR UPDATE SKIP LOCKED`,
            [tx.id]
          );
          if (!txLock.rows.length) { await client.query('ROLLBACK'); continue; }

          // Luego bloquear el cargo
          const chargeLock = await client.query(
            `SELECT id FROM charges WHERE id = $1 AND estado = 'pendiente' FOR UPDATE SKIP LOCKED`,
            [match.id]
          );
          if (!chargeLock.rows.length) { await client.query('ROLLBACK'); continue; }

          // Crear el registro de pago
          const payResult = await client.query(
            `INSERT INTO payments (tenant_id, charge_id, guardian_id, metodo, referencia_pasarela,
                                   monto_centavos, fecha_pago, estado)
             VALUES ($1,$2,NULL,'spei',$3,$4,NOW(),'exitoso') RETURNING id`,
            [tenantId, match.id, tx.referencia || `AUTO-${tx.id}`, Number(match.monto_neto)]
          );
          const paymentId = payResult.rows[0].id;

          // Registrar la aplicación del pago (ledger familiar)
          await client.query(
            `INSERT INTO payment_applications (payment_id, charge_id, amount_centavos, applied_at)
             VALUES ($1, $2, $3, NOW())`,
            [paymentId, match.id, Number(match.monto_neto)]
          );

          // Marcar cargo como pagado
          await client.query(`UPDATE charges SET estado = 'pagado' WHERE id = $1`, [match.id]);

          // Marcar transacción bancaria como conciliada (condición en WHERE garantiza idempotencia)
          const updTx = await client.query(
            `UPDATE bank_transactions SET estado_conciliacion='conciliado', charge_id=$1, payment_id=$2
             WHERE id = $3 AND estado_conciliacion = 'pendiente'`,
            [match.id, paymentId, tx.id]
          );
          if ((updTx as any).rowCount !== 1) {
            // Otra operación concurrente nos ganó — deshacer
            await client.query('ROLLBACK');
            continue;
          }

          await client.query('COMMIT');
          conciliados++;
        } catch (txErr) {
          await client.query('ROLLBACK');
        } finally {
          client.release();
        }
      }

      res.json({ conciliados, mensaje: `${conciliados} transacciones conciliadas` });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // Close day (corte de caja)
  app.post("/api/caja/cerrar-dia", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      const { fecha, observaciones } = req.body;
      const today = fecha || new Date().toISOString().split('T')[0];
      const paymentsToday = await pool.query(`
        SELECT COUNT(*) as count, COALESCE(SUM(p.monto_centavos),0) as total
        FROM payments p JOIN charges c ON c.id=p.charge_id JOIN students s ON s.id=c.student_id
        WHERE s.campus_id=$1 AND DATE(p.created_at)=$2::date
      `, [campusId, today]).catch(() => ({ rows: [{ count: 0, total: 0 }] }));
      res.json({
        fecha: today,
        pagos_procesados: Number((paymentsToday.rows[0] as any)?.count || 0),
        total_cobrado: Number((paymentsToday.rows[0] as any)?.total || 0),
        mensaje: "Corte de caja realizado correctamente",
        observaciones
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── 3. CONCILIACIÓN BANCARIA SPEI ─────────────────────────────────────────

  // Alias without campusId param (reads from JWT)
  app.get("/api/conciliacion/transacciones", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      const rows = await pool.query(`SELECT * FROM bank_transactions WHERE campus_id = $1 ORDER BY fecha DESC, id DESC LIMIT 200`, [campusId]);
      res.json(rows.rows);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  app.get("/api/conciliacion/transacciones/:campusId", authenticateToken, async (req: any, res) => {
    try {
      const campusId = parseInt(req.params.campusId) || req.user?.campus_id;
      if (!await checkCampusTenant(campusId, req.user?.tenant_id, res)) return;
      const rows = await pool.query(`SELECT * FROM bank_transactions WHERE campus_id = $1 ORDER BY fecha DESC, id DESC LIMIT 200`, [campusId]);
      res.json(rows.rows);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  app.post("/api/conciliacion/importar", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      const { transacciones } = req.body;
      if (!Array.isArray(transacciones) || transacciones.length === 0) {
        return res.status(400).json({ message: "No hay transacciones para importar" });
      }
      let importadas = 0;
      for (const tx of transacciones) {
        await pool.query(`
          INSERT INTO bank_transactions (campus_id, fecha, descripcion, monto_centavos, tipo, referencia, clabe_ordenante, nombre_ordenante, estado_conciliacion)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pendiente')
          ON CONFLICT DO NOTHING
        `, [campusId, tx.fecha, tx.descripcion, Math.round(Number(tx.monto) * 100), tx.tipo || 'credito', tx.referencia || null, tx.clabe || null, tx.nombre || null]);
        importadas++;
      }
      res.json({ importadas, mensaje: `${importadas} transacciones importadas correctamente` });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  app.post("/api/conciliacion/auto-match/:campusId", authenticateToken, async (req: any, res) => {
    try {
      const user      = req.user;
      const campusId  = parseInt(req.params.campusId) || user?.campus_id;
      const tenantId  = user?.tenant_id;
      if (!await checkCampusTenant(campusId, tenantId, res)) return;

      // Solo roles de caja/administración pueden conciliar
      const ROLES_CAJA = ['administrador_general','administrador_campus','super_admin','caja','auxiliar_caja'];
      if (!user?.is_super_admin && !ROLES_CAJA.includes(user?.role)) {
        return res.status(403).json({ message: "Sin permisos para ejecutar conciliación automática" });
      }

      // Solo créditos/entradas con monto positivo pueden liquidar cargos
      const txRows = await pool.query(`
        SELECT id, monto_centavos, referencia FROM bank_transactions
        WHERE campus_id = $1 AND estado_conciliacion = 'pendiente'
          AND tipo = 'credito' AND monto_centavos > 0
        ORDER BY fecha ASC, id ASC
      `, [campusId]);

      // Cargos pendientes FIFO — monto neto calculado server-side
      const chargeRows = await pool.query(`
        SELECT c.id,
               ROUND(c.monto_base_centavos * (1 - COALESCE(c.beca_aplicada,0)::numeric/100))
                 + COALESCE(c.recargo_aplicado_centavos, 0) AS monto_neto
        FROM charges c
        JOIN students s ON s.id = c.student_id
        WHERE s.campus_id = $1 AND c.estado = 'pendiente'
        ORDER BY c.fecha_vencimiento ASC, c.id ASC
      `, [campusId]);

      const consumedIds = new Set<number>();
      let conciliados   = 0;

      for (const tx of (txRows.rows as any[])) {
        const match = (chargeRows.rows as any[]).find(c =>
          !consumedIds.has(c.id) &&
          Math.abs(Number(c.monto_neto) - Number(tx.monto_centavos)) < 100
        );
        if (!match) continue;
        consumedIds.add(match.id);

        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          // Bloquear la transacción bancaria primero (SKIP LOCKED = sin espera en concurrencia)
          const txLock = await client.query(
            `SELECT id FROM bank_transactions
             WHERE id = $1 AND estado_conciliacion = 'pendiente'
               AND tipo = 'credito' AND monto_centavos > 0
             FOR UPDATE SKIP LOCKED`,
            [tx.id]
          );
          if (!txLock.rows.length) { await client.query('ROLLBACK'); continue; }

          // Luego bloquear el cargo
          const chargeLock = await client.query(
            `SELECT id FROM charges WHERE id = $1 AND estado = 'pendiente' FOR UPDATE SKIP LOCKED`,
            [match.id]
          );
          if (!chargeLock.rows.length) { await client.query('ROLLBACK'); continue; }

          // Crear registro de pago
          const payResult = await client.query(
            `INSERT INTO payments (tenant_id, charge_id, guardian_id, metodo, referencia_pasarela,
                                   monto_centavos, fecha_pago, estado)
             VALUES ($1,$2,NULL,'spei',$3,$4,NOW(),'exitoso') RETURNING id`,
            [tenantId, match.id, tx.referencia || `AUTO-${tx.id}`, Number(match.monto_neto)]
          );
          const paymentId = payResult.rows[0].id;

          // Registrar la aplicación del pago (ledger familiar)
          await client.query(
            `INSERT INTO payment_applications (payment_id, charge_id, amount_centavos, applied_at)
             VALUES ($1, $2, $3, NOW())`,
            [paymentId, match.id, Number(match.monto_neto)]
          );

          // Marcar cargo como pagado
          await client.query(`UPDATE charges SET estado = 'pagado' WHERE id = $1`, [match.id]);

          // Marcar transacción bancaria como conciliada (rowCount=0 = otra concurrencia nos ganó)
          const updTx = await client.query(
            `UPDATE bank_transactions
             SET estado_conciliacion = 'conciliado', charge_id = $1, payment_id = $2
             WHERE id = $3 AND estado_conciliacion = 'pendiente'`,
            [match.id, paymentId, tx.id]
          );
          if ((updTx as any).rowCount !== 1) {
            await client.query('ROLLBACK');
            continue;
          }

          await client.query('COMMIT');
          conciliados++;
        } catch (txErr) {
          await client.query('ROLLBACK');
        } finally {
          client.release();
        }
      }

      const noConciliados = (txRows.rows as any[]).length - conciliados;
      res.json({ conciliados, no_conciliados: noConciliados, total: (txRows.rows as any[]).length });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── GET /api/conciliacion/excepciones ─────────────────────────────────────
  // Devuelve transacciones bancarias sin conciliar del campus del usuario.
  // Requiere rol administrativo (no disponible para roles de sólo lectura).
  app.get("/api/conciliacion/excepciones", authenticateToken, async (req: any, res) => {
    try {
      const user      = req.user;
      const campusId  = user?.campus_id;
      const ROLES_OK  = ['administrador_general','administrador_campus','super_admin','caja','auxiliar_caja','contador_general','asistente'];
      if (!campusId) return res.status(400).json({ message: "Campus requerido" });
      if (!user?.is_super_admin && !ROLES_OK.includes(user?.role)) {
        return res.status(403).json({ message: "Sin permisos para ver excepciones de conciliación" });
      }

      const rows = await pool.query(`
        SELECT bt.id, bt.fecha, bt.descripcion, bt.monto_centavos, bt.tipo,
               bt.referencia, bt.clabe_ordenante, bt.nombre_ordenante,
               bt.estado_conciliacion, bt.nota_conciliacion,
               GREATEST(0, NOW()::date - bt.fecha::date) AS dias_sin_conciliar
        FROM bank_transactions bt
        WHERE bt.campus_id = $1 AND bt.estado_conciliacion = 'pendiente'
        ORDER BY bt.fecha ASC, bt.id ASC
      `, [campusId]);

      const cargosRows = await pool.query(`
        SELECT c.id, c.fecha_vencimiento,
               CONCAT(s.nombres, ' ', s.apellido_paterno) AS alumno,
               s.grado,
               ROUND(c.monto_base_centavos * (1 - COALESCE(c.beca_aplicada,0)::numeric/100))
                 + COALESCE(c.recargo_aplicado_centavos,0) AS monto_neto,
               con.nombre AS concepto
        FROM charges c
        JOIN students s ON s.id = c.student_id
        LEFT JOIN concepts con ON con.id = c.concept_id
        WHERE s.campus_id = $1 AND c.estado = 'pendiente'
        ORDER BY c.fecha_vencimiento ASC, s.apellido_paterno ASC
      `, [campusId]);

      res.json({
        excepciones:        rows.rows,
        cargos_disponibles: cargosRows.rows,
        total_pendiente:    rows.rows.length,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── POST /api/conciliacion/excepciones/:id/resolver ───────────────────────
  // Aplica o descarta manualmente una excepción bancaria.
  // Atómico: usa transacción DB con bloqueo de filas para evitar concurrencia.
  // Requiere rol administrativo de caja.
  app.post("/api/conciliacion/excepciones/:id/resolver", authenticateToken, async (req: any, res) => {
    const user      = req.user;
    const txId      = parseInt(req.params.id);
    const campusId  = user?.campus_id;
    const tenantId  = user?.tenant_id;
    const { accion: accionRaw, charge_id, nota, motivo } = req.body;
    // 'descartar' es el alias moderno de 'ignorar'
    const accion = accionRaw === 'descartar' ? 'ignorar' : accionRaw;

    // ── Autorización ──────────────────────────────────────────────────────────
    const ROLES_RESOLVER = ['administrador_general','administrador_campus','super_admin','caja','auxiliar_caja'];
    if (!user?.is_super_admin && !ROLES_RESOLVER.includes(user?.role)) {
      return res.status(403).json({ message: "Sin permisos para resolver excepciones de conciliación" });
    }

    // ── Validación de parámetros (antes de abrir la transacción) ─────────────
    if (!['aplicar', 'ignorar'].includes(accion)) {
      return res.status(400).json({ message: "accion debe ser 'aplicar', 'ignorar' o 'descartar'" });
    }
    if (accion === 'ignorar' && !nota?.trim() && !motivo?.trim()) {
      return res.status(400).json({ message: "Se requiere motivo o nota para descartar" });
    }
    if (accion === 'aplicar' && !charge_id) {
      return res.status(400).json({ message: "Se requiere charge_id para aplicar el pago" });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // ── Bloquear la transacción bancaria (FOR UPDATE) y verificar que sigue pendiente
      const txLock = await client.query(
        `SELECT id, monto_centavos, referencia, campus_id, estado_conciliacion
         FROM bank_transactions WHERE id = $1 FOR UPDATE`,
        [txId]
      );
      if (!txLock.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: "Transacción no encontrada" });
      }
      const tx = txLock.rows[0] as any;
      if (tx.campus_id !== campusId) {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: "La transacción no pertenece a tu campus" });
      }
      if (tx.estado_conciliacion !== 'pendiente') {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: `La transacción ya fue ${tx.estado_conciliacion} por otra operación` });
      }

      if (accion === 'aplicar') {
        // ── Bloquear el cargo y verificar que está pendiente
        const chargeLock = await client.query(
          `SELECT c.id,
                  ROUND(c.monto_base_centavos * (1 - COALESCE(c.beca_aplicada,0)::numeric/100))
                    + COALESCE(c.recargo_aplicado_centavos,0) AS monto_neto
           FROM charges c JOIN students s ON s.id = c.student_id
           WHERE c.id = $1 AND s.campus_id = $2 AND c.estado = 'pendiente'
           FOR UPDATE`,
          [charge_id, campusId]
        );
        if (!chargeLock.rows.length) {
          await client.query('ROLLBACK');
          return res.status(404).json({ message: "Cargo no encontrado o ya pagado" });
        }
        const cargo = chargeLock.rows[0] as any;

        // ── Validar que el importe bancario cubre el monto neto del cargo (±100 centavos)
        const diff = Math.abs(Number(tx.monto_centavos) - Number(cargo.monto_neto));
        if (diff > 100) {
          await client.query('ROLLBACK');
          return res.status(422).json({
            message:
              `El importe bancario ($${(Number(tx.monto_centavos)/100).toFixed(2)}) ` +
              `no coincide con el monto neto del cargo ($${(Number(cargo.monto_neto)/100).toFixed(2)}). ` +
              `Diferencia: $${(diff/100).toFixed(2)}. ` +
              `Si es un pago parcial, usa "Marcar como no escolar" con nota y gestiona el cobro por separado.`,
            diff_centavos: diff,
            monto_banco:   Number(tx.monto_centavos),
            monto_cargo:   Number(cargo.monto_neto),
          });
        }

        // ── Crear el registro de pago (por el monto neto del cargo para cuadre contable)
        const payResult = await client.query(
          `INSERT INTO payments (tenant_id, charge_id, guardian_id, metodo, referencia_pasarela,
                                 monto_centavos, fecha_pago, estado)
           VALUES ($1,$2,NULL,'spei',$3,$4,NOW(),'exitoso') RETURNING id`,
          [tenantId, charge_id, tx.referencia || `BANK-${txId}`, Number(cargo.monto_neto)]
        );
        const paymentId = payResult.rows[0].id;

        // ── Registrar la aplicación del pago (ledger familiar — saldo calculado desde aquí)
        await client.query(
          `INSERT INTO payment_applications (payment_id, charge_id, amount_centavos, applied_at)
           VALUES ($1, $2, $3, NOW())`,
          [paymentId, charge_id, Number(cargo.monto_neto)]
        );

        // ── Marcar el cargo como pagado
        await client.query(`UPDATE charges SET estado = 'pagado' WHERE id = $1`, [charge_id]);

        // ── Marcar la transacción como conciliada, enlazando charge_id y payment_id
        await client.query(
          `UPDATE bank_transactions
           SET estado_conciliacion = 'conciliado', charge_id = $1, payment_id = $2,
               nota_conciliacion = $3
           WHERE id = $4`,
          [charge_id, paymentId, nota?.trim() || 'Aplicado manualmente por administrador', txId]
        );

        await client.query('COMMIT');
        res.json({ message: "Pago aplicado correctamente al cargo seleccionado", payment_id: paymentId });

      } else {
        // ── descartar/ignorar: marcar como no escolar (motivo obligatorio)
        const notaFinal = nota?.trim() || motivo?.trim() || 'Descartado manualmente';
        await client.query(
          `UPDATE bank_transactions
           SET estado_conciliacion = 'ignorado', nota_conciliacion = $1
           WHERE id = $2`,
          [notaFinal, txId]
        );

        // ── COMMIT primero — el UPDATE debe persistir incluso si el audit falla
        await client.query('COMMIT');
        res.json({ message: "Excepción descartada y registrada en auditoría" });

        // ── Audit log FUERA de la transacción ya commitada (fire-and-forget).
        // Usa pool.query() (conexión separada) para que un fallo de FK u otro
        // error de escritura secundaria NO revierta el UPDATE ya persistido.
        // Esto corrige el bug de rollback silencioso: antes el INSERT usaba
        // client.query() dentro de la tx abierta; si fallaba (p.ej. user_id
        // eliminado → FK violation), la pg connection quedaba en estado abortado
        // y el COMMIT posterior ejecutaba un ROLLBACK silencioso, respondiendo
        // HTTP 200 mientras la bank_tx seguía en 'pendiente'.
        if (tenantId && user?.id) {
          const auditPayload = {
            tenant_id:   tenantId,
            user_id:     user.id,
            action:      'descartar_excepcion' as const,
            entity_type: 'bank_transaction' as const,
            entity_id:   txId,
            metadata: {
              motivo:         motivo?.trim() || null,
              nota:           nota?.trim() || null,
              monto_centavos: Number(tx.monto_centavos),
              referencia:     tx.referencia || null,
            },
          };
          pool.query(
            `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata, created_at)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())`,
            [
              auditPayload.tenant_id,
              auditPayload.user_id,
              auditPayload.action,
              auditPayload.entity_type,
              auditPayload.entity_id,
              JSON.stringify(auditPayload.metadata),
            ]
          ).catch((err) => {
            // Primer intento fallido → encolar para reintento con backoff.
            // Si los reintentos también fallan, audit-retry.ts emite log nivel ERROR
            // visible en logs/audit-error.log y en consola (Winston).
            enqueueAuditLog(auditPayload, err);
          });
        }
      }
    } catch (error: any) {
      await client.query('ROLLBACK').catch(() => {});
      res.status(500).json({ message: "Error interno del servidor" });
    } finally {
      client.release();
    }
  });

  // ── 4. FACTURACIÓN MASIVA CFDI ────────────────────────────────────────────
}
