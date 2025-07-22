import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  CheckCircle, 
  AlertTriangle, 
  Rocket, 
  Shield, 
  Database, 
  Users, 
  DollarSign,
  FileText,
  Settings,
  Globe,
  Phone,
  BookOpen
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ChecklistItem {
  id: string;
  category: string;
  title: string;
  description: string;
  status: 'completed' | 'in_progress' | 'pending';
  priority: 'high' | 'medium' | 'low';
  icon: any;
}

const launchChecklist: ChecklistItem[] = [
  // Core System
  {
    id: 'auth_system',
    category: 'Sistema Principal',
    title: 'Sistema de Autenticación',
    description: 'JWT, bcrypt, roles de usuario, sesiones seguras',
    status: 'completed',
    priority: 'high',
    icon: Shield
  },
  {
    id: 'database_schema',
    category: 'Sistema Principal',
    title: 'Esquema de Base de Datos',
    description: 'Multi-tenant, relaciones, índices, constraintst',
    status: 'completed',
    priority: 'high',
    icon: Database
  },
  {
    id: 'student_management',
    category: 'Sistema Principal',
    title: 'Gestión de Estudiantes',
    description: 'CRUD completo, importación masiva, vinculación familiar',
    status: 'completed',
    priority: 'high',
    icon: Users
  },
  
  // Payment System
  {
    id: 'payment_rules',
    category: 'Sistema de Pagos',
    title: 'Reglas de Pago Avanzadas',
    description: '4 tipos de recargos, calendario SEP, ajuste automático',
    status: 'completed',
    priority: 'high',
    icon: DollarSign
  },
  {
    id: 'charge_generation',
    category: 'Sistema de Pagos',
    title: 'Emisión de Cargos',
    description: 'Automática/manual, precios diferenciados, extraordinarios',
    status: 'completed',
    priority: 'high',
    icon: FileText
  },
  {
    id: 'payment_processing',
    category: 'Sistema de Pagos',
    title: 'Procesamiento de Pagos',
    description: 'Portal padres, métodos múltiples, conciliación',
    status: 'completed',
    priority: 'high',
    icon: DollarSign
  },
  
  // Data Management
  {
    id: 'data_migration',
    category: 'Gestión de Datos',
    title: 'Sistema de Migración',
    description: 'Plantillas Excel, validación cruzada, progreso en tiempo real',
    status: 'completed',
    priority: 'high',
    icon: Database
  },
  {
    id: 'data_validation',
    category: 'Gestión de Datos',
    title: 'Validación Automática',
    description: 'CURPs únicos, conceptos obligatorios, reportes detallados',
    status: 'completed',
    priority: 'medium',
    icon: CheckCircle
  },
  
  // Training & Support
  {
    id: 'training_system',
    category: 'Capacitación',
    title: 'Sistema de Capacitación',
    description: '6 módulos, manuales descargables, implementación 3 semanas',
    status: 'completed',
    priority: 'medium',
    icon: BookOpen
  },
  {
    id: 'user_manuals',
    category: 'Capacitación',
    title: 'Manuales de Usuario',
    description: 'Guías paso a paso, videos tutoriales, soporte técnico',
    status: 'completed',
    priority: 'medium',
    icon: FileText
  },
  
  // Integration & APIs
  {
    id: 'sep_calendar',
    category: 'Integraciones',
    title: 'Calendario SEP 2025-2026',
    description: 'Días no laborables, ajuste automático de fechas',
    status: 'completed',
    priority: 'high',
    icon: Settings
  },
  {
    id: 'api_endpoints',
    category: 'Integraciones',
    title: 'APIs Completas',
    description: 'REST endpoints, validación, manejo de errores',
    status: 'completed',
    priority: 'high',
    icon: Globe
  },
  
  // Pre-Launch Items
  {
    id: 'security_review',
    category: 'Pre-Lanzamiento',
    title: 'Revisión de Seguridad',
    description: 'Validación de inputs, sanitización, protección CSRF',
    status: 'in_progress',
    priority: 'high',
    icon: Shield
  },
  {
    id: 'performance_optimization',
    category: 'Pre-Lanzamiento',
    title: 'Optimización de Rendimiento',
    description: 'Consultas DB, caching, lazy loading',
    status: 'in_progress',
    priority: 'medium',
    icon: Settings
  },
  {
    id: 'error_handling',
    category: 'Pre-Lanzamiento',
    title: 'Manejo de Errores',
    description: 'Try-catch completo, mensajes usuario, logging',
    status: 'in_progress',
    priority: 'high',
    icon: AlertTriangle
  },
  {
    id: 'mobile_responsive',
    category: 'Pre-Lanzamiento',
    title: 'Diseño Móvil',
    description: 'Responsive design, PWA ready, touch optimization',
    status: 'completed',
    priority: 'medium',
    icon: Phone
  }
];

