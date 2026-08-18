import type { Express } from "express";
import { pool, db } from "../db";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";
import {
  authenticateToken,
  esmRequire,
  checkCampusTenant,
  hasPermissionForUser,
  uploadBinary,
} from "./shared";
import { MODULES, ACTIONS } from "@shared/permissions";
import { invoices, payments, charges, students, campus_invoicing_config } from "@shared/schema";
import { z } from "zod";
import { getInvoicingProvider } from "../lib/invoicing/get-invoicing-provider";
import {
  ProviderAuthError,
  ProviderValidationError,
  ProviderNetworkError,
  ProviderStampError,
} from "../lib/invoicing/invoicing-provider";
import { enqueueAuditLog, type AuditLogPayload } from "../audit-retry";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Mensaje estándar de 503 cuando no hay adaptador real configurado. */
const MSG_SIN_ADAPTADOR =
  "Proveedor de facturación no configurado — " +
  "registra el CSD de la escuela en /api/fiscal/registrar-organizacion " +
  "e implementa el adaptador concreto antes de activar el timbrado real.";

const MSG_SIN_CONFIG =
  "Este campus no tiene configurado un proveedor de timbrado. " +
  "Registra el CSD primero en /api/fiscal/registrar-organizacion.";

/** Carga campus_invoicing_config para el campus del JWT. Devuelve null si no existe. */
async function loadInvoicingConfig(campusId: number) {
  const rows = await pool.query<{
    id: number; proveedor: string; organizacion_id: string | null;
    rfc: string | null; razon_social: string | null; estado: string;
    ambiente: string; regimen_fiscal: string; uso_cfdi_default: string;
    timbrado_automatico: boolean; fecha_vencimiento_csd: string | null;
  }>(
    `SELECT id, proveedor, organizacion_id, rfc, razon_social, estado,
            ambiente, regimen_fiscal, uso_cfdi_default, timbrado_automatico,
            fecha_vencimiento_csd
     FROM campus_invoicing_config WHERE campus_id = $1 LIMIT 1`,
    [campusId],
  );
  return rows.rows[0] ?? null;
}

// ─── Rutas fiscales ───────────────────────────────────────────────────────────

