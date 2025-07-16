import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRoleBasedData } from "@/hooks/useRoleBasedData";
import { 
  DollarSign, 
  CreditCard, 
  AlertTriangle, 
  TrendingUp,
  Calendar,
  Receipt,
  Banknote,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw
} from 'lucide-react';

export default function DashboardCaja() {
  const { 
    filterPaymentData, 
    filterChargesData, 
    canViewMetric,
    getDashboardTitle,
    getDashboardDescription 
  } = useRoleBasedData();

  // Obtener datos de pagos (filtrados por rol)
  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ['/api/payments'],
    select: (data) => filterPaymentData(data)
  });

  // Obtener datos de cargos (filtrados por rol)
  const { data: charges = [], isLoading: chargesLoading } = useQuery({
    queryKey: ['/api/charges'],
    select: (data) => filterChargesData(data)
  });

  // Obtener datos de cuentas por cobrar
  const { data: receivables = [], isLoading: receivablesLoading } = useQuery({
    queryKey: ['/api/receivables']
  });

  // Calcular métricas específicas para Caja
  const cashMetrics = {
    totalPaymentsToday: payments.filter(p => {
      const paymentDate = new Date(p.created_at);
      const today = new Date();
      return paymentDate.toDateString() === today.toDateString();
    }).length,
    
    dailyRevenue: payments.filter(p => {
      const paymentDate = new Date(p.created_at);
      const today = new Date();
      return paymentDate.toDateString() === today.toDateString();
    }).reduce((sum, p) => sum + p.amount, 0),
    
    totalRevenue: payments.reduce((sum, p) => sum + p.amount, 0),
    
    pendingPayments: charges.filter(c => c.status === 'pending').length,
    
    overduePayments: charges.filter(c => {
      const dueDate = new Date(c.due_date);
      const now = new Date();
      return c.status === 'pending' && dueDate < now;
    }).length,
    
    overdueAmount: charges.filter(c => {
      const dueDate = new Date(c.due_date);
      const now = new Date();
      return c.status === 'pending' && dueDate < now;
    }).reduce((sum, c) => sum + c.amount, 0),
    
    paymentRate: charges.length > 0 ? (payments.length / charges.length * 100).toFixed(1) : 0,
    
    cashPayments: payments.filter(p => p.method === 'efectivo').length,
    cardPayments: payments.filter(p => p.method === 'tarjeta').length,
    transferPayments: payments.filter(p => p.method === 'transferencia').length,
    
    averagePaymentAmount: payments.length > 0 ? payments.reduce((sum, p) => sum + p.amount, 0) / payments.length : 0
  };

  // Agrupar pagos por método
  const paymentsByMethod = {
    efectivo: payments.filter(p => p.method === 'efectivo'),
    tarjeta: payments.filter(p => p.method === 'tarjeta'),
    transferencia: payments.filter(p => p.method === 'transferencia'),
    cheque: payments.filter(p => p.method === 'cheque')
  };

  // Pagos por concepto (solo conceptos relacionados con caja)
  const allowedConcepts = ['colegiatura', 'mensualidad', 'recargo', 'multa', 'seguro', 'transporte'];
  const paymentsByConcept = allowedConcepts.reduce((acc, concept) => {
    acc[concept] = payments.filter(p => 
      p.concept?.name?.toLowerCase().includes(concept.toLowerCase())
    );
    return acc;
  }, {} as Record<string, any[]>);

  // Cuentas por cobrar vencidas
  const overdueReceivables = receivables.filter(r => {
    const dueDate = new Date(r.due_date);
    const now = new Date();
    return r.status === 'pending' && dueDate < now;
  });

  if (paymentsLoading || chargesLoading || receivablesLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-lg font-medium">Cargando dashboard de caja...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header personalizado para Caja */}
      <div className="border-b pb-4">
        <h1 className="text-3xl font-bold text-gray-900">{getDashboardTitle()}</h1>
        <p className="text-gray-600 mt-1">{getDashboardDescription()}</p>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant="secondary" className="bg-green-100 text-green-800">
            <DollarSign className="w-3 h-3 mr-1" />
            Caja
          </Badge>
          <Badge variant="outline">
            <Calendar className="w-3 h-3 mr-1" />
            {new Date().toLocaleDateString('es-ES', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </Badge>
        </div>
      </div>

      {/* Métricas principales para Caja */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Pagos Hoy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold text-blue-600">{cashMetrics.totalPaymentsToday}</div>
              <Receipt className="w-8 h-8 text-blue-600" />
            </div>
            <p className="text-sm text-gray-500 mt-1">Transacciones procesadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Ingresos Hoy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold text-green-600">
                ${cashMetrics.dailyRevenue.toLocaleString()}
              </div>
              <DollarSign className="w-8 h-8 text-green-600" />
            </div>
            <p className="text-sm text-gray-500 mt-1">Recaudación diaria</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Pagos Pendientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold text-yellow-600">{cashMetrics.pendingPayments}</div>
              <Clock className="w-8 h-8 text-yellow-600" />
            </div>
            <p className="text-sm text-gray-500 mt-1">Por procesar</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Pagos Vencidos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold text-red-600">{cashMetrics.overduePayments}</div>
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <p className="text-sm text-gray-500 mt-1">
              ${cashMetrics.overdueAmount.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pestañas específicas para Caja */}
      <Tabs defaultValue="payments" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="payments">Pagos del Día</TabsTrigger>
          <TabsTrigger value="methods">Métodos de Pago</TabsTrigger>
          <TabsTrigger value="receivables">Cuentas por Cobrar</TabsTrigger>
          <TabsTrigger value="reports">Reportes</TabsTrigger>
        </TabsList>

        {/* Pestaña de Pagos del Día */}
        <TabsContent value="payments" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Efectivo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{cashMetrics.cashPayments}</div>
                <p className="text-sm text-gray-500">Pagos en efectivo</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Tarjeta</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{cashMetrics.cardPayments}</div>
                <p className="text-sm text-gray-500">Pagos con tarjeta</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Transferencia</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">{cashMetrics.transferPayments}</div>
                <p className="text-sm text-gray-500">Transferencias</p>
              </CardContent>
            </Card>
          </div>

          {/* Lista de pagos recientes */}
          <Card>
            <CardHeader>
              <CardTitle>Pagos Recientes</CardTitle>
              <CardDescription>Transacciones procesadas hoy</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {payments.slice(0, 8).map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        payment.method === 'efectivo' ? 'bg-green-100' :
                        payment.method === 'tarjeta' ? 'bg-blue-100' :
                        payment.method === 'transferencia' ? 'bg-purple-100' : 'bg-gray-100'
                      }`}>
                        {payment.method === 'efectivo' ? <Banknote className="w-5 h-5 text-green-600" /> :
                         payment.method === 'tarjeta' ? <CreditCard className="w-5 h-5 text-blue-600" /> :
                         <RefreshCw className="w-5 h-5 text-purple-600" />}
                      </div>
                      <div>
                        <p className="font-medium">{payment.student?.nombre_completo}</p>
                        <p className="text-sm text-gray-500">{payment.concept?.name} • {payment.method}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-green-600">${payment.amount.toLocaleString()}</p>
                      <p className="text-sm text-gray-500">
                        {new Date(payment.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pestaña de Métodos de Pago */}
        <TabsContent value="methods" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(paymentsByMethod).map(([method, methodPayments]) => (
              <Card key={method}>
                <CardHeader>
                  <CardTitle className="capitalize">{method}</CardTitle>
                  <CardDescription>
                    {methodPayments.length} pagos • ${methodPayments.reduce((sum, p) => sum + p.amount, 0).toLocaleString()}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {methodPayments.slice(0, 3).map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <div>
                          <p className="font-medium text-sm">{payment.student?.nombre_completo}</p>
                          <p className="text-xs text-gray-500">{payment.concept?.name}</p>
                        </div>
                        <p className="font-medium text-sm">${payment.amount.toLocaleString()}</p>
                      </div>
                    ))}
                    {methodPayments.length > 3 && (
                      <p className="text-sm text-gray-500 text-center">
                        +{methodPayments.length - 3} pagos más
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Pestaña de Cuentas por Cobrar */}
        <TabsContent value="receivables" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Pendiente</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  ${cashMetrics.overdueAmount.toLocaleString()}
                </div>
                <p className="text-sm text-gray-500">Cuentas vencidas</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Tasa de Pago</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{cashMetrics.paymentRate}%</div>
                <p className="text-sm text-gray-500">Pagos vs cargos</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Promedio de Pago</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  ${cashMetrics.averagePaymentAmount.toLocaleString()}
                </div>
                <p className="text-sm text-gray-500">Por transacción</p>
              </CardContent>
            </Card>
          </div>

          {/* Lista de cuentas vencidas */}
          <Card>
            <CardHeader>
              <CardTitle>Cuentas Vencidas</CardTitle>
              <CardDescription>Pagos que requieren seguimiento</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {overdueReceivables.slice(0, 5).map((receivable) => (
                  <div key={receivable.id} className="flex items-center justify-between p-3 border rounded-lg border-red-200 bg-red-50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                      </div>
                      <div>
                        <p className="font-medium">{receivable.student?.nombre_completo}</p>
                        <p className="text-sm text-gray-500">
                          {receivable.concept?.name} • Vencido: {new Date(receivable.due_date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-red-600">${receivable.amount.toLocaleString()}</p>
                      <Button size="sm" variant="outline" className="mt-1">
                        <Receipt className="w-4 h-4 mr-1" />
                        Cobrar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pestaña de Reportes */}
        <TabsContent value="reports" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Resumen Financiero</CardTitle>
                <CardDescription>Métricas de caja</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm">Total Recaudado:</span>
                    <span className="font-medium">${cashMetrics.totalRevenue.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Pagos Hoy:</span>
                    <span className="font-medium">{cashMetrics.totalPaymentsToday}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Pendientes:</span>
                    <span className="font-medium">{cashMetrics.pendingPayments}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Vencidos:</span>
                    <span className="font-medium text-red-600">{cashMetrics.overduePayments}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Acciones Rápidas</CardTitle>
                <CardDescription>Herramientas de caja</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Button className="w-full" variant="outline">
                    <Receipt className="w-4 h-4 mr-2" />
                    Procesar Pago Manual
                  </Button>
                  <Button className="w-full" variant="outline">
                    <DollarSign className="w-4 h-4 mr-2" />
                    Generar Reporte Diario
                  </Button>
                  <Button className="w-full" variant="outline">
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    Iniciar Cobranza
                  </Button>
                  <Button className="w-full" variant="outline">
                    <TrendingUp className="w-4 h-4 mr-2" />
                    Conciliación Bancaria
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}