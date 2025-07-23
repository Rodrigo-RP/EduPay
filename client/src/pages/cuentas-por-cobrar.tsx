import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Clock, DollarSign, Users, Download, Eye, Search, Filter, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useInstitution } from "@/hooks/use-institution";

export default function CuentasPorCobrar() {
  const { toast } = useToast();
  const { logoUrl, institutionName } = useInstitution();
  
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
      descripcion: "Resumen ejecutivo para dirección"
    }
  ];

  const limpiarFiltros = () => {
    setFiltros({
      fechaInicio: "",
      fechaFin: "",
      estudiante: "",
      formato: "detallado"
    });
    toast({
      title: "Filtros limpiados",
      description: "Se han restablecido todos los filtros."
    });
  };

  const hayFiltrosActivos = filtros.fechaInicio || filtros.fechaFin || filtros.estudiante;

  const formatearMonto = (centavos: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(centavos / 100);
  };

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case "Vencido":
        return <Badge variant="destructive">{estado}</Badge>;
      case "Por vencer":
        return <Badge variant="default">{estado}</Badge>;
      case "Al corriente":
        return <Badge variant="outline" className="text-green-600 border-green-600">{estado}</Badge>;
      default:
        return <Badge variant="secondary">{estado}</Badge>;
    }
  };

  const generarReportePDF = (nombreReporte: string) => {
    const logoSrc = logoUrl || "";
    const institucion = institutionName || "Instituto José Francisco Ruiz";
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${nombreReporte} - ${institucion}</title>
        <style>
          @media print {
            .no-print { display: none !important; }
          }
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px; }
          .logo { max-height: 80px; margin-bottom: 10px; }
          .title { color: #2563eb; font-size: 24px; margin: 10px 0; }
          .subtitle { color: #666; font-size: 14px; }
          .content { margin: 30px 0; }
          .metrics { display: flex; justify-content: space-around; margin: 20px 0; }
          .metric { text-align: center; padding: 15px; border: 1px solid #ddd; border-radius: 8px; }
          .metric-value { font-size: 24px; font-weight: bold; color: #2563eb; }
          .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          .table th, .table td { border: 1px solid #ddd; padding: 12px; text-align: left; }
          .table th { background-color: #f8f9fa; font-weight: bold; }
          .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          ${logoSrc ? `<img src="${logoSrc}" alt="Logo" class="logo" />` : ''}
          <h1 class="title">${nombreReporte}</h1>
          <p class="subtitle">${institucion}</p>
          <p class="subtitle">Generado el ${new Date().toLocaleDateString('es-MX')}</p>
        </div>
        
        <div class="content">
          <div class="metrics">
            <div class="metric">
              <div class="metric-value">$42,000</div>
              <div>Total por Cobrar</div>
            </div>
            <div class="metric">
              <div class="metric-value">27</div>
              <div>Cuentas Activas</div>
            </div>
            <div class="metric">
              <div class="metric-value">73.2%</div>
              <div>Tasa Recuperación</div>
            </div>
            <div class="metric">
              <div class="metric-value">89.1%</div>
              <div>Eficiencia Gestión</div>
            </div>
          </div>

          <table class="table">
            <thead>
              <tr>
                <th>Estudiante</th>
                <th>Nivel</th>
                <th>Concepto</th>
                <th>Monto</th>
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
                  <td>${formatearMonto(cuenta.pendiente_pagar_centavos)}</td>
                  <td>${cuenta.estado_cobranza}</td>
                  <td>${cuenta.dias_vencido}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="footer">
          <p>Reporte generado por ${institucion} - Sistema de Gestión Financiera</p>
          <p>Fecha: ${new Date().toLocaleDateString('es-MX')} ${new Date().toLocaleTimeString('es-MX')}</p>
        </div>
      </body>
      </html>
    `;

    const ventana = window.open('', '_blank');
    if (ventana) {
      ventana.document.write(htmlContent);
      ventana.document.close();
      setTimeout(() => {
        ventana.print();
      }, 1000);
    }

    toast({
      title: "Reporte generado",
      description: `${nombreReporte} generado exitosamente.`
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cuentas por Cobrar</h1>
          <p className="text-muted-foreground">
            Gestión y seguimiento de cartera de clientes - {institutionName || "Instituto José Francisco Ruiz"}
          </p>
        </div>
      </div>

      {/* Métricas principales */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total por Cobrar</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$42,000</div>
            <p className="text-xs text-muted-foreground">+2.5% desde el mes pasado</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cuentas Activas</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">27</div>
            <p className="text-xs text-muted-foreground">Total de estudiantes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cuentas Vencidas</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">8</div>
            <p className="text-xs text-muted-foreground">Requieren seguimiento</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasa Recuperación</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">73.2%</div>
            <p className="text-xs text-muted-foreground">Eficiencia de cobranza</p>
          </CardContent>
        </Card>
      </div>

      {/* Barra de filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros de Búsqueda</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium">Fecha Inicio</label>
              <Input
                type="date"
                value={filtros.fechaInicio}
                onChange={(e) => setFiltros(prev => ({ ...prev, fechaInicio: e.target.value }))}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium">Fecha Fin</label>
              <Input
                type="date"
                value={filtros.fechaFin}
                onChange={(e) => setFiltros(prev => ({ ...prev, fechaFin: e.target.value }))}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium">Buscar Estudiante/Familia</label>
              <Input
                placeholder="Nombre del estudiante o familia..."
                value={filtros.estudiante}
                onChange={(e) => setFiltros(prev => ({ ...prev, estudiante: e.target.value }))}
              />
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="text-sm font-medium">Formato</label>
              <Select value={filtros.formato} onValueChange={(value) => setFiltros(prev => ({ ...prev, formato: value }))}>
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
            {hayFiltrosActivos && (
              <Button onClick={limpiarFiltros} variant="outline" size="sm">
                <X className="w-4 h-4 mr-1" />
                Limpiar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pestañas principales */}
      <Tabs defaultValue="cuentas" className="space-y-4">
        <TabsList>
          <TabsTrigger value="cuentas">Lista de Cuentas</TabsTrigger>
          <TabsTrigger value="seguimiento">Seguimiento</TabsTrigger>
          <TabsTrigger value="reportes">Reportes</TabsTrigger>
        </TabsList>

        <TabsContent value="cuentas" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Cuentas por Cobrar</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {cuentas.map((cuenta) => (
                  <div key={cuenta.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{cuenta.estudiante}</h3>
                        <Badge variant="outline">{cuenta.nivel_academico}</Badge>
                      </div>
                      <div className="text-sm text-slate-600">
                        <span>{cuenta.concepto} • Familia: {cuenta.familia}</span>
                        {cuenta.dias_vencido > 0 && (
                          <span className="text-red-600 ml-2">• {cuenta.dias_vencido} días vencido</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="font-semibold">{formatearMonto(cuenta.pendiente_pagar_centavos)}</div>
                        {getEstadoBadge(cuenta.estado_cobranza)}
                      </div>
                      <Button size="sm" variant="outline">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
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
                          onClick={() => toast({
                            title: "Vista previa",
                            description: `Mostrando vista previa de ${reporte.nombre}`
                          })}
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