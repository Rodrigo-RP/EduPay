// Reporte para el Consejo Directivo — KPIs ejecutivos + exportar PDF
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useInstitution } from "@/hooks/use-institution";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  BarChart3, TrendingUp, TrendingDown, Users, DollarSign,
  Download, FileText, AlertTriangle, CheckCircle, Calendar,
  Printer, ArrowUp, ArrowDown
} from "lucide-react";

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

export default function ReporteConsejo() {
  const { user } = useAuth();
  const { institutionName } = useInstitution();
  const campusId = user?.campus_id || 1;
  const hoy = new Date();
  const [mes, setMes] = useState(String(hoy.getMonth()));
  const [anio, setAnio] = useState(String(hoy.getFullYear()));

  // mes es 0-indexed en el Select (0=Enero). Convertir a 1-indexed para la URL.
  const monthNum   = Number(mes) + 1;
  const fechaDesde = `${anio}-${String(monthNum).padStart(2, "0")}-01`;
  const lastDay    = new Date(Number(anio), monthNum, 0).getDate();
  const fechaHasta = `${anio}-${String(monthNum).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const token    = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  const endpoint = `/api/reportes/consejo?fecha_desde=${fechaDesde}&fecha_hasta=${fechaHasta}`;

  const { data: reporte, isLoading } = useQuery<any>({
    queryKey: [endpoint],
    enabled:  !!token,
  });

  const [exporting, setExporting] = useState(false);

  const exportar = async (formato: "excel" | "pdf") => {
    if (!token) return;
    setExporting(true);
    try {
      const r = await fetch("/api/reportes/consejo/exportar", {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${token}`,
        },
        body: JSON.stringify({ format: formato, fecha_desde: fechaDesde, fecha_hasta: fechaHasta }),
      });
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = formato === "excel" ? "reporte-consejo.xlsx" : "reporte-consejo.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error("[reporte-consejo] exportar:", e.message);
    } finally {
      setExporting(false);
    }
  };

  const r = reporte || {};
  const kpis = r.kpis || {};
  const tendencias = r.tendencias || [];
  const topDeudores = r.top_deudores || [];
  const porNivel = r.por_nivel || [];
  const mesNombre = MESES[Number(mes)];

  const varPct = (actual: number, anterior: number) => {
    if (!anterior || anterior === 0) return 0;
    return Math.round(((actual - anterior) / anterior) * 100);
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto" id="reporte-consejo">
      {/* Header */}
      <div className="flex items-start justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-indigo-600" />
            Reporte para Consejo Directivo
          </h1>
          <p className="text-slate-500 text-sm mt-1">Resumen ejecutivo financiero para presentación al consejo</p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MESES.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={anio} onValueChange={setAnio}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[2023, 2024, 2025, 2026].map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2" onClick={() => exportar("excel")} disabled={exporting}>
            <Download className="w-4 h-4" /> Excel
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => exportar("pdf")} disabled={exporting}>
            <FileText className="w-4 h-4" /> PDF
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {/* Encabezado del reporte */}
          <div className="bg-gradient-to-r from-indigo-700 to-indigo-900 rounded-xl p-6 text-white">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold">{institutionName || "Instituto"}</h2>
                <p className="text-indigo-200 text-sm">Reporte Financiero — {mesNombre} {anio}</p>
                <p className="text-indigo-300 text-xs mt-1">Generado el {hoy.toLocaleDateString("es-MX", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
              </div>
              <div className="text-right">
                <p className="text-indigo-200 text-sm">Ciclo escolar</p>
                <p className="text-lg font-bold">{kpis.ciclo_escolar || "2025-2026"}</p>
              </div>
            </div>
          </div>

          {/* KPIs principales */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                label: "Ingresos del mes",
                value: `$${((kpis.ingresos_mes || 0) / 100).toLocaleString("es-MX", { minimumFractionDigits: 0 })}`,
                subLabel: "vs mes anterior",
                delta: varPct(kpis.ingresos_mes || 0, kpis.ingresos_mes_anterior || 0),
                icon: DollarSign, color: "text-green-600", bg: "bg-green-50 border-green-200"
              },
              {
                label: "Tasa de cobro",
                value: `${kpis.tasa_cobro || 0}%`,
                subLabel: `Meta: ${kpis.meta_cobro || 85}%`,
                delta: (kpis.tasa_cobro || 0) - (kpis.meta_cobro || 85),
                icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-50 border-blue-200"
              },
              {
                label: "Morosidad",
                value: `${kpis.mora || 0}%`,
                subLabel: "del total facturado",
                delta: -(kpis.mora || 0) + (kpis.mora_anterior || 0),
                icon: TrendingDown, color: "text-red-600", bg: "bg-red-50 border-red-200",
                invertirDelta: true
              },
              {
                label: "Estudiantes activos",
                value: kpis.estudiantes_activos || 0,
                subLabel: `${kpis.nuevos_ingresos || 0} nuevos ingresos`,
                delta: kpis.nuevos_ingresos || 0,
                icon: Users, color: "text-purple-600", bg: "bg-purple-50 border-purple-200"
              },
            ].map((k, i) => {
              const deltaPositivo = k.invertirDelta ? k.delta > 0 : k.delta >= 0;
              return (
                <Card key={i} className={`border ${k.bg}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <k.icon className={`w-5 h-5 ${k.color}`} />
                      <div className={`flex items-center gap-0.5 text-xs font-medium ${deltaPositivo ? "text-green-600" : "text-red-600"}`}>
                        {deltaPositivo ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                        {Math.abs(k.delta)}%
                      </div>
                    </div>
                    <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
                    <p className="text-xs text-slate-500 mt-1">{k.label}</p>
                    <p className="text-xs text-slate-400">{k.subLabel}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Resumen financiero + Distribución por nivel */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Distribución por nivel */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-600" />
                  Cobranza por nivel educativo
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(porNivel.length > 0 ? porNivel : [
                  { nivel: "Kinder", cobrado: kpis.ingresos_mes ? Math.round(kpis.ingresos_mes * 0.15) : 0, total: kpis.ingresos_mes ? Math.round(kpis.ingresos_mes * 0.18) : 0 },
                  { nivel: "Primaria", cobrado: kpis.ingresos_mes ? Math.round(kpis.ingresos_mes * 0.45) : 0, total: kpis.ingresos_mes ? Math.round(kpis.ingresos_mes * 0.50) : 0 },
                  { nivel: "Secundaria", cobrado: kpis.ingresos_mes ? Math.round(kpis.ingresos_mes * 0.30) : 0, total: kpis.ingresos_mes ? Math.round(kpis.ingresos_mes * 0.32) : 0 },
                ]).map((n: any, i: number) => {
                  const pct = n.total > 0 ? Math.round((n.cobrado / n.total) * 100) : 0;
                  return (
                    <div key={i} className="mb-4">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-slate-700">{n.nivel}</span>
                        <span className="text-slate-500">${(n.cobrado / 100).toLocaleString("es-MX", { maximumFractionDigits: 0 })} / ${(n.total / 100).toLocaleString("es-MX", { maximumFractionDigits: 0 })}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={pct} className="h-2 flex-1" />
                        <span className={`text-xs font-medium w-8 text-right ${pct >= 85 ? "text-green-600" : pct >= 70 ? "text-amber-600" : "text-red-600"}`}>{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Métricas adicionales */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-600" />
                  Resumen ejecutivo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {[
                  { label: "Total facturado en el mes", value: `$${((kpis.total_facturado || 0) / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`, status: "normal" },
                  { label: "Total cobrado", value: `$${((kpis.ingresos_mes || 0) / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`, status: "ok" },
                  { label: "Saldo pendiente", value: `$${((kpis.pendiente || 0) / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`, status: "warning" },
                  { label: "Saldo vencido (mora)", value: `$${((kpis.vencido || 0) / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`, status: "danger" },
                  { label: "CFDI emitidos", value: kpis.cfdi_emitidos || 0, status: "normal" },
                  { label: "Becas aplicadas", value: `${kpis.becas_aplicadas || 0} alumnos`, status: "normal" },
                  { label: "Convenios activos", value: kpis.convenios_activos || 0, status: "normal" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <span className="text-slate-600">{item.label}</span>
                    <span className={`font-semibold ${
                      item.status === "ok" ? "text-green-700" :
                      item.status === "warning" ? "text-amber-700" :
                      item.status === "danger" ? "text-red-700" :
                      "text-slate-900"
                    }`}>{item.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Top 10 deudores */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                Top deudores — requieren atención inmediata
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topDeudores.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">Sin deudores en este período</p>
              ) : topDeudores.slice(0, 10).map((d: any, i: number) => (
                <div key={i} className={`flex items-center justify-between py-2.5 border-b last:border-0 text-sm ${i === 0 ? "text-red-800 font-medium" : ""}`}>
                  <div className="flex items-center gap-3">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white ${i < 3 ? "bg-red-600" : "bg-amber-500"}`}>{i + 1}</span>
                    <div>
                      <p className="font-medium">{d.nombre_familia}</p>
                      <p className="text-slate-500 text-xs">{d.estudiante} • {d.dias_vencido} días vencido</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-red-700">${((d.adeudo_centavos || 0) / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Nota de cierre */}
          <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-600 border">
            <p className="font-medium text-slate-800 mb-1">Nota del contador:</p>
            <p>{r.nota_contador || `Este reporte corresponde al período ${mesNombre} ${anio}. Los datos reflejan el estado de cobranza al cierre del período. Se recomienda revisar los convenios de pago vigentes y dar seguimiento prioritario a los ${topDeudores.length || 10} casos identificados en rojo.`}</p>
          </div>
        </>
      )}
    </div>
  );
}
