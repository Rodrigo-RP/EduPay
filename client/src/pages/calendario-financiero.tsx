// Calendario Financiero Escolar — fechas clave, alertas y recordatorios
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Calendar, Plus, AlertTriangle, CheckCircle, Clock,
  ChevronLeft, ChevronRight, Bell, FileText, DollarSign, Building
} from "lucide-react";

const TIPO_CONFIG: Record<string, { label: string; color: string; dot: string; icon: any }> = {
  vencimiento_masivo: { label: "Vencimiento masivo", color: "text-red-700", dot: "bg-red-500", icon: AlertTriangle },
  cierre_fiscal: { label: "Cierre fiscal SAT", color: "text-purple-700", dot: "bg-purple-500", icon: FileText },
  inscripciones: { label: "Período inscripciones", color: "text-blue-700", dot: "bg-blue-500", icon: Building },
  pago_proveedor: { label: "Pago proveedor", color: "text-amber-700", dot: "bg-amber-500", icon: DollarSign },
  consejo: { label: "Reunión consejo", color: "text-indigo-700", dot: "bg-indigo-500", icon: Building },
  otro: { label: "Otro", color: "text-slate-700", dot: "bg-slate-400", icon: Calendar },
};

const TIPO_BG: Record<string, string> = {
  vencimiento_masivo: "bg-red-100 border-red-300 text-red-800",
  cierre_fiscal: "bg-purple-100 border-purple-300 text-purple-800",
  inscripciones: "bg-blue-100 border-blue-300 text-blue-800",
  pago_proveedor: "bg-amber-100 border-amber-300 text-amber-800",
  consejo: "bg-indigo-100 border-indigo-300 text-indigo-800",
  otro: "bg-slate-100 border-slate-300 text-slate-800",
};

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS_SEMANA = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

