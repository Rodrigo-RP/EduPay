import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Search, Download, FileText, Filter, Users, DollarSign, Calendar, TrendingUp, Eye } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useInstitution } from "@/hooks/use-institution";

// Tipos para las cuentas por cobrar
interface CuentaPorCobrar {
  id: number;
  estudiante: string;
  responsable: string;
  telefono: string;
  email: string;
  nivel_escolar: string;
  grado: string;
  concepto: string;
  fecha_cargo: string;
  monto_inicial_centavos: number;
  descuentos_centavos?: number;
  recargos_centavos?: number;
  total_pagado_centavos: number;
  pendiente_pagar_centavos: number;
  dias_vencido: number;
  estado_cobranza: string;
  fecha_vencimiento: string;
  fecha_compromiso?: string | null;
  cuenta_habilitada: boolean;
  fecha_ultimo_seguimiento?: string;
  observaciones_cobranza?: string;
}

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
      const periodoTexto = fechaInicio && fechaFin ? `${fechaInicio} a ${fechaFin}` : "Período completo";
      
      const contenido = `REPORTE DE CUENTAS POR COBRAR - ${institutionName || 'INSTITUTO JFR'}
Período: ${periodoTexto}
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
      link.download = `${institutionName?.replace(/\s/g, '_') || 'JFR'}_Reporte_Cobranza_${periodoTexto}_${fechaGeneracion.replace(/\//g, '-')}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "✅ Reporte Generado Exitosamente",
        description: `Reporte de cobranza del período ${periodoTexto} descargado correctamente`,
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
      const periodoTexto = fechaInicio && fechaFin ? `${fechaInicio} a ${fechaFin}` : "Período completo";
      
      const csvContent = `REPORTE DE CUENTAS POR COBRAR - ${institutionName || 'INSTITUTO JFR'}
Período,${periodoTexto}
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
      link.download = `${institutionName?.replace(/\s/g, '_') || 'JFR'}_Reporte_Cobranza_${periodoTexto}_${fechaGeneracion.replace(/\//g, '-')}.csv`;
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
      const periodoTexto = fechaInicio && fechaFin ? `${fechaInicio} a ${fechaFin}` : "Período completo";
      
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

          <div class="section" style="text-align: center; margin: 30px 0;">
            <div class="section-title">OPCIONES DE DESCARGA</div>
            <div style="margin: 20px 0;">
              <button onclick="downloadExcel()" style="background: #16a34a; color: white; padding: 12px 24px; border: none; border-radius: 6px; margin: 0 10px; cursor: pointer; font-size: 14px;">
                📊 Descargar Excel
              </button>
              <button onclick="downloadPDF()" style="background: #dc2626; color: white; padding: 12px 24px; border: none; border-radius: 6px; margin: 0 10px; cursor: pointer; font-size: 14px;">
                📄 Descargar PDF
              </button>
              <button onclick="window.print()" style="background: #ea580c; color: white; padding: 12px 24px; border: none; border-radius: 6px; margin: 0 10px; cursor: pointer; font-size: 14px;">
                🖨️ Imprimir
              </button>
            </div>
          </div>

          <div class="footer">
            <p><strong>Generado por Edupay - Sistema de Pagos Escolares</strong></p>
            <p>${institutionName || 'Instituto JFR'} | ${fechaGeneracion} | Formato: ${selectedFormat}</p>
            <p>Este reporte contiene información confidencial del proceso de cobranza institucional</p>
          </div>

          <script>
            function downloadExcel() {
              const csvContent = "REPORTE DE CUENTAS POR COBRAR - ${institutionName || 'INSTITUTO JFR'}\\n" +
                "Fecha de generación,${fechaGeneracion}\\n" +
                "Período,${periodoTexto}\\n\\n" +
                "RESUMEN EJECUTIVO\\n" +
                "Total por Cobrar,$${(kpisCobranza.totalPorCobrar / 100).toLocaleString('es-MX')}\\n" +
                "Cuentas Vencidas,${kpisCobranza.cuentasVencidas}\\n" +
                "Cuentas Morosas,${kpisCobranza.cuentasMorosas}\\n" +
                "Tasa de Recuperación,${kpisCobranza.tasaRecuperacion}%\\n" +
                "Eficiencia de Gestión,${kpisCobranza.eficienciaGestion}%\\n\\n" +
                "ANTIGÜEDAD DE SALDOS\\n" +
                "Rango,Monto,Porcentaje\\n" +
                "0-30 días,$1680000,40.0%\\n" +
                "31-60 días,$1260000,30.0%\\n" +
                "61-90 días,$840000,20.0%\\n" +
                "Más de 90 días,$420000,10.0%\\n\\n" +
                "ANÁLISIS POR NIVEL ACADÉMICO\\n" +
                "Nivel,Monto por Cobrar,Porcentaje\\n" +
                "Kinder,$945000,22.5%\\n" +
                "Primaria,$1470000,35.0%\\n" +
                "Secundaria,$1155000,27.5%\\n" +
                "Bachillerato,$630000,15.0%";

              const blob = new Blob(['\\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
              const url = window.URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = 'Reporte_Cuentas_por_Cobrar_${fechaGeneracion.replace(/\\//g, "")}.csv';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              window.URL.revokeObjectURL(url);
            }

            function downloadPDF() {
              window.print();
            }
          </script>
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
    if (reporte.formato === "Excel") {
      handleGenerarReporteExcel();
    } else {
      handleGenerarReportePDF();
    }
  };

  const handlePreviewReport = (reporte: any) => {
    handleGenerarReportePDF();
  };

  return (
    <div className="space-y-6">
      {/* Filtros de búsqueda compactos */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-700">Filtros de búsqueda</span>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Campo de búsqueda por estudiante */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <Input
              type="text"
              value={filtroNombre}
              onChange={(e) => setFiltroNombre(e.target.value)}
              className="pl-10 w-48 h-9 text-sm border-gray-300 focus:border-orange-500"
              placeholder="Buscar estudiante..."
            />
          </div>

          {/* Fecha inicio */}
          <Input
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className="w-36 h-9 text-sm border-gray-300 focus:border-orange-500"
            placeholder="dd/mm/aaaa"
          />

          {/* Fecha fin */}
          <Input
            type="date"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            className="w-36 h-9 text-sm border-gray-300 focus:border-orange-500"
            placeholder="dd/mm/aaaa"
          />

          {/* Selector de formato */}
          <Select value={selectedFormat} onValueChange={setSelectedFormat}>
            <SelectTrigger className="w-32 h-9 text-sm border-gray-300 focus:border-orange-500">
              <SelectValue placeholder="Formato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="detallado">Detallado</SelectItem>
              <SelectItem value="ejecutivo">Ejecutivo</SelectItem>
              <SelectItem value="auditoria">Auditoría</SelectItem>
            </SelectContent>
          </Select>

          {/* Botón limpiar */}
          {(fechaInicio || fechaFin || filtroNombre) && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                setFechaInicio("");
                setFechaFin("");
                setFiltroNombre("");
              }}
              className="h-9 px-3 text-sm text-gray-600 border-gray-300 hover:bg-gray-100"
            >
              Limpiar
            </Button>
          )}
        </div>
      </div>

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
  // Estados para filtros
  const [selectedEstado, setSelectedEstado] = useState("all");
  const [filtroNombre, setFiltroNombre] = useState("");
  const [filtroConcepto, setFiltroConcepto] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [selectedPeriodo, setSelectedPeriodo] = useState("enero-2025");
  const [selectedFormato, setSelectedFormato] = useState("detallado");

  const { toast } = useToast();
  const { logoUrl, institutionName } = useInstitution();
  const { user } = useAuth();

  // Obtener datos reales de cuentas por cobrar
  const { data: cuentasPorCobrarData = [], isLoading, error } = useQuery({
    queryKey: ["/api/accounts-receivable"],
    enabled: !!user?.campus_id,
    retry: 1,
    staleTime: 0
  });

  // Mostrar estado de carga
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Cargando cuentas por cobrar...</p>
        </div>
      </div>
    );
  }

  // Mostrar error si hay problemas con la consulta
  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Error al cargar datos</h2>
          <p className="text-slate-600 mb-4">No se pudieron cargar las cuentas por cobrar</p>
          <Button onClick={() => window.location.reload()}>
            Intentar nuevamente
          </Button>
        </div>
      </div>
    );
  }

  // Usar datos de la API
  const cuentasPorCobrar: CuentaPorCobrar[] = (cuentasPorCobrarData as CuentaPorCobrar[]) || [];

  // Lista de conceptos del catálogo de productos (restaurados)
  const conceptosCatalogo = [
    { id: 1, codigo: "COL-2025", nombre: "Colegiatura Mensual", categoria: "COLEGIATURAS", descripcion: "Pago mensual de colegiatura para servicios educativos" },
    { id: 2, codigo: "INS-2025", nombre: "Inscripción Anual", categoria: "INSCRIPCIONES", descripcion: "Pago único anual por inscripción al ciclo escolar" },
    { id: 3, codigo: "REINS-2025", nombre: "Reinscripción", categoria: "REINSCRIPCIONES", descripcion: "Proceso de reinscripción para ciclo escolar siguiente" },
    { id: 4, codigo: "SEG-ESC-2025", nombre: "Seguro Escolar", categoria: "SEGURO_ESCOLAR", descripcion: "Seguro contra accidentes escolares para estudiantes" },
    { id: 5, codigo: "LIB-2025", nombre: "Paquete de Libros", categoria: "LIBROS", descripcion: "Set completo de libros de texto por nivel académico" },
    { id: 6, codigo: "UNI-2025", nombre: "Uniforme Escolar", categoria: "OTROS", descripcion: "Uniforme completo oficial de la institución" },
    { id: 7, codigo: "LAB-2025", nombre: "Laboratorio", categoria: "OTROS", descripcion: "Uso de laboratorios de ciencias y computación" },
    { id: 8, codigo: "TRA-2025", nombre: "Transporte Escolar", categoria: "OTROS", descripcion: "Servicio de transporte escolar ida y vuelta" },
    { id: 9, codigo: "COM-2025", nombre: "Comedor Escolar", categoria: "OTROS", descripcion: "Servicio de alimentación en el plantel educativo" },
    { id: 10, codigo: "EXT-2025", nombre: "Actividades Extraescolares", categoria: "OTROS", descripcion: "Deportes, música, arte y actividades complementarias" }
  ];

  // Función para filtrar las cuentas
  const filtrarCuentas = (cuentas: CuentaPorCobrar[]) => {
    return cuentas.filter((cuenta) => {
      const matchEstado = selectedEstado === "all" || cuenta.estado_cobranza === selectedEstado;
      const matchNombre = !filtroNombre || cuenta.estudiante.toLowerCase().includes(filtroNombre.toLowerCase());
      const matchConcepto = !filtroConcepto || cuenta.concepto.toLowerCase().includes(filtroConcepto.toLowerCase());
      
      return matchEstado && matchNombre && matchConcepto;
    });
  };

  // Aplicar filtros
  const cuentasFiltradas = filtrarCuentas(cuentasPorCobrar);

  // Calcular métricas
  const totalPorCobrar = cuentasFiltradas.reduce((sum, c) => sum + c.pendiente_pagar_centavos, 0);
  const totalVencido = cuentasFiltradas.filter(c => c.estado_cobranza === "VENCIDO" || c.estado_cobranza === "MOROSO").reduce((sum, c) => sum + c.pendiente_pagar_centavos, 0);
  const totalCorriente = cuentasFiltradas.filter(c => c.estado_cobranza === "CORRIENTE").reduce((sum, c) => sum + c.pendiente_pagar_centavos, 0);
  const totalPagado = cuentasFiltradas.reduce((sum, c) => sum + c.total_pagado_centavos, 0);

  // Datos para gráficos
  const statusData = [
    { name: 'Corriente', value: cuentasFiltradas.filter(c => c.estado_cobranza === "CORRIENTE").length, color: '#00C49F' },
    { name: 'Vencido', value: cuentasFiltradas.filter(c => c.estado_cobranza === "VENCIDO").length, color: '#FFBB28' },
    { name: 'Moroso', value: cuentasFiltradas.filter(c => c.estado_cobranza === "MOROSO").length, color: '#FF8042' },
    { name: 'Pagado', value: cuentasFiltradas.filter(c => c.estado_cobranza === "PAGADO").length, color: '#0088FE' },
    { name: 'Parcial', value: cuentasFiltradas.filter(c => c.estado_cobranza === "PARCIAL").length, color: '#8884D8' }
  ];

  const daysOverdueData = [
    { name: '0-7 días', value: cuentasFiltradas.filter(c => c.dias_vencido >= 0 && c.dias_vencido <= 7).length, color: '#00C49F' },
    { name: '8-30 días', value: cuentasFiltradas.filter(c => c.dias_vencido > 7 && c.dias_vencido <= 30).length, color: '#FFBB28' },
    { name: '31-60 días', value: cuentasFiltradas.filter(c => c.dias_vencido > 30 && c.dias_vencido <= 60).length, color: '#FF8042' },
    { name: '60+ días', value: cuentasFiltradas.filter(c => c.dias_vencido > 60).length, color: '#8884D8' }
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Cuentas por Cobrar</h1>
          <p className="text-slate-600 mt-1">Gestión y seguimiento de cartera de clientes</p>
        </div>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <DollarSign className="h-8 w-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-slate-600">Total por Cobrar</p>
                <p className="text-2xl font-bold text-slate-900">
                  ${(totalPorCobrar / 100).toLocaleString('es-MX')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <AlertTriangle className="h-8 w-8 text-red-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-slate-600">Vencido</p>
                <p className="text-2xl font-bold text-red-600">
                  ${(totalVencido / 100).toLocaleString('es-MX')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <TrendingUp className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-slate-600">Corriente</p>
                <p className="text-2xl font-bold text-green-600">
                  ${(totalCorriente / 100).toLocaleString('es-MX')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-slate-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-slate-600">Total Cuentas</p>
                <p className="text-2xl font-bold text-slate-900">{cuentasFiltradas.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Estado de Cobranza</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [value, 'Cuentas']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Días Vencidos</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={daysOverdueData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  dataKey="value"
                >
                  {daysOverdueData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [value, 'Cuentas']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="lista" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="lista">Lista de cuentas</TabsTrigger>
          <TabsTrigger value="seguimiento">Seguimiento</TabsTrigger>
          <TabsTrigger value="reportes">Reportes</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-4">
          {/* Filtros */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Filtros
              </CardTitle>
              <CardDescription>
                Filtrar cuentas por estado, estudiante y concepto
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div>
                  <Label htmlFor="filtro-estado">Estado</Label>
                  <Select value={selectedEstado} onValueChange={setSelectedEstado}>
                    <SelectTrigger id="filtro-estado">
                      <SelectValue placeholder="Todos los estados" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los estados</SelectItem>
                      <SelectItem value="CORRIENTE">Corriente</SelectItem>
                      <SelectItem value="VENCIDO">Vencido</SelectItem>
                      <SelectItem value="MOROSO">Moroso</SelectItem>
                      <SelectItem value="PAGADO">Pagado</SelectItem>
                      <SelectItem value="PARCIAL">Parcial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="filtro-nombre">Buscar estudiante</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="filtro-nombre"
                      placeholder="Escriba el nombre completo..."
                      value={filtroNombre}
                      onChange={(e) => setFiltroNombre(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="filtro-concepto">Concepto</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="filtro-concepto"
                      placeholder="Tipo de cargo..."
                      value={filtroConcepto}
                      onChange={(e) => setFiltroConcepto(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="fecha-inicio">Fecha inicio</Label>
                  <Input
                    id="fecha-inicio"
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="fecha-fin">Fecha fin</Label>
                  <Input
                    id="fecha-fin"
                    type="date"
                    value={fechaFin}
                    onChange={(e) => setFechaFin(e.target.value)}
                  />
                </div>

                <div className="flex items-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedEstado("all");
                      setFiltroNombre("");
                      setFiltroConcepto("");
                      setFechaInicio("");
                      setFechaFin("");
                    }}
                    className="w-full"
                  >
                    Limpiar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabla de cuentas */}
          <Card>
            <CardHeader>
              <CardTitle>Lista de Cuentas ({cuentasFiltradas.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left p-3 font-medium text-slate-700">Estudiante</th>
                      <th className="text-left p-3 font-medium text-slate-700">Concepto</th>
                      <th className="text-right p-3 font-medium text-slate-700">Monto</th>
                      <th className="text-right p-3 font-medium text-slate-700">Pendiente</th>
                      <th className="text-center p-3 font-medium text-slate-700">Estado</th>
                      <th className="text-center p-3 font-medium text-slate-700">Días Venc.</th>
                      <th className="text-center p-3 font-medium text-slate-700">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuentasFiltradas.map((cuenta) => (
                      <tr key={cuenta.id} className="border-b hover:bg-slate-50">
                        <td className="p-3">
                          <div>
                            <div className="font-medium text-slate-900">{cuenta.estudiante}</div>
                            <div className="text-sm text-slate-600">{cuenta.nivel_escolar} - {cuenta.grado}</div>
                          </div>
                        </td>
                        <td className="p-3 text-sm">{cuenta.concepto}</td>
                        <td className="p-3 text-sm text-right">
                          ${(cuenta.monto_inicial_centavos / 100).toLocaleString('es-MX')}
                        </td>
                        <td className="p-3 text-sm text-right text-red-600">
                          ${(cuenta.pendiente_pagar_centavos / 100).toLocaleString('es-MX')}
                        </td>
                        <td className="p-3 text-center">
                          <Badge
                            className={
                              cuenta.estado_cobranza === "PAGADO" ? "bg-green-100 text-green-800 border-green-200" :
                              cuenta.estado_cobranza === "MOROSO" ? "bg-red-100 text-red-800 border-red-200" :
                              cuenta.estado_cobranza === "VENCIDO" ? "bg-orange-100 text-orange-800 border-orange-200" :
                              cuenta.estado_cobranza === "PARCIAL" ? "bg-blue-100 text-blue-800 border-blue-200" :
                              "bg-gray-100 text-gray-800 border-gray-200"
                            }
                          >
                            {cuenta.estado_cobranza}
                          </Badge>
                        </td>
                        <td className="p-3 text-sm text-center">
                          <span className={cuenta.dias_vencido > 0 ? "text-red-600 font-medium" : "text-slate-600"}>
                            {cuenta.dias_vencido}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <Button size="sm" variant="outline">
                            <Eye className="w-4 h-4" />
                          </Button>
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
              <CardTitle>Seguimiento de Cobranza</CardTitle>
              <CardDescription>
                Gestión de seguimiento y recordatorios de pago
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600">Funcionalidad de seguimiento en desarrollo.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reportes">
          <ReportesCobranza />
        </TabsContent>
      </Tabs>
    </div>
  );
}