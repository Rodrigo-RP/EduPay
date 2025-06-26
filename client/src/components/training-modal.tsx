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
    
    // Generar contenido HTML con estilos para PDF
    const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Manual de Capacitación - ${selectedModule.title}</title>
    <style>
        body {
            font-family: 'Arial', sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background: white;
        }
        .header {
            text-align: center;
            border-bottom: 3px solid #2563eb;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .header h1 {
            color: #2563eb;
            margin: 0;
            font-size: 28px;
        }
        .header .subtitle {
            color: #64748b;
            font-size: 16px;
            margin-top: 5px;
        }
        .module-info {
            background: #f8fafc;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 30px;
            border-left: 4px solid #2563eb;
        }
        .module-info h2 {
            margin-top: 0;
            color: #1e40af;
        }
        .section {
            margin-bottom: 30px;
        }
        .section h3 {
            color: #1e40af;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 5px;
            margin-bottom: 15px;
        }
        .steps {
            counter-reset: step-counter;
        }
        .steps li {
            counter-increment: step-counter;
            margin-bottom: 10px;
            padding-left: 10px;
        }
        .steps li::marker {
            content: counter(step-counter) ". ";
            font-weight: bold;
            color: #2563eb;
        }
        .tips {
            background: #fef3cd;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #f59e0b;
        }
        .tips li {
            margin-bottom: 8px;
        }
        .checklist {
            background: #f0fdf4;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #10b981;
        }
        .support-box {
            background: #f1f5f9;
            padding: 20px;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #e2e8f0;
            color: #64748b;
            font-size: 14px;
        }
        @media print {
            body { margin: 0; }
            .header { page-break-after: avoid; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>MANUAL DE CAPACITACIÓN</h1>
        <div class="subtitle">EscuelaPay - Plataforma SaaS líder en pagos educativos</div>
    </div>

    <div class="module-info">
        <h2>${selectedModule.title}</h2>
        <p><strong>Duración:</strong> ${selectedModule.duration}</p>
        <p><strong>Dificultad:</strong> ${selectedModule.difficulty.charAt(0).toUpperCase() + selectedModule.difficulty.slice(1)}</p>
        <p><strong>Descripción:</strong> ${selectedModule.description}</p>
    </div>

    <div class="section">
        <h3>📋 Pasos Detallados</h3>
        <ol class="steps">
            ${selectedModule.content.map(item => `<li>${item}</li>`).join('')}
        </ol>
    </div>

    <div class="section">
        <h3>💡 Tips Profesionales</h3>
        <div class="tips">
            <ul>
                ${selectedModule.tips.map(tip => `<li>${tip}</li>`).join('')}
            </ul>
        </div>
    </div>

    <div class="section">
        <h3>✅ Checklist de Verificación</h3>
        <div class="checklist">
            <ul style="list-style: none; padding-left: 0;">
                <li>☐ Completar todos los pasos en orden</li>
                <li>☐ Verificar que cada función opere correctamente</li>
                <li>☐ Realizar pruebas con datos reales</li>
                <li>☐ Capacitar al personal involucrado</li>
                <li>☐ Documentar configuraciones específicas</li>
            </ul>
        </div>
    </div>

    <div class="section">
        <h3>🎯 Recursos Adicionales</h3>
        <ul>
            <li>Video tutorial disponible en plataforma</li>
            <li>Soporte técnico vía WhatsApp durante implementación</li>
            <li>Sesión de capacitación en vivo disponible bajo solicitud</li>
        </ul>
    </div>

    <div class="section">
        <h3>📞 Soporte Técnico</h3>
        <div class="support-box">
            <p><strong>Email:</strong> soporte@escuelapay.mx</p>
            <p><strong>WhatsApp:</strong> +52 55 1234 5678</p>
            <p><strong>Horario:</strong> Lunes a Viernes 8:00 AM - 6:00 PM</p>
            <p><strong>Tiempo de respuesta:</strong> Máximo 4 horas</p>
        </div>
    </div>

    <div class="section">
        <h3>➡️ Siguientes Pasos</h3>
        <ol>
            <li>Completar este módulo</li>
            <li>Verificar implementación</li>
            <li>Proceder al siguiente módulo según cronograma</li>
            <li>Solicitar revisión técnica si es necesario</li>
        </ol>
    </div>

    <div class="footer">
        <p><strong>© 2025 EscuelaPay</strong> - Plataforma SaaS líder en pagos educativos</p>
        <p>Documento generado: ${new Date().toLocaleDateString('es-MX')}</p>
    </div>
</body>
</html>`;

    // Crear blob con contenido HTML
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Manual_${selectedModule.title.replace(/\s+/g, '_')}.html`;
    
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
      description: `${selectedModule.title} - Abrir archivo y usar Ctrl+P para guardar como PDF`,
      duration: 5000,
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
                      <div className="space-y-3">
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
                        
                        <div className="text-xs text-muted-foreground bg-blue-50 p-3 rounded-lg border border-blue-200">
                          <strong>Para obtener PDF:</strong>
                          <ol className="mt-1 space-y-1">
                            <li>1. Abre el archivo HTML descargado</li>
                            <li>2. Presiona Ctrl+P (Cmd+P en Mac)</li>
                            <li>3. Selecciona "Guardar como PDF"</li>
                            <li>4. Guarda tu manual en formato PDF</li>
                          </ol>
                        </div>
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