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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-2"
                      onClick={() => setExpandedPlan(isExpanded ? null : plan.id)}
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
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
    </div>
  );
}
