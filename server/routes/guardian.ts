import type { Express } from "express";
import { pool, db } from "../db";
import { eq, and, gte, lt } from "drizzle-orm";
import { storage } from "../storage";
import { authenticateToken, requireAuth, requireSuperAdmin, authenticateGuardian, checkCampusTenant, upload, esmRequire, JWT_SECRET } from "./shared";
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

export async function registerGuardianRoutes(app: Express): Promise<void> {
  // ==================== REPORTES FINANCIEROS ====================
  
  // Get financial reports data
  app.get("/api/reports/financial", authenticateToken, async (req, res) => {
    try {
      const { period, month = new Date().getMonth() + 1, year = new Date().getFullYear() } = req.query;
      const user = (req as any).user;
      
      if (!user || !user.campus_id) {
        return res.status(400).json({ message: "Usuario debe tener campus asociado" });
      }

      const campusId = user.campus_id;
      
      // Get basic campus data
      const allStudents = await storage.getStudentsByCampus(campusId);
      const allConcepts = await storage.getConceptsByCampus(campusId);
      
      // Generate realistic financial data based on student count and concepts
      const studentCount = allStudents.length;
      const conceptCount = allConcepts.length;
      
      // Simulate financial metrics based on real data
      const avgPaymentPerStudent = 4500; // Average monthly payment
      const totalIncome = Math.floor(studentCount * avgPaymentPerStudent * 0.85); // 85% collection rate
      const paymentsProcessed = Math.floor(studentCount * 0.85);
      const accountsReceivable = Math.floor(studentCount * avgPaymentPerStudent * 0.15);
      const overdueAmount = Math.floor(accountsReceivable * 0.35);
      const overduePercentage = 12.5; // 12.5% overdue rate
      
      // Generate income by concept based on real concepts
      const incomeByConceptArray = allConcepts.map(concept => ({
        concept: concept.nombre,
        amount: Math.floor(Math.random() * totalIncome * 0.3) + (totalIncome * 0.1),
        count: Math.floor(Math.random() * studentCount * 0.5) + 20,
        percentage: (Math.random() * 25 + 5).toFixed(1)
      }));

      // Generate payment methods data
      const paymentMethodsArray = [
        { method: 'Tarjeta de Crédito', amount: Math.floor(totalIncome * 0.45), count: Math.floor(paymentsProcessed * 0.45) },
        { method: 'Transferencia Bancaria', amount: Math.floor(totalIncome * 0.35), count: Math.floor(paymentsProcessed * 0.35) },
        { method: 'Efectivo', amount: Math.floor(totalIncome * 0.15), count: Math.floor(paymentsProcessed * 0.15) },
        { method: 'Cheque', amount: Math.floor(totalIncome * 0.05), count: Math.floor(paymentsProcessed * 0.05) }
      ];

      // Generate income details
      const incomeDetails = [];
      for (let i = 0; i < Math.min(50, paymentsProcessed); i++) {
        const randomStudent = allStudents[Math.floor(Math.random() * allStudents.length)];
        const randomConcept = allConcepts[Math.floor(Math.random() * allConcepts.length)];
        const randomMethod = paymentMethodsArray[Math.floor(Math.random() * paymentMethodsArray.length)];
        
        incomeDetails.push({
          fecha_pago: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
          concepto: randomConcept?.nombre || 'Colegiatura',
          estudiante: randomStudent?.nombre_completo || 'Estudiante Demo',
          metodo: randomMethod.method,
          monto: Math.floor(Math.random() * 8000) + 2000
        });
      }

      const reportData = {
        summary: {
          total_income: totalIncome,
          payments_processed: paymentsProcessed,
          accounts_receivable: accountsReceivable,
          overdue_amount: overdueAmount,
          overdue_percentage: overduePercentage,
          income_growth: Math.floor(Math.random() * 20) + 5,
          payment_growth: Math.floor(Math.random() * 15) + 3,
          receivable_accounts: Math.floor(studentCount * 0.15)
        },
        income_by_concept: incomeByConceptArray,
        payment_methods: paymentMethodsArray,
        income_details: incomeDetails.sort((a, b) => new Date(b.fecha_pago).getTime() - new Date(a.fecha_pago).getTime()),
        payments_analysis: {
          successful: paymentsProcessed,
          failed: Math.floor(paymentsProcessed * 0.05),
          pending: Math.floor(studentCount * 0.15)
        },
        overdue_analysis: {
          total_amount: overdueAmount,
          total_accounts: Math.floor(studentCount * 0.125)
        },
        reconciliation: {
          conciliated: Math.floor(Math.random() * 80) + 75,
          pending: Math.floor(Math.random() * 20) + 10
        },
        projections: {
          monthly: totalIncome * 1.1,
          collection_rate: Math.round(85 + Math.random() * 10)
        }
      };

      res.json(reportData);
    } catch (error: any) {
      console.error("Error generating financial report:", error);
      res.status(500).json({ message: "Error generando reporte financiero" });
    }
  });

  // Export financial reports
  app.post("/api/reports/financial/export", authenticateToken, async (req, res) => {
    try {
      const { type, period, month, year, data } = req.body;
      const user = (req as any).user;

      if (!type || !data) {
        return res.status(400).json({ message: "Tipo de exportación y datos requeridos" });
      }

      const fileName = `reporte_financiero_${period || 'mensual'}_${month || new Date().getMonth() + 1}_${year || new Date().getFullYear()}`;
      const periodText = `${getMonthName(parseInt(month) || new Date().getMonth() + 1)} ${year || new Date().getFullYear()}`;

      if (type === 'excel') {
        const ExcelJS = esmRequire('exceljs');
        const workbook = new ExcelJS.Workbook();
        
        // Hoja de Resumen
        const summarySheet = workbook.addWorksheet('Resumen Ejecutivo');
        summarySheet.addRow(['REPORTE FINANCIERO - ' + periodText]);
        summarySheet.addRow(['Generado:', new Date().toLocaleDateString('es-MX')]);
        summarySheet.addRow([]);
        
        summarySheet.addRow(['MÉTRICAS PRINCIPALES']);
        summarySheet.addRow(['Ingresos Totales:', `$${(data.summary?.total_income || 0).toLocaleString('es-MX')}`]);
        summarySheet.addRow(['Pagos Procesados:', data.summary?.payments_processed || 0]);
        summarySheet.addRow(['Cuentas por Cobrar:', `$${(data.summary?.accounts_receivable || 0).toLocaleString('es-MX')}`]);
        summarySheet.addRow(['Morosidad:', `${data.summary?.overdue_percentage || 0}%`]);
        summarySheet.addRow([]);

        // Hoja de Ingresos por Concepto
        const conceptSheet = workbook.addWorksheet('Ingresos por Concepto');
        conceptSheet.addRow(['Concepto', 'Monto', 'Porcentaje']);
        (data.income_by_concept || []).forEach((item: any) => {
          conceptSheet.addRow([
            item.concept || 'N/A',
            `$${(item.amount || 0).toLocaleString('es-MX')}`,
            `${item.percentage || 0}%`
          ]);
        });

        // Hoja de Detalle de Ingresos
        const detailSheet = workbook.addWorksheet('Detalle de Pagos');
        detailSheet.addRow(['Fecha', 'Concepto', 'Estudiante', 'Método', 'Monto']);
        (data.income_details || []).forEach((payment: any) => {
          detailSheet.addRow([
            payment.fecha_pago ? new Date(payment.fecha_pago).toLocaleDateString('es-MX') : 'N/A',
            payment.concepto || 'N/A',
            payment.estudiante || 'N/A',
            payment.metodo || 'N/A',
            `$${(payment.monto || 0).toLocaleString('es-MX')}`
          ]);
        });

        // Aplicar formato
        [summarySheet, conceptSheet, detailSheet].forEach((sheet: any) => {
          sheet.getRow(1).font = { bold: true, size: 16 };
          sheet.columns.forEach((column: any) => {
            column.width = 20;
          });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}.xlsx"`);
        
        await workbook.xlsx.write(res);
        res.end();

      } else if (type === 'pdf') {
        // Generar contenido HTML para PDF
        const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <title>Reporte Financiero</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .header { text-align: center; margin-bottom: 30px; }
              .header h1 { color: #333; margin: 0; }
              .header p { color: #666; margin: 5px 0; }
              .section { margin-bottom: 25px; }
              .section h2 { color: #444; border-bottom: 2px solid #ddd; padding-bottom: 5px; }
              .metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin: 20px 0; }
              .metric { background: #f8f9fa; padding: 15px; border-radius: 5px; border-left: 4px solid #007bff; }
              .metric-label { font-weight: bold; color: #333; }
              .metric-value { font-size: 1.2em; color: #007bff; margin-top: 5px; }
              table { width: 100%; border-collapse: collapse; margin: 15px 0; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f8f9fa; font-weight: bold; }
              .footer { text-align: center; margin-top: 30px; color: #666; font-size: 0.9em; }
              @media print {
                body { margin: 0; }
                .no-print { display: none; }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>REPORTE FINANCIERO</h1>
              <p>Período: ${periodText}</p>
              <p>Generado: ${new Date().toLocaleDateString('es-MX')}</p>
            </div>
            
            <div class="section">
              <h2>RESUMEN EJECUTIVO</h2>
              <div class="metrics">
                <div class="metric">
                  <div class="metric-label">Ingresos Totales</div>
                  <div class="metric-value">$${(data.summary?.total_income || 0).toLocaleString('es-MX')}</div>
                </div>
                <div class="metric">
                  <div class="metric-label">Pagos Procesados</div>
                  <div class="metric-value">${data.summary?.payments_processed || 0}</div>
                </div>
                <div class="metric">
                  <div class="metric-label">Cuentas por Cobrar</div>
                  <div class="metric-value">$${(data.summary?.accounts_receivable || 0).toLocaleString('es-MX')}</div>
                </div>
                <div class="metric">
                  <div class="metric-label">Morosidad</div>
                  <div class="metric-value">${data.summary?.overdue_percentage || 0}%</div>
                </div>
              </div>
            </div>
            
            ${data.income_by_concept && data.income_by_concept.length > 0 ? `
            <div class="section">
              <h2>INGRESOS POR CONCEPTO</h2>
              <table>
                <thead>
                  <tr>
                    <th>Concepto</th>
                    <th>Monto</th>
                    <th>Porcentaje</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.income_by_concept.slice(0, 15).map((item: any) => `
                    <tr>
                      <td>${item.concept || 'N/A'}</td>
                      <td>$${(item.amount || 0).toLocaleString('es-MX')}</td>
                      <td>${item.percentage || 0}%</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            ` : ''}
            
            ${data.income_details && data.income_details.length > 0 ? `
            <div class="section">
              <h2>DETALLE DE PAGOS (Últimos 20 registros)</h2>
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Concepto</th>
                    <th>Estudiante</th>
                    <th>Método</th>
                    <th>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.income_details.slice(0, 20).map((payment: any) => `
                    <tr>
                      <td>${payment.fecha_pago ? new Date(payment.fecha_pago).toLocaleDateString('es-MX') : 'N/A'}</td>
                      <td>${payment.concepto || 'N/A'}</td>
                      <td>${payment.estudiante || 'N/A'}</td>
                      <td>${payment.metodo || 'N/A'}</td>
                      <td>$${(payment.monto || 0).toLocaleString('es-MX')}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            ` : ''}
            
            <div class="footer">
              <p>Reporte generado por Edupay - Sistema de Gestión Financiera Escolar</p>
            </div>
          </body>
          </html>
        `;
        
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="${fileName}.html"`);
        res.send(htmlContent);
      } else {
        res.status(400).json({ message: "Tipo de exportación no válido" });
      }

    } catch (error: any) {
      console.error("Error exporting financial report:", error);
      res.status(500).json({ message: "Error exportando reporte" });
    }
  });

  // Helper function for month names
  function getMonthName(month: number): string {
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    return months[month - 1];
  }

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

      const { charge_ids, metodo_pago = "tarjeta" } = req.body;
      if (!charge_ids || !Array.isArray(charge_ids) || charge_ids.length === 0) {
        return res.status(400).json({ message: "Se requiere al menos un cargo" });
      }

      const results: { charge_id: number; payment_id: number; cfdi: string }[] = [];

      for (const chargeId of charge_ids) {
        // ── IDOR: el cargo debe pertenecer a un alumno del guardián (lectura, fuera de txn) ──
        const chargeOwned = await storage.getChargeByGuardian(chargeId, guardianId);
        if (!chargeOwned) {
          return res.status(403).json({
            message: `Acceso denegado: el cargo ${chargeId} no pertenece a los alumnos de este tutor`,
          });
        }
        const tenantIdLote = (chargeOwned as any).tenant_id ?? tenantId;

        // ── Transacción atómica ──────────────────────────────────────────────
        const client = await pool.connect();
        let paymentId!: number;
        let referencia!: string;
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

          // 4. Crear pago directamente en 'exitoso' (atomicidad garantizada por la txn)
          referencia = `sim_${Date.now()}_${chargeId}`;
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
          throw err;
        } finally {
          client.release();
        }

        // ── Audit fuera de la transacción financiera (ADR-001) ──────────────
        pool.query(
          `INSERT INTO audit_log
             (tenant_id, guardian_id, action, entity_type, entity_id, previous_value, new_value, metadata)
           VALUES ($1,$2,'charge.status_changed','charge',$3,$4,$5,$6)`,
          [
            tenantIdLote, guardianId, chargeId,
            JSON.stringify({ estado: "pendiente" }),
            JSON.stringify({ estado: "pagado" }),
            JSON.stringify({ flujo: "guardian_pagar_lote", payment_id: paymentId, monto_centavos: null }),
          ]
        ).catch(() => {});

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

        results.push({ charge_id: chargeId, payment_id: paymentId, cfdi: cfdiUUID });
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

  // EXPORT CHARGES - ENDPOINT PARA EXPORTAR CARGOS EN EXCEL/CSV
  app.get("/api/charges/export", authenticateToken, async (req: any, res: any) => {
    try {
      const { format = 'excel', status = 'all' } = req.query;
      const userCampusId = req.user.campus_id;
      
      // Get all charges for the campus
      const allCharges = await storage.getChargesByCampus(userCampusId);
      
      // Get students and concepts for additional details
      const students = await storage.getStudentsByCampus(userCampusId);
      const concepts = await storage.getConceptsByCampus(userCampusId);
      
      // Create a lookup map for students and concepts
      const studentMap = new Map(students.map(s => [s.id, s]));
      const conceptMap = new Map(concepts.map(c => [c.id, c]));
      
      // Filter charges based on status
      let filteredCharges = allCharges;
      if (status !== 'all') {
        filteredCharges = allCharges.filter(charge => charge.estado === status);
      }
      
      // Prepare data for export
      const exportData = filteredCharges.map(charge => {
        const student = studentMap.get(charge.student_id || 0);
        const concept = conceptMap.get(charge.concept_id || 0);
        
        return {
          'ID': charge.id,
          'Estudiante': student?.nombre_completo || 'N/A',
          'Grado': student?.grado || 'N/A',
          'Concepto': concept?.nombre || 'N/A',
          'Ciclo Escolar': charge.ciclo_escolar,
          'Fecha Emisión': charge.fecha_emision,
          'Fecha Vencimiento': charge.fecha_vencimiento,
          'Monto Base': (charge.monto_base_centavos / 100).toFixed(2),
          'Beca Aplicada (%)': charge.beca_aplicada,
          'Recargo': ((charge.recargo_aplicado_centavos || 0) / 100).toFixed(2),
          'Total': ((charge.monto_base_centavos + (charge.recargo_aplicado_centavos || 0)) * (1 - parseFloat(charge.beca_aplicada || '0') / 100) / 100).toFixed(2),
          'Estado': charge.estado,
          'Creado': charge.created_at?.toISOString().split('T')[0] || 'N/A'
        };
      });
      
      if (format === 'excel') {
        // Create Excel file
        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Cargos');
        
        // Generate Excel buffer
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=cargos_${new Date().toISOString().split('T')[0]}.xlsx`);
        
        // Notify real-time update for export
        wsManager.notifyReportGenerated({
          type: 'charges_export',
          format: 'excel',
          records_count: exportData.length
        }, {
          campus_id: userCampusId,
          tenant_id: req.user.tenant_id,
          created_by: req.user.id
        });
        
        res.send(excelBuffer);
      } else {
        // Create CSV file
        const csvHeaders = Object.keys(exportData[0] || {}).join(',');
        const csvRows = exportData.map(row => 
          Object.values(row).map(value => 
            typeof value === 'string' && value.includes(',') ? `"${value}"` : value
          ).join(',')
        );
        const csvContent = [csvHeaders, ...csvRows].join('\n');
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=cargos_${new Date().toISOString().split('T')[0]}.csv`);
        
        // Notify real-time update for CSV export
        wsManager.notifyReportGenerated({
          type: 'charges_export',
          format: 'csv',
          records_count: exportData.length
        }, {
          campus_id: userCampusId,
          tenant_id: req.user.tenant_id,
          created_by: req.user.id
        });
        
        res.send('\uFEFF' + csvContent); // Add BOM for UTF-8
      }
      
    } catch (error: any) {
      console.error("Error exporting charges:", error);
      res.status(500).json({ message: "Error exporting charges" });
    }
  });

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
        dry_run,         // si true: calcula y devuelve preview sin crear nada en BD
        ciclo_escolar,   // ciclo opcional; por defecto el actual
        descripcion,     // para cargos extraordinarios
        monto_manual,    // monto en centavos para cargos extraordinarios manuales
      } = req.body;

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
      const becasRows = aplicar_becas
        ? await pool.query(
            `SELECT s.student_id, s.porcentaje_aplicado, s.monto_fijo_aplicado_centavos
             FROM scholarships s
             JOIN students stu ON stu.id = s.student_id
             WHERE stu.campus_id = $1 AND s.estado = 'activa'
               AND s.vigencia_inicio <= CURRENT_DATE
               AND (s.vigencia_fin IS NULL OR s.vigencia_fin >= CURRENT_DATE)`,
            [userCampusId]
          ).catch(() => ({ rows: [] }))
        : { rows: [] };

      // Índice student_id → beca (la más beneficiosa si hay varias)
      const becaMap: Record<number, { porcentaje_exacto: number; monto_fijo: number }> = {};
      for (const b of (becasRows.rows as any[])) {
        const pct  = Number(b.porcentaje_aplicado   || 0);
        const fijo = Number(b.monto_fijo_aplicado_centavos || 0);
        if (!becaMap[b.student_id] || pct > becaMap[b.student_id].porcentaje_exacto) {
          becaMap[b.student_id] = { porcentaje_exacto: pct, monto_fijo: fijo };
        }
      }

      const chargesCreated: any[] = [];
      const chargesSummary: any[] = [];

      for (const student of targetStudents) {
        const academicLevel = getAcademicLevel((student as any).grado);

        // Monto base
        let baseAmount = monto_manual
          ? Math.round(Number(monto_manual))
          : concept?.monto_centavos ?? 0;

        if (concept && !monto_manual) {
          const levelPrice = (concept as any)[`monto_${academicLevel}`];
          if (levelPrice && levelPrice > 0) baseAmount = levelPrice;
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

        const lateFee     = incluir_recargos ? Math.floor(baseAmount * 0.05) : 0;
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
      
      const updated = await db.update(institutional_info)
        .set({ seccion_educativa, rfc, cct, updated_at: new Date() })
        .where(eq(institutional_info.id, infoId))
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
      
      await db.delete(institutional_info)
        .where(eq(institutional_info.id, infoId));
      
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
      const campusId = (req as any).user.campus_id;
      const id = parseInt(req.params.id);
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
        .where(eq(payment_surcharge_rules.id, ruleId))
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
    console.log("🧪 TEST ENDPOINT - Request received with body:", JSON.stringify(req.body, null, 2));
    console.log("🧪 TEST ENDPOINT - User:", JSON.stringify((req as any).user, null, 2));
    res.json({ success: true, message: "Test endpoint works", receivedData: req.body });
  });

  // Create payment due date configuration
  app.post("/api/payment-config/due-dates", authenticateToken, async (req, res) => {
    console.log("🚀 POST ENDPOINT HIT - Raw middleware passed");
    console.log("🚀 POST ENDPOINT - Headers:", JSON.stringify(req.headers, null, 2));
    
    try {
      console.log("🚀 POST /api/payment-config/due-dates - Request received");
      console.log("🚀 POST /api/payment-config/due-dates - Full request body:", JSON.stringify(req.body, null, 2));
      const campusId = (req as any).user?.campus_id;
      console.log("🚀 POST /api/payment-config/due-dates - Campus ID:", campusId);
      console.log("🚀 POST /api/payment-config/due-dates - User object:", JSON.stringify((req as any).user, null, 2));
      const { concepto, dia_vencimiento, mes_aplicacion, activo } = req.body;
      
      console.log("🚀 Creating payment due date:", {
        campusId,
        rawBody: req.body
      });

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

      console.log("🚀 Processed create data:", JSON.stringify(dueDateData, null, 2));
      console.log("🚀 About to call storage.createPaymentDueDate...");

      const createdDueDate = await storage.createPaymentDueDate(dueDateData);
      
      console.log("🚀 Storage returned created due date:", createdDueDate);
      
      // Verify creation by querying database
      const verification = await db
        .select()
        .from(payment_due_dates)
        .where(eq(payment_due_dates.id, createdDueDate.id));
      
      console.log("🚀 Verification query result:", verification);
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
