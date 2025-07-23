import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Clock, DollarSign, Users, Download, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useInstitution } from "@/hooks/use-institution";

// Tipos de datos
interface CuentaPorCobrar {
  id: number;
  estudiante: string;
  nivel_academico: string;
  concepto: string;
  monto_original_centavos: number;
  pendiente_pagar_centavos: number;
  total_pagado_centavos: number;
  estado_cobranza: string;
  fecha_vencimiento: string;
  dias_vencido: number;
  telefono_contacto?: string;
  email_contacto?: string;
}

export default function CuentasPorCobrar() {
  // Estados para filtros
  const [selectedEstado, setSelectedEstado] = useState("all");
  const [filtroNombre, setFiltroNombre] = useState("");

  const { toast } = useToast();
  const { logoUrl, institutionName } = useInstitution();

  // Datos de prueba
  const cuentasPorCobrarData = [
    {
      id: 1,
      estudiante: "María González",
      nivel_academico: "Primaria",
      concepto: "Colegiatura Enero",
      monto_original_centavos: 280000,
      pendiente_pagar_centavos: 280000,
      total_pagado_centavos: 0,
      estado_cobranza: "VENCIDO",
      fecha_vencimiento: "2025-01-15",
      dias_vencido: 8,
      telefono_contacto: "5551234567",
      email_contacto: "maria.gonzalez@email.com"
    },
    {
      id: 2,
      estudiante: "Carlos Rodríguez",
      nivel_academico: "Secundaria",
      concepto: "Inscripción 2025",
      monto_original_centavos: 320000,
      pendiente_pagar_centavos: 160000,
      total_pagado_centavos: 160000,
      estado_cobranza: "PARCIAL",
      fecha_vencimiento: "2025-01-10",
      dias_vencido: 13,
      telefono_contacto: "5559876543",
      email_contacto: "carlos.rodriguez@email.com"
    }
  ];

  // Función para filtrar las cuentas
  const filtrarCuentas = (cuentas: CuentaPorCobrar[]) => {
    return cuentas.filter((cuenta) => {
      const matchEstado = selectedEstado === "all" || cuenta.estado_cobranza === selectedEstado;
      const matchNombre = !filtroNombre || cuenta.estudiante.toLowerCase().includes(filtroNombre.toLowerCase());
      
      return matchEstado && matchNombre;
    });
  };

  // Aplicar filtros
  const cuentasFiltradas = filtrarCuentas(cuentasPorCobrarData);

  // Calcular métricas
  const totalPorCobrar = cuentasFiltradas.reduce((sum, c) => sum + c.pendiente_pagar_centavos, 0);
  const totalVencido = cuentasFiltradas.filter(c => c.estado_cobranza === "VENCIDO" || c.estado_cobranza === "MOROSO").reduce((sum, c) => sum + c.pendiente_pagar_centavos, 0);

  // Función para formatear moneda
  const formatCurrency = (centavos: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(centavos / 100);
  };

  // Función para obtener color de badge por estado
  const getEstadoBadgeColor = (estado: string) => {
    switch (estado) {
      case "CORRIENTE": return "bg-green-100 text-green-800";
      case "VENCIDO": return "bg-yellow-100 text-yellow-800";
      case "MOROSO": return "bg-red-100 text-red-800";
      case "PAGADO": return "bg-blue-100 text-blue-800";
      case "PARCIAL": return "bg-purple-100 text-purple-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Cuentas por Cobrar</h1>
          <p className="text-slate-600">Gestión y seguimiento de cartera de cuentas por cobrar</p>
        </div>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
                <p className="text-sm font-medium text-slate-600">Vencido</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(totalVencido)}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Cuentas</p>
                <p className="text-2xl font-bold text-slate-900">{cuentasFiltradas.length}</p>
              </div>
              <Users className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Promedio Días</p>
                <p className="text-2xl font-bold text-slate-900">
                  {Math.round(cuentasFiltradas.reduce((sum, c) => sum + c.dias_vencido, 0) / cuentasFiltradas.length || 0)}
                </p>
              </div>
              <Clock className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="lista" className="space-y-6">
        <TabsList>
          <TabsTrigger value="lista">Lista de Cuentas</TabsTrigger>
          <TabsTrigger value="seguimiento">Seguimiento</TabsTrigger>
          <TabsTrigger value="reportes">Reportes</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-6">
          {/* Lista de cuentas */}
          <Card>
            <CardHeader>
              <CardTitle>Lista de Cuentas ({cuentasFiltradas.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {cuentasFiltradas.map((cuenta) => (
                  <div key={cuenta.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <h3 className="font-semibold text-slate-900">{cuenta.estudiante}</h3>
                        <p className="text-sm text-slate-600">{cuenta.nivel_academico} - {cuenta.concepto}</p>
                      </div>
                      <Badge className={getEstadoBadgeColor(cuenta.estado_cobranza)}>
                        {cuenta.estado_cobranza}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-slate-600">Monto Original</p>
                        <p className="font-semibold">{formatCurrency(cuenta.monto_original_centavos)}</p>
                      </div>
                      <div>
                        <p className="text-slate-600">Pendiente</p>
                        <p className="font-semibold text-red-600">{formatCurrency(cuenta.pendiente_pagar_centavos)}</p>
                      </div>
                      <div>
                        <p className="text-slate-600">Vencimiento</p>
                        <p className="font-semibold">{cuenta.fecha_vencimiento}</p>
                      </div>
                      <div>
                        <p className="text-slate-600">Días Vencido</p>
                        <p className="font-semibold">{cuenta.dias_vencido}</p>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t">
                      <div className="text-sm text-slate-600">
                        {cuenta.email_contacto && (
                          <span>{cuenta.email_contacto}</span>
                        )}
                        {cuenta.telefono_contacto && (
                          <span className="ml-2">{cuenta.telefono_contacto}</span>
                        )}
                      </div>
                      <div className="flex gap-2">
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

        <TabsContent value="seguimiento">
          <Card>
            <CardHeader>
              <CardTitle>Seguimiento de Cobranza</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600">Herramientas de seguimiento y gestión de cobranza en desarrollo.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reportes">
          <Card>
            <CardHeader>
              <CardTitle>Reportes de Cuentas por Cobrar</CardTitle>
              <CardDescription>Generación de reportes profesionales con logo institucional</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Filtros de reportes */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-lg">
                <div>
                  <Label htmlFor="fecha-inicio">Fecha Inicio</Label>
                  <Input type="date" id="fecha-inicio" />
                </div>
                <div>
                  <Label htmlFor="fecha-fin">Fecha Fin</Label>
                  <Input type="date" id="fecha-fin" />
                </div>
                <div>
                  <Label htmlFor="filtro-estudiante">Buscar Estudiante</Label>
                  <Input placeholder="Nombre del estudiante..." id="filtro-estudiante" />
                </div>
                <div>
                  <Label htmlFor="formato">Formato</Label>
                  <Select defaultValue="detallado">
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

              {/* Lista de reportes disponibles */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  {
                    id: 1,
                    nombre: "Antigüedad de Saldos",
                    descripcion: "Análisis detallado por rangos de días vencidos",
                    formato: "PDF",
                    tamaño: "189 KB",
                    fecha: "23/01/2025"
                  },
                  {
                    id: 2,
                    nombre: "Cartera Vencida",
                    descripcion: "Reporte de cuentas morosas y vencidas",
                    formato: "Excel",
                    tamaño: "156 KB", 
                    fecha: "23/01/2025"
                  },
                  {
                    id: 3,
                    nombre: "Eficiencia de Cobranza",
                    descripcion: "Métricas de gestión y recuperación",
                    formato: "PDF",
                    tamaño: "201 KB",
                    fecha: "22/01/2025"
                  },
                  {
                    id: 4,
                    nombre: "Seguimiento de Promesas",
                    descripcion: "Control de fechas compromiso de pago",
                    formato: "Excel",
                    tamaño: "134 KB",
                    fecha: "22/01/2025"
                  },
                  {
                    id: 5,
                    nombre: "Análisis de Morosidad",
                    descripcion: "Tendencias y patrones de comportamiento",
                    formato: "PDF",
                    tamaño: "245 KB",
                    fecha: "21/01/2025"
                  },
                  {
                    id: 6,
                    nombre: "Reporte Ejecutivo",
                    descripcion: "Resumen general para dirección",
                    formato: "PDF",
                    tamaño: "178 KB",
                    fecha: "21/01/2025"
                  }
                ].map((reporte) => (
                  <Card key={reporte.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div className="flex justify-between items-start">
                          <h3 className="font-semibold text-slate-900">{reporte.nombre}</h3>
                          <Badge variant="outline">{reporte.formato}</Badge>
                        </div>
                        <p className="text-sm text-slate-600">{reporte.descripcion}</p>
                        <div className="flex justify-between items-center text-xs text-slate-500">
                          <span>{reporte.tamaño}</span>
                          <span>{reporte.fecha}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            className="flex-1"
                            onClick={() => {
                              const reporteHTML = `
                                <!DOCTYPE html>
                                <html>
                                <head>
                                  <meta charset="UTF-8">
                                  <title>Reporte - ${reporte.nombre}</title>
                                  <style>
                                    body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
                                    .header { display: flex; align-items: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px; }
                                    .logo { width: 80px; height: 80px; margin-right: 20px; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 24px; }
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
                                    ${logoUrl ? `<img src="${logoUrl}" alt="Logo" class="logo" />` : `<div class="logo">JFR</div>`}
                                    <div class="institution-info">
                                      <h1>${institutionName || 'Instituto JFR'}</h1>
                                      <p>RFC: IJF180615AB3</p>
                                      <p>Reporte generado: ${new Date().toLocaleDateString('es-MX')}</p>
                                    </div>
                                  </div>
                                  <h2 class="report-title">${reporte.nombre}</h2>
                                  <div class="metrics">
                                    <div class="metric-card">
                                      <div class="metric-value">${formatCurrency(totalPorCobrar)}</div>
                                      <div class="metric-label">Total por Cobrar</div>
                                    </div>
                                    <div class="metric-card">
                                      <div class="metric-value">${formatCurrency(totalVencido)}</div>
                                      <div class="metric-label">Total Vencido</div>
                                    </div>
                                    <div class="metric-card">
                                      <div class="metric-value">${cuentasFiltradas.length}</div>
                                      <div class="metric-label">Total Cuentas</div>
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
                                      ${cuentasFiltradas.map(cuenta => `
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
                                description: `${reporte.nombre} listo para descarga`
                              });
                            }}
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