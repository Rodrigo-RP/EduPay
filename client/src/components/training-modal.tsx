import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  BookOpen, 
  Play, 
  CheckCircle, 
  Clock, 
  Users, 
  Settings, 
  DollarSign,
  FileText,
  Download,
  Video,
  FileSpreadsheet,
  Lightbulb
} from "lucide-react";

interface TrainingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TrainingModule {
  id: string;
  title: string;
  description: string;
  duration: string;
  difficulty: 'básico' | 'intermedio' | 'avanzado';
  icon: any;
  completed: boolean;
  content: string[];
  tips: string[];
  downloadable?: string;
}

const trainingModules: TrainingModule[] = [
  {
    id: 'setup',
    title: 'Configuración Inicial',
    description: 'Configura tu escuela en menos de 1 hora',
    duration: '45 min',
    difficulty: 'básico',
    icon: Settings,
    completed: false,
    content: [
      "1. Registro de la escuela - Completa los datos fiscales y de contacto",
      "2. Configuración de campus - Define niveles académicos (Kinder, Primaria, etc.)",
      "3. Importación de estudiantes - Usa nuestras plantillas Excel predefinidas",
      "4. Configuración de conceptos - Crea colegiaturas, inscripciones y otros cobros",
      "5. Configuración de usuarios - Asigna roles a tu personal administrativo",
      "6. Prueba de pagos - Configura tu método de pago preferido (Stripe/Openpay)"
    ],
    tips: [
      "Tip: Mantén a la mano el RFC de la escuela y datos del representante legal",
      "Tip: Prepara un archivo Excel con todos tus estudiantes antes de comenzar",
      "Tip: Define claramente qué conceptos cobra tu escuela antes de configurar"
    ],
    downloadable: 'Checklist_Configuracion_Inicial.pdf'
  },
  {
    id: 'students',
    title: 'Gestión de Estudiantes',
    description: 'Importa y organiza tu base de alumnos',
    duration: '30 min',
    difficulty: 'básico',
    icon: Users,
    completed: false,
    content: [
      "1. Importación masiva - Usa nuestro sistema de plantillas categorizadas",
      "2. Vinculación familiar - Conecta estudiantes con sus responsables de pago",
      "3. Validación de datos - Verifica CURPs únicos y información completa",
      "4. Organización por niveles - Agrupa estudiantes por grado académico",
      "5. Estados del alumno - Gestiona activos, suspendidos y egresados",
      "6. Reportes estudiantiles - Genera listas y estadísticas por campus"
    ],
    tips: [
      "Tip: El CURP es clave para evitar duplicados, valídalo siempre",
      "Tip: Un tutor puede ser responsable de múltiples estudiantes",
      "Tip: Usa el filtro por nivel académico para agilizar la búsqueda"
    ],
    downloadable: 'Guia_Gestion_Estudiantes.pdf'
  },
  {
    id: 'payments',
    title: 'Sistema de Pagos',
    description: 'Configura cobros automáticos y manuales',
    duration: '60 min',
    difficulty: 'intermedio',
    icon: DollarSign,
    completed: false,
    content: [
      "1. Configuración de conceptos - Define colegiaturas, inscripciones, extras",
      "2. Precios diferenciados - Configura precios por nivel académico",
      "3. Emisión de cargos - Genera cobros automáticos y extraordinarios",
      "4. Reglas de vencimiento - Configura fechas límite y recargos por mora",
      "5. Métodos de pago - Habilita tarjetas, transferencias y efectivo",
      "6. Conciliación bancaria - Cuadra pagos automáticamente"
    ],
    tips: [
      "Tip: Configura recargos automáticos para reducir morosidad",
      "Tip: Los padres pueden pagar desde su celular en 3 clics",
      "Tip: La conciliación automática ahorra 80% del tiempo administrativo"
    ],
    downloadable: 'Manual_Sistema_Pagos.pdf'
  },
  {
    id: 'parents',
    title: 'Portal de Padres',
    description: 'Activa el acceso móvil para familias',
    duration: '20 min',
    difficulty: 'básico',
    icon: Play,
    completed: false,
    content: [
      "1. Activación de cuentas - Envía credenciales a los padres de familia",
      "2. Tutorial para padres - Comparte la guía de uso del portal móvil",
      "3. Configuración de notificaciones - Activa alertas de vencimiento",
      "4. Métodos de pago recurrente - Configura pagos automáticos",
      "5. Histórico de pagos - Los padres pueden consultar su historial",
      "6. Soporte técnico - Protocolo de atención para dudas familiares"
    ],
    tips: [
      "Tip: Envía un WhatsApp con las credenciales, es más efectivo",
      "Tip: Haz una demostración en junta de padres para mostrar facilidad",
      "Tip: Los pagos automáticos reducen 60% las consultas administrativas"
    ],
    downloadable: 'Guia_Portal_Padres.pdf'
  },
  {
    id: 'reports',
    title: 'Reportes y Análisis',
    description: 'Genera reportes administrativos y fiscales',
    duration: '40 min',
    difficulty: 'intermedio',
    icon: FileText,
    completed: false,
    content: [
      "1. Dashboard ejecutivo - Interpreta los KPIs principales",
      "2. Reportes de morosidad - Identifica cuentas por cobrar",
      "3. Análisis de ingresos - Proyecta flujo de efectivo mensual",
      "4. Reportes fiscales - Genera información para contador",
      "5. Estadísticas por nivel - Compara rendimiento académico",
      "6. Exportación de datos - Descarga información en Excel/PDF"
    ],
    tips: [
      "Tip: Revisa el dashboard cada lunes para planificar la semana",
      "Tip: Comparte reportes con directivos para toma de decisiones",
      "Tip: Los reportes automáticos ahorran 10 horas semanales"
    ],
    downloadable: 'Manual_Reportes_Analisis.pdf'
  },
  {
    id: 'advanced',
    title: 'Funciones Avanzadas',
    description: 'Automatiza procesos complejos',
    duration: '90 min',
    difficulty: 'avanzado',
    icon: Lightbulb,
    completed: false,
    content: [
      "1. Becas inteligentes - Configura algoritmos automáticos de descuentos",
      "2. Facturación electrónica - Integra con PAC para CFDI automático",
      "3. Campañas de cobranza - Automatiza recordatorios escalonados",
      "4. Integración contable - Conecta con sistemas de contabilidad",
      "5. APIs personalizadas - Integra con otros sistemas escolares",
      "6. Análisis predictivo - Predice riesgo de morosidad"
    ],
    tips: [
      "Tip: Las becas automáticas reducen 70% el trabajo administrativo",
      "Tip: La facturación automática cumple con SAT sin intervención manual",
      "Tip: Las campañas automatizadas mejoran 40% la tasa de cobranza"
    ],
    downloadable: 'Guia_Funciones_Avanzadas.pdf'
  }
];

