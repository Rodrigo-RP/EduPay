import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInstitution } from "@/hooks/use-institution";
import { 
  DollarSign, 
  CreditCard, 
  AlertTriangle, 
  TrendingUp,
  Users,
  Clock,
  CheckCircle,
  XCircle
} from 'lucide-react';

export default function DashboardCaja() {
  const { institutionName, logoUrl } = useInstitution();
  
  // Obtener datos de pagos - enfoque en transacciones y cobranza
  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ['/api/payments'],
    select: (data) => data.filter(p => 
      // Solo pagos relacionados con caja: colegiaturas, mensualidades, recargos
      p.concept?.name?.toLowerCase().includes('colegiatura') ||
      p.concept?.name?.toLowerCase().includes('mensualidad') ||
      p.concept?.name?.toLowerCase().includes('recargo') ||
      p.concept?.name?.toLowerCase().includes('multa') ||
      p.concept?.name?.toLowerCase().includes('seguro') ||
      p.concept?.name?.toLowerCase().includes('transporte')
    )
  });

  // Obtener datos de cuentas por cobrar
  const { data: receivables = [], isLoading: receivablesLoading } = useQuery({
    queryKey: ['/api/receivables']
  });

  // Obtener datos de estudiantes para contexto
  const { data: students = [], isLoading: studentsLoading } = useQuery({
    queryKey: ['/api/students']
  });

  // Calcular métricas específicas para Caja
  const cajaMetrics = {
    totalRevenue: payments.reduce((sum, p) => sum + p.amount, 0),
    pendingPayments: receivables.filter(r => r.status === 'pending').length,
    overdueAmount: receivables
      .filter(r => r.status === 'overdue')
      .reduce((sum, r) => sum + r.amount, 0),
    paymentRate: payments.length > 0 ? 
      (payments.filter(p => p.status === 'completed').length / payments.length * 100).toFixed(1) : 0,
    cashPayments: payments.filter(p => p.payment_method === 'cash').length,
    cardPayments: payments.filter(p => p.payment_method === 'card').length,
    bankPayments: payments.filter(p => p.payment_method === 'bank_transfer').length,
    totalStudents: students.length,
    studentsWithDebt: receivables.filter(r => r.status === 'overdue').length
  };

  // Pagos recientes (últimos 7 días)
  const recentPayments = payments
    .filter(p => new Date(p.payment_date) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    .sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date))
    .slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {logoUrl && logoUrl.length > 50 && logoUrl.includes('data:image') ? (
            <div className="w-12 h-12 rounded-xl overflow-hidden border-2 border-green-200">
              <img 
                src={logoUrl} 
                alt="Logo institucional" 
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-green-600" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard Caja</h1>
            <p className="text-gray-600">Gestión de pagos y cobranza • {institutionName}</p>
          </div>
        </div>
        <Button onClick={() => window.location.href = '/pagos'}>
          <CreditCard className="mr-2 h-4 w-4" />
          Registrar Pago
        </Button>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ingresos del Mes</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${cajaMetrics.totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-gray-600">Total cobrado</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pagos Pendientes</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cajaMetrics.pendingPayments}</div>
            <p className="text-xs text-gray-600">Por cobrar</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Morosos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${cajaMetrics.overdueAmount.toLocaleString()}</div>
            <p className="text-xs text-gray-600">{cajaMetrics.studentsWithDebt} estudiantes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasa de Cobro</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cajaMetrics.paymentRate}%</div>
            <p className="text-xs text-gray-600">Eficiencia</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="payments" className="space-y-4">
        <TabsList>
          <TabsTrigger value="payments">Pagos Recientes</TabsTrigger>
          <TabsTrigger value="methods">Métodos de Pago</TabsTrigger>
          <TabsTrigger value="overdue">Cuentas Vencidas</TabsTrigger>
        </TabsList>

        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle>Pagos Recientes</CardTitle>
              <CardDescription>Últimas transacciones procesadas</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentPayments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium">{payment.student?.name}</p>
                        <p className="text-sm text-gray-600">{payment.concept?.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">${payment.amount.toLocaleString()}</p>
                      <p className="text-sm text-gray-600">{payment.payment_method}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="methods">
          <Card>
            <CardHeader>
              <CardTitle>Métodos de Pago</CardTitle>
              <CardDescription>Distribución por tipo de pago</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <CreditCard className="h-4 w-4 text-blue-600" />
                    </div>
                    <span>Tarjeta</span>
                  </div>
                  <Badge variant="secondary">{cajaMetrics.cardPayments} pagos</Badge>
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
                      <DollarSign className="h-4 w-4 text-green-600" />
                    </div>
                    <span>Efectivo</span>
                  </div>
                  <Badge variant="secondary">{cajaMetrics.cashPayments} pagos</Badge>
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 bg-purple-100 rounded-full flex items-center justify-center">
                      <TrendingUp className="h-4 w-4 text-purple-600" />
                    </div>
                    <span>Transferencia</span>
                  </div>
                  <Badge variant="secondary">{cajaMetrics.bankPayments} pagos</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overdue">
          <Card>
            <CardHeader>
              <CardTitle>Cuentas Vencidas</CardTitle>
              <CardDescription>Estudiantes con pagos atrasados</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {receivables.filter(r => r.status === 'overdue').slice(0, 10).map((receivable) => (
                  <div key={receivable.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="h-8 w-8 bg-red-100 rounded-full flex items-center justify-center">
                        <XCircle className="h-4 w-4 text-red-600" />
                      </div>
                      <div>
                        <p className="font-medium">{receivable.student?.name}</p>
                        <p className="text-sm text-gray-600">Vencido desde {new Date(receivable.due_date).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-red-600">${receivable.amount.toLocaleString()}</p>
                      <Button size="sm" variant="outline" className="mt-1">
                        Gestionar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}