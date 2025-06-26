import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { 
  Rocket, CheckCircle, Clock, AlertTriangle, Users, School, 
  Settings, FileText, Target, Calendar, Phone, Mail,
  Database, Upload, Download, Play, Pause, RotateCcw
} from "lucide-react";

interface ImplementationProject {
  id: number;
  school_name: string;
  contact_name: string;
  email: string;
  phone: string;
  contract_value: number;
  start_date: string;
  target_go_live: string;
  current_phase: 'discovery' | 'setup' | 'configuration' | 'training' | 'testing' | 'go_live' | 'post_launch';
  progress_percentage: number;
  assigned_specialist: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  students_count: number;
  campus_count: number;
  integration_requirements: string[];
  status: 'on_track' | 'at_risk' | 'delayed' | 'completed';
}

interface ImplementationTask {
  id: number;
  project_id: number;
  task_name: string;
  description: string;
  phase: string;
  assigned_to: string;
  due_date: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimated_hours: number;
  actual_hours?: number;
  dependencies: string[];
}

interface ImplementationMetrics {
  total_projects: number;
  active_implementations: number;
  avg_implementation_time: number;
  success_rate: number;
  projects_completed_this_month: number;
  overdue_tasks: number;
}

export default function ImplementationDashboard() {
  const { toast } = useToast();
  const [selectedProject, setSelectedProject] = useState<ImplementationProject | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [newTaskData, setNewTaskData] = useState({
    task_name: "",
    description: "",
    due_date: "",
    priority: "medium",
    estimated_hours: ""
  });

  // Fetch implementation metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["/api/implementation/metrics"],
    queryFn: async () => {
      return {
        total_projects: 45,
        active_implementations: 12,
        avg_implementation_time: 21, // days
        success_rate: 94.5,
        projects_completed_this_month: 6,
        overdue_tasks: 8
      } as ImplementationMetrics;
    },
  });

  // Fetch implementation projects
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["/api/implementation/projects"],
    queryFn: async () => {
      return [
        {
          id: 1,
          school_name: "Instituto Bilingüe Victoria",
          contact_name: "Laura Martínez",
          email: "laura.martinez@victoria.edu.mx",
          phone: "+52 55 1111-2222",
          contract_value: 150000,
          start_date: "2025-01-15",
          target_go_live: "2025-02-28",
          current_phase: "configuration",
          progress_percentage: 65,
          assigned_specialist: "Ana Implementación",
          risk_level: "low",
          students_count: 850,
          campus_count: 2,
          integration_requirements: ["SAP", "Google Workspace", "Stripe"],
          status: "on_track"
        },
        {
          id: 2,
          school_name: "Colegio Internacional México",
          contact_name: "Roberto García",
          email: "roberto.garcia@internacional.edu.mx",
          phone: "+52 55 3333-4444",
          contract_value: 320000,
          start_date: "2025-01-08",
          target_go_live: "2025-03-15",
          current_phase: "training",
          progress_percentage: 78,
          assigned_specialist: "Carlos Setup",
          risk_level: "medium",
          students_count: 1250,
          campus_count: 3,
          integration_requirements: ["Oracle", "Microsoft Teams", "Openpay"],
          status: "at_risk"
        },
        {
          id: 3,
          school_name: "Escuela Técnica Avanzada",
          contact_name: "Marina López",
          email: "marina.lopez@tecnica.edu.mx",
          phone: "+52 55 5555-6666",
          contract_value: 85000,
          start_date: "2025-01-22",
          target_go_live: "2025-02-15",
          current_phase: "setup",
          progress_percentage: 25,
          assigned_specialist: "Luis Configuración",
          risk_level: "high",
          students_count: 450,
          campus_count: 1,
          integration_requirements: ["QuickBooks", "Zoom", "Conekta"],
          status: "delayed"
        }
      ] as ImplementationProject[];
    },
  });

  // Fetch tasks for selected project
  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["/api/implementation/tasks", selectedProject?.id],
    queryFn: async () => {
      if (!selectedProject) return [];
      return [
        {
          id: 1,
          project_id: selectedProject.id,
          task_name: "Configuración inicial del tenant",
          description: "Crear estructura de tenant y campus en la plataforma",
          phase: "setup",
          assigned_to: "Ana Implementación",
          due_date: "2025-01-28",
          status: "completed",
          priority: "high",
          estimated_hours: 8,
          actual_hours: 6,
          dependencies: []
        },
        {
          id: 2,
          project_id: selectedProject.id,
          task_name: "Importación de base de estudiantes",
          description: "Migrar datos de estudiantes desde Excel/CSV",
          phase: "configuration",
          assigned_to: "Carlos Setup",
          due_date: "2025-01-30",
          status: "in_progress",
          priority: "high",
          estimated_hours: 12,
          actual_hours: 8,
          dependencies: ["Configuración inicial del tenant"]
        },
        {
          id: 3,
          project_id: selectedProject.id,
          task_name: "Configuración de conceptos de pago",
          description: "Establecer colegiaturas, inscripciones y conceptos adicionales",
          phase: "configuration",
          assigned_to: "Luis Configuración",
          due_date: "2025-02-02",
          status: "pending",
          priority: "medium",
          estimated_hours: 6,
          dependencies: ["Importación de base de estudiantes"]
        },
        {
          id: 4,
          project_id: selectedProject.id,
          task_name: "Capacitación personal administrativo",
          description: "Entrenamiento en módulos de caja y administración",
          phase: "training",
          assigned_to: "Ana Implementación",
          due_date: "2025-02-10",
          status: "pending",
          priority: "high",
          estimated_hours: 16,
          dependencies: ["Configuración de conceptos de pago"]
        }
      ] as ImplementationTask[];
    },
    enabled: !!selectedProject,
  });

  // Update project status mutation
  const updateProjectMutation = useMutation({
    mutationFn: async ({ projectId, phase, status }: { projectId: number; phase?: string; status?: string }) => {
      await new Promise(resolve => setTimeout(resolve, 500));
      return { success: true };
    },
    onSuccess: () => {
      toast({
        title: "Proyecto Actualizado",
        description: "El estado del proyecto ha sido actualizado exitosamente",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/implementation/projects"] });
    },
  });

  // Add task mutation
  const addTaskMutation = useMutation({
    mutationFn: async (taskData: any) => {
      await new Promise(resolve => setTimeout(resolve, 500));
      return { success: true };
    },
    onSuccess: () => {
      toast({
        title: "Tarea Agregada",
        description: "La nueva tarea ha sido creada exitosamente",
      });
      setNewTaskData({ task_name: "", description: "", due_date: "", priority: "medium", estimated_hours: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/implementation/tasks"] });
    },
  });

  const getPhaseColor = (phase: string) => {
    switch (phase) {
      case 'discovery': return 'bg-blue-100 text-blue-800';
      case 'setup': return 'bg-purple-100 text-purple-800';
      case 'configuration': return 'bg-orange-100 text-orange-800';
      case 'training': return 'bg-yellow-100 text-yellow-800';
      case 'testing': return 'bg-indigo-100 text-indigo-800';
      case 'go_live': return 'bg-green-100 text-green-800';
      case 'post_launch': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'on_track': return 'bg-green-100 text-green-800';
      case 'at_risk': return 'bg-yellow-100 text-yellow-800';
      case 'delayed': return 'bg-red-100 text-red-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'critical': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredProjects = projects.filter(project => {
    const matchesStatus = statusFilter === "all" || project.status === statusFilter;
    const matchesPhase = phaseFilter === "all" || project.current_phase === phaseFilter;
    return matchesStatus && matchesPhase;
  });

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Rocket className="h-8 w-8 text-purple-600" />
                Dashboard de Implementación
              </h1>
              <p className="text-gray-600 mt-2">
                Gestión de proyectos de implementación y onboarding de escuelas
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Badge className="bg-purple-100 text-purple-800 font-semibold">
                Implementation Specialist
              </Badge>
              <Button className="bg-purple-600 hover:bg-purple-700">
                <Target className="h-4 w-4 mr-2" />
                Nuevo Proyecto
              </Button>
            </div>
          </div>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Proyectos</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics?.total_projects || 0}</div>
              <p className="text-xs text-muted-foreground">Histórico</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Activos</CardTitle>
              <Rocket className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{metrics?.active_implementations || 0}</div>
              <p className="text-xs text-muted-foreground">En progreso</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tiempo Promedio</CardTitle>
              <Clock className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{metrics?.avg_implementation_time || 0}d</div>
              <p className="text-xs text-muted-foreground">Implementación</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tasa de Éxito</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{metrics?.success_rate || 0}%</div>
              <p className="text-xs text-muted-foreground">Proyectos exitosos</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completados</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{metrics?.projects_completed_this_month || 0}</div>
              <p className="text-xs text-muted-foreground">Este mes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tareas Vencidas</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{metrics?.overdue_tasks || 0}</div>
              <p className="text-xs text-muted-foreground">Requieren atención</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Projects List */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Proyectos de Implementación</CardTitle>
                </div>
                <div className="flex gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los estados</SelectItem>
                      <SelectItem value="on_track">En tiempo</SelectItem>
                      <SelectItem value="at_risk">En riesgo</SelectItem>
                      <SelectItem value="delayed">Retrasado</SelectItem>
                      <SelectItem value="completed">Completado</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Select value={phaseFilter} onValueChange={setPhaseFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Fase" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las fases</SelectItem>
                      <SelectItem value="discovery">Descubrimiento</SelectItem>
                      <SelectItem value="setup">Configuración</SelectItem>
                      <SelectItem value="configuration">Parametrización</SelectItem>
                      <SelectItem value="training">Capacitación</SelectItem>
                      <SelectItem value="testing">Pruebas</SelectItem>
                      <SelectItem value="go_live">Go Live</SelectItem>
                      <SelectItem value="post_launch">Post Lanzamiento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {filteredProjects.map((project) => (
                    <div
                      key={project.id}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        selectedProject?.id === project.id
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                      onClick={() => setSelectedProject(project)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className={getPhaseColor(project.current_phase)}>
                              {project.current_phase.replace('_', ' ').toUpperCase()}
                            </Badge>
                            <Badge className={getStatusColor(project.status)}>
                              {project.status.replace('_', ' ').toUpperCase()}
                            </Badge>
                            <Badge className={getRiskColor(project.risk_level)}>
                              RIESGO {project.risk_level.toUpperCase()}
                            </Badge>
                          </div>
                          <h4 className="font-semibold text-gray-900 mb-1">{project.school_name}</h4>
                          <p className="text-sm text-gray-600 mb-2">
                            {project.students_count} estudiantes • {project.campus_count} campus
                          </p>
                          <p className="text-sm text-gray-500">
                            Especialista: {project.assigned_specialist}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900">
                            ${project.contract_value.toLocaleString()}
                          </p>
                          <p className="text-xs text-gray-500">Valor contrato</p>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Progreso del proyecto</span>
                          <span>{project.progress_percentage}%</span>
                        </div>
                        <Progress value={project.progress_percentage} className="w-full" />
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>Inicio: {project.start_date}</span>
                          <span>Go Live: {project.target_go_live}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Project Details and Tasks */}
          <div className="space-y-4">
            {selectedProject ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <School className="h-5 w-5" />
                      {selectedProject.school_name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">Contacto:</span>
                        <span className="text-sm">{selectedProject.contact_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">Email:</span>
                        <span className="text-sm">{selectedProject.email}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">Teléfono:</span>
                        <span className="text-sm">{selectedProject.phone}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">Progreso:</span>
                        <span className="text-sm font-semibold">{selectedProject.progress_percentage}%</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Cambiar Fase</Label>
                      <Select
                        value={selectedProject.current_phase}
                        onValueChange={(phase) => 
                          updateProjectMutation.mutate({ projectId: selectedProject.id, phase })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="discovery">Descubrimiento</SelectItem>
                          <SelectItem value="setup">Configuración</SelectItem>
                          <SelectItem value="configuration">Parametrización</SelectItem>
                          <SelectItem value="training">Capacitación</SelectItem>
                          <SelectItem value="testing">Pruebas</SelectItem>
                          <SelectItem value="go_live">Go Live</SelectItem>
                          <SelectItem value="post_launch">Post Lanzamiento</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Integraciones Requeridas</Label>
                      <div className="flex flex-wrap gap-1">
                        {selectedProject.integration_requirements.map((integration, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {integration}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1">
                        <Phone className="h-4 w-4 mr-2" />
                        Llamar
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1">
                        <Mail className="h-4 w-4 mr-2" />
                        Email
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Project Tasks */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5" />
                      Tareas del Proyecto
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      {tasks.map((task) => (
                        <div key={task.id} className="p-3 border rounded-lg">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <h5 className="font-medium text-sm">{task.task_name}</h5>
                              <p className="text-xs text-gray-600">{task.description}</p>
                            </div>
                            <Badge 
                              className={
                                task.status === 'completed' ? 'bg-green-100 text-green-800' :
                                task.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                task.status === 'blocked' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }
                            >
                              {task.status.replace('_', ' ')}
                            </Badge>
                          </div>
                          <div className="flex justify-between text-xs text-gray-500">
                            <span>Vence: {task.due_date}</span>
                            <span>{task.estimated_hours}h estimadas</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add New Task */}
                    <div className="border-t pt-4 space-y-3">
                      <Label>Agregar Nueva Tarea</Label>
                      <Input
                        placeholder="Nombre de la tarea"
                        value={newTaskData.task_name}
                        onChange={(e) => setNewTaskData({ ...newTaskData, task_name: e.target.value })}
                      />
                      <Textarea
                        placeholder="Descripción"
                        value={newTaskData.description}
                        onChange={(e) => setNewTaskData({ ...newTaskData, description: e.target.value })}
                        className="min-h-16"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="date"
                          value={newTaskData.due_date}
                          onChange={(e) => setNewTaskData({ ...newTaskData, due_date: e.target.value })}
                        />
                        <Input
                          type="number"
                          placeholder="Horas"
                          value={newTaskData.estimated_hours}
                          onChange={(e) => setNewTaskData({ ...newTaskData, estimated_hours: e.target.value })}
                        />
                      </div>
                      <Button 
                        className="w-full"
                        onClick={() => addTaskMutation.mutate({
                          ...newTaskData,
                          project_id: selectedProject.id
                        })}
                        disabled={!newTaskData.task_name.trim()}
                      >
                        Agregar Tarea
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="text-center py-12">
                  <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Selecciona un proyecto para ver los detalles</p>
                </CardContent>
              </Card>
            )}

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Herramientas de Implementación</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start">
                  <Upload className="h-4 w-4 mr-2" />
                  Importar Datos
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Database className="h-4 w-4 mr-2" />
                  Configurar BD
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Settings className="h-4 w-4 mr-2" />
                  Setup Tenant
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Play className="h-4 w-4 mr-2" />
                  Demo Training
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}