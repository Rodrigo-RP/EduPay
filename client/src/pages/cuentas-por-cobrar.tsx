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
    toast({
      title: "Descargando reporte",
      description: `${reporte.nombre} (${reporte.formato} - ${reporte.tamaño})`
    });
  };

  // Función para vista previa
  const vistaPrevia = (reporte: any) => {
    alert(`Vista previa del reporte: ${reporte.nombre} (${reporte.formato} - ${reporte.tamaño})`);
    toast({
      title: "Vista previa",
      description: `Mostrando ${reporte.nombre}`
    });
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
    </div>
  );
}