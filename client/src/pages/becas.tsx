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
import { Gift, Percent, Users, Plus, Edit, Trash2, GraduationCap, DollarSign, Calculator, Zap, Target, Award } from "lucide-react";

export default function Becas() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTab, setSelectedTab] = useState("becas");
  const [algoritmoSimulacion, setAlgoritmoSimulacion] = useState("promedio");
  const [criteriosSimulacion, setCriteriosSimulacion] = useState({
    promedio_minimo: 8.5,
    ingreso_familiar_maximo: 50000,
    hermanos_minimos: 2
  });

  // Sistema de becas y descuentos con algoritmos inteligentes
  const becasYDescuentos = [
    {
      id: 1,
      nombre: "Beca Excelencia Académica",
      categoria: "academica",
      algoritmo: "promedio",
      descripcion: "Beca automática basada en promedio académico con escalas progresivas",
      porcentaje_max: 100,
      estudiantes_elegibles: 45,
      estudiantes_aplicados: 8,
      monto_total_descuento: 2850000, // $28,500 MXN
      criterios: {
        promedio_minimo: 8.5,
        escala: "9.8+=100%, 9.5+=75%, 9.2+=50%, 9.0+=25%, 8.5+=10%"
      },
      activa: true,
      vigencia: "2024-2025"
    },
    {
      id: 2,
      nombre: "Descuento Automático Hermanos",
      categoria: "descuento",
      algoritmo: "hermanos",
      descripcion: "Descuento automático cuando hay múltiples hermanos inscritos",
      porcentaje_max: 40,
      estudiantes_elegibles: 24,
      estudiantes_aplicados: 18,
      monto_total_descuento: 1950000, // $19,500 MXN
      criterios: {
        hermanos_minimos: 2,
        escala: "4+ hermanos=40%, 3 hermanos=30%, 2 hermanos=20%"
      },
      activa: true,
      vigencia: "2024-2025"
    },
    {
      id: 3,
      nombre: "Beca Socioeconómica Inteligente",
      categoria: "socioeconomica",
      algoritmo: "ingresos",
      descripcion: "Evaluación automática basada en nivel de ingresos familiares",
      porcentaje_max: 90,
      estudiantes_elegibles: 32,
      estudiantes_aplicados: 12,
      monto_total_descuento: 3200000, // $32,000 MXN
      criterios: {
        ingreso_familiar_maximo: 40000,
        escala: "≤20% ingreso=90%, ≤40%=70%, ≤60%=50%, ≤80%=30%"
      },
      activa: true,
      vigencia: "2024-2025"
    },
    {
      id: 4,
      nombre: "Beca Deportiva y Cultural",
      categoria: "deportiva",
      algoritmo: "automatico",
      descripcion: "Reconocimiento por participación en actividades extracurriculares",
      porcentaje_max: 60,
      estudiantes_elegibles: 28,
      estudiantes_aplicados: 15,
      monto_total_descuento: 1200000, // $12,000 MXN
      criterios: {
        actividades_requeridas: ["futbol", "basquetbol", "natacion", "teatro", "musica"],
        escala: "Multiple actividades hasta 60%"
      },
      activa: true,
      vigencia: "2024-2025"
    },
    {
      id: 5,
      nombre: "Evaluación Integral (Scoring)",
      categoria: "integral",
      algoritmo: "scoring",
      descripcion: "Algoritmo compuesto que evalúa múltiples criterios con ponderaciones",
      porcentaje_max: 80,
      estudiantes_elegibles: 67,
      estudiantes_aplicados: 5,
      monto_total_descuento: 800000, // $8,000 MXN
      criterios: {
        ponderaciones: "Académico 40%, Socioeconómico 40%, Extracurricular 20%",
        escala: "Score ≥90=80%, ≥80=65%, ≥70=50%, ≥60=35%, ≥50=20%"
      },
      activa: false, // En desarrollo
      vigencia: "2024-2025"
    }
  ];

  // Estudiantes demo para simulación
  const estudiantesDemo = [
    {
      id: 1,
      nombre_completo: "Ana García Pérez",
      grado: "5to Primaria",
      promedio: 9.7,
      hermanos_inscritos: 1,
      ingreso_familiar: 35000,
      actividades_extracurriculares: ["natacion", "musica"],
      becas_actuales: ["Beca Excelencia Académica"]
    },
    {
      id: 2,
      nombre_completo: "Carlos Mendoza Silva",
      grado: "3ro Secundaria",
      promedio: 8.8,
      hermanos_inscritos: 3,
      ingreso_familiar: 28000,
      actividades_extracurriculares: ["futbol"],
      becas_actuales: ["Descuento Automático Hermanos", "Beca Socioeconómica"]
    },
    {
      id: 3,
      nombre_completo: "Sofia López Torres",
      grado: "1ro Bachillerato",
      promedio: 9.2,
      hermanos_inscritos: 2,
      ingreso_familiar: 15000,
      actividades_extracurriculares: ["teatro", "basquetbol"],
      becas_actuales: ["Beca Excelencia Académica", "Descuento Automático Hermanos", "Beca Socioeconómica"]
    }
  ];

  // Simular algoritmo de becas
  const simularAlgoritmo = (algoritmo: string, estudiante: any) => {
    switch (algoritmo) {
      case "promedio":
        if (estudiante.promedio >= 9.8) return { elegible: true, porcentaje: 100, razon: "Excelencia académica" };
        if (estudiante.promedio >= 9.5) return { elegible: true, porcentaje: 75, razon: "Alto rendimiento" };
        if (estudiante.promedio >= 9.2) return { elegible: true, porcentaje: 50, razon: "Buen rendimiento" };
        if (estudiante.promedio >= 9.0) return { elegible: true, porcentaje: 25, razon: "Rendimiento satisfactorio" };
        if (estudiante.promedio >= 8.5) return { elegible: true, porcentaje: 10, razon: "Requisitos mínimos" };
        return { elegible: false, porcentaje: 0, razon: "Promedio insuficiente" };
      
      case "hermanos":
        if (estudiante.hermanos_inscritos >= 4) return { elegible: true, porcentaje: 40, razon: "Familia numerosa (4+ hermanos)" };
        if (estudiante.hermanos_inscritos === 3) return { elegible: true, porcentaje: 30, razon: "3 hermanos inscritos" };
        if (estudiante.hermanos_inscritos === 2) return { elegible: true, porcentaje: 20, razon: "2 hermanos inscritos" };
        return { elegible: false, porcentaje: 0, razon: "Insuficientes hermanos" };
      
      case "ingresos":
        const porcentajeIngreso = (estudiante.ingreso_familiar / criteriosSimulacion.ingreso_familiar_maximo) * 100;
        if (porcentajeIngreso <= 20) return { elegible: true, porcentaje: 90, razon: "Situación crítica" };
        if (porcentajeIngreso <= 40) return { elegible: true, porcentaje: 70, razon: "Situación vulnerable" };
        if (porcentajeIngreso <= 60) return { elegible: true, porcentaje: 50, razon: "Apoyo moderado" };
        if (porcentajeIngreso <= 80) return { elegible: true, porcentaje: 30, razon: "Apoyo básico" };
        if (porcentajeIngreso <= 100) return { elegible: true, porcentaje: 15, razon: "Apoyo mínimo" };
        return { elegible: false, porcentaje: 0, razon: "Ingresos exceden límite" };
      
      default:
        return { elegible: false, porcentaje: 0, razon: "Algoritmo no disponible" };
    }
  };

  const totalBecasActivas = becasYDescuentos.filter(b => b.activa).length;
  const totalEstudiantesBeneficiados = becasYDescuentos.reduce((sum, b) => sum + b.estudiantes_aplicados, 0);
  const montoTotalDescuentos = becasYDescuentos.reduce((sum, b) => sum + b.monto_total_descuento, 0);
  const promedioDescuento = becasYDescuentos.reduce((sum, b) => sum + b.porcentaje_max, 0) / becasYDescuentos.length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Sistema Inteligente de Becas y Descuentos</h1>
          <p className="text-muted-foreground">Algoritmos automáticos para asignación de beneficios educativos</p>
        </div>
        <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nueva Beca/Descuento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Configurar Nueva Beca o Descuento</DialogTitle>
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
                      <SelectItem value="academica">Académica</SelectItem>
                      <SelectItem value="socioeconomica">Socioeconómica</SelectItem>
                      <SelectItem value="deportiva">Deportiva/Cultural</SelectItem>
                      <SelectItem value="descuento">Descuento</SelectItem>
                      <SelectItem value="integral">Evaluación Integral</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="algoritmo">Algoritmo de Asignación</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar algoritmo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual - Evaluación caso por caso</SelectItem>
                    <SelectItem value="promedio">Automático - Por promedio académico</SelectItem>
                    <SelectItem value="hermanos">Automático - Por hermanos inscritos</SelectItem>
                    <SelectItem value="ingresos">Automático - Por ingresos familiares</SelectItem>
                    <SelectItem value="scoring">Inteligente - Evaluación compuesta (scoring)</SelectItem>
                    <SelectItem value="automatico">Híbrido - Múltiples criterios</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="descripcion">Descripción</Label>
                <Textarea id="descripcion" placeholder="Describe los criterios y objetivos de esta beca..." />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="porcentaje_max">Porcentaje Máximo (%)</Label>
                  <Input id="porcentaje_max" type="number" min="0" max="100" placeholder="50" />
                </div>
                <div>
                  <Label htmlFor="monto_fijo">Monto Fijo (MXN)</Label>
                  <Input id="monto_fijo" type="number" min="0" placeholder="5000" />
                </div>
                <div>
                  <Label htmlFor="limite_maximo">Límite Máximo (MXN)</Label>
                  <Input id="limite_maximo" type="number" min="0" placeholder="50000" />
                </div>
              </div>

              <div className="space-y-4">
                <Label>Criterios Específicos</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="promedio_min">Promedio Mínimo</Label>
                    <Input id="promedio_min" type="number" step="0.1" min="0" max="10" placeholder="8.5" />
                  </div>
                  <div>
                    <Label htmlFor="ingreso_max">Ingreso Familiar Máximo</Label>
                    <Input id="ingreso_max" type="number" min="0" placeholder="50000" />
                  </div>
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
                  Crear Beca/Descuento
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPIs Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Becas Activas</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalBecasActivas}</div>
            <p className="text-xs text-muted-foreground">Algoritmos funcionando</p>
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
          <TabsTrigger value="becas">Gestión de Becas</TabsTrigger>
          <TabsTrigger value="simulador">Simulador Inteligente</TabsTrigger>
          <TabsTrigger value="reportes">Reportes y Análisis</TabsTrigger>
        </TabsList>

        <TabsContent value="becas" className="space-y-4">
          <div className="grid gap-4">
            {becasYDescuentos.map((beca) => (
              <Card key={beca.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2">
                        {beca.categoria === 'academica' && <GraduationCap className="h-5 w-5 text-blue-500" />}
                        {beca.categoria === 'socioeconomica' && <DollarSign className="h-5 w-5 text-green-500" />}
                        {beca.categoria === 'deportiva' && <Target className="h-5 w-5 text-orange-500" />}
                        {beca.categoria === 'descuento' && <Percent className="h-5 w-5 text-purple-500" />}
                        {beca.categoria === 'integral' && <Calculator className="h-5 w-5 text-red-500" />}
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
                        {beca.algoritmo}
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
                      <p className="text-sm font-medium">Elegibles</p>
                      <p className="text-lg font-semibold">{beca.estudiantes_elegibles} estudiantes</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Aplicados</p>
                      <p className="text-lg font-semibold text-blue-600">{beca.estudiantes_aplicados} activos</p>
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
                    <p className="text-sm font-medium">Criterios y Escalas:</p>
                    <p className="text-sm text-muted-foreground">{beca.criterios.escala}</p>
                  </div>

                  <div className="flex justify-end space-x-2 mt-4">
                    <Button variant="outline" size="sm">
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </Button>
                    <Button variant="outline" size="sm">
                      Ver Detalles
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="simulador" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Simulador de Algoritmos de Becas
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Prueba diferentes algoritmos con estudiantes reales para optimizar criterios
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="algoritmo">Algoritmo a Simular</Label>
                  <Select value={algoritmoSimulacion} onValueChange={setAlgoritmoSimulacion}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="promedio">Por Promedio Académico</SelectItem>
                      <SelectItem value="hermanos">Por Hermanos Inscritos</SelectItem>
                      <SelectItem value="ingresos">Por Ingresos Familiares</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="promedio_min_sim">Promedio Mínimo</Label>
                  <Input 
                    id="promedio_min_sim" 
                    type="number" 
                    step="0.1" 
                    value={criteriosSimulacion.promedio_minimo}
                    onChange={(e) => setCriteriosSimulacion({...criteriosSimulacion, promedio_minimo: Number(e.target.value)})}
                  />
                </div>
                <div>
                  <Label htmlFor="ingreso_max_sim">Ingreso Máximo</Label>
                  <Input 
                    id="ingreso_max_sim" 
                    type="number" 
                    value={criteriosSimulacion.ingreso_familiar_maximo}
                    onChange={(e) => setCriteriosSimulacion({...criteriosSimulacion, ingreso_familiar_maximo: Number(e.target.value)})}
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="font-medium">Resultados de Simulación</h4>
                {estudiantesDemo.map((estudiante) => {
                  const resultado = simularAlgoritmo(algoritmoSimulacion, estudiante);
                  return (
                    <div key={estudiante.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h5 className="font-medium">{estudiante.nombre_completo}</h5>
                          <p className="text-sm text-muted-foreground">{estudiante.grado}</p>
                        </div>
                        <Badge variant={resultado.elegible ? "default" : "destructive"}>
                          {resultado.elegible ? `${resultado.porcentaje}% Beca` : "No Elegible"}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="font-medium">Promedio:</span> {estudiante.promedio}
                        </div>
                        <div>
                          <span className="font-medium">Hermanos:</span> {estudiante.hermanos_inscritos}
                        </div>
                        <div>
                          <span className="font-medium">Ingreso:</span> ${estudiante.ingreso_familiar.toLocaleString()}
                        </div>
                        <div>
                          <span className="font-medium">Actividades:</span> {estudiante.actividades_extracurriculares.length}
                        </div>
                      </div>
                      
                      <div className="bg-muted p-3 rounded">
                        <p className="text-sm"><span className="font-medium">Evaluación:</span> {resultado.razon}</p>
                        {resultado.elegible && (
                          <div className="mt-2">
                            <Progress value={resultado.porcentaje} className="h-2" />
                            <p className="text-xs text-muted-foreground mt-1">
                              Descuento aplicable: {resultado.porcentaje}%
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reportes" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Eficiencia por Algoritmo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {becasYDescuentos.filter(b => b.activa).map((beca) => {
                  const eficiencia = (beca.estudiantes_aplicados / beca.estudiantes_elegibles) * 100;
                  return (
                    <div key={beca.id} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{beca.nombre}</span>
                        <span>{eficiencia.toFixed(1)}%</span>
                      </div>
                      <Progress value={eficiencia} className="h-2" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Distribución de Beneficios</CardTitle>
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
              <CardTitle>Recomendaciones del Sistema</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h4 className="font-medium text-blue-900 mb-2">💡 Optimización Sugerida</h4>
                <p className="text-sm text-blue-800">
                  El algoritmo de "Hermanos" tiene 75% de eficiencia. Considera reducir el requisito mínimo de hermanos de 2 a 1 para aumentar cobertura.
                </p>
              </div>
              
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <h4 className="font-medium text-green-900 mb-2">✅ Mejor Rendimiento</h4>
                <p className="text-sm text-green-800">
                  La "Beca Socioeconómica" tiene el mayor impacto con $32,000 en descuentos. Mantener criterios actuales.
                </p>
              </div>
              
              <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                <h4 className="font-medium text-orange-900 mb-2">⚠️ Atención Requerida</h4>
                <p className="text-sm text-orange-800">
                  El sistema integral (scoring) está inactivo. Activarlo podría beneficiar a 62 estudiantes adicionales.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}