export default function CalendarioFinanciero() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const campusId = user?.campus_id || 1;
  const hoy = new Date();
  const [mesActual, setMesActual] = useState(hoy.getMonth());
  const [anioActual, setAnioActual] = useState(hoy.getFullYear());
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ titulo: "", descripcion: "", fecha: "", tipo: "vencimiento_masivo", urgencia: "normal" });

  const { data: eventos } = useQuery<any[]>({
    queryKey: ["/api/calendario/eventos", campusId],
  });

  const crearEvento = useMutation({
    mutationFn: (data: any) => apiRequest("/api/calendario/eventos", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      toast({ title: "Evento agregado al calendario" });
      setShowModal(false);
      setForm({ titulo: "", descripcion: "", fecha: "", tipo: "vencimiento_masivo", urgencia: "normal" });
      queryClient.invalidateQueries({ queryKey: ["/api/calendario/eventos"] });
    },
    onError: () => toast({ title: "Error al crear evento", variant: "destructive" }),
  });

  const completarEvento = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/calendario/eventos/${id}/completar`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/calendario/eventos"] }),
  });

  const prevMes = () => { if (mesActual === 0) { setMesActual(11); setAnioActual(a => a - 1); } else setMesActual(m => m - 1); };
  const nextMes = () => { if (mesActual === 11) { setMesActual(0); setAnioActual(a => a + 1); } else setMesActual(m => m + 1); };

  const primerDia = new Date(anioActual, mesActual, 1).getDay();
  const diasEnMes = new Date(anioActual, mesActual + 1, 0).getDate();
  const celdas: (number | null)[] = [...Array(primerDia).fill(null), ...Array.from({length: diasEnMes}, (_, i) => i + 1)];
  while (celdas.length % 7 !== 0) celdas.push(null);

  const getEventosDia = (dia: number | null) => {
    if (!dia) return [];
    const fechaStr = `${anioActual}-${String(mesActual + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    return (eventos || []).filter(e => e.fecha === fechaStr);
  };

  const proximosEventos = (eventos || [])
    .filter(e => {
      const d = new Date(e.fecha + "T12:00:00");
      const diff = (d.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
      return diff >= -1 && diff <= 30 && !e.completado;
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .slice(0, 8);

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-teal-600" />
            Calendario Financiero
          </h1>
          <p className="text-slate-500 text-sm mt-1">Fechas clave: vencimientos, cierres fiscales, reuniones de consejo</p>
        </div>
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-teal-600 hover:bg-teal-700">
              <Plus className="w-4 h-4" /> Agregar evento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Nuevo evento financiero</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-2">
              <div>
                <Label>Título</Label>
                <Input placeholder="Ej: Cierre mensual junio 2025" value={form.titulo}
                  onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Fecha</Label>
                  <Input type="date" value={form.fecha}
                    onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TIPO_CONFIG).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Urgencia</Label>
                <Select value={form.urgencia} onValueChange={v => setForm(f => ({ ...f, urgencia: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="importante">Importante</SelectItem>
                    <SelectItem value="critico">Crítico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Descripción (opcional)</Label>
                <Textarea rows={2} value={form.descripcion}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
              </div>
              <Button
                className="w-full bg-teal-600 hover:bg-teal-700"
                disabled={!form.titulo || !form.fecha || crearEvento.isPending}
                onClick={() => crearEvento.mutate({ ...form, campus_id: campusId })}
              >
                {crearEvento.isPending ? "Guardando..." : "Guardar evento"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendario vista mensual */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={prevMes}><ChevronLeft className="w-4 h-4" /></Button>
                <h2 className="font-bold text-lg">{MESES[mesActual]} {anioActual}</h2>
                <Button variant="ghost" size="sm" onClick={nextMes}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {DIAS_SEMANA.map(d => (
                  <div key={d} className="text-center text-xs font-medium text-slate-500 py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {celdas.map((dia, idx) => {
                  const eventosHoy = getEventosDia(dia);
                  const esHoy = dia === hoy.getDate() && mesActual === hoy.getMonth() && anioActual === hoy.getFullYear();
                  return (
                    <div
                      key={idx}
                      className={`min-h-[56px] p-1 rounded-lg border text-sm cursor-pointer transition-colors ${dia ? "hover:bg-slate-50" : ""} ${esHoy ? "border-teal-400 bg-teal-50" : "border-transparent"}`}
                      onClick={() => {
                        if (dia) {
                          const f = `${anioActual}-${String(mesActual+1).padStart(2,"0")}-${String(dia).padStart(2,"0")}`;
                          setForm(prev => ({ ...prev, fecha: f }));
                          setShowModal(true);
                        }
                      }}
                    >
                      {dia && (
                        <>
                          <div className={`text-xs font-medium ${esHoy ? "text-teal-700 font-bold" : "text-slate-600"}`}>{dia}</div>
                          {eventosHoy.map((ev, i) => (
                            <div
                              key={i}
                              className={`text-xs px-1 py-0.5 rounded mt-0.5 border truncate ${TIPO_BG[ev.tipo] || TIPO_BG.otro} ${ev.completado ? "opacity-40 line-through" : ""}`}
                              title={ev.titulo}
                            >
                              {ev.titulo}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Panel lateral: próximos eventos */}
        <div className="space-y-3">
          <h3 className="font-semibold text-slate-700 flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-500" /> Próximos 30 días
          </h3>
          {proximosEventos.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-slate-400 text-sm">
                Sin eventos próximos.<br />
                <span className="text-xs">Haz clic en un día o usa el botón "Agregar evento".</span>
              </CardContent>
            </Card>
          ) : (
            proximosEventos.map((ev: any) => {
              const cfg = TIPO_CONFIG[ev.tipo] || TIPO_CONFIG.otro;
              const Icon = cfg.icon;
              const dias = Math.round((new Date(ev.fecha + "T12:00:00").getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
              return (
                <Card key={ev.id} className={`border ${ev.urgencia === "critico" ? "border-red-300" : ev.urgencia === "importante" ? "border-amber-300" : "border-slate-200"}`}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.color}`} />
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-slate-900 truncate">{ev.titulo}</p>
                          <p className="text-xs text-slate-500">
                            {new Date(ev.fecha + "T12:00:00").toLocaleDateString("es-MX", { weekday: "short", month: "short", day: "numeric" })}
                            {" — "}{dias === 0 ? "HOY" : dias === 1 ? "mañana" : `en ${dias} días`}
                          </p>
                          {ev.urgencia === "critico" && (
                            <Badge className="mt-1 bg-red-100 text-red-700 text-xs">Crítico</Badge>
                          )}
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" className="h-6 px-1 shrink-0" title="Marcar como completado"
                        onClick={() => completarEvento.mutate(ev.id)}>
                        <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}

          {/* Leyenda de tipos */}
          <Card className="mt-2">
            <CardContent className="p-3">
              <p className="text-xs font-semibold text-slate-500 mb-2">Tipos de evento</p>
              {Object.entries(TIPO_CONFIG).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 text-xs text-slate-600 mb-1">
                  <div className={`w-2 h-2 rounded-full ${v.dot}`} />
                  {v.label}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
