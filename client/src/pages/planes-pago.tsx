// Planes de Pago Negociados — convenios para familias con adeudos (ADR-002)
// Las cuotas son charges reales (plan_id FK). El pago usa /api/admin/charges/:id/pagar-manual.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Plus, HandshakeIcon, CheckCircle, Clock, AlertTriangle,
  ChevronDown, ChevronUp, DollarSign, User, Calendar
} from "lucide-react";

const ESTADO_PLAN = {
  activo:     { label: "Activo",      color: "bg-blue-100 text-blue-800"  },
  completado: { label: "Completado",  color: "bg-green-100 text-green-800" },
  incumplido: { label: "Incumplido",  color: "bg-red-100 text-red-800"    },
  cancelado:  { label: "Cancelado",   color: "bg-slate-100 text-slate-600" },
};

export default function PlanesPago() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const campusId = user?.campus_id || 1;
  const [showModal, setShowModal] = useState(false);
  const [expandedPlan, setExpandedPlan] = useState<number | null>(null);
  const [planParaCancelar, setPlanParaCancelar] = useState<any | null>(null);
  const [destinoCancelacion, setDestinoCancelacion] = useState<"condonar" | "reinstalar">("condonar");
  const [motivoCancelacion, setMotivoCancelacion] = useState("");
  const [motivoCondonacion, setMotivoCondonacion] = useState("");
  const [bloqueoOverride, setBloqueoOverride] = useState<string | null>(null);
  const [overridePendiente, setOverridePendiente] = useState<{
    planId: number;
    alertaId: number;
    cancelacion: Record<string, string>;
  } | null>(null);
  const [motivoOverride, setMotivoOverride] = useState("");

  const [form, setForm] = useState({
    student_id:             "",
    concept_id:             "",   // ADR-002 Modo B — el monto viene del concepto
    monto_inicial_centavos: "0",
    numero_pagos:           "4",
    frecuencia:             "mensual",
    fecha_inicio:           new Date().toISOString().split("T")[0],
    observaciones:          "",
  });

  // ── Datos remotos ─────────────────────────────────────────────────────────
  const { data: planes, isLoading } = useQuery<any[]>({
    queryKey: ["/api/planes-pago", campusId],
  });

  const { data: estudiantes } = useQuery<any[]>({
    queryKey: ["/api/admin/students", campusId],
  });

  // Conceptos del campus (excluye cuota_plan sentinel para evitar ciclos)
  const { data: conceptos } = useQuery<any[]>({
    queryKey: ["/api/admin/concepts", campusId],
    queryFn: () => apiRequest(`/api/admin/concepts/${campusId}`).then(r => r.json ? r.json() : r),
    select: (data: any[]) => data.filter((c: any) => c.tipo !== "cuota_plan"),
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const crearPlan = useMutation({
    mutationFn: (data: any) => apiRequest("/api/planes-pago", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      toast({ title: "Plan de pago creado", description: "El convenio se generó con sus cuotas automáticamente" });
      setShowModal(false);
      setForm(f => ({ ...f, concept_id: "", student_id: "" }));
      queryClient.invalidateQueries({ queryKey: ["/api/planes-pago"] });
    },
    onError: (err: any) => toast({ title: "Error al crear plan", description: String(err?.message || ""), variant: "destructive" }),
  });

  // ADR-002: las cuotas son charges reales → pagar con endpoint admin
  const marcarCuota = useMutation({
    mutationFn: ({ cuotaId }: { cuotaId: number }) =>
      apiRequest(`/api/admin/charges/${cuotaId}/pagar-manual`, { method: "POST", body: JSON.stringify({ metodo: "efectivo" }) }),
    onSuccess: () => {
      toast({ title: "Cuota registrada como pagada" });
      queryClient.invalidateQueries({ queryKey: ["/api/planes-pago"] });
    },
    onError: () => toast({ title: "Error al registrar el pago", variant: "destructive" }),
  });

  const requestJson = async (url: string, method: "PATCH" | "POST", body: Record<string, string>) => {
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(localStorage.getItem("auth_token") ? { Authorization: `Bearer ${localStorage.getItem("auth_token")}` } : {}),
      },
      body: JSON.stringify(body),
      credentials: "include",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || `Error ${response.status}`);
      Object.assign(error, { status: response.status, data });
      throw error;
    }
    return data;
  };

  const resetCancelar = () => {
    setPlanParaCancelar(null);
    setDestinoCancelacion("condonar");
    setMotivoCancelacion("");
    setMotivoCondonacion("");
    setBloqueoOverride(null);
  };

  const cancelarPlan = useMutation({
    mutationFn: ({ planId, body }: { planId: number; body: Record<string, string> }) =>
      requestJson(`/api/planes-pago/${planId}/cancelar`, "PATCH", body),
    onSuccess: (_data, variables) => {
      toast({
        title: variables.body.destino_saldo_pendiente === "condonar" ? "Saldo condonado" : "Saldo reinstalado",
        description: variables.body.destino_saldo_pendiente === "condonar"
          ? "El plan y sus cuotas pendientes fueron cancelados."
          : "El plan fue cancelado y el saldo pendiente se registró de nuevo.",
      });
      resetCancelar();
      setOverridePendiente(null);
      setMotivoOverride("");
      queryClient.invalidateQueries({ queryKey: ["/api/planes-pago"] });
    },
    onError: (error: any, variables) => {
      const data = error?.data;
      if (error?.status === 409 && data?.requiere_override) {
        const message =
          "Esta condonación requiere autorización adicional porque existe una condonación reciente para este alumno o un hermano.";
        if (["administrador_general", "super_admin"].includes(user?.role || "") && Number.isFinite(Number(data.alerta_id))) {
          setOverridePendiente({ planId: variables.planId, alertaId: Number(data.alerta_id), cancelacion: variables.body });
          setMotivoOverride("");
          setBloqueoOverride(null);
        } else {
          setBloqueoOverride(
            `${message} Solicita a un administrador general o super administrador que la autorice.`,
          );
        }
        return;
      }
      toast({ title: "No se pudo cancelar el plan", description: error?.message || "Intenta nuevamente.", variant: "destructive" });
    },
  });

  const autorizarYCondonar = useMutation({
    mutationFn: async () => {
      if (!overridePendiente) throw new Error("No hay una autorización pendiente.");
      const tokenResult = await requestJson(
        `/api/admin/alertas/condonaciones/${overridePendiente.planId}/override-token`,
        "POST",
        { motivo: motivoOverride.trim(), alerta_id: String(overridePendiente.alertaId) },
      );
      if (!tokenResult.token) throw new Error("No se recibió el token de autorización.");
      return requestJson(
        `/api/planes-pago/${overridePendiente.planId}/cancelar`,
        "PATCH",
        { ...overridePendiente.cancelacion, override_token: tokenResult.token },
      );
    },
    onSuccess: () => {
      toast({ title: "Condonación autorizada y aplicada", description: "La autorización quedó registrada en el historial." });
      resetCancelar();
      setOverridePendiente(null);
      setMotivoOverride("");
      queryClient.invalidateQueries({ queryKey: ["/api/planes-pago"] });
    },
    onError: (error: any) => {
      toast({ title: "No se pudo autorizar la condonación", description: error?.message || "Intenta nuevamente.", variant: "destructive" });
    },
  });

  const enviarCancelacion = () => {
    if (!planParaCancelar) return;
    const body: Record<string, string> = {
      motivo: motivoCancelacion.trim(),
      destino_saldo_pendiente: destinoCancelacion,
    };
    if (destinoCancelacion === "condonar") body.motivo_condonacion = motivoCondonacion.trim();
    cancelarPlan.mutate({ planId: planParaCancelar.id, body });
  };

  // ── Cálculo del preview ───────────────────────────────────────────────────
  const selectedConcept = (conceptos || []).find((c: any) => String(c.id) === form.concept_id);
  const totalAdeudoCentavos = selectedConcept ? Number(selectedConcept.monto_centavos) : 0;
  const engancheCentavos = Number(form.monto_inicial_centavos) * 100 || 0;
  const baseCuotas = totalAdeudoCentavos - engancheCentavos;
  const cuotaCalculada = form.numero_pagos && baseCuotas > 0
    ? (baseCuotas / Number(form.numero_pagos) / 100).toFixed(2)
    : "0.00";

  const resumen = {
    total:       (planes || []).length,
    activos:     (planes || []).filter(p => p.estado === "activo").length,
    completados: (planes || []).filter(p => p.estado === "completado").length,
    incumplidos: (planes || []).filter(p => p.estado === "incumplido").length,
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <HandshakeIcon className="w-6 h-6 text-amber-600" />
            Planes de Pago
          </h1>
          <p className="text-slate-500 text-sm mt-1">Convenios de pago en parcialidades para familias con adeudos</p>
        </div>

        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-amber-600 hover:bg-amber-700">
              <Plus className="w-4 h-4" /> Nuevo convenio
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Crear convenio de pago</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">

              {/* Alumno */}
              <div>
                <Label>Estudiante</Label>
                <Select value={form.student_id} onValueChange={v => setForm(f => ({ ...f, student_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar alumno..." /></SelectTrigger>
                  <SelectContent>
                    {(estudiantes || []).map((e: any) => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {e.nombre_completo || `${e.nombres} ${e.apellido_paterno}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Concepto — define el monto total (Modo B ADR-002) */}
              <div>
                <Label>Concepto del convenio</Label>
                <Select value={form.concept_id} onValueChange={v => setForm(f => ({ ...f, concept_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar concepto..." /></SelectTrigger>
                  <SelectContent>
                    {(conceptos || []).map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.nombre} — ${(Number(c.monto_centavos) / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Enganche inicial ($)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={form.monto_inicial_centavos}
                    onChange={e => setForm(f => ({ ...f, monto_inicial_centavos: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Frecuencia</Label>
                  <Select value={form.frecuencia} onValueChange={v => setForm(f => ({ ...f, frecuencia: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="semanal">Semanal</SelectItem>
                      <SelectItem value="quincenal">Quincenal</SelectItem>
                      <SelectItem value="mensual">Mensual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Número de cuotas</Label>
                  <Select value={form.numero_pagos} onValueChange={v => setForm(f => ({ ...f, numero_pagos: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[2, 3, 4, 6, 8, 10, 12].map(n => (
                        <SelectItem key={n} value={String(n)}>{n} cuotas</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Fecha inicio</Label>
                  <Input
                    type="date"
                    value={form.fecha_inicio}
                    onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))}
                  />
                </div>
              </div>

              {/* Preview cuando se seleccionó concepto */}
              {selectedConcept && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                  <p className="font-semibold text-amber-800 mb-1">Resumen del convenio:</p>
                  <div className="grid grid-cols-2 gap-1 text-amber-700">
                    <span>Concepto:</span>
                    <span className="font-medium">{selectedConcept.nombre}</span>
                    <span>Total convenio:</span>
                    <span className="font-medium">${(totalAdeudoCentavos / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
                    <span>Enganche:</span>
                    <span className="font-medium">${(engancheCentavos / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
                    <span>Cuota {form.frecuencia}:</span>
                    <span className="font-bold text-amber-900">${Number(cuotaCalculada).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
                    <span>Total cuotas:</span>
                    <span className="font-medium">{form.numero_pagos}</span>
                  </div>
                </div>
              )}

              <div>
                <Label>Observaciones</Label>
                <Textarea
                  placeholder="Notas del convenio, compromisos adicionales..."
                  rows={2}
                  value={form.observaciones}
                  onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))}
                />
              </div>

              <Button
                className="w-full bg-amber-600 hover:bg-amber-700"
                disabled={!form.student_id || !form.concept_id || crearPlan.isPending}
                onClick={() =>
                  crearPlan.mutate({
                    concept_id:             Number(form.concept_id),
                    student_id:             form.student_id,
                    monto_inicial_centavos: Number(form.monto_inicial_centavos || 0) * 100,
                    numero_pagos:           Number(form.numero_pagos),
                    frecuencia:             form.frecuencia,
                    fecha_inicio:           form.fecha_inicio,
                    observaciones:          form.observaciones || undefined,
                  })
                }
              >
                {crearPlan.isPending ? "Creando..." : "Crear convenio y generar cuotas"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total convenios", value: resumen.total,       icon: HandshakeIcon, color: "text-slate-700" },
          { label: "Activos",         value: resumen.activos,     icon: Clock,         color: "text-blue-600"  },
          { label: "Completados",     value: resumen.completados, icon: CheckCircle,   color: "text-green-600" },
          { label: "Incumplidos",     value: resumen.incumplidos, icon: AlertTriangle, color: "text-red-600"   },
        ].map((k, i) => (
          <Card key={i}>
            <CardContent className="p-4 flex items-center gap-3">
              <k.icon className={`w-6 h-6 ${k.color}`} />
              <div>
                <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
                <p className="text-xs text-slate-500">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Lista de planes */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full" />
        </div>
      ) : (planes || []).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            <HandshakeIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No hay convenios registrados</p>
            <p className="text-sm">Crea el primer convenio con el botón de arriba</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(planes || []).map((plan: any) => {
            // Las cuotas son charges (monto_base_centavos), no installments (monto_centavos)
            const cuotas = plan.installments || [];
            const cuotasPagadas  = cuotas.filter((c: any) => c.estado === "pagado").length;
            const totalCuotas    = plan.numero_pagos;
            const progreso       = totalCuotas > 0 ? Math.round((cuotasPagadas / totalCuotas) * 100) : 0;
            const cfg = ESTADO_PLAN[plan.estado as keyof typeof ESTADO_PLAN] || ESTADO_PLAN.activo;
            const isExpanded = expandedPlan === plan.id;

            return (
              <Card key={plan.id} className={plan.estado === "incumplido" ? "border-red-200" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-slate-400" />
                          <span className="font-semibold text-slate-900">
                            {plan.student_nombre || `Estudiante #${plan.student_id}`}
                          </span>
                        </div>
                        <Badge className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
                        {plan.tipo_origen === "reestructuracion" && (
                          <Badge className="text-xs bg-orange-100 text-orange-700">Reestructuración</Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                        <div>
                          <p className="text-slate-500 text-xs">Total convenio</p>
                          <p className="font-bold text-slate-900">
                            ${((plan.total_adeudo_centavos || 0) / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs">Cuota {plan.frecuencia}</p>
                          <p className="font-semibold text-slate-700">
                            ${((plan.cuota_centavos || 0) / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs">Avance</p>
                          <p className="font-semibold text-blue-700">{cuotasPagadas}/{totalCuotas} cuotas</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={progreso} className="h-2 flex-1" />
                        <span className="text-xs text-slate-500 w-8">{progreso}%</span>
                      </div>
                    </div>
                     <div className="flex items-center gap-1 ml-2">
                       {plan.estado === "activo" && plan.tipo_origen === "reestructuracion" && (
                         <Button
                           size="sm"
                           variant="outline"
                           className="border-orange-300 text-orange-800 hover:bg-orange-50"
                           data-plan-id={plan.id}
                           onClick={() => {
                             setPlanParaCancelar(plan);
                             setDestinoCancelacion("condonar");
                             setMotivoCancelacion("");
                             setMotivoCondonacion("");
                             setBloqueoOverride(null);
                           }}
                         >
                           Cancelar reestructuración
                         </Button>
                       )}
                       <Button
                         variant="ghost"
                         size="sm"
                         onClick={() => setExpandedPlan(isExpanded ? null : plan.id)}
                       >
                         {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                       </Button>
                     </div>
                  </div>

                  {/* Cuotas expandidas — son charges reales */}
                  {isExpanded && (
                    <div className="mt-4 border-t pt-4">
                      <p className="text-sm font-semibold text-slate-700 mb-3">
                        Cuotas del convenio
                      </p>
                      {cuotas.length === 0 ? (
                        <p className="text-sm text-slate-400 italic">Sin cuotas registradas</p>
                      ) : (
                        <div className="space-y-2">
                          {cuotas.map((cuota: any, idx: number) => {
                            // Los charges usan monto_base_centavos, fecha_vencimiento, estado
                            const monto   = Number(cuota.monto_base_centavos || cuota.monto_centavos || 0);
                            const vencida = cuota.fecha_vencimiento &&
                              new Date(cuota.fecha_vencimiento) < new Date() &&
                              cuota.estado === "pendiente";

                            return (
                              <div
                                key={cuota.id}
                                className={`flex items-center justify-between p-2 rounded border text-sm ${
                                  cuota.estado === "pagado"
                                    ? "bg-green-50 border-green-200"
                                    : vencida
                                    ? "bg-red-50 border-red-200"
                                    : "bg-slate-50 border-slate-200"
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <span className="font-medium w-6 text-slate-500">{idx + 1}</span>
                                  <div>
                                    <p className="font-medium">
                                      ${(monto / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                                    </p>
                                    {cuota.fecha_vencimiento && (
                                      <p className="text-xs text-slate-500 flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        Vence: {new Date(cuota.fecha_vencimiento).toLocaleDateString("es-MX")}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {cuota.estado === "pagado" ? (
                                    <Badge className="bg-green-100 text-green-800 text-xs">
                                      <CheckCircle className="w-3 h-3 mr-1" /> Pagado
                                    </Badge>
                                  ) : vencida ? (
                                    <Badge className="bg-red-100 text-red-800 text-xs">
                                      <AlertTriangle className="w-3 h-3 mr-1" /> Vencida
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-slate-100 text-slate-700 text-xs">Pendiente</Badge>
                                  )}
                                  {cuota.estado !== "pagado" && cuota.estado !== "cancelado" && (
                                    <Button
                                      size="sm"
                                      className="h-6 px-2 text-xs bg-green-600 hover:bg-green-700"
                                      disabled={marcarCuota.isPending}
                                      onClick={() => marcarCuota.mutate({ cuotaId: cuota.id })}
                                    >
                                      Marcar pagada
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {plan.observaciones && (
                        <p className="text-xs text-slate-500 mt-3 italic">"{plan.observaciones}"</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!planParaCancelar} onOpenChange={open => !open && resetCancelar()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cancelar reestructuración</DialogTitle>
            <DialogDescription>
              {planParaCancelar?.student_nombre || "Este alumno"} tiene un convenio activo. Elige qué debe pasar con el saldo pendiente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Destino del saldo pendiente</Label>
              <Select value={destinoCancelacion} onValueChange={(value: "condonar" | "reinstalar") => {
                setDestinoCancelacion(value);
                setBloqueoOverride(null);
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="condonar">Condonar saldo pendiente</SelectItem>
                  <SelectItem value="reinstalar">Reinstalar saldo como cargo pendiente</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-slate-500">
                {destinoCancelacion === "condonar"
                  ? "Cancela las cuotas pendientes sin generar un nuevo cargo."
                  : "Cancela el plan y vuelve a crear el saldo pendiente como un cargo por cobrar."}
              </p>
            </div>
            <div>
              <Label htmlFor="motivo-cancelacion">Motivo de la cancelación</Label>
              <Textarea
                id="motivo-cancelacion"
                value={motivoCancelacion}
                onChange={event => setMotivoCancelacion(event.target.value)}
                placeholder="Explica por qué se cancela el convenio..."
                rows={3}
              />
              <p className="mt-1 text-xs text-slate-500">Mínimo 10 caracteres.</p>
            </div>
            {destinoCancelacion === "condonar" && (
              <div>
                <Label htmlFor="motivo-condonacion">Justificación de la condonación</Label>
                <Textarea
                  id="motivo-condonacion"
                  value={motivoCondonacion}
                  onChange={event => setMotivoCondonacion(event.target.value)}
                  placeholder="Documenta la razón de la condonación..."
                  rows={3}
                />
                <p className="mt-1 text-xs text-slate-500">Mínimo 10 caracteres.</p>
              </div>
            )}
            {bloqueoOverride && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-semibold">Autorización adicional requerida</p>
                <p className="mt-1">{bloqueoOverride}</p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={resetCancelar} disabled={cancelarPlan.isPending}>Cancelar</Button>
              <Button
                className={destinoCancelacion === "condonar" ? "bg-orange-600 hover:bg-orange-700" : ""}
                disabled={
                  cancelarPlan.isPending ||
                  motivoCancelacion.trim().length < 10 ||
                  (destinoCancelacion === "condonar" && motivoCondonacion.trim().length < 10)
                }
                onClick={enviarCancelacion}
              >
                {cancelarPlan.isPending ? "Procesando..." : destinoCancelacion === "condonar" ? "Condonar y cancelar plan" : "Cancelar y reinstalar saldo"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!overridePendiente} onOpenChange={open => !open && !autorizarYCondonar.isPending && setOverridePendiente(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Autorizar condonación repetida</DialogTitle>
            <DialogDescription>
              Existe una condonación registrada en los últimos 90 días para este alumno o un hermano. Esta autorización quedará registrada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="motivo-override">Motivo de autorización</Label>
              <Textarea
                id="motivo-override"
                value={motivoOverride}
                onChange={event => setMotivoOverride(event.target.value)}
                placeholder="Explica por qué se autoriza una condonación adicional..."
                rows={4}
              />
              <p className="mt-1 text-xs text-slate-500">Mínimo 10 caracteres.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOverridePendiente(null)} disabled={autorizarYCondonar.isPending}>Cancelar</Button>
              <Button
                className="bg-orange-600 hover:bg-orange-700"
                disabled={autorizarYCondonar.isPending || motivoOverride.trim().length < 10}
                onClick={() => autorizarYCondonar.mutate()}
              >
                {autorizarYCondonar.isPending ? "Autorizando..." : "Autorizar y aplicar condonación"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
