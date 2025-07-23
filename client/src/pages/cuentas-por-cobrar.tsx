import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Clock, DollarSign, Users, Download, Eye, Search, Filter, X, FileText, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useInstitution } from "@/hooks/use-institution";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

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
  
  const [reporteSeleccionado, setReporteSeleccionado] = useState<any>(null);
  const [modalVistaPrevia, setModalVistaPrevia] = useState(false);

  // Datos de prueba específicos de la imagen
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

  // Reportes específicos de la imagen
  const reportesCobranza = [
    {
      nombre: "Antigüedad de Saldos",
      descripcion: "Análisis detallado por rangos de días vencidos",
      formato: "PDF",
      tamaño: "189 KB",
      fecha: "23/01/2025"
    },
    {
      nombre: "Cartera Vencida",
      descripcion: "Reporte de cuentas morosas y vencidas",
      formato: "Excel",
      tamaño: "156 KB",
      fecha: "23/01/2025"
    },
    {
      nombre: "Eficiencia de Cobranza",
      descripcion: "Métricas de gestión y recuperación",
      formato: "PDF",
      tamaño: "201 KB",
      fecha: "22/01/2025"
    },
    {
      nombre: "Seguimiento de Promesas",
      descripcion: "Control de fechas comprometidas de pago",
      formato: "Excel",
      tamaño: "143 KB",
      fecha: "23/01/2025"
    },
    {
      nombre: "Análisis de Morosidad",
      descripcion: "Tendencias y patrones de comportamiento",
      formato: "PDF",
      tamaño: "187 KB",
      fecha: "22/01/2025"
    },
    {
      nombre: "Reporte Ejecutivo Cobranza",
      descripcion: "Resumen gerencial de gestión",
      formato: "PDF",
      tamaño: "164 KB",
      fecha: "23/01/2025"
    }
  ];

  // Función para formatear moneda
  const formatCurrency = (centavos: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(centavos / 100);
  };

  // Métricas específicas de la imagen
  const metricas = {
    totalPorCobrar: 4200000, // $42,000
    tasaRecuperacion: 73.2,
    eficienciaGestion: 89.1,
    cuentasVencidas: 15,
    diasPromedio: 18.5,
    casosMorosos: 8
  };

  // Variables para filtros
  const hayFiltrosActivos = filtros.fechaInicio || filtros.fechaFin || filtros.estudiante;

  // Función para limpiar filtros
  const limpiarFiltros = () => {
    setFiltros({
      fechaInicio: "",
      fechaFin: "",
      estudiante: "",
      formato: "detallado"
    });
  };

  // Función para generar reportes
  const generarReporte = (tipo: 'TXT' | 'CSV' | 'PDF') => {
    toast({
      title: `Generando Reporte ${tipo}`,
      description: "Preparando archivo para descarga..."
    });
    
    setTimeout(() => {
      toast({
        title: "Reporte generado",
        description: `Archivo ${tipo} descargado correctamente`
      });
    }, 2000);
  };

  // Función para descargar reporte específico
  const descargarReporte = (reporte: any) => {
    const contenido = generarContenidoReporte(reporte);
    
    if (reporte.formato === 'Excel') {
      // Generar descarga CSV para compatibilidad
      let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // BOM para UTF-8
      
      if (contenido.tabla) {
        // Encabezados
        const headers = Object.keys(contenido.tabla[0]);
        csvContent += headers.join(',') + '\n';
        
        // Datos
        contenido.tabla.forEach((fila: any) => {
          const valores = headers.map(header => `"${fila[header]}"`);
          csvContent += valores.join(',') + '\n';
        });
      } else if (contenido.metricas) {
        csvContent += "Métrica,Valor\n";
        Object.entries(contenido.metricas).forEach(([key, value]) => {
          csvContent += `"${key}","${value}"\n`;
        });
      }
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `${reporte.nombre.replace(/\s+/g, '_')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } else if (reporte.formato === 'PDF') {
      // Generar descarga HTML para PDF
      const htmlContent = generarHTMLReporte(reporte, contenido);
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${reporte.nombre.replace(/\s+/g, '_')}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      // Abrir ventana de impresión para convertir a PDF
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        setTimeout(() => {
          printWindow.print();
        }, 500);
      }
    }
    
    toast({
      title: "Descarga completada",
      description: `${reporte.nombre} descargado como ${reporte.formato}`
    });
  };

  // Función para generar HTML del reporte
  const generarHTMLReporte = (reporte: any, contenido: any) => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${reporte.nombre} - ${institutionName}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          .logo { width: 60px; height: 60px; margin: 0 auto 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          .metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-top: 20px; }
          .metric-card { border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
          .metric-label { color: #666; font-size: 14px; }
          .metric-value { font-size: 24px; font-weight: bold; color: #333; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          ${logoUrl ? `<img src="${logoUrl}" alt="Logo" class="logo">` : `
            <div class="logo" style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">
              ISP
            </div>
          `}
          <h1>${institutionName}</h1>
          <h2>${reporte.nombre}</h2>
          <p>Generado el: ${new Date().toLocaleDateString('es-MX')} | Formato: ${reporte.formato} | Tamaño: ${reporte.tamaño}</p>
        </div>
        
        ${contenido.tabla ? `
          <table>
            <thead>
              <tr>
                ${Object.keys(contenido.tabla[0]).map((key: string) => `<th>${key.replace('_', ' ').toUpperCase()}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${contenido.tabla.map((fila: any) => `
                <tr>
                  ${Object.values(fila).map((valor: any) => `<td>${valor}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}
        
        ${contenido.metricas ? `
          <div class="metrics">
            ${Object.entries(contenido.metricas).map(([key, value]) => `
              <div class="metric-card">
                <div class="metric-label">${key}</div>
                <div class="metric-value">${value}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
        
        <div style="margin-top: 40px; text-align: center; border-top: 1px solid #ddd; padding-top: 20px; color: #666;">
          <p>Reporte generado por Edupay - Sistema de Gestión Escolar</p>
          <p>© ${new Date().getFullYear()} ${institutionName}</p>
        </div>
      </body>
      </html>
    `;
  };

  // Función para vista previa
  const vistaPrevia = (reporte: any) => {
    setReporteSeleccionado(reporte);
    setModalVistaPrevia(true);
    toast({
      title: "Vista previa",
      description: `Abriendo ${reporte.nombre}`
    });
  };

  // Función para generar contenido de vista previa del reporte
  const generarContenidoReporte = (reporte: any) => {
    const datosEjemplo: any = {
      "Antigüedad de Saldos": {
        tabla: [
          { concepto: "0-30 días", monto: "$15,600", cantidad: 8 },
          { concepto: "31-60 días", monto: "$12,400", cantidad: 5 },
          { concepto: "61-90 días", monto: "$8,500", cantidad: 3 },
          { concepto: "Más de 90 días", monto: "$5,500", cantidad: 2 }
        ]
      },
      "Cartera Vencida": {
        tabla: [
          { estudiante: "María González", monto: "$2,800", dias: 15 },
          { estudiante: "Juan Morales", monto: "$3,200", dias: 22 },
          { estudiante: "Ana Ramírez", monto: "$2,500", dias: 8 }
        ]
      },
      "Eficiencia de Cobranza": {
        metricas: {
          "Tasa de recuperación": "73.2%",
          "Tiempo promedio cobro": "18.5 días", 
          "Efectividad gestión": "89.1%"
        }
      },
      "Seguimiento de Promesas": {
        tabla: [
          { estudiante: "Carlos López", promesa: "$3,200", fecha_compromiso: "25/01/2025", cumplido: "Pendiente" },
          { estudiante: "Sandra Pérez", promesa: "$2,800", fecha_compromiso: "20/01/2025", cumplido: "Sí" },
          { estudiante: "Miguel Torres", promesa: "$2,500", fecha_compromiso: "28/01/2025", cumplido: "Pendiente" }
        ]
      },
      "Análisis de Morosidad": {
        metricas: {
          "Índice de morosidad": "26.8%",
          "Promedio días atraso": "32 días",
          "Tasa recuperación": "73.2%"
        }
      },
      "Reporte Ejecutivo Cobranza": {
        metricas: {
          "Total por cobrar": "$42,000",
          "Efectividad gestión": "89.1%",
          "Cuentas recuperadas": "15 de 18"
        }
      }
    };

    return datosEjemplo[reporte.nombre] || { 
      tabla: [
        { concepto: "Datos de ejemplo", valor: "Información del reporte", estado: "Disponible" }
      ]
    };
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Cuentas por Cobrar</h1>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-red-50 border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-700">Total por Cobrar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">$42,000</div>
            <p className="text-sm text-red-600 mt-1">15 cuentas vencidas</p>
          </CardContent>
        </Card>

        <Card className="bg-yellow-50 border-yellow-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-700">Tasa de Recuperación</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">73.2%</div>
            <p className="text-sm text-yellow-600 mt-1">18.5 días promedio</p>
          </CardContent>
        </Card>

        <Card className="bg-orange-50 border-orange-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-700">Eficiencia de Gestión</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">89.1%</div>
            <p className="text-sm text-orange-600 mt-1">8 casos morosos</p>
          </CardContent>
        </Card>
      </div>

      {/* Botones de generación de reportes */}
      <div className="flex gap-4">
        <Button 
          onClick={() => generarReporte('TXT')}
          className="bg-orange-600 hover:bg-orange-700 text-white"
        >
          <Download className="w-4 h-4 mr-2" />
          Generar Reporte TXT
        </Button>
        <Button 
          onClick={() => generarReporte('CSV')}
          variant="outline"
          className="border-orange-600 text-orange-600 hover:bg-orange-50"
        >
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Generar Excel (CSV)
        </Button>
        <Button 
          onClick={() => generarReporte('PDF')}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          <FileText className="w-4 h-4 mr-2" />
          Generar PDF
        </Button>
      </div>

      <Tabs defaultValue="reportes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="lista">Lista de cuentas</TabsTrigger>
          <TabsTrigger value="seguimiento">Seguimiento</TabsTrigger>
          <TabsTrigger value="reportes">Reportes</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-4">
          {/* Filtros avanzados */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Filtros de Búsqueda
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
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              alert(`Detalle de cuenta de ${cuenta.estudiante}: ${formatCurrency(cuenta.pendiente_pagar_centavos)} pendientes - Estado: ${cuenta.estado_cobranza}`);
                              toast({
                                title: "Detalle de cuenta",
                                description: `Viendo cuenta de ${cuenta.estudiante} - ${formatCurrency(cuenta.pendiente_pagar_centavos)}`
                              });
                            }}
                          >
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
              <CardTitle>Reportes de Cobranza Disponibles</CardTitle>
              <p className="text-sm text-slate-600">Descarga reportes especializados de gestión de cartera por cobrar</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {reportesCobranza.map((reporte, index) => (
                  <Card key={index} className="border-slate-200">
                    <CardContent className="p-4">
                      <h3 className="font-semibold mb-2 text-slate-900">{reporte.nombre}</h3>
                      <p className="text-sm text-slate-600 mb-3">{reporte.descripcion}</p>
                      
                      <div className="space-y-2 mb-4">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Formato:</span>
                          <span className="font-medium">{reporte.formato}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Tamaño:</span>
                          <span className="font-medium">{reporte.tamaño}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Fecha:</span>
                          <span className="font-medium">{reporte.fecha}</span>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          className="flex-1 bg-orange-600 hover:bg-orange-700"
                          onClick={() => descargarReporte(reporte)}
                        >
                          <Download className="w-4 h-4 mr-1" />
                          Descargar
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => vistaPrevia(reporte)}
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

      {/* Modal de Vista Previa */}
      <Dialog open={modalVistaPrevia} onOpenChange={setModalVistaPrevia}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vista Previa: {reporteSeleccionado?.nombre}</DialogTitle>
            <DialogDescription>
              Contenido detallado del reporte de cobranza para revisión antes de la descarga
            </DialogDescription>
          </DialogHeader>
          {reporteSeleccionado && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 rounded">
                <div>
                  <span className="text-sm font-medium">Formato:</span>
                  <p className="text-lg">{reporteSeleccionado.formato}</p>
                </div>
                <div>
                  <span className="text-sm font-medium">Tamaño:</span>
                  <p className="text-lg">{reporteSeleccionado.tamaño}</p>
                </div>
                <div>
                  <span className="text-sm font-medium">Fecha:</span>
                  <p className="text-lg">{reporteSeleccionado.fecha}</p>
                </div>
              </div>

              <div className="border rounded p-4">
                <h3 className="font-semibold mb-3">Contenido del Reporte</h3>
                {(() => {
                  const contenido = generarContenidoReporte(reporteSeleccionado);
                  
                  if (contenido.tabla) {
                    return (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse border">
                          <thead>
                            <tr className="bg-slate-100">
                              {Object.keys(contenido.tabla[0] || {}).map((key) => (
                                <th key={key} className="border p-2 text-left capitalize">
                                  {key.replace('_', ' ')}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {contenido.tabla.map((fila: any, index: number) => (
                              <tr key={index}>
                                {Object.values(fila).map((valor: any, i) => (
                                  <td key={i} className="border p-2">{valor}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  }
                  
                  if (contenido.metricas) {
                    return (
                      <div className="grid grid-cols-2 gap-4">
                        {Object.entries(contenido.metricas).map(([key, value]) => (
                          <div key={key} className="p-3 border rounded">
                            <div className="text-sm text-slate-600">{key}</div>
                            <div className="text-xl font-semibold">{value as string}</div>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  
                  return <p className="text-slate-600">Vista previa no disponible para este reporte.</p>;
                })()}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setModalVistaPrevia(false)}>
                  Cerrar
                </Button>
                <Button onClick={() => descargarReporte(reporteSeleccionado)}>
                  <Download className="w-4 h-4 mr-2" />
                  Descargar Reporte
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}