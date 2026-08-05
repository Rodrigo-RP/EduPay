import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useRoleBasedData } from "@/hooks/useRoleBasedData";
import { useInstitution } from "@/hooks/use-institution";
import { useLocation } from "wouter";
import { useEffect } from "react";
import {
  AlertTriangle, CheckCircle, DollarSign, TrendingUp, TrendingDown,
  Clock, XCircle, ArrowRight, RefreshCw, Users, Calendar,
  ShieldAlert, GraduationCap, Banknote,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface NivelRow {
  nivel: string;
  facturado: number;
  cobrado: number;
  vencido: number;
  alumnos: number;
  alumnos_adeudo: number;
}

interface DashboardData {
  ciclo: string;
  ciclo_metrics: {
    facturado: number;
    cobrado: number;
    por_cobrar: number;
    vencido: number;
    pct_cumplimiento: number;
    alumnos_activos: number;
    alumnos_al_corriente: number;
    alumnos_con_adeudo: number;
  };
  mes_metrics: {
    mes_nombre: string;
    esperado: number;
    cobrado: number;
    pendiente: number;
    eficiencia: number;
  };
  alertas: {
    excepciones_pendientes: number;
    vencen_semana: number;
    alumnos_riesgo: number;
  };
  desglose_nivel: NivelRow[];
}

interface Excepcion {
  id: number;
  fecha: string;
  descripcion: string;
  monto_centavos: number;
  tipo: string;
  referencia: string | null;
  clabe_ordenante: string | null;
  nombre_ordenante: string | null;
  estado_conciliacion: string;
  nota_conciliacion: string | null;
  dias_sin_conciliar: number;
}

interface ExcepcionesResponse {
  excepciones: Excepcion[];
  total_pendiente: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (cents: number) =>
  `$${(cents / 100).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const fmtFull = (cents: number) =>
  `$${(cents / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

const pct = (n: number) => `${n}%`;

const antiguedad = (dias: number) => {
  const d = Number(dias);
  if (d === 0) return "hoy";
  if (d === 1) return "hace 1 día";
  return `hace ${d} días`;
};

const severityClass = (dias: number) => {
  const d = Number(dias);
  if (d <= 3)  return { border: "border-yellow-200 bg-yellow-50/40", badge: "bg-yellow-100 text-yellow-800 border-0", dot: "bg-yellow-400" };
  if (d <= 14) return { border: "border-orange-200 bg-orange-50/40", badge: "bg-orange-100 text-orange-800 border-0", dot: "bg-orange-400" };
  return       { border: "border-red-200 bg-red-50/40",              badge: "bg-red-100 text-red-800 border-0",    dot: "bg-red-500"   };
};

const MOTIVOS_DESCARTE = [
  "Pago identificado manualmente",
  "Error del banco",
  "Duplicado confirmado",
  "Otro",
];

// ── Gauge de cumplimiento ─────────────────────────────────────────────────────
function CumplimientoGauge({ pct: value }: { pct: number }) {
  const color = value >= 80 ? "text-green-600" : value >= 60 ? "text-yellow-600" : "text-red-600";
  const bg    = value >= 80 ? "bg-green-100"   : value >= 60 ? "bg-yellow-100"   : "bg-red-100";
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${bg}`}>
      <span className={`text-sm font-bold ${color}`}>{value}%</span>
      <span className="text-xs text-slate-500">cumplimiento</span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { user }         = useAuth();
  const { userRole }     = useRoleBasedData();
  const { institutionName } = useInstitution();
  const [, setLocation]  = useLocation();
  const { toast }        = useToast();
  const queryClient      = useQueryClient();

  const campusId = (user as any)?.campus_id || 48;
  const token    = () => localStorage.getItem("auth_token");

  // ── Selector de nivel ─────────────────────────────────────────────────────
  const [nivelSel, setNivelSel] = useState<string>("General");

  // Role-based redirects
  useEffect(() => {
    if (user && userRole) {
      if (userRole === "admisiones") { setLocation("/dashboard-admisiones"); return; }
      if (userRole === "caja")       { setLocation("/dashboard-caja");        return; }
    }
  }, [user, userRole, setLocation]);

  // ── Dashboard query (incluye nivel como filtro) ───────────────────────────
  const { data, isLoading: dashLoading } = useQuery<DashboardData>({
    queryKey: [`/api/admin/dashboard/${campusId}`, nivelSel],
    queryFn: async () => {
      const params = nivelSel !== "General" ? `?nivel=${encodeURIComponent(nivelSel)}` : "";
      const res = await fetch(`/api/admin/dashboard/${campusId}${params}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error("Error al cargar dashboard");
      return res.json();
    },
    enabled: !!user,
  });

  // ── Excepciones query ─────────────────────────────────────────────────────
  const { data: excData, isLoading: excLoading, refetch: refetchExc } =
    useQuery<ExcepcionesResponse>({
      queryKey: ["/api/conciliacion/excepciones"],
      enabled: !!user,
      queryFn: async () => {
        const res = await fetch("/api/conciliacion/excepciones", {
          headers: { Authorization: `Bearer ${token()}` },
        });
        if (!res.ok) throw new Error("Error al cargar excepciones");
        return res.json();
      },
    });

  // ── Discard modal ─────────────────────────────────────────────────────────
  const [discardModal, setDiscardModal] = useState<{ open: boolean; exc: Excepcion | null }>({ open: false, exc: null });
  const [discardMotivo, setDiscardMotivo] = useState("");
  const [discardNota,   setDiscardNota]   = useState("");

  const closeDiscard = () => {
    setDiscardModal({ open: false, exc: null });
    setDiscardMotivo("");
    setDiscardNota("");
  };

  const discardMutation = useMutation({
    mutationFn: async ({ id, motivo, nota }: { id: number; motivo: string; nota: string }) => {
      const res = await fetch(`/api/conciliacion/excepciones/${id}/resolver`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ accion: "descartar", motivo, nota: nota || motivo }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Error"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Excepción descartada", description: "Registrado en el historial de auditoría." });
      closeDiscard();
      queryClient.invalidateQueries({ queryKey: ["/api/conciliacion/excepciones"] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/dashboard/${campusId}`] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Derived values ────────────────────────────────────────────────────────
  const cm      = data?.ciclo_metrics;
  const mm      = data?.mes_metrics;
  const al      = data?.alertas;
  const desglose = data?.desglose_nivel ?? [];
  const excCount = excData?.excepciones?.length ?? 0;

  // Niveles disponibles para el selector (vienen siempre del desglose General)
  const nivelesDisponibles = ["General", ...desglose.map(r => r.nivel)];

  // ── Skeleton helper ───────────────────────────────────────────────────────
  const Sk = ({ w = "w-20" }: { w?: string }) => (
    <span className={`inline-block ${w} h-5 bg-slate-200 animate-pulse rounded`} />
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{institutionName}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Panel de control · Ciclo{" "}
            <span className="font-semibold text-slate-700">{data?.ciclo ?? "…"}</span>
            {" · "}
            <span className="text-green-600 font-medium">Sistema activo</span>
          </p>
        </div>

        {/* Selector de nivel / sección */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {(dashLoading ? ["General"] : nivelesDisponibles).map(nivel => (
            <button
              key={nivel}
              onClick={() => setNivelSel(nivel)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                nivelSel === nivel
                  ? "bg-white shadow-sm text-slate-900"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {nivel}
            </button>
          ))}
        </div>
      </div>

      {/* ══ CAPA 1: SEMÁFORO DEL CICLO ══════════════════════════════════════ */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="w-4 h-4 text-slate-600" />
              Semáforo del ciclo
              {cm && <CumplimientoGauge pct={cm.pct_cumplimiento} />}
            </CardTitle>
            {nivelSel !== "General" && (
              <Badge variant="outline" className="text-slate-600">{nivelSel}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* KPI grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Facturado */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Facturado</p>
              <p className="text-xl font-bold text-slate-900">
                {dashLoading ? <Sk w="w-24" /> : fmt(cm?.facturado ?? 0)}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">total del ciclo</p>
            </div>

            {/* Cobrado */}
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <p className="text-[11px] font-semibold text-green-700 uppercase tracking-wide mb-1">Cobrado</p>
              <p className="text-xl font-bold text-green-800">
                {dashLoading ? <Sk w="w-24" /> : fmt(cm?.cobrado ?? 0)}
              </p>
              <p className="text-xs text-green-600 mt-0.5">
                {dashLoading ? "" : pct(cm?.pct_cumplimiento ?? 0)} del facturado
              </p>
            </div>

            {/* Por cobrar */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide mb-1">Por cobrar</p>
              <p className="text-xl font-bold text-blue-800">
                {dashLoading ? <Sk w="w-24" /> : fmt(cm?.por_cobrar ?? 0)}
              </p>
              <p className="text-xs text-blue-600 mt-0.5">vigente, no vencido</p>
            </div>

            {/* Vencido */}
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-[11px] font-semibold text-red-700 uppercase tracking-wide mb-1">Vencido</p>
              <p className="text-xl font-bold text-red-700">
                {dashLoading ? <Sk w="w-24" /> : fmt(cm?.vencido ?? 0)}
              </p>
              <p className="text-xs text-red-600 mt-0.5">cartera en riesgo</p>
            </div>
          </div>

          {/* Barra de alumnos */}
          <div className="flex items-center gap-4 flex-wrap text-sm">
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-500">Alumnos:</span>
              <span className="font-semibold text-slate-800">
                {dashLoading ? "…" : cm?.alumnos_activos ?? 0} activos
              </span>
            </div>
            <span className="text-slate-300">·</span>
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-green-500" />
              <span className="font-semibold text-green-700">
                {dashLoading ? "…" : cm?.alumnos_al_corriente ?? 0}
              </span>
              <span className="text-slate-500">al corriente</span>
            </div>
            <span className="text-slate-300">·</span>
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
              <span className="font-semibold text-red-700">
                {dashLoading ? "…" : cm?.alumnos_con_adeudo ?? 0}
              </span>
              <span className="text-slate-500">con adeudo</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ══ CAPA 2: PULSO DEL MES ════════════════════════════════════════════ */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="w-4 h-4 text-slate-600" />
            <span className="capitalize">
              {dashLoading ? "Pulso del mes" : `Pulso de ${mm?.mes_nombre ?? "este mes"}`}
            </span>
            {mm && !dashLoading && (
              <span className={`ml-1 text-xs font-normal px-2 py-0.5 rounded-full ${
                mm.eficiencia >= 80 ? "bg-green-100 text-green-700" :
                mm.eficiencia >= 50 ? "bg-yellow-100 text-yellow-700" :
                "bg-red-100 text-red-700"
              }`}>
                {mm.eficiencia}% eficiencia
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Esperado este mes</p>
              <p className="text-xl font-bold text-slate-900">
                {dashLoading ? <Sk w="w-24" /> : fmt(mm?.esperado ?? 0)}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">cargos con vcto. en el mes</p>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <p className="text-[11px] font-semibold text-green-700 uppercase tracking-wide mb-1">Cobrado este mes</p>
              <p className="text-xl font-bold text-green-800">
                {dashLoading ? <Sk w="w-24" /> : fmt(mm?.cobrado ?? 0)}
              </p>
              <p className="text-xs text-green-600 mt-0.5">pagos recibidos</p>
            </div>
            <div className={`rounded-lg border p-3 ${
              (mm?.pendiente ?? 0) > 0 ? "border-orange-200 bg-orange-50" : "border-slate-200 bg-slate-50"
            }`}>
              <p className={`text-[11px] font-semibold uppercase tracking-wide mb-1 ${
                (mm?.pendiente ?? 0) > 0 ? "text-orange-700" : "text-slate-500"
              }`}>Pendiente</p>
              <p className={`text-xl font-bold ${
                (mm?.pendiente ?? 0) > 0 ? "text-orange-800" : "text-slate-500"
              }`}>
                {dashLoading ? <Sk w="w-24" /> : fmt(mm?.pendiente ?? 0)}
              </p>
              <p className={`text-xs mt-0.5 ${
                (mm?.pendiente ?? 0) > 0 ? "text-orange-600" : "text-slate-400"
              }`}>por recuperar</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ══ CAPA 3: ALERTAS OPERATIVAS ═══════════════════════════════════════ */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="w-4 h-4 text-slate-600" />
            Alertas operativas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {/* Excepciones bancarias */}
            <button
              onClick={() => setLocation("/excepciones-conciliacion")}
              className={`rounded-lg border text-left p-3.5 transition-colors hover:border-red-300 ${
                (al?.excepciones_pendientes ?? 0) > 0
                  ? "border-red-200 bg-red-50"
                  : "border-slate-200 bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Banknote className={`w-4 h-4 ${(al?.excepciones_pendientes ?? 0) > 0 ? "text-red-500" : "text-slate-400"}`} />
                <span className={`text-xs font-semibold uppercase tracking-wide ${
                  (al?.excepciones_pendientes ?? 0) > 0 ? "text-red-700" : "text-slate-500"
                }`}>Sin conciliar</span>
              </div>
              <p className={`text-2xl font-bold ${
                (al?.excepciones_pendientes ?? 0) > 0 ? "text-red-700" : "text-slate-400"
              }`}>
                {dashLoading ? "…" : al?.excepciones_pendientes ?? 0}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {(al?.excepciones_pendientes ?? 0) === 0 ? "Todo conciliado ✓" : "transacciones → ver bandeja"}
              </p>
            </button>

            {/* Vencen esta semana */}
            <button
              onClick={() => setLocation("/cargos")}
              className={`rounded-lg border text-left p-3.5 transition-colors hover:border-yellow-300 ${
                (al?.vencen_semana ?? 0) > 0
                  ? "border-yellow-200 bg-yellow-50"
                  : "border-slate-200 bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Clock className={`w-4 h-4 ${(al?.vencen_semana ?? 0) > 0 ? "text-yellow-600" : "text-slate-400"}`} />
                <span className={`text-xs font-semibold uppercase tracking-wide ${
                  (al?.vencen_semana ?? 0) > 0 ? "text-yellow-700" : "text-slate-500"
                }`}>Vencen en 7 días</span>
              </div>
              <p className={`text-2xl font-bold ${
                (al?.vencen_semana ?? 0) > 0 ? "text-yellow-700" : "text-slate-400"
              }`}>
                {dashLoading ? "…" : al?.vencen_semana ?? 0}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {(al?.vencen_semana ?? 0) === 0 ? "Sin vencimientos próximos" : "cargos por cobrar"}
              </p>
            </button>

            {/* Alumnos en riesgo */}
            <button
              onClick={() => setLocation("/cuentas-por-cobrar")}
              className={`rounded-lg border text-left p-3.5 transition-colors hover:border-red-300 ${
                (al?.alumnos_riesgo ?? 0) > 0
                  ? "border-red-200 bg-red-50"
                  : "border-slate-200 bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className={`w-4 h-4 ${(al?.alumnos_riesgo ?? 0) > 0 ? "text-red-500" : "text-slate-400"}`} />
                <span className={`text-xs font-semibold uppercase tracking-wide ${
                  (al?.alumnos_riesgo ?? 0) > 0 ? "text-red-700" : "text-slate-500"
                }`}>Riesgo alto</span>
              </div>
              <p className={`text-2xl font-bold ${
                (al?.alumnos_riesgo ?? 0) > 0 ? "text-red-700" : "text-slate-400"
              }`}>
                {dashLoading ? "…" : al?.alumnos_riesgo ?? 0}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {(al?.alumnos_riesgo ?? 0) === 0 ? "Sin alumnos en riesgo ✓" : "alumnos +60 días vencidos"}
              </p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ══ DESGLOSE POR NIVEL (solo en vista General) ═══════════════════════ */}
      {nivelSel === "General" && desglose.length > 0 && (
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-4 h-4 text-slate-600" />
              Desglose por nivel — ciclo {data?.ciclo}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Nivel</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Facturado</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cobrado</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Vencido</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">% Cumpl.</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Alumnos</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide pr-4">Con adeudo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {desglose.map(row => {
                    const cumpl = row.facturado > 0
                      ? Math.round(row.cobrado / row.facturado * 100)
                      : 0;
                    return (
                      <tr
                        key={row.nivel}
                        className="hover:bg-slate-50/60 cursor-pointer"
                        onClick={() => setNivelSel(row.nivel)}
                      >
                        <td className="px-4 py-3">
                          <span className="font-medium text-slate-800">{row.nivel}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700">{fmt(row.facturado)}</td>
                        <td className="px-4 py-3 text-right font-mono text-green-700 font-medium">{fmt(row.cobrado)}</td>
                        <td className="px-4 py-3 text-right font-mono text-red-600">{fmt(row.vencido)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            cumpl >= 80 ? "bg-green-100 text-green-700" :
                            cumpl >= 60 ? "bg-yellow-100 text-yellow-700" :
                            "bg-red-100 text-red-700"
                          }`}>
                            {cumpl}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">{row.alumnos}</td>
                        <td className="px-4 py-3 text-right pr-4">
                          {row.alumnos_adeudo > 0
                            ? <span className="text-red-600 font-semibold">{row.alumnos_adeudo}</span>
                            : <span className="text-green-600">—</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Totales */}
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50/80 font-semibold">
                    <td className="px-4 py-3 text-slate-700">Total</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-900">{fmt(cm?.facturado ?? 0)}</td>
                    <td className="px-4 py-3 text-right font-mono text-green-800">{fmt(cm?.cobrado ?? 0)}</td>
                    <td className="px-4 py-3 text-right font-mono text-red-700">{fmt(cm?.vencido ?? 0)}</td>
                    <td className="px-4 py-3 text-right">
                      <CumplimientoGauge pct={cm?.pct_cumplimiento ?? 0} />
                    </td>
                    <td className="px-4 py-3 text-right text-slate-900">{cm?.alumnos_activos ?? 0}</td>
                    <td className="px-4 py-3 text-right pr-4 text-red-700">{cm?.alumnos_con_adeudo ?? 0}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-slate-400 px-4 py-2 border-t">
              Haz clic en un nivel para filtrar todas las métricas de arriba.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ══ BANDEJA DE EXCEPCIONES ════════════════════════════════════════════ */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Bandeja de excepciones
              {excCount > 0 && (
                <Badge className="ml-1 bg-red-500 text-white border-0 text-xs px-1.5">{excCount}</Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => refetchExc()} disabled={excLoading} className="text-slate-500">
                <RefreshCw className={`w-3.5 h-3.5 ${excLoading ? "animate-spin" : ""}`} />
              </Button>
              {excCount > 0 && (
                <Button variant="outline" size="sm" className="text-slate-600 text-xs"
                  onClick={() => setLocation("/excepciones-conciliacion")}>
                  Ver todas <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {excLoading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-slate-400" />
            </div>
          ) : excCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mb-3">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <p className="text-base font-semibold text-slate-700">Sin excepciones pendientes</p>
              <p className="text-sm text-slate-500 mt-1">Todos los pagos bancarios están conciliados.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(excData?.excepciones ?? []).slice(0, 8).map((exc) => {
                const sev = severityClass(exc.dias_sin_conciliar);
                return (
                  <div key={exc.id} className={`border rounded-lg p-3.5 flex items-center gap-4 ${sev.border}`}>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${sev.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800 text-sm">{fmtFull(Number(exc.monto_centavos))}</span>
                        <Badge className={`text-[10px] px-1.5 py-0 ${sev.badge}`}>{antiguedad(exc.dias_sin_conciliar)}</Badge>
                      </div>
                      <p className="text-sm text-slate-600 truncate mt-0.5">
                        {exc.nombre_ordenante
                          ? <><span className="font-medium">{exc.nombre_ordenante}</span> · {exc.descripcion || "Sin descripción"}</>
                          : (exc.descripcion || "Sin descripción")}
                      </p>
                      {exc.referencia && <p className="text-xs text-slate-400 mt-0.5">Ref: {exc.referencia}</p>}
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <Button size="sm" variant="outline"
                        className="text-blue-600 border-blue-200 hover:bg-blue-50 text-xs h-7 px-2"
                        onClick={() => setLocation("/excepciones-conciliacion")}>
                        <CheckCircle className="w-3.5 h-3.5 mr-1" />Aplicar
                      </Button>
                      <Button size="sm" variant="outline"
                        className="text-slate-600 border-slate-200 hover:bg-slate-50 text-xs h-7 px-2"
                        onClick={() => { setDiscardModal({ open: true, exc }); setDiscardMotivo(""); setDiscardNota(""); }}>
                        <XCircle className="w-3.5 h-3.5 mr-1" />Descartar
                      </Button>
                    </div>
                  </div>
                );
              })}
              {excCount > 8 && (
                <button onClick={() => setLocation("/excepciones-conciliacion")}
                  className="w-full text-center text-sm text-blue-600 hover:underline py-2">
                  Ver {excCount - 8} excepción{excCount - 8 !== 1 ? "es" : ""} más →
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Discard modal ───────────────────────────────────────────────────── */}
      <Dialog open={discardModal.open} onOpenChange={(open) => { if (!open) closeDiscard(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-slate-500" />
              Descartar excepción
            </DialogTitle>
            <DialogDescription>
              {discardModal.exc && (
                <>
                  Transacción de <strong>{fmtFull(Number(discardModal.exc.monto_centavos))}</strong>
                  {discardModal.exc.nombre_ordenante && <> · {discardModal.exc.nombre_ordenante}</>}
                  {" · "}{antiguedad(discardModal.exc.dias_sin_conciliar)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Motivo del descarte <span className="text-red-500">*</span></Label>
              <Select value={discardMotivo} onValueChange={setDiscardMotivo}>
                <SelectTrigger><SelectValue placeholder="Selecciona el motivo" /></SelectTrigger>
                <SelectContent>
                  {MOTIVOS_DESCARTE.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {discardMotivo === "Otro" && (
              <div className="space-y-2">
                <Label>Descripción <span className="text-red-500">*</span></Label>
                <Textarea rows={2} placeholder="Describe brevemente por qué se descarta…"
                  value={discardNota} onChange={(e) => setDiscardNota(e.target.value)} />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={closeDiscard}>Cancelar</Button>
              <Button
                className="bg-slate-700 hover:bg-slate-800"
                disabled={!discardMotivo || (discardMotivo === "Otro" && !discardNota.trim()) || discardMutation.isPending}
                onClick={() => {
                  if (!discardModal.exc) return;
                  discardMutation.mutate({ id: discardModal.exc.id, motivo: discardMotivo, nota: discardNota || discardMotivo });
                }}
              >
                {discardMutation.isPending
                  ? <><div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white mr-2" />Procesando…</>
                  : <><XCircle className="w-3.5 h-3.5 mr-1.5" />Confirmar descarte</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
