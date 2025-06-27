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

  // F1 Style Racing Data
  const [racingData, setRacingData] = useState({
    schools: [
      { name: "Colegio Ferrari", position: 1, revenue: 1245000, growth: 18.5, color: "#FF1801", lap: "Best", status: "P1" },
      { name: "Instituto McLaren", position: 2, revenue: 987000, growth: 15.2, color: "#FF8000", lap: "+0.3s", status: "P2" },
      { name: "Escuela Mercedes", position: 3, revenue: 876000, growth: 12.8, color: "#00A19B", lap: "+0.7s", status: "P3" },
      { name: "Centro Red Bull", position: 4, revenue: 743000, growth: 9.4, color: "#1E41FF", lap: "+1.2s", status: "P4" },
      { name: "Academia Alpine", position: 5, revenue: 654000, growth: 7.1, color: "#0090FF", lap: "+1.8s", status: "P5" },
      { name: "Prep Aston Martin", position: 6, revenue: 521000, growth: 4.2, color: "#00594F", lap: "+2.3s", status: "P6" }
    ],
    sectors: [
      { name: "Sector 1 - Inscripciones", time: "1:23.456", improvement: "+0.234", color: "#FF1801" },
      { name: "Sector 2 - Colegiaturas", time: "2:45.789", improvement: "-0.156", color: "#00FF00" },
      { name: "Sector 3 - Extraordinarios", time: "1:34.567", improvement: "+0.089", color: "#FFFF00" }
    ],
    performance: {
      currentLap: "2:34.567",
      bestLap: "2:33.891",
      averageLap: "2:35.234",
      position: 1,
      gap: "Leader",
      drs: true,
      ers: 87,
      fuel: 92,
      tyre: "SOFT",
      tyreAge: 12
    }
  });

  // Auto-update real-time data F1 Style
  useEffect(() => {
    const interval = setInterval(() => {
      setRealTimeData(prev => ({
        ...prev,
        revenue: prev.revenue + Math.floor(Math.random() * 5000),
        transactionsPerHour: Math.floor(Math.random() * 100) + 800,
        successRate: 98 + Math.random() * 1.5
      }));

      // Update F1 racing positions
      setRacingData(prev => ({
        ...prev,
        schools: prev.schools.map(school => ({
          ...school,
          revenue: school.revenue + Math.floor(Math.random() * 2000),
          growth: school.growth + (Math.random() - 0.5) * 0.5
        })),
        performance: {
          ...prev.performance,
          ers: Math.max(0, Math.min(100, prev.performance.ers + (Math.random() - 0.5) * 10)),
          fuel: Math.max(0, Math.min(100, prev.performance.fuel - Math.random() * 0.5))
        }
      }));
    }, 2000);

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
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* F1 Racing Header */}
        <div className="bg-gradient-to-r from-red-600 via-black to-red-600 text-white rounded-lg shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-3">
                <Trophy className="h-8 w-8 text-yellow-400" />
                <div>
                  <h1 className="text-3xl font-bold">F1 Racing Command Center</h1>
                  <p className="text-red-200 mt-1">EscuelaPay Championship - Live Telemetry</p>
                </div>
              </div>
              <div className="bg-black/30 rounded-lg p-4">
                <div className="text-center">
                  <div className="text-4xl font-mono font-bold text-green-400">P{racingData.performance.position}</div>
                  <div className="text-sm text-gray-300">Current Position</div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-red-200">
                  F1 Championship Dashboard
                </p>
                <p className="text-xs text-gray-300">
                  Live Telemetry - 2s refresh
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* F1 Navigation & Controls */}
        <div className="bg-gradient-to-r from-gray-800 to-gray-900 text-white rounded-lg shadow-lg p-4">
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button 
              onClick={() => window.location.href = '/super-admin-schools'}
              className="bg-blue-600 hover:bg-blue-700 border-2 border-blue-400 text-white font-bold"
            >
              <Flag className="h-4 w-4 mr-2" />
              Race Control
            </Button>
            <Button 
              onClick={() => window.location.href = '/platform-login'}
              className="bg-yellow-600 hover:bg-yellow-700 border-2 border-yellow-400 text-black font-bold"
            >
              <Award className="h-4 w-4 mr-2" />
              Pit Crew
            </Button>
            <Button 
              onClick={() => window.location.href = '/super-admin-classic'}
              className="bg-gray-600 hover:bg-gray-700 border-2 border-gray-400 text-white font-bold"
            >
              <Settings className="h-4 w-4 mr-2" />
              Classic Mode
            </Button>
            <div className="flex items-center space-x-4">
              <div className="bg-green-600 px-3 py-1 rounded-full text-sm font-bold">
                <Timer className="h-4 w-4 inline mr-1" />
                LIVE
              </div>
              <div className="bg-red-600 px-3 py-1 rounded-full text-sm font-bold">
                <Flame className="h-4 w-4 inline mr-1" />
                RACE MODE
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="racing-dashboard" className="w-full">
          <div className="bg-gradient-to-r from-black via-red-800 to-black rounded-lg shadow-lg p-4 mb-6">
            <TabsList className="grid grid-cols-4 w-full max-w-2xl mx-auto bg-black/50 border-2 border-red-500">
              <TabsTrigger value="racing-dashboard" className="text-sm font-bold text-white data-[state=active]:bg-red-600 data-[state=active]:text-white">
                <Trophy className="h-4 w-4 mr-2" />
                Racing Dashboard
              </TabsTrigger>
              <TabsTrigger value="championship" className="text-sm font-bold text-white data-[state=active]:bg-yellow-600 data-[state=active]:text-black">
                <Star className="h-4 w-4 mr-2" />
                Championship
              </TabsTrigger>
              <TabsTrigger value="telemetry" className="text-sm font-bold text-white data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <Gauge className="h-4 w-4 mr-2" />
                Telemetry
              </TabsTrigger>
              <TabsTrigger value="pit-stop" className="text-sm font-bold text-white data-[state=active]:bg-green-600 data-[state=active]:text-white">
                <Flag className="h-4 w-4 mr-2" />
                Pit Stop
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Racing Dashboard Tab */}
          <TabsContent value="racing-dashboard" className="space-y-8">
            {/* F1 Live Timing Display */}
            <div className="bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 text-white p-6 rounded-lg border-4 border-red-700 shadow-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-6">
                  <div className="bg-black/50 rounded-lg p-4">
                    <div className="text-center">
                      <div className="text-sm text-yellow-300">LAP TIME</div>
                      <div className="text-3xl font-mono font-bold text-green-400">{racingData.performance.currentLap}</div>
                      <div className="text-xs text-gray-300">Current</div>
                    </div>
                  </div>
                  <div className="bg-black/50 rounded-lg p-4">
                    <div className="text-center">
                      <div className="text-sm text-yellow-300">BEST LAP</div>
                      <div className="text-3xl font-mono font-bold text-purple-400">{racingData.performance.bestLap}</div>
                      <div className="text-xs text-gray-300">Personal</div>
                    </div>
                  </div>
                  <div className="bg-black/50 rounded-lg p-4">
                    <div className="text-center">
                      <div className="text-sm text-yellow-300">REVENUE</div>
                      <div className="text-3xl font-mono font-bold text-green-400">${realTimeData.revenue.toLocaleString()}</div>
                      <div className="text-xs text-gray-300">MXN Live</div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="bg-green-600 px-4 py-2 rounded-full">
                    <div className="text-2xl font-bold">P{racingData.performance.position}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold">POSITION</div>
                    <div className="text-sm text-yellow-300">{racingData.performance.gap}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* F1 Car Telemetry Dashboard */}
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
              {/* ERS & Power Unit */}
              <Card className="bg-gradient-to-br from-blue-900 to-purple-900 text-white border-2 border-blue-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-blue-300">
                    <Zap className="h-5 w-5" />
                    ERS & Power Unit
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>ERS Battery</span>
                      <span>{racingData.performance.ers}%</span>
                    </div>
                    <Progress value={racingData.performance.ers} className="h-3" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>Fuel Level</span>
                      <span>{racingData.performance.fuel}%</span>
                    </div>
                    <Progress value={racingData.performance.fuel} className="h-3" />
                  </div>
                  <div className="flex justify-between items-center bg-black/30 rounded p-3">
                    <span>Tyre Compound</span>
                    <Badge className="bg-red-600 text-white font-bold">{racingData.performance.tyre}</Badge>
                  </div>
                  <div className="flex justify-between items-center bg-black/30 rounded p-3">
                    <span>Tyre Age</span>
                    <span className="font-bold text-yellow-400">{racingData.performance.tyreAge} laps</span>
                  </div>
                </CardContent>
              </Card>

              {/* Sector Times */}
              <Card className="bg-gradient-to-br from-green-900 to-emerald-900 text-white border-2 border-green-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-300">
                    <Timer className="h-5 w-5" />
                    Sector Performance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {racingData.sectors.map((sector, index) => (
                    <div key={index} className="bg-black/30 rounded p-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">{sector.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold">{sector.time}</span>
                          <span className={`text-xs px-2 py-1 rounded ${
                            sector.improvement.startsWith('+') ? 'bg-red-600' : 'bg-green-600'
                          }`}>
                            {sector.improvement}
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-2 bg-gray-700 rounded">
                        <div 
                          className="h-full rounded" 
                          style={{
                            width: `${Math.random() * 100}%`,
                            backgroundColor: sector.color
                          }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Revenue Pie Chart */}
              <Card className="bg-gradient-to-br from-yellow-900 to-orange-900 text-white border-2 border-yellow-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-yellow-300">
                    <Target className="h-5 w-5" />
                    Revenue Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative w-48 h-48 mx-auto">
                    {/* Simple CSS Pie Chart */}
                    <div className="w-full h-full rounded-full bg-gradient-to-r from-red-500 via-blue-500 via-green-500 to-yellow-500 animate-spin-slow relative">
                      <div className="absolute inset-4 bg-black rounded-full flex items-center justify-center">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-yellow-400">$2.8M</div>
                          <div className="text-xs text-gray-300">Total Revenue</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-red-500 rounded"></div>
                      <span className="text-sm">Colegiaturas 42%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-blue-500 rounded"></div>
                      <span className="text-sm">Inscripciones 28%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-green-500 rounded"></div>
                      <span className="text-sm">Extraordinarios 20%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-yellow-500 rounded"></div>
                      <span className="text-sm">Otros 10%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* F1 Championship Standings Table */}
            <Card className="bg-gradient-to-br from-gray-900 to-black text-white border-2 border-red-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-400 text-xl">
                  <Trophy className="h-6 w-6" />
                  Championship Standings - Schools Leaderboard
                </CardTitle>
                <CardDescription className="text-gray-300">Live revenue racing - Updates every 2 seconds</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {racingData.schools.map((school, index) => (
                    <div 
                      key={index} 
                      className="flex items-center p-4 rounded-lg border-l-4 bg-gradient-to-r from-black/60 to-gray-800/60"
                      style={{ borderLeftColor: school.color }}
                    >
                      <div className="flex items-center space-x-4 flex-1">
                        <div 
                          className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl"
                          style={{ backgroundColor: school.color }}
                        >
                          {school.position}
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-lg">{school.name}</div>
                          <div className="text-sm text-gray-400">Revenue Champion</div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-xl font-bold text-green-400">
                            ${school.revenue.toLocaleString()}
                          </div>
                          <div className="text-sm text-gray-400">MXN</div>
                        </div>
                        <div className="text-right">
                          <div className={`font-bold ${school.growth > 10 ? 'text-green-400' : 'text-yellow-400'}`}>
                            +{school.growth.toFixed(1)}%
                          </div>
                          <div className="text-sm text-gray-400">Growth</div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-sm text-purple-400">{school.lap}</div>
                          <div className="text-xs text-gray-400">Gap</div>
                        </div>
                        <div className="text-center">
                          <Badge 
                            className="font-bold text-white"
                            style={{ backgroundColor: school.color }}
                          >
                            {school.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

            {/* Executive KPIs Grid */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
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
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
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

          {/* Championship Tab */}
          <TabsContent value="championship" className="space-y-8">
            {/* F1 Championship Podium */}
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
              <Card className="bg-gradient-to-br from-yellow-600 to-yellow-800 text-white border-4 border-yellow-400">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-center justify-center">
                    <Trophy className="h-8 w-8" />
                    1st Place - Gold
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <div className="text-4xl font-bold mb-2">{racingData.schools[0]?.name}</div>
                  <div className="text-2xl font-mono">${racingData.schools[0]?.revenue.toLocaleString()}</div>
                  <div className="text-lg mt-2">+{racingData.schools[0]?.growth.toFixed(1)}% Growth</div>
                  <div className="mt-4">
                    <Badge className="bg-yellow-500 text-black font-bold text-lg px-4 py-2">
                      CHAMPION
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-gray-400 to-gray-600 text-white border-4 border-gray-300">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-center justify-center">
                    <Star className="h-8 w-8" />
                    2nd Place - Silver
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <div className="text-3xl font-bold mb-2">{racingData.schools[1]?.name}</div>
                  <div className="text-xl font-mono">${racingData.schools[1]?.revenue.toLocaleString()}</div>
                  <div className="text-lg mt-2">+{racingData.schools[1]?.growth.toFixed(1)}% Growth</div>
                  <div className="mt-4">
                    <Badge className="bg-gray-400 text-black font-bold text-lg px-4 py-2">
                      RUNNER-UP
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-orange-600 to-orange-800 text-white border-4 border-orange-400">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-center justify-center">
                    <Award className="h-8 w-8" />
                    3rd Place - Bronze
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <div className="text-2xl font-bold mb-2">{racingData.schools[2]?.name}</div>
                  <div className="text-xl font-mono">${racingData.schools[2]?.revenue.toLocaleString()}</div>
                  <div className="text-lg mt-2">+{racingData.schools[2]?.growth.toFixed(1)}% Growth</div>
                  <div className="mt-4">
                    <Badge className="bg-orange-500 text-white font-bold text-lg px-4 py-2">
                      PODIUM
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Performance Charts */}
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
              <Card className="bg-gradient-to-br from-blue-900 to-purple-900 text-white border-2 border-blue-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-blue-300">
                    <BarChart3 className="h-6 w-6" />
                    Performance by Sector
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {racingData.sectors.map((sector, index) => (
                      <div key={index} className="space-y-2">
                        <div className="flex justify-between">
                          <span className="font-medium">{sector.name}</span>
                          <span className="font-mono">{sector.time}</span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-4">
                          <div 
                            className="h-4 rounded-full transition-all duration-1000"
                            style={{
                              width: `${85 + Math.random() * 15}%`,
                              backgroundColor: sector.color
                            }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-green-900 to-emerald-900 text-white border-2 border-green-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-300">
                    <Target className="h-6 w-6" />
                    Revenue Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <div className="w-24 h-24 mx-auto mb-2 rounded-full bg-gradient-to-r from-red-500 to-red-700 flex items-center justify-center">
                        <span className="text-xl font-bold">42%</span>
                      </div>
                      <div className="text-sm">Colegiaturas</div>
                    </div>
                    <div className="text-center">
                      <div className="w-24 h-24 mx-auto mb-2 rounded-full bg-gradient-to-r from-blue-500 to-blue-700 flex items-center justify-center">
                        <span className="text-xl font-bold">28%</span>
                      </div>
                      <div className="text-sm">Inscripciones</div>
                    </div>
                    <div className="text-center">
                      <div className="w-24 h-24 mx-auto mb-2 rounded-full bg-gradient-to-r from-green-500 to-green-700 flex items-center justify-center">
                        <span className="text-xl font-bold">20%</span>
                      </div>
                      <div className="text-sm">Extraordinarios</div>
                    </div>
                    <div className="text-center">
                      <div className="w-24 h-24 mx-auto mb-2 rounded-full bg-gradient-to-r from-yellow-500 to-yellow-700 flex items-center justify-center">
                        <span className="text-xl font-bold">10%</span>
                      </div>
                      <div className="text-sm">Otros</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Telemetry Tab */}
          <TabsContent value="telemetry" className="space-y-8">
            {/* Live Telemetry Dashboard */}
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-4">
              <Card className="bg-gradient-to-br from-red-900 to-red-700 text-white border-2 border-red-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-300">
                    <Gauge className="h-5 w-5" />
                    Speed
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <div className="text-4xl font-mono font-bold text-red-400">
                    {realTimeData.transactionsPerHour}
                  </div>
                  <div className="text-sm text-gray-300">Transactions/hour</div>
                  <Progress value={Math.min(100, (realTimeData.transactionsPerHour / 1000) * 100)} className="mt-4" />
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-blue-900 to-blue-700 text-white border-2 border-blue-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-blue-300">
                    <Zap className="h-5 w-5" />
                    Success Rate
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <div className="text-4xl font-mono font-bold text-blue-400">
                    {realTimeData.successRate.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-300">Payment Success</div>
                  <Progress value={realTimeData.successRate} className="mt-4" />
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-green-900 to-green-700 text-white border-2 border-green-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-300">
                    <Activity className="h-5 w-5" />
                    Uptime
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <div className="text-4xl font-mono font-bold text-green-400">
                    {realTimeData.uptime}%
                  </div>
                  <div className="text-sm text-gray-300">System Uptime</div>
                  <Progress value={realTimeData.uptime} className="mt-4" />
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-yellow-900 to-yellow-700 text-white border-2 border-yellow-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-yellow-300">
                    <AlertTriangle className="h-5 w-5" />
                    Risk Level
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <div className="text-4xl font-mono font-bold text-yellow-400">
                    {realTimeData.churnRisk.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-300">Churn Risk</div>
                  <Progress value={realTimeData.churnRisk * 10} className="mt-4" />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Pit Stop Tab */}
          <TabsContent value="pit-stop" className="space-y-8">
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
              <Card className="bg-gradient-to-br from-gray-800 to-gray-900 text-white border-2 border-gray-600">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-gray-300">
                    <Settings className="h-6 w-6" />
                    System Controls
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button 
                    onClick={() => window.location.href = '/super-admin-school-management'}
                    className="w-full bg-blue-600 hover:bg-blue-700 border-2 border-blue-400"
                  >
                    <Flag className="h-4 w-4 mr-2" />
                    Race Control Center
                  </Button>
                  <Button 
                    onClick={() => window.location.href = '/platform-login'}
                    className="w-full bg-yellow-600 hover:bg-yellow-700 border-2 border-yellow-400 text-black"
                  >
                    <Award className="h-4 w-4 mr-2" />
                    Pit Crew Access
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-green-800 to-green-900 text-white border-2 border-green-600">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-300">
                    <Gauge className="h-6 w-6" />
                    Performance Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Engine Status</span>
                    <Badge className="bg-green-600 text-white">OPTIMAL</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Safety Systems</span>
                    <Badge className="bg-green-600 text-white">ACTIVE</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Communications</span>
                    <Badge className="bg-green-600 text-white">ONLINE</Badge>
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