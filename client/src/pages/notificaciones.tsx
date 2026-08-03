import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Bell, Mail, MessageSquare, Smartphone, Send, Clock, CheckCircle, AlertTriangle, Users, User, Calendar, AlertCircle, RefreshCw } from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface NotificacionEntry {
  id: number;
  tipo: string;
  canal: string;
  destinatario: string;
  asunto: string | null;
  mensaje: string | null;
  estado: string;
  intentos: number;
  fecha_envio: string;
  alumno_nombre: string | null;
}

interface NotificacionStats {
  totalEnviadas: number;
  pendientes: number;
  errores: number;
  total: number;
  tasaEntrega: number;
}

interface StudentPendiente {
  id: number;
  nombre: string;
  email: string | null;
  telefono: string | null;
  monto_centavos: number;
  concepto: string | null;
  dias_vencido: number;
  charge_id: number;
}

// ─── Helpers de UI ────────────────────────────────────────────────────────────

const TIPO_LABELS: Record<string, string> = {
  RECORDATORIO_VENCIMIENTO: "Recordatorio de Vencimiento",
  AVISO_MORA:               "Aviso de Mora",
  CARGO_EMITIDO:            "Cargo Emitido",
  PAGO_CONFIRMADO:          "Pago Confirmado",
};

function getStatusBadge(estado: string) {
  switch (estado) {
    case "enviado":   return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Enviado</Badge>;
    case "pendiente": return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" />Pendiente</Badge>;
    case "error":     return <Badge className="bg-red-100 text-red-800"><AlertTriangle className="w-3 h-3 mr-1" />Error</Badge>;
    default:          return <Badge variant="secondary">{estado}</Badge>;
  }
}

function getChannelIcon(canal: string) {
  switch (canal) {
    case "EMAIL":    return <Mail className="w-4 h-4" />;
    case "SMS":      return <Smartphone className="w-4 h-4" />;
    case "WHATSAPP": return <MessageSquare className="w-4 h-4" />;
    default:         return <Bell className="w-4 h-4" />;
  }
}

function getChannelBadge(canal: string) {
  const colors: Record<string, string> = {
    EMAIL:    "bg-blue-100 text-blue-800",
    SMS:      "bg-green-100 text-green-800",
    WHATSAPP: "bg-emerald-100 text-emerald-800",
  };
  return (
    <Badge className={colors[canal] ?? "bg-gray-100 text-gray-800"}>
      {getChannelIcon(canal)}
      <span className="ml-1">{canal}</span>
    </Badge>
  );
}

