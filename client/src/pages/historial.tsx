import { useAuth } from "@/hooks/use-auth";
import { Clock, FileText, User, Calendar, Filter, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export default function Historial() {
  const { user } = useAuth();

  // Datos de ejemplo para el historial
  const historialData = [
    {
      id: 1,
      fecha: "2024-08-07 10:30",
      usuario: "rodrigorp@institutojfr.edu.mx",
      accion: "Creación de estudiante",
      modulo: "Estudiantes",
      detalle: "Estudiante Juan Pérez registrado exitosamente",
      tipo: "creacion"
    },
    {
      id: 2,
      fecha: "2024-08-07 09:15",
      usuario: "secretaria@institutojfr.edu.mx",
      accion: "Actualización de pago",
      modulo: "Pagos",
      detalle: "Pago de $2,500.00 confirmado para estudiante María González",
      tipo: "actualizacion"
    },
    {
      id: 3,
      fecha: "2024-08-06 16:45",
      usuario: "contador@institutojfr.edu.mx",
      accion: "Generación de reporte",
      modulo: "Reportes",
      detalle: "Reporte financiero mensual generado",
      tipo: "reporte"
    },
    {
      id: 4,
      fecha: "2024-08-06 14:20",
      usuario: "rodrigorp@institutojfr.edu.mx",
      accion: "Eliminación de cargo",
      modulo: "Cargos",
      detalle: "Cargo duplicado eliminado - Colegiatura Agosto",
      tipo: "eliminacion"
    },
    {
      id: 5,
      fecha: "2024-08-06 11:30",
      usuario: "auxiliar@institutojfr.edu.mx",
      accion: "Importación de datos",
      modulo: "Importación",
      detalle: "150 estudiantes importados desde Excel exitosamente",
      tipo: "importacion"
    }
  ];

  const getTipoBadge = (tipo: string) => {
    switch (tipo) {
      case "creacion":
        return <Badge className="bg-green-100 text-green-800">Creación</Badge>;
      case "actualizacion":
        return <Badge className="bg-blue-100 text-blue-800">Actualización</Badge>;
      case "reporte":
        return <Badge className="bg-purple-100 text-purple-800">Reporte</Badge>;
      case "eliminacion":
        return <Badge className="bg-red-100 text-red-800">Eliminación</Badge>;
      case "importacion":
        return <Badge className="bg-orange-100 text-orange-800">Importación</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800">Otro</Badge>;
    }
  };

  const getIcono = (modulo: string) => {
    switch (modulo) {
      case "Estudiantes":
        return <User className="w-5 h-5 text-green-600" />;
      case "Pagos":
        return <Calendar className="w-5 h-5 text-blue-600" />;
      case "Reportes":
        return <FileText className="w-5 h-5 text-purple-600" />;
      case "Cargos":
        return <FileText className="w-5 h-5 text-orange-600" />;
      case "Importación":
        return <FileText className="w-5 h-5 text-red-600" />;
      default:
        return <Clock className="w-5 h-5 text-gray-600" />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Historial del Sistema</h1>
        <p className="mt-2 text-sm text-gray-600">
          Registro completo de todas las actividades y cambios realizados en la plataforma
        </p>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filtros de Búsqueda
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Buscar</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input 
                  placeholder="Buscar en historial..." 
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Módulo</label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los módulos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los módulos</SelectItem>
                  <SelectItem value="estudiantes">Estudiantes</SelectItem>
                  <SelectItem value="pagos">Pagos</SelectItem>
                  <SelectItem value="cargos">Cargos</SelectItem>
                  <SelectItem value="reportes">Reportes</SelectItem>
                  <SelectItem value="importacion">Importación</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo de Acción</label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Todas las acciones" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas las acciones</SelectItem>
                  <SelectItem value="creacion">Creación</SelectItem>
                  <SelectItem value="actualizacion">Actualización</SelectItem>
                  <SelectItem value="eliminacion">Eliminación</SelectItem>
                  <SelectItem value="reporte">Reportes</SelectItem>
                  <SelectItem value="importacion">Importación</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Usuario</label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los usuarios" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los usuarios</SelectItem>
                  <SelectItem value="rodrigorp">rodrigorp@institutojfr.edu.mx</SelectItem>
                  <SelectItem value="secretaria">secretaria@institutojfr.edu.mx</SelectItem>
                  <SelectItem value="contador">contador@institutojfr.edu.mx</SelectItem>
                  <SelectItem value="auxiliar">auxiliar@institutojfr.edu.mx</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <Button variant="default">
              Aplicar Filtros
            </Button>
            <Button variant="outline">
              Limpiar Filtros
            </Button>
            <Button variant="outline">
              Exportar Historial
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista del Historial */}
      <Card>
        <CardHeader>
          <CardTitle>Actividades Recientes</CardTitle>
          <CardDescription>
            Últimas {historialData.length} actividades registradas en el sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {historialData.map((item) => (
              <div key={item.id} className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex-shrink-0">
                  {getIcono(item.modulo)}
                </div>
                
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-gray-900">{item.accion}</h3>
                    {getTipoBadge(item.tipo)}
                  </div>
                  
                  <p className="text-sm text-gray-600">{item.detalle}</p>
                  
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {item.fecha}
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {item.usuario}
                    </span>
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {item.modulo}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Paginación */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t">
            <div className="text-sm text-gray-500">
              Mostrando 1-{historialData.length} de 247 registros
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled>
                Anterior
              </Button>
              <Button variant="outline" size="sm">
                1
              </Button>
              <Button variant="outline" size="sm">
                2
              </Button>
              <Button variant="outline" size="sm">
                3
              </Button>
              <Button variant="outline" size="sm">
                Siguiente
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Estadísticas Rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <User className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">1,247</p>
                <p className="text-sm text-gray-600">Acciones Hoy</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <FileText className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">89</p>
                <p className="text-sm text-gray-600">Reportes Generados</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Calendar className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">156</p>
                <p className="text-sm text-gray-600">Pagos Procesados</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Clock className="w-8 h-8 text-orange-600" />
              <div>
                <p className="text-2xl font-bold">24h</p>
                <p className="text-sm text-gray-600">Tiempo Promedio</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}