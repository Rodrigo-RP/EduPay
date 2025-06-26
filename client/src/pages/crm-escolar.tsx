import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, Phone, Mail, Calendar, TrendingUp, UserCheck, Clock, AlertTriangle } from "lucide-react";

export default function CRMEscolar() {
  const { toast } = useToast();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTimelineModal, setShowTimelineModal] = useState(false);
  const [selectedProspecto, setSelectedProspecto] = useState<any>(null);
  const [showAddActivityModal, setShowAddActivityModal] = useState(false);
  const [selectedEstado, setSelectedEstado] = useState("all");
  const [selectedOrigen, setSelectedOrigen] = useState("all");
  const [newActivity, setNewActivity] = useState({
    tipo: "",
    descripcion: "",
    resultado: "",
    fecha_programada: ""
  });

  // Datos demo de prospectos de familias
  const prospectos = [
    {
      id: 1,
      nombre_padre: "Roberto Carlos Mendoza",
      nombre_madre: "Patricia Elena Vázquez",
      telefono_principal: "55-1234-5678",
      telefono_secundario: "55-8765-4321",
      correo_principal: "roberto.mendoza@empresa.com",
      correo_secundario: "patricia.vazquez@gmail.com",
      estado_economico: "ALTO",
      origen_contacto: "REFERENCIA",
      fecha_primer_contacto: "2025-01-15",
      estado_prospecto: "INTERESADO",
      probabilidad_inscripcion: 85,
      observaciones: "Familia muy interesada, solicitan información sobre becas académicas",
      estudiantes_prospecto: [
        {
          nombre: "Carlos Roberto Mendoza Vázquez",
          edad: 6,
          grado_interes: "1ro Primaria",
          seccion_interes: "PRIMARIA"
        },
        {
          nombre: "Ana Patricia Mendoza Vázquez", 
          edad: 4,
          grado_interes: "Kinder 2",
          seccion_interes: "KINDER"
        }
      ],
      contactos: [
        {
          tipo: "LLAMADA",
          fecha: "2025-01-15",
          resultado: "EXITOSO",
          descripcion: "Primera llamada, muy interesados"
        },
        {
          tipo: "VISITA",
          fecha: "2025-01-18",
          resultado: "EXITOSO",
          descripcion: "Visita guiada a las instalaciones"
        }
      ]
    },
    {
      id: 2,
      nombre_padre: "Luis Alberto González",
      nombre_madre: "María José Hernández",
      telefono_principal: "55-9876-5432",
      telefono_secundario: "",
      correo_principal: "luis.gonzalez@corporativo.mx",
      correo_secundario: "majo.hernandez@yahoo.com",
      estado_economico: "MEDIO",
      origen_contacto: "WEB",
      fecha_primer_contacto: "2025-01-10",
      estado_prospecto: "CONTACTADO",
      probabilidad_inscripcion: 60,
      observaciones: "Buscan colegio cerca de su zona de trabajo",
      estudiantes_prospecto: [
        {
          nombre: "Diego González Hernández",
          edad: 12,
          grado_interes: "1ro Secundaria",
          seccion_interes: "SECUNDARIA"
        }
      ],
      contactos: [
        {
          tipo: "EMAIL",
          fecha: "2025-01-10",
          resultado: "EXITOSO",
          descripcion: "Envío de información inicial"
        }
      ]
    },
    {
      id: 3,
      nombre_padre: "Fernando Javier López",
      nombre_madre: "Carmen Alicia Torres",
      telefono_principal: "55-5555-7777",
      telefono_secundario: "55-7777-5555",
      correo_principal: "fernando.lopez@startup.mx",
      correo_secundario: "carmen.torres@consultora.com",
      estado_economico: "ALTO",
      origen_contacto: "EVENTO",
      fecha_primer_contacto: "2025-01-05",
      estado_prospecto: "INSCRITO",
      probabilidad_inscripcion: 100,
      observaciones: "Inscripción completada para ciclo 2025-2026",
      estudiantes_prospecto: [
        {
          nombre: "Sofía López Torres",
          edad: 16,
          grado_interes: "1ro Bachillerato",
          seccion_interes: "BACHILLERATO"
        }
      ],
      contactos: [
        {
          tipo: "EVENTO",
          fecha: "2025-01-05",
          resultado: "EXITOSO",
          descripcion: "Casa abierta - muy interesados"
        },
        {
          tipo: "LLAMADA",
          fecha: "2025-01-08",
          resultado: "EXITOSO",
          descripcion: "Seguimiento post evento"
        }
      ]
    },
    {
      id: 4,
      nombre_padre: "Miguel Ángel Ruiz",
      nombre_madre: "Diana Patricia Morales",
      telefono_principal: "55-3333-9999",
      telefono_secundario: "",
      correo_principal: "miguel.ruiz@internacional.com",
      correo_secundario: "",
      estado_economico: "MEDIO",
      origen_contacto: "PUBLICIDAD",
      fecha_primer_contacto: "2024-12-20",
      estado_prospecto: "PERDIDO",
      probabilidad_inscripcion: 10,
      observaciones: "Se inscribieron en otra institución por ubicación",
      estudiantes_prospecto: [
        {
          nombre: "Alejandro Ruiz Morales",
          edad: 8,
          grado_interes: "3ro Primaria",
          seccion_interes: "PRIMARIA"
        }
      ],
      contactos: [
        {
          tipo: "LLAMADA",
          fecha: "2024-12-20",
          resultado: "SIN_RESPUESTA",
          descripcion: "No contestan llamadas"
        }
      ]
    },
    {
      id: 5,
      nombre_padre: "Arturo Daniel Castillo",
      nombre_madre: "Gabriela Ivonne Jiménez",
      telefono_principal: "55-1111-2222",
      telefono_secundario: "55-2222-1111",
      correo_principal: "arturo.castillo@bank.mx",
      correo_secundario: "gaby.jimenez@design.mx",
      estado_economico: "ALTO",
      origen_contacto: "REFERENCIA",
      fecha_primer_contacto: "2025-01-20",
      estado_prospecto: "NUEVO",
      probabilidad_inscripcion: 50,
      observaciones: "Referencia de familia actual, aún evalúan opciones",
      estudiantes_prospecto: [
        {
          nombre: "Valeria Castillo Jiménez",
          edad: 5,
          grado_interes: "Kinder 3",
          seccion_interes: "KINDER"
        },
        {
          nombre: "Santiago Castillo Jiménez",
          edad: 3,
          grado_interes: "Kinder 1",
          seccion_interes: "KINDER"
        }
      ],
      contactos: []
    }
  ];

  const filteredProspectos = prospectos.filter(prospecto => {
    const matchesEstado = selectedEstado === "all" || prospecto.estado_prospecto === selectedEstado;
    const matchesOrigen = selectedOrigen === "all" || prospecto.origen_contacto === selectedOrigen;
    return matchesEstado && matchesOrigen;
  });

  const estadisticas = {
    totalProspectos: prospectos.length,
    prospectosCerrados: prospectos.filter(p => p.estado_prospecto === "INSCRITO").length,
    promedioConversion: (prospectos.filter(p => p.estado_prospecto === "INSCRITO").length / prospectos.length) * 100,
    valorPotencial: prospectos.reduce((sum, p) => sum + (p.estudiantes_prospecto.length * 500000 * (p.probabilidad_inscripcion / 100)), 0) / 100
  };

  const getEstadoBadge = (estado: string) => {
    const colors = {
      NUEVO: "bg-blue-100 text-blue-800",
      CONTACTADO: "bg-yellow-100 text-yellow-800",
      INTERESADO: "bg-orange-100 text-orange-800",
      INSCRITO: "bg-green-100 text-green-800",
      PERDIDO: "bg-red-100 text-red-800"
    };
    
    const icons = {
      NUEVO: <Clock className="w-3 h-3 mr-1" />,
      CONTACTADO: <Phone className="w-3 h-3 mr-1" />,
      INTERESADO: <TrendingUp className="w-3 h-3 mr-1" />,
      INSCRITO: <UserCheck className="w-3 h-3 mr-1" />,
      PERDIDO: <AlertTriangle className="w-3 h-3 mr-1" />
    };
    
    return (
      <Badge className={colors[estado as keyof typeof colors] || "bg-gray-100 text-gray-800"}>
        {icons[estado as keyof typeof icons]}
        {estado}
      </Badge>
    );
  };

  const getEstadoEconomicoBadge = (estado: string) => {
    const colors = {
      ALTO: "bg-green-100 text-green-800",
      MEDIO: "bg-yellow-100 text-yellow-800",
      BAJO: "bg-red-100 text-red-800"
    };
    
    return (
      <Badge className={colors[estado as keyof typeof colors] || "bg-gray-100 text-gray-800"}>
        {estado}
      </Badge>
    );
  };

  const getProbabilidadColor = (probabilidad: number) => {
    if (probabilidad >= 80) return "text-green-600";
    if (probabilidad >= 50) return "text-orange-600";
    return "text-red-600";
  };

  // Funciones para manejar acciones de contacto
  const handlePhoneCall = (prospecto: any) => {
    const phone = prospecto.telefono_principal || prospecto.telefono_secundario;
    if (phone) {
      window.open(`tel:${phone}`, '_self');
      toast({
        title: "Llamada iniciada",
        description: `Llamando a ${prospecto.nombre_padre} - ${phone}`,
      });
    } else {
      toast({
        title: "Sin teléfono",
        description: "No hay número de teléfono registrado",
        variant: "destructive",
      });
    }
  };

  const handleSendEmail = (prospecto: any) => {
    const email = prospecto.correo_principal || prospecto.correo_secundario;
    if (email) {
      const subject = encodeURIComponent(`Seguimiento - ${prospecto.nombre_padre} ${prospecto.nombre_madre}`);
      const body = encodeURIComponent(`Estimado/a ${prospecto.nombre_padre},\n\nEsperamos que se encuentre bien. Nos comunicamos para darle seguimiento a su interés en nuestro colegio...\n\nSaludos cordiales,\nEquipo de Admisiones`);
      window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_self');
      toast({
        title: "Email abierto",
        description: `Enviando email a ${email}`,
      });
    } else {
      toast({
        title: "Sin email",
        description: "No hay correo electrónico registrado",
        variant: "destructive",
      });
    }
  };

  const handleScheduleAppointment = (prospecto: any) => {
    setSelectedProspecto(prospecto);
    setShowAddActivityModal(true);
    toast({
      title: "Programar cita",
      description: `Programando cita con ${prospecto.nombre_padre}`,
    });
  };

  const handleShowTimeline = (prospecto: any) => {
    setSelectedProspecto(prospecto);
    setShowTimelineModal(true);
  };

  const handleAddActivity = () => {
    if (!newActivity.tipo || !newActivity.descripcion) {
      toast({
        title: "Campos requeridos",
        description: "Por favor complete todos los campos",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Actividad agregada",
      description: `${newActivity.tipo} programada exitosamente`,
    });

    setNewActivity({
      tipo: "",
      descripcion: "",
      resultado: "",
      fecha_programada: ""
    });
    setShowAddActivityModal(false);
  };

  const getActivityIcon = (tipo: string) => {
    switch (tipo) {
      case "LLAMADA":
        return <Phone className="w-4 h-4" />;
      case "EMAIL":
        return <Mail className="w-4 h-4" />;
      case "VISITA":
        return <Users className="w-4 h-4" />;
      case "EVENTO":
        return <Calendar className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const getActivityColor = (resultado: string) => {
    switch (resultado) {
      case "EXITOSO":
        return "bg-green-100 border-green-300 text-green-800";
      case "PENDIENTE":
        return "bg-yellow-100 border-yellow-300 text-yellow-800";
      case "FALLIDO":
        return "bg-red-100 border-red-300 text-red-800";
      default:
        return "bg-gray-100 border-gray-300 text-gray-800";
    }
  };

  return (
    <div >
      <div >
        
        <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">CRM Escolar</h1>
          <p className="text-slate-600">Gestión de prospectos y familias interesadas</p>
            </div>
            <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
              <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Nuevo Prospecto
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Registrar nueva familia prospecto</DialogTitle>
                </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
              <div>
                    <Label>Nombre del padre</Label>
                    <Input placeholder="Nombre completo del padre" />
                  </div>
              <div>
                    <Label>Nombre de la madre</Label>
                    <Input placeholder="Nombre completo de la madre" />
                  </div>
              <div>
                    <Label>Teléfono principal</Label>
                    <Input placeholder="55-1234-5678" />
                  </div>
              <div>
                    <Label>Teléfono secundario</Label>
                    <Input placeholder="55-8765-4321" />
                  </div>
              <div>
                    <Label>Correo principal</Label>
                    <Input type="email" placeholder="correo@ejemplo.com" />
                  </div>
              <div>
                    <Label>Correo secundario</Label>
                    <Input type="email" placeholder="correo2@ejemplo.com" />
                  </div>
              <div>
                    <Label>Estado económico</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar nivel..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALTO">Alto</SelectItem>
                        <SelectItem value="MEDIO">Medio</SelectItem>
                        <SelectItem value="BAJO">Bajo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
              <div>
                    <Label>Origen del contacto</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="¿Cómo nos conoció?" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="REFERENCIA">Referencia</SelectItem>
                        <SelectItem value="WEB">Página web</SelectItem>
                        <SelectItem value="EVENTO">Evento/Casa abierta</SelectItem>
                        <SelectItem value="PUBLICIDAD">Publicidad</SelectItem>
                        <SelectItem value="REDES_SOCIALES">Redes sociales</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
              <div>
                    <Label>Fecha primer contacto</Label>
                    <Input type="date" />
                  </div>
              <div>
                    <Label>Probabilidad de inscripción (%)</Label>
                    <Input type="number" min="0" max="100" placeholder="50" />
                  </div>
              <div className="md:col-span-2">
                    <Label>Dirección</Label>
                    <Input placeholder="Dirección completa de la familia" />
                  </div>
              <div className="md:col-span-2">
                    <Label>Observaciones</Label>
                    <Textarea placeholder="Observaciones sobre la familia y el seguimiento..." />
                  </div>
                </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowAddModal(false)}>
                    Cancelar
                  </Button>
              <Button className="bg-blue-600 hover:bg-blue-700">
                    Registrar Prospecto
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Estadísticas del CRM */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="p-4 text-center">
                <Users className="w-8 h-8 text-blue-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.totalProspectos}</div>
            <div className="text-sm text-slate-600">Total prospectos</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <UserCheck className="w-8 h-8 text-green-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.prospectosCerrados}</div>
            <div className="text-sm text-slate-600">Inscritos</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <TrendingUp className="w-8 h-8 text-purple-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.promedioConversion.toFixed(1)}%</div>
            <div className="text-sm text-slate-600">Tasa conversión</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">${estadisticas.valorPotencial.toLocaleString()}</div>
            <div className="text-sm text-slate-600">Valor potencial</div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="prospectos" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="prospectos">Lista de prospectos</TabsTrigger>
              <TabsTrigger value="seguimiento">Seguimiento</TabsTrigger>
              <TabsTrigger value="reportes">Reportes CRM</TabsTrigger>
            </TabsList>

            <TabsContent value="prospectos">
              {/* Filtros */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Filtros de prospectos</CardTitle>
                </CardHeader>
                <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                      <Label>Estado del prospecto</Label>
                      <Select value={selectedEstado} onValueChange={setSelectedEstado}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos los estados</SelectItem>
                          <SelectItem value="NUEVO">Nuevo</SelectItem>
                          <SelectItem value="CONTACTADO">Contactado</SelectItem>
                          <SelectItem value="INTERESADO">Interesado</SelectItem>
                          <SelectItem value="INSCRITO">Inscrito</SelectItem>
                          <SelectItem value="PERDIDO">Perdido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                <div>
                      <Label>Origen del contacto</Label>
                      <Select value={selectedOrigen} onValueChange={setSelectedOrigen}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos los orígenes</SelectItem>
                          <SelectItem value="REFERENCIA">Referencia</SelectItem>
                          <SelectItem value="WEB">Página web</SelectItem>
                          <SelectItem value="EVENTO">Evento</SelectItem>
                          <SelectItem value="PUBLICIDAD">Publicidad</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                <div className="flex items-end">
                  <Button variant="outline" onClick={() => {
                        setSelectedEstado("all");
                        setSelectedOrigen("all");
                      }}>
                        Limpiar filtros
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Familias prospecto ({filteredProspectos.length})</CardTitle>
                </CardHeader>
                <CardContent>
              <div className="space-y-4">
                    {filteredProspectos.map((prospecto) => (
                  <div key={prospecto.id} className="p-4 border rounded-lg hover:bg-slate-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium">
                                {prospecto.nombre_padre} & {prospecto.nombre_madre}
                              </h3>
                              {getEstadoBadge(prospecto.estado_prospecto)}
                              {getEstadoEconomicoBadge(prospecto.estado_economico)}
                            </div>
                        <div className="text-sm text-slate-600 mb-2">
                              <strong>Estudiantes prospecto:</strong> {prospecto.estudiantes_prospecto.map(est => 
                                `${est.nombre} (${est.grado_interes})`
                              ).join(", ")}
                            </div>
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {prospecto.telefono_principal}
                              </span>
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {prospecto.correo_principal}
                              </span>
                              <span>Origen: {prospecto.origen_contacto}</span>
                              <span>Contactos: {prospecto.contactos.length}</span>
                            </div>
                            {prospecto.observaciones && (
                          <p className="text-sm text-slate-600 mt-2 bg-slate-100 p-2 rounded">
                                {prospecto.observaciones}
                              </p>
                            )}
                          </div>
                      <div className="text-right">
                        <div className={`text-2xl font-bold ${getProbabilidadColor(prospecto.probabilidad_inscripcion)}`}>
                              {prospecto.probabilidad_inscripcion}%
                            </div>
                        <div className="text-xs text-slate-500">Probabilidad</div>
                        <div className="flex gap-1 mt-2">
                          <Button size="sm" variant="outline" onClick={() => handlePhoneCall(prospecto)} title="Llamar">
                                <Phone className="w-3 h-3" />
                              </Button>
                          <Button size="sm" variant="outline" onClick={() => handleSendEmail(prospecto)} title="Enviar email">
                                <Mail className="w-3 h-3" />
                              </Button>
                          <Button size="sm" variant="outline" onClick={() => handleScheduleAppointment(prospecto)} title="Programar cita">
                                <Calendar className="w-3 h-3" />
                              </Button>
                          <Button size="sm" variant="outline" onClick={() => handleShowTimeline(prospecto)} title="Ver timeline">
                                <TrendingUp className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="seguimiento">
              <Card>
                <CardHeader>
                  <CardTitle>Programar seguimiento</CardTitle>
                </CardHeader>
                <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                      <Label>Seleccionar prospecto</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Buscar familia..." />
                        </SelectTrigger>
                        <SelectContent>
                          {prospectos.filter(p => p.estado_prospecto !== "INSCRITO" && p.estado_prospecto !== "PERDIDO").map(prospecto => (
                            <SelectItem key={prospecto.id} value={prospecto.id.toString()}>
                              {prospecto.nombre_padre} & {prospecto.nombre_madre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                <div>
                      <Label>Tipo de contacto</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar tipo..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="LLAMADA">Llamada telefónica</SelectItem>
                          <SelectItem value="EMAIL">Envío de email</SelectItem>
                          <SelectItem value="VISITA">Visita guiada</SelectItem>
                          <SelectItem value="EVENTO">Invitación a evento</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                <div>
                      <Label>Fecha programada</Label>
                      <Input type="datetime-local" />
                    </div>
                <div>
                      <Label>Responsable</Label>
                      <Input placeholder="Nombre del responsable" />
                    </div>
                <div className="md:col-span-2">
                      <Label>Objetivo del contacto</Label>
                      <Textarea placeholder="¿Qué se espera lograr con este contacto?" />
                    </div>
                  </div>
              <Button className="mt-4 bg-blue-600 hover:bg-blue-700">
                    <Calendar className="w-4 h-4 mr-2" />
                    Programar seguimiento
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="reportes">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Embudo de conversión</CardTitle>
                  </CardHeader>
                  <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                        <span>Nuevos prospectos:</span>
                        <span className="font-semibold">5</span>
                      </div>
                  <div className="flex justify-between">
                        <span>Contactados:</span>
                        <span className="font-semibold">4</span>
                      </div>
                  <div className="flex justify-between">
                        <span>Interesados:</span>
                        <span className="font-semibold">2</span>
                      </div>
                  <div className="flex justify-between">
                        <span>Inscritos:</span>
                        <span className="font-semibold text-green-600">1</span>
                      </div>
                      <hr />
                  <div className="flex justify-between font-bold">
                        <span>Tasa de conversión:</span>
                        <span>20%</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Próximas acciones</CardTitle>
                  </CardHeader>
                  <CardContent>
                <div className="space-y-3">
                  <Button className="w-full" variant="outline">
                        Generar reporte de prospección
                      </Button>
                  <Button className="w-full" variant="outline">
                        Exportar base de prospectos
                      </Button>
                  <Button className="w-full" variant="outline">
                        Analizar fuentes de contacto
                      </Button>
                  <Button className="w-full bg-blue-600 hover:bg-blue-700">
                        Programar campaña masiva
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>

          {/* Modal Timeline de Actividades - Similar a HubSpot */}
          <Dialog open={showTimelineModal} onOpenChange={setShowTimelineModal}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  Timeline de Actividades - {selectedProspecto?.nombre_padre} & {selectedProspecto?.nombre_madre}
                </DialogTitle>
              </DialogHeader>
              
              <div className="py-4">
                {/* Información del prospecto */}
                <div className="bg-slate-50 p-4 rounded-lg mb-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Phone className="w-4 h-4 text-slate-600" />
                        <span className="font-medium">Teléfonos:</span>
                      </div>
                      <div className="text-sm text-slate-600">
                        <div>{selectedProspecto?.telefono_principal}</div>
                        {selectedProspecto?.telefono_secundario && (
                          <div>{selectedProspecto?.telefono_secundario}</div>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Mail className="w-4 h-4 text-slate-600" />
                        <span className="font-medium">Emails:</span>
                      </div>
                      <div className="text-sm text-slate-600">
                        <div>{selectedProspecto?.correo_principal}</div>
                        {selectedProspecto?.correo_secundario && (
                          <div>{selectedProspecto?.correo_secundario}</div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-4">
                    {selectedProspecto && getEstadoBadge(selectedProspecto.estado_prospecto)}
                    {selectedProspecto && getEstadoEconomicoBadge(selectedProspecto.estado_economico)}
                    <span className="text-sm text-slate-600">
                      Probabilidad: <span className={`font-bold ${getProbabilidadColor(selectedProspecto?.probabilidad_inscripcion || 0)}`}>
                        {selectedProspecto?.probabilidad_inscripcion}%
                      </span>
                    </span>
                  </div>
                </div>

                {/* Botón para agregar nueva actividad */}
                <div className="mb-6">
                  <Button 
                    onClick={() => setShowAddActivityModal(true)}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Agregar Actividad
                  </Button>
                </div>

                {/* Timeline de actividades */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-slate-900">Historial de Actividades</h3>
                  
                  {selectedProspecto?.contactos && selectedProspecto.contactos.length > 0 ? (
                    <div className="relative">
                      {/* Línea vertical del timeline */}
                      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200"></div>
                      
                      {selectedProspecto.contactos.map((contacto: any, index: number) => (
                        <div key={index} className="relative flex items-start gap-4 pb-6">
                          {/* Icono de la actividad */}
                          <div className={`flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center ${getActivityColor(contacto.resultado)}`}>
                            {getActivityIcon(contacto.tipo)}
                          </div>
                          
                          {/* Contenido de la actividad */}
                          <div className="flex-1 min-w-0">
                            <div className="bg-white border rounded-lg p-4 shadow-sm">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-slate-900">{contacto.tipo}</span>
                                  <Badge className={getActivityColor(contacto.resultado)}>
                                    {contacto.resultado}
                                  </Badge>
                                </div>
                                <span className="text-sm text-slate-500">{contacto.fecha}</span>
                              </div>
                              <p className="text-sm text-slate-600">{contacto.descripcion}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-500">
                      <Clock className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                      <p>No hay actividades registradas</p>
                      <p className="text-sm">Agrega la primera actividad para comenzar el seguimiento</p>
                    </div>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Modal para Agregar Nueva Actividad */}
          <Dialog open={showAddActivityModal} onOpenChange={setShowAddActivityModal}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Programar Nueva Actividad</DialogTitle>
              </DialogHeader>
              
              <div className="py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Tipo de actividad</Label>
                    <Select value={newActivity.tipo} onValueChange={(value) => setNewActivity(prev => ({...prev, tipo: value}))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tipo..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LLAMADA">Llamada telefónica</SelectItem>
                        <SelectItem value="EMAIL">Envío de email</SelectItem>
                        <SelectItem value="VISITA">Visita guiada</SelectItem>
                        <SelectItem value="EVENTO">Invitación a evento</SelectItem>
                        <SelectItem value="REUNION">Reunión</SelectItem>
                        <SelectItem value="SEGUIMIENTO">Seguimiento general</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label>Estado</Label>
                    <Select value={newActivity.resultado} onValueChange={(value) => setNewActivity(prev => ({...prev, resultado: value}))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar estado..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PENDIENTE">Pendiente</SelectItem>
                        <SelectItem value="EXITOSO">Exitoso</SelectItem>
                        <SelectItem value="FALLIDO">Fallido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="md:col-span-2">
                    <Label>Fecha y hora programada</Label>
                    <Input 
                      type="datetime-local" 
                      value={newActivity.fecha_programada}
                      onChange={(e) => setNewActivity(prev => ({...prev, fecha_programada: e.target.value}))}
                    />
                  </div>
                  
                  <div className="md:col-span-2">
                    <Label>Descripción de la actividad</Label>
                    <Textarea 
                      placeholder="Describe el objetivo y detalles de esta actividad..."
                      value={newActivity.descripcion}
                      onChange={(e) => setNewActivity(prev => ({...prev, descripcion: e.target.value}))}
                      rows={4}
                    />
                  </div>
                </div>
                
                <div className="flex justify-end gap-2 mt-6">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowAddActivityModal(false)}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    onClick={handleAddActivity}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Calendar className="w-4 h-4 mr-2" />
                    Programar Actividad
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}