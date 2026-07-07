import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Calendar, Filter, Search, Download, Clock, User, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Movimiento {
  id: number;
  fecha: string;
  hora: string;
  usuario: string;
  tipo: string;
  descripcion: string;
  familiaEstudiante: string;
}

type TipoMovimiento = "creacion" | "modificacion" | "eliminacion" | "pago" | "importacion" | "exportacion";

export default function Historial() {
  const { user } = useAuth();
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [filtroUsuario, setFiltroUsuario] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [busqueda, setBusqueda] = useState("");

  // Datos vacíos - se llenarán con datos reales del backend
  const movimientos: Movimiento[] = [];

  const getTipoBadge = (tipo: string) => {
    const tiposConfig: Record<string, { color: string; texto: string }> = {
      "creacion": { color: "bg-green-100 text-green-800", texto: "Creación" },
      "modificacion": { color: "bg-blue-100 text-blue-800", texto: "Modificación" },
      "eliminacion": { color: "bg-red-100 text-red-800", texto: "Eliminación" },
      "pago": { color: "bg-yellow-100 text-yellow-800", texto: "Pago" },
      "importacion": { color: "bg-purple-100 text-purple-800", texto: "Importación" },
      "exportacion": { color: "bg-indigo-100 text-indigo-800", texto: "Exportación" }
    };
    
    const config = tiposConfig[tipo] || { color: "bg-gray-100 text-gray-800", texto: tipo };
    return <Badge className={config.color}>{config.texto}</Badge>;
  };

  const limpiarFiltros = () => {
    setFechaInicio("");
    setFechaFin("");
    setFiltroUsuario("todos");
    setFiltroTipo("todos");
    setBusqueda("");
  };

  const exportarHistorial = () => {
    // Funcionalidad de exportación - se implementará con datos reales
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Historial de Movimientos</h1>
        <p className="mt-2 text-sm text-gray-600">
          Registro de todos los cambios y movimientos realizados por los usuarios del sistema
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
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-4">
            {/* Búsqueda general */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Buscar</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input 
                  placeholder="Familia o estudiante..." 
                  className="pl-10"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
              </div>
            </div>

            {/* Fecha inicio */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Fecha Inicio</label>
              <Input 
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
              />
            </div>

            {/* Fecha fin */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Fecha Fin</label>
              <Input 
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
              />
            </div>

            {/* Filtro por usuario */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Usuario</label>
              <Select value={filtroUsuario} onValueChange={setFiltroUsuario}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los usuarios" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los usuarios</SelectItem>
                  <SelectItem value="administrador_general">Administrador General</SelectItem>
                  <SelectItem value="administrador_campus">Administrador Campus</SelectItem>
                  <SelectItem value="contador_general">Contador General</SelectItem>
                  <SelectItem value="auxiliar_contable">Auxiliar Contable</SelectItem>
                  <SelectItem value="asistente">Asistente</SelectItem>
                  <SelectItem value="admisiones">Admisiones</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filtro por tipo de movimiento */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo de Movimiento</label>
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los tipos</SelectItem>
                  <SelectItem value="creacion">Creación</SelectItem>
                  <SelectItem value="modificacion">Modificación</SelectItem>
                  <SelectItem value="eliminacion">Eliminación</SelectItem>
                  <SelectItem value="pago">Registro de Pago</SelectItem>
                  <SelectItem value="importacion">Importación</SelectItem>
                  <SelectItem value="exportacion">Exportación</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Botones de acción */}
            <div className="space-y-2">
              <label className="text-sm font-medium opacity-0">Acciones</label>
              <div className="flex gap-2">
                <Button variant="default" size="sm">
                  Filtrar
                </Button>
                <Button variant="outline" size="sm" onClick={limpiarFiltros}>
                  Limpiar
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={exportarHistorial}>
              <Download className="w-4 h-4 mr-2" />
              Exportar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabla de movimientos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Registro de Movimientos</span>
            <Badge variant="secondary">{movimientos.length} registros</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Fecha</TableHead>
                <TableHead className="w-[100px]">Hora</TableHead>
                <TableHead className="w-[200px]">Usuario</TableHead>
                <TableHead className="w-[150px]">Tipo de Movimiento</TableHead>
                <TableHead>Descripción del Cambio</TableHead>
                <TableHead className="w-[200px]">Familia/Estudiante</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movimientos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="w-8 h-8 text-gray-300" />
                      <p>No se encontraron movimientos</p>
                      <p className="text-sm">Los movimientos aparecerán aquí cuando se realicen cambios en el sistema</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                movimientos.map((movimiento) => (
                  <TableRow key={movimiento.id}>
                    <TableCell className="font-mono text-sm">
                      {movimiento.fecha}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {movimiento.hora}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="text-sm">{movimiento.usuario}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getTipoBadge(movimiento.tipo)}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{movimiento.descripcion}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium text-blue-600">
                        {movimiento.familiaEstudiante}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Paginación - se activará cuando haya datos */}
          {movimientos.length > 0 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="text-sm text-gray-500">
                Mostrando 1-{movimientos.length} de {movimientos.length} registros
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled>
                  Anterior
                </Button>
                <Button variant="outline" size="sm" disabled>
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resumen de estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Clock className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">0</p>
                <p className="text-sm text-gray-600">Movimientos Hoy</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <User className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold">0</p>
                <p className="text-sm text-gray-600">Usuarios Activos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <FileText className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">0</p>
                <p className="text-sm text-gray-600">Cambios Esta Semana</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Calendar className="w-8 h-8 text-orange-600" />
              <div>
                <p className="text-2xl font-bold">0</p>
                <p className="text-sm text-gray-600">Total Registros</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}