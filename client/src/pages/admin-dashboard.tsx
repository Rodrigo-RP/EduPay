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
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Panel de Control - Campus Principal</h1>
          <p className="text-slate-600">Resumen ejecutivo de operaciones y finanzas</p>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              KPIs Financieros - Ciclo 2024-2025
            </CardTitle>
            <div className="text-sm text-slate-600">
              Datos filtrados por nivel académico seleccionado
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPICard
                icon={DollarSign}
                label="Total Facturado"
                value={`$${(kpiData?.totalBilled ? kpiData.totalBilled / 100 : 0).toLocaleString()}`}
                change="+12.5%"
                changeType="positive"
              />
              <KPICard
                icon={CheckCircle}
                label="Tasa de Pago"
                value={`${kpiData?.paymentRate?.toFixed(1) || '0.0'}%`}
                change="+2.3%"
                changeType="positive"
              />
              <KPICard
                icon={AlertTriangle}
                label="Morosidad"
                value={`${kpiData?.overdueRate?.toFixed(1) || '0.0'}%`}
                change="-1.2%"
                changeType="positive"
              />
              <KPICard
                icon={Users2}
                label="Estudiantes Activos"
                value={kpiData?.activeStudents?.toString() || '0'}
                change="+5"
                changeType="positive"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              Status del Sistema
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Plataforma SaaS</span>
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">Activo</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Pagos en línea</span>
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">Activo</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">CFDI Automático</span>
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">Activo</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Notificaciones</span>
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">Activo</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Métodos de Pago Más Utilizados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { method: "Tarjeta de crédito", percentage: 45, color: "bg-blue-500" },
                { method: "Transferencia", percentage: 30, color: "bg-green-500" },
                { method: "Domiciliado", percentage: 15, color: "bg-purple-500" },
                { method: "OXXO Pay", percentage: 8, color: "bg-orange-500" },
                { method: "Efectivo", percentage: 2, color: "bg-gray-500" },
              ].map((item) => (
                <div key={item.method} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${item.color}`}></div>
                    <span className="text-slate-700">{item.method}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-slate-900">{item.percentage}%</span>
                    <div className="w-16 bg-gray-200 rounded-full h-2 mt-1">
                      <div 
                        className={`h-2 rounded-full ${item.color}`}
                        style={{ width: `${item.percentage}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users2 className="w-5 h-5" />
              Estudiantes Recientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {studentsQuery.data?.slice(0, 5).map((student) => (
                <div key={student.id} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{student.nombre_completo}</p>
                    <p className="text-sm text-slate-500">{student.grado} • {student.grupo}</p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs ${
                    student.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {student.status === 'active' ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
