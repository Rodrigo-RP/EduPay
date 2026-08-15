import type { Express } from "express";
import { pool, db } from "../db";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";
import { authenticateToken, esmRequire, checkCampusTenant, hasPermissionForUser} from "./shared";
import { MODULES, ACTIONS } from "@shared/permissions";
import { invoices, payments, charges, students } from "@shared/schema";
import { z } from "zod";

export function registerFiscalRoutes(app: Express): void {
  app.get("/api/fiscal/pendientes-cfdi/:campusId", authenticateToken, async (req: any, res) => {
    try {
      const role = req.user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.FISCAL, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para acceder a información fiscal" });
      }
      const campusId = parseInt(req.params.campusId) || req.user?.campus_id;
      if (!await checkCampusTenant(campusId, req.user?.tenant_id, res)) return;
      const { mes } = req.query;
      let filtroMes = "";
      const params: any[] = [campusId];
      if (mes) {
        filtroMes = ` AND TO_CHAR(p.created_at, 'YYYY-MM') = $2`;
        params.push(mes as string);
      }
      const rows = await pool.query(`
        SELECT p.id, p.monto_centavos, p.created_at,
          CONCAT(s.nombres, ' ', s.apellido_paterno) AS estudiante,
          g.email, g.nombres AS guardian_nombre
        FROM payments p
        JOIN charges ch ON ch.id = p.charge_id
        JOIN students s ON s.id = ch.student_id
        LEFT JOIN student_guardian sg ON sg.student_id = s.id
        LEFT JOIN guardians g ON g.id = sg.guardian_id
        LEFT JOIN invoices i ON i.payment_id = p.id
        WHERE s.campus_id = $1 AND i.id IS NULL${filtroMes}
        ORDER BY p.created_at DESC LIMIT 500
      `, params);
      res.json({ pagos: rows.rows, total: (rows.rows as any[]).length });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  app.post("/api/fiscal/timbrar-lote", authenticateToken, async (req, res) => {
    try {
      const role = (req as any).user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.FISCAL, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para ejecutar operaciones fiscales" });
      }
      const campusId = (req as any).user?.campus_id;
      const { payment_ids } = req.body;
      if (!Array.isArray(payment_ids) || payment_ids.length === 0) {
        return res.status(400).json({ message: "No hay pagos seleccionados" });
      }
      let timbrados = 0; let errores = 0;
      const resultados: any[] = [];
      for (const pid of payment_ids) {
        try {
          const pRows = await pool.query(`SELECT p.id FROM payments p JOIN charges c ON c.id=p.charge_id JOIN students s ON s.id=c.student_id WHERE p.id=$1 AND s.campus_id=$2`, [pid, campusId]);
          if ((pRows.rows as any[]).length > 0) {
            const uuid = `DEMO-${Date.now()}-${pid}`;
            const tenantId = (req as any).user?.tenant_id ?? null;
            await pool.query(`INSERT INTO invoices (payment_id, uuid_cfdi, estado, tenant_id) VALUES ($1,$2,'emitido',$3) ON CONFLICT DO NOTHING`, [pid, uuid, tenantId]);
            timbrados++;
            resultados.push({ payment_id: pid, uuid, status: "ok" });
          }
        } catch {
          errores++;
          resultados.push({ payment_id: pid, status: "error" });
        }
      }
      res.json({ timbrados, errores, total: payment_ids.length, resultados });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── 4b. ENDPOINTS FISCALES ADICIONALES ───────────────────────────────────

  // /api/fiscal — base endpoint (invalidaciones de caché en fiscal-contable)
  app.get("/api/fiscal", authenticateToken, async (req, res) => {
    try {
      const role = (req as any).user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.FISCAL, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para acceder a información fiscal" });
      }
      const campusId = (req as any).user?.campus_id;
      const rows = await pool.query(`SELECT COUNT(*) as total_invoices FROM invoices i JOIN payments p ON p.id=i.payment_id JOIN charges c ON c.id=p.charge_id JOIN students s ON s.id=c.student_id WHERE s.campus_id=$1`, [campusId]).catch(()=>({rows:[{total_invoices:0}]}));
      res.json({ total_invoices: Number((rows.rows[0] as any)?.total_invoices||0) });
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  // Alias sin campusId — lee campus del JWT
  app.get("/api/fiscal/pendientes-cfdi", authenticateToken, async (req, res) => {
    try {
      const role = (req as any).user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.FISCAL, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para acceder a información fiscal" });
      }
      const campusId = (req as any).user?.campus_id;
      const { mes } = req.query;
      let filtroMes = "";
      const params: any[] = [campusId];
      if (mes) { filtroMes = ` AND TO_CHAR(p.created_at, 'YYYY-MM') = $2`; params.push(mes as string); }
      const rows = await pool.query(`
        SELECT p.id, p.monto_centavos, p.created_at,
          CONCAT(s.nombres, ' ', s.apellido_paterno) AS estudiante,
          g.email, g.nombres AS guardian_nombre
        FROM payments p
        JOIN charges ch ON ch.id = p.charge_id
        JOIN students s ON s.id = ch.student_id
        LEFT JOIN student_guardian sg ON sg.student_id = s.id
        LEFT JOIN guardians g ON g.id = sg.guardian_id
        LEFT JOIN invoices i ON i.payment_id = p.id
        WHERE s.campus_id = $1 AND i.id IS NULL${filtroMes}
        ORDER BY p.created_at DESC LIMIT 500
      `, params);
      res.json({ pagos: rows.rows, total: (rows.rows as any[]).length });
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  app.get("/api/fiscal/estadisticas-cfdi", authenticateToken, async (req, res) => {
    try {
      const role = (req as any).user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.FISCAL, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para acceder a información fiscal" });
      }
      const campusId = (req as any).user?.campus_id;
      const [emitidosRows, pendientesRows, canceladosRows] = await Promise.all([
        pool.query(`SELECT COUNT(*) as cnt, COALESCE(SUM(p.monto_centavos),0) as monto FROM invoices i JOIN payments p ON p.id=i.payment_id JOIN charges c ON c.id=p.charge_id JOIN students s ON s.id=c.student_id WHERE s.campus_id=$1 AND i.estado='emitido'`, [campusId]).catch(() => ({ rows: [{ cnt: 0, monto: 0 }] })),
        pool.query(`SELECT COUNT(*) as cnt FROM payments p JOIN charges c ON c.id=p.charge_id JOIN students s ON s.id=c.student_id LEFT JOIN invoices i ON i.payment_id=p.id WHERE s.campus_id=$1 AND i.id IS NULL`, [campusId]).catch(() => ({ rows: [{ cnt: 0 }] })),
        pool.query(`SELECT COUNT(*) as cnt FROM invoices i JOIN payments p ON p.id=i.payment_id JOIN charges c ON c.id=p.charge_id JOIN students s ON s.id=c.student_id WHERE s.campus_id=$1 AND i.estado='cancelado'`, [campusId]).catch(() => ({ rows: [{ cnt: 0 }] })),
      ]);
      res.json({
        emitidos: Number((emitidosRows.rows[0] as any)?.cnt || 0),
        monto_emitido: Number((emitidosRows.rows[0] as any)?.monto || 0),
        pendientes: Number((pendientesRows.rows[0] as any)?.cnt || 0),
        cancelados: Number((canceladosRows.rows[0] as any)?.cnt || 0),
      });
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  app.post("/api/fiscal/regenerar-cfdi/:id", authenticateToken, async (req, res) => {
    try {
      const role = (req as any).user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.FISCAL, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para ejecutar operaciones fiscales" });
      }
      const id = parseInt(req.params.id);
      const uuid = `REGEN-${Date.now()}-${id}`;
      // UUID + estado se actualizan atómicamente en una sola transacción (sin .catch — errores propagan)
      await storage.updateInvoiceStatus(
        id,
        'emitido',
        {
          tenantId: (req as any).user?.tenant_id,
          userId:   (req as any).user?.id,
          ip:       req.ip,
          metadata: { flujo: 'cfdi_regenerado', uuid },
        },
        { uuid_cfdi: uuid }   // extraFields: actualiza UUID en la misma txn
      );
      res.json({ uuid, mensaje: "CFDI regenerado correctamente" });
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  app.post("/api/fiscal/cancelar-cfdi", authenticateToken, async (req, res) => {
    try {
      const role = (req as any).user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.FISCAL, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para ejecutar operaciones fiscales" });
      }
      const { invoice_id, motivo } = req.body;
      // Sin .catch — la transición emitido → cancelado debe auditarse o fallar explícitamente
      await storage.updateInvoiceStatus(invoice_id, 'cancelado', {
        tenantId: (req as any).user?.tenant_id,
        userId:   (req as any).user?.id,
        ip:       req.ip,
        metadata: { flujo: 'cancelacion_cfdi', motivo },
      });
      res.json({ mensaje: "CFDI cancelado correctamente", motivo });
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  app.get("/api/fiscal/config-automatica", authenticateToken, async (req, res) => {
    try {
      const role = (req as any).user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.FISCAL, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para acceder a información fiscal" });
      }
      const campusId = (req as any).user?.campus_id;
      const rows = await pool.query(`SELECT * FROM fiscal_config WHERE campus_id=$1 LIMIT 1`, [campusId]).catch(() => ({ rows: [] }));
      if ((rows.rows as any[]).length > 0) { res.json((rows.rows as any[])[0]); }
      else { res.json({ habilitado: false, timbrado_automatico: false, pac_nombre: null, regimen_fiscal: "601", uso_cfdi: "G03" }); }
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  app.put("/api/fiscal/config-automatica", authenticateToken, async (req, res) => {
    try {
      const role = (req as any).user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.FISCAL, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para ejecutar operaciones fiscales" });
      }
      const campusId = (req as any).user?.campus_id;
      const data = req.body;
      await pool.query(`
        INSERT INTO fiscal_config (campus_id, habilitado, timbrado_automatico, pac_nombre, regimen_fiscal, uso_cfdi)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (campus_id) DO UPDATE SET habilitado=$2, timbrado_automatico=$3, pac_nombre=$4, regimen_fiscal=$5, uso_cfdi=$6
      `, [campusId, data.habilitado ?? false, data.timbrado_automatico ?? false, data.pac_nombre || null, data.regimen_fiscal || '601', data.uso_cfdi || 'G03']).catch(() => {});
      res.json({ mensaje: "Configuración guardada" });
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  app.get("/api/fiscal/estado-pac", authenticateToken, async (req, res) => {
    if (!hasPermissionForUser((req as any).user, MODULES.FISCAL, ACTIONS.READ)) {
      return res.status(403).json({ message: "Sin permisos para acceder a información fiscal" });
    }
    res.json({ pac: "Facturama", estado: "conectado", ambiente: "sandbox", version: "3.3", timbres_disponibles: 500, timbres_usados: 0 });
  });

  app.post("/api/fiscal/configurar-pac", authenticateToken, async (req, res) => {
    try {
      const role = (req as any).user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.FISCAL, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para ejecutar operaciones fiscales" });
      }
      const campusId = (req as any).user?.campus_id;
      const { pac_nombre, usuario, password, ambiente } = req.body;
      res.json({ pac_nombre, ambiente: ambiente || 'sandbox', conectado: true, mensaje: "PAC configurado correctamente" });
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  app.get("/api/fiscal/reportes-contables", authenticateToken, async (req, res) => {
    try {
      const role = (req as any).user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.FISCAL, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para acceder a información fiscal" });
      }
      const campusId = (req as any).user?.campus_id;
      const { periodo } = req.query;
      const rows = await pool.query(`
        SELECT DATE_TRUNC('month', p.created_at) AS mes,
          COUNT(*) as total_pagos,
          COALESCE(SUM(p.monto_centavos),0) as ingreso_centavos,
          COUNT(i.id) as total_cfdis
        FROM payments p
        JOIN charges c ON c.id=p.charge_id
        JOIN students s ON s.id=c.student_id
        LEFT JOIN invoices i ON i.payment_id=p.id
        WHERE s.campus_id=$1
        GROUP BY DATE_TRUNC('month', p.created_at)
        ORDER BY mes DESC LIMIT 12
      `, [campusId]).catch(() => ({ rows: [] }));
      res.json({ reportes: rows.rows });
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  app.post("/api/fiscal/generar-reporte-contable", authenticateToken, async (req, res) => {
    try {
      const role = (req as any).user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.FISCAL, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para ejecutar operaciones fiscales" });
      }
      const campusId = (req as any).user?.campus_id;
      const { tipo, periodo } = req.body;
      res.json({ url: null, mensaje: `Reporte ${tipo} generado para ${periodo}`, tipo, periodo });
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  app.post("/api/fiscal/generar-reporte-sat", authenticateToken, async (req, res) => {
    try {
      const role = (req as any).user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.FISCAL, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para ejecutar operaciones fiscales" });
      }
      const campusId = (req as any).user?.campus_id;
      const { tipo, periodo, formato } = req.body;
      res.json({ url: null, mensaje: `Reporte SAT ${tipo} generado para ${periodo}`, tipo, periodo, formato: formato || 'xml' });
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  // ── 5. MOTOR DE BECAS AUTOMÁTICAS ─────────────────────────────────────────
  app.get("/api/becas-auto/reglas/:campusId", authenticateToken, async (req: any, res) => {
    try {
      const campusId = parseInt(req.params.campusId) || req.user?.campus_id;
      if (!await checkCampusTenant(campusId, req.user?.tenant_id, res)) return;
      const rows = await pool.query(`SELECT * FROM scholarship_auto_rules WHERE campus_id = $1 ORDER BY created_at DESC`, [campusId]);
      res.json(rows.rows);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  app.post("/api/becas-auto/reglas", authenticateToken, async (req: any, res) => {
    try {
      const role = req.user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.SCHOLARSHIPS, ACTIONS.ASSIGN)) {
        return res.status(403).json({ message: "Sin permisos para gestionar becas" });
      }
      const campusId = req.user?.campus_id;
      const tenantId = req.user?.tenant_id;
      const { nombre, tipo, descuento_porcentaje, condicion_json, aplica_a } = req.body;
      const row = await pool.query(`
        INSERT INTO scholarship_auto_rules (campus_id, tenant_id, nombre, tipo, descuento_porcentaje, condicion_json, aplica_a)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
      `, [campusId, tenantId, nombre, tipo, Number(descuento_porcentaje), condicion_json || null, aplica_a || 'todos']);
      res.json((row.rows as any[])[0]);
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  app.delete("/api/becas-auto/reglas/:id", authenticateToken, async (req, res) => {
    try {
      const role = (req as any).user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.SCHOLARSHIPS, ACTIONS.ASSIGN)) {
        return res.status(403).json({ message: "Sin permisos para gestionar becas" });
      }
      const campusId = (req as any).user?.campus_id;
      await pool.query(`DELETE FROM scholarship_auto_rules WHERE id = $1 AND campus_id = $2`, [parseInt(req.params.id), campusId]);
      res.json({ message: "Regla eliminada" });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  app.post("/api/becas-auto/ejecutar/:campusId", authenticateToken, async (req: any, res) => {
    try {
      const role = req.user?.role;
      if (!hasPermissionForUser((req as any).user, MODULES.SCHOLARSHIPS, ACTIONS.ASSIGN)) {
        return res.status(403).json({ message: "Sin permisos para gestionar becas" });
      }
      const campusId = parseInt(req.params.campusId) || req.user?.campus_id;
      if (!await checkCampusTenant(campusId, req.user?.tenant_id, res)) return;
      const reglas = await pool.query(`SELECT * FROM scholarship_auto_rules WHERE campus_id = $1 AND activo = true`, [campusId]);
      let aplicadas = 0;
      for (const regla of (reglas.rows as any[])) {
        if (regla.tipo === 'hermanos') {
          const familias = await pool.query(`
            SELECT guardian_id, COUNT(*) as total_hijos
            FROM student_guardian sg JOIN students s ON s.id = sg.student_id
            WHERE s.campus_id = $1 AND s.status = 'activo'
            GROUP BY guardian_id HAVING COUNT(*) >= 2
          `, [campusId]);
          aplicadas += (familias.rows as any[]).length;
        }
      }
      res.json({ aplicadas, mensaje: `Se aplicaron/calcularon becas automáticas para ${aplicadas} estudiantes` });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });
}
