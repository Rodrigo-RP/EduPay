import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Gauge, Activity, Target } from "lucide-react";

export default function SuperAdminF1Simple() {
  const [realTimeData, setRealTimeData] = useState({
    revenue: 2847320,
    successRate: 98.7,
    schools: 18,
    efficiency: 96.8
  });

  const [schoolRankings] = useState([
    { name: "Instituto San Patricio", position: 1, revenue: 1245000, efficiency: "98.5%", color: "#FF1801" },
    { name: "Colegio Bilingüe Norte", position: 2, revenue: 987000, efficiency: "96.2%", color: "#FF8000" },
    { name: "Centro Educativo Sur", position: 3, revenue: 876000, efficiency: "94.7%", color: "#00A19B" },
    { name: "Academia del Valle", position: 4, revenue: 743000, efficiency: "92.1%", color: "#1E41FF" },
    { name: "Escuela Internacional", position: 5, revenue: 654000, efficiency: "89.3%", color: "#0090FF" }
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      setRealTimeData(prev => ({
        ...prev,
        revenue: prev.revenue + Math.floor(Math.random() * 5000),
        successRate: 98 + Math.random() * 1.5,
        efficiency: 95 + Math.random() * 5
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      {/* Header F1 Style */}
      <div className="mb-8">
        <div className="flex items-center justify-between bg-gradient-to-r from-red-600 to-red-800 p-6 rounded-lg border-2 border-yellow-400">
          <div className="flex items-center gap-4">
            <Trophy className="h-8 w-8 text-yellow-400" />
            <div>
              <h1 className="text-3xl font-bold text-yellow-400">CENTRO DE COMANDO EDUCATIVO</h1>
              <p className="text-red-200">EscuelaPay Rankings - Monitoreo en Vivo</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-red-200">POSICIÓN ACTUAL</div>
            <div className="text-4xl font-bold text-yellow-400">#1</div>
            <Badge className="bg-green-500 text-white">LIVE</Badge>
          </div>
        </div>
      </div>

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="bg-gradient-to-br from-red-900 to-red-700 text-white border-2 border-red-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-300">
              <Gauge className="h-5 w-5" />
              Revenue Total
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-4xl font-mono font-bold text-red-400">
              ${(realTimeData.revenue / 100).toLocaleString()}
            </div>
            <div className="text-sm text-gray-300">MXN</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-900 to-green-700 text-white border-2 border-green-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-300">
              <Activity className="h-5 w-5" />
              Eficiencia
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-4xl font-mono font-bold text-green-400">
              {realTimeData.efficiency.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-300">Operacional</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-900 to-blue-700 text-white border-2 border-blue-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-300">
              <Target className="h-5 w-5" />
              Escuelas Activas
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-4xl font-mono font-bold text-blue-400">
              {realTimeData.schools}
            </div>
            <div className="text-sm text-gray-300">Plataforma</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-900 to-yellow-700 text-white border-2 border-yellow-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-300">
              <Trophy className="h-5 w-5" />
              Tasa Éxito
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-4xl font-mono font-bold text-yellow-400">
              {realTimeData.successRate.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-300">Pagos</div>
          </CardContent>
        </Card>
      </div>

      {/* Championship Standings */}
      <Card className="bg-black border-2 border-yellow-400">
        <CardHeader>
          <CardTitle className="text-yellow-400 text-2xl">🏆 RANKINGS EDUCATIVOS - TEMPORADA 2025</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {schoolRankings.map((school, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border-l-4" style={{ borderLeftColor: school.color }}>
                <div className="flex items-center gap-4">
                  <div className="text-3xl font-bold" style={{ color: school.color }}>
                    #{school.position}
                  </div>
                  <div>
                    <div className="text-lg font-bold text-white">{school.name}</div>
                    <div className="text-sm text-gray-400">Eficiencia: {school.efficiency}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-mono text-green-400">
                    ${(school.revenue / 100).toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-400">Revenue</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Live Timing Display */}
      <div className="mt-8 bg-black rounded-lg p-6 border-2 border-green-500">
        <h3 className="text-xl font-bold text-green-400 mb-4">🔴 LIVE - Stream de Datos Educativos</h3>
        <div className="space-y-2 font-mono text-sm">
          <div className="text-green-400">[{new Date().toLocaleTimeString()}] Instituto San Patricio - Inscripción $4,500 - ✓ COMPLETADO</div>
          <div className="text-green-400">[{new Date().toLocaleTimeString()}] Colegio Bilingüe Norte - Colegiatura $3,200 - ✓ COMPLETADO</div>
          <div className="text-green-400">[{new Date().toLocaleTimeString()}] Centro Educativo Sur - Pago Extra $5,800 - ✓ COMPLETADO</div>
          <div className="text-yellow-400">[{new Date().toLocaleTimeString()}] Academia del Valle - Pago $2,900 - ⏳ PROCESANDO</div>
          <div className="text-green-400">[{new Date().toLocaleTimeString()}] Escuela Internacional - Beca $6,200 - ✓ APROBADO</div>
        </div>
      </div>
    </div>
  );
}