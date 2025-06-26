import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery } from "@tanstack/react-query";
import { 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Download, 
  FileSpreadsheet,
  Users,
  Link,
  DollarSign,
  RefreshCw,
  Play
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ValidationResult {
  category: string;
  checks: ValidationCheck[];
  overallStatus: 'success' | 'warning' | 'error';
  summary: string;
}

interface ValidationCheck {
  name: string;
  status: 'pass' | 'warning' | 'fail';
  message: string;
  affectedRecords: number;
  details?: string[];
}

interface ValidationResponse {
  success: boolean;
  timestamp: string;
  results: ValidationResult[];
  summary: {
    totalCategories: number;
    categoriesWithErrors: number;
    categoriesWithWarnings: number;
    categoriesSuccess: number;
  };
}

export default function DataValidationReport() {
  const { toast } = useToast();

  // Fetch validation results from API
  const { data: validationData, isLoading, refetch, isFetching } = useQuery<ValidationResponse>({
    queryKey: ['/api/validation/run'],
    staleTime: 0, // Always fetch fresh data
    refetchOnMount: true
  });

  const runValidation = async () => {
    try {
      await refetch();
      toast({
        title: "Validación Ejecutada",
        description: "Análisis de datos completado exitosamente",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo ejecutar la validación",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            <span>Ejecutando validación de datos...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!validationData || !validationData.success) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <div className="text-muted-foreground">
              No hay datos de validación disponibles
            </div>
            <Button onClick={runValidation} disabled={isFetching}>
              {isFetching ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Ejecutar Validación
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const validationResults = validationData.results || [];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'fail':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-100 text-green-800">Sin Errores</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-100 text-yellow-800">Advertencias</Badge>;
      case 'error':
        return <Badge variant="destructive">Errores Críticos</Badge>;
      default:
        return <Badge variant="outline">Desconocido</Badge>;
    }
  };

  const getCategoryIcon = (category: string) => {
    if (category.includes("Estudiantes")) return <Users className="h-5 w-5" />;
    if (category.includes("Conceptos")) return <DollarSign className="h-5 w-5" />;
    if (category.includes("Becas")) return <FileSpreadsheet className="h-5 w-5" />;
    return <Link className="h-5 w-5" />;
  };

  const downloadValidationReport = () => {
    if (!validationData) return;
    
    const reportData = {
      timestamp: validationData.timestamp,
      summary: validationData.summary,
      details: validationResults
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `validacion_datos_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    toast({
      title: "Reporte Descargado",
      description: "Reporte de validación guardado exitosamente",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Reporte de Validación de Datos</span>
            <Button variant="outline" onClick={downloadValidationReport}>
              <Download className="h-4 w-4 mr-2" />
              Descargar Reporte
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-600">
                {validationData.summary.categoriesSuccess}
              </div>
              <div className="text-sm text-muted-foreground">Sin Errores</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600">
                {validationData.summary.categoriesWithWarnings}
              </div>
              <div className="text-sm text-muted-foreground">Con Advertencias</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">
                {validationData.summary.categoriesWithErrors}
              </div>
              <div className="text-sm text-muted-foreground">Con Errores</div>
            </div>
            <div>
              <Button onClick={runValidation} disabled={isFetching} size="sm">
                {isFetching ? (
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Re-ejecutar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Validation Results by Category */}
      <div className="space-y-4">
        {validationResults.map((result, index) => (
          <Card key={index}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getCategoryIcon(result.category)}
                  <div>
                    <CardTitle className="text-lg">{result.category}</CardTitle>
                    <p className="text-sm text-muted-foreground">{result.summary}</p>
                  </div>
                </div>
                {getStatusBadge(result.overallStatus)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {result.checks.map((check, checkIndex) => (
                  <div key={checkIndex} className="flex items-start gap-3 p-3 rounded-lg border">
                    {getStatusIcon(check.status)}
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-medium">{check.name}</h4>
                        {check.affectedRecords > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {check.affectedRecords} registros afectados
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{check.message}</p>
                      
                      {check.details && check.details.length > 0 && (
                        <div className="mt-2">
                          <Alert className={check.status === 'fail' ? 'border-red-200 bg-red-50' : 'border-yellow-200 bg-yellow-50'}>
                            <AlertDescription>
                              <div className="space-y-1">
                                {check.details.map((detail, detailIndex) => (
                                  <div key={detailIndex} className="text-xs font-mono">
                                    {detail}
                                  </div>
                                ))}
                              </div>
                            </AlertDescription>
                          </Alert>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Action Items */}
      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
        <CardHeader>
          <CardTitle className="text-blue-900 dark:text-blue-100">
            Acciones Recomendadas
          </CardTitle>
        </CardHeader>
        <CardContent className="text-blue-800 dark:text-blue-200 space-y-3">
          <div className="flex items-start gap-2">
            <span className="font-bold">1.</span>
            <span>Corregir las 3 becas asignadas a estudiantes inexistentes antes de continuar</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold">2.</span>
            <span>Revisar y definir un único responsable de pago por estudiante en el archivo de relaciones</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold">3.</span>
            <span>Verificar que todos los CURPs en relaciones coincidan exactamente con el archivo de estudiantes</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold">4.</span>
            <span>Validar que todos los emails en relaciones coincidan con el archivo de tutores</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}