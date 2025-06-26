import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { 
  TrendingUp, TrendingDown, AlertTriangle, Eye, DollarSign, 
  Users, School, CreditCard, Activity, Shield, Zap, 
  MapPin, Clock, Target, BarChart3, LineChart, Scan,
  Ban, Building, Server, Wifi, Database, Lock,
  Bell, CheckCircle, XCircle, ArrowUp, ArrowDown
} from "lucide-react";

export default function SuperAdminCEODashboard() {
  const { toast } = useToast();
  const [blockIpInput, setBlockIpInput] = useState("");
  const [realTimeData, setRealTimeData] = useState({
    revenue: 2847320,
    mrr: 456780,
    transactionsPerHour: 847,
    successRate: 98.7,
    churnRisk: 2.1,
    uptime: 99.94
  });

  // Auto-update real-time data
  useEffect(() => {
    const interval = setInterval(() => {
      setRealTimeData(prev => ({
        ...prev,
        revenue: prev.revenue + Math.floor(Math.random() * 5000),
        transactionsPerHour: Math.floor(Math.random() * 100) + 800,
        successRate: 98 + Math.random() * 1.5
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // Fetch platform metrics
  const { data: platformMetrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["/api/super-admin/platform/metrics"],
  });

  // Fetch tenants
  const { data: tenants, isLoading: tenantsLoading } = useQuery({
    queryKey: ["/api/super-admin/tenants"],
  });

  // Fetch security events
  const { data: securityEvents, isLoading: eventsLoading } = useQuery({
    queryKey: ["/api/super-admin/security/events"],
  });

  // Fetch system health
  const { data: systemHealth, isLoading: healthLoading } = useQuery({
    queryKey: ["/api/super-admin/system/health"],
  });

  // Security scan mutation
  const securityScanMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/super-admin/security/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        }
      });
      if (!response.ok) throw new Error("Error en el escaneo");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Escaneo Completado",
        description: "El escaneo de seguridad se ejecutó exitosamente",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Error al ejecutar el escaneo de seguridad",
        variant: "destructive",
      });
    },
  });

  // Block IP mutation
  const blockIpMutation = useMutation({
    mutationFn: async (ip: string) => {
      const response = await fetch("/api/super-admin/security/block-ip", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ ip })
      });
      if (!response.ok) throw new Error("Error al bloquear IP");
      return response.json();
    },
    onSuccess: () => {
      setBlockIpInput("");
      toast({
        title: "IP Bloqueada",
        description: "La dirección IP ha sido bloqueada exitosamente",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Error al bloquear la dirección IP",
        variant: "destructive",
      });
    },
  });

  const handleBlockIp = () => {
    if (blockIpInput.trim()) {
      blockIpMutation.mutate(blockIpInput.trim());
    }
  };

  // Live transaction feed data
  const liveTransactions = [
    { time: "09:47:23", school: "Colegio Cervantes", amount: 2500, status: "success" },
    { time: "09:47:21", school: "Instituto Morelos", amount: 1800, status: "success" },
    { time: "09:47:19", school: "Escuela Hidalgo", amount: 3200, status: "success" },
    { time: "09:47:17", school: "Colegio Juárez", amount: 1950, status: "success" },
    { time: "09:47:15", school: "Instituto Allende", amount: 2750, status: "success" },
    { time: "09:47:13", school: "Escuela Reforma", amount: 1600, status: "success" },
    { time: "09:47:11", school: "Colegio Victoria", amount: 2100, status: "success" },
    { time: "09:47:09", school: "Instituto Norte", amount: 1500, status: "failed" },
    { time: "09:47:07", school: "Escuela Central", amount: 2850, status: "success" },
    { time: "09:47:05", school: "Colegio Sur", amount: 1750, status: "success" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                CEO Command Center
              </h1>
              <p className="text-gray-600 mt-2">
                Control ejecutivo en tiempo real - EscuelaPay SaaS Platform
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-gray-600">
                  Wall Street Style Dashboard
                </p>
                <p className="text-xs text-gray-500">
                  Live Data - Actualización cada 3s
                </p>
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="command-center" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="command-center">Centro de Comando</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="security">Seguridad</TabsTrigger>
            <TabsTrigger value="operations">Operaciones</TabsTrigger>
          </TabsList>

          {/* Command Center Tab */}
          <TabsContent value="command-center" className="space-y-4">
            {/* Real-time Revenue Ticker */}
            <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-6 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-6">
                  <div className="text-2xl font-bold">Revenue Live</div>
                  <div className="text-4xl font-mono">
                    ${realTimeData.revenue.toLocaleString()} MXN
                  </div>
                  <div className="text-sm bg-green-500 px-3 py-1 rounded-full">
                    +12.5% ↗
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm opacity-90">MRR Actual</div>
                  <div className="text-2xl font-bold">
                    ${realTimeData.mrr.toLocaleString()} MXN
                  </div>
                </div>
              </div>
            </div>

            {/* Executive KPIs Grid */}
            <div className="grid gap-4 md:grid-cols-6">
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-blue-700 flex items-center gap-2">
                    <School className="h-4 w-4" />
                    Escuelas Activas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-800">
                    {(platformMetrics as any)?.activeSchools || 4}
                  </div>
                  <div className="text-xs text-blue-600 flex items-center gap-1">
                    <ArrowUp className="h-3 w-3" />
                    +2 este mes
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-green-700 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Estudiantes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-800">
                    {(platformMetrics as any)?.totalStudents || 1247}
                  </div>
                  <div className="text-xs text-green-600 flex items-center gap-1">
                    <ArrowUp className="h-3 w-3" />
                    +8.5% crecimiento
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-purple-700 flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Pagos/Hora
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-purple-800">
                    {realTimeData.transactionsPerHour}
                  </div>
                  <div className="text-xs text-purple-600">Última hora</div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-orange-700 flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Tasa Éxito
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-orange-800">
                    {realTimeData.successRate.toFixed(1)}%
                  </div>
                  <div className="text-xs text-orange-600">Transacciones</div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-red-700 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Churn Risk
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-red-800">
                    {realTimeData.churnRisk}%
                  </div>
                  <div className="text-xs text-red-600">En riesgo</div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-teal-50 to-teal-100 border-teal-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-teal-700 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Uptime
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-teal-800">
                    {realTimeData.uptime}%
                  </div>
                  <div className="text-xs text-teal-600">30 días</div>
                </CardContent>
              </Card>
            </div>

            {/* Real-time Command Center */}
            <div className="grid gap-4 md:grid-cols-3">
              {/* Live Transaction Feed */}
              <Card className="bg-black text-green-400 font-mono">
                <CardHeader>
                  <CardTitle className="text-green-400 flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Live Transactions
                  </CardTitle>
                  <div className="text-xs text-green-300">
                    Tiempo real - Wall Street Style
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 max-h-60 overflow-y-auto">
                  {liveTransactions.map((tx, idx) => (
                    <div 
                      key={idx} 
                      className={`text-xs ${tx.status === 'success' ? 'text-green-400' : 'text-red-400'}`}
                    >
                      {tx.time} | {tx.school} | ${tx.amount.toLocaleString()} | {tx.status === 'success' ? '✓' : '✗'}
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Executive Alerts */}
              <Card className="border-red-200 bg-red-50">
                <CardHeader>
                  <CardTitle className="text-red-800 flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    Alertas Ejecutivas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="bg-red-100 p-3 rounded-lg">
                    <div className="text-sm font-semibold text-red-800 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Escuela en Riesgo
                    </div>
                    <div className="text-xs text-red-600">
                      Instituto Benito Juárez - Pagos descendentes 15%
                    </div>
                    <div className="text-xs text-red-500">
                      Acción: Llamada CEO requerida
                    </div>
                  </div>
                  <div className="bg-yellow-100 p-3 rounded-lg">
                    <div className="text-sm font-semibold text-yellow-800 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Oportunidad Upselling
                    </div>
                    <div className="text-xs text-yellow-600">
                      Colegio Cervantes - Listo para plan Premium
                    </div>
                    <div className="text-xs text-yellow-500">
                      Potencial: +$12,000 MXN/mes
                    </div>
                  </div>
                  <div className="bg-blue-100 p-3 rounded-lg">
                    <div className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      Expansión Detectada
                    </div>
                    <div className="text-xs text-blue-600">
                      3 escuelas nuevas en Guadalajara consultando
                    </div>
                    <div className="text-xs text-blue-500">
                      Pipeline: $85,000 MXN potencial
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Performance Map */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Mapa de Rendimiento
                  </CardTitle>
                  <CardDescription>Escuelas por región y volumen</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-2 bg-green-50 rounded">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-sm font-medium">Ciudad de México</span>
                      </div>
                      <div className="text-sm">8 escuelas - $847K</div>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-blue-50 rounded">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                        <span className="text-sm font-medium">Guadalajara</span>
                      </div>
                      <div className="text-sm">5 escuelas - $523K</div>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-purple-50 rounded">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-purple-500 rounded-full animate-pulse"></div>
                        <span className="text-sm font-medium">Monterrey</span>
                      </div>
                      <div className="text-sm">3 escuelas - $398K</div>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-orange-50 rounded">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-orange-500 rounded-full animate-pulse"></div>
                        <span className="text-sm font-medium">Puebla</span>
                      </div>
                      <div className="text-sm">2 escuelas - $267K</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Bottom Analytics Row */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Conciliación Automática
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">94.8%</div>
                  <div className="text-xs text-gray-600">Sin intervención manual</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Tiempo Procesamiento
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">3.2s</div>
                  <div className="text-xs text-gray-600">Promedio por transacción</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Score Seguridad
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-600">98/100</div>
                  <div className="text-xs text-gray-600">Nivel empresarial</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    LTV/CAC Ratio
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-teal-600">8.4x</div>
                  <div className="text-xs text-gray-600">Objetivo: {">"}3x</div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Crecimiento de Revenue</CardTitle>
                  <CardDescription>Tendencia mensual de ingresos</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-48 flex items-center justify-center bg-gradient-to-r from-blue-50 to-green-50 rounded">
                    <LineChart className="h-16 w-16 text-blue-400" />
                    <div className="ml-4">
                      <div className="text-2xl font-bold">$2.8M MXN</div>
                      <div className="text-sm text-gray-600">Este mes</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Distribución por Región</CardTitle>
                  <CardDescription>Revenue por ubicación geográfica</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span>Ciudad de México</span>
                      <span className="font-bold">42%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Guadalajara</span>
                      <span className="font-bold">28%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Monterrey</span>
                      <span className="font-bold">20%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Otros</span>
                      <span className="font-bold">10%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Escaneo de Seguridad</CardTitle>
                  <CardDescription>Análisis completo de vulnerabilidades</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button
                    onClick={() => securityScanMutation.mutate()}
                    disabled={securityScanMutation.isPending}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    <Scan className="h-4 w-4 mr-2" />
                    {securityScanMutation.isPending ? "Escaneando..." : "Iniciar Escaneo"}
                  </Button>
                  <div className="text-sm text-gray-600">
                    <p>• Detección de vulnerabilidades</p>
                    <p>• Análisis de ataques</p>
                    <p>• Score de seguridad</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Bloquear IP</CardTitle>
                  <CardDescription>Control de acceso por IP</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="ip-input">Dirección IP</Label>
                    <Input
                      id="ip-input"
                      placeholder="192.168.1.100"
                      value={blockIpInput}
                      onChange={(e) => setBlockIpInput(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={handleBlockIp}
                    disabled={blockIpMutation.isPending || !blockIpInput.trim()}
                    variant="destructive"
                    className="w-full"
                  >
                    <Ban className="h-4 w-4 mr-2" />
                    {blockIpMutation.isPending ? "Bloqueando..." : "Bloquear IP"}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Estado de Protecciones</CardTitle>
                  <CardDescription>Resumen de defensas activas</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Firewall WAF</span>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Anti-SQL Injection</span>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Rate Limiting</span>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Encriptación AES-256</span>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Operations Tab */}
          <TabsContent value="operations" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Estado de Servicios</CardTitle>
                  <CardDescription>Monitoreo de infraestructura crítica</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {systemHealth && Array.isArray(systemHealth) && systemHealth.map((service: any) => (
                    <div key={service.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                      <div className="flex items-center space-x-2">
                        <div className={`h-3 w-3 rounded-full ${service.status === 'healthy' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        <span className="font-medium">{service.service_name}</span>
                      </div>
                      <span className="text-sm text-gray-600">
                        {service.uptime_percentage}% uptime
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Escuelas Registradas</CardTitle>
                  <CardDescription>Gestión de tenants activos</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {tenants && Array.isArray(tenants) && tenants.slice(0, 5).map((tenant: any) => (
                      <div key={tenant.id} className="flex items-center justify-between p-2 border rounded">
                        <div>
                          <div className="font-medium">{tenant.nombre_legal}</div>
                          <div className="text-sm text-gray-600">
                            {tenant.campusCount} campus - {tenant.studentCount} estudiantes
                          </div>
                        </div>
                        <Badge variant={tenant.status === 'Activo' ? 'default' : 'secondary'}>
                          {tenant.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}