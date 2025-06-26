import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { 
  Brain, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  DollarSign, 
  Clock, 
  Shield, 
  Zap,
  Database,
  Receipt,
  FileCheck,
  AlertCircle,
  Settings,
  BarChart3,
  Calendar,
  Users,
  CreditCard,
  RefreshCw
} from "lucide-react";

export default function SistemasAvanzados() {
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [isGeneratingCFDI, setIsGeneratingCFDI] = useState(false);

  // Datos demo del motor predictivo
  const [riskAnalysis, setRiskAnalysis] = useState({
    familias_analizadas: 1247,
    distribucion_riesgo: {
      bajo: 856,
      medio: 243,
      alto: 102,
      critico: 46
    },
    alertas_generadas: 148,
    predicciones: [
      {
        familia_id: 1,
        nombre: "Familia Mendoza Vázquez",
        riesgo: "CRÍTICO",
        probabilidad: 0.87,
        factores: ["Historial de pagos irregular", "Condiciones económicas adversas"],
        acciones: ["Contacto inmediato", "Plan de pagos personalizado"]
      },
      {
        familia_id: 2,
        nombre: "Familia García Luna",
        riesgo: "ALTO",
        probabilidad: 0.64,
        factores: ["Baja interacción con plataforma", "Época estacionalmente riesgosa"],
        acciones: ["Recordatorio personalizado", "Llamada de seguimiento"]
      },
      {
        familia_id: 3,
        nombre: "Familia Torres Silva",
        riesgo: "MEDIO",
        probabilidad: 0.34,
        factores: ["Indicadores socioeconómicos desfavorables"],
        acciones: ["Recordatorio proactivo", "Monitoreo frecuente"]
      }
    ]
  });

  // Datos demo de conciliación bancaria
  const [reconciliationResults, setReconciliationResults] = useState({
    transacciones_procesadas: 342,
    matches_automaticos: 318,
    revision_manual: 16,
    sin_coincidencia: 8,
    monto_conciliado: 4567890,
    tiempo_procesamiento: 1247,
    anomalias: [
      {
        tipo: "PAGO_DUPLICADO",
        descripcion: "Posible pago duplicado: $4,500 MXN de Roberto García",
        severidad: "ALTO",
        transacciones: ["TXN-001234", "TXN-001235"]
      },
      {
        tipo: "MONTO_INUSUAL", 
        descripcion: "Monto inusual: $15,000 MXN (4.2 desviaciones estándar)",
        severidad: "MEDIO",
        transacciones: ["TXN-001789"]
      }
    ]
  });

  // Datos demo de facturación fiscal
  const [cfdiResults, setCfdiResults] = useState({
    cfdi_generados: 89,
    tasa_exito: 99.2,
    validaciones_automaticas: 156,
    correcciones_aplicadas: 23,
    tiempo_promedio_timbrado: 2.4,
    ejemplos: [
      {
        concepto: "Colegiatura Enero 2025 - Carlos Pérez",
        clave_producto: "80101500",
        confianza: 0.95,
        validaciones: ["RFC válido", "Estructura correcta", "Totales cuadrados"]
      },
      {
        concepto: "Seguro Escolar - Ana García",
        clave_producto: "52121600", 
        confianza: 0.89,
        validaciones: ["IVA aplicado automáticamente", "Uso CFDI corregido"]
      }
    ]
  });

  const runRiskAnalysis = async () => {
    setIsAnalyzing(true);
    
    // Simular análisis de machine learning
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Actualizar resultados con nueva data
    setRiskAnalysis(prev => ({
      ...prev,
      familias_analizadas: prev.familias_analizadas + 12,
      alertas_generadas: prev.alertas_generadas + 8,
      distribucion_riesgo: {
        ...prev.distribucion_riesgo,
        critico: prev.distribucion_riesgo.critico + 3,
        alto: prev.distribucion_riesgo.alto - 2
      }
    }));
    
    setIsAnalyzing(false);
    
    toast({
      title: "Análisis Predictivo Completado",
      description: `${riskAnalysis.familias_analizadas} familias analizadas. ${riskAnalysis.alertas_generadas} alertas generadas.`,
      duration: 4000,
    });
  };

  const runReconciliation = async () => {
    setIsReconciling(true);
    
    // Simular conciliación en tiempo real
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    setReconciliationResults(prev => ({
      ...prev,
      transacciones_procesadas: prev.transacciones_procesadas + 45,
      matches_automaticos: prev.matches_automaticos + 42,
      revision_manual: prev.revision_manual + 2,
      sin_coincidencia: prev.sin_coincidencia + 1,
      monto_conciliado: prev.monto_conciliado + 567890
    }));
    
    setIsReconciling(false);
    
    toast({
      title: "Conciliación Automática Completada", 
      description: `${reconciliationResults.transacciones_procesadas} transacciones procesadas en ${reconciliationResults.tiempo_procesamiento}ms`,
      duration: 4000,
    });
  };

  const generateSmartCFDI = async () => {
    setIsGeneratingCFDI(true);
    
    // Simular generación inteligente de CFDI
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setCfdiResults(prev => ({
      ...prev,
      cfdi_generados: prev.cfdi_generados + 12,
      validaciones_automaticas: prev.validaciones_automaticas + 18,
      correcciones_aplicadas: prev.correcciones_aplicadas + 4
    }));
    
    setIsGeneratingCFDI(false);
    
    toast({
      title: "CFDIs Generados Inteligentemente",
      description: `${cfdiResults.cfdi_generados} CFDIs generados con ${cfdiResults.tasa_exito}% de éxito`,
      duration: 4000,
    });
  };

  const getRiskBadge = (riesgo: string) => {
    const variants = {
      'CRÍTICO': 'destructive',
      'ALTO': 'secondary', 
      'MEDIO': 'outline',
      'BAJO': 'default'
    };
    return <Badge variant={variants[riesgo as keyof typeof variants] as any}>{riesgo}</Badge>;
  };

  const getSeverityBadge = (severidad: string) => {
    const variants = {
      'ALTO': 'destructive',
      'MEDIO': 'secondary',
      'BAJO': 'outline'
    };
    return <Badge variant={variants[severidad as keyof typeof variants] as any}>{severidad}</Badge>;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">
          Sistemas Avanzados EscuelaPay
        </h1>
        <p className="text-slate-600 text-lg">
          Tecnología de vanguardia para automatización y predicción en pagos educativos
        </p>
      </div>

      <Tabs defaultValue="predictive" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto">
          <TabsTrigger value="predictive" className="flex items-center gap-2">
            <Brain className="w-4 h-4" />
            Motor Predictivo
          </TabsTrigger>
          <TabsTrigger value="reconciliation" className="flex items-center gap-2">
            <Database className="w-4 h-4" />
            Conciliación Automática
          </TabsTrigger>
          <TabsTrigger value="fiscal" className="flex items-center gap-2">
            <Receipt className="w-4 h-4" />
            Facturación Inteligente
          </TabsTrigger>
        </TabsList>

        {/* MOTOR PREDICTIVO */}
        <TabsContent value="predictive" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Panel de Control */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Control de Análisis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button 
                  onClick={runRiskAnalysis}
                  disabled={isAnalyzing}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                >
                  {isAnalyzing ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Analizando...
                    </>
                  ) : (
                    <>
                      <Brain className="w-4 h-4 mr-2" />
                      Ejecutar Análisis ML
                    </>
                  )}
                </Button>
                
                {isAnalyzing && (
                  <div className="space-y-2">
                    <div className="text-sm text-slate-600">Procesando familias...</div>
                    <Progress value={75} className="h-2" />
                  </div>
                )}

                <div className="space-y-3 pt-4">
                  <div className="flex justify-between text-sm">
                    <span>Familias Analizadas</span>
                    <span className="font-semibold">{riskAnalysis.familias_analizadas}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Alertas Activas</span>
                    <span className="font-semibold text-red-600">{riskAnalysis.alertas_generadas}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Precisión del Modelo</span>
                    <span className="font-semibold text-green-600">94.2%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Distribución de Riesgo */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Distribución de Riesgo en Tiempo Real
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="text-2xl font-bold text-green-700">{riskAnalysis.distribucion_riesgo.bajo}</div>
                    <div className="text-sm text-green-600">Riesgo Bajo</div>
                    <div className="text-xs text-slate-500 mt-1">68.7%</div>
                  </div>
                  <div className="text-center p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <div className="text-2xl font-bold text-yellow-700">{riskAnalysis.distribucion_riesgo.medio}</div>
                    <div className="text-sm text-yellow-600">Riesgo Medio</div>
                    <div className="text-xs text-slate-500 mt-1">19.5%</div>
                  </div>
                  <div className="text-center p-4 bg-orange-50 rounded-lg border border-orange-200">
                    <div className="text-2xl font-bold text-orange-700">{riskAnalysis.distribucion_riesgo.alto}</div>
                    <div className="text-sm text-orange-600">Riesgo Alto</div>
                    <div className="text-xs text-slate-500 mt-1">8.2%</div>
                  </div>
                  <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
                    <div className="text-2xl font-bold text-red-700">{riskAnalysis.distribucion_riesgo.critico}</div>
                    <div className="text-sm text-red-600">Riesgo Crítico</div>
                    <div className="text-xs text-slate-500 mt-1">3.7%</div>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="font-medium text-blue-900 mb-2">Insights del Modelo ML</h4>
                  <div className="text-sm text-blue-800 space-y-1">
                    <p>• Incremento del 15% en familias de riesgo alto en los últimos 7 días</p>
                    <p>• Zona norte presenta mayor concentración de riesgo crítico</p>
                    <p>• Familias con empleos informales muestran 23% más probabilidad de retraso</p>
                    <p>• Implementar descuentos por pronto pago podría reducir riesgo en 67 familias</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Predicciones Específicas */}
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Predicciones de Alto Riesgo - Acción Inmediata
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {riskAnalysis.predicciones.map((prediccion, index) => (
                    <div key={index} className="flex items-start justify-between p-4 border rounded-lg hover:bg-slate-50">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-medium">{prediccion.nombre}</h4>
                          {getRiskBadge(prediccion.riesgo)}
                          <div className="text-sm text-slate-600">
                            Probabilidad: {(prediccion.probabilidad * 100).toFixed(1)}%
                          </div>
                        </div>
                        <div className="text-sm text-slate-600 mb-2">
                          <strong>Factores de riesgo:</strong> {prediccion.factores.join(", ")}
                        </div>
                        <div className="text-sm text-green-700">
                          <strong>Acciones recomendadas:</strong> {prediccion.acciones.join(", ")}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            toast({
                              title: "Contacto Iniciado",
                              description: `Llamada programada para ${prediccion.nombre}`,
                            });
                          }}
                        >
                          <Calendar className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="sm"
                          onClick={() => {
                            toast({
                              title: "Plan de Pagos",
                              description: `Plan personalizado creado para ${prediccion.nombre}`,
                            });
                          }}
                        >
                          <CreditCard className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* CONCILIACIÓN BANCARIA */}
        <TabsContent value="reconciliation" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Panel de Control */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Conciliación SPEI
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button 
                  onClick={runReconciliation}
                  disabled={isReconciling}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {isReconciling ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Conciliando...
                    </>
                  ) : (
                    <>
                      <Database className="w-4 h-4 mr-2" />
                      Procesar Transacciones
                    </>
                  )}
                </Button>

                {isReconciling && (
                  <div className="space-y-2">
                    <div className="text-sm text-slate-600">Matching automático...</div>
                    <Progress value={60} className="h-2" />
                  </div>
                )}

                <div className="space-y-3 pt-4">
                  <div className="flex justify-between text-sm">
                    <span>Tasa de Match Automático</span>
                    <span className="font-semibold text-green-600">93.2%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Tiempo Promedio</span>
                    <span className="font-semibold">{reconciliationResults.tiempo_procesamiento}ms</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Precisión Fuzzy Match</span>
                    <span className="font-semibold text-blue-600">97.8%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Métricas de Conciliación */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  Resultados de Conciliación en Tiempo Real
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="text-2xl font-bold text-green-700">{reconciliationResults.matches_automaticos}</div>
                    <div className="text-sm text-green-600">Matches Automáticos</div>
                    <div className="text-xs text-slate-500 mt-1">93.0%</div>
                  </div>
                  <div className="text-center p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <div className="text-2xl font-bold text-yellow-700">{reconciliationResults.revision_manual}</div>
                    <div className="text-sm text-yellow-600">Revisión Manual</div>
                    <div className="text-xs text-slate-500 mt-1">4.7%</div>
                  </div>
                  <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
                    <div className="text-2xl font-bold text-red-700">{reconciliationResults.sin_coincidencia}</div>
                    <div className="text-sm text-red-600">Sin Coincidencia</div>
                    <div className="text-xs text-slate-500 mt-1">2.3%</div>
                  </div>
                  <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="text-2xl font-bold text-blue-700">${(reconciliationResults.monto_conciliado / 100).toLocaleString()}</div>
                    <div className="text-sm text-blue-600">Monto Conciliado</div>
                    <div className="text-xs text-slate-500 mt-1">MXN</div>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-green-50 rounded-lg border border-green-200">
                  <h4 className="font-medium text-green-900 mb-2">Eficiencia del Sistema</h4>
                  <div className="text-sm text-green-800 space-y-1">
                    <p>• 95% de automatización lograda en conciliación bancaria</p>
                    <p>• Tiempo de procesamiento reducido de 4 horas a 2 minutos</p>
                    <p>• Algoritmo de fuzzy matching con 97.8% de precisión</p>
                    <p>• Integración directa con SPEI para notificaciones en tiempo real</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Detección de Anomalías */}
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Detección Inteligente de Anomalías
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {reconciliationResults.anomalias.map((anomalia, index) => (
                    <div key={index} className="flex items-start justify-between p-4 border rounded-lg hover:bg-slate-50">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <AlertCircle className="w-5 h-5 text-orange-500" />
                          <h4 className="font-medium">{anomalia.tipo.replace('_', ' ')}</h4>
                          {getSeverityBadge(anomalia.severidad)}
                        </div>
                        <p className="text-sm text-slate-600 mb-2">{anomalia.descripcion}</p>
                        <div className="text-xs text-slate-500">
                          Transacciones afectadas: {anomalia.transacciones.join(", ")}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            toast({
                              title: "Anomalía Investigada",
                              description: `Revisión iniciada para ${anomalia.tipo}`,
                            });
                          }}
                        >
                          Investigar
                        </Button>
                        <Button 
                          size="sm"
                          onClick={() => {
                            toast({
                              title: "Anomalía Resuelta",
                              description: `${anomalia.tipo} marcada como resuelta`,
                            });
                          }}
                        >
                          Resolver
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* FACTURACIÓN FISCAL */}
        <TabsContent value="fiscal" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Panel de Control */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Motor CFDI 4.0
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button 
                  onClick={generateSmartCFDI}
                  disabled={isGeneratingCFDI}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {isGeneratingCFDI ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Generando...
                    </>
                  ) : (
                    <>
                      <Receipt className="w-4 h-4 mr-2" />
                      Generar CFDIs Smart
                    </>
                  )}
                </Button>

                {isGeneratingCFDI && (
                  <div className="space-y-2">
                    <div className="text-sm text-slate-600">Validando con SAT...</div>
                    <Progress value={80} className="h-2" />
                  </div>
                )}

                <div className="space-y-3 pt-4">
                  <div className="flex justify-between text-sm">
                    <span>Tasa de Éxito SAT</span>
                    <span className="font-semibold text-green-600">{cfdiResults.tasa_exito}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Tiempo Timbrado</span>
                    <span className="font-semibold">{cfdiResults.tiempo_promedio_timbrado}s</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Auto-correcciones</span>
                    <span className="font-semibold text-blue-600">{cfdiResults.correcciones_aplicadas}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Métricas de CFDI */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileCheck className="w-5 h-5" />
                  Inteligencia Fiscal Automática
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="text-2xl font-bold text-green-700">{cfdiResults.cfdi_generados}</div>
                    <div className="text-sm text-green-600">CFDIs Generados</div>
                    <div className="text-xs text-slate-500 mt-1">Hoy</div>
                  </div>
                  <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="text-2xl font-bold text-blue-700">{cfdiResults.validaciones_automaticas}</div>
                    <div className="text-sm text-blue-600">Validaciones Auto</div>
                    <div className="text-xs text-slate-500 mt-1">Tiempo real</div>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="text-2xl font-bold text-purple-700">{cfdiResults.tasa_exito}%</div>
                    <div className="text-sm text-purple-600">Éxito PAC</div>
                    <div className="text-xs text-slate-500 mt-1">Sin rechazos</div>
                  </div>
                  <div className="text-center p-4 bg-orange-50 rounded-lg border border-orange-200">
                    <div className="text-2xl font-bold text-orange-700">3</div>
                    <div className="text-sm text-orange-600">PACs Activos</div>
                    <div className="text-xs text-slate-500 mt-1">Failover</div>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="font-medium text-blue-900 mb-2">Automatización Inteligente</h4>
                  <div className="text-sm text-blue-800 space-y-1">
                    <p>• Auto-selección de claves SAT con 95% de precisión</p>
                    <p>• Validación RFC en tiempo real contra padrón SAT</p>
                    <p>• Corrección automática de estructura CFDI 4.0</p>
                    <p>• Failover automático entre 3 PACs certificados</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Ejemplos de CFDI Inteligente */}
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  CFDIs Generados Automáticamente
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {cfdiResults.ejemplos.map((ejemplo, index) => (
                    <div key={index} className="flex items-start justify-between p-4 border rounded-lg hover:bg-slate-50">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-medium">{ejemplo.concepto}</h4>
                          <Badge variant="outline">{ejemplo.clave_producto}</Badge>
                          <div className="text-sm text-slate-600">
                            Confianza: {(ejemplo.confianza * 100).toFixed(1)}%
                          </div>
                        </div>
                        <div className="text-sm text-slate-600">
                          <strong>Validaciones:</strong> {ejemplo.validaciones.join(" • ")}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            toast({
                              title: "CFDI Visualizado",
                              description: `Abriendo vista previa del CFDI`,
                            });
                          }}
                        >
                          Ver XML
                        </Button>
                        <Button 
                          size="sm"
                          onClick={() => {
                            toast({
                              title: "CFDI Enviado",
                              description: `Factura enviada por email automáticamente`,
                            });
                          }}
                        >
                          Enviar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 p-4 bg-green-50 rounded-lg border border-green-200">
                  <h4 className="font-medium text-green-900 mb-2">Cumplimiento SAT Garantizado</h4>
                  <div className="text-sm text-green-800 space-y-1">
                    <p>✓ Estructura CFDI 4.0 validada automáticamente</p>
                    <p>✓ Catálogos SAT actualizados en tiempo real</p>
                    <p>✓ Complementos educativos aplicados correctamente</p>
                    <p>✓ Timbrado con certificados vigentes</p>
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