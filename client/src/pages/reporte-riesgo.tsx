/**
 * RPT-08 — Reporte de Riesgo de Cobranza
 *
 * Reporte formal (server-side, exportable Excel/PDF) que complementa el
 * Semáforo de Riesgo operativo (/semaforo-riesgo).
 *
 * Guard: RECEIVABLES.READ (mismo que el semáforo).
 * Exportar: REPORTS.EXPORT.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle, CheckCircle, Clock,
  FileSpreadsheet, FileText, Users,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Configuración visual por semáforo ─────────────────────────────────────────

const CFG = {
  rojo: {
    label:      "Riesgo alto",
    dot:        "bg-red-500",
    card:       "border-red-300 bg-red-50",
    badge:      "bg-red-100 text-red-800 border-red-300",
    icon:       <AlertTriangle className="w-5 h-5 text-white" />,
    iconBg:     "bg-red-500",
    rowBg:      "bg-red-50",
    scoreColor: "text-red-600",
  },
  amarillo: {
    label:      "Riesgo moderado",
    dot:        "bg-amber-500",
    card:       "border-amber-300 bg-amber-50",
    badge:      "bg-amber-100 text-amber-800 border-amber-300",
    icon:       <Clock className="w-5 h-5 text-white" />,
    iconBg:     "bg-amber-500",
    rowBg:      "bg-amber-50",
    scoreColor: "text-amber-600",
  },
  verde: {
    label:      "Al corriente",
    dot:        "bg-green-500",
    card:       "border-green-300 bg-green-50",
    badge:      "bg-green-100 text-green-800 border-green-300",
    icon:       <CheckCircle className="w-5 h-5 text-white" />,
    iconBg:     "bg-green-500",
    rowBg:      "",
    scoreColor: "text-green-600",
  },
} as const;

// ── Helper: descarga blob ──────────────────────────────────────────────────────

function buildParams(ciclo: string, nivel: string, grado: string, grupo: string, semaforo: string) {
  const p: Record<string, string> = {};
  if (ciclo)    p.ciclo    = ciclo;
  if (nivel && nivel !== "todos")    p.nivel    = nivel;
  if (grado)    p.grado    = grado;
  if (grupo)    p.grupo    = grupo;
  if (semaforo && semaforo !== "todos") p.semaforo = semaforo;
  return p;
}

// ── Componente ─────────────────────────────────────────────────────────────────

export default function ReporteRiesgo() {
  const { user }     = useAuth();
  const { toast }    = useToast();
  const token        = localStorage.getItem("auth_token") ?? "";

  const [ciclo,    setCiclo]    = useState("");
  const [nivel,    setNivel]    = useState("todos");
  const [grado,    setGrado]    = useState("");
  const [grupo,    setGrupo]    = useState("");
  const [semaforo, setSemaforo] = useState("todos");

  // ── Query ──────────────────────────────────────────────────────────────────
  const params = buildParams(ciclo, nivel, grado, grupo, semaforo);
  const qs = new URLSearchParams(params).toString();

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/reportes/riesgo", params],
    queryFn: async () => {
      const r = await fetch(`/api/reportes/riesgo${qs ? `?${qs}` : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Error al cargar reporte de riesgo");
      return r.json();
    },
  });

  const resumen: any[] = data?.resumen ?? [];
  const detalle: any[] = data?.detalle ?? [];

  // ── Exportar ───────────────────────────────────────────────────────────────
  async function exportar(format: "excel" | "pdf") {
    try {
      const r = await fetch("/api/reportes/riesgo/exportar", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ formato: format, ...params }),
      });
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `reporte-riesgo.${format === "excel" ? "xlsx" : "pdf"}`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `Reporte de Riesgo exportado` });
    } catch {
      toast({ title: "Error al exportar", variant: "destructive" });
    }
  }

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* Encabezado */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            <span className="mr-2">🛡️</span>Reporte de Riesgo de Cobranza
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Scoring predictivo por alumno — exportable · {detalle.length} registros
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => exportar("excel")}>
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => exportar("pdf")}>
            <FileText className="w-4 h-4" /> PDF
          </Button>
        </div>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-3 gap-4">
        {(["rojo", "amarillo", "verde"] as const).map((color) => {
          const cfg  = CFG[color];
          const item = resumen.find((r: any) => r.semaforo === color) ?? { count_alumnos: 0, monto_centavos: 0 };
          return (
            <Card key={color} className={`border-2 ${cfg.card}`}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full ${cfg.iconBg} flex items-center justify-center`}>
                  {cfg.icon}
                </div>
                <div className="flex-1">
                  <p className="text-2xl font-bold text-slate-900">{item.count_alumnos}</p>
                  <p className="text-xs text-slate-500">{cfg.label}</p>
                  <p className="text-xs font-medium text-slate-700 mt-0.5">
                    ${((item.monto_centavos ?? 0) / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Input
          placeholder="Ciclo (ej. 2025-2026)"
          value={ciclo}
          onChange={(e) => setCiclo(e.target.value)}
        />
        <Select value={nivel} onValueChange={setNivel}>
          <SelectTrigger><SelectValue placeholder="Nivel educativo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los niveles</SelectItem>
            <SelectItem value="preescolar">Preescolar</SelectItem>
            <SelectItem value="primaria">Primaria</SelectItem>
            <SelectItem value="secundaria">Secundaria</SelectItem>
            <SelectItem value="preparatoria">Preparatoria</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Grado (ej. 1)"
          value={grado}
          onChange={(e) => setGrado(e.target.value)}
        />
        <Input
          placeholder="Grupo (ej. A)"
          value={grupo}
          onChange={(e) => setGrupo(e.target.value)}
        />
        <Select value={semaforo} onValueChange={setSemaforo}>
          <SelectTrigger><SelectValue placeholder="Semáforo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
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
      ) : detalle.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="font-medium">Sin alumnos con actividad de cobranza</p>
            <p className="text-xs mt-1">Ajusta los filtros o verifica que haya cargos registrados</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-slate-700">
              {detalle.length} alumno{detalle.length !== 1 ? "s" : ""} con actividad de cobranza
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left p-3 font-medium text-slate-600">Semáforo</th>
                    <th className="text-right p-3 font-medium text-slate-600">Score</th>
                    <th className="text-left p-3 font-medium text-slate-600">Alumno / Familia</th>
                    <th className="text-left p-3 font-medium text-slate-600">Nivel · Grado · Grupo</th>
                    <th className="text-right p-3 font-medium text-slate-600">Adeudo</th>
                    <th className="text-right p-3 font-medium text-slate-600">Días vencido</th>
                    <th className="text-left p-3 font-medium text-slate-600">Historial 6m</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.map((r: any) => {
                    const cfg = CFG[r.semaforo as keyof typeof CFG] ?? CFG.verde;
                    return (
                      <tr key={r.student_id} className={`border-b hover:bg-slate-50 ${cfg.rowBg}`}>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${cfg.dot}`} />
                            <Badge className={`text-xs border ${cfg.badge}`}>{cfg.label}</Badge>
                          </div>
                        </td>
                        <td className={`p-3 text-right font-bold text-lg ${cfg.scoreColor}`}>
                          {r.score}<span className="text-xs text-slate-400 font-normal">/100</span>
                        </td>
                        <td className="p-3">
                          <p className="font-medium text-slate-900">{r.estudiante}</p>
                          <p className="text-xs text-slate-500">{r.nombre_familia || "—"}</p>
                        </td>
                        <td className="p-3 text-slate-600 text-xs">
                          {r.nivel || "—"} · {r.grado || "—"} · {r.grupo || "—"}
                        </td>
                        <td className="p-3 text-right">
                          <p className={`font-bold ${r.adeudo_centavos > 0 ? "text-red-700" : "text-green-700"}`}>
                            ${((r.adeudo_centavos ?? 0) / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </p>
                        </td>
                        <td className="p-3 text-right">
                          <span className={`font-medium ${r.dias_vencido > 30 ? "text-red-600" : r.dias_vencido > 0 ? "text-amber-600" : "text-green-600"}`}>
                            {r.dias_vencido > 0 ? `${r.dias_vencido} días` : "Al día"}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Progress value={r.tasa_pago_historica ?? 0} className="h-1.5 w-20" />
                              <span className="text-xs text-slate-500">{r.tasa_pago_historica ?? 0}%</span>
                            </div>
                            <p className="text-xs text-slate-400">{r.historial_descripcion}</p>
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
