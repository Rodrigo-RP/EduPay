import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Download, FileText, TrendingUp, PieChart, Calendar, DollarSign } from "lucide-react";

export default function Reportes() {
  const [selectedPeriod, setSelectedPeriod] = useState("2025-01");

  // Datos demo para reportes
  const reportesDisponibles = [
    {
      id: 1,
      nombre: "Reporte de Pagos Mensuales",
      tipo: "PAGOS",
      descripcion: "Detalle de todos los pagos recibidos en el período",
      fecha_generacion: "2025-01-20",
      formato: "Excel",
      tamaño: "2.5 MB"
    },
    {
      id: 2,
      nombre: "Reporte de Morosidad",
      tipo: "MOROSIDAD",
      descripcion: "Análisis de cargos vencidos y gestión de cobranza",
      fecha_generacion: "2025-01-20",
      formato: "PDF",
      tamaño: "1.8 MB"
    },
    {
      id: 3,
      nombre: "Conciliación Bancaria Enero",
      tipo: "CONCILIACION",
      descripcion: "Conciliación entre pagos recibidos y movimientos bancarios",
      fecha_generacion: "2025-01-19",
      formato: "Excel",
      tamaño: "856 KB"
    },
    {
      id: 4,
      nombre: "CFDI Emitidos - Enero 2025",
      tipo: "FISCAL",
      descripcion: "Listado de facturas CFDI emitidas para cumplimiento SAT",
      fecha_generacion: "2025-01-18",
      formato: "Excel",
      tamaño: "1.2 MB"
    }
  ];

  const kpisReporte = {
    totalFacturado: 2850000,
    totalCobrado: 2137500,
    tasaCobranza: 75,
    cargosVencidos: 6,
    estudiantesActivos: 4,
    promedioTiempoPago: 8.5
  };

  return (
    <div >
      <div >
        
        <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Reportes y Análisis</h1>
          <p className="text-slate-600">Genera reportes financieros, de cobranza y análisis de desempeño</p>
            </div>
            <Button className="bg-green-600 hover:bg-green-700">
              <FileText className="w-4 h-4 mr-2" />
              Generar Reporte
            </Button>
          </div>

          {/* KPIs del período */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="text-lg text-blue-800">Resumen Financiero</CardTitle>
              </CardHeader>
              <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                    <span className="text-sm">Total facturado:</span>
                    <span className="font-semibold">${(kpisReporte.totalFacturado / 100).toLocaleString()}</span>
                  </div>
              <div className="flex justify-between">
                    <span className="text-sm">Total cobrado:</span>
                    <span className="font-semibold text-green-600">${(kpisReporte.totalCobrado / 100).toLocaleString()}</span>
                  </div>
              <div className="flex justify-between">
                    <span className="text-sm">Tasa de cobranza:</span>
                    <span className="font-semibold">{kpisReporte.tasaCobranza}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-orange-200 bg-orange-50">
              <CardHeader>
                <CardTitle className="text-lg text-orange-800">Morosidad</CardTitle>
              </CardHeader>
              <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                    <span className="text-sm">Cargos vencidos:</span>
                    <span className="font-semibold text-red-600">{kpisReporte.cargosVencidos}</span>
                  </div>
              <div className="flex justify-between">
                    <span className="text-sm">Tasa de morosidad:</span>
                    <span className="font-semibold">{100 - kpisReporte.tasaCobranza}%</span>
                  </div>
              <div className="flex justify-between">
                    <span className="text-sm">Promedio días pago:</span>
                    <span className="font-semibold">{kpisReporte.promedioTiempoPago} días</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="text-lg text-green-800">Meta EscuelaPay</CardTitle>
              </CardHeader>
              <CardContent>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600 mb-1">80%</div>
              <div className="text-sm text-green-700 mb-2">Meta pagos antes vencimiento</div>
              <div className="text-xl font-bold text-blue-600">{kpisReporte.tasaCobranza}%</div>
              <div className="text-xs text-slate-500">Actual</div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="generados" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="generados">Reportes generados</TabsTrigger>
              <TabsTrigger value="financieros">Reportes financieros</TabsTrigger>
              <TabsTrigger value="operativos">Reportes operativos</TabsTrigger>
              <TabsTrigger value="personalizados">Personalizados</TabsTrigger>
            </TabsList>

            <TabsContent value="generados">
              <Card>
                <CardHeader>
                  <CardTitle>Reportes disponibles para descarga</CardTitle>
                </CardHeader>
                <CardContent>
              <div className="space-y-4">
                    {reportesDisponibles.map((reporte) => (
                  <div key={reporte.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <FileText className="w-6 h-6 text-blue-600" />
                          </div>
                      <div>
                            <h3 className="font-medium">{reporte.nombre}</h3>
                        <p className="text-sm text-slate-600">{reporte.descripcion}</p>
                        <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                              <span>Generado: {reporte.fecha_generacion}</span>
                              <span>Formato: {reporte.formato}</span>
                              <span>Tamaño: {reporte.tamaño}</span>
                            </div>
                          </div>
                        </div>
                    <Button size="sm" variant="outline">
                          <Download className="w-4 h-4 mr-2" />
                          Descargar
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="financieros">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="w-5 h-5" />
                      Reportes de Ingresos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                <div className="space-y-4">
                  <div>
                        <Label>Período</Label>
                        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="2025-01">Enero 2025</SelectItem>
                            <SelectItem value="2024-12">Diciembre 2024</SelectItem>
                            <SelectItem value="2024-11">Noviembre 2024</SelectItem>
                            <SelectItem value="2024-anual">Año 2024</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                  <div className="space-y-2">
                    <Button className="w-full" variant="outline">
                          <BarChart3 className="w-4 h-4 mr-2" />
                          Reporte de Ingresos por Concepto
                        </Button>
                    <Button className="w-full" variant="outline">
                          <TrendingUp className="w-4 h-4 mr-2" />
                          Análisis de Tendencias de Pago
                        </Button>
                    <Button className="w-full" variant="outline">
                          <PieChart className="w-4 h-4 mr-2" />
                          Distribución por Método de Pago
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Reportes Fiscales
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                <div className="space-y-4">
                  <div>
                        <Label>Tipo de reporte fiscal</Label>
                        <Select defaultValue="cfdi">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cfdi">CFDI Emitidos</SelectItem>
                            <SelectItem value="cancelados">CFDI Cancelados</SelectItem>
                            <SelectItem value="sat-mensual">Reporte Mensual SAT</SelectItem>
                            <SelectItem value="iva">Declaración IVA</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                  <div className="space-y-2">
                    <Button className="w-full bg-blue-600 hover:bg-blue-700">
                          Generar Reporte CFDI
                        </Button>
                    <Button className="w-full" variant="outline">
                          Exportar para Contador
                        </Button>
                    <Button className="w-full" variant="outline">
                          Reporte Cumplimiento SAT
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="operativos">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Reportes de Cobranza</CardTitle>
                  </CardHeader>
                  <CardContent>
                <div className="space-y-3">
                  <Button className="w-full" variant="outline">
                        Reporte de Morosidad Detallado
                      </Button>
                  <Button className="w-full" variant="outline">
                        Análisis de Cartera Vencida
                      </Button>
                  <Button className="w-full" variant="outline">
                        Eficacia de Recordatorios
                      </Button>
                  <Button className="w-full" variant="outline">
                        Proyección de Cobranza
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Reportes Académicos</CardTitle>
                  </CardHeader>
                  <CardContent>
                <div className="space-y-3">
                  <Button className="w-full" variant="outline">
                        Listado de Estudiantes por Status
                      </Button>
                  <Button className="w-full" variant="outline">
                        Reporte de Becas Otorgadas
                      </Button>
                  <Button className="w-full" variant="outline">
                        Análisis de Descuentos
                      </Button>
                  <Button className="w-full" variant="outline">
                        Estadísticas por Campus
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="personalizados">
              <Card>
                <CardHeader>
                  <CardTitle>Crear reporte personalizado</CardTitle>
                </CardHeader>
                <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                      <Label>Nombre del reporte</Label>
                      <Input placeholder="Mi reporte personalizado" />
                    </div>
                <div>
                      <Label>Formato de salida</Label>
                      <Select defaultValue="excel">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                          <SelectItem value="pdf">PDF</SelectItem>
                          <SelectItem value="csv">CSV</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                <div>
                      <Label>Rango de fechas</Label>
                  <div className="grid grid-cols-2 gap-2">
                        <Input type="date" />
                        <Input type="date" />
                      </div>
                    </div>
                <div>
                      <Label>Filtros</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar filtros..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="grado">Por grado</SelectItem>
                          <SelectItem value="status">Por status de pago</SelectItem>
                          <SelectItem value="metodo">Por método de pago</SelectItem>
                          <SelectItem value="concepto">Por concepto</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
              <div className="mt-6">
                    <Label>Campos a incluir</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                      <label className="flex items-center space-x-2">
                        <input type="checkbox" defaultChecked />
                        <span className="text-sm">Estudiante</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input type="checkbox" defaultChecked />
                        <span className="text-sm">Monto</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input type="checkbox" defaultChecked />
                        <span className="text-sm">Fecha pago</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input type="checkbox" />
                        <span className="text-sm">Método pago</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input type="checkbox" />
                        <span className="text-sm">CFDI</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input type="checkbox" />
                        <span className="text-sm">Responsable</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input type="checkbox" />
                        <span className="text-sm">Campus</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input type="checkbox" />
                        <span className="text-sm">Becas</span>
                      </label>
                    </div>
                  </div>
              <Button className="mt-6 bg-purple-600 hover:bg-purple-700">
                    Generar reporte personalizado
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}