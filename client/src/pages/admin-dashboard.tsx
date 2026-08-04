import { useState, useEffect } from "react";
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
import {
  AlertTriangle, CheckCircle, DollarSign, TrendingUp,
  Clock, XCircle, ArrowRight, RefreshCw
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface KPIData {
  totalBilled: number;
  paymentRate: number;
  overdueRate: number;
  activeStudents: number;
  excepciones_pendientes?: number;
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
  `$${(cents / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

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

// ── Component ─────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { user } = useAuth();
  const { userRole } = useRoleBasedData();
  const { institutionName } = useInstitution();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const campusId = (user as any)?.campus_id || 48;
  const token = () => localStorage.getItem("auth_token");

  // Role-based redirects
  useEffect(() => {
    if (user && userRole) {
      if (userRole === "admisiones") { setLocation("/dashboard-admisiones"); return; }
      if (userRole === "caja")       { setLocation("/dashboard-caja");        return; }
    }
  }, [user, userRole, setLocation]);

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: kpiData } = useQuery<KPIData>({
    queryKey: [`/api/admin/dashboard/${campusId}`],
    enabled: !!user,
  });

  const { data: excData, isLoading: excLoading, refetch: refetchExc } = useQuery<ExcepcionesResponse>({
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

  // ── Discard modal state ───────────────────────────────────────────────────────
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

  // ── Derived KPIs ──────────────────────────────────────────────────────────────
  const totalBilled  = kpiData?.totalBilled  ?? 0;
  const paymentRate  = kpiData?.paymentRate  ?? 0;
  const overdueRate  = kpiData?.overdueRate  ?? 0;
  const cobrado      = Math.round(totalBilled * paymentRate / 100);
  const porCobrar    = Math.round(totalBilled * (100 - paymentRate) / 100);
  const vencido      = Math.round(totalBilled * overdueRate / 100);

  const excepciones  = excData?.excepciones ?? [];
  const totalExc     = excData?.total_pendiente ?? 0;

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Compact header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{institutionName}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Panel de control · <span className="text-green-600 font-medium">Sistema activo</span>
          </p>
        </div>
      </div>

      {/* ── Hero: Bandeja de Excepciones ─────────────────────────────────────── */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Bandeja de excepciones
              {totalExc > 0 && (
                <Badge className="ml-1 bg-red-500 text-white border-0 text-xs px-1.5">{totalExc}</Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => refetchExc()} disabled={excLoading} className="text-slate-500">
                <RefreshCw className={`w-3.5 h-3.5 ${excLoading ? "animate-spin" : ""}`} />
              </Button>
              {totalExc > 0 && (
                <Button variant="outline" size="sm" className="text-slate-600 text-xs" onClick={() => setLocation("/excepciones-conciliacion")}>
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
          ) : totalExc === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-9 h-9 text-green-500" />
              </div>
              <p className="text-lg font-semibold text-slate-700">Sin excepciones pendientes</p>
              <p className="text-sm text-slate-500 mt-1">
                Todo al corriente — todos los pagos bancarios están conciliados.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {excepciones.slice(0, 8).map((exc) => {
                const sev = severityClass(exc.dias_sin_conciliar);
                return (
                  <div key={exc.id} className={`border rounded-lg p-3.5 flex items-center gap-4 ${sev.border}`}>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${sev.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800 text-sm">{fmt(Number(exc.monto_centavos))}</span>
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
                      <Button size="sm" variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50 text-xs h-7 px-2"
                        onClick={() => setLocation("/excepciones-conciliacion")}>
                        <CheckCircle className="w-3.5 h-3.5 mr-1" />Aplicar
                      </Button>
                      <Button size="sm" variant="outline" className="text-slate-600 border-slate-200 hover:bg-slate-50 text-xs h-7 px-2"
                        onClick={() => { setDiscardModal({ open: true, exc }); setDiscardMotivo(""); setDiscardNota(""); }}>
                        <XCircle className="w-3.5 h-3.5 mr-1" />Descartar
                      </Button>
                    </div>
                  </div>
                );
              })}
              {totalExc > 8 && (
                <button onClick={() => setLocation("/excepciones-conciliacion")}
                  className="w-full text-center text-sm text-blue-600 hover:underline py-2">
                  Ver {totalExc - 8} excepción{totalExc - 8 !== 1 ? "es" : ""} más →
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Secondary KPI strip ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg"><DollarSign className="w-4 h-4 text-green-600" /></div>
              <div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Cobrado</p>
                <p className="text-xl font-bold text-slate-900">{fmt(cobrado)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg"><TrendingUp className="w-4 h-4 text-blue-600" /></div>
              <div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Por cobrar</p>
                <p className="text-xl font-bold text-slate-900">{fmt(porCobrar)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg"><Clock className="w-4 h-4 text-red-500" /></div>
              <div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Vencido</p>
                <p className="text-xl font-bold text-red-600">{fmt(vencido)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Discard modal ─────────────────────────────────────────────────────── */}
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
                  Transacción de <strong>{fmt(Number(discardModal.exc.monto_centavos))}</strong>
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
