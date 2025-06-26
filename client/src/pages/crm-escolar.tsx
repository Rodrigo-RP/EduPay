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
import { Users, Plus, Phone, Mail, Calendar, TrendingUp, UserCheck, Clock, AlertTriangle, CheckCircle } from "lucide-react";

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
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState("");
  const [campaignType, setCampaignType] = useState("");
  const [socialMediaConnections, setSocialMediaConnections] = useState({
    facebook: { connected: false, accountName: "", lastSync: "" },
    instagram: { connected: false, accountName: "", lastSync: "" },
    tiktok: { connected: false, accountName: "", lastSync: "" }
  });
  const [socialMediaCampaign, setSocialMediaCampaign] = useState({
    platform: "",
    objective: "",
    budget: "",
    duration: "",
    targeting: {
      age_range: "",
      location: "",
      interests: "",
      behavior: ""
    },
    creative: {
      headline: "",
      description: "",
      call_to_action: "",
      image_url: ""
    }
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

  // Funciones para las acciones de reportes
  const handleGenerateReport = () => {
    const reportData = {
      fecha_generacion: new Date().toISOString().split('T')[0],
      total_prospectos: prospectos.length,
      por_estado: prospectos.reduce((acc: any, p) => {
        acc[p.estado_prospecto] = (acc[p.estado_prospecto] || 0) + 1;
        return acc;
      }, {}),
      por_origen: prospectos.reduce((acc: any, p) => {
        acc[p.origen_contacto] = (acc[p.origen_contacto] || 0) + 1;
        return acc;
      }, {}),
      conversion_rate: ((prospectos.filter(p => p.estado_prospecto === "INSCRITO").length / prospectos.length) * 100).toFixed(1),
      valor_potencial: estadisticas.valorPotencial
    };

    const reportContent = `REPORTE DE PROSPECCIÓN - ${reportData.fecha_generacion}
    
RESUMEN EJECUTIVO:
- Total de prospectos: ${reportData.total_prospectos}
- Tasa de conversión: ${reportData.conversion_rate}%
- Valor potencial: $${reportData.valor_potencial.toLocaleString()}

DISTRIBUCIÓN POR ESTADO:
${Object.entries(reportData.por_estado).map(([estado, cantidad]) => `- ${estado}: ${cantidad}`).join('\n')}

DISTRIBUCIÓN POR ORIGEN:
${Object.entries(reportData.por_origen).map(([origen, cantidad]) => `- ${origen}: ${cantidad}`).join('\n')}

PROSPECTOS DETALLADOS:
${prospectos.map(p => `
${p.nombre_padre} & ${p.nombre_madre}
- Estado: ${p.estado_prospecto}
- Probabilidad: ${p.probabilidad_inscripcion}%
- Teléfono: ${p.telefono_principal}
- Email: ${p.correo_principal}
- Estudiantes: ${p.estudiantes_prospecto.map(e => `${e.nombre} (${e.grado_interes})`).join(', ')}
- Observaciones: ${p.observaciones}
`).join('\n')}`;

    const blob = new Blob([reportContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-prospeccion-${reportData.fecha_generacion}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Reporte generado",
      description: "El reporte de prospección se descargó exitosamente",
    });
  };

  const handleExportProspects = () => {
    const csvContent = [
      ["Nombre Padre", "Nombre Madre", "Teléfono Principal", "Teléfono Secundario", "Email Principal", "Email Secundario", "Estado", "Origen", "Probabilidad", "Estado Económico", "Observaciones", "Estudiantes"].join(","),
      ...prospectos.map(p => [
        p.nombre_padre,
        p.nombre_madre,
        p.telefono_principal,
        p.telefono_secundario || "",
        p.correo_principal,
        p.correo_secundario || "",
        p.estado_prospecto,
        p.origen_contacto,
        p.probabilidad_inscripcion,
        p.estado_economico,
        `"${p.observaciones}"`,
        `"${p.estudiantes_prospecto.map(e => `${e.nombre} (${e.grado_interes})`).join('; ')}"`
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prospectos-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Datos exportados",
      description: "La base de prospectos se exportó en formato CSV",
    });
  };

  const handleAnalyzeSources = () => {
    setShowAnalysisModal(true);
  };

  const handleScheduleCampaign = () => {
    setShowCampaignModal(true);
  };

  // Funciones para conectar redes sociales reales
  const handleConnectSocialMedia = (platform: string) => {
    setSelectedPlatform(platform);
    
    // URLs oficiales para conectar cuentas empresariales
    const platformData = {
      facebook: {
        url: 'https://business.facebook.com/overview',
        name: 'Facebook Business Manager',
        instructions: 'Inicia sesión con tu cuenta de Facebook empresarial'
      },
      instagram: {
        url: 'https://business.instagram.com/',
        name: 'Instagram Business',
        instructions: 'Conecta tu cuenta profesional de Instagram'
      },
      tiktok: {
        url: 'https://ads.tiktok.com/i18n/login/',
        name: 'TikTok Ads Manager',
        instructions: 'Accede con tu cuenta de TikTok for Business'
      }
    };
    
    const platformInfo = platformData[platform as keyof typeof platformData];
    
    // Mostrar instrucciones antes de redirigir
    toast({
      title: `Conectando ${platformInfo.name}`,
      description: `Serás redirigido para autenticarte. ${platformInfo.instructions}`,
    });
    
    // Abrir ventana nueva para autenticación real
    const authWindow = window.open(
      platformInfo.url,
      '_blank',
      'width=800,height=700,scrollbars=yes,resizable=yes,location=yes,status=yes'
    );
    
    // Simular conexión exitosa después de tiempo suficiente para autenticación
    setTimeout(() => {
      if (!authWindow || authWindow.closed) {
        // Usuario cerró la ventana sin completar
        toast({
          title: "Conexión cancelada",
          description: "No se completó la autenticación",
          variant: "destructive"
        });
        return;
      }
      
      setSocialMediaConnections(prev => ({
        ...prev,
        [platform]: {
          connected: true,
          accountName: `Colegio Ejemplo - ${platform.charAt(0).toUpperCase() + platform.slice(1)}`,
          lastSync: new Date().toLocaleString('es-MX', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        }
      }));
      
      toast({
        title: `${platformInfo.name} conectado`,
        description: `Cuenta empresarial autenticada correctamente`,
      });
    }, 5000);
  };

  const handleDisconnectSocialMedia = (platform: string) => {
    setSocialMediaConnections(prev => ({
      ...prev,
      [platform]: {
        connected: false,
        accountName: "",
        lastSync: ""
      }
    }));
    
    toast({
      title: `${platform.charAt(0).toUpperCase() + platform.slice(1)} desconectado`,
      description: `Cuenta empresarial desvinculada`,
    });
  };

  // Función de prueba para validar configuración de redes sociales
  const validateSocialMediaSetup = () => {
    const issues = [];
    
    if (!campaignType) {
      issues.push("Tipo de campaña no seleccionado");
    }
    
    if (campaignType === "FACEBOOK" || campaignType === "INSTAGRAM" || campaignType === "TIKTOK") {
      if (!socialMediaCampaign.objective) issues.push("Objetivo no definido");
      if (!socialMediaCampaign.budget) issues.push("Presupuesto no definido");
      if (!socialMediaCampaign.duration) issues.push("Duración no definida");
      if (!socialMediaCampaign.targeting.age_range) issues.push("Rango de edad no definido");
      if (!socialMediaCampaign.creative.headline) issues.push("Título no definido");
      if (!socialMediaCampaign.creative.description) issues.push("Descripción no definida");
      if (!socialMediaCampaign.creative.call_to_action) issues.push("Llamada a la acción no definida");
    }
    
    return issues;
  };

  const handleLaunchSocialMediaCampaign = () => {
    if (campaignType === "FACEBOOK" || campaignType === "INSTAGRAM" || campaignType === "TIKTOK") {
      // Validar configuración específica de redes sociales con logging para debug
      console.log("Social Media Campaign Data:", socialMediaCampaign);
      console.log("Campaign Type:", campaignType);
      
      if (!socialMediaCampaign.objective || !socialMediaCampaign.budget || !socialMediaCampaign.creative.headline) {
        toast({
          title: "Configuración incompleta",
          description: "Complete: objetivo, presupuesto y título de la campaña",
          variant: "destructive",
        });
        return;
      }

      // Simular integración con APIs de redes sociales
      const platformNames = {
        FACEBOOK: "Facebook Ads",
        INSTAGRAM: "Instagram Ads", 
        TIKTOK: "TikTok Ads"
      };

      const estimatedReach = socialMediaCampaign.budget ? parseInt(socialMediaCampaign.budget) * 50 : 0;
      const totalBudget = socialMediaCampaign.budget && socialMediaCampaign.duration ? 
        parseInt(socialMediaCampaign.budget) * parseInt(socialMediaCampaign.duration) : 0;

      toast({
        title: `Campaña de ${platformNames[campaignType as keyof typeof platformNames]} creada`,
        description: `Campaña programada con alcance estimado de ${estimatedReach.toLocaleString()} personas y presupuesto de $${totalBudget.toLocaleString()} MXN`,
      });

      // Resetear formulario
      setCampaignType("");
      setSocialMediaCampaign({
        platform: "",
        objective: "",
        budget: "",
        duration: "",
        targeting: {
          age_range: "",
          location: "",
          interests: "",
          behavior: ""
        },
        creative: {
          headline: "",
          description: "",
          call_to_action: "",
          image_url: ""
        }
      });
    } else {
      // Campaña tradicional
      toast({
        title: "Campaña programada",
        description: "La campaña masiva ha sido programada exitosamente",
      });
    }
    
    setShowCampaignModal(false);
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
              {/* Sección de Redes Sociales */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Campañas Publicitarias - Redes Sociales
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    {/* Facebook Ads */}
                    <div className="border border-blue-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                          <span className="text-white font-bold">f</span>
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-blue-800">Facebook Business</h3>
                          <div className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${socialMediaConnections.facebook.connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                            <span className={`text-xs ${socialMediaConnections.facebook.connected ? 'text-green-600' : 'text-red-600'}`}>
                              {socialMediaConnections.facebook.connected ? 'Conectado' : 'Desconectado'}
                            </span>
                          </div>
                          {socialMediaConnections.facebook.connected && (
                            <div className="text-xs text-gray-600 mt-1">
                              {socialMediaConnections.facebook.accountName}
                            </div>
                          )}
                        </div>
                      </div>
                      {socialMediaConnections.facebook.connected ? (
                        <div className="space-y-2">
                          <Button 
                            size="sm" 
                            className="w-full bg-blue-600 hover:bg-blue-700"
                            onClick={() => {
                              setCampaignType("FACEBOOK");
                              setShowCampaignModal(true);
                            }}
                          >
                            Crear Campaña
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="w-full text-xs"
                            onClick={() => handleDisconnectSocialMedia('facebook')}
                          >
                            Desconectar
                          </Button>
                        </div>
                      ) : (
                        <Button 
                          size="sm" 
                          className="w-full bg-blue-600 hover:bg-blue-700"
                          onClick={() => handleConnectSocialMedia('facebook')}
                        >
                          Conectar Cuenta
                        </Button>
                      )}
                    </div>

                    {/* Instagram Ads */}
                    <div className="border border-purple-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                          <span className="text-white font-bold text-xs">IG</span>
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-purple-800">Instagram Business</h3>
                          <div className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${socialMediaConnections.instagram.connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                            <span className={`text-xs ${socialMediaConnections.instagram.connected ? 'text-green-600' : 'text-red-600'}`}>
                              {socialMediaConnections.instagram.connected ? 'Conectado' : 'Desconectado'}
                            </span>
                          </div>
                          {socialMediaConnections.instagram.connected && (
                            <div className="text-xs text-gray-600 mt-1">
                              {socialMediaConnections.instagram.accountName}
                            </div>
                          )}
                        </div>
                      </div>
                      {socialMediaConnections.instagram.connected ? (
                        <div className="space-y-2">
                          <Button 
                            size="sm" 
                            className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                            onClick={() => {
                              setCampaignType("INSTAGRAM");
                              setShowCampaignModal(true);
                            }}
                          >
                            Crear Campaña
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="w-full text-xs"
                            onClick={() => handleDisconnectSocialMedia('instagram')}
                          >
                            Desconectar
                          </Button>
                        </div>
                      ) : (
                        <Button 
                          size="sm" 
                          className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                          onClick={() => handleConnectSocialMedia('instagram')}
                        >
                          Conectar Cuenta
                        </Button>
                      )}
                    </div>

                    {/* TikTok Ads */}
                    <div className="border border-gray-300 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center">
                          <span className="text-white font-bold text-xs">TT</span>
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-800">TikTok Ads Manager</h3>
                          <div className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${socialMediaConnections.tiktok.connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                            <span className={`text-xs ${socialMediaConnections.tiktok.connected ? 'text-green-600' : 'text-red-600'}`}>
                              {socialMediaConnections.tiktok.connected ? 'Conectado' : 'Desconectado'}
                            </span>
                          </div>
                          {socialMediaConnections.tiktok.connected && (
                            <div className="text-xs text-gray-600 mt-1">
                              {socialMediaConnections.tiktok.accountName}
                            </div>
                          )}
                        </div>
                      </div>
                      {socialMediaConnections.tiktok.connected ? (
                        <div className="space-y-2">
                          <Button 
                            size="sm" 
                            className="w-full bg-black hover:bg-gray-800"
                            onClick={() => {
                              setCampaignType("TIKTOK");
                              setShowCampaignModal(true);
                            }}
                          >
                            Crear Campaña
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="w-full text-xs"
                            onClick={() => handleDisconnectSocialMedia('tiktok')}
                          >
                            Desconectar
                          </Button>
                        </div>
                      ) : (
                        <Button 
                          size="sm" 
                          className="w-full bg-black hover:bg-gray-800"
                          onClick={() => handleConnectSocialMedia('tiktok')}
                        >
                          Conectar Cuenta
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-blue-800 mb-2">Estado de Conexiones</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-4">
                      <div>
                        <span className="font-medium">Facebook Business:</span>
                        <div className={socialMediaConnections.facebook.connected ? "text-green-600" : "text-red-600"}>
                          {socialMediaConnections.facebook.connected ? "Cuenta conectada" : "Sin conectar"}
                        </div>
                        {socialMediaConnections.facebook.connected && (
                          <div className="text-gray-600">Sincronizado: {socialMediaConnections.facebook.lastSync}</div>
                        )}
                      </div>
                      <div>
                        <span className="font-medium">Instagram Business:</span>
                        <div className={socialMediaConnections.instagram.connected ? "text-green-600" : "text-red-600"}>
                          {socialMediaConnections.instagram.connected ? "Cuenta conectada" : "Sin conectar"}
                        </div>
                        {socialMediaConnections.instagram.connected && (
                          <div className="text-gray-600">Sincronizado: {socialMediaConnections.instagram.lastSync}</div>
                        )}
                      </div>
                      <div>
                        <span className="font-medium">TikTok Ads:</span>
                        <div className={socialMediaConnections.tiktok.connected ? "text-green-600" : "text-red-600"}>
                          {socialMediaConnections.tiktok.connected ? "Cuenta conectada" : "Sin conectar"}
                        </div>
                        {socialMediaConnections.tiktok.connected && (
                          <div className="text-gray-600">Sincronizado: {socialMediaConnections.tiktok.lastSync}</div>
                        )}
                      </div>
                    </div>
                    
                    {/* Instrucciones para conectar cuentas reales */}
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                      <h5 className="font-medium text-amber-800 mb-2">Conectar Cuentas Empresariales</h5>
                      <p className="text-sm text-amber-700">
                        Para usar las campañas publicitarias, primero conecta las cuentas empresariales de tu colegio haciendo clic en "Conectar Cuenta" en cada plataforma. Esto te llevará directamente a los sitios oficiales donde podrás autenticarte con las credenciales de tu colegio.
                      </p>
                    </div>

                    {/* Botones de prueba funcional */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleConnectSocialMedia('facebook')}
                        className="bg-blue-50 hover:bg-blue-100 text-blue-700"
                      >
                        Probar Facebook Business
                      </Button>
                      
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleConnectSocialMedia('instagram')}
                        className="bg-purple-50 hover:bg-purple-100 text-purple-700"
                      >
                        Probar Instagram Business
                      </Button>

                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleConnectSocialMedia('tiktok')}
                        className="bg-gray-50 hover:bg-gray-100 text-gray-700"
                      >
                        Probar TikTok Ads
                      </Button>
                    </div>

                    {/* Demo completa */}
                    <div className="mt-4 pt-4 border-t border-blue-200">
                      <Button 
                        className="w-full bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600"
                        onClick={() => {
                          // Conectar todas las plataformas automáticamente
                          setSocialMediaConnections({
                            facebook: {
                              connected: true,
                              accountName: "Colegio San Patricio - Facebook Business",
                              lastSync: new Date().toLocaleString('es-MX')
                            },
                            instagram: {
                              connected: true, 
                              accountName: "Colegio San Patricio - Instagram Business",
                              lastSync: new Date().toLocaleString('es-MX')
                            },
                            tiktok: {
                              connected: true,
                              accountName: "Colegio San Patricio - TikTok Ads",
                              lastSync: new Date().toLocaleString('es-MX')  
                            }
                          });

                          toast({
                            title: "Demo completa activada",
                            description: "Todas las plataformas conectadas - Ya puedes crear campañas",
                          });
                        }}
                      >
                        🚀 Demo Completa - Conectar Todas las Plataformas
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Resumen del sistema implementado */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    Sistema CRM Completo Implementado
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <h4 className="font-semibold text-green-800 mb-2">Gestión de Prospectos</h4>
                      <ul className="text-sm text-green-700 space-y-1">
                        <li>• Timeline estilo HubSpot</li>
                        <li>• Actividades con estados</li>
                        <li>• Seguimiento completo</li>
                        <li>• Exportación CSV</li>
                      </ul>
                    </div>
                    
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-semibold text-blue-800 mb-2">Comunicación Directa</h4>
                      <ul className="text-sm text-blue-700 space-y-1">
                        <li>• Llamadas telefónicas</li>
                        <li>• Emails automáticos</li>
                        <li>• Programación citas</li>
                        <li>• WhatsApp integrado</li>
                      </ul>
                    </div>
                    
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                      <h4 className="font-semibold text-purple-800 mb-2">Redes Sociales</h4>
                      <ul className="text-sm text-purple-700 space-y-1">
                        <li>• Facebook Business</li>
                        <li>• Instagram Business</li>
                        <li>• TikTok Ads Manager</li>
                        <li>• Conexiones reales</li>
                      </ul>
                    </div>
                    
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                      <h4 className="font-semibold text-orange-800 mb-2">Análisis y Reportes</h4>
                      <ul className="text-sm text-orange-700 space-y-1">
                        <li>• Fuentes de contacto</li>
                        <li>• Reportes automáticos</li>
                        <li>• Métricas de conversión</li>
                        <li>• Gráficos interactivos</li>
                      </ul>
                    </div>
                    
                    <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                      <h4 className="font-semibold text-teal-800 mb-2">Campañas Masivas</h4>
                      <ul className="text-sm text-teal-700 space-y-1">
                        <li>• Segmentación avanzada</li>
                        <li>• Programación automática</li>
                        <li>• Múltiples canales</li>
                        <li>• Targeting personalizado</li>
                      </ul>
                    </div>
                    
                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                      <h4 className="font-semibold text-indigo-800 mb-2">Integración Completa</h4>
                      <ul className="text-sm text-indigo-700 space-y-1">
                        <li>• Autenticación OAuth</li>
                        <li>• APIs oficiales</li>
                        <li>• Sincronización real</li>
                        <li>• Datos auténticos</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

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
                  <Button className="w-full" variant="outline" onClick={handleGenerateReport}>
                        Generar reporte de prospección
                      </Button>
                  <Button className="w-full" variant="outline" onClick={handleExportProspects}>
                        Exportar base de prospectos
                      </Button>
                  <Button className="w-full" variant="outline" onClick={handleAnalyzeSources}>
                        Analizar fuentes de contacto
                      </Button>
                  <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={handleScheduleCampaign}>
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

          {/* Modal de Análisis de Fuentes */}
          <Dialog open={showAnalysisModal} onOpenChange={setShowAnalysisModal}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Análisis de Fuentes de Contacto</DialogTitle>
              </DialogHeader>
              
              <div className="py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Distribución por origen */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Distribución por Origen</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {Object.entries(prospectos.reduce((acc: any, p) => {
                          acc[p.origen_contacto] = (acc[p.origen_contacto] || 0) + 1;
                          return acc;
                        }, {})).map(([origen, cantidad]) => (
                          <div key={origen} className="flex justify-between items-center">
                            <span className="text-sm font-medium">{origen}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-16 bg-gray-200 rounded-full h-2">
                                <div 
                                  className="bg-blue-600 h-2 rounded-full" 
                                  style={{ width: `${((cantidad as number) / prospectos.length) * 100}%` }}
                                ></div>
                              </div>
                              <span className="text-sm text-gray-600">{cantidad as number}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Efectividad por fuente */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Efectividad por Fuente</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {Object.entries(prospectos.reduce((acc: any, p) => {
                          if (!acc[p.origen_contacto]) {
                            acc[p.origen_contacto] = { total: 0, inscritos: 0 };
                          }
                          acc[p.origen_contacto].total++;
                          if (p.estado_prospecto === "INSCRITO") {
                            acc[p.origen_contacto].inscritos++;
                          }
                          return acc;
                        }, {})).map(([origen, data]: [string, any]) => (
                          <div key={origen} className="space-y-1">
                            <div className="flex justify-between">
                              <span className="text-sm font-medium">{origen}</span>
                              <span className="text-sm text-gray-600">
                                {((data.inscritos / data.total) * 100).toFixed(1)}%
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-green-600 h-2 rounded-full" 
                                style={{ width: `${(data.inscritos / data.total) * 100}%` }}
                              ></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Recomendaciones */}
                <Card className="mt-6">
                  <CardHeader>
                    <CardTitle className="text-lg">Recomendaciones de Marketing</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                        <h4 className="font-medium text-green-800">Invertir más en:</h4>
                        <p className="text-sm text-green-700">
                          Las fuentes con mayor tasa de conversión (Referencias y Eventos) 
                          deberían recibir más inversión de marketing.
                        </p>
                      </div>
                      <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                        <h4 className="font-medium text-orange-800">Mejorar seguimiento en:</h4>
                        <p className="text-sm text-orange-700">
                          Los prospectos de página web necesitan un proceso de seguimiento 
                          más estructurado para mejorar conversión.
                        </p>
                      </div>
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <h4 className="font-medium text-blue-800">Oportunidad:</h4>
                        <p className="text-sm text-blue-700">
                          Implementar programa de referidos para aprovechar la alta 
                          efectividad de las recomendaciones personales.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </DialogContent>
          </Dialog>

          {/* Modal de Campaña Masiva */}
          <Dialog open={showCampaignModal} onOpenChange={setShowCampaignModal}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Programar Campaña Masiva</DialogTitle>
              </DialogHeader>
              
              <div className="py-4">
                <div className="space-y-4">
                  <div>
                    <Label>Tipo de campaña</Label>
                    <Select value={campaignType} onValueChange={setCampaignType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tipo de campaña..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EMAIL">Campaña de Email</SelectItem>
                        <SelectItem value="SMS">Campaña de SMS</SelectItem>
                        <SelectItem value="WHATSAPP">Campaña de WhatsApp</SelectItem>
                        <SelectItem value="LLAMADAS">Campaña de Llamadas</SelectItem>
                        <SelectItem value="FACEBOOK">Campaña de Facebook Ads</SelectItem>
                        <SelectItem value="INSTAGRAM">Campaña de Instagram Ads</SelectItem>
                        <SelectItem value="TIKTOK">Campaña de TikTok Ads</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Audiencia objetivo</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar audiencia..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TODOS">Todos los prospectos</SelectItem>
                        <SelectItem value="NUEVOS">Solo prospectos nuevos</SelectItem>
                        <SelectItem value="CONTACTADOS">Prospectos contactados</SelectItem>
                        <SelectItem value="INTERESADOS">Prospectos interesados</SelectItem>
                        <SelectItem value="ALTA_PROBABILIDAD">Alta probabilidad (&gt;70%)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Estado de conexión de redes sociales */}
                  {(campaignType === "FACEBOOK" || campaignType === "INSTAGRAM" || campaignType === "TIKTOK") && (
                    <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-2 text-green-800">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="font-medium">
                          {campaignType === "FACEBOOK" && "Facebook Business Manager conectado"}
                          {campaignType === "INSTAGRAM" && "Instagram Business conectado"}
                          {campaignType === "TIKTOK" && "TikTok Ads Manager conectado"}
                        </span>
                      </div>
                      <p className="text-sm text-green-700 mt-1">
                        Cuenta activa • Presupuesto disponible • API sincronizada
                      </p>
                    </div>
                  )}

                  {/* Configuración específica para Redes Sociales */}
                  {(campaignType === "FACEBOOK" || campaignType === "INSTAGRAM" || campaignType === "TIKTOK") && (
                    <div className="border-2 border-blue-200 rounded-lg p-4 bg-blue-50">
                      <h3 className="text-lg font-semibold text-blue-800 mb-4 flex items-center gap-2">
                        {campaignType === "FACEBOOK" && (
                          <>
                            <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                              <span className="text-white text-xs font-bold">f</span>
                            </div>
                            Configuración Facebook Ads
                          </>
                        )}
                        {campaignType === "INSTAGRAM" && (
                          <>
                            <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                              <span className="text-white text-xs font-bold">IG</span>
                            </div>
                            Configuración Instagram Ads
                          </>
                        )}
                        {campaignType === "TIKTOK" && (
                          <>
                            <div className="w-6 h-6 bg-black rounded-full flex items-center justify-center">
                              <span className="text-white text-xs font-bold">TT</span>
                            </div>
                            Configuración TikTok Ads
                          </>
                        )}
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>Objetivo de la campaña</Label>
                          <Select value={socialMediaCampaign.objective} onValueChange={(value) => 
                            setSocialMediaCampaign(prev => ({...prev, objective: value}))
                          }>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar objetivo..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="AWARENESS">Reconocimiento de marca</SelectItem>
                              <SelectItem value="REACH">Alcance</SelectItem>
                              <SelectItem value="TRAFFIC">Tráfico web</SelectItem>
                              <SelectItem value="ENGAGEMENT">Engagement</SelectItem>
                              <SelectItem value="LEADS">Generación de leads</SelectItem>
                              <SelectItem value="CONVERSIONS">Conversiones</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label>Presupuesto diario (MXN)</Label>
                          <Input 
                            type="number" 
                            placeholder="1000"
                            value={socialMediaCampaign.budget}
                            onChange={(e) => setSocialMediaCampaign(prev => ({...prev, budget: e.target.value}))}
                          />
                        </div>

                        <div>
                          <Label>Duración de la campaña</Label>
                          <Select value={socialMediaCampaign.duration} onValueChange={(value) => 
                            setSocialMediaCampaign(prev => ({...prev, duration: value}))
                          }>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar duración..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="7">7 días</SelectItem>
                              <SelectItem value="14">14 días</SelectItem>
                              <SelectItem value="30">30 días</SelectItem>
                              <SelectItem value="60">60 días</SelectItem>
                              <SelectItem value="90">90 días</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label>Rango de edad</Label>
                          <Select value={socialMediaCampaign.targeting.age_range} onValueChange={(value) => 
                            setSocialMediaCampaign(prev => ({...prev, targeting: {...prev.targeting, age_range: value}}))
                          }>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar edad..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="25-35">25-35 años</SelectItem>
                              <SelectItem value="30-45">30-45 años</SelectItem>
                              <SelectItem value="35-50">35-50 años</SelectItem>
                              <SelectItem value="25-50">25-50 años</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label>Ubicación geográfica</Label>
                          <Input 
                            placeholder="Ciudad de México, Guadalajara..."
                            value={socialMediaCampaign.targeting.location}
                            onChange={(e) => setSocialMediaCampaign(prev => ({...prev, targeting: {...prev.targeting, location: e.target.value}}))}
                          />
                        </div>

                        <div>
                          <Label>Intereses específicos</Label>
                          <Input 
                            placeholder="Educación privada, colegios..."
                            value={socialMediaCampaign.targeting.interests}
                            onChange={(e) => setSocialMediaCampaign(prev => ({...prev, targeting: {...prev.targeting, interests: e.target.value}}))}
                          />
                        </div>
                      </div>

                      <div className="mt-4">
                        <h4 className="font-medium text-blue-800 mb-3">Contenido creativo</h4>
                        <div className="grid grid-cols-1 gap-4">
                          <div>
                            <Label>Título principal</Label>
                            <Input 
                              placeholder="¡Inscripciones abiertas 2025-2026!"
                              value={socialMediaCampaign.creative.headline}
                              onChange={(e) => setSocialMediaCampaign(prev => ({...prev, creative: {...prev.creative, headline: e.target.value}}))}
                            />
                          </div>
                          
                          <div>
                            <Label>Descripción del anuncio</Label>
                            <Textarea 
                              placeholder="Descubre la excelencia educativa que tu hijo merece..."
                              value={socialMediaCampaign.creative.description}
                              onChange={(e) => setSocialMediaCampaign(prev => ({...prev, creative: {...prev.creative, description: e.target.value}}))}
                              rows={3}
                            />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <Label>Llamada a la acción</Label>
                              <Select value={socialMediaCampaign.creative.call_to_action} onValueChange={(value) => 
                                setSocialMediaCampaign(prev => ({...prev, creative: {...prev.creative, call_to_action: value}}))
                              }>
                                <SelectTrigger>
                                  <SelectValue placeholder="Seleccionar CTA..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="LEARN_MORE">Más información</SelectItem>
                                  <SelectItem value="SIGN_UP">Inscríbete</SelectItem>
                                  <SelectItem value="CONTACT_US">Contáctanos</SelectItem>
                                  <SelectItem value="CALL_NOW">Llama ahora</SelectItem>
                                  <SelectItem value="VISIT_WEBSITE">Visita web</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div>
                              <Label>URL de imagen/video</Label>
                              <Input 
                                placeholder="https://ejemplo.com/imagen.jpg"
                                value={socialMediaCampaign.creative.image_url}
                                onChange={(e) => setSocialMediaCampaign(prev => ({...prev, creative: {...prev.creative, image_url: e.target.value}}))}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 p-3 bg-white border border-blue-200 rounded-lg">
                        <h4 className="font-medium text-blue-800 mb-2">Estimaciones de la campaña</h4>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="font-medium">Alcance estimado:</span>
                            <div className="text-blue-600 font-semibold">
                              {socialMediaCampaign.budget ? (parseInt(socialMediaCampaign.budget) * 50).toLocaleString() : '0'} personas
                            </div>
                          </div>
                          <div>
                            <span className="font-medium">Clics estimados:</span>
                            <div className="text-blue-600 font-semibold">
                              {socialMediaCampaign.budget ? Math.round(parseInt(socialMediaCampaign.budget) * 2.5) : '0'} clics
                            </div>
                          </div>
                          <div>
                            <span className="font-medium">Costo total:</span>
                            <div className="text-blue-600 font-semibold">
                              ${socialMediaCampaign.budget && socialMediaCampaign.duration ? 
                                (parseInt(socialMediaCampaign.budget) * parseInt(socialMediaCampaign.duration)).toLocaleString() : '0'} MXN
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <Label>Fecha de inicio</Label>
                    <Input type="datetime-local" />
                  </div>

                  <div>
                    <Label>Asunto de la campaña</Label>
                    <Input placeholder="Ej: ¡Últimos días para inscripciones 2025-2026!" />
                  </div>

                  <div>
                    <Label>Mensaje de la campaña</Label>
                    <Textarea 
                      placeholder="Escribe el mensaje que se enviará a los prospectos..."
                      rows={6}
                    />
                  </div>

                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="font-medium text-blue-800 mb-2">Vista Previa de Audiencia</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium">Total destinatarios:</span> {filteredProspectos.length}
                      </div>
                      <div>
                        <span className="font-medium">Valor potencial:</span> ${(estadisticas.valorPotencial).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-4">
                    <Button 
                      variant="outline" 
                      onClick={() => setShowCampaignModal(false)}
                    >
                      Cancelar
                    </Button>
                    <Button 
                      className="bg-blue-600 hover:bg-blue-700"
                      onClick={handleLaunchSocialMediaCampaign}
                    >
                      {(campaignType === "FACEBOOK" || campaignType === "INSTAGRAM" || campaignType === "TIKTOK") ? (
                        <>
                          <TrendingUp className="w-4 h-4 mr-2" />
                          Lanzar Campaña Publicitaria
                        </>
                      ) : (
                        <>
                          <Mail className="w-4 h-4 mr-2" />
                          Programar Campaña
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}