export function registerFiscalRoutes(app: Express): void {

  // ── 1. Pendientes de timbrado (con campusId explícito) ───────────────────
  app.get("/api/fiscal/pendientes-cfdi/:campusId", authenticateToken, async (req: any, res) => {
    try {
      if (!hasPermissionForUser(req.user, MODULES.FISCAL, ACTIONS.READ)) {
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

  // ── 2. Timbrar lote — requiere adaptador concreto configurado ────────────
  //
  // CAMBIO vs. stub anterior: ya NO genera UUIDs 'DEMO-...' simulados.
  // Falla honestamente con 503 hasta que exista un adaptador real.
  app.post("/api/fiscal/timbrar-lote", authenticateToken, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.FISCAL, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para ejecutar operaciones fiscales" });
      }
      const campusId = (req as any).user?.campus_id;
      const { payment_ids } = req.body;
      if (!Array.isArray(payment_ids) || payment_ids.length === 0) {
        return res.status(400).json({ message: "No hay pagos seleccionados" });
      }

      // Verificar que el campus tiene configuración de timbrado activa
      const config = await loadInvoicingConfig(campusId);
      if (!config || config.estado !== 'activo' || !config.organizacion_id) {
        return res.status(503).json({ message: MSG_SIN_CONFIG, code: 'CAMPUS_SIN_CONFIGURAR' });
      }

      // Intentar obtener el adaptador — falla hasta que exista implementación real
      let provider;
      try {
        provider = getInvoicingProvider(config.proveedor);
      } catch (err: any) {
        return res.status(503).json({ message: MSG_SIN_ADAPTADOR, code: 'PROVIDER_NOT_CONFIGURED', detail: err.message });
      }

      let timbrados = 0; let errores = 0;
      const resultados: any[] = [];

      for (const pid of payment_ids) {
        try {
          // Verificar que el pago pertenece al campus del JWT
          const pRows = await pool.query(
            `SELECT p.id, p.monto_centavos, s.curp AS curp_alumno,
                    s.nivel_educativo, g.rfc AS rfc_receptor, g.nombres AS nombre_receptor,
                    ii.cct, ii.rvoe, s.nivel_educativo AS nivel_edu_alumno
             FROM payments p
             JOIN charges c ON c.id = p.charge_id
             JOIN students s ON s.id = c.student_id
             LEFT JOIN student_guardian sg ON sg.student_id = s.id
             LEFT JOIN guardians g ON g.id = sg.guardian_id
             LEFT JOIN institutional_info ii ON ii.campus_id = s.campus_id
               AND ii.seccion_educativa = UPPER(SPLIT_PART(s.nivel_escolar,' ',1))
             WHERE p.id = $1 AND s.campus_id = $2`,
            [pid, campusId],
          );

          if ((pRows.rows as any[]).length === 0) {
            errores++;
            resultados.push({ payment_id: pid, status: 'error', motivo: 'pago_no_encontrado' });
            continue;
          }

          const pago = pRows.rows[0] as any;

          // Validar campos IEDU obligatorios antes de llamar al proveedor
          if (!pago.curp_alumno || !pago.nivel_edu_alumno) {
            errores++;
            resultados.push({ payment_id: pid, status: 'error', motivo: 'datos_iedu_incompletos' });
            continue;
          }

          const cfdiInput = {
            rfc_receptor:            pago.rfc_receptor || 'XAXX010101000',
            nombre_receptor:         pago.nombre_receptor || 'Público en General',
            uso_cfdi:                config.uso_cfdi_default,
            regimen_fiscal_receptor: '605',
            forma_pago:              '01',
            metodo_pago:             'PUE' as const,
            monto_centavos:          Number(pago.monto_centavos),
            concepto_descripcion:    'Servicios de educación',
            clave_prod_serv:         pago.nivel_edu_alumno === 'Bachillerato o su equivalente' ? '86121600' : '86121500',
            clave_unidad:            'E48',
            curp_alumno:             pago.curp_alumno,
            nivel_educativo:         pago.nivel_edu_alumno,
            aut_rvoe:                pago.rvoe || pago.cct || '',
            payment_id:              Number(pid),
          };

          const result = await provider.timbrar(config.organizacion_id, cfdiInput);

          await pool.query(
            `INSERT INTO invoices (payment_id, uuid_cfdi, xml_content, pdf_base64, estado, tenant_id)
             VALUES ($1, $2, $3, $4, 'emitido', $5)
             ON CONFLICT (payment_id) DO UPDATE
               SET uuid_cfdi = EXCLUDED.uuid_cfdi,
                   xml_content = EXCLUDED.xml_content,
                   pdf_base64 = EXCLUDED.pdf_base64,
                   estado = 'emitido',
                   updated_at = now()`,
            [pid, result.uuid, result.xml_content, result.pdf_base64,
             (req as any).user?.tenant_id ?? null],
          );

          timbrados++;
          resultados.push({ payment_id: pid, uuid: result.uuid, status: 'ok' });

        } catch (err: any) {
          errores++;
          resultados.push({
            payment_id: pid, status: 'error',
            motivo: err instanceof ProviderValidationError ? 'datos_invalidos'
                  : err instanceof ProviderStampError      ? 'error_sat'
                  : err instanceof ProviderNetworkError    ? 'error_red'
                  : 'error_interno',
          });
        }
      }

      res.json({ timbrados, errores, total: payment_ids.length, resultados });
    } catch (error: any) {
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ── 3. Base /api/fiscal ──────────────────────────────────────────────────
  app.get("/api/fiscal", authenticateToken, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.FISCAL, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para acceder a información fiscal" });
      }
      const campusId = (req as any).user?.campus_id;
      const rows = await pool.query(
        `SELECT COUNT(*) as total_invoices FROM invoices i
         JOIN payments p ON p.id = i.payment_id
         JOIN charges c  ON c.id = p.charge_id
         JOIN students s ON s.id = c.student_id
         WHERE s.campus_id = $1`,
        [campusId],
      ).catch(() => ({ rows: [{ total_invoices: 0 }] }));
      res.json({ total_invoices: Number((rows.rows[0] as any)?.total_invoices || 0) });
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  // ── 4. Pendientes sin campusId (usa campus del JWT) ──────────────────────
  app.get("/api/fiscal/pendientes-cfdi", authenticateToken, async (req, res) => {
    try {
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

  // ── 5. Estadísticas CFDI ─────────────────────────────────────────────────
  app.get("/api/fiscal/estadisticas-cfdi", authenticateToken, async (req, res) => {
    try {
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
        emitidos:      Number((emitidosRows.rows[0] as any)?.cnt   || 0),
        monto_emitido: Number((emitidosRows.rows[0] as any)?.monto || 0),
        pendientes:    Number((pendientesRows.rows[0] as any)?.cnt  || 0),
        cancelados:    Number((canceladosRows.rows[0] as any)?.cnt  || 0),
      });
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  // ── 6. Regenerar CFDI — requiere adaptador concreto ─────────────────────
  //
  // CAMBIO vs. stub anterior: ya NO genera UUIDs 'REGEN-...' simulados.
  // Falla honestamente con 503 hasta que exista un adaptador real.
  app.post("/api/fiscal/regenerar-cfdi/:id", authenticateToken, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.FISCAL, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para ejecutar operaciones fiscales" });
      }
      const campusId = (req as any).user?.campus_id;

      const config = await loadInvoicingConfig(campusId);
      if (!config || config.estado !== 'activo' || !config.organizacion_id) {
        return res.status(503).json({ message: MSG_SIN_CONFIG, code: 'CAMPUS_SIN_CONFIGURAR' });
      }
      try {
        getInvoicingProvider(config.proveedor);
      } catch (err: any) {
        return res.status(503).json({ message: MSG_SIN_ADAPTADOR, code: 'PROVIDER_NOT_CONFIGURED', detail: err.message });
      }

      // Con adaptador real: llamaría a provider.timbrar() con los datos del invoice
      // y actualizaría uuid_cfdi, xml_content, pdf_base64 en una txn.
      // Por ahora el proveedor aún no está implementado — el try/catch de arriba lo captura.
      res.status(503).json({ message: MSG_SIN_ADAPTADOR, code: 'PROVIDER_NOT_CONFIGURED' });
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  // ── 7. Cancelar CFDI — requiere adaptador concreto ──────────────────────
  //
  // CAMBIO vs. stub anterior: ya NO actualiza estado en DB sin confirmación SAT.
  // Falla honestamente con 503 hasta que exista un adaptador real.
  app.post("/api/fiscal/cancelar-cfdi", authenticateToken, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.FISCAL, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para ejecutar operaciones fiscales" });
      }
      const campusId = (req as any).user?.campus_id;

      const config = await loadInvoicingConfig(campusId);
      if (!config || config.estado !== 'activo' || !config.organizacion_id) {
        return res.status(503).json({ message: MSG_SIN_CONFIG, code: 'CAMPUS_SIN_CONFIGURAR' });
      }
      try {
        getInvoicingProvider(config.proveedor);
      } catch (err: any) {
        return res.status(503).json({ message: MSG_SIN_ADAPTADOR, code: 'PROVIDER_NOT_CONFIGURED', detail: err.message });
      }

      // Con adaptador real: llamaría a provider.cancelar() → acuse del SAT →
      // storage.updateInvoiceStatus('cancelado', ...) dentro de txn.
      res.status(503).json({ message: MSG_SIN_ADAPTADOR, code: 'PROVIDER_NOT_CONFIGURED' });
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  // ── 8. Registrar organización (CSD) en el proveedor ─────────────────────
  //
  // Flujo seguro: .cer y .key llegan en memoria (uploadBinary.memoryStorage),
  // se reenvían al proveedor en la misma request, y se descartan inmediatamente
  // tras el await. EduPay solo persiste el organizacion_id devuelto.
  app.post(
    "/api/fiscal/registrar-organizacion",
    authenticateToken,
    uploadBinary.fields([
      { name: 'cer', maxCount: 1 },
      { name: 'key', maxCount: 1 },
    ]),
    async (req: any, res) => {
      try {
        if (!hasPermissionForUser(req.user, MODULES.FISCAL, ACTIONS.CONFIGURE)) {
          return res.status(403).json({ message: "Sin permisos para configurar el sistema fiscal" });
        }

        const campusId  = req.user?.campus_id;
        const tenantId  = req.user?.tenant_id;

        // Validar archivos
        const cerFile = req.files?.['cer']?.[0];
        const keyFile = req.files?.['key']?.[0];
        if (!cerFile || !keyFile) {
          return res.status(400).json({ message: "Se requieren los archivos .cer y .key del CSD" });
        }
        // Validar extensiones por nombre de archivo original
        if (!cerFile.originalname.endsWith('.cer')) {
          return res.status(400).json({ message: "El campo 'cer' debe ser un archivo .cer" });
        }
        if (!keyFile.originalname.endsWith('.key')) {
          return res.status(400).json({ message: "El campo 'key' debe ser un archivo .key" });
        }

        const { password, proveedor = 'facturapi' } = req.body;
        if (!password || typeof password !== 'string' || password.trim() === '') {
          return res.status(400).json({ message: "Se requiere la contraseña de la llave privada" });
        }

        if (!await checkCampusTenant(campusId, tenantId, res)) return;

        // Obtener adaptador — falla con error claro si no está implementado
        let provider;
        try {
          provider = getInvoicingProvider(proveedor as string);
        } catch (err: any) {
          return res.status(503).json({
            message: MSG_SIN_ADAPTADOR,
            code: 'PROVIDER_NOT_CONFIGURED',
            detail: err.message,
          });
        }

        // Copiar buffers — inmediatamente tras el await se descartan
        let cerBuf: Buffer | null = Buffer.from(cerFile.buffer);
        let keyBuf: Buffer | null = Buffer.from(keyFile.buffer);

        let resultado;
        try {
          resultado = await provider.registrarOrganizacion(cerBuf, keyBuf, password.trim());
        } catch (err: any) {
          // Descartar antes de retornar error
          cerBuf = null; keyBuf = null;

          if (err instanceof ProviderAuthError) {
            return res.status(422).json({
              message: "El certificado o la contraseña no son válidos. Verifica que .cer y .key correspondan al mismo CSD.",
              code: 'CSD_INVALIDO',
            });
          }
          if (err instanceof ProviderNetworkError) {
            return res.status(502).json({
              message: "Error de conectividad con el proveedor de timbrado. Intenta de nuevo.",
              code: 'PROVIDER_NETWORK_ERROR',
            });
          }
          return res.status(502).json({ message: "Error al registrar el CSD en el proveedor.", detail: err.message });
        }

        // Descartar buffers — ya no se necesitan
        cerBuf = null; keyBuf = null;

        // Persistir solo el organizacion_id (nunca los bytes del CSD)
        await pool.query(
          `INSERT INTO campus_invoicing_config
             (campus_id, tenant_id, proveedor, organizacion_id, rfc, razon_social,
              fecha_vencimiento_csd, estado, ultimo_error)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'activo',NULL)
           ON CONFLICT (campus_id) DO UPDATE SET
             proveedor             = EXCLUDED.proveedor,
             organizacion_id       = EXCLUDED.organizacion_id,
             rfc                   = EXCLUDED.rfc,
             razon_social          = EXCLUDED.razon_social,
             fecha_vencimiento_csd = EXCLUDED.fecha_vencimiento_csd,
             estado                = 'activo',
             ultimo_error          = NULL,
             updated_at            = now()`,
          [campusId, tenantId, proveedor, resultado.organizacion_id,
           resultado.rfc, resultado.razon_social, resultado.fecha_vencimiento_csd],
        );

        // Audit fuera de txn (ADR-001)
        // No se loguean buffers del CSD — solo metadata de trazabilidad
        const auditPayload: AuditLogPayload = {
          tenant_id:   tenantId,
          user_id:     req.user?.id ?? null,
          action:      'registrar_organizacion_csd',
          entity_type: 'campus_invoicing_config',
          entity_id:   campusId,
          metadata: {
            flujo:           'registrar_organizacion_csd',
            rfc:             resultado.rfc,
            proveedor,
            organizacion_id: resultado.organizacion_id,
            campus_id:       campusId,
          },
        };
        pool.query(
          `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [tenantId, req.user?.id, auditPayload.action,
           auditPayload.entity_type, auditPayload.entity_id,
           JSON.stringify(auditPayload.metadata)],
        ).catch((err) => enqueueAuditLog(auditPayload, err));

        res.status(201).json({
          organizacion_id:       resultado.organizacion_id,
          rfc:                   resultado.rfc,
          razon_social:          resultado.razon_social,
          fecha_vencimiento_csd: resultado.fecha_vencimiento_csd,
          proveedor,
          ambiente:              'sandbox',
          estado:                'activo',
        });
      } catch (error: any) {
        res.status(500).json({ message: "Error interno del servidor" });
      }
    },
  );

  // ── 9. Estado del PAC — ahora lee desde campus_invoicing_config ─────────
  app.get("/api/fiscal/estado-pac", authenticateToken, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.FISCAL, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para acceder a información fiscal" });
      }
      const campusId = (req as any).user?.campus_id;
      const config = await loadInvoicingConfig(campusId);
      if (!config) {
        return res.json({
          pac: null, estado: 'sin_configurar', ambiente: null,
          timbres_disponibles: 0, timbres_usados: 0, organizacion_id: null,
        });
      }
      res.json({
        pac:                   config.proveedor,
        estado:                config.estado,
        ambiente:              config.ambiente,
        rfc:                   config.rfc,
        razon_social:          config.razon_social,
        fecha_vencimiento_csd: config.fecha_vencimiento_csd,
        organizacion_id:       config.organizacion_id,
        timbres_disponibles:   null,  // se obtiene del proveedor cuando adaptador esté activo
        timbres_usados:        null,
      });
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  // ── 10. Configurar PAC — stub temporal (la ruta real es registrar-organizacion) ─
  app.post("/api/fiscal/configurar-pac", authenticateToken, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.FISCAL, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para ejecutar operaciones fiscales" });
      }
      // Este endpoint era un stub que no persistía nada.
      // La configuración real del PAC se hace mediante:
      //   POST /api/fiscal/registrar-organizacion (multipart con .cer/.key)
      // Se mantiene esta URL para compatibilidad con el frontend existente,
      // pero redirige semánticamente al nuevo flujo.
      return res.status(400).json({
        message: "Para configurar el PAC sube el CSD de la escuela en POST /api/fiscal/registrar-organizacion",
        code: 'USE_REGISTRAR_ORGANIZACION',
      });
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  // ── 11. Config automática — migrada de fiscal_config a campus_invoicing_config ─
  app.get("/api/fiscal/config-automatica", authenticateToken, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.FISCAL, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para acceder a información fiscal" });
      }
      const campusId = (req as any).user?.campus_id;
      const config = await loadInvoicingConfig(campusId);
      if (config) {
        res.json({
          habilitado:          config.estado === 'activo',
          timbrado_automatico: config.timbrado_automatico,
          pac_nombre:          config.proveedor,
          regimen_fiscal:      config.regimen_fiscal,
          uso_cfdi:            config.uso_cfdi_default,
          estado:              config.estado,
          ambiente:            config.ambiente,
          organizacion_id:     config.organizacion_id,
          rfc:                 config.rfc,
        });
      } else {
        // Defaults — misma forma que devolvía el stub anterior para no romper el frontend
        res.json({
          habilitado: false, timbrado_automatico: false,
          pac_nombre: null, regimen_fiscal: '601', uso_cfdi: 'D10',
          estado: 'sin_configurar', ambiente: 'sandbox', organizacion_id: null, rfc: null,
        });
      }
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  app.put("/api/fiscal/config-automatica", authenticateToken, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.FISCAL, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para ejecutar operaciones fiscales" });
      }
      const campusId = (req as any).user?.campus_id;
      const tenantId = (req as any).user?.tenant_id;
      const { timbrado_automatico, regimen_fiscal, uso_cfdi, ambiente } = req.body;

      await pool.query(
        `INSERT INTO campus_invoicing_config
           (campus_id, tenant_id, timbrado_automatico, regimen_fiscal, uso_cfdi_default, ambiente)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (campus_id) DO UPDATE SET
           timbrado_automatico = EXCLUDED.timbrado_automatico,
           regimen_fiscal      = EXCLUDED.regimen_fiscal,
           uso_cfdi_default    = EXCLUDED.uso_cfdi_default,
           ambiente            = EXCLUDED.ambiente,
           updated_at          = now()`,
        [campusId, tenantId,
         timbrado_automatico ?? false,
         regimen_fiscal      || '601',
         uso_cfdi            || 'D10',
         ambiente            || 'sandbox'],
      );
      res.json({ mensaje: "Configuración guardada" });
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  // ── 12. Reportes SAT / Contable — stubs (pendientes de implementación real) ──
  app.post("/api/fiscal/generar-reporte-contable", authenticateToken, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.FISCAL, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para ejecutar operaciones fiscales" });
      }
      const { tipo, periodo } = req.body;
      res.json({ url: null, mensaje: `Reporte ${tipo} generado para ${periodo}`, tipo, periodo });
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  app.post("/api/fiscal/generar-reporte-sat", authenticateToken, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.FISCAL, ACTIONS.CONFIGURE)) {
        return res.status(403).json({ message: "Sin permisos para ejecutar operaciones fiscales" });
      }
      const { tipo, periodo, formato } = req.body;
      res.json({ url: null, mensaje: `Reporte SAT ${tipo} generado para ${periodo}`, tipo, periodo, formato: formato || 'xml' });
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  // ── 13. Estadísticas SAT (alias para fiscal-contable frontend) ───────────
  app.get("/api/fiscal/estadisticas-sat", authenticateToken, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.FISCAL, ACTIONS.READ)) {
        return res.status(403).json({ message: "Sin permisos para acceder a información fiscal" });
      }
      const campusId = (req as any).user?.campus_id;
      const rows = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE i.estado = 'emitido')   AS emitidos,
           COUNT(*) FILTER (WHERE i.estado = 'cancelado') AS cancelados,
           COUNT(*) FILTER (WHERE i.estado = 'pendiente') AS pendientes,
           COUNT(*) AS total_cfdis
         FROM invoices i
         JOIN payments p ON p.id = i.payment_id
         JOIN charges  c ON c.id = p.charge_id
         JOIN students s ON s.id = c.student_id
         WHERE s.campus_id = $1`,
        [campusId],
      ).catch(() => ({ rows: [{ emitidos: 0, cancelados: 0, pendientes: 0, total_cfdis: 0 }] }));
      const r = rows.rows[0] as any;
      res.json({
        total_cfdis: Number(r.total_cfdis || 0),
        emitidos:    Number(r.emitidos    || 0),
        cancelados:  Number(r.cancelados  || 0),
        pendientes:  Number(r.pendientes  || 0),
      });
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  // ── 14. Motor de becas automáticas (sin cambios) ─────────────────────────
  app.get("/api/becas-auto/reglas/:campusId", authenticateToken, async (req: any, res) => {
    try {
      const campusId = parseInt(req.params.campusId) || req.user?.campus_id;
      if (!await checkCampusTenant(campusId, req.user?.tenant_id, res)) return;
      const rows = await pool.query(`SELECT * FROM scholarship_auto_rules WHERE campus_id = $1 ORDER BY created_at DESC`, [campusId]);
      res.json(rows.rows);
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  // Alias sin campusId — misma guard que el canonical (SCHOLARSHIPS.ASSIGN)
  app.get("/api/becas-auto/reglas", authenticateToken, async (req: any, res) => {
    try {
      if (!hasPermissionForUser(req.user, MODULES.SCHOLARSHIPS, ACTIONS.ASSIGN)) {
        return res.status(403).json({ message: "Sin permisos para gestionar becas" });
      }
      const campusId = req.user?.campus_id;
      const rows = await pool.query(`SELECT * FROM scholarship_auto_rules WHERE campus_id = $1 ORDER BY created_at DESC`, [campusId]);
      res.json(rows.rows);
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  app.post("/api/becas-auto/reglas", authenticateToken, async (req: any, res) => {
    try {
      if (!hasPermissionForUser(req.user, MODULES.SCHOLARSHIPS, ACTIONS.ASSIGN)) {
        return res.status(403).json({ message: "Sin permisos para gestionar becas" });
      }
      const campusId = req.user?.campus_id;
      const tenantId = req.user?.tenant_id;
      const { nombre, tipo, descuento_porcentaje, condicion_json, aplica_a } = req.body;
      const row = await pool.query(
        `INSERT INTO scholarship_auto_rules
           (campus_id, tenant_id, nombre, tipo, descuento_porcentaje, condicion_json, aplica_a)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [campusId, tenantId, nombre, tipo, Number(descuento_porcentaje),
         condicion_json || null, aplica_a || 'todos'],
      );
      res.json((row.rows as any[])[0]);
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  app.delete("/api/becas-auto/reglas/:id", authenticateToken, async (req, res) => {
    try {
      if (!hasPermissionForUser((req as any).user, MODULES.SCHOLARSHIPS, ACTIONS.ASSIGN)) {
        return res.status(403).json({ message: "Sin permisos para gestionar becas" });
      }
      const campusId = (req as any).user?.campus_id;
      await pool.query(
        `DELETE FROM scholarship_auto_rules WHERE id = $1 AND campus_id = $2`,
        [parseInt(req.params.id), campusId],
      );
      res.json({ message: "Regla eliminada" });
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });

  app.post("/api/becas-auto/ejecutar/:campusId", authenticateToken, async (req: any, res) => {
    try {
      if (!hasPermissionForUser(req.user, MODULES.SCHOLARSHIPS, ACTIONS.ASSIGN)) {
        return res.status(403).json({ message: "Sin permisos para gestionar becas" });
      }
      const campusId = parseInt(req.params.campusId) || req.user?.campus_id;
      if (!await checkCampusTenant(campusId, req.user?.tenant_id, res)) return;
      const reglas = await pool.query(
        `SELECT * FROM scholarship_auto_rules WHERE campus_id = $1 AND activo = true`,
        [campusId],
      );
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
    } catch (error: any) { res.status(500).json({ message: "Error interno del servidor" }); }
  });
}
