import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Sidebar from "@/components/layout/sidebar";
import KPICard from "@/components/kpi-card";
import SaaSInfo from "@/components/saas-info";
import { useAuth } from "@/hooks/use-auth";
import { 
  BarChart3, 
  CreditCard, 
  Users2, 
  ShieldCheck,
  DollarSign,
  CheckCircle,
  AlertTriangle
} from "lucide-react";

interface KPIData {
  totalBilled: number;
  paymentRate: number;
  overdueRate: number;
  activeStudents: number;
}

interface Student {
  id: number;
  nombre_completo: string;
  grado: string;
  grupo: string;
  status: string;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  
  // In a real SaaS, this would come from user's campus assignment
  const campusId = user?.campus_id || 1;

  const { data: kpiData, isLoading: kpiLoading } = useQuery<KPIData>({
    queryKey: [`/api/admin/dashboard/${campusId}`],
    enabled: !!user,
  });

  const { data: students, isLoading: studentsLoading } = useQuery<Student[]>({
    queryKey: [`/api/admin/students/${campusId}`],
    enabled: !!user,
  });

  if (kpiLoading || studentsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <div className="w-full">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 text-center">
          <h1 className="text-xl font-bold">EscuelaPay SaaS - Plataforma Multi-Tenant</h1>
          <p className="text-blue-100 text-sm">Sistema web unificado para múltiples instituciones educativas</p>
          <div className="mt-2 text-xs bg-white/20 rounded px-3 py-1 inline-block">
            Campus: {campusId} | Usuario: {user?.email} | Rol: {user?.role}
          </div>
        </div>
        
        <div className="flex">
          <Sidebar />
          
          {/* Main Content */}
          <main className="flex-1 overflow-auto">
            <SaaSInfo />
            
            {/* Header */}
            <header className="bg-white border-b border-slate-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Dashboard Administrativo</h2>
              <p className="text-slate-600">Colegio San Patricio - Campus Norte</p>
            </div>
            <div className="flex items-center space-x-4">
              <Button className="bg-primary-600 text-white hover:bg-primary-700">
                <i className="fas fa-plus mr-2"></i>
                Generar Cargos
              </Button>
              <div className="flex items-center space-x-2 text-sm text-slate-600">
                <i className="fas fa-calendar"></i>
                <span>{new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="p-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <KPICard
              icon={DollarSign}
              label="Total Facturado"
              value={kpiData ? formatCurrency(kpiData.totalBilled) : "$0"}
              change="12% vs mes anterior"
              changeType="positive"
            />
            <KPICard
              icon={CheckCircle}
              label="Pagos Completados"
              value={kpiData ? formatPercentage(kpiData.paymentRate) : "0%"}
              change="5% vs mes anterior"
              changeType="positive"
            />
            <KPICard
              icon={AlertTriangle}
              label="Morosidad"
              value={kpiData ? formatPercentage(kpiData.overdueRate) : "0%"}
              change="3% vs mes anterior"
              changeType="negative"
            />
            <KPICard
              icon={Users2}
              label="Estudiantes Activos"
              value={kpiData ? kpiData.activeStudents.toLocaleString() : "0"}
              change="Total inscritos"
              changeType="neutral"
            />
          </div>

          {/* Charts and Tables Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Payment Trends Chart */}
            <Card className="shadow-sm border border-slate-200">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold text-slate-900">
                    Tendencia de Pagos
                  </CardTitle>
                  <select className="text-sm border border-slate-300 rounded-lg px-3 py-1">
                    <option>Últimos 6 meses</option>
                    <option>Último año</option>
                  </select>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-64 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400">
                  <div className="text-center">
                    <BarChart3 size={48} className="mx-auto mb-2" />
                    <p>Gráfico de Tendencias</p>
                    <p className="text-sm">En desarrollo</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payment Methods Distribution */}
            <Card className="shadow-sm border border-slate-200">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-slate-900">
                  Métodos de Pago
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { method: "Tarjeta de Crédito", percentage: 67, color: "bg-blue-500", icon: "fas fa-credit-card", iconColor: "text-blue-600" },
                    { method: "SPEI/Transferencia", percentage: 23, color: "bg-green-500", icon: "fas fa-university", iconColor: "text-green-600" },
                    { method: "OXXO Pay", percentage: 8, color: "bg-orange-500", icon: "fas fa-store", iconColor: "text-orange-600" },
                    { method: "Efectivo", percentage: 2, color: "bg-gray-500", icon: "fas fa-money-bill", iconColor: "text-gray-600" },
                  ].map((item) => (
                    <div key={item.method} className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                          <i className={`${item.icon} ${item.iconColor} text-sm`}></i>
                        </div>
                        <span className="text-slate-700">{item.method}</span>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-slate-900">{item.percentage}%</p>
                        <div className="w-20 bg-slate-200 rounded-full h-2 mt-1">
                          <div 
                            className={`${item.color} h-2 rounded-full`} 
                            style={{ width: `${item.percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Transactions Table */}
          <Card className="shadow-sm border border-slate-200">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold text-slate-900">
                  Transacciones Recientes
                </CardTitle>
                <Button variant="ghost" className="text-primary-600 font-medium hover:text-primary-700">
                  Ver todas
                </Button>
              </div>
            </CardHeader>
            
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider border-b border-slate-200">
                      <th className="px-6 py-3">Estudiante</th>
                      <th className="px-6 py-3">Concepto</th>
                      <th className="px-6 py-3">Método</th>
                      <th className="px-6 py-3">Monto</th>
                      <th className="px-6 py-3">Estado</th>
                      <th className="px-6 py-3">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {/* Sample data - in real app this would come from API */}
                    {[
                      {
                        student: { initials: "MA", name: "María Andrea López", grade: "6° Grado" },
                        concept: "Colegiatura Enero",
                        method: { icon: "fas fa-credit-card", display: "•••• 4532" },
                        amount: "$2,850.00",
                        status: { label: "Completado", style: "bg-green-100 text-green-800" },
                        date: "Hace 2 horas"
                      },
                      {
                        student: { initials: "JC", name: "Juan Carlos Pérez", grade: "4° Grado" },
                        concept: "Inscripción 2024",
                        method: { icon: "fas fa-university", display: "SPEI" },
                        amount: "$1,500.00",
                        status: { label: "Pendiente", style: "bg-yellow-100 text-yellow-800" },
                        date: "Hace 5 horas"
                      },
                      {
                        student: { initials: "SF", name: "Sofía Fernández", grade: "3° Grado" },
                        concept: "Colegiatura Diciembre",
                        method: { icon: "fas fa-store", display: "OXXO Pay" },
                        amount: "$2,700.00",
                        status: { label: "Completado", style: "bg-green-100 text-green-800" },
                        date: "Ayer"
                      }
                    ].map((transaction, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center">
                              <span className="text-slate-600 font-medium text-xs">
                                {transaction.student.initials}
                              </span>
                            </div>
                            <div className="ml-3">
                              <p className="text-sm font-medium text-slate-900">
                                {transaction.student.name}
                              </p>
                              <p className="text-xs text-slate-500">
                                {transaction.student.grade}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                          {transaction.concept}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <i className={`${transaction.method.icon} text-slate-400 mr-2`}></i>
                            <span className="text-sm text-slate-600">
                              {transaction.method.display}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                          {transaction.amount}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${transaction.status.style}`}>
                            {transaction.status.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                          {transaction.date}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