export default function MarketLaunchChecklist() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const { toast } = useToast();
  
  const categories = Array.from(new Set(launchChecklist.map(item => item.category)));
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800';
      case 'pending': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'in_progress': return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'pending': return <div className="h-4 w-4 border-2 border-gray-300 rounded-full" />;
      default: return null;
    }
  };

  const completedItems = launchChecklist.filter(item => item.status === 'completed').length;
  const totalItems = launchChecklist.length;
  const completionPercentage = Math.round((completedItems / totalItems) * 100);

  const filteredItems = selectedCategory 
    ? launchChecklist.filter(item => item.category === selectedCategory)
    : launchChecklist;

  const handleSecurityAudit = () => {
    toast({
      title: "Iniciando Auditoría de Seguridad",
      description: "Ejecutando revisión completa de vulnerabilidades y protocolos de seguridad...",
      duration: 4000,
    });
  };

  const handleProductionDeploy = () => {
    toast({
      title: "Preparando Despliegue",
      description: "Configurando ambiente de producción en Replit Deployment...",
      duration: 4000,
    });
  };

  const handleCommercialLaunch = () => {
    toast({
      title: "¡Lanzamiento Comercial Iniciado!",
      description: "Edupay está oficialmente disponible para el mercado educativo mexicano",
      duration: 5000,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Rocket className="h-8 w-8" />
            Lista de Lanzamiento al Mercado
          </h1>
          <p className="text-muted-foreground">
            Verificación completa del sistema antes del lanzamiento comercial
          </p>
        </div>
        <Badge variant="default" className="text-lg px-4 py-2">
          {completionPercentage}% Completado
        </Badge>
      </div>

      {/* Progress Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Progreso General</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span>Elementos Completados:</span>
            <span className="font-bold">{completedItems} de {totalItems}</span>
          </div>
          <Progress value={completionPercentage} className="h-3" />
          
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {launchChecklist.filter(item => item.status === 'completed').length}
              </div>
              <div className="text-sm text-green-700">Completados</div>
            </div>
            <div className="text-center p-3 bg-yellow-50 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">
                {launchChecklist.filter(item => item.status === 'in_progress').length}
              </div>
              <div className="text-sm text-yellow-700">En Progreso</div>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">
                {launchChecklist.filter(item => item.status === 'pending').length}
              </div>
              <div className="text-sm text-red-700">Pendientes</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        <Button 
          variant={selectedCategory === null ? "default" : "outline"}
          onClick={() => setSelectedCategory(null)}
          size="sm"
        >
          Todos
        </Button>
        {categories.map(category => (
          <Button
            key={category}
            variant={selectedCategory === category ? "default" : "outline"}
            onClick={() => setSelectedCategory(category)}
            size="sm"
          >
            {category}
          </Button>
        ))}
      </div>

      {/* Launch Status Alert */}
      {completionPercentage >= 90 && (
        <Alert className="border-green-200 bg-green-50">
          <Rocket className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            <strong>¡Sistema Listo para Lanzamiento!</strong> Has completado {completionPercentage}% de los elementos críticos. 
            La plataforma está preparada para el mercado comercial.
          </AlertDescription>
        </Alert>
      )}

      {/* Checklist Items */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredItems.map((item) => (
          <Card key={item.id} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <item.icon className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    <Badge variant="outline" className="text-xs mt-1">
                      {item.category}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusIcon(item.status)}
                  <Badge className={getStatusColor(item.status)} variant="outline">
                    {item.status === 'completed' && 'Completado'}
                    {item.status === 'in_progress' && 'En Progreso'}
                    {item.status === 'pending' && 'Pendiente'}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                {item.description}
              </p>
              <div className="flex items-center justify-between">
                <Badge 
                  variant="outline" 
                  className={
                    item.priority === 'high' ? 'border-red-200 text-red-700' :
                    item.priority === 'medium' ? 'border-yellow-200 text-yellow-700' :
                    'border-gray-200 text-gray-700'
                  }
                >
                  Prioridad {item.priority === 'high' ? 'Alta' : item.priority === 'medium' ? 'Media' : 'Baja'}
                </Badge>
                {item.status === 'completed' && (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Launch Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            Acciones de Lanzamiento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button 
              className="h-auto p-4 flex flex-col items-center gap-2" 
              disabled={completionPercentage < 90}
              onClick={handleSecurityAudit}
            >
              <Shield className="h-6 w-6" />
              <span>Revisión Final de Seguridad</span>
              <span className="text-xs opacity-70">Auditoría completa</span>
            </Button>
            <Button 
              className="h-auto p-4 flex flex-col items-center gap-2" 
              disabled={completionPercentage < 95}
              onClick={handleProductionDeploy}
            >
              <Globe className="h-6 w-6" />
              <span>Desplegar a Producción</span>
              <span className="text-xs opacity-70">Replit Deployment</span>
            </Button>
            <Button 
              className="h-auto p-4 flex flex-col items-center gap-2" 
              disabled={completionPercentage < 100}
              onClick={handleCommercialLaunch}
            >
              <Rocket className="h-6 w-6" />
              <span>Lanzamiento Comercial</span>
              <span className="text-xs opacity-70">Go to Market</span>
            </Button>
          </div>
          
          <div className="text-sm text-muted-foreground">
            <strong>Nota:</strong> Los botones se habilitan progresivamente según el porcentaje de completitud. 
            Se requiere 90% para revisión de seguridad, 95% para producción y 100% para lanzamiento comercial.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}