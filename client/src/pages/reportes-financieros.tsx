import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { createAuthenticatedRequest } from "@/lib/authUtils";
import { 
  FileText, 
  Download, 
  Calendar, 
  TrendingUp, 
  DollarSign, 
  Users, 
  PieChart, 
  BarChart3,
  FileSpreadsheet,
  FileImage,
  Printer,
  Filter,
  RefreshCw,
  Eye,
  Calculator,
  Target,
  AlertCircle,
  CheckCircle,
  Clock
} from "lucide-react";

export default function ReportesFinancieros() {
  const [selectedPeriod, setSelectedPeriod] = useState("mensual");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportType, setExportType] = useState<'excel' | 'pdf'>('excel');
  const { toast } = useToast();

  // Calcula fecha_desde / fecha_hasta según período y mes/año seleccionados
  const getDateRange = () => {
    const pad = (n: number) => String(n).padStart(2, '0');
    switch (selectedPeriod) {
      case 'trimestral': {
        const qs = Math.floor((selectedMonth - 1) / 3) * 3 + 1;
        const qe = qs + 2;
        return {
          fecha_desde: `${selectedYear}-${pad(qs)}-01`,
          fecha_hasta: `${selectedYear}-${pad(qe)}-${new Date(selectedYear, qe, 0).getDate()}`,
        };
      }
      case 'semestral': {
        const ss = selectedMonth <= 6 ? 1 : 7;
        const se = selectedMonth <= 6 ? 6 : 12;
        return {
          fecha_desde: `${selectedYear}-${pad(ss)}-01`,
          fecha_hasta: `${selectedYear}-${pad(se)}-${new Date(selectedYear, se, 0).getDate()}`,
        };
      }
      case 'anual':
        return { fecha_desde: `${selectedYear}-01-01`, fecha_hasta: `${selectedYear}-12-31` };
      default: { // mensual
        const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
        return {
          fecha_desde: `${selectedYear}-${pad(selectedMonth)}-01`,
          fecha_hasta:  `${selectedYear}-${pad(selectedMonth)}-${lastDay}`,
        };
      }
    }
  };

  // Cargar datos del reporte
  const loadReportData = async () => {
    setLoading(true);
    try {
      const { fecha_desde, fecha_hasta } = getDateRange();
      const response = await createAuthenticatedRequest(
        `/api/reportes/financiero?fecha_desde=${fecha_desde}&fecha_hasta=${fecha_hasta}`
      );
      const data = await response.json();
      setReportData(data);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "No se pudieron cargar los datos del reporte",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReportData();
  }, [selectedPeriod, selectedMonth, selectedYear]);

  // Exportar reporte
  const exportReport = async (type: 'excel' | 'pdf') => {
    setExportType(type);
    setShowExportModal(true);
    setExportProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setExportProgress(prev => {
          if (prev >= 90) { clearInterval(progressInterval); return 90; }
          return prev + 10;
        });
      }, 200);

      const { fecha_desde, fecha_hasta } = getDateRange();
      const response = await createAuthenticatedRequest(`/api/reportes/financiero/exportar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formato: type, fecha_desde, fecha_hasta }),
      });

      if (response.ok) {
        clearInterval(progressInterval);
        setExportProgress(100);

        // Excel y PDF se descargan como blob binario (el nuevo API devuelve binario real)
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte_financiero_${fecha_desde}_${fecha_hasta}.${type === 'excel' ? 'xlsx' : 'pdf'}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        toast({
          title: "Reporte exportado",
          description: `El reporte ${type === 'excel' ? 'Excel' : 'PDF'} ha sido descargado exitosamente`,
        });

        setTimeout(() => { setShowExportModal(false); setExportProgress(0); }, 1000);
      }
    } catch (error: any) {
      toast({
        title: "Error de exportación",
        description: "No se pudo exportar el reporte",
        variant: "destructive",
      });
      setShowExportModal(false);
      setExportProgress(0);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount / 100);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getMonthName = (month: number) => {
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    return months[month - 1];
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
              <p className="text-gray-600">Cargando datos del reporte...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Reportes Financieros</h1>
              <p className="text-gray-600">Análisis completo de ingresos, pagos y estados financieros</p>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => exportReport('excel')}
                className="bg-green-600 hover:bg-green-700"
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Exportar Excel
              </Button>
              <Button
                onClick={() => exportReport('pdf')}
                className="bg-red-600 hover:bg-red-700"
              >
                <FileImage className="w-4 h-4 mr-2" />
                Exportar PDF
              </Button>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filtros de Reporte
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="period">Período</Label>
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensual">Mensual</SelectItem>
                    <SelectItem value="trimestral">Trimestral</SelectItem>
                    <SelectItem value="semestral">Semestral</SelectItem>
                    <SelectItem value="anual">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="month">Mes</Label>
                <Select value={selectedMonth.toString()} onValueChange={(value) => setSelectedMonth(parseInt(value))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => (
                      <SelectItem key={i + 1} value={(i + 1).toString()}>
                        {getMonthName(i + 1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="year">Año</Label>
                <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(parseInt(value))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 5 }, (_, i) => {
                      const year = new Date().getFullYear() - 2 + i;
                      return (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={loadReportData} className="w-full">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Actualizar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contenido de Reportes */}
        <Tabs defaultValue="resumen" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="resumen">Resumen</TabsTrigger>
            <TabsTrigger value="ingresos">Ingresos</TabsTrigger>
            <TabsTrigger value="pagos">Pagos</TabsTrigger>
            <TabsTrigger value="morosidad">Morosidad</TabsTrigger>
            <TabsTrigger value="conciliacion">Conciliación</TabsTrigger>
            <TabsTrigger value="analisis">Análisis</TabsTrigger>
          </TabsList>

          {/* Resumen Ejecutivo */}
          <TabsContent value="resumen" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
                  <DollarSign className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {reportData?.summary?.total_income ? formatCurrency(reportData.summary.total_income) : '$0.00'}
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    {reportData?.summary?.income_growth != null
                      ? `${reportData.summary.income_growth >= 0 ? '+' : ''}${reportData.summary.income_growth}%`
                      : 'N/D'} vs mes anterior
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pagos Procesados</CardTitle>
                  <CheckCircle className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">
                    {reportData?.summary?.payments_count || 0}
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    {reportData?.summary?.payment_growth != null
                      ? `${reportData.summary.payment_growth >= 0 ? '+' : ''}${reportData.summary.payment_growth}%`
                      : 'N/D'} vs mes anterior
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Cuentas por Cobrar</CardTitle>
                  <Clock className="h-4 w-4 text-orange-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">
                    {reportData?.summary?.cuentas_por_cobrar ? formatCurrency(reportData.summary.cuentas_por_cobrar) : '$0.00'}
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    {reportData?.summary?.num_cuentas || 0} cuentas pendientes
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Monto Vencido</CardTitle>
                  <AlertCircle className="h-4 w-4 text-red-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">
                    {reportData?.summary?.monto_vencido ? formatCurrency(reportData.summary.monto_vencido) : '$0.00'}
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    {reportData?.summary?.num_vencidos || 0} cargos vencidos
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Gráficos de Resumen */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Ingresos por Concepto</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {reportData?.income_by_concept?.map((item: any, index: number) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${
                            index === 0 ? 'bg-blue-500' : 
                            index === 1 ? 'bg-green-500' : 
                            index === 2 ? 'bg-yellow-500' : 'bg-gray-500'
                          }`}></div>
                          <span className="text-sm font-medium">{item.concepto}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold">{formatCurrency(item.monto_centavos)}</div>
                          <div className="text-xs text-gray-500">{item.porcentaje}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Métodos de Pago</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {reportData?.payment_methods?.map((item: any, index: number) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${
                            item.metodo === 'tarjeta' ? 'bg-purple-500' : 
                            item.metodo === 'spei' ? 'bg-green-500' : 
                            item.metodo === 'efectivo' ? 'bg-blue-500' : 'bg-gray-500'
                          }`}></div>
                          <span className="text-sm font-medium capitalize">{item.metodo}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold">{formatCurrency(item.monto_centavos)}</div>
                          <div className="text-xs text-gray-500">{item.num_pagos} pagos</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="ingresos" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Tendencia de Ingresos por Mes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-300">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border border-gray-300 p-2 text-left">Mes</th>
                        <th className="border border-gray-300 p-2 text-right">Pagos</th>
                        <th className="border border-gray-300 p-2 text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData?.monthly_trend?.length > 0 ? (
                        reportData.monthly_trend.map((row: any, index: number) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="border border-gray-300 p-2">{row.mes}</td>
                            <td className="border border-gray-300 p-2 text-right">{row.num_pagos}</td>
                            <td className="border border-gray-300 p-2 text-right font-medium">
                              {formatCurrency(row.monto_centavos)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="border border-gray-300 p-2 text-center text-gray-500">
                            Sin datos para el período seleccionado
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Más tabs se pueden agregar aquí */}
          <TabsContent value="pagos" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Análisis de Pagos</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 mb-4">
                  Resumen detallado de todos los pagos procesados en el período seleccionado.
                </p>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <h4 className="font-medium text-blue-900">Pagos Exitosos</h4>
                      <p className="text-2xl font-bold text-blue-600">
                        {reportData?.summary?.payments_count || 0}
                      </p>
                    </div>
                    <div className="bg-red-50 p-4 rounded-lg">
                      <h4 className="font-medium text-red-900">Cargos Vencidos</h4>
                      <p className="text-2xl font-bold text-red-600">
                        {reportData?.summary?.num_vencidos || 0}
                      </p>
                    </div>
                    <div className="bg-yellow-50 p-4 rounded-lg">
                      <h4 className="font-medium text-yellow-900">Cargos Pendientes</h4>
                      <p className="text-2xl font-bold text-yellow-600">
                        {reportData?.summary?.num_cuentas || 0}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="morosidad" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Análisis de Morosidad</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 mb-4">
                  Reporte completo de cuentas vencidas y análisis de riesgo de cobranza.
                </p>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-red-50 p-4 rounded-lg">
                      <h4 className="font-medium text-red-900">Monto Vencido Total</h4>
                      <p className="text-2xl font-bold text-red-600">
                        {reportData?.summary?.monto_vencido ? formatCurrency(reportData.summary.monto_vencido) : '$0.00'}
                      </p>
                    </div>
                    <div className="bg-orange-50 p-4 rounded-lg">
                      <h4 className="font-medium text-orange-900">Cuentas Vencidas</h4>
                      <p className="text-2xl font-bold text-orange-600">
                        {reportData?.summary?.num_vencidos || 0}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="conciliacion" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Conciliación Bancaria</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 mb-4">
                  Estado de conciliación entre los pagos registrados y movimientos bancarios.
                </p>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-green-50 p-4 rounded-lg">
                      <h4 className="font-medium text-green-900">Movimientos Conciliados</h4>
                      <p className="text-2xl font-bold text-green-600">
                        {reportData?.reconciliation?.conciliated || 0}
                      </p>
                    </div>
                    <div className="bg-yellow-50 p-4 rounded-lg">
                      <h4 className="font-medium text-yellow-900">Pendientes de Conciliar</h4>
                      <p className="text-2xl font-bold text-yellow-600">
                        {reportData?.reconciliation?.pending || 0}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analisis" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Análisis Financiero Avanzado</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 mb-4">
                  Análisis predictivo y recomendaciones para mejorar la gestión financiera.
                </p>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <h4 className="font-medium text-blue-900">Proyección Mensual</h4>
                      <p className="text-2xl font-bold text-blue-600">
                        {reportData?.summary?.total_income ? formatCurrency(reportData.summary.total_income) : '$0.00'}
                      </p>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <h4 className="font-medium text-purple-900">Tasa de Cobranza</h4>
                      <p className="text-2xl font-bold text-purple-600">
                        {reportData?.summary?.collection_rate || 0}%
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modal de Exportación */}
        <Dialog open={showExportModal} onOpenChange={setShowExportModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Exportando Reporte</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {exportType === 'excel' ? (
                  <FileSpreadsheet className="w-8 h-8 text-green-600" />
                ) : (
                  <FileImage className="w-8 h-8 text-red-600" />
                )}
                <div>
                  <p className="font-medium">
                    Exportando a {exportType === 'excel' ? 'Excel' : 'PDF'}
                  </p>
                  <p className="text-sm text-gray-600">
                    {getMonthName(selectedMonth)} {selectedYear}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progreso</span>
                  <span>{exportProgress}%</span>
                </div>
                <Progress value={exportProgress} className="w-full" />
              </div>
              {exportProgress === 100 && (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-sm">Exportación completada</span>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}