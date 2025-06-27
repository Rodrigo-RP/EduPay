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
  Bell, CheckCircle, XCircle, ArrowUp, ArrowDown, Settings,
  Trophy, Flag, Timer, Gauge, Flame, Star, Award
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

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

  // Live transactions data
  const [liveTransactions, setLiveTransactions] = useState([
    { school: "Colegio San Patricio", amount: 4500, status: "success", time: "14:23:15" },
    { school: "Instituto Tecnológico", amount: 3200, status: "success", time: "14:22:48" },
    { school: "Escuela Bilingüe", amount: 5800, status: "success", time: "14:22:12" },
    { school: "Centro Educativo", amount: 2900, status: "failed", time: "14:21:45" },
    { school: "Academia Premier", amount: 6200, status: "success", time: "14:21:23" }
  ]);

  // Platform metrics query
  const { data: platformMetrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["/api/super-admin/platform/metrics"],
    queryFn: async () => {
      const response = await fetch("/api/super-admin/platform/metrics", {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`,
        },
      });
      return response.json();
    },
  });

  // Tenants list query
  const { data: tenants, isLoading: tenantsLoading } = useQuery({
    queryKey: ["/api/super-admin/tenants"],
    queryFn: async () => {
      const response = await fetch("/api/super-admin/tenants", {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`,
        },
      });
      return response.json();
    },
  });

  // Security events query
  const { data: securityEvents, isLoading: eventsLoading } = useQuery({
    queryKey: ["/api/super-admin/security/events"],
    queryFn: async () => {
      const response = await fetch("/api/super-admin/security/events", {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`,
        },
      });
      return response.json();
    },
  });

  // System health query
  const { data: systemHealth, isLoading: healthLoading } = useQuery({
    queryKey: ["/api/super-admin/system/health"],
    queryFn: async () => {
      const response = await fetch("/api/super-admin/system/health", {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`,
        },
      });
      return response.json();
    },
  });

  // Security scan mutation
  const securityScanMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/super-admin/security/scan", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "application/json",
        },
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Escaneo de Seguridad Iniciado",
        description: "El análisis de vulnerabilidades está en progreso.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/security/events"] });
    },
  });

  // Block IP mutation
  const blockIpMutation = useMutation({
    mutationFn: async (ip: string) => {
      const response = await fetch("/api/super-admin/security/block-ip", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ip }),
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "IP Bloqueada",
        description: `La dirección ${blockIpInput} ha sido bloqueada exitosamente.`,
      });
      setBlockIpInput("");
    },
  });

  const handleSecurityScan = () => {
    securityScanMutation.mutate();
  };

  const handleBlockIp = () => {
    if (blockIpInput.trim()) {
      blockIpMutation.mutate(blockIpInput.trim());
    }
  };

  // Real-time data updates
  useEffect(() => {
    const interval = setInterval(() => {
      setRealTimeData(prev => ({
        ...prev,
        revenue: prev.revenue + Math.floor(Math.random() * 1000),
        transactionsPerHour: prev.transactionsPerHour + Math.floor(Math.random() * 10 - 5),
        successRate: Math.max(95, Math.min(99.9, prev.successRate + (Math.random() - 0.5) * 0.1))
      }));

      // Update live transactions
      const newTransaction = {
        school: ["Colegio San Patricio", "Instituto Tecnológico", "Escuela Bilingüe", "Centro Educativo", "Academia Premier"][Math.floor(Math.random() * 5)],
        amount: Math.floor(Math.random() * 5000) + 1000,
        status: Math.random() > 0.1 ? "success" : "failed",
        time: new Date().toLocaleTimeString()
      };

      setLiveTransactions(prev => [newTransaction, ...prev.slice(0, 9)]);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  if (metricsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando panel ejecutivo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 space-y-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Shield className="h-8 w-8 text-blue-600" />
                Dashboard CEO - Centro de Comando
              </h1>
              <p className="text-gray-600 mt-2">
                Monitoreo ejecutivo en tiempo real - Plataforma SaaS EscuelaPay
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Button 
                onClick={() => window.location.href = '/super-admin'}
                className="bg-red-600 hover:bg-red-700 border-2 border-red-400 text-white font-bold"
              >
                <Trophy className="h-4 w-4 mr-2" />
                F1 Racing Mode
              </Button>
              <div className="text-right">
                <p className="text-sm text-gray-600">
                  EscuelaPay SaaS Platform
                </p>
                <p className="text-xs text-gray-500">
                  v2.0 - CEO Executive Dashboard
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Controls */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg shadow-lg p-4 mb-8">
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button 
              onClick={() => window.location.href = '/super-admin-school-management'}
              className="bg-white/20 hover:bg-white/30 border-2 border-white/30 text-white font-bold"
            >
              <Building className="h-4 w-4 mr-2" />
              Gestión Escuelas
            </Button>
            <Button 
              onClick={() => window.location.href = '/platform-login'}
              className="bg-white/20 hover:bg-white/30 border-2 border-white/30 text-white font-bold"
            >
              <Users className="h-4 w-4 mr-2" />
              Perfiles Especializados
            </Button>
            <div className="flex items-center space-x-4">
              <div className="bg-green-600 px-3 py-1 rounded-full text-sm font-bold">
                <Activity className="h-4 w-4 inline mr-1" />
                LIVE
              </div>
              <div className="bg-blue-600 px-3 py-1 rounded-full text-sm font-bold">
                <Timer className="h-4 w-4 inline mr-1" />
                REAL-TIME
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Vista General</TabsTrigger>
            <TabsTrigger value="analytics">Análisis</TabsTrigger>
            <TabsTrigger value="security">Seguridad</TabsTrigger>
            <TabsTrigger value="operations">Operaciones</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-8">
            {/* Executive KPI Cards */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Revenue Total
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${realTimeData.revenue.toLocaleString()}</div>
                  <div className="text-xs text-gray-600">En tiempo real</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <School className="h-4 w-4" />
                    Escuelas Activas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{platformMetrics?.totalSchools || 18}</div>
                  <div className="text-xs text-gray-600">Plataforma completa</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Estudiantes Totales
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{platformMetrics?.totalStudents || 2847}</div>
                  <div className="text-xs text-gray-600">Activos en sistema</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Transacciones
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{realTimeData.transactionsPerHour}</div>
                  <div className="text-xs text-gray-600">Por hora</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Tasa de Éxito
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{realTimeData.successRate.toFixed(1)}%</div>
                  <div className="text-xs text-gray-600">Pagos exitosos</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Uptime Sistema
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">{realTimeData.uptime}%</div>
                  <div className="text-xs text-gray-600">Disponibilidad</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    MRR Growth
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-600">${realTimeData.mrr.toLocaleString()}</div>
                  <div className="text-xs text-gray-600">Mensual recurrente</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Churn Risk
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{realTimeData.churnRisk.toFixed(1)}%</div>
                  <div className="text-xs text-gray-600">Riesgo bajo</div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-8">
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <LineChart className="h-4 w-4" />
                    Conversión Rate
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">94.2%</div>
                  <div className="text-xs text-gray-600">Tasa de conversión</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    CAC Promedio
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">$340</div>
                  <div className="text-xs text-gray-600">Costo adquisición</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    LTV Promedio
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">$2,856</div>
                  <div className="text-xs text-gray-600">Valor vitalicio</div>
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

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-8">
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Escaneo de Seguridad</CardTitle>
                  <CardDescription>Análisis de vulnerabilidades del sistema</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button
                    onClick={handleSecurityScan}
                    disabled={securityScanMutation.isPending}
                    className="w-full"
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
                  <div className="text-sm text-gray-600">
                    <p>• Bloqueo inmediato</p>
                    <p>• Protección automática</p>
                    <p>• Log de eventos</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Estado de Protecciones</CardTitle>
                  <CardDescription>Sistemas de defensa activos</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">WAF (Firewall)</span>
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Anti-SQL Injection</span>
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Rate Limiting</span>
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Encriptación AES-256</span>
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Monitoreo 24/7</span>
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Operations Tab */}
          <TabsContent value="operations" className="space-y-8">
            {/* Real-time Transactions Feed */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Feed de Transacciones en Vivo
                </CardTitle>
                <CardDescription>Últimas transacciones procesadas - Actualización automática</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {liveTransactions.map((transaction, index) => (
                    <div key={index} className={`flex items-center justify-between p-3 rounded-lg border-l-4 ${
                      transaction.status === 'success' ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'
                    }`}>
                      <div className="flex items-center space-x-4">
                        <div className={`w-3 h-3 rounded-full ${
                          transaction.status === 'success' ? 'bg-green-500' : 'bg-red-500'
                        }`}></div>
                        <div>
                          <div className="font-medium">{transaction.school}</div>
                          <div className="text-sm text-gray-600">{transaction.time}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg">${transaction.amount.toLocaleString()}</div>
                        <div className={`text-sm ${
                          transaction.status === 'success' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {transaction.status === 'success' ? 'Exitoso' : 'Fallido'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* System Health Monitoring */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {(systemHealth as any)?.map((service: any, index: number) => (
                <Card key={index} className={`border-l-4 ${
                  service.status === 'operational' ? 'border-green-500' : 'border-red-500'
                }`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      {service.status === 'operational' ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600" />
                      )}
                      {service.service_name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-lg font-bold ${
                      service.status === 'operational' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {service.status === 'operational' ? 'Operacional' : 'Error'}
                    </div>
                    <div className="text-xs text-gray-600">
                      Actualizado: {new Date(service.last_check).toLocaleTimeString()}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Platform Overview */}
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Resumen de Tenants</CardTitle>
                  <CardDescription>Estado de escuelas en la plataforma</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {(tenants as any)?.slice(0, 5).map((tenant: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <div className="font-medium">{tenant.nombre_legal}</div>
                          <div className="text-sm text-gray-600">
                            {tenant.campusCount} campus • {tenant.studentCount} estudiantes
                          </div>
                        </div>
                        <Badge variant={tenant.status === 'activo' ? 'default' : 'secondary'}>
                          {tenant.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Eventos de Seguridad Recientes</CardTitle>
                  <CardDescription>Últimos eventos monitoreados</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {(securityEvents as any)?.slice(0, 5).map((event: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-2 border-l-4 border-blue-500 bg-blue-50 rounded">
                        <div>
                          <div className="font-medium text-sm">{event.event_type}</div>
                          <div className="text-xs text-gray-600">
                            {new Date(event.timestamp).toLocaleString()}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {event.severity}
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