export default function TrainingModal({ open, onOpenChange }: TrainingModalProps) {
  const [selectedModule, setSelectedModule] = useState<TrainingModule | null>(null);
  const { toast } = useToast();

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'básico': return 'bg-green-100 text-green-800';
      case 'intermedio': return 'bg-yellow-100 text-yellow-800';
      case 'avanzado': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const downloadManual = (filename: string) => {
    if (!selectedModule) return;
    
    // Generar contenido completo del manual
    const content = `
MANUAL DE CAPACITACIÓN - ESCUELAPAY
====================================

MÓDULO: ${selectedModule.title}
DURACIÓN: ${selectedModule.duration}
DIFICULTAD: ${selectedModule.difficulty.toUpperCase()}

DESCRIPCIÓN
-----------
${selectedModule.description}

PASOS DETALLADOS
----------------
${selectedModule.content.map((item, index) => `${index + 1}. ${item}`).join('\n')}

TIPS PROFESIONALES
------------------
${selectedModule.tips.map((tip, index) => `• ${tip}`).join('\n')}

CHECKLIST DE VERIFICACIÓN
--------------------------
□ Completar todos los pasos en orden
□ Verificar que cada función opere correctamente
□ Realizar pruebas con datos reales
□ Capacitar al personal involucrado
□ Documentar configuraciones específicas

RECURSOS ADICIONALES
---------------------
• Video tutorial disponible en plataforma
• Soporte técnico vía WhatsApp durante implementación
• Sesión de capacitación en vivo disponible bajo solicitud

SOPORTE TÉCNICO
---------------
Email: soporte@escuelapay.mx
WhatsApp: +52 55 1234 5678
Horario: Lunes a Viernes 8:00 AM - 6:00 PM
Tiempo de respuesta: Máximo 4 horas

SIGUIENTES PASOS
----------------
1. Completar este módulo
2. Verificar implementación
3. Proceder al siguiente módulo según cronograma
4. Solicitar revisión técnica si es necesario

====================================
© 2025 EscuelaPay - Plataforma SaaS líder en pagos educativos
Documento generado: ${new Date().toLocaleDateString('es-MX')}
    `;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `Manual_${selectedModule.title.replace(/\s+/g, '_')}.txt`;
    
    // Asegurar que el enlace sea visible temporalmente
    link.style.display = 'none';
    document.body.appendChild(link);
    
    // Forzar la descarga
    link.click();
    
    // Limpiar
    setTimeout(() => {
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }, 100);
    
    // Notificación visual para el usuario
    toast({
      title: "Manual Descargado",
      description: `${selectedModule.title} - Manual guardado exitosamente`,
      duration: 3000,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Capacitación EscuelaPay
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="modules" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="modules">Módulos de Capacitación</TabsTrigger>
            <TabsTrigger value="quick">Guía Rápida</TabsTrigger>
          </TabsList>

          <TabsContent value="modules" className="space-y-4">
            {selectedModule ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Button 
                    variant="outline" 
                    onClick={() => setSelectedModule(null)}
                  >
                    ← Volver a módulos
                  </Button>
                  <Badge className={getDifficultyColor(selectedModule.difficulty)}>
                    {selectedModule.difficulty}
                  </Badge>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <selectedModule.icon className="h-5 w-5" />
                      {selectedModule.title}
                    </CardTitle>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {selectedModule.duration}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-semibold mb-2">Pasos a Seguir:</h4>
                      <ul className="space-y-2">
                        {selectedModule.content.map((step, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                            <span className="text-sm">{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <Lightbulb className="h-4 w-4" />
                        Tips Profesionales:
                      </h4>
                      <ul className="space-y-2">
                        {selectedModule.tips.map((tip, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <span className="text-yellow-600 font-bold">💡</span>
                            <span className="text-sm text-muted-foreground">{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {selectedModule.downloadable && (
                      <div className="flex gap-2">
                        <Button 
                          onClick={() => downloadManual(selectedModule.downloadable!)}
                          className="flex items-center gap-2"
                        >
                          <Download className="h-4 w-4" />
                          Descargar Manual
                        </Button>
                        <Button variant="outline" className="flex items-center gap-2">
                          <Video className="h-4 w-4" />
                          Ver Video Tutorial
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {trainingModules.map((module) => (
                  <Card 
                    key={module.id} 
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelectedModule(module)}
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <module.icon className="h-5 w-5" />
                        {module.title}
                      </CardTitle>
                      <div className="flex items-center justify-between">
                        <Badge className={getDifficultyColor(module.difficulty)}>
                          {module.difficulty}
                        </Badge>
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {module.duration}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-3">
                        {module.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <Button size="sm" variant="outline">
                          Ver Contenido
                        </Button>
                        {module.completed && (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="quick" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Guía de Implementación Rápida</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-green-600">Semana 1</div>
                    <div className="text-sm text-muted-foreground mt-2">
                      Configuración inicial + Importación de estudiantes
                    </div>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">Semana 2</div>
                    <div className="text-sm text-muted-foreground mt-2">
                      Configuración de pagos + Capacitación al personal
                    </div>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">Semana 3</div>
                    <div className="text-sm text-muted-foreground mt-2">
                      Activación portal padres + Pruebas de pago
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold">Checklist de Implementación:</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span>Configuración inicial completada</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span>Base de estudiantes importada y validada</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span>Conceptos de pago configurados</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span>Personal capacitado en funciones básicas</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span>Portal de padres activado</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span>Primeros pagos procesados exitosamente</span>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-blue-900 mb-2">Soporte Técnico Incluido</h4>
                  <p className="text-sm text-blue-800">
                    Durante tu primer mes, incluimos soporte técnico personalizado vía WhatsApp 
                    para resolver cualquier duda de implementación.
                  </p>
                  <Button className="mt-2" size="sm">
                    Contactar Soporte
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}