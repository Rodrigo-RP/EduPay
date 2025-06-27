import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Bell, Mail, MessageSquare, Smartphone, Send, Clock, CheckCircle, AlertTriangle, Users, User, Calendar, AlertCircle } from "lucide-react";

export default function Notificaciones() {
  const [selectedChannel, setSelectedChannel] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedNotificationType, setSelectedNotificationType] = useState("RECORDATORIO_VENCIMIENTO");
  const [selectedChannel2, setSelectedChannel2] = useState("EMAIL");
  const [sendMode, setSendMode] = useState("masivo"); // masivo o individual
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Datos simulados de estudiantes con pagos pendientes
  const estudiantesPendientes = [
    { id: 1, nombre: "Carlos Pérez", email: "carlos.perez@gmail.com", telefono: "5551234567", monto: 5000, diasVencido: 0, concepto: "Colegiatura Enero 2025" },
    { id: 2, nombre: "Ana García", email: "ana.garcia@yahoo.com", telefono: "5555678901", monto: 4500, diasVencido: 3, concepto: "Colegiatura Enero 2025" },
    { id: 3, nombre: "Luis Martínez", email: "luis.martinez@hotmail.com", telefono: "5559876543", monto: 5000, diasVencido: 7, concepto: "Colegiatura Enero 2025" },
    { id: 4, nombre: "María González", email: "maria.gonzalez@gmail.com", telefono: "5552468101", monto: 4750, diasVencido: 1, concepto: "Colegiatura Enero 2025" },
    { id: 5, nombre: "José Rodríguez", email: "jose.rodriguez@outlook.com", telefono: "5553691472", monto: 5200, diasVencido: 5, concepto: "Colegiatura Enero 2025" }
  ];

  // Mutation para envío de notificaciones
  const sendNotificationMutation = useMutation({
    mutationFn: async (data: {
      tipo: string;
      canal: string;
      modo: string;
      estudiantesIds?: number[];
    }) => {
      const response = await apiRequest('POST', '/api/notifications/send', data);
      return await response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Notificaciones enviadas",
        description: `Se enviaron ${data.enviadas || data.count || 'las'} notificaciones exitosamente`,
      });
      setIsModalOpen(false);
      setSelectedStudents([]);
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    },
    onError: (error) => {
      toast({
        title: "Error al enviar notificaciones",
        description: "Ocurrió un error al procesar el envío. Intente nuevamente.",
        variant: "destructive",
      });
    }
  });

  const handleSendNotification = () => {
    if (sendMode === "individual" && selectedStudents.length === 0) {
      toast({
        title: "Selección requerida",
        description: "Debe seleccionar al menos un estudiante para envío individual",
        variant: "destructive",
      });
      return;
    }

    const data = {
      tipo: selectedNotificationType,
      canal: selectedChannel2,
      modo: sendMode,
      estudiantesIds: sendMode === "individual" ? selectedStudents : undefined
    };

    sendNotificationMutation.mutate(data);
  };

  const handleStudentSelection = (studentId: number, checked: boolean) => {
    if (checked) {
      setSelectedStudents(prev => [...prev, studentId]);
    } else {
      setSelectedStudents(prev => prev.filter(id => id !== studentId));
    }
  };

  const getNotificationTypeLabel = (tipo: string) => {
    const labels = {
      RECORDATORIO_VENCIMIENTO: "Recordatorio de Vencimiento",
      AVISO_MORA: "Aviso de Mora",
      CARGO_EMITIDO: "Cargo Emitido"
    };
    return labels[tipo as keyof typeof labels] || tipo;
  };

  const getStudentsByNotificationType = () => {
    switch (selectedNotificationType) {
      case "RECORDATORIO_VENCIMIENTO":
        return estudiantesPendientes.filter(e => e.diasVencido >= -3 && e.diasVencido <= 0);
      case "AVISO_MORA":
        return estudiantesPendientes.filter(e => e.diasVencido > 0);
      case "CARGO_EMITIDO":
        return estudiantesPendientes;
      default:
        return estudiantesPendientes;
    }
  };

  // Datos demo de notificaciones
  const notificaciones = [
    {
      id: 1,
      tipo: "CARGO_EMITIDO",
      canal: "EMAIL",
      destinatario: "carlos.perez@gmail.com",
      asunto: "Nueva colegiatura disponible - Enero 2025",
      mensaje: "Estimado Carlos, la colegiatura de enero está disponible por $5,000 MXN",
      fecha_envio: "2025-01-01 09:00",
      estado: "enviado",
      intentos: 1
    },
    {
      id: 2,
      tipo: "RECORDATORIO_VENCIMIENTO",
      canal: "SMS",
      destinatario: "5551234567",
      asunto: "",
      mensaje: "Recordatorio: Su colegiatura vence mañana. Pague en escuelapay.com",
      fecha_envio: "2025-01-14 10:00",
      estado: "enviado",
      intentos: 1
    },
    {
      id: 3,
      tipo: "AVISO_MORA",
      canal: "WHATSAPP",
      destinatario: "5555678901",
      asunto: "",
      mensaje: "Su pago está vencido. Se aplicará recargo por mora. Pague ahora para evitar cargos adicionales.",
      fecha_envio: "2025-01-16 08:00",
      estado: "pendiente",
      intentos: 0
    },
    {
      id: 4,
      tipo: "PAGO_CONFIRMADO",
      canal: "EMAIL",
      destinatario: "ana.garcia@yahoo.com",
      asunto: "Pago recibido correctamente",
      mensaje: "Su pago de $4,500 MXN ha sido procesado. CFDI será enviado por separado.",
      fecha_envio: "2025-01-15 14:30",
      estado: "enviado",
      intentos: 1
    },
    {
      id: 5,
      tipo: "CARGO_EMITIDO",
      canal: "EMAIL",
      destinatario: "luis.martinez@hotmail.com",
      asunto: "Nueva colegiatura disponible - Enero 2025",
      mensaje: "Estimado Luis, tiene 2 colegiaturas pendientes por un total de $8,500 MXN",
      fecha_envio: "2025-01-01 09:00",
      estado: "error",
      intentos: 3
    }
  ];

  const filteredNotificaciones = selectedChannel === "all" 
    ? notificaciones 
    : notificaciones.filter(n => n.canal === selectedChannel);

  const estadisticas = {
    totalEnviadas: notificaciones.filter(n => n.estado === "enviado").length,
    pendientes: notificaciones.filter(n => n.estado === "pendiente").length,
    errores: notificaciones.filter(n => n.estado === "error").length,
    tasaEntrega: (notificaciones.filter(n => n.estado === "enviado").length / notificaciones.length) * 100
  };

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case "enviado":
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Enviado</Badge>;
      case "pendiente":
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" />Pendiente</Badge>;
      case "error":
        return <Badge className="bg-red-100 text-red-800"><AlertTriangle className="w-3 h-3 mr-1" />Error</Badge>;
      default:
        return <Badge variant="secondary">{estado}</Badge>;
    }
  };

  const getChannelIcon = (canal: string) => {
    switch (canal) {
      case "EMAIL":
        return <Mail className="w-4 h-4" />;
      case "SMS":
        return <Smartphone className="w-4 h-4" />;
      case "WHATSAPP":
        return <MessageSquare className="w-4 h-4" />;
      default:
        return <Bell className="w-4 h-4" />;
    }
  };

  const getChannelBadge = (canal: string) => {
    const colors = {
      EMAIL: "bg-blue-100 text-blue-800",
      SMS: "bg-green-100 text-green-800",
      WHATSAPP: "bg-emerald-100 text-emerald-800"
    };
    
    return (
      <Badge className={colors[canal as keyof typeof colors] || "bg-gray-100 text-gray-800"}>
        {getChannelIcon(canal)}
        <span className="ml-1">{canal}</span>
      </Badge>
    );
  };

  return (
    <div >
      <div >
        
        <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Notificaciones Automáticas</h1>
          <p className="text-slate-600">Gestiona comunicación automática: emails, SMS y WhatsApp</p>
            </div>
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Send className="w-4 h-4 mr-2" />
                  Enviar Notificación
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Enviar Notificaciones Automáticas</DialogTitle>
                  <DialogDescription>
                    El sistema detectará automáticamente los estudiantes según el tipo de notificación seleccionado
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                  {/* Configuración de Notificación */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="notification-type">Tipo de Notificación</Label>
                      <Select value={selectedNotificationType} onValueChange={setSelectedNotificationType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="RECORDATORIO_VENCIMIENTO">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4" />
                              Recordatorio de Vencimiento
                            </div>
                          </SelectItem>
                          <SelectItem value="AVISO_MORA">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="w-4 h-4" />
                              Aviso de Mora
                            </div>
                          </SelectItem>
                          <SelectItem value="CARGO_EMITIDO">
                            <div className="flex items-center gap-2">
                              <Bell className="w-4 h-4" />
                              Cargo Emitido
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="channel">Canal de Envío</Label>
                      <Select value={selectedChannel2} onValueChange={setSelectedChannel2}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="EMAIL">
                            <div className="flex items-center gap-2">
                              <Mail className="w-4 h-4" />
                              Email
                            </div>
                          </SelectItem>
                          <SelectItem value="SMS">
                            <div className="flex items-center gap-2">
                              <Smartphone className="w-4 h-4" />
                              SMS
                            </div>
                          </SelectItem>
                          <SelectItem value="WHATSAPP">
                            <div className="flex items-center gap-2">
                              <MessageSquare className="w-4 h-4" />
                              WhatsApp
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="send-mode">Modo de Envío</Label>
                      <Select value={sendMode} onValueChange={setSendMode}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="masivo">
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              Envío Masivo
                            </div>
                          </SelectItem>
                          <SelectItem value="individual">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4" />
                              Envío Individual
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Información del tipo de notificación */}
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="font-medium text-blue-900 mb-2">
                      {getNotificationTypeLabel(selectedNotificationType)}
                    </h4>
                    <p className="text-sm text-blue-700">
                      {selectedNotificationType === "RECORDATORIO_VENCIMIENTO" && 
                        "Se enviarán recordatorios a estudiantes con pagos que vencen en los próximos 3 días o vencen hoy."}
                      {selectedNotificationType === "AVISO_MORA" && 
                        "Se enviarán avisos a estudiantes con pagos vencidos (morosos)."}
                      {selectedNotificationType === "CARGO_EMITIDO" && 
                        "Se enviarán notificaciones de nuevos cargos emitidos a todos los estudiantes."}
                    </p>
                  </div>

                  {/* Lista de estudiantes detectados */}
                  <div>
                    <h4 className="font-medium mb-3">
                      Estudiantes Detectados ({getStudentsByNotificationType().length})
                    </h4>
                    <div className="border rounded-lg max-h-60 overflow-y-auto">
                      {getStudentsByNotificationType().length === 0 ? (
                        <div className="p-4 text-center text-gray-500">
                          No se encontraron estudiantes para este tipo de notificación
                        </div>
                      ) : (
                        <div className="space-y-2 p-4">
                          {getStudentsByNotificationType().map((estudiante) => (
                            <div key={estudiante.id} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded">
                              {sendMode === "individual" && (
                                <Checkbox
                                  checked={selectedStudents.includes(estudiante.id)}
                                  onCheckedChange={(checked) => 
                                    handleStudentSelection(estudiante.id, checked as boolean)
                                  }
                                />
                              )}
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="font-medium">{estudiante.nombre}</div>
                                    <div className="text-sm text-gray-600">
                                      {selectedChannel2 === "EMAIL" ? estudiante.email : estudiante.telefono}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-medium">${estudiante.monto.toLocaleString()}</div>
                                    <div className={`text-sm ${
                                      estudiante.diasVencido > 0 ? 'text-red-600' : 
                                      estudiante.diasVencido === 0 ? 'text-yellow-600' : 'text-green-600'
                                    }`}>
                                      {estudiante.diasVencido > 0 
                                        ? `${estudiante.diasVencido} días vencido`
                                        : estudiante.diasVencido === 0 
                                        ? 'Vence hoy'
                                        : `Vence en ${Math.abs(estudiante.diasVencido)} días`
                                      }
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Resumen de envío */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-medium mb-2">Resumen del Envío</h4>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div>Tipo: {getNotificationTypeLabel(selectedNotificationType)}</div>
                      <div>Canal: {selectedChannel2}</div>
                      <div>Modo: {sendMode === "masivo" ? "Envío Masivo" : "Envío Individual"}</div>
                      <div>
                        Destinatarios: {
                          sendMode === "masivo" 
                            ? getStudentsByNotificationType().length 
                            : selectedStudents.length
                        } estudiantes
                      </div>
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                    Cancelar
                  </Button>
                  <Button 
                    onClick={handleSendNotification}
                    disabled={
                      sendNotificationMutation.isPending || 
                      getStudentsByNotificationType().length === 0 ||
                      (sendMode === "individual" && selectedStudents.length === 0)
                    }
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {sendNotificationMutation.isPending ? (
                      <>
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Enviar {sendMode === "masivo" 
                          ? `${getStudentsByNotificationType().length} Notificaciones` 
                          : `${selectedStudents.length} Notificaciones`
                        }
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
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
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="historial" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="historial">Historial de envíos</TabsTrigger>
              <TabsTrigger value="plantillas">Plantillas</TabsTrigger>
              <TabsTrigger value="configuracion">Configuración</TabsTrigger>
            </TabsList>

            <TabsContent value="historial">
              <Card>
                <CardHeader>
              <div className="flex items-center justify-between">
                    <CardTitle>Historial de notificaciones</CardTitle>
                    <Select value={selectedChannel} onValueChange={setSelectedChannel}>
                      <SelectTrigger className="w-40">
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
              <div className="space-y-4">
                    {filteredNotificaciones.map((notif) => (
                  <div key={notif.id} className="p-4 border rounded-lg hover:bg-slate-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium">{notif.tipo.replace('_', ' ')}</h3>
                              {getChannelBadge(notif.canal)}
                              {getStatusBadge(notif.estado)}
                            </div>
                            {notif.asunto && (
                          <p className="text-sm font-medium text-slate-700 mb-1">{notif.asunto}</p>
                            )}
                        <p className="text-sm text-slate-600 mb-2">{notif.mensaje}</p>
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                              <span>Destinatario: {notif.destinatario}</span>
                              <span>Enviado: {notif.fecha_envio}</span>
                              <span>Intentos: {notif.intentos}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="plantillas">
              <Card>
                <CardHeader>
                  <CardTitle>Plantillas de notificación</CardTitle>
                </CardHeader>
                <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <Card className="border-blue-200">
                        <CardHeader>
                          <CardTitle className="text-lg flex items-center gap-2">
                            <Bell className="w-5 h-5 text-blue-600" />
                            Cargo emitido
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                      <p className="text-sm text-slate-600 mb-4">
                            Notifica cuando se genera un nuevo cargo
                          </p>
                      <div className="flex items-center justify-between mb-2">
                            <span className="text-sm">Email</span>
                            <Switch defaultChecked />
                          </div>
                      <div className="flex items-center justify-between mb-2">
                            <span className="text-sm">SMS</span>
                            <Switch />
                          </div>
                      <div className="flex items-center justify-between">
                            <span className="text-sm">WhatsApp</span>
                            <Switch defaultChecked />
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-yellow-200">
                        <CardHeader>
                          <CardTitle className="text-lg flex items-center gap-2">
                            <Clock className="w-5 h-5 text-yellow-600" />
                            Recordatorio vencimiento
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                      <p className="text-sm text-slate-600 mb-4">
                            Recuerda pagos próximos a vencer
                          </p>
                      <div className="mb-4">
                            <Label className="text-xs">Días antes del vencimiento</Label>
                            <Input type="number" defaultValue="3" className="mt-1" />
                          </div>
                      <div className="flex items-center justify-between mb-2">
                            <span className="text-sm">Email</span>
                            <Switch defaultChecked />
                          </div>
                      <div className="flex items-center justify-between">
                            <span className="text-sm">SMS</span>
                            <Switch defaultChecked />
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-red-200">
                        <CardHeader>
                          <CardTitle className="text-lg flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-red-600" />
                            Aviso de mora
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                      <p className="text-sm text-slate-600 mb-4">
                            Notifica pagos vencidos y recargos
                          </p>
                      <div className="mb-4">
                            <Label className="text-xs">Días después del vencimiento</Label>
                            <Input type="number" defaultValue="1" className="mt-1" />
                          </div>
                      <div className="flex items-center justify-between mb-2">
                            <span className="text-sm">Email</span>
                            <Switch defaultChecked />
                          </div>
                      <div className="flex items-center justify-between">
                            <span className="text-sm">WhatsApp</span>
                            <Switch defaultChecked />
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="configuracion">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Configuración de canales</CardTitle>
                  </CardHeader>
                  <CardContent>
                <div className="space-y-6">
                  <div>
                        <Label className="text-sm font-semibold">Configuración Email (SMTP)</Label>
                    <div className="grid grid-cols-2 gap-4 mt-2">
                          <Input placeholder="smtp.servidor.com" />
                          <Input placeholder="Puerto (587)" />
                          <Input placeholder="usuario@dominio.com" />
                          <Input type="password" placeholder="Contraseña" />
                        </div>
                      </div>
                  <div>
                        <Label className="text-sm font-semibold">Configuración SMS</Label>
                    <div className="grid grid-cols-2 gap-4 mt-2">
                          <Input placeholder="API Key SMS" />
                          <Input placeholder="Sender ID" />
                        </div>
                      </div>
                  <div>
                        <Label className="text-sm font-semibold">Configuración WhatsApp</Label>
                    <div className="grid grid-cols-2 gap-4 mt-2">
                          <Input placeholder="WhatsApp Business API Token" />
                          <Input placeholder="Número verificado" />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Configuración general</CardTitle>
                  </CardHeader>
                  <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                        <Label>Notificaciones automáticas activas</Label>
                        <Switch defaultChecked />
                      </div>
                  <div className="flex items-center justify-between">
                        <Label>Limitar intentos de reenvío</Label>
                        <Switch defaultChecked />
                      </div>
                  <div>
                        <Label>Máximo de intentos</Label>
                        <Input type="number" defaultValue="3" className="mt-1" />
                      </div>
                  <div>
                        <Label>Horario de envío</Label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                          <Input type="time" defaultValue="08:00" />
                          <Input type="time" defaultValue="20:00" />
                        </div>
                      </div>
                  <Button className="w-full">
                        Guardar configuración
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}