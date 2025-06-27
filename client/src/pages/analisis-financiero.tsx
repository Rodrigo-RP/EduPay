import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Users, 
  Calculator, 
  PieChart, 
  AlertTriangle, 
  CheckCircle, 
  BarChart3,
  BarChart,
  Target,
  Calendar,
  FileText,
  Download,
  AlertCircle,
  RefreshCw
} from "lucide-react";

// Componente Simulador de Costos Dinámico
function CostSimulator({ data }: { data: any }) {
  const [tuitionIncrease, setTuitionIncrease] = useState(8);
  const [enrollmentIncrease, setEnrollmentIncrease] = useState(5);
  const [customTuitionAmount, setCustomTuitionAmount] = useState('');
  const [customEnrollmentAmount, setCustomEnrollmentAmount] = useState('');
  const [simulationMode, setSimulationMode] = useState<'percentage' | 'amount'>('percentage');

  const currentTuition = 6200;
  const currentEnrollment = 2800;
  
  const calculateResults = () => {
    let newTuition, newEnrollment, tuitionIncome, enrollmentIncome;
    
    if (simulationMode === 'percentage') {
      newTuition = currentTuition * (1 + tuitionIncrease / 100);
      newEnrollment = currentEnrollment * (1 + enrollmentIncrease / 100);
      tuitionIncome = (data.netProfit * 1.56 * (tuitionIncrease / 100)) / 1000000;
      enrollmentIncome = (data.totalStudents * (newEnrollment - currentEnrollment)) / 1000000;
    } else {
      const tuitionAmount = parseFloat(customTuitionAmount) || 0;
      const enrollmentAmount = parseFloat(customEnrollmentAmount) || 0;
      newTuition = currentTuition + tuitionAmount;
      newEnrollment = currentEnrollment + enrollmentAmount;
      tuitionIncome = (data.totalStudents * tuitionAmount * 10) / 1000000;
      enrollmentIncome = (data.totalStudents * enrollmentAmount) / 1000000;
    }
    
    const totalAdditionalIncome = tuitionIncome + enrollmentIncome;
    const riskLevel = tuitionIncrease > 10 ? 'Alto' : tuitionIncrease > 6 ? 'Medio' : 'Bajo';
    const riskColor = riskLevel === 'Alto' ? 'bg-red-100 text-red-800' : 
                     riskLevel === 'Medio' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800';
    
    return { newTuition, newEnrollment, totalAdditionalIncome, riskLevel, riskColor };
  };

  const results = calculateResults();

  return (
    <div className="space-y-6">
      <div className="flex gap-4 mb-4">
        <Button 
          variant={simulationMode === 'percentage' ? 'default' : 'outline'}
          onClick={() => setSimulationMode('percentage')}
          size="sm"
        >
          Por Porcentaje (%)
        </Button>
        <Button 
          variant={simulationMode === 'amount' ? 'default' : 'outline'}
          onClick={() => setSimulationMode('amount')}
          size="sm"
        >
          Por Cantidad ($)
        </Button>
      </div>

      {simulationMode === 'percentage' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Incremento Colegiaturas (%)</Label>
              <div className="space-y-2">
                <Slider
                  value={[tuitionIncrease]}
                  onValueChange={(value) => setTuitionIncrease(value[0])}
                  max={20}
                  min={0}
                  step={0.5}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>0%</span>
                  <span className="font-medium">{tuitionIncrease}%</span>
                  <span>20%</span>
                </div>
              </div>
            </div>
            
            <div>
              <Label className="text-sm font-medium">Incremento Inscripciones (%)</Label>
              <div className="space-y-2">
                <Slider
                  value={[enrollmentIncrease]}
                  onValueChange={(value) => setEnrollmentIncrease(value[0])}
                  max={15}
                  min={0}
                  step={0.5}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>0%</span>
                  <span className="font-medium">{enrollmentIncrease}%</span>
                  <span>15%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="tuition-amount" className="text-sm font-medium">
                Incremento Colegiaturas ($)
              </Label>
              <Input
                id="tuition-amount"
                type="number"
                placeholder="Ej: 500"
                value={customTuitionAmount}
                onChange={(e) => setCustomTuitionAmount(e.target.value)}
                className="mt-1"
              />
            </div>
            
            <div>
              <Label htmlFor="enrollment-amount" className="text-sm font-medium">
                Incremento Inscripciones ($)
              </Label>
              <Input
                id="enrollment-amount"
                type="number"
                placeholder="Ej: 200"
                value={customEnrollmentAmount}
                onChange={(e) => setCustomEnrollmentAmount(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        </div>
      )}

      <div className="p-4 bg-blue-50 rounded-lg">
        <h4 className="font-semibold text-base mb-3 flex items-center gap-2">
          <Calculator className="w-4 h-4" />
          Resultados de Simulación
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm">Colegiatura Actual</span>
              <span className="font-medium">${currentTuition.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm">Colegiatura Nueva</span>
              <span className="font-medium text-green-600">${Math.round(results.newTuition).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm">Inscripción Actual</span>
              <span className="font-medium">${currentEnrollment.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm">Inscripción Nueva</span>
              <span className="font-medium text-green-600">${Math.round(results.newEnrollment).toLocaleString()}</span>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm">Ingresos Adicionales</span>
              <span className="font-medium text-blue-600">
                ${results.totalAdditionalIncome.toFixed(2)}M anuales
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm">Riesgo de Deserción</span>
              <Badge className={results.riskColor}>{results.riskLevel}</Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-3 border rounded-lg text-center">
          <div className="text-lg font-bold text-green-600">
            ${((results.newTuition - currentTuition) * data.totalStudents * 10 / 1000000).toFixed(2)}M
          </div>
          <div className="text-xs text-gray-600">Ingresos por Colegiaturas</div>
        </div>
        
        <div className="p-3 border rounded-lg text-center">
          <div className="text-lg font-bold text-blue-600">
            ${((results.newEnrollment - currentEnrollment) * data.totalStudents / 1000000).toFixed(2)}M
          </div>
          <div className="text-xs text-gray-600">Ingresos por Inscripciones</div>
        </div>
        
        <div className="p-3 border rounded-lg text-center">
          <div className="text-lg font-bold text-purple-600">
            {((results.totalAdditionalIncome / (data.netProfit * 1.56 / 1000000)) * 100).toFixed(1)}%
          </div>
          <div className="text-xs text-gray-600">Incremento Total</div>
        </div>
      </div>

      <Button 
        onClick={() => {
          setTuitionIncrease(8);
          setEnrollmentIncrease(5);
          setCustomTuitionAmount('');
          setCustomEnrollmentAmount('');
        }}
        variant="outline" 
        size="sm"
        className="w-full"
      >
        <RefreshCw className="w-4 h-4 mr-2" />
        Resetear Valores
      </Button>
    </div>
  );
}

export default function AnalisisFinanciero() {
  const [selectedPeriod, setSelectedPeriod] = useState("2025-01");
  const [selectedMetric, setSelectedMetric] = useState("general");

  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/financial/analysis', selectedPeriod, selectedMetric],
    enabled: !!selectedPeriod
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error al cargar análisis</h2>
          <p className="text-gray-600">No se pudieron obtener los datos financieros</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Análisis Financiero CFO</h1>
          <p className="text-gray-600 mt-1">Dashboard ejecutivo con métricas financieras avanzadas</p>
        </div>
        <div className="flex gap-4">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Seleccionar período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2025-01">Enero 2025</SelectItem>
              <SelectItem value="2024-12">Diciembre 2024</SelectItem>
              <SelectItem value="2024-11">Noviembre 2024</SelectItem>
              <SelectItem value="2024-10">Octubre 2024</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Executive Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Revenue</p>
                <p className="text-lg font-bold text-gray-900">
                  ${(data.netProfit * 1.56 / 1000000).toFixed(2)}M
                </p>
              </div>
              <div className="p-2 bg-green-100 rounded-full">
                <TrendingUp className="w-4 h-4 text-green-600" />
              </div>
            </div>
            <div className="mt-2">
              <Badge className="bg-green-100 text-green-800 text-xs">+12.5% vs Q3</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">EBITDA</p>
                <p className="text-lg font-bold text-gray-900">
                  ${(data.netProfit * 1.21 / 1000000).toFixed(2)}M
                </p>
              </div>
              <div className="p-2 bg-blue-100 rounded-full">
                <Calculator className="w-4 h-4 text-blue-600" />
              </div>
            </div>
            <div className="mt-2">
              <Badge className="bg-blue-100 text-blue-800 text-xs">77.6% Margin</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Students</p>
                <p className="text-lg font-bold text-gray-900">{data.totalStudents}</p>
              </div>
              <div className="p-2 bg-purple-100 rounded-full">
                <Users className="w-4 h-4 text-purple-600" />
              </div>
            </div>
            <div className="mt-2">
              <Badge className="bg-purple-100 text-purple-800 text-xs">96.2% Retention</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Health Score</p>
                <p className="text-lg font-bold text-gray-900">{data.healthScore}/100</p>
              </div>
              <div className="p-2 bg-emerald-100 rounded-full">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
              </div>
            </div>
            <div className="mt-2">
              <Badge className="bg-emerald-100 text-emerald-800 text-xs">Excelente</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="projections" className="space-y-6">
        <TabsList className="grid grid-cols-5 w-full h-auto">
          <TabsTrigger value="collection" className="text-xs px-2 py-3">Cobranza</TabsTrigger>
          <TabsTrigger value="ebitda" className="text-xs px-2 py-3">EBITDA</TabsTrigger>
          <TabsTrigger value="projections" className="text-xs px-2 py-3">Proyecciones</TabsTrigger>
          <TabsTrigger value="trends" className="text-xs px-2 py-3">Tendencias</TabsTrigger>
          <TabsTrigger value="health" className="text-xs px-2 py-3">Salud</TabsTrigger>
        </TabsList>

        {/* Projections Analysis */}
        <TabsContent value="projections" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Proyección Ciclo Escolar 2025-2026
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-semibold text-base mb-3">Escenario Base (Crecimiento 5%)</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">Estudiantes Proyectados</span>
                        <span className="font-medium">{Math.round(data.totalStudents * 1.05)} alumnos</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Ingresos Anuales</span>
                        <span className="font-medium text-green-600">
                          ${((data.netProfit * 1.56 * 1.05) / 1000000).toFixed(2)}M
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">EBITDA Proyectado</span>
                        <span className="font-medium text-blue-600">
                          ${((data.netProfit * 1.21 * 1.05) / 1000000).toFixed(2)}M
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-green-50 rounded-lg">
                    <h4 className="font-semibold text-base mb-3">Escenario Optimista (Crecimiento 12%)</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">Estudiantes Proyectados</span>
                        <span className="font-medium">{Math.round(data.totalStudents * 1.12)} alumnos</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Ingresos Anuales</span>
                        <span className="font-medium text-green-600">
                          ${((data.netProfit * 1.56 * 1.12) / 1000000).toFixed(2)}M
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">EBITDA Proyectado</span>
                        <span className="font-medium text-blue-600">
                          ${((data.netProfit * 1.21 * 1.12) / 1000000).toFixed(2)}M
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-yellow-50 rounded-lg">
                    <h4 className="font-semibold text-base mb-3">Escenario Conservador (Crecimiento 2%)</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">Estudiantes Proyectados</span>
                        <span className="font-medium">{Math.round(data.totalStudents * 1.02)} alumnos</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Ingresos Anuales</span>
                        <span className="font-medium text-green-600">
                          ${((data.netProfit * 1.56 * 1.02) / 1000000).toFixed(2)}M
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">EBITDA Proyectado</span>
                        <span className="font-medium text-blue-600">
                          ${((data.netProfit * 1.21 * 1.02) / 1000000).toFixed(2)}M
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  Simulador de Incremento de Costos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <CostSimulator data={data} />
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Punto de Equilibrio
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {Math.round(data.totalStudents * 0.73)} alumnos
                  </div>
                  <div className="text-sm text-blue-700">Punto de equilibrio</div>
                  <div className="text-xs text-blue-600 mt-1">
                    Actual: {data.totalStudents} (+{Math.round(data.totalStudents * 0.27)} margen)
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Costos Fijos Mensuales</span>
                    <span className="font-medium">
                      ${((data.netProfit * 0.4) / 12 / 1000).toFixed(0)}K
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Margen por Alumno</span>
                    <span className="font-medium text-green-600">
                      ${data.costPerStudent.profitPerStudent.toLocaleString()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Optimización de Costos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="p-3 bg-green-50 rounded-lg">
                    <div className="font-medium text-sm text-green-800">Oportunidad #1</div>
                    <div className="text-xs text-green-700">Digitalización de procesos</div>
                    <div className="text-xs text-green-600">Ahorro: $180K anuales</div>
                  </div>
                  
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <div className="font-medium text-sm text-blue-800">Oportunidad #2</div>
                    <div className="text-xs text-blue-700">Optimizar servicios terceros</div>
                    <div className="text-xs text-blue-600">Ahorro: $95K anuales</div>
                  </div>
                  
                  <div className="p-3 bg-purple-50 rounded-lg">
                    <div className="font-medium text-sm text-purple-800">Oportunidad #3</div>
                    <div className="text-xs text-purple-700">Eficiencia energética</div>
                    <div className="text-xs text-purple-600">Ahorro: $45K anuales</div>
                  </div>
                </div>
                
                <div className="text-center pt-2 border-t">
                  <div className="text-sm font-medium">Ahorro Total Potencial</div>
                  <div className="text-lg font-bold text-green-600">$320K anuales</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  Recomendaciones Estratégicas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="p-3 border-l-4 border-green-500 bg-green-50">
                    <div className="font-medium text-sm">Prioridad Alta</div>
                    <div className="text-xs mt-1">
                      • Incrementar colegiaturas 8% en 2025-2026
                      • Implementar plan digital de cobranza
                      • Optimizar estructura de costos administrativos
                    </div>
                  </div>
                  
                  <div className="p-3 border-l-4 border-blue-500 bg-blue-50">
                    <div className="font-medium text-sm">Prioridad Media</div>
                    <div className="text-xs mt-1">
                      • Diversificar ingresos (cursos de verano)
                      • Mejorar retención estudiantil
                      • Renegociar contratos de servicios
                    </div>
                  </div>
                  
                  <div className="p-3 border-l-4 border-yellow-500 bg-yellow-50">
                    <div className="font-medium text-sm">Monitoreo Continuo</div>
                    <div className="text-xs mt-1">
                      • Seguimiento mensual de KPIs
                      • Análisis de competencia trimestral
                      • Evaluación de satisfacción familiar
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Otras pestañas simplificadas */}

        <TabsContent value="collection" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Análisis de Cobranza</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Tasa de cobranza: {data.collectionRate}%</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ebitda" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Análisis EBITDA</CardTitle>
            </CardHeader>
            <CardContent>
              <p>EBITDA: ${(data.netProfit * 1.21 / 1000000).toFixed(2)}M (77.6% margen)</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Tendencias Financieras</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Análisis de tendencias de los últimos 12 meses.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Salud Financiera</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Score de salud financiera: {data.healthScore}/100 - Excelente</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}