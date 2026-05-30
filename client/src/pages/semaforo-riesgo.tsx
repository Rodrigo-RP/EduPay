// Semáforo de Riesgo de Deuda — scoring predictivo por familia
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle, CheckCircle, Clock, Search,
  Download, Phone, Mail, TrendingUp, TrendingDown, Users, Filter
} from "lucide-react";

const RIESGO_CONFIG = {
  verde: { label: "Al corriente", color: "bg-green-100 text-green-800 border-green-300", dot: "bg-green-500", row: "" },
  amarillo: { label: "Riesgo moderado", color: "bg-amber-100 text-amber-800 border-amber-300", dot: "bg-amber-500", row: "bg-amber-50" },
  rojo: { label: "Riesgo alto", color: "bg-red-100 text-red-800 border-red-300", dot: "bg-red-500", row: "bg-red-50" },
};

export default function SemaforoRiesgo() {
  const { user } = useAuth();
  const campusId = user?.campus_id || 1;
  const [busqueda, setBusqueda] = useState("");
  const [filtroRiesgo, setFiltroRiesgo] = useState("todos");

  const { data: familias, isLoading } = useQuery<any[]>({
    queryKey: ["/api/riesgo/semaforo", campusId],
  });

  const filtered = (familias || []).filter(f => {
    const matchBusq = !busqueda || f.nombre_familia?.toLowerCase().includes(busqueda.toLowerCase()) || f.estudiante?.toLowerCase().includes(busqueda.toLowerCase());
    const matchRiesgo = filtroRiesgo === "todos" || f.semaforo === filtroRiesgo;
    return matchBusq && matchRiesgo;
  });

  const counts = {
    rojo: (familias || []).filter(f => f.semaforo === "rojo").length,
    amarillo: (familias || []).filter(f => f.semaforo === "amarillo").length,
    verde: (familias || []).filter(f => f.semaforo === "verde").length,
  };

  const exportarCSV = () => {
    const rows = [["Familia", "Estudiante", "Nivel", "Adeudo", "Días vencido", "Semáforo", "Historial pagos"]];
    filtered.forEach(f => rows.push([f.nombre_familia, f.estudiante, f.nivel, `$${(f.adeudo_centavos / 100).toFixed(2)}`, f.dias_vencido, f.semaforo, f.historial_descripcion]));
    const csv = rows.map(r => r.join(",")).join("\n");
    const a = document.createElement("a"); a.href = "data:text/csv," + encodeURIComponent(csv); a.download = "semaforo-riesgo.csv"; a.click();
  };

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Semáforo de Riesgo</h1>
          <p className="text-slate-500 text-sm mt-1">Scoring predictivo de deuda por familia — actualizado en tiempo real</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={exportarCSV}>
          <Download className="w-4 h-4" /> Exportar
        </Button>
      </div>

      {/* Resumen por color */}
      <div className="grid grid-cols-3 gap-4">
        {(["rojo", "amarillo", "verde"] as const).map(c => (
          <Card
            key={c}
            className={`border-2 cursor-pointer transition-all ${filtroRiesgo === c ? "ring-2 ring-offset-1 ring-slate-400" : ""} ${
              c === "rojo" ? "border-red-300" : c === "amarillo" ? "border-amber-300" : "border-green-300"
            }`}
            onClick={() => setFiltroRiesgo(filtroRiesgo === c ? "todos" : c)}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full ${RIESGO_CONFIG[c].dot} flex items-center justify-center`}>
                {c === "verde" ? <CheckCircle className="w-5 h-5 text-white" /> :
                 c === "amarillo" ? <Clock className="w-5 h-5 text-white" /> :
                 <AlertTriangle className="w-5 h-5 text-white" />}
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{counts[c]}</p>
                <p className="text-xs text-slate-500">{RIESGO_CONFIG[c].label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <Input placeholder="Buscar familia o estudiante..." className="pl-9" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
        <Select value={filtroRiesgo} onValueChange={setFiltroRiesgo}>
          <SelectTrigger className="w-48">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los niveles</SelectItem>
            <SelectItem value="rojo">🔴 Riesgo alto</SelectItem>
            <SelectItem value="amarillo">🟡 Riesgo moderado</SelectItem>
            <SelectItem value="verde">🟢 Al corriente</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p>No hay familias que mostrar con los filtros actuales</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left p-3 font-medium text-slate-600">Semáforo</th>
                    <th className="text-left p-3 font-medium text-slate-600">Familia / Estudiante</th>
                    <th className="text-left p-3 font-medium text-slate-600">Adeudo total</th>
                    <th className="text-left p-3 font-medium text-slate-600">Días vencido</th>
                    <th className="text-left p-3 font-medium text-slate-600">Historial de pago</th>
                    <th className="text-left p-3 font-medium text-slate-600">Score</th>
                    <th className="text-left p-3 font-medium text-slate-600">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((f: any, i: number) => {
                    const cfg = RIESGO_CONFIG[f.semaforo as keyof typeof RIESGO_CONFIG] || RIESGO_CONFIG.verde;
                    return (
                      <tr key={i} className={`border-b hover:bg-slate-50 ${cfg.row}`}>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${cfg.dot}`} />
                            <Badge className={`text-xs ${cfg.color} border`}>{cfg.label}</Badge>
                          </div>
                        </td>
                        <td className="p-3">
                          <p className="font-medium text-slate-900">{f.nombre_familia}</p>
                          <p className="text-slate-500 text-xs">{f.estudiante} • {f.nivel}</p>
                        </td>
                        <td className="p-3">
                          <p className={`font-bold ${f.adeudo_centavos > 0 ? "text-red-700" : "text-green-700"}`}>
                            ${((f.adeudo_centavos || 0) / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </p>
                        </td>
                        <td className="p-3">
                          <span className={`font-medium ${f.dias_vencido > 30 ? "text-red-600" : f.dias_vencido > 0 ? "text-amber-600" : "text-green-600"}`}>
                            {f.dias_vencido > 0 ? `${f.dias_vencido} días` : "Al día"}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Progress value={f.tasa_pago_historica || 0} className="h-1.5 w-20" />
                              <span className="text-xs text-slate-500">{f.tasa_pago_historica || 0}%</span>
                            </div>
                            <p className="text-xs text-slate-400">{f.historial_descripcion}</p>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            <div className={`text-lg font-bold ${f.score >= 80 ? "text-green-600" : f.score >= 50 ? "text-amber-600" : "text-red-600"}`}>
                              {f.score || 0}
                            </div>
                            <span className="text-xs text-slate-400">/100</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-7 px-2" title="Llamar">
                              <Phone className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 px-2" title="Enviar email">
                              <Mail className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
