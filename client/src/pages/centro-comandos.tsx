// Centro de Comandos del Contador — pantalla de trabajo diario
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import {
  AlertTriangle, CheckCircle, Clock, FileText, CreditCard,
  Users, TrendingDown, TrendingUp, Calendar, Zap,
  ArrowRight, RefreshCw, Bell, DollarSign, BarChart3,
  HandshakeIcon, Receipt
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function CentroComandos() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const campusId = user?.campus_id || 1;

  const { data: comandos, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/dashboard/comandos", campusId],
    refetchInterval: 60000,
  });

  const { data: kpis } = useQuery<any>({
    queryKey: ["/api/admin/dashboard", campusId],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const hoy = new Date().toLocaleDateString("es-MX", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const tareas = comandos?.tareas_hoy || [];
  const alertas = comandos?.alertas || [];
  const resumen = comandos?.resumen || {};

  const urgencyColor = (n: number, tipo: string) => {
    if (n === 0) return "text-green-600";
    if (tipo === "critico") return "text-red-600";
    if (tipo === "importante") return "text-amber-600";
    return "text-blue-600";
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Zap className="w-6 h-6 text-amber-500" />
            Centro de Comandos
          </h1>
          <p className="text-slate-500 text-sm mt-1 capitalize">{hoy}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Actualizar
        </Button>
      </div>

      {/* KPIs rápidos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Facturado este mes", value: `$${((resumen.facturado_mes || kpis?.totalBilled || 0) / 100).toLocaleString("es-MX", { minimumFractionDigits: 0 })}`, icon: DollarSign, color: "text-green-600", bg: "bg-green-50" },
          { label: "Tasa de cobro", value: `${resumen.tasa_cobro || kpis?.paymentRate || 0}%`, icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Índice de mora", value: `${resumen.mora || kpis?.overdueRate || 0}%`, icon: TrendingDown, color: "text-red-600", bg: "bg-red-50" },
          { label: "Estudiantes activos", value: resumen.estudiantes || kpis?.activeStudents || 0, icon: Users, color: "text-purple-600", bg: "bg-purple-50" },
        ].map((kpi, i) => (
          <Card key={i} className={`${kpi.bg} border-0`}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-white`}>
                <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
              </div>
              <div>
                <p className="text-xs text-slate-500">{kpi.label}</p>
                <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tareas del día */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-500" />
              Tareas urgentes de hoy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(tareas.length > 0 ? tareas : [
              { tipo: "conciliacion", label: "Transacciones SPEI sin conciliar", cantidad: resumen.spei_pendientes || 0, ruta: "/caja-conciliacion", urgencia: resumen.spei_pendientes > 0 ? "importante" : "normal" },
              { tipo: "cfdi", label: "Pagos pendientes de timbrar CFDI", cantidad: resumen.cfdi_pendientes || 0, ruta: "/fiscal-contable", urgencia: resumen.cfdi_pendientes > 10 ? "critico" : "importante" },
              { tipo: "deudores", label: "Familias con 30+ días de adeudo", cantidad: resumen.deudores_criticos || 0, ruta: "/semaforo-riesgo", urgencia: "critico" },
              { tipo: "planes", label: "Cuotas de convenio vencidas hoy", cantidad: resumen.cuotas_vencidas || 0, ruta: "/planes-pago", urgencia: resumen.cuotas_vencidas > 0 ? "importante" : "normal" },
              { tipo: "becas", label: "Becas por vencer este mes", cantidad: resumen.becas_por_vencer || 0, ruta: "/becas", urgencia: resumen.becas_por_vencer > 0 ? "importante" : "normal" },
            ]).map((t: any, i: number) => (
              <div
                key={i}
                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-slate-50 transition-colors ${
                  t.urgencia === "critico" && t.cantidad > 0 ? "border-red-200 bg-red-50" :
                  t.urgencia === "importante" && t.cantidad > 0 ? "border-amber-200 bg-amber-50" :
                  "border-slate-200"
                }`}
                onClick={() => setLocation(t.ruta)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                    t.cantidad === 0 ? "bg-green-100 text-green-700" :
                    t.urgencia === "critico" ? "bg-red-100 text-red-700" :
                    "bg-amber-100 text-amber-700"
                  }`}>
                    {t.cantidad === 0 ? <CheckCircle className="w-4 h-4" /> : t.cantidad}
                  </div>
                  <span className="text-sm font-medium text-slate-700">{t.label}</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Accesos rápidos */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-500" />
              Accesos rápidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: CreditCard, label: "Conciliación SPEI", ruta: "/caja-conciliacion", color: "bg-blue-600 hover:bg-blue-700" },
                { icon: Receipt, label: "Timbrado masivo CFDI", ruta: "/fiscal-contable", color: "bg-purple-600 hover:bg-purple-700" },
                { icon: TrendingDown, label: "Semáforo de riesgo", ruta: "/semaforo-riesgo", color: "bg-red-600 hover:bg-red-700" },
                { icon: HandshakeIcon, label: "Planes de pago", ruta: "/planes-pago", color: "bg-amber-600 hover:bg-amber-700" },
                { icon: Users, label: "Motor de becas", ruta: "/becas", color: "bg-green-600 hover:bg-green-700" },
                { icon: Calendar, label: "Calendario fiscal", ruta: "/calendario-financiero", color: "bg-teal-600 hover:bg-teal-700" },
                { icon: BarChart3, label: "Reporte consejo", ruta: "/reporte-consejo", color: "bg-indigo-600 hover:bg-indigo-700" },
                { icon: FileText, label: "Cuentas por cobrar", ruta: "/cuentas-por-cobrar", color: "bg-slate-600 hover:bg-slate-700" },
              ].map((item, i) => (
                <Button
                  key={i}
                  className={`h-auto py-3 flex-col gap-1 text-white ${item.color}`}
                  onClick={() => setLocation(item.ruta)}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="text-xs leading-tight text-center">{item.label}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alertas del sistema */}
      {alertas.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-4 h-4" />
              Alertas del sistema
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alertas.map((a: any, i: number) => (
                <div key={i} className="flex items-center gap-3 p-2 bg-amber-50 rounded border border-amber-100 text-sm">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="text-amber-800">{a.mensaje}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
