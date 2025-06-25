import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Mail, MessageSquare, Smartphone, Send, Clock, CheckCircle, AlertTriangle } from "lucide-react";

export default function Notificaciones() {
  const [selectedChannel, setSelectedChannel] = useState("all");

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
    <div className="flex h-screen bg-slate-50">
      <div className="flex-1 overflow-auto">
        
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Notificaciones Automáticas</h1>
              <p className="text-slate-600">Gestiona comunicación automática: emails, SMS y WhatsApp</p>
            </div>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Send className="w-4 h-4 mr-2" />
              Enviar Notificación
            </Button>
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