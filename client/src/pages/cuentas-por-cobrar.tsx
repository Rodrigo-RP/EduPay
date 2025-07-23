import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Clock, DollarSign, Users, Download, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useInstitution } from "@/hooks/use-institution";

export default function CuentasPorCobrar() {
  const { toast } = useToast();
  const { logoUrl, institutionName } = useInstitution();

  // Datos de prueba simples
  const cuentas = [
    {
      id: 1,
      estudiante: "María González",
      nivel_academico: "Primaria",
      concepto: "Colegiatura Enero",
      pendiente_pagar_centavos: 280000,
      estado_cobranza: "VENCIDO",
      dias_vencido: 8
    },
    {
      id: 2,
      estudiante: "Carlos Rodríguez", 
      nivel_academico: "Secundaria",
      concepto: "Inscripción 2025",
      pendiente_pagar_centavos: 160000,
      estado_cobranza: "PARCIAL",
      dias_vencido: 13
    }
  ];

  // Función para formatear moneda
  const formatCurrency = (centavos: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(centavos / 100);
  };

  const totalPorCobrar = cuentas.reduce((sum, c) => sum + c.pendiente_pagar_centavos, 0);

  // Función para generar reporte PDF
  const generarReportePDF = (nombreReporte: string) => {
    const reporteHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Reporte - ${nombreReporte}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
          .header { display: flex; align-items: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px; }
          .logo { width: 80px; height: 80px; margin-right: 20px; }
          .logo-fallback { 
            width: 80px; height: 80px; margin-right: 20px; 
            background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); 
            border-radius: 50%; display: flex; align-items: center; justify-content: center; 
            color: white; font-weight: bold; font-size: 24px; 
          }
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
          ${logoUrl ? `<img src="${logoUrl}" alt="Logo" class="logo" />` : `<div class="logo-fallback">JFR</div>`}
          <div class="institution-info">
            <h1>${institutionName || 'Instituto JFR'}</h1>
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
            <div class="metric-value">1</div>
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

    toast({
      title: "Reporte generado",
      description: `${nombreReporte} listo para descarga`
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Cuentas por Cobrar</h1>
        <p className="text-slate-600">Gestión y seguimiento de cartera</p>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Total por Cobrar</p>
                <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalPorCobrar)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Cuentas</p>
                <p className="text-2xl font-bold text-slate-900">{cuentas.length}</p>
              </div>
              <Users className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Vencidas</p>
                <p className="text-2xl font-bold text-red-600">1</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Promedio Días</p>
                <p className="text-2xl font-bold text-slate-900">11</p>
              </div>
              <Clock className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="lista" className="space-y-6">
        <TabsList>
          <TabsTrigger value="lista">Lista de Cuentas</TabsTrigger>
          <TabsTrigger value="reportes">Reportes</TabsTrigger>
        </TabsList>

        <TabsContent value="lista">
          <Card>
            <CardHeader>
              <CardTitle>Lista de Cuentas ({cuentas.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {cuentas.map((cuenta) => (
                  <div key={cuenta.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-semibold">{cuenta.estudiante}</h3>
                        <p className="text-sm text-slate-600">{cuenta.nivel_academico} - {cuenta.concepto}</p>
                      </div>
                      <Badge variant={cuenta.estado_cobranza === "VENCIDO" ? "destructive" : "secondary"}>
                        {cuenta.estado_cobranza}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-slate-600">Pendiente</p>
                        <p className="font-semibold text-red-600">{formatCurrency(cuenta.pendiente_pagar_centavos)}</p>
                      </div>
                      <div>
                        <p className="text-slate-600">Días Vencido</p>
                        <p className="font-semibold">{cuenta.dias_vencido}</p>
                      </div>
                      <div className="flex justify-end">
                        <Button size="sm" variant="outline">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reportes">
          <Card>
            <CardHeader>
              <CardTitle>Reportes de Cuentas por Cobrar</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { nombre: "Antigüedad de Saldos", descripcion: "Análisis por días vencidos" },
                  { nombre: "Cartera Vencida", descripcion: "Cuentas morosas y vencidas" },
                  { nombre: "Eficiencia de Cobranza", descripcion: "Métricas de gestión" },
                  { nombre: "Seguimiento de Promesas", descripcion: "Control de fechas compromiso" },
                  { nombre: "Análisis de Morosidad", descripcion: "Tendencias y patrones" },
                  { nombre: "Reporte Ejecutivo", descripcion: "Resumen para dirección" }
                ].map((reporte, index) => (
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
                          onClick={() => {
                            toast({
                              title: "Vista previa",
                              description: `Mostrando vista previa de ${reporte.nombre}`
                            });
                          }}
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