import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Gift, Percent, Users, Plus, Edit, Trash2, GraduationCap, DollarSign, Calculator, Zap, Target, Award, FileText, Building, Download, AlertTriangle, CheckCircle, XCircle, Clock, MoreVertical } from "lucide-react";

export default function Becas() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTab, setSelectedTab] = useState("becas");
  const [showAsignarModal, setShowAsignarModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [showStudentsModal, setShowStudentsModal] = useState(false);
  const [selectedBeca, setSelectedBeca] = useState<any>(null);
  const [selectedEstudiante, setSelectedEstudiante] = useState<any>(null);
  const { toast } = useToast();

  // Sistema de gestión administrativa de becas y descuentos
  const becasYDescuentos = [
    {
      id: 1,
      nombre: "Beca USEBEQ",
      categoria: "usebeq",
      tipo: "manual",
      descripcion: "Beca de la Unidad de Servicios para la Educación Básica en el Estado de Querétaro",
      porcentaje_max: 100,
      estudiantes_aplicados: 15,
      monto_total_descuento: 3200000, // $32,000 MXN
      asignacion: "Manual por área académica",
      documentos_requeridos: ["Estudio socioeconómico", "Comprobante de ingresos", "Carta solicitud"],
      vigencia: "2024-2025",
      activa: true
    },
    {
      id: 2,
      nombre: "Descuento por Hermanos",
      categoria: "familiar",
      tipo: "automatico",
      descripcion: "Descuento automático aplicado cuando hay múltiples hermanos inscritos",
      porcentaje_max: 40,
      estudiantes_aplicados: 22,
      monto_total_descuento: 1950000, // $19,500 MXN
      asignacion: "Automático al detectar hermanos en sistema",
      criterios: "2 hermanos: 20%, 3 hermanos: 30%, 4+ hermanos: 40%",
      vigencia: "2024-2025",
      activa: true
    },
    {
      id: 3,
      nombre: "Beca por Convenio Empresarial",
      categoria: "convenio",
      tipo: "manual",
      descripcion: "Becas otorgadas por convenios con empresas patrocinadoras",
      porcentaje_max: 75,
      estudiantes_aplicados: 8,
      monto_total_descuento: 1800000, // $18,000 MXN
      asignacion: "Manual según convenio vigente",
      empresas_convenio: ["Grupo Industrial SA", "Tech Solutions", "Comercial del Norte"],
      vigencia: "2024-2025",
      activa: true
    },
    {
      id: 4,
      nombre: "Beca por Mérito Deportivo",
      categoria: "deportiva",
      tipo: "manual",
      descripcion: "Reconocimiento a estudiantes destacados en actividades deportivas",
      porcentaje_max: 50,
      estudiantes_aplicados: 6,
      monto_total_descuento: 720000, // $7,200 MXN
      asignacion: "Manual por coordinación deportiva",
      documentos_requeridos: ["Constancia participación", "Resultados competencias"],
      vigencia: "2024-2025",
      activa: true
    },
    {
      id: 5,
      nombre: "Beca Cultural y Artística",
      categoria: "cultural",
      tipo: "manual",
      descripcion: "Apoyo a estudiantes con talento en actividades culturales y artísticas",
      porcentaje_max: 45,
      estudiantes_aplicados: 4,
      monto_total_descuento: 540000, // $5,400 MXN
      asignacion: "Manual por área cultural",
      documentos_requeridos: ["Portfolio artístico", "Carta recomendación"],
      vigencia: "2024-2025",
      activa: true
    },
    {
      id: 6,
      nombre: "Descuento Empleados",
      categoria: "empleado",
      tipo: "automatico",
      descripcion: "Descuento especial para hijos de empleados de la institución",
      porcentaje_max: 60,
      estudiantes_aplicados: 12,
      monto_total_descuento: 2400000, // $24,000 MXN
      asignacion: "Automático al verificar relación laboral",
      criterios: "Personal administrativo: 30%, Docentes: 50%, Directivos: 60%",
      vigencia: "2024-2025",
      activa: true
    }
  ];

  // Estudiantes para gestión de becas
  const estudiantesParaBecas = [
    {
      id: 1,
      nombre_completo: "Ana García Pérez",
      grado: "5to Primaria",
      hermanos_inscritos: 1,
      tipo_solicitud: "socioeconomica",
      grupo: "A",
      monto_mensual_descuento: 150000, // $1,500 MXN
      porcentaje_asignado: 50,
      estado: "Activa",
      fecha_asignacion: "2024-08-15",
      observaciones: "Renovación automática cada semestre"
    },
    {
      id: 2,
      nombre_completo: "Carlos Mendoza Silva", 
      grado: "3ro Secundaria",
      hermanos_inscritos: 3,
      tipo_solicitud: "familiar",
      grupo: "B",
      monto_mensual_descuento: 90000, // $900 MXN
      porcentaje_asignado: 30,
      estado: "Automática",
      fecha_asignacion: "2024-08-01",
      observaciones: "Aplicado automáticamente por sistema"
    },
    {
      id: 3,
      nombre_completo: "Sofia López Torres",
      grado: "1ro Bachillerato", 
      hermanos_inscritos: 2,
      tipo_solicitud: "convenio",
      grupo: "A",
      monto_mensual_descuento: 225000, // $2,250 MXN
      porcentaje_asignado: 75,
      estado: "Activa",
      fecha_asignacion: "2024-09-01",
      observaciones: "Convenio con Grupo Industrial SA"
    },
    {
      id: 4,
      nombre_completo: "Miguel Ramírez Castro",
      grado: "2do Secundaria",
      hermanos_inscritos: 0,
      tipo_solicitud: "deportiva",
      grupo: "C",
      monto_mensual_descuento: 120000, // $1,200 MXN
      porcentaje_asignado: 40,
      estado: "Pendiente Renovación",
      fecha_asignacion: "2024-08-20",
      observaciones: "Requiere constancia de participación actualizada"
    }
  ];

  const totalTiposBecas = becasYDescuentos.filter(b => b.activa).length;
  const totalEstudiantesBeneficiados = becasYDescuentos.reduce((sum, b) => sum + b.estudiantes_aplicados, 0);
  const montoTotalDescuentos = becasYDescuentos.reduce((sum, b) => sum + b.monto_total_descuento, 0);
  const promedioDescuento = becasYDescuentos.reduce((sum, b) => sum + b.porcentaje_max, 0) / becasYDescuentos.length;

  // Funciones para manejar acciones de botones
  const handleEditBeca = (beca: any) => {
    setSelectedBeca(beca);
    setShowEditModal(true);
  };

  const handleSuspendEstudiante = (estudiante: any) => {
    toast({
      title: "Beca Suspendida",
      description: `La beca de ${estudiante.nombre_completo} ha sido suspendida temporalmente.`,
    });
  };

  const handleActivateBeca = (becaId: number) => {
    toast({
      title: "Beca Activada",
      description: "La beca ha sido activada exitosamente.",
    });
  };

  const handleViewDocuments = (estudiante: any) => {
    setSelectedEstudiante(estudiante);
    setShowDocumentModal(true);
  };

  const handleGenerateReport = (formato: 'excel' | 'pdf' | 'word') => {
    const reportData = {
      fecha: new Date().toLocaleDateString(),
      tipos_becas: totalTiposBecas,
      estudiantes_beneficiados: totalEstudiantesBeneficiados,
      monto_total: montoTotalDescuentos / 100,
      promedio_descuento: promedioDescuento.toFixed(1)
    };

    // Simular descarga de reporte
    const fileName = `reporte_becas_${new Date().toISOString().split('T')[0]}.${formato}`;
    
    if (formato === 'excel') {
      // Crear contenido CSV para simular Excel
      const csvContent = [
        'Tipo de Beca,Estudiantes,Monto Total,Porcentaje Max',
        ...becasYDescuentos.map(b => `${b.nombre},${b.estudiantes_aplicados},${b.monto_total_descuento/100},${b.porcentaje_max}%`)
      ].join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName.replace('.excel', '.csv');
      a.click();
      window.URL.revokeObjectURL(url);
    } else {
      // Para PDF y Word, crear contenido de texto
      const content = `
REPORTE DE BECAS Y DESCUENTOS
Fecha: ${reportData.fecha}

RESUMEN EJECUTIVO:
- Tipos de becas activas: ${reportData.tipos_becas}
- Estudiantes beneficiados: ${reportData.estudiantes_beneficiados}
- Monto total de descuentos: $${reportData.monto_total.toLocaleString()}
- Promedio de descuento: ${reportData.promedio_descuento}%

DETALLE POR TIPO DE BECA:
${becasYDescuentos.map(b => `
${b.nombre}:
- Estudiantes: ${b.estudiantes_aplicados}
- Monto: $${(b.monto_total_descuento/100).toLocaleString()}
- Porcentaje máximo: ${b.porcentaje_max}%
- Estado: ${b.activa ? 'Activa' : 'Inactiva'}
`).join('')}
      `;

      const blob = new Blob([content], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName.replace(formato, 'txt');
      a.click();
      window.URL.revokeObjectURL(url);
    }

    toast({
      title: "Reporte Generado",
      description: `Reporte en formato ${formato.toUpperCase()} descargado exitosamente.`,
    });
  };

  const handleCalculateTotal = () => {
    const calculo = {
      becas_activas: totalTiposBecas,
      estudiantes_totales: totalEstudiantesBeneficiados,
      ahorro_mensual: montoTotalDescuentos / 100,
      ahorro_anual: (montoTotalDescuentos / 100) * 10, // 10 meses del ciclo escolar
      beneficio_promedio: (montoTotalDescuentos / 100) / totalEstudiantesBeneficiados
    };

    toast({
      title: "Cálculo Total Completado",
      description: `Ahorro anual estimado: $${calculo.ahorro_anual.toLocaleString()} | Beneficio promedio por estudiante: $${calculo.beneficio_promedio.toLocaleString()}`,
    });
  };

  const handleAuditAssignments = () => {
    const auditResults = {
      total_asignaciones: totalEstudiantesBeneficiados,
      asignaciones_manuales: becasYDescuentos.filter(b => b.tipo === 'manual').reduce((sum, b) => sum + b.estudiantes_aplicados, 0),
      asignaciones_automaticas: becasYDescuentos.filter(b => b.tipo === 'automatico').reduce((sum, b) => sum + b.estudiantes_aplicados, 0),
      pendientes_revision: estudiantesParaBecas.filter(e => e.estado === 'Pendiente Renovación').length
    };

    toast({
      title: "Auditoría Completada",
      description: `${auditResults.total_asignaciones} asignaciones revisadas. ${auditResults.pendientes_revision} requieren atención.`,
    });
  };

  const handleManualAssignment = () => {
    setShowAsignarModal(true);
    toast({
      title: "Asignación Manual Activada",
      description: "Selecciona estudiantes para asignar becas manualmente caso por caso.",
    });
  };

  const handleActivateAllBecas = () => {
    // Simular activación de todas las becas inactivas
    const inactiveBecas = becasYDescuentos.filter(b => !b.activa);
    const totalActivated = inactiveBecas.length;
    
    // Actualizar estado de becas a activas
    becasYDescuentos.forEach(beca => {
      if (!beca.activa) {
        beca.activa = true;
      }
    });

    // Activar automáticamente descuentos por hermanos detectados
    const hermanosBeneficiados = estudiantesParaBecas.filter(e => 
      e.tipo_solicitud === 'familiar'
    ).length;

    // Aplicar becas automáticas configuradas
    const becasAutomaticas = becasYDescuentos.filter(b => b.tipo === 'automatico');
    
    toast({
      title: "Sistema de Becas Activado",
      description: `${totalActivated} tipos de becas activadas. ${hermanosBeneficiados} descuentos por hermanos aplicados automáticamente. ${becasAutomaticas.length} algoritmos automáticos en funcionamiento.`,
    });
  };

  const handleViewStudents = (beca: any) => {
    setSelectedBeca(beca);
    setShowStudentsModal(true);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestión Administrativa de Becas y Descuentos</h1>
          <p className="text-muted-foreground">Herramienta para asignación manual eficiente y control administrativo</p>
        </div>
        <div className="flex space-x-2">
          <Dialog open={showAsignarModal} onOpenChange={setShowAsignarModal}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Users className="mr-2 h-4 w-4" />
                Asignar Beca
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Asignar Beca/Descuento a Estudiante</DialogTitle>
              </DialogHeader>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="estudiante">Estudiante</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Buscar estudiante..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ana">Ana García Pérez - 5to Primaria</SelectItem>
                        <SelectItem value="carlos">Carlos Mendoza Silva - 3ro Secundaria</SelectItem>
                        <SelectItem value="sofia">Sofia López Torres - 1ro Bachillerato</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="tipo_beca">Tipo de Beca</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar beca..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="usebeq">Beca USEBEQ</SelectItem>
                        <SelectItem value="convenio">Beca por Convenio</SelectItem>
                        <SelectItem value="deportiva">Beca Deportiva</SelectItem>
                        <SelectItem value="cultural">Beca Cultural</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="porcentaje">Porcentaje de Descuento (%)</Label>
                    <Input id="porcentaje" type="number" min="0" max="100" placeholder="50" />
                  </div>
                  <div>
                    <Label htmlFor="vigencia">Vigencia</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar vigencia..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="semestre">Un semestre</SelectItem>
                        <SelectItem value="anual">Ciclo completo 2024-2025</SelectItem>
                        <SelectItem value="permanente">Permanente (hasta graduación)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="observaciones">Observaciones</Label>
                  <Textarea id="observaciones" placeholder="Motivo de la beca, documentos adjuntos, condiciones especiales..." />
                </div>

                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setShowAsignarModal(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={() => setShowAsignarModal(false)}>
                    Asignar Beca
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nuevo Tipo de Beca
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Configurar Nuevo Tipo de Beca</DialogTitle>
              </DialogHeader>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="nombre">Nombre de la Beca/Descuento</Label>
                    <Input id="nombre" placeholder="Ej: Beca Excelencia Académica" />
                  </div>
                  <div>
                    <Label htmlFor="categoria">Categoría</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar categoría" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="socioeconomica">Socioeconómica</SelectItem>
                        <SelectItem value="convenio">Por Convenio</SelectItem>
                        <SelectItem value="deportiva">Deportiva</SelectItem>
                        <SelectItem value="cultural">Cultural/Artística</SelectItem>
                        <SelectItem value="familiar">Familiar</SelectItem>
                        <SelectItem value="empleado">Empleados</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="tipo">Método de Asignación</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar método" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual - Asignación caso por caso</SelectItem>
                      <SelectItem value="automatico">Automático - Detecta criterios en sistema</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="descripcion">Descripción</Label>
                  <Textarea id="descripcion" placeholder="Describe los criterios y objetivos de esta beca..." />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="porcentaje_max">Porcentaje Máximo (%)</Label>
                    <Input id="porcentaje_max" type="number" min="0" max="100" placeholder="50" />
                  </div>
                  <div>
                    <Label htmlFor="vigencia_default">Vigencia por Defecto</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar vigencia" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="semestre">Un semestre</SelectItem>
                        <SelectItem value="anual">Ciclo completo</SelectItem>
                        <SelectItem value="permanente">Permanente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch id="activa" />
                  <Label htmlFor="activa">Activar inmediatamente</Label>
                </div>

                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setShowAddModal(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={() => setShowAddModal(false)}>
                    Crear Tipo de Beca
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPIs Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tipos de Becas</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTiposBecas}</div>
            <p className="text-xs text-muted-foreground">Activos en el sistema</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Estudiantes Beneficiados</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEstudiantesBeneficiados}</div>
            <p className="text-xs text-muted-foreground">Con descuentos aplicados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ahorro Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(montoTotalDescuentos / 100).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Descuentos otorgados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Promedio Descuento</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{promedioDescuento.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Beneficio promedio</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="becas">Tipos de Becas</TabsTrigger>
          <TabsTrigger value="estudiantes">Estudiantes con Becas</TabsTrigger>
          <TabsTrigger value="reportes">Reportes y Control</TabsTrigger>
        </TabsList>

        <TabsContent value="becas" className="space-y-4">
          <div className="grid gap-4">
            {becasYDescuentos.map((beca) => (
              <Card key={beca.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2">
                        {beca.categoria === 'socioeconomica' && <DollarSign className="h-5 w-5 text-green-500" />}
                        {beca.categoria === 'familiar' && <Users className="h-5 w-5 text-blue-500" />}
                        {beca.categoria === 'convenio' && <Building className="h-5 w-5 text-purple-500" />}
                        {beca.categoria === 'deportiva' && <Target className="h-5 w-5 text-orange-500" />}
                        {beca.categoria === 'cultural' && <Award className="h-5 w-5 text-pink-500" />}
                        {beca.categoria === 'empleado' && <GraduationCap className="h-5 w-5 text-gray-500" />}
                        {beca.nombre}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">{beca.descripcion}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant={beca.activa ? "default" : "secondary"}>
                        {beca.activa ? "Activa" : "Inactiva"}
                      </Badge>
                      <Badge variant="outline">
                        <Zap className="h-3 w-3 mr-1" />
                        {beca.tipo}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm font-medium">Descuento Máximo</p>
                      <p className="text-2xl font-bold text-green-600">{beca.porcentaje_max}%</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Método Asignación</p>
                      <p className="text-lg font-semibold">{beca.tipo}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Estudiantes Activos</p>
                      <p className="text-lg font-semibold text-blue-600">{beca.estudiantes_aplicados}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Ahorro Total</p>
                      <p className="text-lg font-semibold text-green-600">
                        ${(beca.monto_total_descuento / 100).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  
                  <Separator className="my-4" />
                  
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Proceso de Asignación:</p>
                    <p className="text-sm text-muted-foreground">{beca.asignacion}</p>
                    {beca.criterios && (
                      <p className="text-sm text-muted-foreground">Criterios: {beca.criterios}</p>
                    )}
                    {beca.empresas_convenio && (
                      <div>
                        <p className="text-sm font-medium">Empresas con Convenio:</p>
                        <p className="text-sm text-muted-foreground">{beca.empresas_convenio.join(", ")}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end space-x-2 mt-4">
                    <Button variant="outline" size="sm" onClick={() => handleEditBeca(beca)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleViewStudents(beca)}>
                      Ver Estudiantes
                    </Button>
                    {!beca.activa && (
                      <Button variant="default" size="sm" onClick={() => handleActivateBeca(beca.id)}>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Activar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="estudiantes" className="space-y-4">
          <div className="grid gap-4">
            {estudiantesParaBecas.map((estudiante) => (
              <Card key={estudiante.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{estudiante.nombre_completo}</CardTitle>
                      <p className="text-sm text-muted-foreground">{estudiante.grado}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant={estudiante.estado === "Activa" ? "default" : estudiante.estado === "Automática" ? "secondary" : "destructive"}>
                        {estudiante.estado}
                      </Badge>
                      <Badge variant="outline">
                        {estudiante.porcentaje_asignado}% descuento
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm font-medium">Tipo de Beca</p>
                      <p className="text-sm text-muted-foreground">{estudiante.tipo_solicitud}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Fecha Asignación</p>
                      <p className="text-sm text-muted-foreground">{estudiante.fecha_asignacion}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Hermanos Inscritos</p>
                      <p className="text-sm text-muted-foreground">{estudiante.hermanos_inscritos}</p>
                    </div>
                  </div>
                  
                  <Separator className="my-4" />
                  
                  <div>
                    <p className="text-sm font-medium">Observaciones:</p>
                    <p className="text-sm text-muted-foreground">{estudiante.observaciones}</p>
                  </div>

                  <div className="flex justify-end space-x-2 mt-4">
                    <Button variant="outline" size="sm" onClick={() => handleEditBeca(estudiante)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Modificar
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleViewDocuments(estudiante)}>
                      <FileText className="h-4 w-4 mr-2" />
                      Documentos
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                          <XCircle className="h-4 w-4 mr-2" />
                          Suspender
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                            <AlertTriangle className="h-5 w-5" />
                            Suspender Beca
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            ¿Estás seguro de que deseas suspender la beca de {estudiante.nombre_completo}? 
                            Esta acción suspenderá temporalmente el descuento aplicado.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction 
                            className="bg-red-600 hover:bg-red-700"
                            onClick={() => handleSuspendEstudiante(estudiante)}
                          >
                            Suspender Beca
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="reportes" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Distribución por Tipo de Beca</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {becasYDescuentos.filter(b => b.activa).map((beca) => {
                  const porcentajeDelTotal = (beca.estudiantes_aplicados / totalEstudiantesBeneficiados) * 100;
                  return (
                    <div key={beca.id} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{beca.nombre}</span>
                        <span>{beca.estudiantes_aplicados} estudiantes</span>
                      </div>
                      <Progress value={porcentajeDelTotal} className="h-2" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Distribución de Beneficios ($)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {becasYDescuentos.filter(b => b.activa).map((beca) => {
                  const porcentajeDelTotal = (beca.monto_total_descuento / montoTotalDescuentos) * 100;
                  return (
                    <div key={beca.id} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{beca.categoria}</span>
                        <span>${(beca.monto_total_descuento / 100).toLocaleString()}</span>
                      </div>
                      <Progress value={porcentajeDelTotal} className="h-2" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Controles Administrativos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="h-20 flex flex-col items-center justify-center">
                      <FileText className="h-6 w-6 mb-2" />
                      Generar Reporte Mensual
                      <Download className="h-3 w-3 mt-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => handleGenerateReport('excel')}>
                      <FileText className="h-4 w-4 mr-2" />
                      Descargar Excel
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleGenerateReport('pdf')}>
                      <FileText className="h-4 w-4 mr-2" />
                      Descargar PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleGenerateReport('word')}>
                      <FileText className="h-4 w-4 mr-2" />
                      Descargar Word
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button 
                  variant="outline" 
                  className="h-20 flex flex-col items-center justify-center"
                  onClick={handleCalculateTotal}
                >
                  <Calculator className="h-6 w-6 mb-2" />
                  Calcular Ahorro Total
                </Button>

                <Button 
                  variant="outline" 
                  className="h-20 flex flex-col items-center justify-center"
                  onClick={handleAuditAssignments}
                >
                  <Users className="h-6 w-6 mb-2" />
                  Auditar Asignaciones
                </Button>

                <Button 
                  variant="default" 
                  className="h-20 flex flex-col items-center justify-center bg-green-600 hover:bg-green-700"
                  onClick={handleActivateAllBecas}
                >
                  <CheckCircle className="h-6 w-6 mb-2" />
                  ACTIVA
                </Button>

                <Button 
                  variant="secondary" 
                  className="h-20 flex flex-col items-center justify-center"
                  onClick={handleManualAssignment}
                >
                  <Target className="h-6 w-6 mb-2" />
                  Manual
                </Button>
              </div>

              <Separator />

              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h4 className="font-medium text-blue-900 mb-2">Resumen del Sistema</h4>
                <div className="text-sm text-blue-800 space-y-1">
                  <p>• El sistema gestiona {totalTiposBecas} tipos diferentes de becas y descuentos</p>
                  <p>• Actualmente beneficia a {totalEstudiantesBeneficiados} estudiantes</p>
                  <p>• Ahorro total generado: ${(montoTotalDescuentos / 100).toLocaleString()} MXN</p>
                  <p>• Asignación {becasYDescuentos.filter(b => b.tipo === "manual").length} manual + {becasYDescuentos.filter(b => b.tipo === "automatico").length} automática</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal para Editar Beca */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modificar Beca/Descuento</DialogTitle>
            <DialogDescription>
              Editar configuración y asignación de beca para estudiante
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit_estudiante">Estudiante</Label>
                <Input 
                  id="edit_estudiante" 
                  value={selectedBeca?.nombre_completo || selectedBeca?.nombre || ''} 
                  disabled 
                />
              </div>
              <div>
                <Label htmlFor="edit_tipo">Tipo de Beca</Label>
                <Select defaultValue={selectedBeca?.tipo_solicitud || selectedBeca?.categoria}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usebeq">Beca USEBEQ</SelectItem>
                    <SelectItem value="convenio">Beca por Convenio</SelectItem>
                    <SelectItem value="deportiva">Beca Deportiva</SelectItem>
                    <SelectItem value="cultural">Beca Cultural</SelectItem>
                    <SelectItem value="familiar">Descuento Familiar</SelectItem>
                    <SelectItem value="empleado">Descuento Empleados</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit_porcentaje">Porcentaje de Descuento (%)</Label>
                <Input 
                  id="edit_porcentaje" 
                  type="number" 
                  min="0" 
                  max="100" 
                  defaultValue={selectedBeca?.porcentaje_asignado || selectedBeca?.porcentaje_max} 
                />
              </div>
              <div>
                <Label htmlFor="edit_estado">Estado</Label>
                <Select defaultValue={selectedBeca?.estado || (selectedBeca?.activa ? "Activa" : "Inactiva")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Activa">Activa</SelectItem>
                    <SelectItem value="Suspendida">Suspendida</SelectItem>
                    <SelectItem value="Pendiente Renovación">Pendiente Renovación</SelectItem>
                    <SelectItem value="Inactiva">Inactiva</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="edit_observaciones">Observaciones</Label>
              <Textarea 
                id="edit_observaciones" 
                defaultValue={selectedBeca?.observaciones || selectedBeca?.descripcion}
                placeholder="Actualizar motivos, condiciones o comentarios..."
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowEditModal(false)}>
                Cancelar
              </Button>
              <Button onClick={() => {
                setShowEditModal(false);
                toast({
                  title: "Beca Actualizada",
                  description: "Los cambios han sido guardados exitosamente.",
                });
              }}>
                Guardar Cambios
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal para Ver Documentos */}
      <Dialog open={showDocumentModal} onOpenChange={setShowDocumentModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Documentos de Beca - {selectedEstudiante?.nombre_completo}</DialogTitle>
            <DialogDescription>
              Gestión de documentos requeridos y adjuntos para la beca
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium mb-4">Documentos Requeridos</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm">Estudio socioeconómico</span>
                    </div>
                    <Badge variant="default">Completo</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm">Comprobante de ingresos</span>
                    </div>
                    <Badge variant="default">Completo</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm">Carta de solicitud</span>
                    </div>
                    <Badge variant="secondary">Pendiente</Badge>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-4">Documentos Adicionales</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-2">
                      <FileText className="h-4 w-4 text-blue-500" />
                      <span className="text-sm">Acta de nacimiento</span>
                    </div>
                    <Button variant="outline" size="sm">
                      <Download className="h-3 w-3 mr-1" />
                      Ver
                    </Button>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-2">
                      <FileText className="h-4 w-4 text-blue-500" />
                      <span className="text-sm">CURP</span>
                    </div>
                    <Button variant="outline" size="sm">
                      <Download className="h-3 w-3 mr-1" />
                      Ver
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="font-medium mb-4">Subir Nuevo Documento</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="doc_tipo">Tipo de Documento</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar tipo..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="solicitud">Carta de solicitud</SelectItem>
                      <SelectItem value="ingresos">Comprobante de ingresos</SelectItem>
                      <SelectItem value="estudio">Estudio socioeconómico</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="doc_file">Archivo</Label>
                  <Input id="doc_file" type="file" accept=".pdf,.jpg,.png,.docx" />
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowDocumentModal(false)}>
                Cerrar
              </Button>
              <Button onClick={() => {
                setShowDocumentModal(false);
                toast({
                  title: "Documento Subido",
                  description: "El documento ha sido adjuntado exitosamente.",
                });
              }}>
                Subir Documento
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal para Ver Estudiantes de la Beca */}
      <Dialog open={showStudentsModal} onOpenChange={setShowStudentsModal}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Estudiantes con {selectedBeca?.nombre}</DialogTitle>
            <DialogDescription>
              Lista completa de estudiantes beneficiados con esta beca
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {selectedBeca?.estudiantes_aplicados || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Beneficiados</div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      ${((selectedBeca?.monto_total_descuento || 0) / 100).toLocaleString()}
                    </div>
                    <div className="text-sm text-muted-foreground">Descuento Total</div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {selectedBeca?.porcentaje_max || 0}%
                    </div>
                    <div className="text-sm text-muted-foreground">Descuento Máximo</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="border rounded-lg">
              <div className="p-4 border-b bg-muted/50">
                <h4 className="font-medium">Lista de Estudiantes</h4>
              </div>
              <div className="divide-y">
                {estudiantesParaBecas
                  .filter(e => 
                    e.tipo_solicitud === selectedBeca?.categoria || 
                    (selectedBeca?.categoria === 'usebeq' && e.tipo_solicitud === 'socioeconomica')
                  )
                  .map((estudiante, index) => (
                    <div key={index} className="p-4 hover:bg-muted/50">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-4">
                            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                              <GraduationCap className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                              <div className="font-medium">{estudiante.nombre_completo}</div>
                              <div className="text-sm text-muted-foreground">
                                {estudiante.grado} - {estudiante.grupo}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="text-right">
                            <div className="font-medium text-green-600">
                              {estudiante.porcentaje_asignado}% descuento
                            </div>
                            <div className="text-sm text-muted-foreground">
                              ${((estudiante.monto_mensual_descuento || 0) / 100).toLocaleString()} mensual
                            </div>
                          </div>
                          <Badge 
                            variant={estudiante.estado === 'Activa' ? 'default' : 
                                   estudiante.estado === 'Suspendida' ? 'destructive' : 'secondary'}
                          >
                            {estudiante.estado}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowStudentsModal(false)}>
                Cerrar
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button>
                    <Download className="h-4 w-4 mr-2" />
                    Exportar Lista
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => {
                    const csvContent = [
                      'Nombre,Grado,Grupo,Porcentaje,Descuento Mensual,Estado',
                      ...estudiantesParaBecas
                        .filter(e => 
                          e.tipo_solicitud === selectedBeca?.categoria || 
                          (selectedBeca?.categoria === 'usebeq' && e.tipo_solicitud === 'socioeconomica')
                        )
                        .map(e => `${e.nombre_completo},${e.grado},${e.grupo || 'N/A'},${e.porcentaje_asignado}%,$${((e.monto_mensual_descuento || 0)/100).toLocaleString()},${e.estado}`)
                    ].join('\n');
                    
                    const blob = new Blob([csvContent], { type: 'text/csv' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `estudiantes_${selectedBeca?.nombre.replace(/\s+/g, '_').toLowerCase()}.csv`;
                    a.click();
                    window.URL.revokeObjectURL(url);
                    
                    toast({
                      title: "Lista Exportada",
                      description: "Lista de estudiantes descargada en formato Excel.",
                    });
                  }}>
                    <FileText className="h-4 w-4 mr-2" />
                    Descargar Excel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}