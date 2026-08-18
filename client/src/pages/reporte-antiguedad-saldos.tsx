// Reporte de Antigüedad de Saldos (RPT-07) — cartera vencida por buckets
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useInstitution } from "@/hooks/use-institution";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Download, FileText, Clock, AlertTriangle } from "lucide-react";

// ── Configuración estática de los 6 buckets ───────────────────────────────────
const BUCKET_CONFIG: Record<string, {
  label: string;
  cardBg: string; cardBorder: string; cardText: string;
  badge: string;
}> = {
  al_corriente: {
    label: "Al corriente",
    cardBg: "bg-green-50",  cardBorder: "border-green-300",  cardText: "text-green-800",
    badge: "bg-green-100 text-green-800",
  },
  "1_30": {
    label: "1 – 30 días",
    cardBg: "bg-yellow-50", cardBorder: "border-yellow-300", cardText: "text-yellow-800",
    badge: "bg-yellow-100 text-yellow-800",
  },
  "31_60": {
    label: "31 – 60 días",
    cardBg: "bg-amber-50",  cardBorder: "border-amber-300",  cardText: "text-amber-800",
    badge: "bg-amber-100 text-amber-800",
  },
  "61_90": {
    label: "61 – 90 días",
    cardBg: "bg-orange-50", cardBorder: "border-orange-400", cardText: "text-orange-800",
    badge: "bg-orange-100 text-orange-800",
  },
  "91_120": {
    label: "91 – 120 días",
    cardBg: "bg-red-50",    cardBorder: "border-red-400",    cardText: "text-red-700",
    badge: "bg-red-100 text-red-700",
  },
  mas_120: {
    label: "Más de 120 días",
    cardBg: "bg-red-100",   cardBorder: "border-red-600",    cardText: "text-red-900",
    badge: "bg-red-200 text-red-900",
  },
};

