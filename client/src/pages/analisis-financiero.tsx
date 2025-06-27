import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  Target,
  Calendar,
  FileText,
  Download,
  AlertCircle
} from "lucide-react";

export default function AnalisisFinanciero() {
  const [selectedPeriod, setSelectedPeriod] = useState("2025-01");
  const [selectedMetric, setSelectedMetric] = useState("general");

  // Fetch financial data
  const { data: financialData, isLoading } = useQuery({
    queryKey: ['/api/financial/analysis', selectedPeriod],
    enabled: !!selectedPeriod
  });

  // Comprehensive financial data structure
  const mockFinancialData = {
    period: "Enero 2025",
    totalStudents: 485,
    activeStudents: 472,
    totalRevenue: 2847320,
    totalCosts: 1820580,
    netProfit: 1026740,
    
    // Cost per student analysis
    costPerStudent: {
      directCosts: 2850, // Costos directos por alumno
      indirectCosts: 1450, // Costos indirectos por alumno
      totalCost: 4300,
      revenuePerStudent: 6035,
      profitPerStudent: 1735,
      profitMarginPerStudent: 28.8
    },
    
    // Revenue breakdown
    revenueBreakdown: {
      tuition: 2380000, // Colegiaturas
      enrollment: 285000, // Inscripciones
      extras: 125000, // Servicios extras
      lateFeesCollected: 57320 // Recargos por mora cobrados
    },
    
    // Cost structure
    costStructure: {
      personnel: 1285000, // Nómina (70.6% de costos)
      facilities: 285000, // Instalaciones (15.7%)
      materials: 125000, // Materiales educativos (6.9%)
      technology: 85000, // Tecnología y software (4.7%)
      administration: 40580 // Administración (2.2%)
    },
    
    // Collection metrics
    collectionMetrics: {
      collectionRate: 92.5, // Tasa de cobro
      averageDaysToCollect: 8.5,
      overdueAmount: 213450,
      writeOffs: 15000, // Deudas canceladas
      lateFeesGenerated: 89250,
      lateFeesCollected: 57320
    },
    
    // Financial health indicators
    healthIndicators: {
      liquidityRatio: 2.35, // Razón de liquidez
      profitMargin: 36.1, // Margen de utilidad
      studentRetentionRate: 94.2,
      revenueGrowthRate: 8.7, // Crecimiento vs año anterior
      costEfficiencyScore: 78.5, // Score de eficiencia de costos
      cashFlowScore: 85.2
    },
    
    // Monthly trends (últimos 6 meses)
    monthlyTrends: [
      { month: "Ago 2024", revenue: 2650000, costs: 1750000, students: 468, profitMargin: 34.0 },
      { month: "Sep 2024", revenue: 2720000, costs: 1780000, students: 472, profitMargin: 34.6 },
      { month: "Oct 2024", revenue: 2785000, costs: 1795000, students: 478, profitMargin: 35.5 },
      { month: "Nov 2024", revenue: 2820000, costs: 1810000, students: 481, profitMargin: 35.8 },
      { month: "Dic 2024", revenue: 2890000, costs: 1825000, students: 483, profitMargin: 36.8 },
      { month: "Ene 2025", revenue: 2847320, costs: 1820580, students: 485, profitMargin: 36.1 }
    ],
    
    // Risk assessment
    riskAssessment: {
      overallRisk: "BAJO", // BAJO, MEDIO, ALTO
      riskFactors: [
        { factor: "Concentración de ingresos", level: "BAJO", impact: "El 95% de ingresos proviene de colegiaturas regulares" },
        { factor: "Estacionalidad", level: "MEDIO", impact: "Variación del 15% entre meses de mayor y menor ingreso" },
        { factor: "Morosidad", level: "BAJO", impact: "Tasa de morosidad del 7.5% está dentro de parámetros normales" },
        { factor: "Costos fijos", level: "MEDIO", impact: "70% de costos son fijos (principalmente nómina)" }
      ]
    },
    
    // Benchmarking vs industry
    industryBenchmark: {
      profitMarginIndustry: 25.0, // Promedio industria educativa
      costPerStudentIndustry: 4800,
      collectionRateIndustry: 88.0,
      studentRetentionIndustry: 91.0
    }
  };

  const data: any = financialData || mockFinancialData;

  const getHealthStatus = (score: number) => {
    if (score >= 80) return { status: "Excelente", color: "bg-green-500", textColor: "text-green-700" };
    if (score >= 60) return { status: "Bueno", color: "bg-blue-500", textColor: "text-blue-700" };
    if (score >= 40) return { status: "Regular", color: "bg-yellow-500", textColor: "text-yellow-700" };
    return { status: "Crítico", color: "bg-red-500", textColor: "text-red-700" };
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case "BAJO": return "bg-green-100 text-green-800";
      case "MEDIO": return "bg-yellow-100 text-yellow-800";
      case "ALTO": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Análisis Financiero CFO</h1>
          <p className="text-slate-600">Dashboard ejecutivo con análisis financiero profundo y evaluación de salud financiera</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2025-01">Enero 2025</SelectItem>
              <SelectItem value="2024-12">Diciembre 2024</SelectItem>
              <SelectItem value="2024-11">Noviembre 2024</SelectItem>
              <SelectItem value="2024-10">Octubre 2024</SelectItem>
            </SelectContent>
          </Select>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Download className="w-4 h-4 mr-2" />
            Exportar Reporte
          </Button>
        </div>
      </div>

      {/* Executive Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Utilidad Neta</p>
                <p className="text-3xl font-bold text-green-600">
                  ${(data.netProfit / 1000000).toFixed(2)}M
                </p>
                <p className="text-sm text-slate-500">
                  Margen: {data.healthIndicators.profitMargin}%
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Costo por Alumno</p>
                <p className="text-3xl font-bold text-blue-600">
                  ${data.costPerStudent.totalCost.toLocaleString()}
                </p>
                <p className="text-sm text-slate-500">
                  Utilidad: ${data.costPerStudent.profitPerStudent.toLocaleString()}
                </p>
              </div>
              <Calculator className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Tasa de Cobro</p>
                <p className="text-3xl font-bold text-purple-600">
                  {data.collectionMetrics.collectionRate}%
                </p>
                <p className="text-sm text-slate-500">
                  {data.collectionMetrics.averageDaysToCollect} días promedio
                </p>
              </div>
              <Target className="w-8 h-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Salud Financiera</p>
                <p className="text-3xl font-bold text-orange-600">
                  {data.healthIndicators.cashFlowScore}/100
                </p>
                <Badge className={getHealthStatus(data.healthIndicators.cashFlowScore).color + " text-white"}>
                  {getHealthStatus(data.healthIndicators.cashFlowScore).status}
                </Badge>
              </div>
              <CheckCircle className="w-8 h-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="profitability" className="space-y-6">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="profitability">Rentabilidad</TabsTrigger>
          <TabsTrigger value="costs">Estructura de Costos</TabsTrigger>
          <TabsTrigger value="collection">Cobranza</TabsTrigger>
          <TabsTrigger value="trends">Tendencias</TabsTrigger>
          <TabsTrigger value="health">Salud Financiera</TabsTrigger>
        </TabsList>

        {/* Profitability Analysis */}
        <TabsContent value="profitability" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="w-5 h-5" />
                  Análisis de Rentabilidad por Alumno
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Ingreso por Alumno</span>
                    <span className="font-bold text-green-600">
                      ${data.costPerStudent.revenuePerStudent.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Costo Directo</span>
                    <span className="text-red-600">
                      -${data.costPerStudent.directCosts.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Costo Indirecto</span>
                    <span className="text-red-600">
                      -${data.costPerStudent.indirectCosts.toLocaleString()}
                    </span>
                  </div>
                  <hr />
                  <div className="flex justify-between items-center text-lg font-bold">
                    <span>Utilidad por Alumno</span>
                    <span className="text-green-600">
                      ${data.costPerStudent.profitPerStudent.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Margen de Utilidad</span>
                    <Badge className="bg-green-100 text-green-800">
                      {data.costPerStudent.profitMarginPerStudent}%
                    </Badge>
                  </div>
                </div>
                
                <div className="mt-6">
                  <h4 className="text-sm font-semibold mb-3">Comparación vs Industria</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Margen Empresa</span>
                      <span className="font-medium">{data.costPerStudent.profitMarginPerStudent}%</span>
                    </div>
                    <Progress value={data.costPerStudent.profitMarginPerStudent} className="h-2" />
                    <div className="flex justify-between text-sm text-slate-500">
                      <span>Promedio Industria: {data.industryBenchmark.profitMarginIndustry}%</span>
                      <span className="text-green-600">
                        +{(data.costPerStudent.profitMarginPerStudent - data.industryBenchmark.profitMarginIndustry).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Desglose de Ingresos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(data.revenueBreakdown).map(([key, value]) => {
                    const percentage = ((value as number) / data.totalRevenue * 100);
                    const labels = {
                      tuition: "Colegiaturas",
                      enrollment: "Inscripciones", 
                      extras: "Servicios Extras",
                      lateFeesCollected: "Recargos Cobrados"
                    };
                    
                    return (
                      <div key={key} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">
                            {labels[key as keyof typeof labels]}
                          </span>
                          <div className="text-right">
                            <div className="font-semibold">
                              ${((value as number) / 1000000).toFixed(2)}M
                            </div>
                            <div className="text-xs text-slate-500">
                              {percentage.toFixed(1)}%
                            </div>
                          </div>
                        </div>
                        <Progress value={percentage} className="h-2" />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Cost Structure */}
        <TabsContent value="costs" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="w-5 h-5" />
                Estructura de Costos Detallada
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h4 className="font-semibold">Distribución de Costos</h4>
                  {Object.entries(data.costStructure).map(([key, value]) => {
                    const percentage = ((value as number) / data.totalCosts * 100);
                    const labels = {
                      personnel: "Nómina",
                      facilities: "Instalaciones",
                      materials: "Material Educativo",
                      technology: "Tecnología",
                      administration: "Administración"
                    };
                    
                    return (
                      <div key={key} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">
                            {labels[key as keyof typeof labels]}
                          </span>
                          <div className="text-right">
                            <div className="font-semibold">
                              ${((value as number) / 1000).toFixed(0)}K
                            </div>
                            <div className="text-xs text-slate-500">
                              {percentage.toFixed(1)}%
                            </div>
                          </div>
                        </div>
                        <Progress value={percentage} className="h-2" />
                      </div>
                    );
                  })}
                </div>
                
                <div className="space-y-4">
                  <h4 className="font-semibold">Análisis de Eficiencia</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                      <div>
                        <div className="font-medium text-green-800">Costo por Alumno</div>
                        <div className="text-sm text-green-600">vs Industria</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-green-800">
                          ${data.costPerStudent.totalCost.toLocaleString()}
                        </div>
                        <div className="text-sm text-green-600">
                          -${(data.industryBenchmark.costPerStudentIndustry - data.costPerStudent.totalCost).toLocaleString()} mejor
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Score de Eficiencia</span>
                        <span className="font-medium">{data.healthIndicators.costEfficiencyScore}/100</span>
                      </div>
                      <Progress value={data.healthIndicators.costEfficiencyScore} className="h-2" />
                    </div>
                    
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                      <div className="text-sm font-medium text-blue-800 mb-2">Recomendaciones CFO</div>
                      <ul className="text-xs text-blue-700 space-y-1">
                        <li>• Nómina representa el 70.6% - dentro del rango óptimo</li>
                        <li>• Considerar digitalización para reducir costos administrativos</li>
                        <li>• Excelente control en materiales educativos</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Collection Analysis */}
        <TabsContent value="collection" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Métricas de Cobranza
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {data.collectionMetrics.collectionRate}%
                    </div>
                    <div className="text-sm text-green-700">Tasa de Cobro</div>
                    <div className="text-xs text-green-600 mt-1">
                      +{(data.collectionMetrics.collectionRate - data.industryBenchmark.collectionRateIndustry).toFixed(1)}% vs industria
                    </div>
                  </div>
                  
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">
                      {data.collectionMetrics.averageDaysToCollect}
                    </div>
                    <div className="text-sm text-blue-700">Días Promedio</div>
                    <div className="text-xs text-blue-600 mt-1">Para cobro</div>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Cartera Vencida</span>
                    <span className="font-semibold text-red-600">
                      ${(data.collectionMetrics.overdueAmount / 1000).toFixed(0)}K
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Recargos Generados</span>
                    <span className="font-semibold text-orange-600">
                      ${(data.collectionMetrics.lateFeesGenerated / 1000).toFixed(0)}K
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Recargos Cobrados</span>
                    <span className="font-semibold text-green-600">
                      ${(data.collectionMetrics.lateFeesCollected / 1000).toFixed(0)}K
                    </span>
                  </div>
                  
                  <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
                    <div className="text-sm font-medium text-yellow-800">Eficiencia de Recargos</div>
                    <div className="text-lg font-bold text-yellow-900">
                      {((data.collectionMetrics.lateFeesCollected / data.collectionMetrics.lateFeesGenerated) * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-yellow-700">
                      ${((data.collectionMetrics.lateFeesGenerated - data.collectionMetrics.lateFeesCollected) / 1000).toFixed(0)}K pendientes por cobrar
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Análisis de Riesgo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-medium">Riesgo General</span>
                    <Badge className={getRiskColor(data.riskAssessment.overallRisk)}>
                      {data.riskAssessment.overallRisk}
                    </Badge>
                  </div>
                  
                  <div className="space-y-3">
                    {data.riskAssessment.riskFactors.map((factor, index) => (
                      <div key={index} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">{factor.factor}</span>
                          <Badge className={getRiskColor(factor.level)} size="sm">
                            {factor.level}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-600">{factor.impact}</p>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-4 p-3 bg-green-50 rounded-lg">
                    <div className="text-sm font-medium text-green-800 mb-2">Fortalezas Financieras</div>
                    <ul className="text-xs text-green-700 space-y-1">
                      <li>• Tasa de cobro superior al promedio de la industria</li>
                      <li>• Margen de utilidad saludable del 36.1%</li>
                      <li>• Buena retención de estudiantes (94.2%)</li>
                      <li>• Crecimiento sostenible del 8.7% anual</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Trends Analysis */}
        <TabsContent value="trends" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Tendencias Financieras (6 meses)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold mb-4">Evolución de Márgenes</h4>
                    <div className="space-y-3">
                      {data.monthlyTrends.map((month, index) => (
                        <div key={index} className="flex items-center justify-between">
                          <span className="text-sm font-medium w-20">{month.month}</span>
                          <div className="flex-1 mx-4">
                            <Progress value={month.profitMargin} className="h-2" />
                          </div>
                          <span className="text-sm font-semibold w-12">
                            {month.profitMargin}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-4">Crecimiento Mensual</h4>
                    <div className="space-y-3">
                      {data.monthlyTrends.map((month, index) => {
                        const prevMonth = index > 0 ? data.monthlyTrends[index - 1] : null;
                        const growth = prevMonth 
                          ? ((month.revenue - prevMonth.revenue) / prevMonth.revenue * 100)
                          : 0;
                        
                        return (
                          <div key={index} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50">
                            <span className="text-sm font-medium">{month.month}</span>
                            <div className="text-right">
                              <div className="text-sm font-semibold">
                                ${(month.revenue / 1000000).toFixed(2)}M
                              </div>
                              {index > 0 && (
                                <div className={`text-xs ${growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {growth >= 0 ? '+' : ''}{growth.toFixed(1)}%
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-semibold text-blue-800 mb-2">Análisis de Tendencias CFO</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="font-medium text-blue-700">Crecimiento</div>
                      <div className="text-blue-600">+8.7% anual sostenido</div>
                    </div>
                    <div>
                      <div className="font-medium text-blue-700">Estabilidad</div>
                      <div className="text-blue-600">Márgenes consistentes 34-36%</div>
                    </div>
                    <div>
                      <div className="font-medium text-blue-700">Proyección</div>
                      <div className="text-blue-600">Tendencia alcista confirmada</div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Financial Health */}
        <TabsContent value="health" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  Indicadores de Salud Financiera
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(data.healthIndicators).map(([key, value]) => {
                  const labels = {
                    liquidityRatio: "Razón de Liquidez",
                    profitMargin: "Margen de Utilidad",
                    studentRetentionRate: "Retención de Estudiantes",
                    revenueGrowthRate: "Crecimiento de Ingresos",
                    costEfficiencyScore: "Eficiencia de Costos",
                    cashFlowScore: "Flujo de Efectivo"
                  };
                  
                  const benchmarks = {
                    liquidityRatio: 2.0,
                    profitMargin: 25.0,
                    studentRetentionRate: 90.0,
                    revenueGrowthRate: 5.0,
                    costEfficiencyScore: 70.0,
                    cashFlowScore: 75.0
                  };
                  
                  const benchmark = benchmarks[key as keyof typeof benchmarks];
                  const score = typeof value === 'number' ? value : 0;
                  const status = score >= benchmark ? 'good' : 'attention';
                  
                  return (
                    <div key={key} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">
                          {labels[key as keyof typeof labels]}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">
                            {typeof value === 'number' && key.includes('Rate') || key.includes('Margin') || key.includes('Score') 
                              ? `${value.toFixed(1)}${key === 'liquidityRatio' ? 'x' : '%'}`
                              : value
                            }
                          </span>
                          {status === 'good' ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-yellow-500" />
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>Benchmark: {benchmark}{key === 'liquidityRatio' ? 'x' : '%'}</span>
                        <span className={score >= benchmark ? 'text-green-600' : 'text-yellow-600'}>
                          ({score >= benchmark ? '+' : ''}{(score - benchmark).toFixed(1)})
                        </span>
                      </div>
                      <Progress 
                        value={Math.min((score / benchmark) * 100, 100)} 
                        className="h-2"
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Dictamen CFO
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <span className="font-semibold text-green-800">FINANZAS SALUDABLES</span>
                    </div>
                    <p className="text-sm text-green-700">
                      La institución presenta indicadores financieros sólidos con un margen de utilidad del 36.1%, 
                      superior al promedio de la industria. La gestión de costos es eficiente y la tasa de cobro excepcional.
                    </p>
                  </div>
                  
                  <div className="space-y-3">
                    <h4 className="font-semibold">Fortalezas Identificadas</h4>
                    <ul className="text-sm space-y-1 text-slate-700">
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        Margen de utilidad 11.1% superior a la industria
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        Costo por alumno optimizado ($500 menor al benchmark)
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        Excelente tasa de cobro (92.5% vs 88% industria)
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        Alta retención estudiantil (94.2%)
                      </li>
                    </ul>
                  </div>
                  
                  <div className="space-y-3">
                    <h4 className="font-semibold">Recomendaciones Estratégicas</h4>
                    <ul className="text-sm space-y-1 text-slate-700">
                      <li className="flex items-start gap-2">
                        <Target className="w-4 h-4 text-blue-500 mt-0.5" />
                        <span>Mantener disciplina en control de costos, especialmente nómina</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Target className="w-4 h-4 text-blue-500 mt-0.5" />
                        <span>Acelerar cobranza de recargos pendientes ($32K oportunidad)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Target className="w-4 h-4 text-blue-500 mt-0.5" />
                        <span>Considerar reinversión en tecnología para eficiencias adicionales</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}