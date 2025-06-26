import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, Clock, Users, DollarSign, GraduationCap, RefreshCw, RotateCcw } from "lucide-react";
import { useMigrationStatus } from "@/hooks/use-migration-status";

export default function MigrationDashboard() {
  const { migrationProgress, isLoading, resetProgress, isResetting } = useMigrationStatus();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            <span>Cargando estado de migración...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!migrationProgress) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            No se pudo cargar el estado de migración
          </div>
        </CardContent>
      </Card>
    );
  }

  const migrationStats = [
    {
      category: "Estudiantes y Familias",
      icon: Users,
      total: migrationProgress.categories.estudiantes.total,
      completed: migrationProgress.categories.estudiantes.completed,
      status: migrationProgress.categories.estudiantes.status
    },
    {
      category: "Conceptos y Precios", 
      icon: DollarSign,
      total: migrationProgress.categories.financiero.total,
      completed: migrationProgress.categories.financiero.completed,
      status: migrationProgress.categories.financiero.status
    },
    {
      category: "Becas y Descuentos",
      icon: GraduationCap,
      total: migrationProgress.categories.becas.total,
      completed: migrationProgress.categories.becas.completed,
      status: migrationProgress.categories.becas.status
    }
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'in_progress':
        return <Clock className="h-5 w-5 text-blue-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="secondary" className="bg-green-100 text-green-800">Completado</Badge>;
      case 'in_progress':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800">En Progreso</Badge>;
      case 'error':
        return <Badge variant="destructive">Con Errores</Badge>;
      default:
        return <Badge variant="outline">Pendiente</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Overall Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Progreso General de Migración</span>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold">{Math.round(migrationProgress.overallProgress)}%</span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => resetProgress()}
                disabled={isResetting}
              >
                {isResetting ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Reset
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={migrationProgress.overallProgress} className="mb-4" />
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600">{migrationProgress.completedTemplates}</div>
              <div className="text-sm text-muted-foreground">Templates Completados</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-600">{migrationProgress.totalTemplates - migrationProgress.completedTemplates}</div>
              <div className="text-sm text-muted-foreground">Pendientes</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">{migrationProgress.totalErrors}</div>
              <div className="text-sm text-muted-foreground">Errores</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category Progress */}
      <div className="grid gap-4">
        {migrationStats.map((stat) => {
          const Icon = stat.icon;
          const categoryProgress = (stat.completed / stat.total) * 100;
          
          return (
            <Card key={stat.category} className="transition-all hover:shadow-md">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Icon className="h-6 w-6 text-blue-600" />
                    <div>
                      <h3 className="font-semibold">{stat.category}</h3>
                      <p className="text-sm text-muted-foreground">
                        {stat.completed} de {stat.total} templates
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(stat.status)}
                    {getStatusBadge(stat.status)}
                  </div>
                </div>
                
                <Progress value={categoryProgress} className="mb-2" />
                
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{Math.round(categoryProgress)}% completado</span>
                  <span className="text-blue-600">{stat.completed}/{stat.total} templates</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Migration Tips */}
      <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-800">
        <CardHeader>
          <CardTitle className="text-yellow-800 dark:text-yellow-200">
            Tips para Migración Exitosa
          </CardTitle>
        </CardHeader>
        <CardContent className="text-yellow-700 dark:text-yellow-300 space-y-2">
          <div className="flex items-start gap-2">
            <span className="font-bold">1.</span>
            <span>Procesa los templates en orden: Estudiantes → Tutores → Relaciones</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold">2.</span>
            <span>Verifica que no haya espacios extra en CURP y emails</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold">3.</span>
            <span>Un estudiante puede tener múltiples tutores, pero solo uno responsable de pago</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold">4.</span>
            <span>Los conceptos se pueden crear con precios diferenciados por nivel académico</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}