const fmt = (centavos: number) =>
  `$${(centavos / 100).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// ── Componente principal ───────────────────────────────────────────────────────
export default function ReporteAntiguedadSaldos() {
  const { user }            = useAuth();
  const { institutionName } = useInstitution();
  const { toast }           = useToast();

  const [ciclo,    setCiclo]    = useState("");
  const [nivel,    setNivel]    = useState("todos");
  const [concepto, setConcepto] = useState("");
  const [exporting, setExporting] = useState(false);

  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;

  // Construir query string con los filtros activos
  const params = new URLSearchParams();
  if (ciclo)             params.set("ciclo",    ciclo);
  if (nivel !== "todos") params.set("nivel",    nivel);
  if (concepto)          params.set("concepto", concepto);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const { data, isLoading, error } = useQuery<any>({
    queryKey: [`/api/reportes/antiguedad-saldos${qs}`],
    enabled: !!token,
  });

  const buckets = (data?.buckets ?? []) as any[];
  const detalle = (data?.detalle ?? []) as any[];
  const total   = (data?.total_cartera_centavos ?? 0) as number;

  // ── Exportar ────────────────────────────────────────────────────────────────
  const exportar = async (formato: "excel" | "pdf") => {
    if (!token) return;
    setExporting(true);
    try {
      const r = await fetch("/api/reportes/antiguedad-saldos/exportar", {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${token}`,
        },
        body: JSON.stringify({
          formato,
          ciclo:    ciclo   || undefined,
          nivel:    nivel !== "todos" ? nivel : undefined,
          concepto: concepto || undefined,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = formato === "excel" ? "antiguedad-saldos.xlsx" : "antiguedad-saldos.pdf";
      a.click();
      URL.revokeObjectURL(url);
      toast({
        title:       "Reporte descargado",
        description: `antiguedad-saldos.${formato === "excel" ? "xlsx" : "pdf"}`,
      });
    } catch (e: any) {
      toast({ title: "Error al exportar", description: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-6 h-6 text-amber-600" />
            Antigüedad de Saldos
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Distribución de cartera vencida por tramos de días •{" "}
            {institutionName || "Campus"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => exportar("excel")} disabled={exporting}>
            <Download className="w-4 h-4" /> Excel
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => exportar("pdf")} disabled={exporting}>
            <FileText className="w-4 h-4" /> PDF
          </Button>
        </div>
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Ciclo escolar</Label>
              <Input
                placeholder="ej. 2025-2026"
                value={ciclo}
                onChange={e => setCiclo(e.target.value.trim())}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Nivel educativo</Label>
              <Select value={nivel} onValueChange={setNivel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los niveles</SelectItem>
                  <SelectItem value="preescolar">Preescolar</SelectItem>
                  <SelectItem value="kinder">Kinder</SelectItem>
                  <SelectItem value="primaria">Primaria</SelectItem>
                  <SelectItem value="secundaria">Secundaria</SelectItem>
                  <SelectItem value="preparatoria">Preparatoria</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">ID de concepto</Label>
              <Input
                placeholder="ej. 42"
                value={concepto}
                onChange={e => setConcepto(e.target.value.trim())}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Contenido principal ──────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-9 h-9 border-4 border-amber-500 border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-10 text-center text-red-700">
            <AlertTriangle className="w-8 h-8 mx-auto mb-3" />
            <p className="font-semibold">Sin acceso</p>
            <p className="text-sm mt-1 text-red-500">Tu rol no tiene permiso para ver este reporte.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Total de cartera */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {detalle.length} cargo{detalle.length !== 1 ? "s" : ""} pendiente{detalle.length !== 1 ? "s" : ""}
            </p>
            <p className="text-sm text-slate-500">
              Cartera total:{" "}
              <span className="font-bold text-slate-800 text-base">{fmt(total)}</span>
            </p>
          </div>

          {/* ── 6 tarjetas de buckets ────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {buckets.map((b: any) => {
              const cfg = BUCKET_CONFIG[b.key] ?? {
                label: b.key, cardBg: "bg-slate-50", cardBorder: "border-slate-200",
                cardText: "text-slate-800", badge: "bg-slate-100 text-slate-800",
              };
              return (
                <Card
                  key={b.key}
                  className={`border-2 ${cfg.cardBg} ${cfg.cardBorder} transition-shadow hover:shadow-md`}
                >
                  <CardContent className="p-4 text-center space-y-1.5">
                    <p className={`text-xs font-semibold leading-tight ${cfg.cardText}`}>
                      {cfg.label}
                    </p>
                    <p className={`text-xl font-bold ${cfg.cardText}`}>
                      {fmt(b.monto_centavos)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {b.count_alumnos} alumno{b.count_alumnos !== 1 ? "s" : ""}
                    </p>
                    <span
                      className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}
                    >
                      {b.porcentaje}%
                    </span>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* ── Tabla de detalle por alumno ──────────────────────────────────── */}
          {detalle.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Detalle por alumno — {detalle.length} cargo{detalle.length !== 1 ? "s" : ""} pendiente{detalle.length !== 1 ? "s" : ""}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b">
                      <tr>
                        {["Alumno", "Nivel", "Ciclo", "Concepto", "Vencimiento", "Días vencido", "Saldo", "Tramo"].map(h => (
                          <th key={h} className="text-left px-4 py-2.5 font-medium text-slate-500 text-xs">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detalle.map((row: any, i: number) => {
                        const cfg = BUCKET_CONFIG[row.bucket];
                        const diasVencido = Number(row.dias_vencido ?? 0);
                        return (
                          <tr key={i} className="border-b last:border-0 hover:bg-slate-50/60">
                            <td className="px-4 py-2.5 font-medium text-slate-800 whitespace-nowrap">
                              {row.alumno}
                            </td>
                            <td className="px-4 py-2.5 text-slate-600 capitalize">
                              {row.nivel}
                            </td>
                            <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                              {row.ciclo}
                            </td>
                            <td className="px-4 py-2.5 text-slate-600">
                              {row.concepto}
                            </td>
                            <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                              {row.fecha_vencimiento
                                ? new Date(row.fecha_vencimiento).toLocaleDateString("es-MX")
                                : "—"}
                            </td>
                            <td className="px-4 py-2.5">
                              {diasVencido === 0 ? (
                                <span className="text-green-700 font-medium text-xs">Al día</span>
                              ) : (
                                <span className={`font-medium text-xs ${
                                  diasVencido > 120 ? "text-red-900" :
                                  diasVencido > 90  ? "text-red-700"  :
                                  diasVencido > 60  ? "text-orange-700" :
                                  diasVencido > 30  ? "text-amber-700" :
                                  "text-yellow-700"
                                }`}>
                                  {diasVencido}d
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 font-semibold text-slate-800 whitespace-nowrap">
                              {fmt(Number(row.saldo_centavos ?? 0))}
                            </td>
                            <td className="px-4 py-2.5">
                              {cfg ? (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${cfg.badge}`}>
                                  {cfg.label}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400">{row.bucket}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-14 text-center text-slate-500">
                <Clock className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium text-slate-700">Sin cargos pendientes</p>
                <p className="text-sm mt-1">
                  Todos los saldos están al corriente con los filtros seleccionados.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
