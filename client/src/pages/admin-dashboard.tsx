import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import KPICard from "@/components/kpi-card";
import { useAuth } from "@/hooks/use-auth";
import { useRoleBasedData } from "@/hooks/useRoleBasedData";
import { useEffect } from "react";
import { useLocation } from "wouter";
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
  const { userRole } = useRoleBasedData();
  const [, setLocation] = useLocation();
  const campusId = 1;

  // Redirección automática según el rol
  useEffect(() => {
    if (user && userRole) {
      switch (userRole) {
        case 'admisiones':
          setLocation('/dashboard-admisiones');
          return;
        case 'caja':
          setLocation('/dashboard-caja');
          return;
        // Los demás roles permanecen en el dashboard general
        default:
          break;
      }
    }
  }, [user, userRole, setLocation]);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-20 w-72 h-72 bg-gradient-to-br from-blue-400/10 to-cyan-400/10 rounded-full blur-3xl"></div>
        <div className="absolute top-60 right-10 w-56 h-56 bg-gradient-to-br from-purple-400/10 to-pink-400/10 rounded-full blur-2xl"></div>
        <div className="absolute bottom-40 left-1/4 w-64 h-64 bg-gradient-to-br from-cyan-400/10 to-blue-400/10 rounded-full blur-3xl"></div>
      </div>
      
      <div className="relative z-10 p-6">
        {/* Header Premium */}
        <div className="mb-10 relative">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-cyan-600/10 rounded-2xl blur-xl"></div>
          <div className="relative bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-xl border border-white/50">
            <div className="flex items-center gap-6">
              <div className="relative">
                <div className="absolute -inset-2 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl blur opacity-50"></div>
                <div className="relative p-4 bg-gradient-to-r from-blue-100 to-cyan-100 rounded-xl">
                  <BarChart3 className="w-10 h-10 text-blue-600 edupay-icon-bounce" />
                </div>
              </div>
              <div className="flex-1">
                <h1 className="text-4xl font-bold edupay-text-gradient mb-2">Panel de Control</h1>
                <p className="text-slate-600 text-lg">Resumen ejecutivo del Instituto JFR - Campus Principal</p>
                <div className="flex items-center gap-4 mt-3">
                  <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                    ● Sistema Activo
                  </div>
                  <div className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                    Ciclo 2024-2025
                  </div>
                </div>
              </div>
            </div>
            
            {/* Decorative elements */}
            <div className="absolute top-4 right-4 w-32 h-32 bg-gradient-to-br from-blue-200/20 to-cyan-200/20 rounded-full blur-2xl"></div>
            <div className="absolute bottom-4 right-8 w-20 h-20 bg-gradient-to-br from-pink-200/20 to-purple-200/20 rounded-full blur-xl"></div>
          </div>
        </div>

        {/* KPI Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card className="lg:col-span-2 edupay-card-shadow edupay-card-hover animate-fade-scale">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-t-lg">
            <CardTitle className="flex items-center gap-3 text-xl">
              <div className="p-2 bg-blue-100 rounded-lg">
                <BarChart3 className="w-6 h-6 text-blue-600" />
              </div>
              <span className="edupay-text-gradient">KPIs Financieros</span>
            </CardTitle>
            <div className="text-slate-600 ml-11">
              Datos en tiempo real del ciclo escolar 2024-2025
            </div>
          </CardHeader>
          <CardContent className="p-6">
        <div className="grid grid-cols-2 gap-6">
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
              {students?.slice(0, 5).map((student) => (
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
    </div>
  );
}