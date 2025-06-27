import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { 
  Trophy, Flag, Timer, Gauge, Flame, Star, Award,
  TrendingUp, Activity, Zap, Target, BarChart3,
  Settings, DollarSign, Users, School
} from "lucide-react";

export default function SuperAdminCEODashboardF1() {
  const { toast } = useToast();
  const [realTimeData, setRealTimeData] = useState({
    revenue: 2847320,
    mrr: 456780,
    transactionsPerHour: 847,
    successRate: 98.7,
    churnRisk: 2.1,
    uptime: 99.94
  });

  // Educational Performance Data (F1 Visual Style)
  const [schoolData, setSchoolData] = useState({
    schools: [
      { name: "Instituto San Patricio", position: 1, revenue: 1245000, growth: 18.5, color: "#FF1801", efficiency: "Excelente", ranking: "#1" },
      { name: "Colegio Bilingüe Norte", position: 2, revenue: 987000, growth: 15.2, color: "#FF8000", efficiency: "+2.3%", ranking: "#2" },
      { name: "Centro Educativo Sur", position: 3, revenue: 876000, growth: 12.8, color: "#00A19B", efficiency: "+1.7%", ranking: "#3" },
      { name: "Academia del Valle", position: 4, revenue: 743000, growth: 9.4, color: "#1E41FF", efficiency: "+1.2%", ranking: "#4" },
      { name: "Escuela Internacional", position: 5, revenue: 654000, growth: 7.1, color: "#0090FF", efficiency: "+0.8%", ranking: "#5" },
      { name: "Preparatoria Elite", position: 6, revenue: 521000, growth: 4.2, color: "#00594F", efficiency: "+0.3%", ranking: "#6" }
    ],
    areas: [
      { name: "Área Inscripciones", performance: "98.5%", improvement: "+2.3%", color: "#FF1801" },
      { name: "Área Colegiaturas", performance: "96.2%", improvement: "-1.1%", color: "#00FF00" },
      { name: "Área Extraordinarios", performance: "94.7%", improvement: "+0.9%", color: "#FFFF00" }
    ],
    metrics: {
      currentEfficiency: "96.8%",
      bestEfficiency: "98.5%",
      averageEfficiency: "95.2%",
      position: 1,
      status: "Líder",
      automation: true,
      performance: 87,
      capacity: 92,
      resources: "Completos",
      quality: "Alta"
    }
  });

  // Live educational transactions
  const [liveTransactions, setLiveTransactions] = useState([
    { school: "Instituto San Patricio", amount: 4500, status: "success", time: "14:23:15", type: "enrollment" },
    { school: "Colegio Bilingüe Norte", amount: 3200, status: "success", time: "14:22:48", type: "payment" },
    { school: "Centro Educativo Sur", amount: 5800, status: "success", time: "14:22:12", type: "achievement" },
    { school: "Academia del Valle", amount: 2900, status: "failed", time: "14:21:45", type: "pending" },
    { school: "Escuela Internacional", amount: 6200, status: "success", time: "14:21:23", type: "excellence" }
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

  // Auto-update real-time educational data
  useEffect(() => {
    const interval = setInterval(() => {
      setRealTimeData(prev => ({
        ...prev,
        revenue: prev.revenue + Math.floor(Math.random() * 5000),
        transactionsPerHour: Math.floor(Math.random() * 100) + 800,
        successRate: 98 + Math.random() * 1.5
      }));

      // Update educational performance rankings
      setSchoolData(prev => ({
        ...prev,
        schools: prev.schools.map(school => ({
          ...school,
          revenue: school.revenue + Math.floor(Math.random() * 2000),
          growth: school.growth + (Math.random() - 0.5) * 0.5
        })),
        metrics: {
          ...prev.metrics,
          performance: Math.max(0, Math.min(100, prev.metrics.performance + (Math.random() - 0.5) * 10)),
          capacity: Math.max(0, Math.min(100, prev.metrics.capacity - Math.random() * 0.5))
        }
      }));
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-red-950 to-black p-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Educational Command Header */}
        <div className="bg-gradient-to-r from-red-600 via-black to-red-600 text-white rounded-lg shadow-lg p-6 border-4 border-red-500">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-3">
                <Trophy className="h-8 w-8 text-yellow-400 animate-pulse" />
                <div>
                  <h1 className="text-3xl font-bold">Centro de Comando Educativo</h1>
                  <p className="text-red-200 mt-1">EscuelaPay Rankings - Monitoreo en Vivo</p>
                </div>
              </div>
              <div className="bg-black/30 rounded-lg p-4 border-2 border-yellow-400">
                <div className="text-center">
                  <div className="text-sm text-yellow-300">RANKING</div>
                  <div className="text-4xl font-mono font-bold text-green-400">#{schoolData.metrics.position}</div>
                  <div className="text-xs text-gray-300">Actual</div>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="bg-green-600 px-4 py-2 rounded-full text-sm font-bold border-2 border-green-400">
                <Activity className="h-4 w-4 inline mr-1" />
                EN VIVO
              </div>
              <div className="bg-blue-600 px-4 py-2 rounded-full text-sm font-bold border-2 border-blue-400">
                <Timer className="h-4 w-4 inline mr-1" />
                TIEMPO REAL
              </div>
              <Button 
                onClick={() => window.location.href = '/super-admin-ceo-dashboard'}
                className="bg-gray-600 hover:bg-gray-700 border-2 border-gray-400"
              >
                <Settings className="h-4 w-4 mr-2" />
                Modo Clásico
              </Button>
            </div>
          </div>
        </div>

        <Tabs defaultValue="education-dashboard" className="w-full">
          <div className="bg-black/80 rounded-lg p-4 border-2 border-red-500">
            <TabsList className="grid w-full grid-cols-4 bg-gray-900 border-2 border-red-400">
              <TabsTrigger value="education-dashboard" className="text-white data-[state=active]:bg-red-600 font-bold">
                <Trophy className="h-4 w-4 mr-2" />
                Dashboard Educativo
              </TabsTrigger>
              <TabsTrigger value="rankings" className="text-white data-[state=active]:bg-orange-600 font-bold">
                <Star className="h-4 w-4 mr-2" />
                Rankings
              </TabsTrigger>
              <TabsTrigger value="analytics" className="text-white data-[state=active]:bg-blue-600 font-bold">
                <Gauge className="h-4 w-4 mr-2" />
                Análisis
              </TabsTrigger>
              <TabsTrigger value="controls" className="text-white data-[state=active]:bg-green-600 font-bold">
                <Flag className="h-4 w-4 mr-2" />
                Controles
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Educational Dashboard Tab */}
          <TabsContent value="education-dashboard" className="space-y-8">
            {/* Tarjetas de Resumen Ejecutivo */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Ingresos Totales
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
                    <Users className="h-4 w-4" />
                    Transacciones/Hora
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{realTimeData.transactionsPerHour}</div>
                  <div className="text-xs text-gray-600">Velocidad actual</div>
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
                  <div className="text-2xl font-bold">{realTimeData.successRate.toFixed(1)}%</div>
                  <div className="text-xs text-gray-600">Pagos exitosos</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Tiempo Activo Sistema
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{realTimeData.uptime}%</div>
                  <div className="text-xs text-gray-600">Disponibilidad</div>
                </CardContent>
              </Card>
            </div>

            {/* Panel de Rendimiento Educativo */}
            <div className="bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 text-white p-6 rounded-lg border-4 border-red-700 shadow-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-6">
                  <div className="bg-black/50 rounded-lg p-4">
                    <div className="text-center">
                      <div className="text-sm text-yellow-300">EFICIENCIA</div>
                      <div className="text-3xl font-mono font-bold text-green-400">{schoolData.metrics.currentEfficiency}</div>
                      <div className="text-xs text-gray-300">Actual</div>
                    </div>
                  </div>
                  <div className="bg-black/50 rounded-lg p-4">
                    <div className="text-center">
                      <div className="text-sm text-yellow-300">MEJOR REGISTRO</div>
                      <div className="text-3xl font-mono font-bold text-purple-400">{schoolData.metrics.bestEfficiency}</div>
                      <div className="text-xs text-gray-300">Histórico</div>
                    </div>
                  </div>
                  <div className="bg-black/50 rounded-lg p-4">
                    <div className="text-center">
                      <div className="text-sm text-yellow-300">TRANSACCIONES</div>
                      <div className="text-3xl font-mono font-bold text-blue-400">{realTimeData.transactionsPerHour}</div>
                      <div className="text-xs text-gray-300">Por Hora</div>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-red-200">
                    Período Actual: {schoolData.metrics.status}
                  </p>
                  <p className="text-xs text-gray-300">
                    Posición: #{schoolData.metrics.position} | Estado: {schoolData.metrics.status}
                  </p>
                </div>
              </div>
            </div>

            {/* Educational Performance Dashboard */}
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
              <Card className="bg-gradient-to-br from-red-900 to-red-700 text-white border-2 border-red-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-300">
                    <Gauge className="h-6 w-6" />
                    Rendimiento Instituto
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Eficiencia</span>
                    <span className="font-mono text-xl">{schoolData.schools[0]?.efficiency}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Área Principal</span>
                    <span className="font-mono text-green-400">{schoolData.areas[0]?.performance}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Revenue</span>
                    <span className="font-mono text-yellow-400">${schoolData.schools[0]?.revenue.toLocaleString()}</span>
                  </div>
                  <Progress value={85} className="mt-4" />
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-orange-900 to-orange-700 text-white border-2 border-orange-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-orange-300">
                    <Flame className="h-6 w-6" />
                    Análisis por Áreas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    {schoolData.areas.map((area, index) => (
                      <div key={index} className="flex justify-between">
                        <span className="text-sm">{area.name.split(' - ')[1] || area.name}</span>
                        <span className="font-mono text-sm">{area.performance}</span>
                      </div>
                    ))}
                  </div>
                  <Progress value={92} className="mt-4" />
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-cyan-900 to-cyan-700 text-white border-2 border-cyan-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-cyan-300">
                    <Trophy className="h-6 w-6" />
                    Puntos de Excelencia
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold">148</div>
                      <div className="text-xs">San Patricio</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">132</div>
                      <div className="text-xs">Bilingüe Norte</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">118</div>
                      <div className="text-xs">Educativo Sur</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">95</div>
                      <div className="text-xs">Del Valle</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Live Educational Rankings */}
            <div className="bg-gradient-to-r from-black via-gray-900 to-black rounded-lg p-6 border-2 border-white">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Flag className="h-5 w-5" />
                Rankings Educativos en Vivo
              </h3>
              <div className="space-y-3">
                {schoolData.schools.map((school, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-lg" style={{backgroundColor: school.color + '20', borderLeft: `4px solid ${school.color}`}}>
                    <div className="flex items-center space-x-4">
                      <div className="text-2xl font-bold text-white w-8">#{school.position}</div>
                      <div>
                        <div className="font-bold text-white">{school.name}</div>
                        <div className="text-sm text-gray-300">Eficiencia: {school.efficiency}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-white text-lg">${school.revenue.toLocaleString()}</div>
                      <div className="text-sm text-green-400">+{school.growth.toFixed(1)}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-8">
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-4">
              <Card className="bg-gradient-to-br from-red-900 to-red-700 text-white border-2 border-red-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-300">
                    <Gauge className="h-5 w-5" />
                    Métricas Sistema
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <div className="text-4xl font-mono font-bold text-red-400">
                    {platformMetrics?.totalSchools || 18}
                  </div>
                  <div className="text-sm text-gray-300">Escuelas Activas</div>
                  <Progress value={85} className="mt-4" />
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-blue-900 to-blue-700 text-white border-2 border-blue-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-blue-300">
                    <Zap className="h-5 w-5" />
                    Rendimiento
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <div className="text-4xl font-mono font-bold text-blue-400">
                    {platformMetrics?.totalStudents || 2847}
                  </div>
                  <div className="text-sm text-gray-300">Estudiantes Activos</div>
                  <Progress value={92} className="mt-4" />
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-green-900 to-green-700 text-white border-2 border-green-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-300">
                    <Activity className="h-5 w-5" />
                    Salud del Sistema
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <div className="text-4xl font-mono font-bold text-green-400">
                    {realTimeData.successRate.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-300">Tasa de Éxito</div>
                  <Progress value={realTimeData.successRate} className="mt-4" />
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-purple-900 to-purple-700 text-white border-2 border-purple-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-purple-300">
                    <Target className="h-5 w-5" />
                    Capacidad Sistema
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <div className="text-4xl font-mono font-bold text-purple-400">
                    {schoolData.metrics.performance}%
                  </div>
                  <div className="text-sm text-gray-300">Rendimiento Actual</div>
                  <Progress value={schoolData.metrics.performance} className="mt-4" />
                </CardContent>
              </Card>
            </div>

            {/* Live Data Feed */}
            <div className="bg-black rounded-lg p-6 border-2 border-green-500">
              <h3 className="text-xl font-bold text-green-400 mb-4">Stream de Datos en Vivo</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto font-mono text-sm">
                {liveTransactions.slice(0, 10).map((tx, idx) => (
                  <div key={idx} className="text-green-400">
                    [{new Date().toLocaleTimeString()}] {tx.school} - ${tx.amount.toLocaleString()} - {tx.status === 'success' ? '✓' : '✗'} - {tx.type}
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Rankings Tab */}
          <TabsContent value="rankings" className="space-y-8">
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
              <Card className="bg-gradient-to-br from-yellow-600 to-yellow-800 text-white border-4 border-yellow-400">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-center justify-center">
                    <Trophy className="h-8 w-8" />
                    Líder en Excelencia
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center space-y-4">
                  <div className="text-6xl font-bold">🏆</div>
                  <div className="text-2xl font-bold">{schoolData.schools[0]?.name}</div>
                  <div className="text-lg">${schoolData.schools[0]?.revenue.toLocaleString()} Revenue</div>
                  <Badge className="bg-yellow-500 text-black font-bold text-lg px-4 py-2">
                    EXCELENCIA
                  </Badge>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-gray-400 to-gray-600 text-white border-4 border-gray-300">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-center justify-center">
                    <Star className="h-8 w-8" />
                    Segundo Lugar
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center space-y-4">
                  <div className="text-6xl font-bold">🥈</div>
                  <div className="text-2xl font-bold">{schoolData.schools[1]?.name}</div>
                  <div className="text-lg">${schoolData.schools[1]?.revenue.toLocaleString()} Revenue</div>
                  <Badge className="bg-gray-400 text-black font-bold text-lg px-4 py-2">
                    DESTACADO
                  </Badge>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Controls Tab */}
          <TabsContent value="controls" className="space-y-8">
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
              <Card className="bg-gradient-to-br from-gray-800 to-gray-900 text-white border-2 border-gray-600">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-gray-300">
                    <Settings className="h-6 w-6" />
                    Controles Ejecutivos
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button 
                    onClick={() => window.location.href = '/super-admin-school-management'}
                    className="w-full bg-blue-600 hover:bg-blue-700 border-2 border-blue-400"
                  >
                    <Flag className="h-4 w-4 mr-2" />
                    Centro de Control
                  </Button>
                  <Button 
                    onClick={() => window.location.href = '/platform-login'}
                    className="w-full bg-yellow-600 hover:bg-yellow-700 border-2 border-yellow-400 text-black"
                  >
                    <Award className="h-4 w-4 mr-2" />
                    Acceso Especializado
                  </Button>
                  <Button 
                    onClick={() => window.location.href = '/super-admin-ceo-dashboard'}
                    className="w-full bg-gray-600 hover:bg-gray-700 border-2 border-gray-400"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Modo Clásico
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}