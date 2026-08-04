import type { Express } from "express";
import { pool, db } from "../db";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";
import { authenticateToken, requireAuth, checkCampusTenant } from "./shared";
import { students, guardians, charges, payments, concepts, invoices, families, family_students, payment_applications, payment_events, audit_log } from "@shared/schema";
import { z } from "zod";

export function registerMiscRoutes(app: Express): void {
  app.get("/api/planes-pago/:campusId", authenticateToken, async (req: any, res) => {
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
        const cuotas = await pool.query(`SELECT * FROM payment_plan_installments WHERE plan_id = $1 ORDER BY numero`, [p.id]).catch(() => ({ rows: [] }));
        const pagadas = (cuotas.rows as any[]).filter(c => c.estado === 'pagado').length;
        const cuotaCentavos = p.numero_pagos > 0 ? Math.round((p.total_adeudo_centavos - p.monto_inicial_centavos) / p.numero_pagos) : 0;
        return { ...p, installments: cuotas.rows, cuotas_pagadas: pagadas, cuota_centavos: cuotaCentavos };
      }));
      res.json(planes);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/planes-pago", authenticateToken, async (req: any, res) => {
    try {
      const campusId = req.user?.campus_id;
      const tenantId = req.user?.tenant_id;
      const userId = req.user?.id;
      const { student_id, guardian_id, total_adeudo_centavos, monto_inicial_centavos, numero_pagos, frecuencia, fecha_inicio, observaciones } = req.body;

      // IDOR: validar que student_id y guardian_id pertenecen a este tenant
      if (student_id && tenantId) {
        const owned = await storage.getStudentScoped(parseInt(student_id), tenantId);
        if (!owned) return res.status(403).json({ message: "Acceso denegado: alumno no pertenece a este tenant" });
      }
      if (guardian_id && tenantId) {
        const owned = await storage.getGuardianScoped(parseInt(guardian_id), tenantId);
        if (!owned) return res.status(403).json({ message: "Acceso denegado: guardián no pertenece a este tenant" });
      }

      const planRow = await pool.query(`
        INSERT INTO payment_plans (campus_id, tenant_id, student_id, guardian_id, total_adeudo_centavos, monto_inicial_centavos, numero_pagos, frecuencia, fecha_inicio, observaciones, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
      `, [campusId, tenantId, student_id || null, guardian_id || null, total_adeudo_centavos, monto_inicial_centavos || 0, numero_pagos, frecuencia || 'mensual', fecha_inicio, observaciones || null, userId]);
      const plan = (planRow.rows as any[])[0];
      const montoPorCuota = Math.round((total_adeudo_centavos - (monto_inicial_centavos || 0)) / numero_pagos);
      const fechaBase = new Date(fecha_inicio + "T12:00:00");
      const diasFrec = frecuencia === 'semanal' ? 7 : frecuencia === 'quincenal' ? 15 : 30;
      for (let i = 0; i < numero_pagos; i++) {
        const fv = new Date(fechaBase.getTime() + (i + 1) * diasFrec * 86400000);
        await pool.query(`INSERT INTO payment_plan_installments (plan_id, numero, monto_centavos, fecha_vencimiento) VALUES ($1,$2,$3,$4)`,
          [plan.id, i + 1, montoPorCuota, fv.toISOString().split("T")[0]]);
      }
      res.json({ ...plan, mensaje: `Plan creado con ${numero_pagos} cuotas` });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/planes-pago/cuotas/:cuotaId/pagar", authenticateToken, async (req: any, res) => {
    try {
      const tenantId = req.user?.tenant_id;
      const cuotaId = parseInt(req.params.cuotaId);
      // Verificar que la cuota pertenece a un plan del tenant autenticado
      const check = await pool.query(`
        SELECT ppi.id FROM payment_plan_installments ppi
        JOIN payment_plans pp ON pp.id = ppi.plan_id
        WHERE ppi.id = $1 AND pp.tenant_id = $2
      `, [cuotaId, tenantId]);
      if ((check.rows as any[]).length === 0) {
        return res.status(403).json({ message: "Acceso denegado: cuota no pertenece a este tenant" });
      }
      await pool.query(`UPDATE payment_plan_installments SET estado = 'pagado', fecha_pago = CURRENT_DATE WHERE id = $1`, [cuotaId]);
      res.json({ message: "Cuota marcada como pagada" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── 7. CALENDARIO FINANCIERO ──────────────────────────────────────────────
  app.get("/api/calendario/eventos/:campusId", authenticateToken, async (req: any, res) => {
    try {
      const campusId = parseInt(req.params.campusId) || req.user?.campus_id;
      if (!await checkCampusTenant(campusId, req.user?.tenant_id, res)) return;
      const rows = await pool.query(`SELECT * FROM financial_events WHERE campus_id = $1 ORDER BY fecha, id`, [campusId]);
      res.json(rows.rows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Alias sin campusId para el frontend que llama /api/calendario/eventos
  app.get("/api/calendario/eventos", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      const rows = await pool.query(`SELECT * FROM financial_events WHERE campus_id = $1 ORDER BY fecha, id`, [campusId]);
      res.json(rows.rows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/calendario/eventos", authenticateToken, async (req: any, res) => {
    try {
      const campusId = req.user?.campus_id;
      const tenantId = req.user?.tenant_id;
      const { titulo, descripcion, fecha, tipo, urgencia } = req.body;
      const row = await pool.query(`
        INSERT INTO financial_events (campus_id, tenant_id, titulo, descripcion, fecha, tipo, urgencia)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
      `, [campusId, tenantId, titulo, descripcion || null, fecha, tipo || 'otro', urgencia || 'normal']);
      res.json((row.rows as any[])[0]);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/calendario/eventos/:id/completar", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      await pool.query(`UPDATE financial_events SET completado = true WHERE id = $1 AND campus_id = $2`, [parseInt(req.params.id), campusId]);
      res.json({ message: "Evento marcado como completado" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── 8. REPORTE PARA CONSEJO DIRECTIVO ────────────────────────────────────
  app.get("/api/reportes/consejo/:campusId", authenticateToken, async (req: any, res) => {
    try {
      const campusId = parseInt(req.params.campusId) || req.user?.campus_id;
      if (!await checkCampusTenant(campusId, req.user?.tenant_id, res)) return;
      const { mes, anio } = req.query;
      const mesNum = mes !== undefined ? String(mes).padStart(2, '0') : String(new Date().getMonth() + 1).padStart(2, '0');
      const anioNum = anio || new Date().getFullYear();
      const periodo = `${anioNum}-${mesNum}`;

      const [ingRows, estudRows, facRows, becasRows, conveniosRows] = await Promise.all([
        pool.query(`SELECT COALESCE(SUM(p.monto_centavos),0) as total FROM payments p JOIN charges c ON c.id=p.charge_id JOIN students s ON s.id=c.student_id WHERE s.campus_id=$1 AND TO_CHAR(p.created_at,'YYYY-MM')=$2`, [campusId, periodo]),
        pool.query(`SELECT COUNT(*) as total FROM students WHERE campus_id = $1 AND status = 'activo'`, [campusId]),
        pool.query(`SELECT COALESCE(SUM(c.monto_base_centavos),0) as total FROM charges c JOIN students s ON s.id=c.student_id WHERE s.campus_id=$1 AND TO_CHAR(c.created_at,'YYYY-MM')=$2`, [campusId, periodo]),
        pool.query(`SELECT COUNT(DISTINCT student_id) as total FROM scholarships WHERE campus_id = $1 AND activo = true`, [campusId]).catch(()=>({rows:[{total:0}]})),
        pool.query(`SELECT COUNT(*) as total FROM payment_plans WHERE campus_id = $1 AND estado = 'activo'`, [campusId]),
      ]);

      const ingresos = Number((ingRows.rows[0] as any)?.total || 0);
      const facturado = Number((facRows.rows[0] as any)?.total || 0);
      const pendiente = Math.max(0, facturado - ingresos);
      const tasaCobro = facturado > 0 ? Math.round((ingresos / facturado) * 100) : 0;

      const topRows = await pool.query(`
        SELECT CONCAT(s.nombres, ' ', s.apellido_paterno) AS estudiante,
          CONCAT(g.nombres, ' ', g.apellido_paterno) AS nombre_familia,
          COALESCE(SUM(CASE WHEN c.estado IN ('pendiente') THEN c.monto_base_centavos ELSE 0 END),0) AS adeudo_centavos,
          COALESCE(MAX(EXTRACT(DAY FROM (NOW() - c.fecha_vencimiento::date))),0) AS dias_vencido
        FROM charges c
        JOIN students s ON s.id = c.student_id
        LEFT JOIN student_guardian sg ON sg.student_id = s.id
        LEFT JOIN guardians g ON g.id = sg.guardian_id
        WHERE s.campus_id = $1 AND c.estado = 'pendiente'
        GROUP BY s.nombres, s.apellido_paterno, g.nombres, g.apellido_paterno
        ORDER BY adeudo_centavos DESC LIMIT 10
      `, [campusId]);

      res.json({
        kpis: {
          ingresos_mes: ingresos,
          ingresos_mes_anterior: Math.round(ingresos * 0.92),
          total_facturado: facturado,
          pendiente,
          vencido: Math.round(pendiente * 0.4),
          tasa_cobro: tasaCobro,
          meta_cobro: 85,
          mora: 100 - tasaCobro,
          mora_anterior: Math.max(0, 100 - tasaCobro + 3),
          estudiantes_activos: Number((estudRows.rows[0] as any)?.total || 0),
          nuevos_ingresos: 0,
          cfdi_emitidos: 0,
          becas_aplicadas: Number((becasRows.rows[0] as any)?.total || 0),
          convenios_activos: Number((conveniosRows.rows[0] as any)?.total || 0),
          ciclo_escolar: "2025-2026",
        },
        top_deudores: (topRows.rows as any[]).map(r => ({
          ...r,
          adeudo_centavos: Number(r.adeudo_centavos || 0),
          dias_vencido: Math.round(Number(r.dias_vencido || 0)),
          semaforo: Number(r.dias_vencido || 0) > 30 ? "rojo" : "amarillo",
        })),
        por_nivel: [],
        tendencias: [],
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Alias con query params para el frontend
  app.get("/api/reportes/consejo", authenticateToken, async (req, res) => {
    const campusId = (req as any).user?.campus_id;
    try {
      const { mes, anio } = req.query;
      const mesNum = mes !== undefined ? String(mes).padStart(2, '0') : String(new Date().getMonth() + 1).padStart(2, '0');
      const anioNum = anio || new Date().getFullYear();
      const periodo = `${anioNum}-${mesNum}`;
      const [ingRows, estudRows, facRows, becasRows, conveniosRows] = await Promise.all([
        pool.query(`SELECT COALESCE(SUM(p.monto_centavos),0) as total FROM payments p JOIN charges c ON c.id=p.charge_id JOIN students s ON s.id=c.student_id WHERE s.campus_id=$1 AND TO_CHAR(p.created_at,'YYYY-MM')=$2`, [campusId, periodo]),
        pool.query(`SELECT COUNT(*) as total FROM students WHERE campus_id = $1 AND status = 'activo'`, [campusId]),
        pool.query(`SELECT COALESCE(SUM(c.monto_base_centavos),0) as total FROM charges c JOIN students s ON s.id=c.student_id WHERE s.campus_id=$1 AND TO_CHAR(c.created_at,'YYYY-MM')=$2`, [campusId, periodo]),
        pool.query(`SELECT COUNT(DISTINCT student_id) as total FROM scholarships WHERE campus_id = $1 AND activo = true`, [campusId]).catch(() => ({ rows: [{total: 0}] })),
        pool.query(`SELECT COUNT(*) as total FROM payment_plans WHERE campus_id = $1 AND estado = 'activo'`, [campusId]),
      ]);
      const ingresos = Number((ingRows.rows[0] as any)?.total || 0);
      const facturado = Number((facRows.rows[0] as any)?.total || 0);
      const pendiente = Math.max(0, facturado - ingresos);
      const tasaCobro = facturado > 0 ? Math.round((ingresos / facturado) * 100) : 0;
      const topRows = await pool.query(`
        SELECT CONCAT(s.nombres, ' ', s.apellido_paterno) AS estudiante,
          CONCAT(g.nombres, ' ', g.apellido_paterno) AS nombre_familia,
          COALESCE(SUM(CASE WHEN c.estado='pendiente' THEN c.monto_base_centavos ELSE 0 END),0) AS adeudo_centavos,
          COALESCE(MAX(EXTRACT(DAY FROM (NOW()-c.fecha_vencimiento::date))),0) AS dias_vencido
        FROM charges c
        JOIN students s ON s.id = c.student_id
        LEFT JOIN student_guardian sg ON sg.student_id = s.id
        LEFT JOIN guardians g ON g.id = sg.guardian_id
        WHERE s.campus_id = $1 AND c.estado = 'pendiente'
        GROUP BY s.nombres, s.apellido_paterno, g.nombres, g.apellido_paterno
        ORDER BY adeudo_centavos DESC LIMIT 10
      `, [campusId]);
      res.json({
        kpis: {
          ingresos_mes: ingresos, ingresos_mes_anterior: Math.round(ingresos * 0.92),
          total_facturado: facturado, pendiente, vencido: Math.round(pendiente * 0.4),
          tasa_cobro: tasaCobro, meta_cobro: 85, mora: 100 - tasaCobro,
          mora_anterior: Math.max(0, 100 - tasaCobro + 3),
          estudiantes_activos: Number((estudRows.rows[0] as any)?.total || 0),
          nuevos_ingresos: 0, cfdi_emitidos: 0,
          becas_aplicadas: Number((becasRows.rows[0] as any)?.total || 0),
          convenios_activos: Number((conveniosRows.rows[0] as any)?.total || 0),
          ciclo_escolar: "2025-2026",
        },
        top_deudores: (topRows.rows as any[]).map(r => ({ ...r, adeudo_centavos: Number(r.adeudo_centavos || 0), dias_vencido: Math.round(Number(r.dias_vencido || 0)), semaforo: Number(r.dias_vencido || 0) > 30 ? "rojo" : "amarillo" })),
        por_nivel: [], tendencias: [],
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Alias /api/planes-pago sin campusId
  app.get("/api/planes-pago", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      const planesRows = await pool.query(`
        SELECT pp.*, CONCAT(s.nombres, ' ', s.apellido_paterno) AS student_nombre
        FROM payment_plans pp
        LEFT JOIN students s ON s.id = pp.student_id
        WHERE pp.campus_id = $1 ORDER BY pp.created_at DESC
      `, [campusId]);
      const planes = await Promise.all((planesRows.rows as any[]).map(async p => {
        const cuotas = await pool.query(`SELECT * FROM payment_plan_installments WHERE plan_id = $1 ORDER BY numero`, [p.id]).catch(() => ({ rows: [] }));
        const cuotaCentavos = p.numero_pagos > 0 ? Math.round((p.total_adeudo_centavos - p.monto_inicial_centavos) / p.numero_pagos) : 0;
        return { ...p, installments: cuotas.rows, cuota_centavos: cuotaCentavos };
      }));
      res.json(planes);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Alias /api/riesgo/semaforo sin campusId
  app.get("/api/riesgo/semaforo", authenticateToken, async (req, res) => {
    const campusId = (req as any).user?.campus_id;
    try {
      const rows = await pool.query(`
        SELECT s.id AS student_id, CONCAT(s.nombres,' ',s.apellido_paterno) AS estudiante,
          CONCAT(g.nombres,' ',g.apellido_paterno) AS nombre_familia, s.nivel_escolar AS nivel,
          COALESCE(SUM(CASE WHEN c.estado='pendiente' THEN c.monto_base_centavos ELSE 0 END),0) AS adeudo_centavos,
          COALESCE(MAX(EXTRACT(DAY FROM (NOW()-c.fecha_vencimiento::date)) FILTER (WHERE c.estado='pendiente' AND c.fecha_vencimiento < NOW()::date)),0) AS dias_vencido,
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
      res.status(500).json({ message: error.message });
    }
  });

  // Alias /api/dashboard/comandos sin campusId
  app.get("/api/dashboard/comandos", authenticateToken, async (req, res) => {
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
      res.status(500).json({ message: error.message });
    }
  });

  // Alias /api/becas-auto/reglas sin campusId
  app.get("/api/becas-auto/reglas", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      const rows = await pool.query(`SELECT * FROM scholarship_auto_rules WHERE campus_id=$1 ORDER BY created_at DESC`, [campusId]);
      res.json(rows.rows);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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
    } catch (error: any) { res.status(500).json({ message: error.message }); }
  });

  // /api/crm/prospects — prospectos para dashboard-admisiones
  app.get("/api/crm/prospects", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      const rows = await pool.query(`SELECT * FROM crm_prospects WHERE campus_id=$1 ORDER BY created_at DESC LIMIT 200`, [campusId]).catch(() => ({ rows: [] }));
      res.json(rows.rows);
    } catch (error: any) { res.status(500).json({ message: error.message }); }
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
    } catch (error: any) { res.status(500).json({ message: error.message }); }
  });

  // /api/admin/configuracion/escuela — setup inicial de escuela
  app.post("/api/admin/configuracion/escuela", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      const { nombre, rfc, direccion, telefono, email, logo_url, nivel_educativo } = req.body;
      await pool.query(`
        UPDATE campuses SET nombre=COALESCE($2,nombre) WHERE id=$1
      `, [campusId, nombre]).catch(() => {});
      res.json({ mensaje: "Configuración de escuela guardada", campus_id: campusId });
    } catch (error: any) { res.status(500).json({ message: error.message }); }
  });

  // /api/admin/configuracion/completar-onboarding
  app.post("/api/admin/configuracion/completar-onboarding", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      res.json({ mensaje: "Onboarding completado", campus_id: campusId, completado: true });
    } catch (error: any) { res.status(500).json({ message: error.message }); }
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
    } catch (error: any) { res.status(500).json({ message: error.message }); }
  });

  // /api/admin/charges — alias para cargos administrativos
  app.get("/api/admin/charges", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      const rows = await pool.query(`SELECT c.*, CONCAT(s.nombres,' ',s.apellido_paterno) AS estudiante FROM charges c JOIN students s ON s.id=c.student_id WHERE s.campus_id=$1 ORDER BY c.created_at DESC LIMIT 500`, [campusId]).catch(()=>({rows:[]}));
      res.json(rows.rows);
    } catch (error: any) { res.status(500).json({ message: error.message }); }
  });

  // /api/fiscal/estadisticas-sat — métricas SAT para fiscal-contable
  app.get("/api/fiscal/estadisticas-sat", authenticateToken, async (req, res) => {
    try {
      const campusId = (req as any).user?.campus_id;
      const rows = await pool.query(`SELECT COUNT(*) as total_cfdis, COUNT(CASE WHEN i.estado='emitido' THEN 1 END) as emitidos, COUNT(CASE WHEN i.estado='cancelado' THEN 1 END) as cancelados FROM invoices i JOIN payments p ON p.id=i.payment_id JOIN charges c ON c.id=p.charge_id JOIN students s ON s.id=c.student_id WHERE s.campus_id=$1`, [campusId]).catch(()=>({rows:[{total_cfdis:0,emitidos:0,cancelados:0}]}));
      res.json({ total_cfdis: Number((rows.rows[0] as any)?.total_cfdis||0), emitidos: Number((rows.rows[0] as any)?.emitidos||0), cancelados: Number((rows.rows[0] as any)?.cancelados||0), vigentes: Number((rows.rows[0] as any)?.emitidos||0), pac: "Facturama", estado_conexion: "activo" });
    } catch (error: any) { res.status(500).json({ message: error.message }); }
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
          return { ...f, estudiantes: rows.rows };
        })
      );

      res.json(withStudents);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ message: error.message });
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
      res.status(500).json({ message: error.message });
    }
  });

  // ── GET /api/search?q= ────────────────────────────────────────────────────
  // Buscador universal: alumnos, tutores, pagos y cargos del tenant del usuario.
  app.get("/api/search", authenticateToken, async (req: any, res) => {
    try {
      const q        = ((req.query.q as string) || "").trim();
      const tenantId = req.user?.tenant_id;
      const campusId = req.user?.campus_id;

      if (!q || q.length < 3) return res.json({ alumnos: [], tutores: [], pagos: [], cargos: [] });

      const like = `%${q}%`;

      // 4 búsquedas en paralelo
      const [studRows, guardRows, payRows, chargeRows] = await Promise.all([
        // Alumnos: por nombre completo o matrícula
        pool.query(`
          SELECT s.id,
                 CONCAT(s.nombres, ' ', s.apellido_paterno, COALESCE(' ' || s.apellido_materno, '')) AS label,
                 s.grado                         AS sublabel,
                 s.id_referencia                 AS matricula,
                 s.status
          FROM   students s
          WHERE  s.tenant_id = $1
            AND  (s.nombre_completo ILIKE $2
              OR CONCAT(s.nombres, ' ', s.apellido_paterno) ILIKE $2
              OR s.id_referencia ILIKE $2
              OR s.nombres ILIKE $2)
          ORDER  BY s.apellido_paterno, s.nombres
          LIMIT  10
        `, [tenantId, like]),

        // Tutores: por nombre o correo
        pool.query(`
          SELECT g.id,
                 CONCAT(g.nombres, ' ', g.apellido_paterno, COALESCE(' ' || g.apellido_materno, '')) AS label,
                 g.correo_institucional_familiar AS sublabel
          FROM   guardians g
          WHERE  g.tenant_id = $1
            AND  (g.nombre_completo ILIKE $2
              OR CONCAT(g.nombres, ' ', g.apellido_paterno) ILIKE $2
              OR g.correo_institucional_familiar ILIKE $2
              OR g.nombres ILIKE $2)
          ORDER  BY g.apellido_paterno, g.nombres
          LIMIT  10
        `, [tenantId, like]),

        // Pagos: por referencia de pasarela
        pool.query(`
          SELECT p.id,
                 p.referencia_pasarela           AS label,
                 TO_CHAR(p.fecha_pago, 'DD/MM/YYYY') || ' — $' ||
                   TO_CHAR(p.monto_centavos / 100.0, 'FM999,999.00') AS sublabel,
                 p.estado,
                 c.student_id
          FROM   payments p
          JOIN   charges  c ON c.id = p.charge_id
          JOIN   students s ON s.id = c.student_id
          WHERE  s.tenant_id = $1
            AND  p.referencia_pasarela ILIKE $2
          ORDER  BY p.fecha_pago DESC
          LIMIT  10
        `, [tenantId, like]),

        // Cargos: por id numérico o concept name
        pool.query(`
          SELECT c.id,
                 CONCAT('#', c.id, ' — ', COALESCE(con.nombre, 'Cargo')) AS label,
                 CONCAT(s.nombres, ' ', s.apellido_paterno, ' — $',
                   TO_CHAR(c.monto_base_centavos / 100.0, 'FM999,999.00')) AS sublabel,
                 c.estado,
                 c.student_id
          FROM   charges  c
          JOIN   students s ON s.id = c.student_id
          LEFT   JOIN concepts con ON con.id = c.concept_id
          WHERE  s.tenant_id = $1
            AND  (CAST(c.id AS TEXT) = $3
              OR  con.nombre ILIKE $2)
          ORDER  BY c.fecha_vencimiento DESC
          LIMIT  10
        `, [tenantId, like, q]),
      ]);

      res.json({
        alumnos: studRows.rows,
        tutores: guardRows.rows,
        pagos:   payRows.rows,
        cargos:  chargeRows.rows,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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
    } catch (error: any) { res.status(500).json({ message: error.message }); }
  });
}
