import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Clock, DollarSign, Users, Download, Eye, Search, Filter, X } from "lucide-react";

export default function CuentasPorCobrarFinal() {
  // Estados locales
  const [filtros, setFiltros] = useState({
    fechaInicio: "",
    fechaFin: "",
    estudiante: "",
    formato: "detallado"
  });

  // Datos de prueba simplificados
  const cuentas = [
    {
      id: 1,
      estudiante: "María González Pérez",
      nivel_academico: "Primaria",
      concepto: "Colegiatura",
      pendiente_pagar_centavos: 280000,
      estado_cobranza: "Vencido",
      dias_vencido: 15,
      familia: "González Pérez"
    },
    {
      id: 2,
      estudiante: "Juan Carlos Morales",
      nivel_academico: "Secundaria",
      concepto: "Inscripción",
      pendiente_pagar_centavos: 320000,
      estado_cobranza: "Por vencer",
      dias_vencido: 0,
      familia: "Morales Ruiz"
    },
    {
      id: 3,
      estudiante: "Ana Sofía Ramírez",
      nivel_academico: "Kinder",
      concepto: "Colegiatura",
      pendiente_pagar_centavos: 250000,
      estado_cobranza: "Al corriente",
      dias_vencido: 0,
      familia: "Ramírez López"
    }
  ];

  const reportes = [
    {
      nombre: "Antigüedad de Saldos",
      descripcion: "Análisis detallado de cuentas por antigüedad"
    },
    {
      nombre: "Cartera Vencida",
      descripcion: "Reporte de pagos vencidos y morosidad"
    },
    {
      nombre: "Eficiencia de Cobranza",
      descripcion: "Métricas de efectividad en recuperación"
    },
    {
      nombre: "Seguimiento de Promesas",
      descripcion: "Control de compromisos de pago"
    },
    {
      nombre: "Análisis de Morosidad",
      descripcion: "Estudio de patrones de morosidad"
    },
    {
      nombre: "Reporte Ejecutivo",
      descripcion: "Resumen ejecutivo para directivos"
    }
  ];

  // Función para formatear moneda
  const formatCurrency = (centavos: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(centavos / 100);
  };

  // Calcular métricas
  const totalPorCobrar = cuentas.reduce((sum, c) => sum + c.pendiente_pagar_centavos, 0);
  const cuentasVencidas = cuentas.filter(c => c.estado_cobranza === "Vencido").length;

  // Función para generar reporte PDF
  const generarReportePDF = (nombreReporte: string) => {
    const logoFallback = `<div style="width: 80px; height: 80px; margin-right: 20px; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 24px;">JFR</div>`;
    
    const reporteHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Reporte - ${nombreReporte}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
          .header { display: flex; align-items: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px; }
          .institution-info h1 { color: #1e40af; margin: 0; font-size: 24px; }
          .institution-info p { color: #64748b; margin: 5px 0; }
          .report-title { text-align: center; color: #1e40af; font-size: 20px; margin: 20px 0; }
          .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 30px 0; }
          .metric-card { border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; text-align: center; }
          .metric-value { font-size: 24px; font-weight: bold; color: #1e40af; }
          .metric-label { color: #64748b; font-size: 14px; }
          .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          .table th, .table td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; }
          .table th { background-color: #f8fafc; color: #1e40af; font-weight: bold; }
          .footer { margin-top: 40px; text-align: center; color: #64748b; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
          @media print { .no-print { display: none !important; } }
        </style>
      </head>
      <body>
        <div class="header">
          ${logoFallback}
          <div class="institution-info">
            <h1>Instituto JFR</h1>
            <p>RFC: IJF180615AB3</p>
            <p>Reporte generado: ${new Date().toLocaleDateString('es-MX')}</p>
          </div>
        </div>
        
        <h2 class="report-title">${nombreReporte}</h2>
        
        <div class="metrics">
          <div class="metric-card">
            <div class="metric-value">${formatCurrency(totalPorCobrar)}</div>
            <div class="metric-label">Total por Cobrar</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${cuentas.length}</div>
            <div class="metric-label">Total Cuentas</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${cuentasVencidas}</div>
            <div class="metric-label">Cuentas Vencidas</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">73.2%</div>
            <div class="metric-label">Tasa Recuperación</div>
          </div>
        </div>
        
        <table class="table">
          <thead>
            <tr>
              <th>Estudiante</th>
              <th>Nivel</th>
              <th>Concepto</th>
              <th>Pendiente</th>
              <th>Estado</th>
              <th>Días Vencido</th>
            </tr>
          </thead>
          <tbody>
            ${cuentas.map(cuenta => `
              <tr>
                <td>${cuenta.estudiante}</td>
                <td>${cuenta.nivel_academico}</td>
                <td>${cuenta.concepto}</td>
                <td>${formatCurrency(cuenta.pendiente_pagar_centavos)}</td>
                <td>${cuenta.estado_cobranza}</td>
                <td>${cuenta.dias_vencido}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div class="footer">
          <p>Documento generado por Edupay - Sistema de Gestión Escolar</p>
          <p>Fecha y hora: ${new Date().toLocaleString('es-MX')}</p>
        </div>
      </body>
      </html>
    `;

    const ventana = window.open('', '_blank');
    if (ventana) {
      ventana.document.write(reporteHTML);
      ventana.document.close();
      ventana.print();
    }

    alert(`Reporte generado: ${nombreReporte} listo para descarga`);
  };

  // Función para limpiar filtros
  const limpiarFiltros = () => {
    setFiltros({
      fechaInicio: "",
      fechaFin: "",
      estudiante: "",
      formato: "detallado"
    });
  };

  const hayFiltrosActivos = filtros.fechaInicio || filtros.fechaFin || filtros.estudiante || filtros.formato !== "detallado";

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Cuentas por Cobrar</h1>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total por Cobrar</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalPorCobrar)}</div>
            <p className="text-xs text-muted-foreground">+2.5% desde el mes pasado</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cuentas Activas</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cuentas.length}</div>
            <p className="text-xs text-muted-foreground">Total de cuentas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cuentas Vencidas</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{cuentasVencidas}</div>
            <p className="text-xs text-muted-foreground">Requieren seguimiento</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasa de Recuperación</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">73.2%</div>
            <p className="text-xs text-muted-foreground">Eficiencia de cobranza</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="lista" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="lista">Lista de Cuentas</TabsTrigger>
          <TabsTrigger value="seguimiento">Seguimiento</TabsTrigger>
          <TabsTrigger value="reportes">Reportes</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-4">
          {/* Barra de filtros */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Filtros Avanzados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium">Fecha Inicio</label>
                  <Input
                    type="date"
                    value={filtros.fechaInicio}
                    onChange={(e) => setFiltros({...filtros, fechaInicio: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Fecha Fin</label>
                  <Input
                    type="date"
                    value={filtros.fechaFin}
                    onChange={(e) => setFiltros({...filtros, fechaFin: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Buscar Estudiante/Familia</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="Nombre del estudiante o familia"
                      value={filtros.estudiante}
                      onChange={(e) => setFiltros({...filtros, estudiante: e.target.value})}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Formato</label>
                  <Select value={filtros.formato} onValueChange={(value) => setFiltros({...filtros, formato: value})}>
                    <SelectTrigger>
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
              
              {hayFiltrosActivos && (
                <div className="mt-4 flex justify-end">
                  <Button variant="outline" size="sm" onClick={limpiarFiltros}>
                    <X className="w-4 h-4 mr-1" />
                    Limpiar Filtros
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Lista de cuentas */}
          <Card>
            <CardHeader>
              <CardTitle>Cuentas por Cobrar</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Estudiante</th>
                      <th className="text-left p-2">Nivel</th>
                      <th className="text-left p-2">Concepto</th>
                      <th className="text-left p-2">Pendiente</th>
                      <th className="text-left p-2">Estado</th>
                      <th className="text-left p-2">Días Vencido</th>
                      <th className="text-left p-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuentas.map((cuenta) => (
                      <tr key={cuenta.id} className="border-b">
                        <td className="p-2">{cuenta.estudiante}</td>
                        <td className="p-2">{cuenta.nivel_academico}</td>
                        <td className="p-2">{cuenta.concepto}</td>
                        <td className="p-2 font-semibold">{formatCurrency(cuenta.pendiente_pagar_centavos)}</td>
                        <td className="p-2">
                          <Badge variant={cuenta.estado_cobranza === "Vencido" ? "destructive" : 
                                        cuenta.estado_cobranza === "Por vencer" ? "secondary" : "default"}>
                            {cuenta.estado_cobranza}
                          </Badge>
                        </td>
                        <td className="p-2">{cuenta.dias_vencido}</td>
                        <td className="p-2">
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

        <TabsContent value="seguimiento" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Seguimiento de Cobranza</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600">Herramientas de seguimiento y gestión de cobranza en desarrollo.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reportes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Reportes Especializados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {reportes.map((reporte, index) => (
                  <Card key={index}>
                    <CardContent className="p-4">
                      <h3 className="font-semibold mb-2">{reporte.nombre}</h3>
                      <p className="text-sm text-slate-600 mb-4">{reporte.descripcion}</p>
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          className="flex-1"
                          onClick={() => generarReportePDF(reporte.nombre)}
                        >
                          <Download className="w-4 h-4 mr-1" />
                          Descargar
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => alert(`Mostrando vista previa de ${reporte.nombre}`)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}