function formatFecha(raw: string | null | undefined): string {
  if (!raw) return "—";
  return new Date(raw).toLocaleString("es-MX", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Notificaciones() {
  const [selectedChannel, setSelectedChannel] = useState("all");
  const [isModalOpen, setIsModalOpen]       = useState(false);
  const [selectedTipo, setSelectedTipo]     = useState("RECORDATORIO_VENCIMIENTO");
  const [selectedCanal, setSelectedCanal]   = useState("EMAIL");
  const [sendMode, setSendMode]             = useState("masivo");
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  // ── Historial de notificaciones ────────────────────────────────────────────
  const { data: notificaciones = [], isLoading: historialLoading, isError: historialError, refetch: refetchHistorial } =
    useQuery<NotificacionEntry[]>({
      queryKey: ["/api/notifications", selectedChannel],
      queryFn: async () => {
        const params = new URLSearchParams();
        if (selectedChannel !== "all") params.set("canal", selectedChannel);
        const res = await fetch(`/api/notifications?${params}`, { headers });
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      },
    });

  // ── Estadísticas ────────────────────────────────────────────────────────────
  const { data: stats } = useQuery<NotificacionStats>({
    queryKey: ["/api/notifications/stats"],
    queryFn: async () => {
      const res = await fetch("/api/notifications/stats", { headers });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
  });

  const estadisticas = stats ?? { totalEnviadas: 0, pendientes: 0, errores: 0, total: 0, tasaEntrega: 0 };

  // ── Estudiantes con cargos pendientes (para el modal de envío) ─────────────
  const { data: estudiantesPendientes = [], isFetching: loadingStudents } =
    useQuery<StudentPendiente[]>({
      queryKey: ["/api/notifications/pending-students", selectedTipo],
      queryFn: async () => {
        const res = await fetch(`/api/notifications/pending-students?tipo=${selectedTipo}`, { headers });
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      },
      enabled: isModalOpen,
    });

  // ── Envío de notificaciones ─────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: async (data: { tipo: string; canal: string; modo: string; estudiantesIds?: number[] }) => {
      const res = await apiRequest("/api/notifications/send", { method: "POST", body: JSON.stringify(data) });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Notificaciones enviadas",
        description: `Se enviaron ${data.enviadas ?? 0} notificaciones por ${data.canal}`,
      });
      setIsModalOpen(false);
      setSelectedStudents([]);
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/stats"] });
    },
    onError: () => {
      toast({
        title: "Error al enviar notificaciones",
        description: "Ocurrió un error al procesar el envío. Intente nuevamente.",
        variant: "destructive",
      });
    },
  });

  const handleSendNotification = () => {
    if (sendMode === "individual" && selectedStudents.length === 0) {
      toast({ title: "Selección requerida", description: "Seleccione al menos un estudiante", variant: "destructive" });
      return;
    }
    sendMutation.mutate({
      tipo: selectedTipo,
      canal: selectedCanal,
      modo: sendMode,
      estudiantesIds: sendMode === "individual" ? selectedStudents : undefined,
    });
  };

  const toggleStudent = (id: number, checked: boolean) =>
    setSelectedStudents(prev => checked ? [...prev, id] : prev.filter(x => x !== id));

  const estudiantesParaModal = sendMode === "individual"
    ? estudiantesPendientes
    : estudiantesPendientes;

  return (
    <div className="p-6 space-y-6">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Notificaciones Automáticas</h1>
          <p className="text-slate-600 mt-1">Gestiona comunicación automática: emails, SMS y WhatsApp</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetchHistorial(); }}>
            <RefreshCw className="w-4 h-4 mr-2" />Actualizar
          </Button>
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Send className="w-4 h-4 mr-2" />Enviar Notificación
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Enviar Notificaciones Automáticas</DialogTitle>
                <DialogDescription>
                  El sistema detecta automáticamente los estudiantes según el tipo seleccionado
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                {/* Configuración */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Tipo de Notificación</Label>
                    <Select value={selectedTipo} onValueChange={setSelectedTipo}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="RECORDATORIO_VENCIMIENTO">
                          <div className="flex items-center gap-2"><Calendar className="w-4 h-4" />Recordatorio de Vencimiento</div>
                        </SelectItem>
                        <SelectItem value="AVISO_MORA">
                          <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4" />Aviso de Mora</div>
                        </SelectItem>
                        <SelectItem value="CARGO_EMITIDO">
                          <div className="flex items-center gap-2"><Bell className="w-4 h-4" />Cargo Emitido</div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Canal de Envío</Label>
                    <Select value={selectedCanal} onValueChange={setSelectedCanal}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EMAIL"><div className="flex items-center gap-2"><Mail className="w-4 h-4" />Email</div></SelectItem>
                        <SelectItem value="SMS"><div className="flex items-center gap-2"><Smartphone className="w-4 h-4" />SMS</div></SelectItem>
                        <SelectItem value="WHATSAPP"><div className="flex items-center gap-2"><MessageSquare className="w-4 h-4" />WhatsApp</div></SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Modo de Envío</Label>
                    <Select value={sendMode} onValueChange={setSendMode}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="masivo"><div className="flex items-center gap-2"><Users className="w-4 h-4" />Envío Masivo</div></SelectItem>
                        <SelectItem value="individual"><div className="flex items-center gap-2"><User className="w-4 h-4" />Envío Individual</div></SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Info del tipo */}
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-1">{TIPO_LABELS[selectedTipo] ?? selectedTipo}</h4>
                  <p className="text-sm text-blue-700">
                    {selectedTipo === "RECORDATORIO_VENCIMIENTO" && "Estudiantes con pagos que vencen en los próximos 3 días o hoy."}
                    {selectedTipo === "AVISO_MORA"               && "Estudiantes con pagos vencidos (en mora)."}
                    {selectedTipo === "CARGO_EMITIDO"            && "Todos los estudiantes con cargos pendientes o parcialmente pagados."}
                  </p>
                </div>

                {/* Lista de estudiantes (datos reales) */}
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    Estudiantes detectados
                    {loadingStudents
                      ? <span className="text-sm text-gray-400">(cargando...)</span>
                      : <Badge variant="secondary">{estudiantesPendientes.length}</Badge>
                    }
                  </h4>
                  <div className="border rounded-lg max-h-60 overflow-y-auto">
                    {loadingStudents ? (
                      <div className="p-6 flex items-center justify-center">
                        <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" />
                      </div>
                    ) : estudiantesParaModal.length === 0 ? (
                      <div className="p-6 text-center text-gray-500">
                        <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                        <p className="text-sm">No se encontraron estudiantes para este tipo de notificación</p>
                      </div>
                    ) : (
                      <div className="space-y-1 p-3">
                        {estudiantesParaModal.map((estudiante) => (
                          <div key={estudiante.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded">
                            {sendMode === "individual" && (
                              <Checkbox
                                checked={selectedStudents.includes(estudiante.id)}
                                onCheckedChange={(c) => toggleStudent(estudiante.id, c as boolean)}
                              />
                            )}
                            <div className="flex-1 flex items-center justify-between">
                              <div>
                                <div className="font-medium text-sm">{estudiante.nombre}</div>
                                <div className="text-xs text-gray-500">
                                  {selectedCanal === "EMAIL" ? (estudiante.email ?? "sin email") : (estudiante.telefono ?? "sin teléfono")}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-medium">
                                  ${Math.round((estudiante.monto_centavos ?? 0) / 100).toLocaleString("es-MX")}
                                </div>
                                <div className={`text-xs ${
                                  estudiante.dias_vencido > 0 ? "text-red-600" :
                                  estudiante.dias_vencido === 0 ? "text-yellow-600" : "text-green-600"
                                }`}>
                                  {estudiante.dias_vencido > 0
                                    ? `${estudiante.dias_vencido} día(s) vencido`
                                    : estudiante.dias_vencido === 0
                                    ? "Vence hoy"
                                    : `Vence en ${Math.abs(estudiante.dias_vencido)} día(s)`}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Resumen */}
                <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-600 space-y-1">
                  <div><span className="font-medium">Tipo:</span> {TIPO_LABELS[selectedTipo] ?? selectedTipo}</div>
                  <div><span className="font-medium">Canal:</span> {selectedCanal}</div>
                  <div><span className="font-medium">Modo:</span> {sendMode === "masivo" ? "Envío Masivo" : "Envío Individual"}</div>
                  <div>
                    <span className="font-medium">Destinatarios:</span>{" "}
                    {sendMode === "masivo" ? estudiantesPendientes.length : selectedStudents.length} estudiante(s)
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                <Button
                  onClick={handleSendNotification}
                  disabled={
                    sendMutation.isPending ||
                    loadingStudents ||
                    estudiantesPendientes.length === 0 ||
                    (sendMode === "individual" && selectedStudents.length === 0)
                  }
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {sendMutation.isPending ? (
                    <><div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />Enviando...</>
                  ) : (
                    <><Send className="w-4 h-4 mr-2" />Enviar {sendMode === "masivo" ? estudiantesPendientes.length : selectedStudents.length} Notificaciones</>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.totalEnviadas}</div>
            <div className="text-sm text-slate-600">Enviadas exitosamente</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="w-8 h-8 text-yellow-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.pendientes}</div>
            <div className="text-sm text-slate-600">Pendientes de envío</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="w-8 h-8 text-red-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.errores}</div>
            <div className="text-sm text-slate-600">Errores de envío</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{estadisticas.tasaEntrega.toFixed(1)}%</div>
            <div className="text-sm text-slate-600">Tasa de entrega</div>
            <div className="text-xs text-gray-400 mt-1">{estadisticas.total} total</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="historial" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="historial">Historial de envíos</TabsTrigger>
          <TabsTrigger value="plantillas">Plantillas</TabsTrigger>
          <TabsTrigger value="configuracion">Configuración</TabsTrigger>
        </TabsList>

        {/* ── Historial ──────────────────────────────────────────────────────── */}
        <TabsContent value="historial">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Historial de notificaciones</CardTitle>
                <Select value={selectedChannel} onValueChange={setSelectedChannel}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los canales</SelectItem>
                    <SelectItem value="EMAIL">Email</SelectItem>
                    <SelectItem value="SMS">SMS</SelectItem>
                    <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {historialLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
                </div>
              ) : historialError ? (
                <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <span className="font-medium">No se pudo cargar el historial.</span>
                  <button onClick={() => refetchHistorial()} className="underline">Reintentar</button>
                </div>
              ) : notificaciones.length === 0 ? (
                <div className="py-14 text-center text-gray-500">
                  <Bell className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">Sin notificaciones enviadas</p>
                  <p className="text-sm mt-1">
                    Usa el botón <strong>Enviar Notificación</strong> para enviar la primera notificación
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notificaciones.map((notif) => (
                    <div key={notif.id} className="p-4 border rounded-lg hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-medium text-sm">{TIPO_LABELS[notif.tipo] ?? notif.tipo}</span>
                            {getChannelBadge(notif.canal)}
                            {getStatusBadge(notif.estado)}
                          </div>
                          {notif.alumno_nombre && (
                            <p className="text-sm text-slate-700 font-medium mb-0.5">{notif.alumno_nombre}</p>
                          )}
                          {notif.asunto && (
                            <p className="text-sm text-slate-600 mb-1">{notif.asunto}</p>
                          )}
                          {notif.mensaje && (
                            <p className="text-xs text-slate-500 line-clamp-2">{notif.mensaje}</p>
                          )}
                          <div className="flex items-center gap-4 text-xs text-slate-400 mt-2">
                            <span>Para: {notif.destinatario}</span>
                            <span>{formatFecha(notif.fecha_envio)}</span>
                            <span>{notif.intentos} intento(s)</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Plantillas ─────────────────────────────────────────────────────── */}
        <TabsContent value="plantillas">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-blue-200">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bell className="w-5 h-5 text-blue-600" />Cargo emitido
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600 mb-4">Notifica cuando se genera un nuevo cargo</p>
                <div className="flex items-center justify-between mb-2"><span className="text-sm">Email</span><Switch defaultChecked /></div>
                <div className="flex items-center justify-between mb-2"><span className="text-sm">SMS</span><Switch /></div>
                <div className="flex items-center justify-between"><span className="text-sm">WhatsApp</span><Switch defaultChecked /></div>
              </CardContent>
            </Card>

            <Card className="border-yellow-200">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="w-5 h-5 text-yellow-600" />Recordatorio vencimiento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600 mb-4">Recuerda pagos próximos a vencer</p>
                <div className="mb-4">
                  <Label className="text-xs">Días antes del vencimiento</Label>
                  <Input type="number" defaultValue="3" className="mt-1" />
                </div>
                <div className="flex items-center justify-between mb-2"><span className="text-sm">Email</span><Switch defaultChecked /></div>
                <div className="flex items-center justify-between"><span className="text-sm">SMS</span><Switch defaultChecked /></div>
              </CardContent>
            </Card>

            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600" />Aviso de mora
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600 mb-4">Notifica pagos vencidos y recargos</p>
                <div className="mb-4">
                  <Label className="text-xs">Días después del vencimiento</Label>
                  <Input type="number" defaultValue="1" className="mt-1" />
                </div>
                <div className="flex items-center justify-between mb-2"><span className="text-sm">Email</span><Switch defaultChecked /></div>
                <div className="flex items-center justify-between"><span className="text-sm">WhatsApp</span><Switch defaultChecked /></div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Configuración ──────────────────────────────────────────────────── */}
        <TabsContent value="configuracion">
          <Card>
            <CardHeader><CardTitle>Configuración de notificaciones</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className="font-medium">Recordatorios automáticos</div>
                  <div className="text-sm text-gray-500">Envía recordatorios 3 días antes del vencimiento</div>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className="font-medium">Avisos de mora</div>
                  <div className="text-sm text-gray-500">Notifica automáticamente cuando un pago vence</div>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className="font-medium">Confirmación de pago</div>
                  <div className="text-sm text-gray-500">Confirma al tutor cuando se registra un pago</div>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className="font-medium">Notificaciones de CFDI</div>
                  <div className="text-sm text-gray-500">Envía el CFDI cuando se emite la factura</div>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
