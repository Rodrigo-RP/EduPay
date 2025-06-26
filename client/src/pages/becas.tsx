import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Gift, Percent, Users, Plus, Edit, Trash2, GraduationCap, DollarSign, Calculator, Zap, Target, Award, FileText, Building } from "lucide-react";

export default function Becas() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTab, setSelectedTab] = useState("becas");
  const [showAsignarModal, setShowAsignarModal] = useState(false);

  // Sistema de gestión administrativa de becas y descuentos
  const becasYDescuentos = [
    {
      id: 1,
      nombre: "Beca Socioeconómica",
      categoria: "socioeconomica",
      tipo: "manual",
      descripcion: "Gestión centralizada de becas por necesidad socioeconómica familiar",
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
      tipo_solicitud: "Beca Socioeconómica",
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
      tipo_solicitud: "Descuento por Hermanos",
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
      tipo_solicitud: "Beca por Convenio",
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
      tipo_solicitud: "Beca Deportiva",
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
                        <SelectItem value="socioeconomica">Beca Socioeconómica</SelectItem>
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
                    <Button variant="outline" size="sm">
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </Button>
                    <Button variant="outline" size="sm">
                      Ver Estudiantes
                    </Button>
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
                    <Button variant="outline" size="sm">
                      <Edit className="h-4 w-4 mr-2" />
                      Modificar
                    </Button>
                    <Button variant="outline" size="sm">
                      <FileText className="h-4 w-4 mr-2" />
                      Documentos
                    </Button>
                    <Button variant="destructive" size="sm">
                      Suspender
                    </Button>
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button className="h-20 flex flex-col items-center justify-center">
                  <FileText className="h-6 w-6 mb-2" />
                  Generar Reporte Mensual
                </Button>
                <Button variant="outline" className="h-20 flex flex-col items-center justify-center">
                  <Calculator className="h-6 w-6 mb-2" />
                  Calcular Ahorro Total
                </Button>
                <Button variant="outline" className="h-20 flex flex-col items-center justify-center">
                  <Users className="h-6 w-6 mb-2" />
                  Auditar Asignaciones
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
    </div>
  );
}