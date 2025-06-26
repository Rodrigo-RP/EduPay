import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, AlertCircle, Clock, Users, DollarSign, GraduationCap } from "lucide-react";

interface MigrationStats {
  category: string;
  icon: any;
  total: number;
  completed: number;
  errors: number;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
}

export default function MigrationDashboard() {
  const migrationStats: MigrationStats[] = [
    {
      category: "Estudiantes y Familias",
      icon: Users,
      total: 3,
      completed: 2,
      errors: 0,
      status: 'in_progress'
    },
    {
      category: "Conceptos y Precios", 
      icon: DollarSign,
      total: 3,
      completed: 0,
      errors: 0,
      status: 'pending'
    },
    {
      category: "Becas y Descuentos",
      icon: GraduationCap,
      total: 2,
      completed: 0,
      errors: 0,
      status: 'pending'
    }
  ];

  const totalTemplates = migrationStats.reduce((sum, cat) => sum + cat.total, 0);
  const completedTemplates = migrationStats.reduce((sum, cat) => sum + cat.completed, 0);
  const totalErrors = migrationStats.reduce((sum, cat) => sum + cat.errors, 0);
  const overallProgress = (completedTemplates / totalTemplates) * 100;

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
            <span className="text-2xl font-bold">{Math.round(overallProgress)}%</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={overallProgress} className="mb-4" />
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600">{completedTemplates}</div>
              <div className="text-sm text-muted-foreground">Templates Completados</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-600">{totalTemplates - completedTemplates}</div>
              <div className="text-sm text-muted-foreground">Pendientes</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">{totalErrors}</div>
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
                  {stat.errors > 0 && (
                    <span className="text-red-600">{stat.errors} errores</span>
                  )}
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