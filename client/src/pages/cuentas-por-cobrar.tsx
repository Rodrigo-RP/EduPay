import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, TrendingDown, Clock, DollarSign, Users, Phone, Mail, Calendar, Search, Filter, Ban, PieChart, Download, FileText, Eye, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useInstitution } from "@/hooks/use-institution";
import jsPDF from 'jspdf';
import { PieChartComponent } from "@/components/PieChartComponent";

// Componente de Reportes de Cobranza
const ReportesCobranza = () => {
  const { toast } = useToast();
  const { logoUrl, institutionName } = useInstitution();
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [selectedFormat, setSelectedFormat] = useState("detallado");
  const [filtroNombre, setFiltroNombre] = useState("");

  // Reportes disponibles para cuentas por cobrar
  const reportesDisponibles = [
    {
      id: 1,
      nombre: "Antigüedad de Saldos",
      descripcion: "Análisis detallado por rangos de días vencidos",
      formato: "PDF",
      tamaño: "189 KB",
      fecha: "23/01/2025",
      status: "disponible"
    },
    {
      id: 2,
      nombre: "Cartera Vencida",
      descripcion: "Reporte de cuentas morosas y vencidas",
      formato: "Excel",
      tamaño: "156 KB",
      fecha: "23/01/2025",
      status: "disponible"
    },
    {
      id: 3,
      nombre: "Eficiencia de Cobranza",
      descripcion: "Métricas de gestión y recuperación",
      formato: "PDF",
      tamaño: "201 KB",
      fecha: "22/01/2025",
      status: "disponible"
    },
    {
      id: 4,
      nombre: "Seguimiento de Promesas",
      descripcion: "Control de fechas compromiso de pago",
      formato: "Excel",
      tamaño: "134 KB",
      fecha: "22/01/2025",
      status: "disponible"
    },
    {
      id: 5,
      nombre: "Análisis de Morosidad",
      descripcion: "Tendencias y patrones de comportamiento",
      formato: "PDF",
      tamaño: "245 KB",
      fecha: "21/01/2025",
      status: "disponible"
    },
    {
      id: 6,
      nombre: "Reporte Ejecutivo Cobranza",
      descripcion: "Resumen gerencial de gestión",
      formato: "PDF",
      tamaño: "178 KB",
      fecha: "20/01/2025",
      status: "disponible"
    }
  ];

  // KPIs para reportes de cobranza
  const kpisCobranza = {
    totalPorCobrar: 4200000, // en centavos
    cuentasVencidas: 15,
    cuentasMorosas: 8,
    tasaRecuperacion: 73.2,
    tiempoPromedioCobranza: 18.5,
    eficienciaGestion: 89.1
  };

  const handleGenerarReporte = () => {
    toast({
      title: "Generando Reporte de Cobranza",
      description: "Procesando datos de cartera por cobrar...",
      duration: 2000,
    });

    setTimeout(() => {
      const fechaGeneracion = new Date().toLocaleDateString('es-MX');
      const periodo = selectedPeriod;
      
      const contenido = `REPORTE DE CUENTAS POR COBRAR - ${institutionName || 'INSTITUTO JFR'}
Período: ${periodo}
Fecha de generación: ${fechaGeneracion}

═══════════════════════════════════════════════════════
RESUMEN EJECUTIVO DE COBRANZA
═══════════════════════════════════════════════════════

Total por Cobrar: $${(kpisCobranza.totalPorCobrar / 100).toLocaleString('es-MX')}
Cuentas Vencidas: ${kpisCobranza.cuentasVencidas}
Cuentas Morosas: ${kpisCobranza.cuentasMorosas}
Tasa de Recuperación: ${kpisCobranza.tasaRecuperacion}%
Tiempo Promedio Cobranza: ${kpisCobranza.tiempoPromedioCobranza} días
Eficiencia de Gestión: ${kpisCobranza.eficienciaGestion}%

═══════════════════════════════════════════════════════
ANTIGÜEDAD DE SALDOS
═══════════════════════════════════════════════════════

0-30 días: $1,680,000 (40.0%)
31-60 días: $1,260,000 (30.0%)
61-90 días: $840,000 (20.0%)
Más de 90 días: $420,000 (10.0%)

═══════════════════════════════════════════════════════
ANÁLISIS POR NIVEL ACADÉMICO
═══════════════════════════════════════════════════════

Kinder: $945,000 (22.5%)
Primaria: $1,470,000 (35.0%)
Secundaria: $1,155,000 (27.5%)
Bachillerato: $630,000 (15.0%)

═══════════════════════════════════════════════════════
GESTIÓN DE COBRANZA ACTIVA
═══════════════════════════════════════════════════════

Casos en Seguimiento: ${kpisCobranza.cuentasVencidas} cuentas
Promesas de Pago Activas: 12 compromisos
Tasa de Cumplimiento: 78.5%
Gestión Telefónica: 45 llamadas realizadas
Notificaciones Enviadas: 89 emails/SMS

═══════════════════════════════════════════════════════
REPORTES DISPONIBLES
═══════════════════════════════════════════════════════

${reportesDisponibles.map(r => `${r.nombre} - ${r.formato} - ${r.tamaño}`).join('\n')}

---
Generado por Edupay - Sistema de Pagos Escolares
${institutionName || 'Instituto JFR'} - ${fechaGeneracion}`;

      const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${institutionName?.replace(/\s/g, '_') || 'JFR'}_Reporte_Cobranza_${periodo}_${fechaGeneracion.replace(/\//g, '-')}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "✅ Reporte Generado Exitosamente",
        description: `Reporte de cobranza del período ${periodo} descargado correctamente`,
        duration: 4000,
      });
    }, 2000);
  };

  const handleGenerarReporteExcel = () => {
    toast({
      title: "Generando Reporte Excel",
      description: "Procesando datos para exportación CSV...",
      duration: 2000,
    });

    setTimeout(() => {
      const fechaGeneracion = new Date().toLocaleDateString('es-MX');
      const periodo = selectedPeriod;
      
      const csvContent = `REPORTE DE CUENTAS POR COBRAR - ${institutionName || 'INSTITUTO JFR'}
Período,${periodo}
Fecha de generación,${fechaGeneracion}

RESUMEN EJECUTIVO
Concepto,Valor
Total por Cobrar,$${(kpisCobranza.totalPorCobrar / 100).toLocaleString('es-MX')}
Cuentas Vencidas,${kpisCobranza.cuentasVencidas}
Cuentas Morosas,${kpisCobranza.cuentasMorosas}
Tasa de Recuperación,${kpisCobranza.tasaRecuperacion}%
Tiempo Promedio Cobranza,${kpisCobranza.tiempoPromedioCobranza} días
Eficiencia de Gestión,${kpisCobranza.eficienciaGestion}%

ANTIGÜEDAD DE SALDOS
Rango,Monto,Porcentaje
0-30 días,$1680000,40.0%
31-60 días,$1260000,30.0%
61-90 días,$840000,20.0%
Más de 90 días,$420000,10.0%

ANÁLISIS POR NIVEL
Nivel,Monto,Porcentaje
Kinder,$945000,22.5%
Primaria,$1470000,35.0%
Secundaria,$1155000,27.5%
Bachillerato,$630000,15.0%`;

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${institutionName?.replace(/\s/g, '_') || 'JFR'}_Reporte_Cobranza_${periodo}_${fechaGeneracion.replace(/\//g, '-')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "✅ Reporte Excel Generado",
        description: `Archivo CSV compatible con Excel descargado exitosamente`,
        duration: 4000,
      });
    }, 2000);
  };

  const handleGenerarReportePDF = () => {
    toast({
      title: "Generando Reporte PDF",
      description: "Creando documento PDF profesional...",
      duration: 2000,
    });

    setTimeout(() => {
      const fechaGeneracion = new Date().toLocaleDateString('es-MX');
      const periodo = selectedPeriod;
      
      // Crear contenido HTML para PDF con logo dinámico
      const logoElement = logoUrl 
        ? `<img src="${logoUrl}" alt="Logo ${institutionName}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; margin: 0 auto 15px; display: block;">`
        : `<div class="logo-fallback">JFR</div>`;

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Reporte de Cuentas por Cobrar - ${institutionName || 'Instituto JFR'}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.4; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #ea580c; padding-bottom: 20px; }
            .logo-fallback { width: 80px; height: 80px; margin: 0 auto 15px; border-radius: 50%; background: linear-gradient(135deg, #ea580c, #c2410c); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 24px; }
            .institution-name { font-size: 24px; font-weight: bold; color: #1e293b; margin-bottom: 5px; }
            .report-title { font-size: 18px; color: #ea580c; font-weight: bold; }
            .section { margin: 25px 0; }
            .section-title { font-size: 16px; font-weight: bold; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 15px; }
            .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 20px 0; }
            .kpi-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; text-align: center; }
            .kpi-value { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
            .kpi-label { font-size: 12px; color: #64748b; }
            .data-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            .data-table th, .data-table td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
            .data-table th { background-color: #f8fafc; font-weight: bold; }
            .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b; }
            .red { color: #dc2626; }
            .yellow { color: #ca8a04; }
            .orange { color: #ea580c; }
          </style>
        </head>
        <body>
          <div class="header">
            ${logoElement}
            <div class="institution-name">${institutionName || 'INSTITUTO JFR'}</div>
            <div class="report-title">REPORTE DE CUENTAS POR COBRAR</div>
            <div style="font-size: 14px; color: #64748b; margin-top: 10px;">
              Período: ${periodoTexto} | Generado: ${fechaGeneracion}
            </div>
          </div>

          <div class="section">
            <div class="section-title">RESUMEN EJECUTIVO DE COBRANZA</div>
            <div class="kpi-grid">
              <div class="kpi-card">
                <div class="kpi-value red">$${(kpisCobranza.totalPorCobrar / 100).toLocaleString('es-MX')}</div>
                <div class="kpi-label">Total por Cobrar</div>
              </div>
              <div class="kpi-card">
                <div class="kpi-value yellow">${kpisCobranza.tasaRecuperacion}%</div>
                <div class="kpi-label">Tasa de Recuperación</div>
              </div>
              <div class="kpi-card">
                <div class="kpi-value orange">${kpisCobranza.eficienciaGestion}%</div>
                <div class="kpi-label">Eficiencia de Gestión</div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">INDICADORES CLAVE</div>
            <table class="data-table">
              <tr><th>Concepto</th><th>Valor</th></tr>
              <tr><td>Cuentas Vencidas</td><td>${kpisCobranza.cuentasVencidas}</td></tr>
              <tr><td>Cuentas Morosas</td><td>${kpisCobranza.cuentasMorosas}</td></tr>
              <tr><td>Tiempo Promedio Cobranza</td><td>${kpisCobranza.tiempoPromedioCobranza} días</td></tr>
              <tr><td>Casos en Seguimiento</td><td>15 cuentas</td></tr>
              <tr><td>Promesas de Pago Activas</td><td>12 compromisos</td></tr>
            </table>
          </div>

          <div class="section">
            <div class="section-title">ANTIGÜEDAD DE SALDOS</div>
            <table class="data-table">
              <tr><th>Rango de Días</th><th>Monto</th><th>Porcentaje</th></tr>
              <tr><td>0-30 días</td><td>$1,680,000</td><td>40.0%</td></tr>
              <tr><td>31-60 días</td><td>$1,260,000</td><td>30.0%</td></tr>
              <tr><td>61-90 días</td><td>$840,000</td><td>20.0%</td></tr>
              <tr><td>Más de 90 días</td><td>$420,000</td><td>10.0%</td></tr>
            </table>
          </div>

          <div class="section">
            <div class="section-title">ANÁLISIS POR NIVEL ACADÉMICO</div>
            <table class="data-table">
              <tr><th>Nivel</th><th>Monto por Cobrar</th><th>Porcentaje</th></tr>
              <tr><td>Kinder</td><td>$945,000</td><td>22.5%</td></tr>
              <tr><td>Primaria</td><td>$1,470,000</td><td>35.0%</td></tr>
              <tr><td>Secundaria</td><td>$1,155,000</td><td>27.5%</td></tr>
              <tr><td>Bachillerato</td><td>$630,000</td><td>15.0%</td></tr>
            </table>
          </div>

          <div class="section">
            <div class="section-title">GESTIÓN DE COBRANZA ACTIVA</div>
            <table class="data-table">
              <tr><th>Actividad</th><th>Cantidad</th><th>Resultado</th></tr>
              <tr><td>Llamadas Realizadas</td><td>45</td><td>78% contacto efectivo</td></tr>
              <tr><td>Emails Enviados</td><td>89</td><td>65% tasa de apertura</td></tr>
              <tr><td>SMS Enviados</td><td>67</td><td>92% entregados</td></tr>
              <tr><td>Visitas Programadas</td><td>8</td><td>6 realizadas</td></tr>
            </table>
          </div>

          <div class="footer">
            <p><strong>Generado por Edupay - Sistema de Pagos Escolares</strong></p>
            <p>${institutionName || 'Instituto JFR'} | ${fechaGeneracion} | Formato: ${selectedFormat}</p>
            <p>Este reporte contiene información confidencial del proceso de cobranza institucional</p>
          </div>
        </body>
        </html>
      `;

      // Abrir ventana de impresión para generar PDF
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        
        setTimeout(() => {
          printWindow.print();
        }, 500);
      }

      toast({
        title: "✅ Reporte PDF Generado",
        description: `Reporte de cobranza ${selectedFormat} abierto para descarga en PDF`,
        duration: 4000,
      });
    }, 2000);
  };

  const handleDescargarReporte = (reporte: any) => {
    toast({
      title: "Descargando Reporte",
      description: `Preparando ${reporte.nombre} en formato ${reporte.formato}...`,
      duration: 2000,
    });

    setTimeout(() => {
      const fechaGeneracion = new Date().toLocaleDateString('es-MX');
      const periodoTexto = fechaInicio && fechaFin ? `${fechaInicio} a ${fechaFin}` : "Período completo";
      
      if (reporte.formato === "Excel") {
        // Generar archivo CSV para reportes Excel
        const csvContent = `${reporte.nombre.toUpperCase()} - ${institutionName || 'INSTITUTO JFR'}
Fecha de generación,${fechaGeneracion}
Período,${periodoTexto}
Filtro de búsqueda,${filtroNombre || 'Sin filtro'}

DATOS DEL REPORTE
Tipo,${reporte.nombre}
Descripción,${reporte.descripcion}
Formato,${reporte.formato}
Tamaño,${reporte.tamaño}
Estado,${reporte.status}

MÉTRICAS DE COBRANZA
Concepto,Valor
Total por Cobrar,$${(kpisCobranza.totalPorCobrar / 100).toLocaleString('es-MX')}
Cuentas Vencidas,${kpisCobranza.cuentasVencidas}
Cuentas Morosas,${kpisCobranza.cuentasMorosas}
Tasa de Recuperación,${kpisCobranza.tasaRecuperacion}%
Eficiencia de Gestión,${kpisCobranza.eficienciaGestion}%

ANTIGÜEDAD DE SALDOS
Rango,Monto,Porcentaje
0-30 días,$1680000,40.0%
31-60 días,$1260000,30.0%
61-90 días,$840000,20.0%
Más de 90 días,$420000,10.0%`;

        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${reporte.nombre.replace(/\s/g, '_')}_${fechaGeneracion.replace(/\//g, '-')}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } else {
        // Generar reporte PDF
        const logoElement = logoUrl 
          ? `<img src="${logoUrl}" alt="Logo ${institutionName}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; margin: 0 auto 15px; display: block;">`
          : `<div class="logo-fallback">JFR</div>`;

        const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>${reporte.nombre} - ${institutionName || 'Instituto JFR'}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.4; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #ea580c; padding-bottom: 20px; }
              .logo-fallback { width: 80px; height: 80px; margin: 0 auto 15px; border-radius: 50%; background: linear-gradient(135deg, #ea580c, #c2410c); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 24px; }
              .institution-name { font-size: 24px; font-weight: bold; color: #1e293b; margin-bottom: 5px; }
              .report-title { font-size: 18px; color: #ea580c; font-weight: bold; }
              .section { margin: 25px 0; }
              .section-title { font-size: 16px; font-weight: bold; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 15px; }
              .data-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
              .data-table th, .data-table td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
              .data-table th { background-color: #f8fafc; font-weight: bold; }
              .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b; }
              .highlight { background-color: #fef3c7; padding: 10px; border-radius: 8px; margin: 15px 0; }
            </style>
          </head>
          <body>
            <div class="header">
              ${logoElement}
              <div class="institution-name">${institutionName || 'INSTITUTO JFR'}</div>
              <div class="report-title">${reporte.nombre.toUpperCase()}</div>
              <div style="font-size: 14px; color: #64748b; margin-top: 10px;">
                Generado: ${fechaGeneracion} | Período: ${periodoTexto}
              </div>
            </div>

            <div class="highlight">
              <strong>Descripción:</strong> ${reporte.descripcion}<br>
              <strong>Tipo de Análisis:</strong> ${reporte.nombre}<br>
              <strong>Estado:</strong> ${reporte.status}
            </div>

            <div class="section">
              <div class="section-title">DATOS DEL REPORTE</div>
              <table class="data-table">
                <tr><th>Concepto</th><th>Valor</th></tr>
                <tr><td>Formato</td><td>${reporte.formato}</td></tr>
                <tr><td>Tamaño</td><td>${reporte.tamaño}</td></tr>
                <tr><td>Fecha Creación</td><td>${reporte.fecha}</td></tr>
                <tr><td>Período Analizado</td><td>${periodoTexto}</td></tr>
              </table>
            </div>

            <div class="section">
              <div class="section-title">MÉTRICAS DE COBRANZA</div>
              <table class="data-table">
                <tr><th>Indicador</th><th>Valor</th></tr>
                <tr><td>Total por Cobrar</td><td>$${(kpisCobranza.totalPorCobrar / 100).toLocaleString('es-MX')}</td></tr>
                <tr><td>Cuentas Vencidas</td><td>${kpisCobranza.cuentasVencidas}</td></tr>
                <tr><td>Cuentas Morosas</td><td>${kpisCobranza.cuentasMorosas}</td></tr>
                <tr><td>Tasa de Recuperación</td><td>${kpisCobranza.tasaRecuperacion}%</td></tr>
                <tr><td>Eficiencia de Gestión</td><td>${kpisCobranza.eficienciaGestion}%</td></tr>
              </table>
            </div>

            <div class="footer">
              <p><strong>Generado por Edupay - Sistema de Pagos Escolares</strong></p>
              <p>${institutionName || 'Instituto JFR'} | ${fechaGeneracion}</p>
              <p>Reporte: ${reporte.nombre} | Formato: ${reporte.formato}</p>
            </div>
          </body>
          </html>
        `;

        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(htmlContent);
          printWindow.document.close();
          printWindow.focus();
          
          setTimeout(() => {
            printWindow.print();
          }, 500);
        }
      }

      toast({
        title: "✅ Reporte Descargado",
        description: `${reporte.nombre} en formato ${reporte.formato} descargado exitosamente`,
        duration: 3000,
      });
    }, 2000);
  };

  const handlePreviewReport = (reporte: any) => {
    toast({
      title: "Vista Previa",
      description: `Mostrando vista previa de ${reporte.nombre}...`,
      duration: 2000,
    });

    const fechaGeneracion = new Date().toLocaleDateString('es-MX');
    const periodoTexto = fechaInicio && fechaFin ? `${fechaInicio} a ${fechaFin}` : "Período completo";
    
    const logoElement = logoUrl 
      ? `<img src="${logoUrl}" alt="Logo ${institutionName}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin: 0 auto 15px; display: block;">`
      : `<div class="logo-fallback">JFR</div>`;

    const previewContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Vista Previa - ${reporte.nombre}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; background-color: #f8fafc; }
          .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #ea580c; padding-bottom: 20px; }
          .logo-fallback { width: 60px; height: 60px; margin: 0 auto 15px; border-radius: 50%; background: linear-gradient(135deg, #ea580c, #c2410c); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 18px; }
          .title { font-size: 24px; font-weight: bold; color: #1e293b; margin-bottom: 10px; }
          .subtitle { font-size: 16px; color: #ea580c; font-weight: bold; }
          .info-card { background: #f1f5f9; border-left: 4px solid #ea580c; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0; }
          .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
          .metric { background: #fef3c7; padding: 15px; border-radius: 8px; text-align: center; }
          .metric-value { font-size: 20px; font-weight: bold; color: #ea580c; }
          .metric-label { font-size: 12px; color: #64748b; margin-top: 5px; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            ${logoElement}
            <div class="title">${institutionName || 'INSTITUTO JFR'}</div>
            <div class="subtitle">Vista Previa: ${reporte.nombre}</div>
          </div>

          <div class="info-card">
            <h3 style="margin-top: 0; color: #ea580c;">Información del Reporte</h3>
            <p><strong>Descripción:</strong> ${reporte.descripcion}</p>
            <p><strong>Formato:</strong> ${reporte.formato}</p>
            <p><strong>Tamaño:</strong> ${reporte.tamaño}</p>
            <p><strong>Fecha:</strong> ${reporte.fecha}</p>
            <p><strong>Estado:</strong> ${reporte.status}</p>
            <p><strong>Período Analizado:</strong> ${periodoTexto}</p>
            <p><strong>Filtro de Búsqueda:</strong> ${filtroNombre || 'Sin filtro aplicado'}</p>
          </div>

          <h3 style="color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">Métricas Incluidas</h3>
          <div class="metrics">
            <div class="metric">
              <div class="metric-value">$${(kpisCobranza.totalPorCobrar / 100).toLocaleString('es-MX')}</div>
              <div class="metric-label">Total por Cobrar</div>
            </div>
            <div class="metric">
              <div class="metric-value">${kpisCobranza.cuentasVencidas}</div>
              <div class="metric-label">Cuentas Vencidas</div>
            </div>
            <div class="metric">
              <div class="metric-value">${kpisCobranza.tasaRecuperacion}%</div>
              <div class="metric-label">Tasa de Recuperación</div>
            </div>
            <div class="metric">
              <div class="metric-value">${kpisCobranza.eficienciaGestion}%</div>
              <div class="metric-label">Eficiencia de Gestión</div>
            </div>
          </div>

          <div class="info-card">
            <h4 style="margin-top: 0;">Contenido del Reporte</h4>
            <ul>
              <li>Resumen ejecutivo de cobranza</li>
              <li>Análisis de antigüedad de saldos</li>
              <li>Distribución por nivel académico</li>
              <li>Métricas de gestión de cobranza</li>
              <li>Indicadores de eficiencia</li>
              <li>Recomendaciones estratégicas</li>
            </ul>
          </div>

          <div class="footer">
            <p><strong>Vista Previa - Edupay Sistema de Pagos Escolares</strong></p>
            <p>Generado: ${fechaGeneracion} | ${institutionName || 'Instituto JFR'}</p>
            <p>Para descargar el reporte completo, use el botón "Descargar"</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const previewWindow = window.open('', '_blank');
    if (previewWindow) {
      previewWindow.document.write(previewContent);
      previewWindow.document.close();
      previewWindow.focus();
    }
  };

  return (
    <div className="space-y-6">
      {/* Filtros avanzados */}
      <Card className="bg-white shadow-md border-l-4 border-orange-500">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Fecha de Inicio */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
                <Calendar className="w-4 h-4 text-orange-600" />
                Fecha Inicio:
              </label>
              <Input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="border-orange-200 focus:border-orange-500"
                placeholder="Seleccione fecha inicial"
              />
            </div>

            {/* Fecha Final */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
                <Calendar className="w-4 h-4 text-orange-600" />
                Fecha Final:
              </label>
              <Input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="border-orange-200 focus:border-orange-500"
                placeholder="Seleccione fecha final"
              />
            </div>

            {/* Búsqueda por Nombre */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
                <Search className="w-4 h-4 text-orange-600" />
                Alumno/Familia:
              </label>
              <Input
                type="text"
                value={filtroNombre}
                onChange={(e) => setFiltroNombre(e.target.value)}
                className="border-orange-200 focus:border-orange-500"
                placeholder="Buscar por nombre o apellido..."
              />
            </div>

            {/* Formato de Reporte */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
                <BarChart3 className="w-4 h-4 text-orange-600" />
                Formato:
              </label>
              <Select value={selectedFormat} onValueChange={setSelectedFormat}>
                <SelectTrigger className="border-orange-200 focus:border-orange-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="detallado">Detallado</SelectItem>
                  <SelectItem value="ejecutivo">Ejecutivo</SelectItem>
                  <SelectItem value="auditoria">Auditoría</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Botón de limpiar filtros */}
          {(fechaInicio || fechaFin || filtroNombre) && (
            <div className="mt-4 flex justify-end">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  setFechaInicio("");
                  setFechaFin("");
                  setFiltroNombre("");
                }}
                className="text-orange-600 border-orange-600 hover:bg-orange-50"
              >
                <Filter className="w-4 h-4 mr-2" />
                Limpiar Filtros
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPIs del período */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-red-800 text-lg">Total por Cobrar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center space-y-2">
              <div className="text-3xl font-bold text-red-600">
                ${(kpisCobranza.totalPorCobrar / 100).toLocaleString('es-MX')}
              </div>
              <div className="text-sm text-red-700">{kpisCobranza.cuentasVencidas} cuentas vencidas</div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-yellow-800 text-lg">Tasa de Recuperación</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center space-y-2">
              <div className="text-3xl font-bold text-yellow-600">{kpisCobranza.tasaRecuperacion}%</div>
              <div className="text-sm text-yellow-700">{kpisCobranza.tiempoPromedioCobranza} días promedio</div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-orange-800 text-lg">Eficiencia de Gestión</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center space-y-2">
              <div className="text-3xl font-bold text-orange-600">{kpisCobranza.eficienciaGestion}%</div>
              <div className="text-sm text-orange-700">{kpisCobranza.cuentasMorosas} casos morosos</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Botones de generación */}
      <div className="flex flex-wrap gap-3">
        <Button 
          onClick={handleGenerarReporte}
          className="bg-orange-600 hover:bg-orange-700"
        >
          <Download className="w-4 h-4 mr-2" />
          Generar Reporte TXT
        </Button>
        <Button 
          onClick={handleGenerarReporteExcel}
          variant="outline"
          className="border-orange-600 text-orange-600 hover:bg-orange-50"
        >
          <Download className="w-4 h-4 mr-2" />
          Generar Excel (CSV)
        </Button>
        <Button 
          onClick={handleGenerarReportePDF}
          className="bg-red-600 hover:bg-red-700"
        >
          <FileText className="w-4 h-4 mr-2" />
          Generar PDF
        </Button>
      </div>

      {/* Reportes Disponibles */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl text-slate-800">Reportes de Cobranza Disponibles</CardTitle>
          <CardDescription>
            Descarga reportes especializados de gestión de cartera por cobrar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reportesDisponibles.map((reporte) => (
              <Card key={reporte.id} className="border-2 hover:border-orange-300 transition-colors duration-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-slate-800">{reporte.nombre}</CardTitle>
                  <CardDescription className="text-sm">{reporte.descripcion}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Formato:</span>
                      <Badge variant="outline">{reporte.formato}</Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Tamaño:</span>
                      <span className="font-medium">{reporte.tamaño}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Fecha:</span>
                      <span className="font-medium">{reporte.fecha}</span>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button 
                        size="sm" 
                        className="flex-1 bg-orange-600 hover:bg-orange-700"
                        onClick={() => handleDescargarReporte(reporte)}
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Descargar
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="border-orange-600 text-orange-600 hover:bg-orange-50"
                        onClick={() => handlePreviewReport(reporte)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default function CuentasPorCobrar() {
  const [selectedEstado, setSelectedEstado] = useState("all");
  const [selectedDiasVencido, setSelectedDiasVencido] = useState("all");
  const [selectedConcepto, setSelectedConcepto] = useState("all");
  const [selectedNivel, setSelectedNivel] = useState("all");
  const [selectedEstudiante, setSelectedEstudiante] = useState("all");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [showCompromiseModal, setShowCompromiseModal] = useState(false);
  const [selectedCuenta, setSelectedCuenta] = useState<any>(null);
  
  // Estados para reportes
  const [selectedPeriod, setSelectedPeriod] = useState("2025-01");
  const [selectedFormat, setSelectedFormat] = useState("detallado");
  const { toast } = useToast();
  const { logoUrl, institutionName } = useInstitution();


  // Colores para gráficos
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

  // Datos estáticos para gráficos tipo pastel
  const statusData = [
    { name: 'Corriente', value: 5, color: '#00C49F' },
    { name: 'Vencido', value: 4, color: '#FFBB28' },
    { name: 'Moroso', value: 3, color: '#FF8042' },
    { name: 'Pagado', value: 2, color: '#0088FE' },
    { name: 'Parcial', value: 1, color: '#8884D8' }
  ];

  const daysOverdueData = [
    { name: '0-7 días', value: 6, color: '#00C49F' },
    { name: '8-30 días', value: 4, color: '#FFBB28' },
    { name: '31-60 días', value: 3, color: '#FF8042' },
    { name: '60+ días', value: 2, color: '#8884D8' }
  ];

  const amountRangeData = [
    { name: '$0-$2K', value: 7, color: '#0088FE' },
    { name: '$2K-$5K', value: 4, color: '#00C49F' },
    { name: '$5K-$10K', value: 3, color: '#FFBB28' },
    { name: '$10K+', value: 1, color: '#FF8042' }
  ];



  // Datos demo expandidos de cuentas por cobrar con todos los conceptos
  const cuentasPorCobrar = [
    {
      id: 1,
      estudiante: "Carlos Pérez Méndez",
      responsable: "Carlos Pérez",
      telefono: "5551234567",
      email: "carlos.perez@gmail.com",
      nivel_escolar: "PRIMARIA",
      grado: "3ro Primaria",
      concepto: "Colegiatura Enero 2025",
      fecha_cargo: "2025-01-01",
      monto_inicial_centavos: 500000,
      descuentos_centavos: 0,
      recargos_centavos: 25000,
      total_pagado_centavos: 0,
      pendiente_pagar_centavos: 525000,
      dias_vencido: 5,
      estado_cobranza: "VENCIDO",
      fecha_vencimiento: "2025-01-15",
      fecha_compromiso: null,
      cuenta_habilitada: true,
      fecha_ultimo_seguimiento: "2025-01-18",
      observaciones_cobranza: "Padre confirmó pago para el 25 de enero"
    },
    {
      id: 2,
      estudiante: "Andrea García Luna",
      responsable: "Ana García",
      telefono: "5559876543",
      email: "ana.garcia@yahoo.com",
      nivel_escolar: "SECUNDARIA",
      grado: "2do Secundaria",
      concepto: "Reinscripción 2025-2026",
      fecha_cargo: "2025-01-10",
      monto_inicial_centavos: 350000,
      descuentos_centavos: 35000,
      recargos_centavos: 0,
      total_pagado_centavos: 0,
      pendiente_pagar_centavos: 315000,
      dias_vencido: 0,
      estado_cobranza: "CORRIENTE",
      fecha_vencimiento: "2025-02-10",
      fecha_compromiso: "2025-01-30",
      cuenta_habilitada: true,
      fecha_ultimo_seguimiento: "2025-01-12",
      observaciones_cobranza: "Cuenta al corriente, fecha compromiso acordada"
    },
    {
      id: 3,
      estudiante: "Luis Martínez Gil",
      responsable: "María Martínez",
      telefono: "5554567890",
      email: "maria.martinez@hotmail.com",
      nivel_escolar: "BACHILLERATO",
      grado: "3ro Bachillerato",
      concepto: "Colegiatura Diciembre 2024",
      fecha_cargo: "2024-12-01",
      monto_inicial_centavos: 550000,
      descuentos_centavos: 0,
      recargos_centavos: 55000,
      total_pagado_centavos: 0,
      pendiente_pagar_centavos: 605000,
      dias_vencido: 35,
      estado_cobranza: "MOROSO",
      fecha_vencimiento: "2024-12-15",
      fecha_compromiso: "2025-01-25",
      cuenta_habilitada: false,
      fecha_ultimo_seguimiento: "2025-01-20",
      observaciones_cobranza: "Cuenta deshabilitada por falta de pago"
    },
    {
      id: 4,
      estudiante: "Sofía Hernández Castro",
      responsable: "Roberto Hernández",
      telefono: "5553456789",
      email: "roberto.hernandez@gmail.com",
      nivel_escolar: "PRIMARIA",
      grado: "5to Primaria",
      concepto: "Libros y materiales",
      fecha_cargo: "2025-01-05",
      monto_inicial_centavos: 100000,
      descuentos_centavos: 0,
      recargos_centavos: 0,
      total_pagado_centavos: 50000,
      pendiente_pagar_centavos: 50000,
      dias_vencido: 0,
      estado_cobranza: "PARCIAL",
      fecha_vencimiento: "2025-02-12",
      fecha_compromiso: "2025-01-30",
      cuenta_habilitada: true,
      fecha_ultimo_seguimiento: "2025-01-15",
      observaciones_cobranza: "Pago parcial recibido, pendiente saldo"
    },
    {
      id: 5,
      estudiante: "Emilia Santos Rivera",
      responsable: "María Rivera Santos",
      telefono: "5551234567",
      email: "maria.rivera@gmail.com",
      nivel_escolar: "KINDER",
      grado: "Kinder 1",
      concepto: "Colegiatura Enero 2025",
      fecha_cargo: "2025-01-01",
      monto_inicial_centavos: 480000,
      descuentos_centavos: 0,
      recargos_centavos: 0,
      total_pagado_centavos: 480000,
      pendiente_pagar_centavos: 0,
      dias_vencido: 0,
      estado_cobranza: "PAGADO",
      fecha_vencimiento: "2025-01-15",
      fecha_compromiso: null,
      cuenta_habilitada: true,
      fecha_ultimo_seguimiento: "2025-01-05",
      observaciones_cobranza: "Pago completo recibido puntualmente"
    },
    {
      id: 6,
      estudiante: "Diego Ramírez Silva",
      responsable: "Patricia Silva Ramírez",
      telefono: "5553344556",
      email: "patricia.silva@gmail.com",
      nivel_escolar: "BACHILLERATO",
      grado: "1ro Bachillerato",
      concepto: "Colegiatura Enero 2025",
      fecha_cargo: "2025-01-01",
      monto_inicial_centavos: 850000,
      descuentos_centavos: 85000,
      recargos_centavos: 0,
      total_pagado_centavos: 400000,
      pendiente_pagar_centavos: 365000,
      dias_vencido: 0,
      estado_cobranza: "PARCIAL",
      fecha_vencimiento: "2025-01-15",
      fecha_compromiso: "2025-01-30",
      cuenta_habilitada: true,
      fecha_ultimo_seguimiento: "2025-01-18",
      observaciones_cobranza: "Beca del 10% aplicada, pago parcial recibido"
    },
    {
      id: 7,
      estudiante: "Isabella Morales Ruiz",
      responsable: "Fernando Morales Castro",
      telefono: "5555566778",
      email: "fernando.morales@outlook.com",
      nivel_escolar: "BACHILLERATO",
      grado: "2do Bachillerato",
      concepto: "Reinscripción 2025-2026",
      fecha_cargo: "2025-01-15",
      monto_inicial_centavos: 400000,
      descuentos_centavos: 0,
      recargos_centavos: 0,
      total_pagado_centavos: 0,
      pendiente_pagar_centavos: 400000,
      dias_vencido: 0,
      estado_cobranza: "CORRIENTE",
      fecha_vencimiento: "2025-02-28",
      fecha_compromiso: "2025-02-15",
      cuenta_habilitada: true,
      fecha_ultimo_seguimiento: "2025-01-16",
      observaciones_cobranza: "Proceso de reinscripción en curso"
    },
    {
      id: 8,
      estudiante: "Miguel Torres Vega",
      responsable: "Carmen Vega Torres",
      telefono: "5559900112",
      email: "carmen.vega@gmail.com",
      nivel_escolar: "SECUNDARIA",
      grado: "2do Secundaria",
      concepto: "Colegiatura Diciembre 2024",
      fecha_cargo: "2024-12-01",
      monto_inicial_centavos: 740000,
      descuentos_centavos: 0,
      recargos_centavos: 148000,
      total_pagado_centavos: 300000,
      pendiente_pagar_centavos: 588000,
      dias_vencido: 42,
      estado_cobranza: "MOROSO",
      fecha_vencimiento: "2024-12-10",
      fecha_compromiso: "2025-02-01",
      cuenta_habilitada: false,
      fecha_ultimo_seguimiento: "2025-01-21",
      observaciones_cobranza: "Cuenta suspendida, acuerdo de pago establecido"
    },
    {
      id: 9,
      estudiante: "Valeria López Cruz",
      responsable: "Eduardo López Mendoza",
      telefono: "5551122334",
      email: "eduardo.lopez@gmail.com",
      nivel_escolar: "SECUNDARIA",
      grado: "3ro Secundaria",
      concepto: "Examen de Admisión Bachillerato",
      fecha_cargo: "2025-01-10",
      monto_inicial_centavos: 150000,
      descuentos_centavos: 0,
      recargos_centavos: 0,
      total_pagado_centavos: 150000,
      pendiente_pagar_centavos: 0,
      dias_vencido: 0,
      estado_cobranza: "PAGADO",
      fecha_vencimiento: "2025-01-20",
      fecha_compromiso: null,
      cuenta_habilitada: true,
      fecha_ultimo_seguimiento: "2025-01-11",
      observaciones_cobranza: "Pago de examen de admisión completado"
    },
    {
      id: 10,
      estudiante: "Alejandro Castillo Mendoza",
      responsable: "Gabriela Mendoza Castillo",
      telefono: "5557788990",
      email: "gabriela.mendoza@yahoo.com",
      nivel_escolar: "BACHILLERATO",
      grado: "3ro Bachillerato",
      concepto: "Colegiatura Enero 2025",
      fecha_cargo: "2025-01-01",
      monto_inicial_centavos: 890000,
      descuentos_centavos: 0,
      recargos_centavos: 0,
      total_pagado_centavos: 890000,
      pendiente_pagar_centavos: 0,
      dias_vencido: 0,
      estado_cobranza: "PAGADO",
      fecha_vencimiento: "2025-01-15",
      fecha_compromiso: null,
      cuenta_habilitada: true,
      fecha_ultimo_seguimiento: "2025-01-02",
      observaciones_cobranza: "Pago anticipado recibido"
    },
    {
      id: 11,
      estudiante: "Camila Herrera Sandoval",
      responsable: "Fernando Herrera López",
      telefono: "5552233445",
      email: "fernando.herrera@yahoo.com",
      nivel_escolar: "PRIMARIA",
      grado: "4to Primaria",
      concepto: "Colegiatura Enero 2025",
      fecha_cargo: "2025-01-01",
      monto_inicial_centavos: 640000,
      descuentos_centavos: 320000,
      recargos_centavos: 0,
      total_pagado_centavos: 320000,
      pendiente_pagar_centavos: 0,
      dias_vencido: 0,
      estado_cobranza: "PAGADO",
      fecha_vencimiento: "2025-01-15",
      fecha_compromiso: null,
      cuenta_habilitada: true,
      fecha_ultimo_seguimiento: "2025-01-03",
      observaciones_cobranza: "Beca del 50% aplicada, pago completo"
    },
    {
      id: 12,
      estudiante: "Mateo Cruz Flores",
      responsable: "Laura Flores García",
      telefono: "5551122334",
      email: "laura.flores@hotmail.com",
      nivel_escolar: "KINDER",
      grado: "Kinder 2",
      concepto: "Seguro Escolar 2025",
      fecha_cargo: "2025-01-08",
      monto_inicial_centavos: 75000,
      descuentos_centavos: 0,
      recargos_centavos: 0,
      total_pagado_centavos: 0,
      pendiente_pagar_centavos: 75000,
      dias_vencido: 0,
      estado_cobranza: "CORRIENTE",
      fecha_vencimiento: "2025-02-08",
      fecha_compromiso: "2025-01-25",
      cuenta_habilitada: true,
      fecha_ultimo_seguimiento: "2025-01-19",
      observaciones_cobranza: "Seguro escolar pendiente de pago"
    },
    {
      id: 13,
      estudiante: "Daniel Morales Castro",
      responsable: "Lucía Castro Morales",
      telefono: "5553344556",
      email: "lucia.castro@hotmail.com",
      nivel_escolar: "PRIMARIA",
      grado: "5to Primaria",
      concepto: "Uniforme Deportivo",
      fecha_cargo: "2025-01-12",
      monto_inicial_centavos: 85000,
      descuentos_centavos: 0,
      recargos_centavos: 0,
      total_pagado_centavos: 85000,
      pendiente_pagar_centavos: 0,
      dias_vencido: 0,
      estado_cobranza: "PAGADO",
      fecha_vencimiento: "2025-01-26",
      fecha_compromiso: null,
      cuenta_habilitada: true,
      fecha_ultimo_seguimiento: "2025-01-13",
      observaciones_cobranza: "Uniforme deportivo pagado y entregado"
    },
    {
      id: 14,
      estudiante: "Sebastián López Martínez",
      responsable: "Gloria Martínez Vega",
      telefono: "5555566778",
      email: "gloria.martinez@hotmail.com",
      nivel_escolar: "PRIMARIA",
      grado: "6to Primaria",
      concepto: "Graduación Primaria",
      fecha_cargo: "2025-01-05",
      monto_inicial_centavos: 200000,
      descuentos_centavos: 0,
      recargos_centavos: 0,
      total_pagado_centavos: 100000,
      pendiente_pagar_centavos: 100000,
      dias_vencido: 0,
      estado_cobranza: "PARCIAL",
      fecha_vencimiento: "2025-03-15",
      fecha_compromiso: "2025-02-15",
      cuenta_habilitada: true,
      fecha_ultimo_seguimiento: "2025-01-20",
      observaciones_cobranza: "Pago parcial para ceremonia de graduación"
    },
    {
      id: 15,
      estudiante: "Victoria Sandoval Guerrero",
      responsable: "Raúl Sandoval Herrera",
      telefono: "5558899001",
      email: "raul.sandoval@gmail.com",
      nivel_escolar: "BACHILLERATO",
      grado: "3ro Bachillerato",
      concepto: "Colegiatura Noviembre 2024",
      fecha_cargo: "2024-11-01",
      monto_inicial_centavos: 890000,
      descuentos_centavos: 0,
      recargos_centavos: 267000,
      total_pagado_centavos: 0,
      pendiente_pagar_centavos: 1157000,
      dias_vencido: 73,
      estado_cobranza: "IRRECUPERABLE",
      fecha_vencimiento: "2024-11-10",
      fecha_compromiso: null,
      cuenta_habilitada: false,
      fecha_ultimo_seguimiento: "2025-01-15",
      observaciones_cobranza: "Cuenta en proceso de cobranza jurídica"
    }
  ];

  const filteredCuentas = cuentasPorCobrar.filter(cuenta => {
    const matchesEstado = selectedEstado === "all" || cuenta.estado_cobranza === selectedEstado;
    const matchesDias = selectedDiasVencido === "all" || 
      (selectedDiasVencido === "0-7" && cuenta.dias_vencido >= 0 && cuenta.dias_vencido <= 7) ||
      (selectedDiasVencido === "8-30" && cuenta.dias_vencido >= 8 && cuenta.dias_vencido <= 30) ||
      (selectedDiasVencido === "31+" && cuenta.dias_vencido > 30);
    const matchesConcepto = selectedConcepto === "all" || cuenta.concepto.toLowerCase().includes(selectedConcepto.toLowerCase());
    const matchesNivel = selectedNivel === "all" || cuenta.nivel_escolar === selectedNivel;
    const matchesEstudiante = selectedEstudiante === "all" || cuenta.estudiante.toLowerCase().includes(selectedEstudiante.toLowerCase());
    
    let matchesFecha = true;
    if (fechaInicio && fechaFin) {
      const fechaCargo = new Date(cuenta.fecha_cargo);
      const inicio = new Date(fechaInicio);
      const fin = new Date(fechaFin);
      matchesFecha = fechaCargo >= inicio && fechaCargo <= fin;
    }
    
    return matchesEstado && matchesDias && matchesConcepto && matchesNivel && matchesEstudiante && matchesFecha;
  });

  const estadisticas = {
    totalCuentas: cuentasPorCobrar.length,
    montoPendienteTotal: cuentasPorCobrar.reduce((sum, c) => sum + c.pendiente_pagar_centavos, 0),
    cuentasVencidas: cuentasPorCobrar.filter(c => c.estado_cobranza === "VENCIDO").length,
    cuentasMorosas: cuentasPorCobrar.filter(c => c.estado_cobranza === "MOROSO").length,
    cuentasDeshabilitadas: cuentasPorCobrar.filter(c => !c.cuenta_habilitada).length,
    promedioTiempoVencimiento: cuentasPorCobrar.filter(c => c.dias_vencido > 0).reduce((sum, c) => sum + c.dias_vencido, 0) / cuentasPorCobrar.filter(c => c.dias_vencido > 0).length || 0
  };

  const getEstadoBadge = (estado: string, diasVencido: number, cuentaHabilitada: boolean) => {
    if (!cuentaHabilitada) {
      return <Badge className="bg-red-100 text-red-800">
        <Ban className="w-3 h-3 mr-1" />
        Deshabilitada
      </Badge>;
    }
    
    switch (estado) {
      case "CORRIENTE":
        return <Badge className="bg-green-100 text-green-800">Al corriente</Badge>;
      case "PAGADO":
        return <Badge className="bg-blue-100 text-blue-800">Pagado</Badge>;
      case "PARCIAL":
        return <Badge className="bg-orange-100 text-orange-800">Pago parcial</Badge>;
      case "VENCIDO":
        return <Badge className="bg-yellow-100 text-yellow-800">
          <Clock className="w-3 h-3 mr-1" />
          Vencido ({diasVencido}d)
        </Badge>;
      case "MOROSO":
        return <Badge className="bg-red-100 text-red-800">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Moroso ({diasVencido}d)
        </Badge>;
      default:
        return <Badge variant="secondary">{estado}</Badge>;
    }
  };

  const getPrioridadColor = (diasVencido: number, estado: string, cuentaHabilitada: boolean) => {
    if (!cuentaHabilitada) return "border-red-300 bg-red-100";
    if (estado === "MOROSO" || diasVencido > 30) return "border-red-200 bg-red-50";
    if (estado === "VENCIDO" || diasVencido > 0) return "border-yellow-200 bg-yellow-50";
    if (estado === "PAGADO") return "border-green-200 bg-green-50";
    return "border-slate-200";
  };

  const handleSetCompromise = (cuenta: any) => {
    setSelectedCuenta(cuenta);
    setShowCompromiseModal(true);
  };

  const handleIniciarCobranza = () => {
    const cuentasVencidas = cuentasPorCobrar.filter((c: any) => c.estado_cobranza === "VENCIDO" || c.estado_cobranza === "MOROSO");
    
    toast({
      title: "Proceso de Cobranza Iniciado",
      description: `Iniciando seguimiento para ${cuentasVencidas.length} cuentas vencidas. Se generarán llamadas y notificaciones automáticas.`,
      duration: 4000,
    });

    // Simular proceso de cobranza
    setTimeout(() => {
      toast({
        title: "Cobranza en Progreso",
        description: "Se han programado 15 llamadas y enviado 8 notificaciones de seguimiento.",
        duration: 3000,
      });
    }, 2000);
  };

  const handleEnviarRecordatorios = () => {
    const cuentasPendientes = cuentasPorCobrar.filter((c: any) => c.pendiente_pagar_centavos > 0);
    
    toast({
      title: "Enviando Recordatorios",
      description: `Enviando recordatorios de pago a ${cuentasPendientes.length} familias por email y SMS...`,
      duration: 3000,
    });

    // Simular envío de recordatorios
    setTimeout(() => {
      toast({
        title: "Recordatorios Enviados",
        description: `✓ ${cuentasPendientes.length} emails enviados\n✓ ${Math.floor(cuentasPendientes.length * 0.8)} SMS enviados\n✓ 3 llamadas programadas`,
        duration: 4000,
      });
    }, 2500);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Cuentas por Cobrar</h1>
          <p className="text-slate-600">Gestión de cartera vencida y seguimiento de cobranza</p>
        </div>
        <div className="flex gap-2">
          <Button 
            className="bg-orange-600 hover:bg-orange-700"
            onClick={handleIniciarCobranza}
          >
            <Phone className="w-4 h-4 mr-2" />
            Iniciar Cobranza
          </Button>
          <Button 
            variant="outline"
            onClick={handleEnviarRecordatorios}
          >
            <Mail className="w-4 h-4 mr-2" />
            Enviar Recordatorios
          </Button>
        </div>
      </div>

      {/* KPIs de cobranza compactos */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="text-center">
              <Users className="w-5 h-5 text-blue-600 mx-auto mb-1" />
              <div className="text-lg font-bold">{estadisticas.totalCuentas}</div>
              <div className="text-xs text-slate-600">Total</div>
            </div>
            <div className="text-center">
              <DollarSign className="w-5 h-5 text-green-600 mx-auto mb-1" />
              <div className="text-lg font-bold">${(estadisticas.montoPendienteTotal / 100000).toFixed(0)}K</div>
              <div className="text-xs text-slate-600">Por cobrar</div>
            </div>
            <div className="text-center">
              <Clock className="w-5 h-5 text-yellow-600 mx-auto mb-1" />
              <div className="text-lg font-bold">{estadisticas.cuentasVencidas}</div>
              <div className="text-xs text-slate-600">Vencidas</div>
            </div>
            <div className="text-center">
              <AlertTriangle className="w-5 h-5 text-red-600 mx-auto mb-1" />
              <div className="text-lg font-bold">{estadisticas.cuentasMorosas}</div>
              <div className="text-xs text-slate-600">Morosas</div>
            </div>
            <div className="text-center">
              <Ban className="w-5 h-5 text-red-800 mx-auto mb-1" />
              <div className="text-lg font-bold">{estadisticas.cuentasDeshabilitadas}</div>
              <div className="text-xs text-slate-600">Deshabilitadas</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold">{estadisticas.promedioTiempoVencimiento.toFixed(0)}</div>
              <div className="text-xs text-slate-600">Días prom.</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="lista" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="lista">Lista de cuentas</TabsTrigger>
          <TabsTrigger value="seguimiento">Seguimiento</TabsTrigger>
          <TabsTrigger value="reportes">Reportes</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-4">
          {/* Filtros compactos */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Filter className="w-4 h-4" />
                Filtros de búsqueda
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
                <div>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Buscar estudiante..."
                      value={selectedEstudiante === "all" ? "" : selectedEstudiante}
                      onChange={(e) => setSelectedEstudiante(e.target.value || "all")}
                      className="pl-10 h-9"
                    />
                  </div>
                </div>
                <div>
                  <Input
                    placeholder="Buscar concepto..."
                    value={selectedConcepto === "all" ? "" : selectedConcepto}
                    onChange={(e) => setSelectedConcepto(e.target.value || "all")}
                    className="h-9"
                  />
                </div>
                <div>
                  <Select value={selectedNivel} onValueChange={setSelectedNivel}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Nivel escolar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="KINDER">Kinder</SelectItem>
                      <SelectItem value="PRIMARIA">Primaria</SelectItem>
                      <SelectItem value="SECUNDARIA">Secundaria</SelectItem>
                      <SelectItem value="BACHILLERATO">Bachillerato</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Select value={selectedEstado} onValueChange={setSelectedEstado}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="CORRIENTE">Corriente</SelectItem>
                      <SelectItem value="PAGADO">Pagado</SelectItem>
                      <SelectItem value="PARCIAL">Parcial</SelectItem>
                      <SelectItem value="VENCIDO">Vencido</SelectItem>
                      <SelectItem value="MOROSO">Moroso</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="h-9 w-full"
                    onClick={() => {
                      setSelectedEstado("all");
                      setSelectedConcepto("all");
                      setSelectedNivel("all");
                      setSelectedEstudiante("all");
                      setFechaInicio("");
                      setFechaFin("");
                    }}
                  >
                    Limpiar
                  </Button>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Input
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                    className="h-9"
                    placeholder="Fecha desde"
                  />
                </div>
                <div>
                  <Input
                    type="date"
                    value={fechaFin}
                    onChange={(e) => setFechaFin(e.target.value)}
                    className="h-9"
                    placeholder="Fecha hasta"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Gráficos de Análisis Visual */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <PieChart className="h-5 w-5" />
                Análisis Visual de Cuentas por Cobrar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <Card>
                  <CardContent className="p-4">
                    <PieChartComponent 
                      data={statusData} 
                      title="Por Estado de Cobranza" 
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <PieChartComponent 
                      data={daysOverdueData} 
                      title="Por Días Vencidos" 
                    />
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Cuentas por cobrar ({filteredCuentas.length})</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left p-2 font-medium min-w-[200px]">Estudiante</th>
                      <th className="text-left p-2 font-medium min-w-[180px]">Concepto</th>
                      <th className="text-right p-2 font-medium min-w-[90px]">Inicial</th>
                      <th className="text-right p-2 font-medium min-w-[80px]">Desc.</th>
                      <th className="text-right p-2 font-medium min-w-[80px]">Rec.</th>
                      <th className="text-right p-2 font-medium min-w-[90px]">Pagado</th>
                      <th className="text-right p-2 font-medium min-w-[90px]">Pendiente</th>
                      <th className="text-center p-2 font-medium min-w-[100px]">Estado</th>
                      <th className="text-center p-2 font-medium min-w-[100px]">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCuentas.map((cuenta) => (
                      <tr key={cuenta.id} className={`border-b hover:bg-slate-50 ${getPrioridadColor(cuenta.dias_vencido, cuenta.estado_cobranza, cuenta.cuenta_habilitada)}`}>
                        <td className="p-2">
                          <div>
                            <div className="font-medium text-sm">{cuenta.estudiante}</div>
                            <div className="text-xs text-slate-500">{cuenta.grado}</div>
                            <div className="text-xs text-slate-500">{cuenta.responsable}</div>
                          </div>
                        </td>
                        <td className="p-2">
                          <div>
                            <div className="font-medium text-sm">{cuenta.concepto}</div>
                            <div className="text-xs text-slate-500">Vence: {cuenta.fecha_vencimiento}</div>
                            {cuenta.fecha_compromiso && (
                              <div className="text-xs text-blue-600">Compromiso: {cuenta.fecha_compromiso}</div>
                            )}
                          </div>
                        </td>
                        <td className="p-2 text-right font-medium">
                          ${(cuenta.monto_inicial_centavos / 100).toLocaleString()}
                        </td>
                        <td className="p-2 text-right text-green-600 text-sm">
                          -${(cuenta.descuentos_centavos / 100).toLocaleString()}
                        </td>
                        <td className="p-2 text-right text-red-600 text-sm">
                          +${(cuenta.recargos_centavos / 100).toLocaleString()}
                        </td>
                        <td className="p-2 text-right text-blue-600 font-medium">
                          ${(cuenta.total_pagado_centavos / 100).toLocaleString()}
                        </td>
                        <td className="p-2 text-right font-bold text-red-600">
                          ${(cuenta.pendiente_pagar_centavos / 100).toLocaleString()}
                        </td>
                        <td className="p-2 text-center">
                          {getEstadoBadge(cuenta.estado_cobranza, cuenta.dias_vencido, cuenta.cuenta_habilitada)}
                        </td>
                        <td className="p-2 text-center">
                          <div className="flex gap-1 justify-center">
                            <Button size="sm" variant="outline" className="h-7 w-7 p-0" title="Llamar">
                              <Phone className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 w-7 p-0" title="Email">
                              <Mail className="w-3 h-3" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-7 w-7 p-0" 
                              title="Compromiso pago"
                              onClick={() => handleSetCompromise(cuenta)}
                            >
                              <Calendar className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seguimiento">
          <Card>
            <CardHeader>
              <CardTitle>Programar seguimiento de cobranza</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>Seleccionar cuenta</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Buscar estudiante..." />
                    </SelectTrigger>
                    <SelectContent>
                      {cuentasPorCobrar.filter(c => c.estado_cobranza !== "CORRIENTE").map(cuenta => (
                        <SelectItem key={cuenta.id} value={cuenta.id.toString()}>
                          {cuenta.estudiante} - ${(cuenta.monto_inicial_centavos / 100).toLocaleString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tipo de seguimiento</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar tipo..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="llamada">Llamada telefónica</SelectItem>
                      <SelectItem value="email">Correo electrónico</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="presencial">Visita presencial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Fecha de seguimiento</Label>
                  <Input type="date" />
                </div>
                <div>
                  <Label>Hora</Label>
                  <Input type="time" />
                </div>
                <div className="md:col-span-2">
                  <Label>Observaciones</Label>
                  <Textarea placeholder="Detalles del seguimiento a realizar..." />
                </div>
              </div>
              <Button className="mt-4 bg-orange-600 hover:bg-orange-700">
                Programar seguimiento
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reportes">
          <ReportesCobranza />
        </TabsContent>

        {/* Modal para establecer fecha compromiso */}
        <Dialog open={showCompromiseModal} onOpenChange={setShowCompromiseModal}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg">Fecha de pago compromiso</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              {selectedCuenta && (
                <div className="space-y-4">
                  <div className="p-3 bg-slate-50 rounded">
                    <div className="font-medium text-sm">{selectedCuenta.estudiante}</div>
                    <div className="text-sm text-slate-600">{selectedCuenta.concepto}</div>
                    <div className="text-sm text-red-600">
                      Pendiente: ${(selectedCuenta.pendiente_pagar_centavos / 100).toLocaleString()}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm">Fecha compromiso de pago</Label>
                      <Input type="date" defaultValue={selectedCuenta.fecha_compromiso || ""} className="h-9" />
                    </div>
                    
                    <div>
                      <Label className="text-sm">Nuevo monto (opcional)</Label>
                      <Input 
                        type="number" 
                        placeholder={(selectedCuenta.pendiente_pagar_centavos / 100).toString()}
                        className="h-9"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-sm">Descuento adicional (opcional)</Label>
                    <Input type="number" placeholder="0" className="h-9" />
                  </div>
                  
                  <div>
                    <Label className="text-sm">Observaciones</Label>
                    <Textarea placeholder="Observaciones sobre el acuerdo de pago..." className="h-20" />
                  </div>
                  
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                    <div className="text-xs text-yellow-800">
                      <strong>Advertencia:</strong> Si no cumple la fecha compromiso, 
                      la cuenta será deshabilitada automáticamente.
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" size="sm" onClick={() => setShowCompromiseModal(false)}>
                Cancelar
              </Button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                Establecer compromiso
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </Tabs>
    </div>
  );
}