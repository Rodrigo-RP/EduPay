import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useInstitution } from "@/hooks/use-institution";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Calculator, 
  TrendingUp, 
  FileText, 
  DollarSign, 
  Users, 
  CreditCard,
  AlertCircle,
  CheckCircle,
  Clock,
  Download,
  BarChart3,
  PieChart,
  Receipt
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface DashboardData {
  students: any[];
  payments: any[];
  charges: any[];
  financial_summary: {
    total_income: number;
    total_pending: number;
    total_overdue: number;
    collection_rate: number;
    students_with_balance: number;
    active_students: number;
  };
}

export default function DashboardContador() {
  const { user } = useAuth();
  const { institutionName, logoUrl } = useInstitution();
  const [selectedPeriod, setSelectedPeriod] = useState("current");

  const { data: dashboardData, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard/contador", user?.campus_id],
    enabled: !!user?.campus_id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const financialData = dashboardData?.financial_summary || {
    total_income: 0,
    total_pending: 0,
    total_overdue: 0,
    collection_rate: 0,
    students_with_balance: 0,
    active_students: 0
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount / 100);
  };

  const getCollectionStatus = (rate: number) => {
    if (rate >= 90) return { color: "bg-green-500", text: "Excelente", variant: "default" as const };
    if (rate >= 80) return { color: "bg-yellow-500", text: "Buena", variant: "secondary" as const };
    if (rate >= 70) return { color: "bg-orange-500", text: "Regular", variant: "outline" as const };
    return { color: "bg-red-500", text: "Crítica", variant: "destructive" as const };
  };

  const collectionStatus = getCollectionStatus(financialData.collection_rate);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {logoUrl && logoUrl.length > 50 && logoUrl.includes('data:image') ? (
            <div className="w-12 h-12 rounded-xl overflow-hidden border-2 border-purple-200">
              <img 
                src={logoUrl} 
                alt="Logo institucional" 
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <Calculator className="w-6 h-6 text-purple-600" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard Contador</h1>
            <p className="text-sm text-gray-500">Análisis financiero y reportes contables • {institutionName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
            <Calculator className="w-4 h-4 mr-1" />
            Solo Lectura
          </Badge>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-1" />
            Exportar Reportes
          </Button>
        </div>
      </div>

      {/* Métricas Principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(financialData.total_income)}
            </div>
            <p className="text-xs text-muted-foreground">
              Ingresos del período actual
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldos Pendientes</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {formatCurrency(financialData.total_pending)}
            </div>
            <p className="text-xs text-muted-foreground">
              {financialData.students_with_balance} estudiantes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Morosidad</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(financialData.total_overdue)}
            </div>
            <p className="text-xs text-muted-foreground">
              Requiere seguimiento
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasa de Cobranza</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {financialData.collection_rate.toFixed(1)}%
            </div>
            <Badge variant={collectionStatus.variant} className="mt-1">
              {collectionStatus.text}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Análisis Detallado */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Resumen</TabsTrigger>
          <TabsTrigger value="payments">Pagos</TabsTrigger>
          <TabsTrigger value="receivables">Cartera</TabsTrigger>
          <TabsTrigger value="reports">Reportes</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Estado de Cobranza</CardTitle>
                <CardDescription>Análisis del comportamiento de pagos</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Tasa de Cobranza</span>
                    <span className="text-sm text-muted-foreground">
                      {financialData.collection_rate.toFixed(1)}%
                    </span>
                  </div>
                  <Progress value={financialData.collection_rate} className="h-2" />
                  
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-600">
                        {Math.round((financialData.collection_rate / 100) * financialData.active_students)}
                      </p>
                      <p className="text-xs text-muted-foreground">Al corriente</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-red-600">
                        {financialData.active_students - Math.round((financialData.collection_rate / 100) * financialData.active_students)}
                      </p>
                      <p className="text-xs text-muted-foreground">Con adeudo</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Indicadores Contables</CardTitle>
                <CardDescription>Métricas clave para análisis</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Estudiantes Activos</span>
                    <Badge variant="outline">{financialData.active_students}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Con Saldo Pendiente</span>
                    <Badge variant="secondary">{financialData.students_with_balance}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Ingreso Promedio</span>
                    <Badge variant="outline">
                      {formatCurrency(financialData.total_income / Math.max(financialData.active_students, 1))}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Índice de Morosidad</span>
                    <Badge variant={financialData.total_overdue > 0 ? "destructive" : "default"}>
                      {((financialData.total_overdue / Math.max(financialData.total_income, 1)) * 100).toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Análisis de Pagos
              </CardTitle>
              <CardDescription>Detalles de transacciones y métodos de pago</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <BarChart3 className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <p className="text-sm text-muted-foreground">
                  Acceso completo a todos los pagos registrados
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Filtros disponibles: método, estado, fecha, concepto
                </p>
                <Button variant="outline" className="mt-4">
                  <FileText className="w-4 h-4 mr-2" />
                  Ver Página de Pagos
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="receivables" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-5 h-5" />
                Cuentas por Cobrar
              </CardTitle>
              <CardDescription>Análisis de cartera y seguimiento</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <PieChart className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <p className="text-sm text-muted-foreground">
                  Acceso completo a análisis de cartera vencida
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Incluye: antigüedad, riesgo, histórico de pagos
                </p>
                <Button variant="outline" className="mt-4">
                  <FileText className="w-4 h-4 mr-2" />
                  Ver Cuentas por Cobrar
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Receipt className="w-5 h-5" />
                Reportes Contables
              </CardTitle>
              <CardDescription>Acceso completo a todos los reportes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">Reportes Financieros</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Estados financieros y análisis CFO
                  </p>
                  <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Generar
                  </Button>
                </div>
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">Análisis Financiero</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Rentabilidad, costos y proyecciones
                  </p>
                  <Button variant="outline" size="sm">
                    <BarChart3 className="w-4 h-4 mr-2" />
                    Acceder
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}